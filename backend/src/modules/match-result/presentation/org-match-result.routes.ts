import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../../shared/middleware/auth.middleware.js';
import { requireOrgScopedPermission } from '../../../shared/middleware/route-guard.js';
import * as ctrl from './match-result.controller.js';

/**
 * Organisation portal score moderation. The list reads org-scoped rows via
 * `listForOrg` (bookings.organisation_id = :orgId); the action endpoints verify
 * tenant ownership of the result record before delegating to the SAME
 * authoritative match-result service the admin workbench uses.
 */
export async function orgMatchResultRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get(
    '/org/:orgId/match-results',
    { preHandler: [requireOrgScopedPermission('org.matches.results.view')] },
    ctrl.listOrgResultsHandler,
  );
  app.post(
    '/org/:orgId/match-results/:resultId/resolve',
    { preHandler: [requireOrgScopedPermission('matches.result.manage')] },
    ctrl.orgResolveDisputeHandler,
  );
  app.put(
    '/org/:orgId/match-results/:resultId/correct',
    { preHandler: [requireOrgScopedPermission('matches.result.manage')] },
    ctrl.orgCorrectResultHandler,
  );
}