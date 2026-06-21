import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import type { CancelExpiredBookingsJob } from '../../../infrastructure/queue/queue.service.js';

const log = createModuleLogger('booking-expiry');

export async function handleCancelExpiredBookings(job: CancelExpiredBookingsJob): Promise<void> {
  const cutoff = job.cutoffMinutes ?? 30;
  const pool = getPool();

  const [rows] = await pool.execute<any[]>(
    `SELECT id, user_id FROM bookings
     WHERE booking_status = 'pending' AND payment_status = 'pending'
       AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [cutoff]
  );

  if (!rows.length) {
    log.info('No expired bookings to cancel');
    return;
  }

  for (const booking of rows) {
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
    await pool.execute(
      `UPDATE booking_slots SET is_available = TRUE WHERE booking_id = ?`,
      [booking.id]
    );
    log.info({ bookingId: booking.id }, `Cancelled expired booking #${booking.id}`);
  }

  log.info({ cancelled: rows.length }, `Cancelled ${rows.length} expired bookings`);
}
