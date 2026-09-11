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

/**
 * IDs of every organisation the user may operate on: orgs they own, orgs they
 * hold an active organisation role-scope for, and (via isPlatformAdmin) all
 * orgs. Platform admins get an empty array (meaning "no tenant restriction").
 * Used to scope list endpoints to the caller's authorised organisations.
 */
export async function findAccessibleOrgIds(userId: number): Promise<number[]> {
  if (!userId) return [];
  if (await isPlatformAdmin(userId)) return [];
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT DISTINCT org_id AS id FROM (
       SELECT o.id AS org_id FROM organisations o
       WHERE o.owner_id = ? AND o.deleted_at IS NULL
       UNION
       SELECT urs.scope_id AS org_id FROM user_role_scopes urs
       JOIN user_roles ur ON ur.id = urs.user_role_id
       WHERE ur.user_id = ? AND urs.scope_type = 'organisation' AND ur.is_active = TRUE
     ) t`,
    [userId, userId],
  );
  return rows.map((r: any) => Number(r.id));
}

/**
 * True if the user may operate on the given branch. Platform admins and users
 * with organisation access to the branch's organisation are allowed for every
 * branch of that organisation; users holding an active branch role-scope are
 * allowed for exactly that branch. The branch id must be resolved server-side.
 */
export async function canAccessBranch(userId: number, branchId: number): Promise<boolean> {
  if (!userId || !branchId) return false;
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    'SELECT organisation_id FROM branches WHERE id = ? AND is_active = TRUE LIMIT 1',
    [branchId],
  );
  if (!rows.length) return false;
  const orgId = Number((rows[0] as any).organisation_id);
  if (await canAccessOrganisation(userId, orgId)) return true;
  const [scopeRows] = await pool.execute<RowData>(
    `SELECT 1 FROM user_role_scopes urs
     JOIN user_roles ur ON ur.id = urs.user_role_id
     WHERE ur.user_id = ? AND urs.scope_type = 'branch' AND urs.scope_id = ? AND ur.is_active = TRUE
     LIMIT 1`,
    [userId, branchId],
  );
  return scopeRows.length > 0;
}

/**
 * IDs of every branch the user holds an explicit branch role-scope for. This
 * supplements (not replaces) organisation access — an organisation-scoped user
 * may access all branches of their organisations.
 */
export async function findAccessibleBranchIds(userId: number): Promise<number[]> {
  if (!userId) return [];
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT DISTINCT urs.scope_id AS id FROM user_role_scopes urs
     JOIN user_roles ur ON ur.id = urs.user_role_id
     WHERE ur.user_id = ? AND urs.scope_type = 'branch' AND ur.is_active = TRUE`,
    [userId],
  );
  return rows.map((r: any) => Number(r.id));
}
