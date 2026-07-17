import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { expireBooking } from '../../../platform/booking/BookingSaga.js';
import { CancellationReason } from '../../../platform/shared/booking-types.js';
import type { CancelExpiredBookingsJob } from '../../../infrastructure/queue/queue.service.js';

const log = createModuleLogger('booking-expiry');

export async function handleCancelExpiredBookings(job: CancelExpiredBookingsJob): Promise<void> {
  const pool = getPool();

  const [pendingPaymentBookings] = await pool.execute<any[]>(
    `SELECT id, user_id FROM bookings
     WHERE booking_status = 'pending_payment'
       AND expires_at IS NOT NULL AND expires_at < NOW()`,
  );

  for (const booking of pendingPaymentBookings) {
    try {
      await expireBooking(booking.id);
      log.info({ bookingId: booking.id }, `Expired pending_payment booking #${booking.id}`);
    } catch (err) {
      log.error({ err, bookingId: booking.id }, 'Failed to expire pending_payment booking');
    }
  }

  log.info({
    expiredPendingPayment: pendingPaymentBookings.length,
  }, `Cleanup complete: ${pendingPaymentBookings.length} pending_payment bookings expired`);
}
