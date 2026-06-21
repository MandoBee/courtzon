import { getPool } from '../../database/mysql.js';
import type { CascadeExec } from './types.js';

export async function cascadeRoleSoftDelete(roleId: number, conn?: CascadeExec): Promise<void> {
  const db = conn ?? getPool();
  await db.execute(`DELETE FROM user_roles WHERE role_id = ?`, [roleId]);
}
