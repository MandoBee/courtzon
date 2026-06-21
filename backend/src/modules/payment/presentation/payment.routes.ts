import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './payment.controller.js';

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  // Payment webhook — NO auth (called by gateway)
  app.post('/payments/webhook', ctrl.webhookHandler);

  // Authenticated payment endpoints
  app.post('/payments/charge', { preHandler: [authMiddleware] }, ctrl.chargeHandler);
  app.post('/payments/:id/refund', { preHandler: [authMiddleware, requirePermission(['financial.reconcile'])] }, ctrl.refundHandler);
  app.get('/payments/transactions', { preHandler: [authMiddleware] }, ctrl.getTransactionsHandler);
}
