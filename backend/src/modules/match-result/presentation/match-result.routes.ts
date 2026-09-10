import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './match-result.controller.js';

export async function matchResultRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/matches/:id/result', { preHandler: [requirePermission(['matches.view'])] }, ctrl.getResultForMatchHandler);
  app.post('/matches/:id/result', { preHandler: [requirePermission(['matches.result.submit'])] }, ctrl.submitResultHandler);
  app.put('/matches/:id/result', { preHandler: [requirePermission(['matches.result.submit'])] }, ctrl.replaceResultHandler);
  app.post('/matches/:id/result/withdraw', { preHandler: [requirePermission(['matches.result.submit'])] }, ctrl.withdrawResultHandler);
  app.post('/matches/:id/result/accept', { preHandler: [requirePermission(['matches.result.accept'])] }, ctrl.acceptResultHandler);
  app.post('/matches/:id/result/dispute', { preHandler: [requirePermission(['matches.result.dispute'])] }, ctrl.disputeResultHandler);

  app.get('/me/results', { preHandler: [requirePermission(['matches.view'])] }, ctrl.listMyResultsHandler);

  app.get('/sports/:sportId/formats', { preHandler: [requirePermission(['matches.view'])] }, ctrl.listSportRulesHandler);
  app.get('/sport-formats', { preHandler: [requirePermission(['matches.result.rules'])] }, ctrl.listFormatsHandler);
  app.post('/admin/sport-formats/:formatId/rule-sets', { preHandler: [requirePermission(['matches.result.rules.manage'])] }, ctrl.createRuleSetHandler);

  app.get('/admin/match-results', { preHandler: [requirePermission(['matches.result.manage'])] }, ctrl.listAdminResultsHandler);
  app.post('/admin/match-results/:resultId/resolve', { preHandler: [requirePermission(['matches.result.manage'])] }, ctrl.resolveDisputeHandler);
  app.put('/admin/match-results/:resultId/correct', { preHandler: [requirePermission(['matches.result.manage'])] }, ctrl.correctResultHandler);
}