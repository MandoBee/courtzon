import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './match-result.controller.js';
import * as sportCtrl from './sport-config.admin.controller.js';

export async function matchResultRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/matches/:id/result', { preHandler: [requirePermission(['matches.view'])] }, ctrl.getResultForMatchHandler);
  app.post('/matches/:id/result', { preHandler: [requirePermission(['matches.result.submit'])] }, ctrl.submitResultHandler);
  // Part 6/7 — editing/replacing a saved score is an admin/organisation action.
  // The submitting player cannot edit through the normal player UI; only
  // `matches.result.manage` holders (admin / org staff) may replace a saved score.
  app.put('/matches/:id/result', { preHandler: [requirePermission(['matches.result.manage'])] }, ctrl.replaceResultHandler);
  app.post('/matches/:id/result/withdraw', { preHandler: [requirePermission(['matches.result.submit'])] }, ctrl.withdrawResultHandler);
  app.post('/matches/:id/result/accept', { preHandler: [requirePermission(['matches.result.accept'])] }, ctrl.acceptResultHandler);
  app.post('/matches/:id/result/dispute', { preHandler: [requirePermission(['matches.result.dispute'])] }, ctrl.disputeResultHandler);

  app.get('/me/results', { preHandler: [requirePermission(['matches.view'])] }, ctrl.listMyResultsHandler);

  app.get('/sports/:sportId/formats', { preHandler: [requirePermission(['matches.view'])] }, ctrl.listSportRulesHandler);
  app.get('/sport-formats', { preHandler: [requirePermission(['matches.result.rules'])] }, ctrl.listFormatsHandler);

  // ── Phase A — Super Admin sport format / rule-set management ──────────────
  // Platform reference data: view keys are read-only, manage keys mutate.
  // Creating/replacing scoring is done by appending a new immutable version
  // (never editing one that history depends on).
  app.get('/admin/sport-formats', { preHandler: [requirePermission(['sports.formats.view'])] }, sportCtrl.listFormatsHandler);
  app.get('/admin/sport-formats/:id', { preHandler: [requirePermission(['sports.formats.view'])] }, sportCtrl.getFormatHandler);
  app.post('/admin/sports/:sportId/formats', { preHandler: [requirePermission(['sports.formats.manage'])] }, sportCtrl.createFormatHandler);
  app.put('/admin/sport-formats/:id', { preHandler: [requirePermission(['sports.formats.manage'])] }, sportCtrl.updateFormatHandler);
  app.delete('/admin/sport-formats/:id', { preHandler: [requirePermission(['sports.formats.manage'])] }, sportCtrl.deleteFormatHandler);
  app.get('/admin/sport-formats/:formatId/rule-sets', { preHandler: [requirePermission(['sports.rule-sets.view'])] }, sportCtrl.listRuleSetsHandler);
  app.get('/admin/sport-rule-sets/:id', { preHandler: [requirePermission(['sports.rule-sets.view'])] }, sportCtrl.getRuleSetHandler);
  app.post('/admin/sport-formats/:formatId/rule-sets', { preHandler: [requirePermission(['sports.rule-sets.manage'])] }, sportCtrl.createRuleSetHandler);
  app.put('/admin/sport-rule-sets/:id', { preHandler: [requirePermission(['sports.rule-sets.manage'])] }, sportCtrl.updateRuleSetHandler);
  app.post('/admin/sport-rule-sets/:id/activate', { preHandler: [requirePermission(['sports.rule-sets.manage'])] }, sportCtrl.activateRuleSetHandler);
  app.post('/admin/sport-rule-sets/:id/deactivate', { preHandler: [requirePermission(['sports.rule-sets.manage'])] }, sportCtrl.deactivateRuleSetHandler);

  app.get('/admin/match-results', { preHandler: [requirePermission(['matches.result.manage'])] }, ctrl.listAdminResultsHandler);
  app.post('/admin/match-results/:resultId/resolve', { preHandler: [requirePermission(['matches.result.manage'])] }, ctrl.resolveDisputeHandler);
  app.put('/admin/match-results/:resultId/correct', { preHandler: [requirePermission(['matches.result.manage'])] }, ctrl.correctResultHandler);
}