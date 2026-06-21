import { getPool } from '../../database/mysql.js';
import type { CascadeExec } from './types.js';
import { cancelActiveBookingsWhere } from './booking.cascade.js';

export async function cascadeResourceSoftDelete(resourceId: number, conn?: CascadeExec): Promise<void> {
  const db = conn ?? getPool();

  await cancelActiveBookingsWhere('resource_id', resourceId, db);

  await db.execute(
    `UPDATE resources SET is_active = 0 WHERE id = ? AND deleted_at IS NULL`,
    [resourceId],
  );
}
