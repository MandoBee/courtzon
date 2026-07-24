import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireRole } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './tournament.controller.js';

const adminGuard = requireRole(['super_admin', 'super-admin', 'org-admin']);

export async function tournamentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Player-facing (non-conflicting routes)
  app.post('/tournaments/register', ctrl.registerHandler);
  app.get('/tournaments/open', ctrl.getOpenTournamentsHandler);
  app.get('/tournaments/:id/bracket', ctrl.getBracketHandler);
  app.get('/tournaments/:id/standings', ctrl.getStandingsHandler);
  app.get('/tournaments/:id/participants', ctrl.getParticipantsHandler);
  app.get('/tournaments/elo', ctrl.getEloHandler);

  // Admin
  app.post('/admin/tournaments/score', { preHandler: [adminGuard] }, ctrl.updateScoreHandler);
  app.post('/admin/tournaments/:id/generate-bracket', { preHandler: [adminGuard] }, ctrl.generateBracketHandler);
  app.post('/admin/tournaments', { preHandler: [adminGuard] }, ctrl.createTournamentHandler);
  app.get('/admin/tournaments/:id', { preHandler: [adminGuard] }, ctrl.getTournamentHandler);
}
