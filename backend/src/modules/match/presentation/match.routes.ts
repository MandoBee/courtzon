import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './match.controller.js';

export async function matchRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/matches', ctrl.getMatchesHandler);
  app.get('/matches/:id', ctrl.getMatchHandler);
  app.post('/matches/:id/join', ctrl.joinMatchHandler);
  app.post('/matches/:id/withdraw', ctrl.withdrawJoinHandler);
  app.get('/matches/:id/applicants', ctrl.getApplicantsHandler);
  app.post('/matches/:id/applicants/:requestId/approve', ctrl.approveApplicantHandler);
  app.post('/matches/:id/applicants/:requestId/reject', ctrl.rejectApplicantHandler);
  app.post('/matches/:id/close', ctrl.closeMatchHandler);
  app.post('/matches/:id/cancel', ctrl.cancelMatchHandler);
}
