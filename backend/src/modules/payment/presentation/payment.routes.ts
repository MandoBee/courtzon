import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './payment.controller.js';

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  // Payment webhook — NO auth (called by gateway)
  app.post('/payments/webhook', ctrl.webhookHandler);

  // Authenticated payment endpoints
  app.post('/payments/charge', { preHandler: [authMiddleware] }, ctrl.chargeHandler);
  app.post('/payments/confirm', { preHandler: [authMiddleware] }, ctrl.confirmPaymentHandler);
  app.get('/payments/status/:id', { preHandler: [authMiddleware] }, ctrl.getPaymentStatusHandler);
  app.post('/payments/:id/refund', { preHandler: [authMiddleware, requirePermission(['financial.reconcile'])] }, ctrl.refundHandler);
  app.get('/payments/transactions', { preHandler: [authMiddleware] }, ctrl.getTransactionsHandler);

  // Admin: payment sync, expiry, and manual recovery (scheduled jobs)
  app.post('/payments/sync', { preHandler: [authMiddleware, requirePermission(['financial.reconcile'])] }, ctrl.syncHandler);
  app.post('/payments/expire', { preHandler: [authMiddleware, requirePermission(['financial.reconcile'])] }, ctrl.expireHandler);
  app.post('/payments/recover/:gatewayReference', { preHandler: [authMiddleware, requirePermission(['financial.reconcile'])] }, ctrl.recoverHandler);

  // Admin: payment health monitoring
  app.get('/payments/health', { preHandler: [authMiddleware, requirePermission(['financial.reconcile'])] }, ctrl.healthHandler);

  // Admin: reconciliation
  app.post('/payments/reconciliation/run', { preHandler: [authMiddleware, requirePermission(['financial.reconcile'])] }, ctrl.reconciliationRunHandler);
  app.get('/payments/reconciliation/history', { preHandler: [authMiddleware, requirePermission(['financial.reconcile'])] }, ctrl.reconciliationHistoryHandler);

  // Production readiness gate
  app.get('/payments/production-readiness', { preHandler: [authMiddleware, requirePermission(['financial.reconcile'])] }, ctrl.productionReadinessHandler);
}
