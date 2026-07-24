import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireRole, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './pricing.controller.js';

const superAdminGuard = requireRole(['super_admin', 'super-admin']);

export async function pricingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Price preview (authenticated)
  app.post('/pricing/preview', ctrl.previewPriceHandler);

  // Pricing rules CRUD (admin)
  app.get('/admin/pricing/rules', { preHandler: [superAdminGuard] }, ctrl.getRulesHandler);
  app.get('/admin/pricing/rules/:id', { preHandler: [superAdminGuard] }, ctrl.getRuleHandler);
  app.post('/admin/pricing/rules', { preHandler: [superAdminGuard] }, ctrl.createRuleHandler);
  app.put('/admin/pricing/rules/:id', { preHandler: [superAdminGuard] }, ctrl.updateRuleHandler);
  app.delete('/admin/pricing/rules/:id', { preHandler: [superAdminGuard] }, ctrl.deleteRuleHandler);

  // Season rules CRUD (admin)
  app.get('/admin/pricing/seasons', { preHandler: [superAdminGuard] }, ctrl.getSeasonsHandler);
  app.post('/admin/pricing/seasons', { preHandler: [superAdminGuard] }, ctrl.createSeasonHandler);
  app.delete('/admin/pricing/seasons/:id', { preHandler: [superAdminGuard] }, ctrl.deleteSeasonHandler);
}
