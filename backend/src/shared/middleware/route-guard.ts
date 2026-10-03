import type { FastifyRequest, FastifyReply } from 'fastify';

export interface RouteGuardDeps {
  checkOrgAccess: (userId: number, orgId: number) => Promise<boolean>;
  checkOrgManage: (userId: number, orgId: number) => Promise<boolean>;
  checkOrgPermission: (userId: number, orgId: number, permissionKey: string) => Promise<boolean>;
}

let _deps: RouteGuardDeps | null = null;

export function initRouteGuard(deps: RouteGuardDeps): void {
  if (_deps) throw new Error('Route guard has already been initialized');
  _deps = deps;
}

function getDeps(): RouteGuardDeps {
  if (!_deps) throw new Error('Route guard not initialized. Call initRouteGuard() in app.ts');
  return _deps;
}

export function requireOrganisationAccess(orgIdParam = 'orgId') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });

    const orgId = parseInt((request.params as any)[orgIdParam], 10);
    if (!orgId) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid organisation ID' });

    try {
      const allowed = await getDeps().checkOrgAccess(userId, orgId);
      if (!allowed) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access to this organisation denied' });
      }
    } catch {
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Access check failed' });
    }
  };
}

/**
 * Stricter org guard for elevated actions (staff & coach management).
 */
export function requireOrgManageAccess(orgIdParam = 'orgId') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });

    const orgId = parseInt((request.params as any)[orgIdParam], 10);
    if (!orgId) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid organisation ID' });

    try {
      const allowed = await getDeps().checkOrgManage(userId, orgId);
      if (!allowed) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Requires organisation owner or admin access' });
      }
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
      const allowed = await getDeps().checkOrgPermission(userId, orgId, permissionKey);
      if (!allowed) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Insufficient organisation permissions' });
      }
    } catch {
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Access check failed' });
    }
  };
}

/**
 * Direct org-scope check for guards/handlers that resolve the organisation from
 * a resource id instead of a path `:orgId` (e.g. the admin tournament
 * registration pipeline). Same semantics as `requireOrgScopedPermission`:
 * org owner, super_admin for any org, or an org-scope-granted holder of the
 * permission key.
 */
export async function hasOrgPermission(userId: number, orgId: number, permissionKey: string): Promise<boolean> {
  return getDeps().checkOrgPermission(userId, orgId, permissionKey);
}
