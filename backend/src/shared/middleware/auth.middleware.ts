import type { FastifyRequest, FastifyReply } from 'fastify';

export interface AuthDeps {
  resolveUser: (request: FastifyRequest) => Promise<number | null>;
  checkRole: (userId: number, roles: string[]) => Promise<boolean>;
  checkPermission: (userId: number, permissions: string[]) => Promise<boolean>;
  checkOrgApproved: (userId: number) => Promise<boolean>;
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
  '/public/', '/health', '/payments/webhook',
  '/openapi.json', '/docs', '/uploads/',
  '/sports', '/countries', '/languages', '/currencies',
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
