import { getPool } from '../../database/mysql.js';
import type { CascadeExec } from './types.js';
import { cancelActiveBookingsWhere } from './booking.cascade.js';

export async function cascadeBranchSoftDelete(branchId: number, conn?: CascadeExec): Promise<void> {
  const db = conn ?? getPool();

  await cancelActiveBookingsWhere('branch_id', branchId, db);

  await db.execute(
    `UPDATE branch_player_access SET status = 'rejected', review_note = 'Branch deleted'
     WHERE branch_id = ? AND status = 'pending'`,
    [branchId],
  );

  await db.execute(
    `UPDATE resources SET deleted_at = NOW(), is_active = 0
     WHERE branch_id = ? AND deleted_at IS NULL`,
    [branchId],
  );

  await db.execute(
    `UPDATE branches SET is_active = 0 WHERE id = ? AND deleted_at IS NULL`,
    [branchId],
  );
}
