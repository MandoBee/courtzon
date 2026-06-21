import { getPool } from '../../database/mysql.js';
import type { CascadeExec } from './types.js';

export async function cascadeSportSoftDelete(sportId: number, conn?: CascadeExec): Promise<void> {
  const db = conn ?? getPool();

  await db.execute(
    `UPDATE sport_positions SET deleted_at = NOW(), is_active = 0
     WHERE sport_id = ? AND deleted_at IS NULL`,
    [sportId],
  );

  await db.execute(
    `UPDATE resources SET sport_id = NULL
     WHERE sport_id = ? AND deleted_at IS NULL`,
    [sportId],
  );

  await db.execute(
    `UPDATE products SET sport_id = NULL
     WHERE sport_id = ? AND deleted_at IS NULL`,
    [sportId],
  );

  await db.execute(
    `UPDATE sports SET is_active = 0 WHERE id = ? AND deleted_at IS NULL`,
    [sportId],
  );
}
