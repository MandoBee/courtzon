import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './league.controller.js';

export async function leagueRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Dashboard ──
  app.get('/admin/leagues/dashboard', { preHandler: [requirePermission(['league.dashboard.view'])] }, ctrl.getDashboardHandler);

  // ── Seasons ──
  app.get('/admin/seasons', { preHandler: [requirePermission(['season.view'])] }, ctrl.listSeasonsHandler);
  app.post('/admin/seasons', { preHandler: [requirePermission(['season.create'])] }, ctrl.createSeasonHandler);
  app.get('/admin/seasons/:id', { preHandler: [requirePermission(['season.view'])] }, ctrl.getSeasonHandler);
  app.put('/admin/seasons/:id', { preHandler: [requirePermission(['season.update'])] }, ctrl.updateSeasonHandler);
  app.post('/admin/seasons/:id/publish', { preHandler: [requirePermission(['season.publish'])] }, ctrl.publishSeasonHandler);
  app.post('/admin/seasons/:id/archive', { preHandler: [requirePermission(['season.delete'])] }, ctrl.archiveSeasonHandler);

  // ── Leagues CRUD ──
  app.get('/admin/leagues', { preHandler: [requirePermission(['league.view'])] }, ctrl.listLeaguesHandler);
  app.post('/admin/leagues', { preHandler: [requirePermission(['league.create'])] }, ctrl.createLeagueHandler);
  app.get('/admin/leagues/:id', { preHandler: [requirePermission(['league.view'])] }, ctrl.getLeagueHandler);
  app.put('/admin/leagues/:id', { preHandler: [requirePermission(['league.update'])] }, ctrl.updateLeagueHandler);

  // ── League status transitions ──
  app.post('/admin/leagues/:id/publish', { preHandler: [requirePermission(['league.update'])] }, ctrl.publishLeagueHandler);
  app.post('/admin/leagues/:id/open-reg', { preHandler: [requirePermission(['league.manage'])] }, ctrl.openRegHandler);
  app.post('/admin/leagues/:id/close-reg', { preHandler: [requirePermission(['league.manage'])] }, ctrl.closeRegHandler);
  app.post('/admin/leagues/:id/start', { preHandler: [requirePermission(['league.manage'])] }, ctrl.startLeagueHandler);
  app.post('/admin/leagues/:id/complete', { preHandler: [requirePermission(['league.manage'])] }, ctrl.completeLeagueHandler);
  app.post('/admin/leagues/:id/cancel', { preHandler: [requirePermission(['league.manage'])] }, ctrl.cancelLeagueHandler);
  app.post('/admin/leagues/:id/archive', { preHandler: [requirePermission(['league.delete'])] }, ctrl.archiveLeagueHandler);

  // ── Divisions ──
  app.get('/admin/leagues/:id/divisions', { preHandler: [requirePermission(['league.view'])] }, ctrl.listDivisionsHandler);
  app.post('/admin/leagues/:id/divisions', { preHandler: [requirePermission(['league.manage'])] }, ctrl.createDivisionHandler);
  app.put('/admin/divisions/:id', { preHandler: [requirePermission(['league.manage'])] }, ctrl.updateDivisionHandler);
  app.post('/admin/divisions/:id/promote', { preHandler: [requirePermission(['league.manage'])] }, ctrl.promoteHandler);
  app.post('/admin/divisions/:id/relegate', { preHandler: [requirePermission(['league.manage'])] }, ctrl.relegateHandler);

  // ── Teams ──
  app.get('/admin/leagues/:id/teams', { preHandler: [requirePermission(['league.view'])] }, ctrl.listTeamsHandler);
  app.post('/admin/leagues/:id/register', { preHandler: [requirePermission(['league.manage'])] }, ctrl.registerTeamHandler);
  app.post('/admin/leagues/teams/:id/cancel', { preHandler: [requirePermission(['league.manage'])] }, ctrl.cancelTeamHandler);
  app.post('/admin/leagues/teams/:id/confirm', { preHandler: [requirePermission(['league.manage'])] }, ctrl.confirmTeamHandler);

  // ── Fixtures ──
  app.post('/admin/leagues/:id/generate-fixtures', { preHandler: [requirePermission(['league.manage'])] }, ctrl.generateFixturesHandler);
  app.get('/admin/leagues/:id/matches', { preHandler: [requirePermission(['league.view'])] }, ctrl.listMatchesHandler);
  app.put('/admin/leagues/matches/:id/court', { preHandler: [requirePermission(['league.manage'])] }, ctrl.assignCourtHandler);
  app.put('/admin/leagues/matches/:id/referee', { preHandler: [requirePermission(['league.manage'])] }, ctrl.assignRefereeHandler);
  app.post('/admin/leagues/matches/:id/result', { preHandler: [requirePermission(['league.result.manage'])] }, ctrl.recordResultHandler);

  // ── Standings ──
  app.get('/admin/leagues/:id/standings', { preHandler: [requirePermission(['league.view'])] }, ctrl.getStandingsHandler);
  app.post('/admin/leagues/:id/recalculate-standings', { preHandler: [requirePermission(['league.manage'])] }, ctrl.recalculateStandingsHandler);

  // ── Statistics ──
  app.get('/admin/leagues/:id/statistics', { preHandler: [requirePermission(['league.view'])] }, ctrl.getPlayerStatsHandler);
  app.post('/admin/leagues/:id/recalculate-stats', { preHandler: [requirePermission(['league.manage'])] }, ctrl.recalculateStatsHandler);

  // ── Player-facing League endpoints ──
  app.get('/leagues', { preHandler: [requirePermission(['league.view'])] }, ctrl.listLeaguesHandler);
  app.get('/leagues/:id', { preHandler: [requirePermission(['league.view'])] }, ctrl.getLeagueHandler);
  app.get('/leagues/:id/standings', { preHandler: [requirePermission(['league.view'])] }, ctrl.getStandingsHandler);
  app.get('/leagues/:id/teams', { preHandler: [requirePermission(['league.view'])] }, ctrl.listTeamsHandler);
  app.get('/my/leagues', { preHandler: [requirePermission(['league.view'])] }, ctrl.getMyLeaguesHandler);
  app.post('/leagues/:id/register', { preHandler: [requirePermission(['league.manage'])] }, ctrl.publicRegisterTeamHandler);
}
