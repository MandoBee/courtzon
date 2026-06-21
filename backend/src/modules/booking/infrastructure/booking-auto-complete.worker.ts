import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('booking-auto-complete');

export async function handleAutoCompleteBookings(): Promise<void> {
  const pool = getPool();

  const [rows] = await pool.execute<any[]>(
    `UPDATE bookings
     SET booking_status = 'completed'
     WHERE booking_status = 'confirmed'
       AND CONCAT(booking_date, ' ', start_time) < NOW()`
  );

  const affected = (rows as any).affectedRows || 0;
  if (affected > 0) {
    log.info({ completed: affected }, `Auto-completed ${affected} past bookings`);
  }
}
