import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../../shared/middleware/auth.middleware.js';
import { requireOrgScopedPermission } from '../../../shared/middleware/route-guard.js';
import * as ctrl from './match.controller.js';

/**
 * Organisation-scoped match monitoring. Tenant isolation is enforced twice:
 * the `requireOrgScopedPermission('org.matches.view')` guard checks the actor's
 * organisation role-scope, and the controller SQL filters every row on
 * bookings.organisation_id = :orgId so no cross-tenant data can ever leak.
 */
export async function orgMatchRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get(
    '/org/:orgId/matches',
    { preHandler: [requireOrgScopedPermission('org.matches.view')] },
    ctrl.getOrgMatchesHandler,
  );
  app.get(
    '/org/:orgId/matches/:matchId',
    { preHandler: [requireOrgScopedPermission('org.matches.view')] },
    ctrl.getOrgMatchHandler,
  );
}