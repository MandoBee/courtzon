import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { completeBooking } from '../../../platform/booking/BookingSaga.js';

const log = createModuleLogger('booking-auto-complete');

export async function handleAutoCompleteBookings(): Promise<void> {
  const pool = getPool();

  const [completed] = await pool.execute<any[]>(
    `SELECT id, user_id, organisation_id FROM bookings
     WHERE booking_status = 'confirmed'
       AND CONCAT(booking_date, ' ', start_time) < NOW()`
  );

  for (const booking of completed) {
    try {
      await completeBooking(booking.id);
    } catch (err) {
      log.error({ err, bookingId: booking.id }, 'Failed to auto-complete booking');
    }
  }

  const affected = completed.length || 0;
  if (affected > 0) {
    log.info({ completed: affected }, `Auto-completed ${affected} past bookings`);
  }
}
