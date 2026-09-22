import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './tournament.controller.js';
import * as pdCtrl from './participant-draw.controller.js';

export async function tournamentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Group 6 — Participant lifecycle (admin) ──

  app.get('/admin/tournaments/:id/waitlist', { preHandler: [requirePermission(['tournament.view'])] }, pdCtrl.listWaitlistHandler);
  app.post('/admin/tournaments/:id/participants/:participantId/withdraw', { preHandler: [requirePermission(['tournament.manage'])] }, pdCtrl.withdrawParticipantHandler);
  app.post('/admin/tournaments/:id/waitlist/promote', { preHandler: [requirePermission(['tournament.manage'])] }, pdCtrl.promoteNextWaitlistedHandler);
  app.post('/admin/tournaments/:id/participants/:participantId/replace', { preHandler: [requirePermission(['tournament.manage'])] }, pdCtrl.replaceParticipantHandler);

  // ── Group 5 — Participants / Seeding / Draw foundation (admin) ──

  app.get('/admin/tournaments/:id/participants', { preHandler: [requirePermission(['tournament.view'])] }, pdCtrl.listParticipantsHandler);
  app.post('/admin/tournaments/:id/participants/:participantId/seed', { preHandler: [requirePermission(['tournament.manage'])] }, pdCtrl.assignSeedHandler);
  app.post('/admin/tournaments/:id/draw', { preHandler: [requirePermission(['tournament.manage'])] }, pdCtrl.generateDrawHandler);
  app.get('/admin/tournaments/:id/draw', { preHandler: [requirePermission(['tournament.view'])] }, pdCtrl.getCurrentDrawHandler);
  app.get('/admin/tournaments/:id/draws', { preHandler: [requirePermission(['tournament.view'])] }, pdCtrl.listDrawsHandler);
  app.get('/admin/tournaments/:id/draw/validate', { preHandler: [requirePermission(['tournament.view'])] }, pdCtrl.validateDrawHandler);
  app.post('/admin/tournaments/:id/draw/move', { preHandler: [requirePermission(['tournament.manage'])] }, pdCtrl.moveParticipantHandler);
  app.post('/admin/tournaments/:id/draw/approve', { preHandler: [requirePermission(['tournament.manage'])] }, pdCtrl.approveDrawHandler);
  app.post('/admin/tournaments/:id/draw/lock', { preHandler: [requirePermission(['tournament.manage'])] }, pdCtrl.lockDrawHandler);

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

  // Group 5A — MIXED tournament stages
  app.post('/admin/tournaments/:id/stages', { preHandler: [requirePermission(['tournament.manage'])] }, ctrl.createStageHandler);
  app.get('/admin/tournaments/:id/stages', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getStagesHandler);

  app.get('/admin/tournaments/:id/groups', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getGroupsHandler);
  app.get('/admin/tournaments/:id/matches', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getAdminMatchesHandler);
  app.get('/admin/tournaments/:id/standings', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getAdminStandingsHandler);
  app.get('/admin/tournaments/:id/registrations', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getRegistrationsHandler);

  app.put('/admin/tournaments/matches/:matchId/court', { preHandler: [requirePermission(['tournament.manage'])] }, ctrl.assignCourtHandler);
  app.put('/admin/tournaments/matches/:matchId/referee', { preHandler: [requirePermission(['tournament.manage'])] }, ctrl.assignRefereeHandler);
  // T-B — tournament matches are played through the SHARED Match Session lifecycle.
  app.post('/admin/tournaments/matches/:matchId/start', { preHandler: [requirePermission(['tournament.manage'])] }, ctrl.startTournamentMatchHandler);
  app.post('/admin/tournaments/matches/:matchId/complete', { preHandler: [requirePermission(['tournament.manage'])] }, ctrl.completeTournamentMatchHandler);
  app.post('/admin/tournaments/matches/:matchId/result', { preHandler: [requirePermission(['tournament.result.manage'])] }, ctrl.recordMatchResultHandler);

  // ── Group 5B-SR — Bracket type configuration (Super Admin) ──

  app.get('/admin/bracket-types', { preHandler: [requirePermission(['tournament.bracket-types.view'])] }, ctrl.listBracketTypesHandler);
  app.put('/admin/bracket-types/:id', { preHandler: [requirePermission(['tournament.bracket-types.manage'])] }, ctrl.updateBracketTypeHandler);

  // ── Public / Player-facing routes ──

  // Active bracket types for the create form (reference config, authenticated).
  app.get('/bracket-types', { preHandler: [authMiddleware] }, ctrl.listActiveBracketTypesHandler);

  // Sport → Match Format → Rule Set cascade for the create form.
  app.get('/tournaments/sports/:sportId/formats', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.listSportFormatsCascadeHandler);

  app.get('/tournaments', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.listTournamentsHandler);
  app.get('/tournaments/:id', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getTournamentHandler);
  app.get('/tournaments/:id/bracket', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getBracketHandler);
  app.get('/tournaments/:id/standings', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getStandingsHandler);
  app.get('/tournaments/:id/matches', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getMatchesHandler);
  app.get('/tournaments/:id/participants', { preHandler: [requirePermission(['tournament.view'])] }, ctrl.getParticipantsHandler);
  app.post('/tournaments/:id/register', { preHandler: [requirePermission(['tournament.register'])] }, ctrl.registerPlayerHandler);
}
