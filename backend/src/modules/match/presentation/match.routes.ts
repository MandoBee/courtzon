import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './match.controller.js';

export async function matchRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/matches', { preHandler: [requirePermission(['matches.view'])] }, ctrl.getMatchesHandler);
  app.get('/matches/:id', { preHandler: [requirePermission(['matches.view'])] }, ctrl.getMatchHandler);
  app.post('/matches/:id/join', { preHandler: [requirePermission(['matches.apply'])] }, ctrl.joinMatchHandler);
  app.post('/matches/:id/withdraw', { preHandler: [requirePermission(['matches.cancel'])] }, ctrl.withdrawJoinHandler);
  app.get('/matches/:id/applicants', { preHandler: [requirePermission(['matches.view'])] }, ctrl.getApplicantsHandler);
  app.post('/matches/:id/applicants/:requestId/approve', { preHandler: [requirePermission(['matches.manage'])] }, ctrl.approveApplicantHandler);
  app.post('/matches/:id/applicants/:requestId/reject', { preHandler: [requirePermission(['matches.manage'])] }, ctrl.rejectApplicantHandler);
  app.post('/matches/:id/close', { preHandler: [requirePermission(['matches.manage'])] }, ctrl.closeMatchHandler);
  app.post('/matches/:id/cancel', { preHandler: [requirePermission(['matches.manage'])] }, ctrl.cancelMatchHandler);
}
