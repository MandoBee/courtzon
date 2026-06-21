import type { FastifyRequest, FastifyReply } from 'fastify';
import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export function requireOrganisationAccess(orgIdParam = 'orgId') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });

    const orgId = parseInt((request.params as any)[orgIdParam], 10);
    if (!orgId) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid organisation ID' });

    try {
      const pool = getPool();
      const [rows] = await pool.execute<RowData>(
        `SELECT 1 FROM organisations WHERE id = ? AND (owner_id = ? OR ? IN (
          SELECT user_id FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = ? AND r.slug IN ('super_admin', 'super-admin', 'admin')
        )) LIMIT 1`,
        [orgId, userId, userId, userId]
      );

      if (!rows.length) {
        const [orgRows] = await pool.execute<RowData>(
          `SELECT 1 FROM user_role_scopes urs
           JOIN user_roles ur ON ur.id = urs.user_role_id
           WHERE ur.user_id = ? AND urs.scope_type = 'organisation' AND urs.scope_id = ? AND ur.is_active = TRUE
           LIMIT 1`,
          [userId, orgId]
        );

        if (!orgRows.length) {
          return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access to this organisation denied' });
        }
      }
    } catch {
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Access check failed' });
    }
  };
}

/**
 * Stricter org guard for elevated actions (staff & coach management). Unlike
 * `requireOrganisationAccess`, scoped shop-admin are NOT allowed — only:
 *   - the organisation owner,
 *   - a platform admin / super_admin,
 *   - a user with an org-scoped role on this org that carries `org.staff.manage`.
 */
export function requireOrgManageAccess(orgIdParam = 'orgId') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });

    const orgId = parseInt((request.params as any)[orgIdParam], 10);
    if (!orgId) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid organisation ID' });

    try {
      const pool = getPool();

      const [ownerRows] = await pool.execute<RowData>(
        `SELECT 1 FROM organisations WHERE id = ? AND owner_id = ? LIMIT 1`,
        [orgId, userId]
      );
      if (ownerRows.length) return;

      const [adminRows] = await pool.execute<RowData>(
        `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = ? AND ur.is_active = TRUE
            AND r.slug IN ('super_admin', 'super-admin') LIMIT 1`,
        [userId]
      );
      if (adminRows.length) return;

      const [mgrRows] = await pool.execute<RowData>(
        `SELECT 1
           FROM user_role_scopes urs
           JOIN user_roles ur ON ur.id = urs.user_role_id
           JOIN role_permissions rp ON rp.role_id = ur.role_id
           JOIN permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = ? AND ur.is_active = TRUE
            AND urs.scope_type = 'organisation' AND urs.scope_id = ?
            AND p.permission_key = 'org.staff.manage'
          LIMIT 1`,
        [userId, orgId]
      );
      if (mgrRows.length) return;

      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Requires organisation owner or admin access' });
    } catch {
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Access check failed' });
    }
  };
}

/** Owner, platform admin, or org-scoped holder of a specific permission key. */
export function requireOrgScopedPermission(permissionKey: string, orgIdParam = 'orgId') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });

    const orgId = parseInt((request.params as any)[orgIdParam], 10);
    if (!orgId) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid organisation ID' });

    try {
      const pool = getPool();

      const [ownerRows] = await pool.execute<RowData>(
        `SELECT 1 FROM organisations WHERE id = ? AND owner_id = ? LIMIT 1`,
        [orgId, userId]
      );
      if (ownerRows.length) return;

      const [adminRows] = await pool.execute<RowData>(
        `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = ? AND ur.is_active = TRUE
            AND r.slug IN ('super_admin', 'super-admin') LIMIT 1`,
        [userId]
      );
      if (adminRows.length) return;

      const [permRows] = await pool.execute<RowData>(
        `SELECT 1
           FROM user_role_scopes urs
           JOIN user_roles ur ON ur.id = urs.user_role_id
           JOIN role_permissions rp ON rp.role_id = ur.role_id
           JOIN permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = ? AND ur.is_active = TRUE
            AND urs.scope_type = 'organisation' AND urs.scope_id = ?
            AND p.permission_key = ?
          LIMIT 1`,
        [userId, orgId, permissionKey]
      );
      if (permRows.length) return;

      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Insufficient organisation permissions' });
    } catch {
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Access check failed' });
    }
  };
}
