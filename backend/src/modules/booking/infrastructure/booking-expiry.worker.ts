import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { cancelBooking } from '../../../platform/booking/BookingSaga.js';
import type { CancelExpiredBookingsJob } from '../../../infrastructure/queue/queue.service.js';

const log = createModuleLogger('booking-expiry');

export async function handleCancelExpiredBookings(job: CancelExpiredBookingsJob): Promise<void> {
  const pool = getPool();

  // Expire bookings stuck in pending_payment past their expires_at (3 min TTL)
  const [pendingPaymentBookings] = await pool.execute<any[]>(
    `SELECT id, user_id FROM bookings
     WHERE booking_status = 'pending_payment'
       AND expires_at IS NOT NULL AND expires_at < NOW()`,
  );

  for (const booking of pendingPaymentBookings) {
    try {
      await cancelBooking(booking.id, 0, 'Auto-cancelled: payment timeout');
      log.info({ bookingId: booking.id }, `Cancelled expired pending_payment booking #${booking.id}`);
    } catch (err) {
      log.error({ err, bookingId: booking.id }, 'Failed to cancel expired pending_payment booking');
    }
  }

  // Legacy: also expire old 'pending' bookings without payment (safety net)
  const cutoff = job.cutoffMinutes ?? 5;
  const [pendingBookings] = await pool.execute<any[]>(
    `SELECT id, user_id FROM bookings
     WHERE booking_status = 'pending' AND payment_status = 'pending'
       AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [cutoff]
  );

  for (const booking of pendingBookings) {
    try {
      await cancelBooking(booking.id, 0, 'Auto-cancelled: unpaid');
      log.info({ bookingId: booking.id }, `Cancelled expired booking #${booking.id}`);
    } catch (err) {
      log.error({ err, bookingId: booking.id }, 'Failed to cancel expired booking');
    }
  }

  log.info({
    cancelledPendingPayment: pendingPaymentBookings.length,
    cancelledPending: pendingBookings.length,
  }, `Cleanup complete: ${pendingPaymentBookings.length} pending_payment bookings, ${pendingBookings.length} pending bookings cancelled`);
}
