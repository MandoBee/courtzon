// ============================================================================
// Academy G2 — Recurring Schedule service
// ============================================================================
import { getPool } from '../../../database/mysql.js';
import { academyScheduleRepository } from '../infrastructure/repositories/academy-schedule.repository.js';
import { groupRepository } from '../infrastructure/repositories/group.repository.js';
import { programRepository } from '../infrastructure/repositories/program.repository.js';
import { academyConflictService, type AcademyResourceView } from './academy-conflict.service.js';
import { assertCanManageAcademy, resolveProgramScope } from './academy-scope.js';
import { bookingRepository } from '../../booking/infrastructure/repositories/booking.repository.js';
import { TimeEngine } from '../../time/time-engine.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { recordAudit } from '../../audit-log/index.js';
import { toDbReservationStatus, type AcademyScheduleWeekday, type AcademyConflictState } from '../domain/academy-schedule.types.js';
import type mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

const VALID_DAYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

const dayOrder = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// ── helpers ──

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function parseWeekdays(raw: string): AcademyScheduleWeekday[] {
  return raw.split(',').filter(Boolean).sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b)) as AcademyScheduleWeekday[];
}

function dailyRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cur = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 86400_000);
  }
  return dates;
}

async function loadScheduleAndCtx(scheduleId: number, conn?: mysql.PoolConnection) {
  const schedule = await academyScheduleRepository.getScheduleById(scheduleId, conn);
  if (!schedule) throw new NotFoundError('Academy schedule', ErrorCodes.ACADEMY_INVALID_SCOPE);
  const group = await groupRepository.getById(Number(schedule.group_id));
  if (!group) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
  const program = await programRepository.getById(Number(group.program_id));
  if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);

  const [branchRows] = await getPool().query<RowData>(
    'SELECT id, timezone, opening_time, closing_time FROM branches WHERE id = ?', [schedule.branch_id],
  );
  const branch = (branchRows[0] as any) || {};

  if (schedule.timezone !== (branch.timezone ?? 'UTC')) {
    throw new ConflictError('Schedule timezone must equal the branch timezone', ErrorCodes.ACADEMY_INVALID_SCOPE);
  }

  let resource: AcademyResourceView | null = null;
  if (schedule.preferred_court_id) {
    const [rr] = await getPool().query<RowData>(
      'SELECT id, name, branch_id, is_active, deleted_at, opening_time, closing_time, sport_id FROM resources WHERE id = ? AND deleted_at IS NULL',
      [schedule.preferred_court_id],
    );
    resource = (rr[0] as AcademyResourceView) ?? null;
  }

  const [courtRows] = await getPool().query<RowData>(
    `SELECT id, name, branch_id, is_active, deleted_at, opening_time, closing_time, sport_id
     FROM resources WHERE branch_id = ? AND deleted_at IS NULL AND is_active = 1`,
    [schedule.branch_id],
  );

  const ctx = {
    schedule,
    groupCoachId: group.coach_id ? Number(group.coach_id) : null,
    resource,
    branchCourts: (courtRows as AcademyResourceView[]),
    conn,
  };

  return { schedule, group, program, branch, ctx };
}

async function assertManage(scheduleId: number, actorId: number, conn?: mysql.PoolConnection) {
  const schedule = await academyScheduleRepository.getScheduleById(scheduleId, conn);
  if (!schedule) throw new NotFoundError('Academy schedule', ErrorCodes.ACADEMY_INVALID_SCOPE);
  const group = await groupRepository.getById(Number(schedule.group_id));
  if (!group) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
  const scope = await resolveProgramScope(Number(group.program_id));
  await assertCanManageAcademy(actorId, scope);
  if (scope?.lifecycleState === 'confirmed') {
    throw new ConflictError('Program is confirmed — schedules are frozen', ErrorCodes.ACADEMY_LIFECYCLE_LOCKED);
  }
  return schedule;
}

function applyEvaluationToSession(patch: Record<string, any>, prev: any, ev: { state: string; session_date: string; start_time: string; end_time: string; startAtUtc?: string | null; endAtUtc?: string | null; court_id: number; reason?: string | null }, schedule: any, now: string): Record<string, any> {
  const wasHold = prev.reservation_status === 'pending_court' || prev.reservation_status === 'resolved';
  const hasUnexpiredHold = wasHold && prev.pending_expires_at && prev.pending_expires_at > now;
  const needsHold = ev.state === 'PENDING_COURT';
  const needsSnapshot = !prev.original_court_id && (prev.session_date !== ev.session_date || prev.start_time !== ev.start_time || prev.end_time !== ev.end_time || prev.court_id !== ev.court_id);

  if (needsSnapshot) {
    patch.original_session_date = prev.session_date;
    patch.original_start_time = prev.start_time;
    patch.original_end_time = prev.end_time;
    patch.original_court_id = prev.court_id;
  }
  const dbState = toDbReservationStatus(ev.state as AcademyConflictState);
  if (dbState !== prev.reservation_status) patch.reservation_status = dbState;
  patch.start_at_utc = ev.startAtUtc ?? null;
  patch.end_at_utc = ev.endAtUtc ?? null;
  if (needsHold) {
    if (!hasUnexpiredHold) {
      patch.pending_expires_at = new Date(new Date(now).getTime() + schedule.pending_priority_minutes * 60_000).toISOString();
    } else {
      patch.pending_expires_at = prev.pending_expires_at;
    }
  } else {
    patch.pending_expires_at = null;
  }
  patch.conflict_metadata = ev.state === 'CONFLICT' || ev.state === 'ADMIN_TIME_RESOLUTION_REQUIRED'
    ? { reason: ev.reason }
    : patch.conflict_metadata ?? prev.conflict_metadata ?? null;
  if (needsHold || needsSnapshot) {
    patch.court_id = ev.court_id;
    patch.session_date = ev.session_date;
    patch.start_time = ev.start_time;
    patch.end_time = ev.end_time;
  }
  return patch;
}

export class AcademyScheduleService {

  async list(filters: { scopeWhere?: string; scopeParams?: number[]; page?: number; limit?: number }) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    return academyScheduleRepository.listSchedules(
      filters.scopeWhere ?? '',
      filters.scopeParams ?? [],
      { offset: (page - 1) * limit, limit },
    );
  }

  async listSessions(filters: { scopeWhere?: string; scopeParams?: number[]; page?: number; limit?: number; scheduleId?: number; status?: string }) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    let where = filters.scopeWhere ?? '';
    const params: any[] = [...(filters.scopeParams ?? [])];
    if (filters.scheduleId) { where += (where ? ' AND ' : '') + 's.schedule_id = ?'; params.push(filters.scheduleId); }
    if (filters.status) { where += (where ? ' AND ' : '') + 's.reservation_status = ?'; params.push(filters.status); }
    return academyScheduleRepository.listSessions(where, params, { offset: (page - 1) * limit, limit });
  }

  async getById(id: number) {
    const schedule = await academyScheduleRepository.getScheduleById(id);
    if (!schedule) throw new NotFoundError('Academy schedule', ErrorCodes.ACADEMY_INVALID_SCOPE);
    const sessions = await academyScheduleRepository.listScheduleSessions(id, true);
    return { ...schedule, sessions };
  }

  async getSession(id: number) {
    const session = await academyScheduleRepository.getSessionById(id);
    if (!session) throw new NotFoundError('Academy session', ErrorCodes.ACADEMY_INVALID_SESSION);
    return session;
  }

  async create(data: {
    group_id: number; name?: string | null; weekdays: AcademyScheduleWeekday[];
    start_date: string; end_date: string; local_start_time: string; local_end_time: string;
    timezone?: string | null; branch_id?: number | null; preferred_court_id?: number | null;
    pending_priority_minutes?: number;
  }, actorId: number) {
    const group = await groupRepository.getById(data.group_id);
    if (!group) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
    const createScope = await resolveProgramScope(Number(group.program_id));
    await assertCanManageAcademy(actorId, createScope);
    if (createScope?.lifecycleState === 'confirmed') {
      throw new ConflictError('Program is confirmed — schedules are frozen', ErrorCodes.ACADEMY_LIFECYCLE_LOCKED);
    }

    if (!data.weekdays?.length) throw new ConflictError('weekdays is required', ErrorCodes.ACADEMY_INVALID_SCOPE);
    if (!data.branch_id) throw new ConflictError('branch_id is required', ErrorCodes.ACADEMY_INVALID_SCOPE);
    for (const w of data.weekdays) if (!VALID_DAYS.has(w)) throw new ConflictError(`Invalid weekday: ${w}`, ErrorCodes.ACADEMY_INVALID_SCOPE);
    if (data.start_date > data.end_date) throw new ConflictError('start_date must be before end_date', ErrorCodes.ACADEMY_INVALID_SCOPE);
    if (parseTime(data.local_start_time) >= parseTime(data.local_end_time)) {
      throw new ConflictError('local_start_time must be before local_end_time (overnight sessions not supported in G2)', ErrorCodes.ACADEMY_INVALID_SCOPE);
    }

    const [branchRows] = await getPool().query<RowData>(
      'SELECT id, timezone, is_active FROM branches WHERE id = ?', [data.branch_id],
    );
    const branch = branchRows[0] as any;
    if (!branch) throw new NotFoundError('Branch', ErrorCodes.ACADEMY_INVALID_SCOPE);
    const tz = data.timezone ?? branch.timezone;
    if (tz !== branch.timezone) throw new ConflictError('Schedule timezone must equal the branch timezone', ErrorCodes.ACADEMY_INVALID_SCOPE);
    TimeEngine.validateTimezone(tz);

    if (data.preferred_court_id) {
      const [cr] = await getPool().query<RowData>(
        "SELECT id, branch_id, is_active, deleted_at FROM resources WHERE id = ? AND deleted_at IS NULL AND is_active = 1",
        [data.preferred_court_id],
      );
      const court = cr[0] as any;
      if (!court) throw new NotFoundError('Court', ErrorCodes.ACADEMY_INVALID_SCOPE);
      if (Number(court.branch_id) !== Number(data.branch_id ?? branch.id))
        throw new ConflictError('Court does not belong to the branch', ErrorCodes.ACADEMY_INVALID_SCOPE);
    }

    const pp = data.pending_priority_minutes ?? 1440;
    if (pp < 30 || pp > 10080) throw new ConflictError('pending_priority_minutes must be between 30 and 10080', ErrorCodes.ACADEMY_INVALID_SCOPE);

    const id = await academyScheduleRepository.createSchedule({
      group_id: data.group_id, name: data.name ?? null,
      weekdays: data.weekdays.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b)),
      start_date: data.start_date, end_date: data.end_date,
      local_start_time: data.local_start_time, local_end_time: data.local_end_time,
      timezone: tz, branch_id: data.branch_id ?? branch.id,
      preferred_court_id: data.preferred_court_id ?? null,
      pending_priority_minutes: pp, created_by: actorId,
    });

    await this._regenerate(id, actorId);
    
    return academyScheduleRepository.getScheduleById(id);
  }

  async previewChange(scheduleId: number, data: Partial<{
    name: string | null; weekdays: AcademyScheduleWeekday[];
    start_date: string; end_date: string; local_start_time: string; local_end_time: string;
    timezone: string | null; branch_id: number | null; preferred_court_id: number | null;
    pending_priority_minutes: number;
  }>, actorId: number) {
    const { schedule: existing, ctx } = await loadScheduleAndCtx(scheduleId);
    await assertManage(scheduleId, actorId);
    return this._computePreviewOrApply(existing, data, ctx, false);
  }

  async update(scheduleId: number, data: Partial<{
    name: string | null; weekdays: AcademyScheduleWeekday[];
    start_date: string; end_date: string; local_start_time: string; local_end_time: string;
    timezone: string | null; branch_id: number | null; preferred_court_id: number | null;
    pending_priority_minutes: number;
  }>, actorId: number) {
    await assertManage(scheduleId, actorId);
    const { schedule: existing, ctx } = await loadScheduleAndCtx(scheduleId);
    if (data.branch_id && Number(data.branch_id) !== Number(existing.branch_id)) {
      throw new ConflictError('Branch cannot be changed after schedule creation', ErrorCodes.ACADEMY_INVALID_SCOPE);
    }
    if (data.timezone && data.timezone !== existing.timezone) {
      throw new ConflictError('Timezone cannot be changed after schedule creation (must match the branch)', ErrorCodes.ACADEMY_INVALID_SCOPE);
    }
    if (data.preferred_court_id !== undefined && data.preferred_court_id) {
      const [cr] = await getPool().query<RowData>(
        "SELECT id, branch_id FROM resources WHERE id = ? AND deleted_at IS NULL AND is_active = 1", [data.preferred_court_id],
      );
      const court = cr[0] as any;
      if (!court) throw new NotFoundError('Court', ErrorCodes.ACADEMY_INVALID_SCOPE);
      if (Number(court.branch_id) !== Number(existing.branch_id))
        throw new ConflictError('Court does not belong to the schedule branch', ErrorCodes.ACADEMY_INVALID_SCOPE);
    }
    const result = await this._computePreviewOrApply(existing, data, ctx, true);
    await academyScheduleRepository.updateSchedule(scheduleId, { ...data, updated_by: actorId });
    
    return { ...result, schedule: await academyScheduleRepository.getScheduleById(scheduleId) };
  }

  async regenerate(scheduleId: number, actorId: number) {
    await assertManage(scheduleId, actorId);
    return this._regenerate(scheduleId, actorId);
  }

  async resync(scheduleId: number, actorId: number) {
    await assertManage(scheduleId, actorId);
    const { schedule, ctx } = await loadScheduleAndCtx(scheduleId);
    const now = TimeEngine.now();
    const futureSessions = await academyScheduleRepository.listScheduleSessions(scheduleId, true);
    const evaluations: any[] = [];
    for (const session of futureSessions) {
      if (session.reservation_status === 'resolved' || session.reservation_status === 'pending_expired' || session.reservation_status === 'confirmed') continue;
      if (!session.court_id) continue;
      const ev = await academyConflictService.evaluate(
        session.court_id, session.session_date, session.start_time, session.end_time,
        { ...ctx, sessionId: Number(session.id), conn: ctx.conn },
      );
      const patch = applyEvaluationToSession({}, session, ev, schedule, now);
      if (Object.keys(patch).length) await academyScheduleRepository.updateSessionG2(Number(session.id), patch, ctx.conn);
      evaluations.push({ sessionId: Number(session.id), ...ev });
    }
    return { schedule, evaluations, resynced: evaluations.length };
  }

  async resolveSession(sessionId: number, decision: {
    type: 'release' | 'keep' | 'apply_alternative';
    alternative?: { court_id: number; session_date: string; start_time: string; end_time: string };
  }, actorId: number) {
    const session = await academyScheduleRepository.getSessionById(sessionId);
    if (!session || !session.schedule_id) throw new NotFoundError('Academy session', ErrorCodes.ACADEMY_INVALID_SESSION);
    await assertManage(Number(session.schedule_id), actorId);
    const { schedule, ctx } = await loadScheduleAndCtx(Number(session.schedule_id));

    const now = TimeEngine.now();
    const { horizonDate } = academyConflictService.playerHorizonUtc(schedule.timezone);

    if (decision.type === 'release') {
      const patch: Record<string, any> = { reservation_status: null, pending_expires_at: null, conflict_metadata: { released_by_admin: true, released_at: now } };
      await academyScheduleRepository.updateSessionG2(sessionId, patch, ctx.conn);
      
      return academyScheduleRepository.getSessionById(sessionId);
    }

    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      if (schedule.preferred_court_id) {
        const target = decision.type === 'apply_alternative' ? decision.alternative! : { court_id: session.court_id, session_date: session.session_date, start_time: session.start_time, end_time: session.end_time };
        if (!target.court_id) { await conn.rollback(); throw new ConflictError('Session has no court assigned', ErrorCodes.ACADEMY_INVALID_SCOPE); }
        const ok = await bookingRepository.checkSlotAvailability(
          target.court_id, target.session_date,
          [{ start: target.start_time, end: target.end_time }],
          conn as any, { excludeAcademySessionId: sessionId },
        );
        if (!ok) { await conn.rollback(); throw new ConflictError('Slot is now occupied by a player booking', ErrorCodes.ACADEMY_INVALID_SCOPE); }
      }
      const patch: Record<string, any> = {};
      if (decision.type === 'keep') {
        patch.reservation_status = 'resolved';
        patch.pending_resolved_at = now;
        patch.pending_resolved_by = actorId;
        patch.pending_expires_at = null;
      } else {
        if (decision.alternative!.session_date <= horizonDate) { await conn.rollback(); throw new ConflictError('Cannot resolve to a date within the player booking horizon', ErrorCodes.ACADEMY_INVALID_SCOPE); }
        if (TimeEngine.isInGap(decision.alternative!.session_date, decision.alternative!.start_time, schedule.timezone)) { await conn.rollback(); throw new ConflictError('Target date falls in a DST gap', ErrorCodes.ACADEMY_INVALID_SCOPE); }
        if (TimeEngine.isInOverlap(decision.alternative!.session_date, decision.alternative!.start_time, schedule.timezone)) { await conn.rollback(); throw new ConflictError('Target date falls in a DST overlap', ErrorCodes.ACADEMY_INVALID_SCOPE); }
        const sUtc = TimeEngine.localToUtc(decision.alternative!.session_date, decision.alternative!.start_time, schedule.timezone);
        const eUtc = TimeEngine.localToUtc(decision.alternative!.session_date, decision.alternative!.end_time, schedule.timezone);
        patch.court_id = decision.alternative!.court_id;
        patch.session_date = decision.alternative!.session_date;
        patch.start_time = decision.alternative!.start_time;
        patch.end_time = decision.alternative!.end_time;
        patch.start_at_utc = sUtc;
        patch.end_at_utc = eUtc;
        patch.original_session_date = session.original_session_date ?? session.session_date;
        patch.original_start_time = session.original_start_time ?? session.start_time;
        patch.original_end_time = session.original_end_time ?? session.end_time;
        patch.original_court_id = session.original_court_id ?? session.court_id;
        patch.reservation_status = 'resolved';
        patch.pending_resolved_at = now;
        patch.pending_resolved_by = actorId;
        patch.pending_expires_at = null;
        patch.conflict_metadata = { resolved_alternative: decision.alternative };
      }
      await academyScheduleRepository.updateSessionG2(sessionId, patch, conn);
      await conn.commit();
      
      return academyScheduleRepository.getSessionById(sessionId);
    } catch (e) { try { await conn.rollback(); } catch {} throw e; } finally { conn.release(); }
  }

  async setStatus(scheduleId: number, status: 'active' | 'paused' | 'archived', actorId: number) {
    await assertManage(scheduleId, actorId);
    await academyScheduleRepository.setScheduleStatus(scheduleId, status, actorId);
    
    return academyScheduleRepository.getScheduleById(scheduleId);
  }

  async expireHolds() {
    const now = TimeEngine.now();
    const expired = await academyScheduleRepository.findExpiredHolds();
    let count = 0;
    for (const row of expired) {
      await academyScheduleRepository.markHoldExpired(Number(row.id));
      const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
      eventBusV2.emit('academy:session:hold-expired', { sessionId: Number(row.id), groupId: Number(row.group_id), scheduleId: Number(row.schedule_id), date: row.session_date });
      recordAudit({ actorId: 0, action: 'ACADEMY_SESSION.HOLD_EXPIRED', entityType: 'academy_group_session', entityId: Number(row.id), afterState: { reservation_status: 'pending_expired', session_date: row.session_date }, ipAddress: undefined, userAgent: undefined });
      count++;
    }
    return { expired: count };
  }

  // ── internals ──

  private async _regenerate(scheduleId: number, actorId: number) {
    const { schedule, ctx } = await loadScheduleAndCtx(scheduleId);
    if (schedule.status !== 'active') return { schedule, generated: 0, evaluations: [] };
    const now = TimeEngine.now();
    const horizonDate = academyConflictService.playerHorizonUtc(schedule.timezone).horizonDate;
    const dates = dailyRange(schedule.start_date, schedule.end_date)
      .filter((d) => (schedule.weekdays as string[]).includes(dayOrder[new Date(`${d}T12:00:00Z`).getUTCDay()]))
      .filter((d) => d >= horizonDate);
    const evaluations: any[] = [];
    for (const date of dates) {
      const existing = await academyScheduleRepository.findRecurringSessionByDate(scheduleId, date, ctx.conn);
      if (existing) continue;
      const ev = await academyConflictService.evaluate(
        schedule.preferred_court_id!, date, schedule.local_start_time, schedule.local_end_time, ctx,
      );
      const patch: Record<string, any> = {
        group_id: Number(schedule.group_id), schedule_id: scheduleId,
        source_type: 'recurring', session_date: date,
        start_time: schedule.local_start_time, end_time: schedule.local_end_time,
        court_id: schedule.preferred_court_id!, coach_id: ctx.groupCoachId,
        status: 'scheduled', timezone: schedule.timezone,
        start_at_utc: ev.startAtUtc ?? null, end_at_utc: ev.endAtUtc ?? null,
        reservation_status: toDbReservationStatus(ev.state), priority_seq: schedule.id,
        pending_expires_at: ev.state === 'PENDING_COURT'
          ? new Date(new Date(now).getTime() + schedule.pending_priority_minutes * 60_000).toISOString()
          : null,
        original_session_date: date, original_start_time: schedule.local_start_time,
        original_end_time: schedule.local_end_time, original_court_id: schedule.preferred_court_id!,
        conflict_metadata: ev.reason ? JSON.stringify({ reason: ev.reason }) : null,
        generation_ref: `${scheduleId}:${date}:${schedule.local_start_time}`,
      };
      await academyScheduleRepository.insertSession(patch as any, ctx.conn);
      evaluations.push({ date, ...ev });
    }
    return { schedule, generated: evaluations.length, evaluations };
  }

  private async _computePreviewOrApply(
    existing: any,
    data: Partial<{ name: string | null; weekdays: AcademyScheduleWeekday[]; start_date: string; end_date: string; local_start_time: string; local_end_time: string; timezone: string | null; branch_id: number | null; preferred_court_id: number | null; pending_priority_minutes: number }>,
    ctx: any,
    persist: boolean,
  ) {
    const now = TimeEngine.now();
    const newWeekdays = data.weekdays ?? existing.weekdays;
    const newStart = data.start_date ?? existing.start_date;
    const newEnd = data.end_date ?? existing.end_date;
    const newStartT = data.local_start_time ?? existing.local_start_time;
    const newEndT = data.local_end_time ?? existing.local_end_time;
    const newCourt = data.preferred_court_id ?? existing.preferred_court_id;
    const newPriorityMinutes = data.pending_priority_minutes ?? Number(existing.pending_priority_minutes);
    const newTz = data.timezone ?? existing.timezone;

    if (newStart > newEnd) throw new ConflictError('start_date must be before end_date', ErrorCodes.ACADEMY_INVALID_SCOPE);
    if (parseTime(newStartT) >= parseTime(newEndT)) throw new ConflictError('local_start_time must be before local_end_time', ErrorCodes.ACADEMY_INVALID_SCOPE);
    for (const w of newWeekdays) if (!VALID_DAYS.has(w)) throw new ConflictError(`Invalid weekday: ${w}`, ErrorCodes.ACADEMY_INVALID_SCOPE);
    const localCtx = { ...ctx };
    if (newCourt !== Number(existing.preferred_court_id)) {
      const [cr] = await getPool().query<RowData>(
        "SELECT id, name, branch_id, is_active, deleted_at, opening_time, closing_time, sport_id FROM resources WHERE id = ? AND deleted_at IS NULL AND is_active = 1", [newCourt],
      );
      localCtx.resource = (cr[0] as AcademyResourceView) ?? null;
    }
    if (newCourt && persist) {
      const [cr] = await getPool().query<RowData>(
        "SELECT id, branch_id, is_active, deleted_at FROM resources WHERE id = ? AND deleted_at IS NULL AND is_active = 1", [newCourt],
      );
      if (!(cr[0] as any)) throw new NotFoundError('Court', ErrorCodes.ACADEMY_INVALID_SCOPE);
    }

    const futureSessions = await academyScheduleRepository.listScheduleSessions(Number(existing.id), true, ctx.conn);
    const newDates = dailyRange(newStart, newEnd).filter((d) => d >= horizonDate(existing, now) && (newWeekdays as string[]).includes(dayOrder[new Date(`${d}T12:00:00Z`).getUTCDay()]));
    const dateSet = new Set(newDates);
    const evaluations: any[] = [];

    for (const session of futureSessions) {
      const date = session.session_date;
      const inWindow = dateSet.has(date);
      let ev;
      if (!inWindow) {
        ev = { state: 'CONFLICT' as const, reason: 'no_longer_in_schedule', session_date: date, start_time: session.start_time, end_time: session.end_time, court_id: session.court_id, startAtUtc: session.start_at_utc, endAtUtc: session.end_at_utc, conflict: { type: 'schedule_removed', detail: 'Date no longer within schedule window or weekday' } };
      } else {
        ev = await academyConflictService.evaluate(newCourt ?? session.court_id, date, newStartT, newEndT, { ...localCtx, sessionId: Number(session.id), conn: ctx.conn });
      }
      if (persist) {
        const patch: Record<string, any> = {};
        applyEvaluationToSession(patch, session, { ...ev, court_id: newCourt ?? session.court_id }, { ...localCtx.schedule, pending_priority_minutes: newPriorityMinutes }, now);
        if (Object.keys(patch).length) await academyScheduleRepository.updateSessionG2(Number(session.id), patch, ctx.conn);
      }
      evaluations.push({ sessionId: Number(session.id), date, ...ev });
    }
    // new dates needing generation
    const existingDateSet = new Set(futureSessions.map((s: any) => s.session_date));
    for (const date of newDates) {
      if (existingDateSet.has(date)) continue;
      const ev = await academyConflictService.evaluate(newCourt!, date, newStartT, newEndT, { ...localCtx, sessionId: null, conn: ctx.conn });
      if (persist) {
        const patch: Record<string, any> = {
          group_id: Number(existing.group_id), schedule_id: Number(existing.id),
          source_type: 'recurring', session_date: date, start_time: newStartT, end_time: newEndT,
          court_id: newCourt!, coach_id: ctx.groupCoachId, status: 'scheduled', timezone: newTz,
          start_at_utc: ev.startAtUtc ?? null, end_at_utc: ev.endAtUtc ?? null,
          reservation_status: toDbReservationStatus(ev.state), priority_seq: Number(existing.id),
          pending_expires_at: ev.state === 'PENDING_COURT' ? new Date(new Date(now).getTime() + newPriorityMinutes * 60_000).toISOString() : null,
          original_session_date: date, original_start_time: newStartT, original_end_time: newEndT, original_court_id: newCourt!,
          conflict_metadata: ev.reason ? JSON.stringify({ reason: ev.reason }) : null,
          generation_ref: `${existing.id}:${date}:${newStartT}`,
        };
        await academyScheduleRepository.insertSession(patch as any, ctx.conn);
      }
      evaluations.push({ sessionId: null, date, ...ev });
    }

    return { evaluations, affected: evaluations.length };
  }
}

function horizonDate(schedule: any, now: string) {
  const tz = schedule.timezone;
  const horizonUtc = new Date(new Date(now).getTime() + 7 * 86400_000).toISOString();
  return TimeEngine.utcToLocalDate(horizonUtc, tz);
}

export const academyScheduleService = new AcademyScheduleService();
