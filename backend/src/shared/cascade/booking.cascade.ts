import type { PoolConnection } from 'mysql2/promise';
import { cancelBooking } from '../../platform/booking/BookingSaga.js';
import { CANCELLABLE_BOOKING_STATUSES } from './types.js';
import type { CascadeExec } from './types.js';
import type { RowDataPacket } from 'mysql2';

const statusPlaceholders = CANCELLABLE_BOOKING_STATUSES.map(() => '?').join(', ');

export async function cancelActiveBookingsWhere(
  column: 'user_id' | 'branch_id' | 'resource_id' | 'organisation_id',
  id: number,
  conn: CascadeExec,
  note = 'Auto-cancelled: parent deleted',
): Promise<void> {
  const [bookings] = await conn.execute<RowDataPacket[]>(
    `SELECT id FROM bookings WHERE ${column} = ? AND booking_status IN (${statusPlaceholders})`,
    [id, ...CANCELLABLE_BOOKING_STATUSES],
  );
  for (const booking of bookings) {
    await cancelBooking(booking.id, 0, note, 0, conn as PoolConnection);
  }
}
