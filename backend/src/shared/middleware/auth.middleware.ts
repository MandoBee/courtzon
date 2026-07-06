import type { FastifyRequest, FastifyReply } from 'fastify';
import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export function requireRole(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
    try {
      const pool = getPool();
      const [rows] = await pool.execute<RowData>(
      `SELECT DISTINCT r.slug FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND ur.is_active = TRUE
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
         AND r.deleted_at IS NULL`,
        [userId]
      );
      const userRoles = rows.map((r: any) => r.slug);
      const hasRole = roles.some((role) => userRoles.includes(role));
      if (!hasRole) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Insufficient permissions' });
      }
    } catch {
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Role check failed' });
    }
  };
}

export function requirePermission(permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
    try {
      const pool = getPool();
      const [rows] = await pool.execute<RowData>(
        `SELECT DISTINCT p.permission_key FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.id = rp.permission_id
         JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = ? AND ur.is_active = TRUE
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
            AND r.deleted_at IS NULL`,
        [userId]
      );
      const userPermissions = rows.map((r: any) => r.permission_key);
      const hasPermission = permissions.some((perm) => userPermissions.includes(perm));
      if (!hasPermission) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Insufficient permissions' });
      }
    } catch {
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Permission check failed' });
    }
  };
}

/** Pass if the user has any listed role OR any listed permission key. */
export function eitherRoleOrPermission(roles: string[], permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
    try {
      const pool = getPool();
      const [roleRows] = await pool.execute<RowData>(
        `SELECT DISTINCT r.slug FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ? AND ur.is_active = TRUE
           AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
           AND r.deleted_at IS NULL`,
        [userId],
      );
      const userRoles = roleRows.map((r: any) => r.slug);
      if (roles.some((role) => userRoles.includes(role))) return;

      const [permRows] = await pool.execute<RowData>(
        `SELECT DISTINCT p.permission_key FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.id = rp.permission_id
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ? AND ur.is_active = TRUE
           AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
           AND r.deleted_at IS NULL`,
        [userId],
      );
      const userPermissions = permRows.map((p: any) => p.permission_key);
      if (permissions.some((perm) => userPermissions.includes(perm))) return;

      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Insufficient permissions' });
    } catch {
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Access check failed' });
    }
  };
}

/** Platform admin routes: super_admin role OR platform.admin permission. */
export const adminGuard = eitherRoleOrPermission(['super_admin', 'super-admin'], ['platform.admin']);

export function requireApprovedOrg() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
    try {
      const pool = getPool();
      const [orgRows] = await pool.execute<RowData>(
        `SELECT o.is_verified, o.is_active
         FROM organisations o
         JOIN organisation_types ot ON ot.id = o.org_type_id
         WHERE o.owner_id = ? AND ot.slug IN ('seller', 'player')
         ORDER BY o.created_at DESC LIMIT 1`,
        [userId]
      );
      if (orgRows.length && orgRows[0].is_active && orgRows[0].is_verified) return;

      // Fallback: check if user has any org-scoped role (e.g. org-admin, shop-admin)
      const [scopedRows] = await pool.execute<RowData>(
        `SELECT 1 FROM user_role_scopes urs
         JOIN user_roles ur ON ur.id = urs.user_role_id
         WHERE ur.user_id = ? AND urs.scope_type = 'organisation' AND ur.is_active = TRUE
         LIMIT 1`,
        [userId]
      );
      if (scopedRows.length) return;

      return reply.status(403).send({
        error: 'ORG_NOT_APPROVED',
        message: 'Your seller account is pending admin approval. You will be able to access this feature once your account is approved.',
      });
    } catch {
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Organisation approval check failed' });
    }
  };
}

/** Resolve active session user id, or null if missing/invalid/expired. */
export async function resolveSessionUserId(request: FastifyRequest): Promise<number | null> {
  const { getSessionToken } = await import('../utils/auth-cookies.js');
  const { hashToken } = await import('../utils/token.js');
  const sessionToken = getSessionToken(request);
  if (!sessionToken) return null;
  const sessionTokenHash = hashToken(sessionToken);
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT user_id FROM user_sessions
     WHERE session_token_hash = ? AND is_revoked = FALSE AND expires_at > NOW()
     LIMIT 1`,
    [sessionTokenHash],
  );
  return rows.length ? Number(rows[0].user_id) : null;
}

const PUBLIC_PREFIXES = [
  '/public/', '/health', '/payments/webhook',
  '/openapi.json', '/docs', '/uploads/',
  '/sports', '/countries', '/languages', '/currencies',
  '/provinces', '/cities', '/banks', '/amenities',
  '/player-levels',
  '/auth/login', '/auth/register', '/auth/refresh',
  '/auth/logout', '/auth/check-uniqueness',
  '/auth/request-reactivation', '/auth/forgot-password',
  '/auth/reset-password',
];

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const url = request.url;
  // Skip authentication for public routes
  if (PUBLIC_PREFIXES.some(p => url.startsWith(p))) return;
  // /sports with query string
  if (url === '/sports' || url.startsWith('/sports?')) return;
  // /auth/me returns null user when unauthenticated (no 401)
  if (url === '/auth/me') {
    (request as any).userId = await resolveSessionUserId(request);
    return;
  }
  try {
    const userId = await resolveSessionUserId(request);
    if (!userId) {
      return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Missing or invalid token' });
    }
    (request as any).userId = userId;
  } catch {
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Authentication failed' });
  }
}
