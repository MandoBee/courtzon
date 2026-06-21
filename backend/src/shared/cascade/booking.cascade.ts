import type { CascadeExec } from './types.js';
import { CANCELLABLE_BOOKING_STATUSES } from './types.js';

const statusPlaceholders = CANCELLABLE_BOOKING_STATUSES.map(() => '?').join(', ');

export async function cancelActiveBookingsWhere(
  column: 'user_id' | 'branch_id' | 'resource_id' | 'organisation_id',
  id: number,
  db: CascadeExec,
  note = 'Auto-cancelled: parent deleted',
): Promise<void> {
  await db.execute(
    `UPDATE bookings
     SET booking_status = 'cancelled',
         notes = CONCAT(COALESCE(notes, ''), ?)
     WHERE ${column} = ?
       AND booking_status IN (${statusPlaceholders})`,
    [` | ${note}`, id, ...CANCELLABLE_BOOKING_STATUSES],
  );
}
