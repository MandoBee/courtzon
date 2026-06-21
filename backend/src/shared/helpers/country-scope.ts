import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export async function getUserCountryScope(userId: number): Promise<{ isSystem: boolean; countryId: number | null }> {
  const pool = getPool();

  const [roleRows] = await pool.execute<RowData>(
    `SELECT r.slug FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = ? AND ur.is_active = TRUE AND r.deleted_at IS NULL
       AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
    [userId]
  );

  const roles = roleRows.map((r: any) => r.slug);
  const isSystem = roles.some((r) => r === 'super_admin' || r === 'super-admin');

  if (isSystem) return { isSystem: true, countryId: null };

  const [userRows] = await pool.execute<RowData>(
    'SELECT country_id FROM users WHERE id = ? AND deleted_at IS NULL',
    [userId]
  );

  return { isSystem: false, countryId: userRows[0]?.country_id || null };
}
