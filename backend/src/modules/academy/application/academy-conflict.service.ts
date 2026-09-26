// ============================================================================
// Academy G2 — Central conflict engine
//
// Orchestrates the EXISTING booking/resource availability primitives (it does
// NOT implement a second overlap algorithm):
//   • player-booking occupancy        → bookingRepository.checkSlotAvailability()
//                                        (resource FOR UPDATE = DB serialization point)
//   • alternative feasibility         → bookingRepository.findBookingsByBusinessDate()
//                                        + TimeEngine.isSlotAvailable()
//   • Academy pending-hold priority   → academy schedule hold rows (earliest-created wins)
// ============================================================================
import { TimeEngine } from '../../time/time-engine.js';
import { bookingRepository } from '../../booking/infrastructure/repositories/booking.repository.js';
import { academyScheduleRepository } from '../infrastructure/repositories/academy-schedule.repository.js';
import { getPool } from '../../../database/mysql.js';
import type {
  AcademyConflictAlternative,
  AcademyConflictEvaluation,
  AcademySchedule,
} from '../domain/academy-schedule.types.js';

type RowData = import('mysql2').RowDataPacket[];

export interface AcademyResourceView {
  id: number;
  name: string;
  branch_id: number | null;
  is_active: number | boolean;
  deleted_at: string | null;
  opening_time: string | null;
  closing_time: string | null;
  sport_id: number | null;
}

export interface AcademyConflictContext {
  /** The owning recurring schedule (carries timezone, priority_seq, court, window). */
  schedule: AcademySchedule;
  /** Group coach to inherit onto generated sessions. */
  groupCoachId: number | null;
  /** Preferred/primary resource (may be null → resource_unavailable). */
  resource: AcademyResourceView | null;
  /** Readily bookable courts in the same branch (excluding none). */
  branchCourts: AcademyResourceView[];
  /** Existing session id when re-evaluating (excluded from self-blocking). */
  sessionId?: number | null;
  /** Transaction connection (holds the resource FOR UPDATE lock). */
  conn?: any;
}

const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

const fmtTime = (t: string): string => (t ? t.slice(0, 5) : t);

/** Is this local slot free for a READ-ONLY suggestion? Reuses the existing
 *  availability primitive (findBookingsByBusinessDate + TimeEngine). */
async function isSlotFree(courtId: number, date: string, start: string, end: string, tz: string): Promise<boolean> {
  if (TimeEngine.isInGap(date, fmtTime(start), tz) || TimeEngine.isInOverlap(date, fmtTime(start), tz)) return false;
  if (TimeEngine.isInGap(date, fmtTime(end), tz) || TimeEngine.isInOverlap(date, fmtTime(end), tz)) return false;
  let startUtc: string;
  let endUtc: string;
  try {
    startUtc = TimeEngine.localToUtc(date, fmtTime(start), tz);
    endUtc = TimeEngine.localToUtc(date, fmtTime(end), tz);
  } catch {
    return false;
  }
  const existing = await bookingRepository.findBookingsByBusinessDate(courtId, date);
  const conflicts = existing
    .filter((b) => b.startAtUtc && b.endAtUtc)
    .map((b) => ({ startAtUtc: b.startAtUtc, endAtUtc: b.endAtUtc }));
  return TimeEngine.isSlotAvailable(startUtc, endUtc, conflicts);
}

/**
 * G5-B — resolve whether a candidate Academy slot conflicts with the group
 * coach's availability. READ-SIDE ONLY (no locks); reuses the shared coach data
 * tables and the canonical coach_sessions overlap semantics (scheduling-booking
 * `checkCoachAvailable`): DATE(start_time)=coach-local date + active statuses +
 * `start_time < end AND end_time > start`. The candidate Academy window is
 * converted from the branch-local frame into the coach venue-local frame via
 * TimeEngine (no new timezone abstraction); the venue timezone falls back to the
 * Academy branch timezone (mirrors the shared `getCoachVenueTimezone` fallback).
 */
async function resolveAcademyCoachBusy(
  coachUserId: number,
  date: string,
  start: string,
  end: string,
  academyTz: string,
  branchId: number | undefined,
  excludeSessionId: number | null,
): Promise<{ busy: boolean; reason: string | null }> {
  const pool = getPool();

  // Group.coach_id is a USER id; the shared coach tables are keyed by profile id.
  const [profiles] = await pool.query<RowData>(
    'SELECT id FROM coach_profiles WHERE user_id = ? AND deleted_at IS NULL LIMIT 1',
    [coachUserId],
  );
  const profileId = profiles.length ? Number((profiles[0] as any).id) : null;
  if (!profileId) return { busy: false, reason: null };

  // Coach venue-local timezone (shared infrastructure); fall back to the Academy branch timezone.
  const [tzRows] = await pool.query<RowData>(
    `SELECT b.timezone FROM coach_service_locations csl
     JOIN branches b ON b.id = csl.branch_id AND b.deleted_at IS NULL
     WHERE csl.coach_id = ? ORDER BY csl.id ASC LIMIT 1`,
    [profileId],
  );
  const coachTz = tzRows.length && (tzRows[0] as any).timezone ? String((tzRows[0] as any).timezone) : academyTz;

  // Candidate Academy window mapped into the coach-local frame.
  let localDate: string; let localStart: string; let localEnd: string;
  try {
    const startUtc = TimeEngine.localToUtc(date, fmtTime(start), academyTz);
    const endUtc = TimeEngine.localToUtc(date, fmtTime(end), academyTz);
    const ls = TimeEngine.utcToLocal(startUtc, coachTz);
    const le = TimeEngine.utcToLocal(endUtc, coachTz);
    localDate = ls.date; localStart = fmtTime(ls.time); localEnd = fmtTime(le.time);
  } catch {
    // DST-unsafe candidate — the court/DST outcome governs; do not fabricate a coach block.
    return { busy: false, reason: null };
  }

  // A. Weekly availability — coach-local window overlap (day_of_week: 0=Sun..6=Sat).
  const dow = new Date(`${localDate}T12:00:00Z`).getUTCDay();
  const [availRows] = await pool.query<RowData>(
    'SELECT start_time, end_time FROM coach_availability WHERE coach_id = ? AND day_of_week = ?',
    [profileId, dow],
  );
  if (availRows.length) {
    const hasOverlap = (availRows as any[]).some((slot) => windowOverlaps(fmtTime(String(slot.start_time)), fmtTime(String(slot.end_time)), localStart, localEnd));
    if (!hasOverlap) {
      return { busy: true, reason: `outside weekly availability (${localDate} ${localStart}-${localEnd})` };
    }
  }

  // B. Blackout — coach-local date.
  const [bRows] = await pool.query<RowData>(
    'SELECT id FROM coach_availability_blackouts WHERE coach_id = ? AND blackout_date = ? LIMIT 1',
    [profileId, localDate],
  );
  if (bRows.length) return { busy: true, reason: `blackout on ${localDate}` };

  // C. 1:1 coach sessions — canonical overlap semantics (reused, not duplicated).
  const [sRows] = await pool.query<RowData>(
    `SELECT id FROM coach_sessions
     WHERE coach_id = ? AND DATE(start_time) = ?
       AND status NOT IN ('cancelled','no_show','completed')
       AND start_time < ? AND end_time > ?
     LIMIT 1`,
    [profileId, localDate, `${localDate}T${localEnd}:00`, `${localDate}T${localStart}:00`],
  );
  if (sRows.length) return { busy: true, reason: `overlapping 1:1 coach session #${(sRows[0] as any).id}` };

  // D. Other Academy sessions assigned to the same coach (branch-local frame,
  // tenant-scoped by the academy group/session), current session excluded.
  const [aRows] = await pool.query<RowData>(
    `SELECT id FROM academy_group_sessions
     WHERE coach_id = ? AND session_date = ? AND status <> 'cancelled' AND id <> ?
       AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?))
     LIMIT 1`,
    [coachUserId, date, excludeSessionId ?? 0, fmtTime(end), fmtTime(start), fmtTime(end), fmtTime(start)],
  );
  if (aRows.length) return { busy: true, reason: `overlapping Academy session #${(aRows[0] as any).id} for the same coach` };

  return { busy: false, reason: null };
}

/** Overlap helper for 'HH:mm'/'HH:mm:ss' local times (supports overnight slots). */
function windowOverlaps(slotStart: string, slotEnd: string, candStart: string, candEnd: string): boolean {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
  const ss = toMin(slotStart); const se = toMin(slotEnd);
  const cs = toMin(candStart); const ce = toMin(candEnd);
  if (se <= ss) {
    // Slot spans midnight: [ss,1440) ∪ [0,se).
    return (cs >= ss && cs < 1440) || cs < se;
  }
  return cs < se && ce > ss;
}

export class AcademyConflictService {
  /** Deterministic horizon: the normal player booking window (7 days ahead). */
  playerHorizonUtc(tz: string): { horizonUtc: string; horizonDate: string } {
    const nowUtc = new Date(TimeEngine.now()).toISOString();
    const horizonUtc = new Date(new Date(nowUtc).getTime() + 7 * 86400_000).toISOString();
    return { horizonUtc, horizonDate: TimeEngine.utcToLocalDate(horizonUtc, tz) };
  }

  /**
   * G5-B — evaluate a candidate Academy slot including the COACH dimension.
   * Runs the existing court/resource evaluation first, then layers a coach
   * availability/conflict overlay on top: when the group coach is busy for the
   * candidate window (weekly availability, blackout, an overlapping active 1:1
   * coach session, or another Academy session of the same coach), the result is
   * the existing CONFLICT state with `coach_conflict` reason and conflict
   * metadata. When both a court and a coach conflict exist, ALL relevant
   * conflict information is preserved (merged metadata, silent-overwrite
   * prevented).
   */
  async evaluate(
    courtId: number,
    date: string,
    start: string,
    end: string,
    ctx: AcademyConflictContext,
  ): Promise<AcademyConflictEvaluation> {
    const base = await this.evaluateBase(courtId, date, start, end, ctx);

    const coachUserId = ctx.groupCoachId ? Number(ctx.groupCoachId) : null;
    if (!coachUserId) return base;

    const busy = await resolveAcademyCoachBusy(
      coachUserId,
      date,
      start,
      end,
      ctx.schedule.timezone,
      ctx.schedule.branch_id != null ? Number(ctx.schedule.branch_id) : undefined,
      ctx.sessionId ?? null,
    );
    if (!busy.busy) return base;

    const coachMeta = {
      type: null as 'booking' | 'academy_session' | null,
      id: null as number | null,
      prioritySeq: null as number | null,
      detail: busy.reason,
    };

    if (base.state === 'CONFLICT') {
      // Preserve the court conflict; append the coach detail (never overwrite).
      const merged: any = {
        ...(base.conflict ?? coachMeta),
        coach: { coachId: coachUserId, reason: busy.reason, originalConflictReason: base.reason },
      };
      return {
        ...base,
        reason: 'coach_conflict',
        conflict: merged,
      };
    }
    if (base.state === 'ADMIN_TIME_RESOLUTION_REQUIRED') {
      // DST gap/overlap already requires admin resolution — keep that outcome.
      return base;
    }
    // PENDING_COURT / DEFERRED → dominate to the existing CONFLICT model.
    const dominated: any = { ...coachMeta, coach: { coachId: coachUserId, reason: busy.reason } };
    return this.result(ctx, courtId, date, fmtTime(start), fmtTime(end), 'CONFLICT', 'coach_conflict', dominated, `Coach is unavailable for this Academy session (${busy.reason})`, null);
  }

  /**
   * Evaluate a candidate Academy slot. Never modifies the session (the caller
   * persists the returned state), except for the deterministic priority rule:
   * a later-priority holder is downgraded to `conflict` (values untouched).
   */
  async evaluateBase(
    courtId: number,
    date: string,
    start: string,
    end: string,
    ctx: AcademyConflictContext,
  ): Promise<AcademyConflictEvaluation> {
    const { schedule, resource, conn } = ctx;
    const tz = schedule.timezone;
    const prioritySeq = schedule.id;
    const s = fmtTime(start);
    const e = fmtTime(end);
    const alternatives: AcademyConflictAlternative[] = [];

    // ── DST: nonexistent or ambiguous local time → explicit admin resolution ──
    if (TimeEngine.isInGap(date, s, tz) || TimeEngine.isInGap(date, e, tz)) {
      return this.result(ctx, courtId, date, s, e, 'ADMIN_TIME_RESOLUTION_REQUIRED', 'dst_gap', null, 'Booking separated by DST spring-forward gap');
    }
    if (TimeEngine.isInOverlap(date, s, tz) || TimeEngine.isInOverlap(date, e, tz)) {
      return this.result(ctx, courtId, date, s, e, 'ADMIN_TIME_RESOLUTION_REQUIRED', 'dst_ambiguous', null, 'Ambiguous fall-back local time requires explicit resolution');
    }

    // ── Player horizon: within 7 days → DEFERRED (no hold) ──
    const { horizonDate } = this.playerHorizonUtc(tz);
    if (date <= horizonDate) {
      return this.result(ctx, courtId, date, s, e, 'DEFERRED', 'within_player_horizon', null, 'Inside the player booking window — no priority hold');
    }

    // ── Resource eligibility ──
    if (!resource || resource.deleted_at || !resource.is_active) {
      return this.result(ctx, courtId, date, s, e, 'CONFLICT', 'resource_unavailable', null, 'Preferred court is not available');
    }
    if (resource.branch_id !== schedule.branch_id) {
      return this.result(ctx, courtId, date, s, e, 'CONFLICT', 'resource_not_in_branch', null, 'Preferred court does not belong to the branch');
    }
    const sMin = toMin(s);
    const eMin = toMin(e);
    const isOvernight = eMin <= sMin;
    if (!isOvernight && resource.opening_time && resource.closing_time) {
      const openMin = toMin(resource.opening_time);
      const closeMin = toMin(resource.closing_time);
      if (sMin < openMin || eMin > closeMin) {
        return this.result(ctx, courtId, date, s, e, 'CONFLICT', 'outside_operating_hours', null, 'Outside the court operating hours');
      }
    }

    // ── UTC representation (safe: DST validated) ──
    let startAtUtc: string | null;
    let endAtUtc: string | null;
    try {
      startAtUtc = TimeEngine.localToUtc(date, s, tz);
      endAtUtc = TimeEngine.localToUtc(date, e, tz);
    } catch {
      return this.result(ctx, courtId, date, s, e, 'ADMIN_TIME_RESOLUTION_REQUIRED', 'dst_gap', null, 'Local time cannot be resolved to UTC');
    }

    // ── Occupancy: reuse the authoritative booking primitive (locks `resources`
    //    row FOR UPDATE, counts player bookings AND Academy pending holds) ──
    const occupied = !(await bookingRepository.checkSlotAvailability(
      courtId, date, [{ start: s, end: e }], conn as any, { excludeAcademySessionId: ctx.sessionId ?? undefined },
    ));

    // ── Academy hold priority (earliest-created recurring reservation wins) ──
    const competing = await academyScheduleRepository.findCompetingHolds(
      courtId, date, s, e, ctx.sessionId ?? null, conn,
    );
    const higher = competing.filter(
      (h: any) => Number(h.priority_seq) < prioritySeq
        || (Number(h.priority_seq) === prioritySeq && Number(h.id) < (ctx.sessionId ?? Number.MAX_SAFE_INTEGER)),
    );

    if (higher.length) {
      const winner = higher[0] as any;
      const alt = await this.buildAlternatives(ctx, courtId, date, s, e);
      return this.result(ctx, courtId, date, s, e, 'CONFLICT', 'academy_conflict', { type: 'academy_session', id: Number(winner.id), prioritySeq: Number(winner.priority_seq), detail: `Earlier recurring reservation (session #${winner.id}) holds this slot` }, 'Higher-priority Academy pending hold already reserves this slot', alt);
    }

    if (occupied && competing.length) {
      // Only lower-priority holders race here — the deterministic rule awards
      // the slot to the earlier-created recurring reservation: downgrade them.
      await academyScheduleRepository.downgradeLaterHolders(
        courtId, date, s, e, prioritySeq, ctx.sessionId ?? 0,
        { reason: 'lower_priority', replacingSessionId: ctx.sessionId ?? null, scheduleId: schedule.id },
        conn,
      );
      return this.result(ctx, courtId, date, s, e, 'PENDING_COURT', null, null, 'Later-priority hold downgraded; slot is now held by this recurring reservation', null);
    }

    if (occupied) {
      // No academy holder → a confirmed player booking blocks it.
      const alt = await this.buildAlternatives(ctx, courtId, date, s, e);
      return this.result(ctx, courtId, date, s, e, 'CONFLICT', 'player_booking_conflict', { type: 'booking', id: null, prioritySeq: null, detail: 'A player booking already reserves this slot' }, 'Existing player booking occupies this slot', alt);
    }

    // ── Vacant: enforce priority — later-priority holders (if any raced in)
    //    are deterministically downgraded to `conflict` (values untouched). ──
    const later = competing.filter(
      (h: any) => Number(h.priority_seq) > prioritySeq
        || (Number(h.priority_seq) === prioritySeq && Number(h.id) > (ctx.sessionId ?? 0)),
    );
    if (later.length) {
      await academyScheduleRepository.downgradeLaterHolders(
        courtId, date, s, e, prioritySeq, ctx.sessionId ?? 0,
        { reason: 'lower_priority', replacingSessionId: ctx.sessionId ?? null, scheduleId: schedule.id },
        conn,
      );
    }

    return this.result(ctx, courtId, date, s, e, 'PENDING_COURT', null, null, 'Slot is held as a pending priority court reservation', null);
  }

  /** Suggest alternatives (never applied automatically). */
  async buildAlternatives(
    ctx: AcademyConflictContext,
    courtId: number,
    date: string,
    start: string,
    end: string,
  ): Promise<AcademyConflictAlternative[]> {
    const { schedule } = ctx;
    const tz = schedule.timezone;
    const s = fmtTime(start);
    const e = fmtTime(end);
    const results: AcademyConflictAlternative[] = [];
    const seen = new Set<string>();
    const push = (c: Omit<AcademyConflictAlternative, 'state'>) => {
      const key = `${c.court_id}|${c.session_date}|${c.start_time}|${c.end_time}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push({ ...c, state: 'AVAILABLE' });
    };

    // a) another available court on the same date/time
    for (const court of ctx.branchCourts) {
      if (court.id === courtId) continue;
      if (await isSlotFree(court.id, date, s, e, tz)) {
        push({ court_id: court.id, court_name: court.name, session_date: date, start_time: s, end_time: e });
      }
    }

    // b) another valid date matching the recurrence weekdays
    const weekdaySet = new Set(schedule.weekdays);
    const startDate = new Date(`${date}T00:00:00Z`);
    const endDate = new Date(`${schedule.end_date}T00:00:00Z`);
    let considered = 0;
    for (let d = new Date(startDate.getTime() + 86400_000); considered < 14 && d <= endDate; d = new Date(d.getTime() + 86400_000)) {
      const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      const dow = (d.getUTCDay() === 0 ? 'sun' : ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getUTCDay()]);
      if (!weekdaySet.has(dow as any)) continue;
      considered++;
      if (await isSlotFree(courtId, iso, s, e, tz)) {
        push({ court_id: courtId, court_name: ctx.resource?.name ?? `Court #${courtId}`, session_date: iso, start_time: s, end_time: e });
      }
    }

    // c) another valid time on the preferred court (same day, same-duration shifts)
    const durationMin = toMin(e) - toMin(s);
    for (const delta of [-60, 60, -30, 30]) {
      const newStart = toMin(s) + delta;
      if (newStart < 0 || newStart > 23 * 60) continue;
      const newEnd = newStart + durationMin;
      if (newEnd > 24 * 60) continue;
      if ((ctx.resource?.opening_time && newStart < toMin(ctx.resource.opening_time)) || (ctx.resource?.closing_time && newEnd > toMin(ctx.resource.closing_time))) continue;
      if (durationMin <= 0) continue;
      const pad = (n: number) => String(n).padStart(2, '0');
      const ns = `${pad(Math.floor(newStart / 60))}:${pad(newStart % 60)}`;
      const ne = `${pad(Math.floor(newEnd / 60))}:${pad(newEnd % 60)}`;
      if (await isSlotFree(courtId, date, ns, ne, tz)) {
        push({ court_id: courtId, court_name: ctx.resource?.name ?? `Court #${courtId}`, session_date: date, start_time: ns, end_time: ne });
      }
    }

    return results.slice(0, 10);
  }

  private result(
    ctx: AcademyConflictContext,
    courtId: number,
    date: string,
    start: string,
    end: string,
    state: AcademyConflictEvaluation['state'],
    reason: AcademyConflictEvaluation['reason'],
    conflict: AcademyConflictEvaluation['conflict'],
    detail: string,
    alternatives?: AcademyConflictAlternative[] | null,
  ): AcademyConflictEvaluation {
    const tz = ctx.schedule.timezone;
    let startAtUtc: string | null = null;
    let endAtUtc: string | null = null;
    try {
      startAtUtc = TimeEngine.localToUtc(date, start, tz);
      endAtUtc = TimeEngine.localToUtc(date, end, tz);
    } catch {
      /* DST outcome reported via state/reason */
    }
    return {
      sessionId: ctx.sessionId ?? undefined,
      court_id: courtId,
      session_date: date,
      start_time: start,
      end_time: end,
      state,
      reason,
      startAtUtc,
      endAtUtc,
      prioritySeq: ctx.schedule.id,
      conflict,
      alternatives: alternatives ?? null,
    };
  }
}

export const academyConflictService = new AcademyConflictService();