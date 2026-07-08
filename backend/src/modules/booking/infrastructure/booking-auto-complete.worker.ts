import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { eventBus } from '../../../shared/event-bus/index.js';

const log = createModuleLogger('booking-auto-complete');

export async function handleAutoCompleteBookings(): Promise<void> {
  const pool = getPool();

  const [completed] = await pool.execute<any[]>(
    `SELECT id, user_id, organisation_id FROM bookings
     WHERE booking_status = 'confirmed'
       AND CONCAT(booking_date, ' ', start_time) < NOW()`
  );

  for (const booking of completed) {
    await pool.execute(
      'UPDATE bookings SET booking_status = \'completed\' WHERE id = ?',
      [booking.id]
    );
    eventBus.emit('booking:completed', {
      bookingId: booking.id,
      userId: booking.user_id,
      organisationId: booking.organisation_id || undefined,
    });
  }

  const affected = (completed as any).affectedRows || completed.length || 0;
  if (affected > 0) {
    log.info({ completed: affected }, `Auto-completed ${affected} past bookings`);
  }
}
