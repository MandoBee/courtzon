import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getRedisClient } from '../../../infrastructure/redis/redis.client.js';
import { bookingService } from '../../booking/application/booking.service.js';
import { activitiesRepository } from '../../activities/infrastructure/repositories/activities.repository.js';
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
 *
 * Both repairs are idempotent: R1 only targets active sessions and R2 only
 * targets non-terminal bookings (compensation marks them terminal). Accounting
 * is not touched directly; the canonical compensation path emits booking:refunded
 * exactly once and is protected by the refunded_amount cap.
 */
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

    log.info({ cancelledSessions, compensatedBookings, graceMinutes }, 'Saga repair run complete');
  } finally {
    // Best-effort release of the run lock (compare-and-delete, own lock only).
    await redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      1, RUN_LOCK_KEY, lockOwner,
    ).catch(() => {});
  }
}