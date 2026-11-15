/**
 * Inventory organisation-scope repository (P1).
 *
 * All SQL for the organisation-aware Inventory guard lives here. The application
 * layer receives plain permission keys and booleans only.
 */

import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

/**
 * Permission keys granted to the user by roles bound to ONE organisation:
 *   • an organisation role clone (`roles.organisation_id = orgId`), or
 *   • a global role (`roles.organisation_id IS NULL`) whose assignment carries
 *     an active organisation scope (`user_role_scopes.scope_type='organisation'`,
 *     `scope_id=orgId`).
 *
 * A global role WITHOUT that scope contributes nothing, and a role bound to a
 * different organisation contributes nothing. This is the tenant boundary.
 */
export async function findOrgBoundPermissionKeys(
  userId: number,
  orgId: number,
): Promise<string[]> {
  if (!userId || !orgId) return [];
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT DISTINCT p.permission_key
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       LEFT JOIN user_role_scopes urs
         ON urs.user_role_id = ur.id
        AND urs.scope_type = 'organisation'
        AND urs.scope_id = ?
      WHERE ur.user_id = ?
        AND ur.is_active = TRUE
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        AND r.is_active = TRUE
        AND r.deleted_at IS NULL
        AND (
          r.organisation_id = ?
          OR (r.organisation_id IS NULL AND urs.id IS NOT NULL)
        )`,
    [orgId, userId, orgId],
  );
  return (rows as any[]).map((row) => String(row.permission_key));
}

/**
 * Organisation access for Inventory, including organisation role clones.
 *
 * This is intentionally a SUPERSET of the legacy `userCanAccessOrganisation`
 * (owner ∪ `user_organisations` ∪ `user_role_scopes` ∪ platform admin): an
 * organisation clone role (`roles.organisation_id`) is how organisation staff
 * actually receive workspace access, so Inventory must recognise it. The
 * legacy `/admin/*` resolver is left untouched — this predicate is only used by
 * the `/org/:orgId/inventory/*` routes.
 */
export async function canAccessInventoryOrganisation(
  userId: number,
  orgId: number,
): Promise<boolean> {
  if (!userId || !orgId) return false;
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT 1 FROM organisations o
      LEFT JOIN user_organisations uo
        ON uo.organisation_id = o.id AND uo.user_id = ?
      WHERE o.id = ? AND o.is_active = TRUE AND o.deleted_at IS NULL
        AND (
          o.owner_id = ?
          OR uo.id IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM user_role_scopes urs
            JOIN user_roles ur ON ur.id = urs.user_role_id
            JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = ? AND urs.scope_type = 'organisation'
              AND urs.scope_id = o.id AND ur.is_active = TRUE
              AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
              AND r.is_active = TRUE
              AND r.deleted_at IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM user_roles ur2
            JOIN roles r ON r.id = ur2.role_id
            WHERE ur2.user_id = ? AND r.organisation_id = o.id
              AND ur2.is_active = TRUE
              AND (ur2.expires_at IS NULL OR ur2.expires_at > NOW())
              AND r.is_active = TRUE
              AND r.deleted_at IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM user_roles ur3
            JOIN roles r3 ON r3.id = ur3.role_id
            WHERE ur3.user_id = ? AND r3.slug IN ('super_admin', 'super-admin')
              AND r3.organisation_id IS NULL
              AND ur3.is_active = TRUE
              AND (ur3.expires_at IS NULL OR ur3.expires_at > NOW())
              AND r3.is_active = TRUE
              AND r3.deleted_at IS NULL
          )
        )
      LIMIT 1`,
    [userId, orgId, userId, userId, userId, userId],
  );
  return rows.length > 0;
}

/**
 * Platform-admin organisation validation.
 *
 * Platform administrators retain platform-wide administrative capability,
 * including organisations that have been deactivated (`is_active = FALSE`).
 * Deleted organisations are never valid. Normal organisation users go through
 * `canAccessInventoryOrganisation`, which requires `is_active = TRUE`.
 */
export async function organisationExists(orgId: number): Promise<boolean> {
  if (!orgId) return false;
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    'SELECT 1 FROM organisations WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [orgId],
  );
  return rows.length > 0;
}
