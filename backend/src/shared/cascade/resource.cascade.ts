import { getPool } from '../../database/mysql.js';
import type { CascadeExec } from './types.js';

export async function cascadeResourceSoftDelete(resourceId: number, conn?: CascadeExec): Promise<void> {
  const db = conn ?? getPool();

  await db.execute(
    `UPDATE resources SET is_active = 0 WHERE id = ? AND deleted_at IS NULL`,
    [resourceId],
  );
}
