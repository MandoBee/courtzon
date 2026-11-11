import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission, eitherRoleOrPermission } from '../../../shared/middleware/auth.middleware.js';
import {
  previewSettlementHandler, createSettlementHandler, getSettlementHandler,
  recordSettlementPaymentHandler, cancelSettlementHandler, listSettlementsHandler,
  exportSettlementsHandler,
} from './unified-settlement.controller.js';

export async function unifiedSettlementRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/unified-settlements/preview', { preHandler: [requirePermission(['settlements.view'])] }, previewSettlementHandler);
  app.post('/unified-settlements', { preHandler: [requirePermission(['settlements.request'])] }, createSettlementHandler);
  app.get('/unified-settlements', { preHandler: [requirePermission(['settlements.view'])] }, listSettlementsHandler);
  // D4 Expanded — export requires BOTH settlements.view (screen/tenant scope)
  // and settlements.export (dedicated egress). Sequential preHandlers give AND
  // semantics; super_admin passes the export guard without new DB rows.
  app.get('/unified-settlements/export', {
    preHandler: [
      requirePermission(['settlements.view']),
      eitherRoleOrPermission(['super_admin', 'super-admin'], ['settlements.export']),
    ],
  }, exportSettlementsHandler);
  app.get('/unified-settlements/:id', { preHandler: [requirePermission(['settlements.view'])] }, getSettlementHandler);
  app.post('/unified-settlements/:id/pay', { preHandler: [requirePermission(['settlements.pay'])] }, recordSettlementPaymentHandler);
  app.post('/unified-settlements/:id/cancel', { preHandler: [requirePermission(['settlements.cancel'])] }, cancelSettlementHandler);
}