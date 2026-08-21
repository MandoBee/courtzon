import { getPool } from '../../database/mysql.js';
import type mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

/**
 * True if the user is a platform administrator (super admin role).
 */
export async function isPlatformAdmin(userId: number): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.slug IN ('super_admin','super-admin') AND ur.is_active = TRUE LIMIT 1`,
    [userId],
  );
  return rows.length > 0;
}

/**
 * True if the user may operate on the given organisation: the org owner, a
 * platform admin, or a user with an active role-scope on that organisation.
 * The organisation id must be resolved server-side (e.g. from a resource
 * record) — never trust a client-supplied tenant id on its own.
 */
export async function canAccessOrganisation(userId: number, orgId: number): Promise<boolean> {
  if (!userId || !orgId) return false;
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT 1 FROM organisations WHERE id = ? AND (owner_id = ? OR ? IN (
       SELECT user_id FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.slug IN ('super_admin', 'super-admin')
     )) LIMIT 1`,
    [orgId, userId, userId, userId],
  );
  if (rows.length) return true;
  const [scopeRows] = await pool.execute<RowData>(
    `SELECT 1 FROM user_role_scopes urs
     JOIN user_roles ur ON ur.id = urs.user_role_id
     WHERE ur.user_id = ? AND urs.scope_type = 'organisation' AND urs.scope_id = ? AND ur.is_active = TRUE
     LIMIT 1`,
    [userId, orgId],
  );
  return scopeRows.length > 0;
}
