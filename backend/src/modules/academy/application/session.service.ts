// ============================================================================
// Academy G5 — session execution service
//
// Explicit lifecycle operations (start / complete / cancel) built on the
// existing academy_group_sessions status enum. State transitions are validated
// against the domain state machine and applied with a CONDITIONAL database
// update (`WHERE status = ?`) so concurrent lifecycle requests produce exactly
// one winner; the loser receives a deterministic already-transitioned error.
// Session-scoped notifications fire only after a successful commit.
// ============================================================================
import { getPool } from '../../../database/mysql.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { recordAudit } from '../../audit-log/index.js';
import { sessionRepository, type SessionCreateInput, type SessionUpdateInput, type SessionListFilters } from '../infrastructure/repositories/session.repository.js';
import { enrollmentRepository } from '../infrastructure/repositories/enrollment.repository.js';
import { attendanceRepository } from '../infrastructure/repositories/attendance.repository.js';
import { programRepository } from '../infrastructure/repositories/program.repository.js';
import { validateSessionTransition } from '../domain/lifecycle.js';
import type { AcademySessionStatus } from '../domain/academy.types.js';

function parseSessionStartUtc(session: any): Date | null {
  if (session.start_at_utc) {
    const d = new Date(session.start_at_utc);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (session.session_date && session.start_time) {
    const d = new Date(`${session.session_date}T${session.start_time}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

async function resolveAcademyName(session: any): Promise<string> {
  try {
    const program = await programRepository.getById(Number(session.program_id));
    if (program?.name) return program.name;
  } catch {
    /* fall back to group name */
  }
  return session.group_name ?? `Academy #${session.group_id}`;
}

class AcademySessionService {
  async list(filters: SessionListFilters) {
    return sessionRepository.list(filters);
  }

  async getById(id: number) {
    const session = await sessionRepository.getById(id);
    if (!session) throw new NotFoundError('Academy group session', ErrorCodes.ACADEMY_INVALID_SESSION);
    return session;
  }

  /** G1 — create a manual session (always `scheduled`). Schedules reminders. */
  async create(data: SessionCreateInput, actorId: number): Promise<any> {
    const id = await sessionRepository.createManual(data);
    const session = await sessionRepository.getById(id);

    recordAudit({
      actorId,
      action: 'ACADEMY_SESSION.CREATE',
      entityType: 'academy_group_session',
      entityId: id,
      afterState: { group_id: data.group_id, session_date: data.session_date, start_time: data.start_time ?? null, end_time: data.end_time ?? null },
      ipAddress: undefined,
      userAgent: undefined,
    });

    // G5 — schedule idempotent session reminders for the current confirmed roster.
    await this.scheduleReminders(session);

    return session;
  }

  /** G1 — bounded update (never mutates status; lifecycle ops own it). */
  async update(id: number, data: SessionUpdateInput, actorId: number): Promise<any> {
    const before = await sessionRepository.getById(id);
    if (!before) throw new NotFoundError('Academy group session', ErrorCodes.ACADEMY_INVALID_SESSION);
    await sessionRepository.update(id, data);
    const after = await sessionRepository.getById(id);
    recordAudit({
      actorId,
      action: 'ACADEMY_SESSION.UPDATE',
      entityType: 'academy_group_session',
      entityId: id,
      beforeState: { session_date: before.session_date, start_time: before.start_time, end_time: before.end_time, court_id: before.court_id, coach_id: before.coach_id },
      afterState: { session_date: after.session_date, start_time: after.start_time, end_time: after.end_time, court_id: after.court_id, coach_id: after.coach_id },
      ipAddress: undefined,
      userAgent: undefined,
    });
    return after;
  }

  /** G5 — explicit admin start: scheduled → in_progress (conditional, atomic). */
  async start(id: number, actorId: number): Promise<any> {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const session = await sessionRepository.getByIdForUpdate(id, conn);
      if (!session) throw new NotFoundError('Academy group session', ErrorCodes.ACADEMY_INVALID_SESSION);
      validateSessionTransition(session.status as AcademySessionStatus, 'in_progress');

      const ok = await sessionRepository.updateStatusConditional(id, ['scheduled'], 'in_progress', conn);
      if (!ok) throw new ConflictError('Session has already been started', ErrorCodes.ACADEMY_SESSION_ALREADY_TRANSITIONED);

      const startUtc = parseSessionStartUtc(session);
      await conn.commit();

      recordAudit({
        actorId,
        action: 'ACADEMY_SESSION.START',
        entityType: 'academy_group_session',
        entityId: id,
        beforeState: { status: 'scheduled' },
        afterState: { status: 'in_progress', start_at_utc: startUtc ? startUtc.toISOString() : null },
        ipAddress: undefined,
        userAgent: undefined,
      });

      // Notify confirmed participants — only after a successful commit.
      await this.notifySessionStarted(session);

      return sessionRepository.getById(id);
    } catch (err) {
      try { await conn.rollback(); } catch { /* already rolled back */ }
      throw err;
    } finally {
      conn.release();
    }
  }

  /** G5 — complete: in_progress → completed (conditional, atomic). */
  async complete(id: number, actorId: number): Promise<any> {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const session = await sessionRepository.getByIdForUpdate(id, conn);
      if (!session) throw new NotFoundError('Academy group session', ErrorCodes.ACADEMY_INVALID_SESSION);
      validateSessionTransition(session.status as AcademySessionStatus, 'completed');

      const ok = await sessionRepository.updateStatusConditional(id, ['in_progress'], 'completed', conn);
      if (!ok) throw new ConflictError('Session is no longer in progress', ErrorCodes.ACADEMY_SESSION_ALREADY_TRANSITIONED);

      await conn.commit();

      recordAudit({
        actorId,
        action: 'ACADEMY_SESSION.COMPLETE',
        entityType: 'academy_group_session',
        entityId: id,
        beforeState: { status: 'in_progress' },
        afterState: { status: 'completed' },
        ipAddress: undefined,
        userAgent: undefined,
      });

      return sessionRepository.getById(id);
    } catch (err) {
      try { await conn.rollback(); } catch { /* already rolled back */ }
      throw err;
    } finally {
      conn.release();
    }
  }

  /** G5 — cancel: scheduled|in_progress → cancelled (conditional, atomic). */
  async cancel(id: number, actorId: number, reason?: string | null): Promise<any> {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const session = await sessionRepository.getByIdForUpdate(id, conn);
      if (!session) throw new NotFoundError('Academy group session', ErrorCodes.ACADEMY_INVALID_SESSION);
      validateSessionTransition(session.status as AcademySessionStatus, 'cancelled');

      const ok = await sessionRepository.updateStatusConditional(id, ['scheduled', 'in_progress'], 'cancelled', conn);
      if (!ok) throw new ConflictError('Session cannot be cancelled in its current state', ErrorCodes.ACADEMY_SESSION_ALREADY_TRANSITIONED);

      await conn.commit();

      recordAudit({
        actorId,
        action: 'ACADEMY_SESSION.CANCEL',
        entityType: 'academy_group_session',
        entityId: id,
        beforeState: { status: session.status },
        afterState: { status: 'cancelled', reason: reason ?? null },
        ipAddress: undefined,
        userAgent: undefined,
      });

      return sessionRepository.getById(id);
    } catch (err) {
      try { await conn.rollback(); } catch { /* already rolled back */ }
      throw err;
    } finally {
      conn.release();
    }
  }

  /** G5 — per-session roster (confirmed enrollments of the session's group). */
  async getRoster(id: number): Promise<{ data: any[]; summary: any }> {
    const session = await sessionRepository.getById(id);
    if (!session) throw new NotFoundError('Academy group session', ErrorCodes.ACADEMY_INVALID_SESSION);
    const data = await attendanceRepository.getSessionRoster(id);
    const summary = await this.getSummary(id);
    return { data, summary };
  }

  /** G5 — attendance summary: totals + unmarked + progress (scoped to the session's group). */
  async getSummary(id: number): Promise<{
    total: number; present: number; absent: number; excused: number; late: number;
    marked: number; unmarked: number; progress: number; status: string;
  }> {
    const session = await sessionRepository.getById(id);
    if (!session) throw new NotFoundError('Academy group session', ErrorCodes.ACADEMY_INVALID_SESSION);
    const total = await attendanceRepository.getSessionRosterCount(id);
    const marked = await attendanceRepository.getAttendanceSummary(id);
    const markedCount = marked.present + marked.absent + marked.excused + marked.late;
    const unmarked = Math.max(total - markedCount, 0);
    return {
      total,
      present: marked.present,
      absent: marked.absent,
      excused: marked.excused,
      late: marked.late,
      marked: markedCount,
      unmarked,
      progress: total > 0 ? Math.round((markedCount / total) * 100) : 0,
      status: session.status,
    };
  }

  /** G5 — idempotent per-(session,user) reminder scheduling via BullMQ jobId. */
  async scheduleReminders(session: any): Promise<void> {
    const startUtc = parseSessionStartUtc(session);
    if (!startUtc) return;
    const userIds = await enrollmentRepository.getConfirmedUserIdsByGroup(Number(session.group_id));
    if (!userIds.length) return;
    const academyName = await resolveAcademyName(session);
    const { scheduleAcademySessionReminder } = await import('../../notifications/application/scheduler.service.js');
    for (const userId of userIds) {
      await scheduleAcademySessionReminder(Number(session.id), userId, startUtc, academyName);
    }
  }

  /** G5 — session-started notification, fired once per successful transition. */
  async notifySessionStarted(session: any): Promise<void> {
    const startUtc = parseSessionStartUtc(session);
    const userIds = await enrollmentRepository.getConfirmedUserIdsByGroup(Number(session.group_id));
    if (!userIds.length) return;
    const academyName = await resolveAcademyName(session);
    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
    for (const userId of userIds) {
      eventBusV2.emit('academy:session-started', {
        sessionId: Number(session.id),
        programId: Number(session.program_id),
        organisationId: session.organisation_id ?? undefined,
        userId,
        startTime: startUtc ? startUtc : new Date(),
        academyName,
      } as any);
    }
  }
}

export const academySessionService = new AcademySessionService();