import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import type { CancelExpiredBookingsJob } from '../../../infrastructure/queue/queue.service.js';

const log = createModuleLogger('booking-expiry');

export async function handleCancelExpiredBookings(job: CancelExpiredBookingsJob): Promise<void> {
  const cutoff = job.cutoffMinutes ?? 30;
  const pool = getPool();

  // Under the payment-first architecture, no pending bookings are created in the
  // bookings table. This query serves as a safety net for any edge cases.
  const [bookings] = await pool.execute<any[]>(
    `SELECT id, user_id FROM bookings
     WHERE booking_status = 'pending' AND payment_status = 'pending'
       AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [cutoff]
  );

  for (const booking of bookings) {
    await pool.execute(
      `UPDATE bookings SET booking_status = 'cancelled', notes = 'Auto-cancelled: unpaid after ${cutoff}min'
       WHERE id = ?`,
      [booking.id]
    );
    await pool.execute(
      `INSERT INTO booking_cancellations (booking_id, cancelled_by, reason)
       VALUES (?, 0, 'Auto-cancelled: unpaid')`,
      [booking.id]
    );
    log.info({ bookingId: booking.id }, `Cancelled expired booking #${booking.id}`);
  }

  // Expire stale booking intents that were never fulfilled
  const [intents] = await pool.execute<any[]>(
    `SELECT id FROM booking_intents
     WHERE intent_status IN ('pending', 'payment_initiated')
       AND expires_at < NOW()`,
  );

  for (const intent of intents) {
    await pool.execute(
      `UPDATE booking_intents SET intent_status = 'expired', failure_reason = 'Auto-expired: payment timeout' WHERE id = ?`,
      [intent.id]
    );
    log.info({ intentId: intent.id }, 'Expired stale booking intent');
  }

  log.info({
    cancelledBookings: bookings.length,
    expiredIntents: intents.length,
  }, `Cleanup complete: ${bookings.length} bookings cancelled, ${intents.length} intents expired`);
}
