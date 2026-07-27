import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './tournament.controller.js';

export async function tournamentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Admin routes ──

  app.get('/admin/tournaments/dashboard', { preHandler: [requirePermission(['tournament.dashboard.view'])] }, ctrl.getDashboardHandler);

  app.get('/admin/tournaments', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.listTournamentsHandler);
  app.post('/admin/tournaments', { preHandler: [requirePermission(['tournament.create'])] }, ctrl.createTournamentHandler);
  app.get('/admin/tournaments/:id', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getTournamentHandler);
  app.put('/admin/tournaments/:id', { preHandler: [requirePermission(['tournament.update'])] }, ctrl.updateTournamentHandler);

  app.post('/admin/tournaments/:id/publish', { preHandler: [requirePermission(['tournament.publish'])] }, ctrl.publishTournamentHandler);
  app.post('/admin/tournaments/:id/open-reg', { preHandler: [requirePermission(['tournament.update'])] }, ctrl.openRegistrationHandler);
  app.post('/admin/tournaments/:id/close-reg', { preHandler: [requirePermission(['tournament.update'])] }, ctrl.closeRegistrationHandler);
  app.post('/admin/tournaments/:id/start', { preHandler: [requirePermission(['tournament.update'])] }, ctrl.startTournamentHandler);
  app.post('/admin/tournaments/:id/complete', { preHandler: [requirePermission(['tournament.update'])] }, ctrl.completeTournamentHandler);
  app.post('/admin/tournaments/:id/cancel', { preHandler: [requirePermission(['tournament.update'])] }, ctrl.cancelTournamentHandler);
  app.post('/admin/tournaments/:id/archive', { preHandler: [requirePermission(['tournament.delete'])] }, ctrl.archiveTournamentHandler);

  app.post('/admin/tournaments/:id/register', { preHandler: [requirePermission(['tournament.register'])] }, ctrl.registerHandler);
  app.post('/admin/tournaments/registrations/:regId/cancel', { preHandler: [requirePermission(['tournament.register'])] }, ctrl.cancelRegistrationHandler);
  app.post('/admin/tournaments/registrations/:regId/confirm', { preHandler: [requirePermission(['tournament.register'])] }, ctrl.confirmRegistrationHandler);

  app.post('/admin/tournaments/:id/generate-groups', { preHandler: [requirePermission(['tournament.manage'])] }, ctrl.generateGroupsHandler);
  app.post('/admin/tournaments/:id/generate-fixtures', { preHandler: [requirePermission(['tournament.manage'])] }, ctrl.generateFixturesHandler);
  app.post('/admin/tournaments/:id/generate-bracket', { preHandler: [requirePermission(['tournament.manage'])] }, ctrl.generateBracketHandler);

  app.get('/admin/tournaments/:id/groups', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getGroupsHandler);
  app.get('/admin/tournaments/:id/matches', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getMatchesHandler);
  app.get('/admin/tournaments/:id/standings', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getStandingsHandler);

  app.put('/admin/tournaments/matches/:matchId/court', { preHandler: [requirePermission(['tournament.manage'])] }, ctrl.assignCourtHandler);
  app.put('/admin/tournaments/matches/:matchId/referee', { preHandler: [requirePermission(['tournament.manage'])] }, ctrl.assignRefereeHandler);
  app.post('/admin/tournaments/matches/:matchId/result', { preHandler: [requirePermission(['tournament.result.manage'])] }, ctrl.recordMatchResultHandler);

  // ── Public / Player-facing routes ──

  app.get('/tournaments', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.listTournamentsHandler);
  app.get('/tournaments/:id', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getTournamentHandler);
  app.get('/tournaments/:id/bracket', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getBracketHandler);
  app.get('/tournaments/:id/standings', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getStandingsHandler);
  app.get('/tournaments/:id/matches', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getMatchesHandler);
  app.get('/tournaments/:id/participants', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getParticipantsHandler);
  app.post('/tournaments/:id/register', { preHandler: [requirePermission(['tournament.register'])] }, ctrl.registerPlayerHandler);
}
