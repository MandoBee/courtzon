import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import {
  previewSettlementHandler, createSettlementHandler, getSettlementHandler,
  recordSettlementPaymentHandler, cancelSettlementHandler, listSettlementsHandler,
} from './unified-settlement.controller.js';

export async function unifiedSettlementRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/unified-settlements/preview', { preHandler: [requirePermission(['settlements.view'])] }, previewSettlementHandler);
  app.post('/unified-settlements', { preHandler: [requirePermission(['settlements.request'])] }, createSettlementHandler);
  app.get('/unified-settlements', { preHandler: [requirePermission(['settlements.view'])] }, listSettlementsHandler);
  app.get('/unified-settlements/:id', { preHandler: [requirePermission(['settlements.view'])] }, getSettlementHandler);
  app.post('/unified-settlements/:id/pay', { preHandler: [requirePermission(['settlements.pay'])] }, recordSettlementPaymentHandler);
  app.post('/unified-settlements/:id/cancel', { preHandler: [requirePermission(['settlements.cancel'])] }, cancelSettlementHandler);
}