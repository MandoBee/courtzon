import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../../shared/middleware/auth.middleware.js';
import { requireOrgScopedPermission } from '../../../shared/middleware/route-guard.js';
import * as ctrl from './org-tournament.controller.js';

/**
 * Organisation-scoped tournament API (read + management).
 *
 * Every route is guarded by `requireOrgScopedPermission`, which admits the
 * org owner, a platform admin, or an org-scoped holder of the permission key.
 * Read endpoints use `org.tournaments.view`; the lifecycle/management actions
 * use the corresponding granular org keys. Controllers additionally assert
 * row-level tenant ownership (`organisation_id = :orgId`) before delegating
 * to the SAME `tournamentService` the admin workbench uses — one shared
 * capability, tenant-scoped API, no duplicate business logic.
 */
export async function orgTournamentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get(
    '/org/:orgId/tournaments/bracket-types',
    { preHandler: [requireOrgScopedPermission('org.tournaments.view')] },
    ctrl.listActiveBracketTypesHandler,
  );
  app.get(
    '/org/:orgId/tournaments/commission-config',
    { preHandler: [requireOrgScopedPermission('org.tournaments.view')] },
    ctrl.getOrgCommissionConfigHandler,
  );
  app.get(
    '/org/:orgId/tournaments/sports/:sportId/formats',
    { preHandler: [requireOrgScopedPermission('org.tournaments.view')] },
    ctrl.listSportFormatsCascadeHandler,
  );

  // ── List / create (tenant-scoped) ──
  app.get(
    '/org/:orgId/tournaments',
    { preHandler: [requireOrgScopedPermission('org.tournaments.view')] },
    ctrl.listOrgTournamentsHandler,
  );
  app.post(
    '/org/:orgId/tournaments',
    { preHandler: [requireOrgScopedPermission('org.tournaments.create')] },
    ctrl.createOrgTournamentHandler,
  );
  app.get(
    '/org/:orgId/tournaments/:id',
    { preHandler: [requireOrgScopedPermission('org.tournaments.view')] },
    ctrl.getOrgTournamentHandler,
  );
  app.put(
    '/org/:orgId/tournaments/:id',
    { preHandler: [requireOrgScopedPermission('org.tournaments.update')] },
    ctrl.updateOrgTournamentHandler,
  );

  // ── Lifecycle ──
  app.post(
    '/org/:orgId/tournaments/:id/publish',
    { preHandler: [requireOrgScopedPermission('org.tournaments.publish')] },
    ctrl.publishOrgTournamentHandler,
  );
  app.post(
    '/org/:orgId/tournaments/:id/open-reg',
    { preHandler: [requireOrgScopedPermission('org.tournaments.update')] },
    ctrl.openOrgRegistrationHandler,
  );
  app.post(
    '/org/:orgId/tournaments/:id/close-reg',
    { preHandler: [requireOrgScopedPermission('org.tournaments.update')] },
    ctrl.closeOrgRegistrationHandler,
  );
  app.post(
    '/org/:orgId/tournaments/:id/start',
    { preHandler: [requireOrgScopedPermission('org.tournaments.update')] },
    ctrl.startOrgTournamentHandler,
  );
  app.post(
    '/org/:orgId/tournaments/:id/complete',
    { preHandler: [requireOrgScopedPermission('org.tournaments.update')] },
    ctrl.completeOrgTournamentHandler,
  );
  app.post(
    '/org/:orgId/tournaments/:id/cancel',
    { preHandler: [requireOrgScopedPermission('org.tournaments.update')] },
    ctrl.cancelOrgTournamentHandler,
  );
  app.post(
    '/org/:orgId/tournaments/:id/archive',
    { preHandler: [requireOrgScopedPermission('org.tournaments.delete')] },
    ctrl.archiveOrgTournamentHandler,
  );

  // ── Registrations ──
  app.get(
    '/org/:orgId/tournaments/:id/registrations',
    { preHandler: [requireOrgScopedPermission('org.tournaments.view')] },
    ctrl.getOrgRegistrationsHandler,
  );
  app.post(
    '/org/:orgId/tournaments/:id/register',
    { preHandler: [requireOrgScopedPermission('org.tournaments.register')] },
    ctrl.registerOrgPlayerHandler,
  );
  app.post(
    '/org/:orgId/tournaments/registrations/:regId/cancel',
    { preHandler: [requireOrgScopedPermission('org.tournaments.register')] },
    ctrl.cancelOrgRegistrationHandler,
  );
  app.post(
    '/org/:orgId/tournaments/registrations/:regId/confirm',
    { preHandler: [requireOrgScopedPermission('org.tournaments.register')] },
    ctrl.confirmOrgRegistrationHandler,
  );

  // ── Groups / fixtures / bracket / matches / standings / stages ──
  app.post(
    '/org/:orgId/tournaments/:id/generate-groups',
    { preHandler: [requireOrgScopedPermission('org.tournaments.manage')] },
    ctrl.generateOrgGroupsHandler,
  );
  app.post(
    '/org/:orgId/tournaments/:id/generate-fixtures',
    { preHandler: [requireOrgScopedPermission('org.tournaments.manage')] },
    ctrl.generateOrgFixturesHandler,
  );
  app.post(
    '/org/:orgId/tournaments/:id/generate-bracket',
    { preHandler: [requireOrgScopedPermission('org.tournaments.manage')] },
    ctrl.generateOrgBracketHandler,
  );
  app.get(
    '/org/:orgId/tournaments/:id/groups',
    { preHandler: [requireOrgScopedPermission('org.tournaments.view')] },
    ctrl.getOrgGroupsHandler,
  );
  app.get(
    '/org/:orgId/tournaments/:id/matches',
    { preHandler: [requireOrgScopedPermission('org.tournaments.view')] },
    ctrl.getOrgMatchesHandler,
  );
  app.get(
    '/org/:orgId/tournaments/:id/standings',
    { preHandler: [requireOrgScopedPermission('org.tournaments.view')] },
    ctrl.getOrgStandingsHandler,
  );
  app.get(
    '/org/:orgId/tournaments/:id/bracket',
    { preHandler: [requireOrgScopedPermission('org.tournaments.view')] },
    ctrl.getOrgBracketHandler,
  );
  app.post(
    '/org/:orgId/tournaments/:id/stages',
    { preHandler: [requireOrgScopedPermission('org.tournaments.manage')] },
    ctrl.createOrgStageHandler,
  );
  app.get(
    '/org/:orgId/tournaments/:id/stages',
    { preHandler: [requireOrgScopedPermission('org.tournaments.view')] },
    ctrl.getOrgStagesHandler,
  );

  // ── Match operations ──
  app.put(
    '/org/:orgId/tournaments/matches/:matchId/court',
    { preHandler: [requireOrgScopedPermission('org.tournaments.manage')] },
    ctrl.assignOrgCourtHandler,
  );
  app.put(
    '/org/:orgId/tournaments/matches/:matchId/referee',
    { preHandler: [requireOrgScopedPermission('org.tournaments.manage')] },
    ctrl.assignOrgRefereeHandler,
  );
  app.post(
    '/org/:orgId/tournaments/matches/:matchId/result',
    { preHandler: [requireOrgScopedPermission('org.tournaments.result.manage')] },
    ctrl.recordOrgMatchResultHandler,
  );
}