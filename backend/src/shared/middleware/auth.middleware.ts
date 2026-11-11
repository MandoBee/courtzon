import type { FastifyRequest, FastifyReply } from 'fastify';

export interface AuthDeps {
  resolveUser: (request: FastifyRequest) => Promise<number | null>;
  checkRole: (userId: number, roles: string[]) => Promise<boolean>;
  checkPermission: (userId: number, permissions: string[]) => Promise<boolean>;
  checkOrgApproved: (userId: number) => Promise<boolean>;
  /**
   * Dedicated Financial Reports authorization (global roles only).
   * Optional so existing auth compositions keep compiling; the guard fails
   * closed (500) when it is not wired.
   */
  checkFinancialReportsAccess?: (userId: number) => Promise<boolean>;
}

let _deps: AuthDeps | null = null;

export function initAuthMiddleware(deps: AuthDeps): void {
  if (_deps) throw new Error('Auth middleware has already been initialized');
  _deps = deps;
}

function getDeps(): AuthDeps {
  if (!_deps) throw new Error('Auth middleware not initialized. Call initAuthMiddleware() in app.ts');
  return _deps;
}

export function requireRole(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
    try {
      const hasRole = await getDeps().checkRole(userId, roles);
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
      const hasPermission = await getDeps().checkPermission(userId, permissions);
      if (!hasPermission) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Insufficient permissions' });
      }
    } catch {
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Permission check failed' });
    }
  };
}

/** Role check for guards/handlers that need a boolean (e.g. platform-admin exemption). */
export async function userHasRole(userId: number, roles: string[]): Promise<boolean> {
  return getDeps().checkRole(userId, roles);
}

/** Pass if the user has any listed role OR any listed permission key. */
export function eitherRoleOrPermission(roles: string[], permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
    try {
      const deps = getDeps();
      if (await deps.checkRole(userId, roles)) return;
      if (await deps.checkPermission(userId, permissions)) return;
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Insufficient permissions' });
    } catch {
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Access check failed' });
    }
  };
}

/** Platform admin routes: super_admin role OR platform.admin permission. */
export const adminGuard = eitherRoleOrPermission(['super_admin', 'super-admin'], ['platform.admin']);

/** Permission that must be granted to the SAME global finance-manager role. */
export const FINANCIAL_REPORTS_PERMISSION = 'financial.reports.view';

const FINANCIAL_REPORTS_SUPER_ADMIN_ROLES = ['super_admin', 'super-admin'];

/**
 * One row per (role assignment, permission) produced by the dedicated
 * Financial Reports authorization query.
 *
 * The decision is taken here (not in a generic permission check) so the global
 * scope policy is unit-testable without a database:
 *   • global super_admin (organisation_id NULL) → allow
 *   • global finance-manager carrying FINANCIAL_REPORTS_PERMISSION on that
 *     exact role → allow
 *   • every other row (org-scoped clone, other role, expired/inactive/deleted
 *     assignment, permission held via another role) → deny
 */
export interface FinancialReportsRoleRow {
  role_slug: string;
  organisation_id: number | string | null | undefined;
  role_deleted: number | boolean | null | undefined;
  assignment_active: number | boolean | null | undefined;
  assignment_expired: number | boolean | null | undefined;
  permission_key: string | null | undefined;
}

/**
 * Fail-closed flag helpers. Only the exact values produced by the authorization
 * query are accepted: `false`/`0` for "not set" and `true`/`1` for "set".
 * Anything else (null, undefined, strings, other numbers) denies access.
 */
const isExplicitlyFalse = (value: number | boolean | null | undefined): boolean =>
  value === false || value === 0;

const isExplicitlyTrue = (value: number | boolean | null | undefined): boolean =>
  value === true || value === 1;

export function evaluateFinancialReportsAccess(rows: FinancialReportsRoleRow[]): boolean {
  const eligible = rows.filter(
    (row) =>
      row.organisation_id === null &&
      isExplicitlyFalse(row.role_deleted) &&
      isExplicitlyTrue(row.assignment_active) &&
      isExplicitlyFalse(row.assignment_expired),
  );

  if (eligible.some((row) => FINANCIAL_REPORTS_SUPER_ADMIN_ROLES.includes(row.role_slug))) {
    return true;
  }

  return eligible.some(
    (row) =>
      row.role_slug === 'finance-manager' &&
      row.permission_key === FINANCIAL_REPORTS_PERMISSION,
  );
}

/**
 * Financial Reports guard — strict global-role policy.
 *
 * Unlike `requireRole`, this cannot be satisfied by an organization-scoped role
 * clone, and unlike `requirePermission`, the permission must belong to the
 * qualifying global role itself. Fails closed when the dependency is missing or
 * throws.
 */
export function requireFinancialReportsAccess() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
    try {
      const check = getDeps().checkFinancialReportsAccess;
      if (!check) {
        return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Authorization check unavailable' });
      }
      const allowed = await check(userId);
      if (!allowed) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Insufficient permissions' });
      }
    } catch {
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Authorization check failed' });
    }
  };
}

export function requireApprovedOrg() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
    try {
      const approved = await getDeps().checkOrgApproved(userId);
      if (approved) return;
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
  return getDeps().resolveUser(request);
}

const PUBLIC_PREFIXES = [
  '/public/', '/health', '/metrics', '/payments/webhook',
  '/openapi.json', '/docs', '/uploads/',
  '/countries', '/languages', '/currencies',
  '/provinces', '/cities', '/banks', '/amenities',
  '/player-levels',
  '/auth/login', '/auth/register', '/auth/refresh',
  '/auth/logout', '/auth/check-uniqueness',
  '/auth/request-reactivation', '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/temporary-reset/verify', '/auth/temporary-reset',
];

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const url = request.url;
  // Skip authentication for public routes
  if (PUBLIC_PREFIXES.some(p => url.startsWith(p))) return;
  // Public sport routes only: list, marketplace list, single-sport detail (numeric id).
  // Admin sport endpoints (/sports/all, create/update/delete) must be authenticated.
  if (url === '/sports' || url.startsWith('/sports?') || url.startsWith('/sports/marketplace') || /^\/sports\/\d+$/.test(url)) return;
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
