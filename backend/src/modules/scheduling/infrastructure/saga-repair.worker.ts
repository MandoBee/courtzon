import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getRedisClient } from '../../../infrastructure/redis/redis.client.js';
import { bookingService } from '../../booking/application/booking.service.js';
import { activitiesRepository } from '../../activities/infrastructure/repositories/activities.repository.js';
import { ConflictError } from '../../../shared/errors/app-error.js';
import type { SagaRepairJob } from '../../../infrastructure/queue/queue.service.js';

const log = createModuleLogger('saga-repair');

// Run-level guard so two worker executions (e.g. multiple instances) never
// overlap. The lock auto-expires (10 min — longer than a bounded run).
const RUN_LOCK_KEY = 'saga-repair:run';
const RUN_LOCK_TTL_MS = 600000;
const DEFAULT_GRACE_MINUTES = 30;
const BATCH_LIMIT = 100;

// Booking statuses that are TERMINAL for the booking — a linked coach session
// can no longer be supported by the booking once the booking itself reached one.
const TERMINAL_BOOKING_STATUSES = ['cancelled', 'expired', 'no_show'];
// Coach session statuses that are ACTIVE (not terminal) — these are the ones a
// repair may cancel.
const ACTIVE_SESSION_STATUSES = ['pending_court', 'pending_acceptance', 'scheduled', 'confirmed', 'in_progress'];
// Booking statuses that a coach_session booking can legitimately pass through.
// A coach_session booking stuck in one of these WITHOUT any linked coach session
// after the grace window is demonstrably orphaned (the unified flow links a
// session synchronously inside the same request).
const STUCK_BOOKING_STATUSES = ['pending', 'pending_payment', 'confirmed'];
// Booking statuses that are still NON-TERMINAL and from which a canonical
// cancellation transition is legal in the booking aggregate. R3 only ever
// cancels active coach bookings linked to a CANCELLED coach session. Terminal
// bookings are excluded (R1 owns the terminal→session direction) and
// 'checked_in' is excluded because the aggregate forbids a checked_in →
// cancelled transition.
const R3_ACTIVE_BOOKING_STATUSES = ['pending', 'pending_payment', 'confirmed'];

/**
 * Periodic repair/reconciliation for coach-booking Saga interruptions.
 *
 * Addresses the state inconsistency class left by a crash between the async
 * Saga steps (booking committed → payment confirmed → coach session created/
 * linked → compensation). It ONLY repairs records that are demonstrably
 * inconsistent based on AUTHORITATIVE persisted state — it never invents a
 * financial outcome:
 *
 *   R1 — a coach session linked to a TERMINAL booking (cancelled/expired/
 *        no_show) but still active → cancel the session (frees the coach slot;
 *        no money movement).
 *   R2 — a booking_type='coach_session' booking in a non-terminal state, OLDER
 *        than the grace window, with NO linked coach session → delegate to the
 *        canonical `bookingService.compensateFailedBooking` (cancels the
 *        booking and refunds ONLY if authoritative money-moved state says so —
 *        never a blind refund).
 *   R3 — the DEFENSIVE reverse-reconciliation safety net: a canonical
 *        Unified Flow B coach booking (booking_type='coach_session' with a
 *        linked coach_session via coach_sessions.booking_id — the ONLY
 *        production writer of that link is the unified-flow
 *        `updateSessionBooking`) in a NON-TERMINAL state whose LINKED coach
 *        session has been CANCELLED without the booking being cancelled.
 *        The booking is cancelled through the SAME canonical system path as
 *        R2, so every refund/accounting/idempotency guard stays inside the
 *        booking service.
 *
 * Scoping constraints for R3:
 *   - Legacy coach_session records (booking_id NULL, states pending_acceptance/
 *     confirmed) are structurally excluded — R3 only ever considers sessions
 *     linked through coach_sessions.booking_id.
 *   - No-show (booking OR session) is excluded entirely — R3 resolves ONLY
 *     CANCELLED sessions.
 *   - A booking is only cancelled while still non-terminal AND in a state from
 *     which the aggregate allows 'cancelled'.
 *
 * All three repairs are idempotent: R1 only targets active sessions, R2 only
 * targets non-terminal session-less bookings, R3 only targets non-terminal
 * bookings with cancelled linked sessions, and each re-validates state right
 * before acting. Accounting is not touched directly; the canonical compensation
 * path emits booking:refunded exactly once and is protected by the refunded
 * amount cap.
 */

/**
 * Fresh re-validation of an R3 candidate immediately BEFORE acting on it.
 * Guards the read→act race: the worker only ever cancels the booking when the
 * canonical invariant still holds — the linked session is still cancelled, the
 * linkage still points at this booking, and the booking is still a non-terminal
 * Unified Flow B coach booking. Returns false (skip) otherwise.
 */
export async function refreshR3Candidate(sessionId: number, bookingId: number): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.execute<any[]>(
    `SELECT 1
     FROM coach_sessions cs
     JOIN bookings b ON cs.booking_id = b.id
     WHERE cs.id = ?
       AND cs.status = 'cancelled'
       AND cs.booking_id = ?
       AND b.booking_type = 'coach_session'
       AND b.booking_status IN (${R3_ACTIVE_BOOKING_STATUSES.map(() => '?').join(',')})
     LIMIT 1`,
    [sessionId, bookingId, ...R3_ACTIVE_BOOKING_STATUSES],
  );
  return rows.length === 1;
}

export type R3RefreshCandidate = (sessionId: number, bookingId: number) => Promise<boolean>;

/**
 * R3 phase — the reverse reconciliation safety net. Broken out of
 * handleSagaRepair so the read→act race guard is deterministic to exercise:
 * the injected `refreshCandidate` defaults to the real guard (production
 * behaviour of handleSagaRepair is unchanged), but a test can inject a wrapper
 * that mutates state in the scan→act window, exactly the concurrency the guard
 * protects against. Returns aggregate counters for the run log.
 */
export async function runR3Reconciliation(
  refreshCandidate: R3RefreshCandidate = refreshR3Candidate,
): Promise<{ reconciledBookings: number; skippedStateChanged: number; failedReconciliations: number }> {
  const pool = getPool();
  let reconciledBookings = 0;
  let skippedStateChanged = 0;
  let failedReconciliations = 0;
  const [cancelledSessionBookings] = await pool.execute<any[]>(
    `SELECT cs.id AS session_id, cs.booking_id AS booking_id
     FROM coach_sessions cs
     JOIN bookings b ON cs.booking_id = b.id
     WHERE cs.status = 'cancelled'
       AND cs.booking_id IS NOT NULL
       AND b.booking_type = 'coach_session'
       AND b.booking_status IN (${R3_ACTIVE_BOOKING_STATUSES.map(() => '?').join(',')})
     LIMIT ${BATCH_LIMIT}`,
    R3_ACTIVE_BOOKING_STATUSES,
  );

  for (const row of cancelledSessionBookings) {
    const sessionId = Number(row.session_id);
    const bookingId = Number(row.booking_id);
    try {
      // Never act on stale state: re-validate the canonical invariant right
      // before the action so a concurrent change cannot cause an incorrect
      // cancellation.
      if (!(await refreshCandidate(sessionId, bookingId))) {
        skippedStateChanged++;
        log.info({ sessionId, bookingId }, 'Saga repair (R3): skipped — linked booking/session no longer inconsistent');
        continue;
      }
      // Canonical system cancellation/refund path (same as R2) — R3 never
      // performs refund/accounting/wallet logic itself.
      const result = await bookingService.compensateFailedBooking(bookingId, 'Saga repair: linked coach session cancelled');
      reconciledBookings++;
      log.info({ sessionId, bookingId, ...result }, 'Saga repair (R3): reconciled active booking for cancelled linked session');
    } catch (err) {
      // A terminal-state conflict between the re-check and the action is the
      // expected race our check was designed to protect against — classify as
      // a skip, not a failure. Anything else is reported and isolated so the
      // remaining batch still processes.
      if (err instanceof ConflictError) {
        skippedStateChanged++;
        log.info({ err, sessionId, bookingId }, 'Saga repair (R3): skipped — booking reached terminal state concurrently');
      } else {
        failedReconciliations++;
        log.error({ err, sessionId, bookingId }, 'Saga repair (R3): failed to reconcile booking for cancelled session');
      }
    }
  }

  return { reconciledBookings, skippedStateChanged, failedReconciliations };
}

export async function handleSagaRepair(job: SagaRepairJob = {}): Promise<void> {
  const pool = getPool();
  const redis = getRedisClient();

  // Overlap guard: one repair run at a time across all instances.
  const lockOwner = `saga-repair-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const locked = await redis.set(RUN_LOCK_KEY, lockOwner, 'PX', RUN_LOCK_TTL_MS, 'NX');
  if (locked !== 'OK') {
    log.info('Saga repair already running — skip');
    return;
  }

  try {
    const graceMinutes = Math.max(5, Number(job.graceMinutes) || DEFAULT_GRACE_MINUTES);

    // ── R1: coach sessions linked to terminal bookings that are still active ──
    let cancelledSessions = 0;
    const [orphanSessions] = await pool.execute<any[]>(
      `SELECT cs.id
       FROM coach_sessions cs
       JOIN bookings b ON cs.booking_id = b.id
       WHERE b.booking_status IN (${TERMINAL_BOOKING_STATUSES.map(() => '?').join(',')})
         AND cs.status IN (${ACTIVE_SESSION_STATUSES.map(() => '?').join(',')})
       LIMIT ${BATCH_LIMIT}`,
      [...TERMINAL_BOOKING_STATUSES, ...ACTIVE_SESSION_STATUSES],
    );

    for (const row of orphanSessions) {
      try {
        await activitiesRepository.cancelCoachSession(Number(row.id));
        cancelledSessions++;
        log.info({ sessionId: Number(row.id) }, 'Saga repair: cancelled coach session linked to terminal booking');
      } catch (err) {
        log.error({ err, sessionId: Number(row.id) }, 'Saga repair: failed to cancel orphan coach session');
      }
    }

    // ── R2: session-less coach_session bookings stuck beyond the grace window ──
    let compensatedBookings = 0;
    const [stuckBookings] = await pool.execute<any[]>(
      `SELECT b.id
       FROM bookings b
       WHERE b.booking_type = 'coach_session'
         AND b.booking_status IN (${STUCK_BOOKING_STATUSES.map(() => '?').join(',')})
         AND b.created_at < NOW() - INTERVAL ? MINUTE
         AND NOT EXISTS (SELECT 1 FROM coach_sessions cs WHERE cs.booking_id = b.id)
       LIMIT ${BATCH_LIMIT}`,
      [...STUCK_BOOKING_STATUSES, graceMinutes],
    );

    for (const row of stuckBookings) {
      try {
        // Canonical compensation: cancels + refunds ONLY if authoritative
        // money-moved state says so (idempotent, single booking:refunded).
        const result = await bookingService.compensateFailedBooking(Number(row.id), 'Saga repair: coach session missing');
        compensatedBookings++;
        log.info({ bookingId: Number(row.id), ...result }, 'Saga repair: compensated coach booking without a linked session');
      } catch (err) {
        log.error({ err, bookingId: Number(row.id) }, 'Saga repair: failed to compensate stuck coach booking');
      }
    }

    // ── R3: active coach bookings whose LINKED coach session was cancelled ──
    const r3 = await runR3Reconciliation();

    log.info(
      { cancelledSessions, compensatedBookings, ...r3, graceMinutes },
      'Saga repair run complete',
    );
  } finally {
    // Best-effort release of the run lock (compare-and-delete, own lock only).
    await redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      1, RUN_LOCK_KEY, lockOwner,
    ).catch(() => {});
  }
}