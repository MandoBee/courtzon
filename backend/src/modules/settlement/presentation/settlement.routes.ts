import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './settlement.controller.js';

export async function settlementRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Request settlement (Super Admin, Org Admin, Shop Admin)
  app.post('/settlements/request', {
    preHandler: [requirePermission(['settlements.request'])]
  }, ctrl.requestSettlementHandler);

  // Approve (admin only)
  app.post('/settlements/:id/approve', {
    preHandler: [requirePermission(['settlements.approve'])]
  }, ctrl.approveSettlementHandler);

  // Mark as paid
  app.post('/settlements/:id/pay', {
    preHandler: [requirePermission(['settlements.pay'])]
  }, ctrl.markPaidHandler);

  // Complete
  app.post('/settlements/:id/complete', {
    preHandler: [requirePermission(['settlements.complete'])]
  }, ctrl.completeSettlementHandler);

  // Reject
  app.post('/settlements/:id/reject', {
    preHandler: [requirePermission(['settlements.reject'])]
  }, ctrl.rejectSettlementHandler);

  // Cancel
  app.post('/settlements/:id/cancel', {
    preHandler: [requirePermission(['settlements.cancel'])]
  }, ctrl.cancelSettlementHandler);

  // Get single settlement detail
  app.get('/settlements/:id', {
    preHandler: [requirePermission(['settlements.view'])]
  }, ctrl.getSettlementHandler);

  // List settlements (admin)
  app.get('/settlements', {
    preHandler: [requirePermission(['settlements.view'])]
  }, ctrl.getSettlementsHandler);

  // List settlements for an org (org portal)
  app.get('/settlements/organisation/:organisationId', ctrl.getOrgSettlementsHandler);
}
