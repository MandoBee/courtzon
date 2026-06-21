import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './financial-admin.controller.js';

export async function financialAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', requirePermission(['financial.view']));

  app.get('/admin/withdrawal-requests', ctrl.listWithdrawalRequestsHandler);
  app.get('/admin/withdrawal-requests/:id', ctrl.getWithdrawalRequestHandler);
  app.post('/admin/withdrawal-requests/approve', { preHandler: [requirePermission(['financial.process_payouts'])] }, ctrl.approveWithdrawalRequestHandler);
  app.post('/admin/withdrawal-requests/reject', { preHandler: [requirePermission(['financial.process_payouts'])] }, ctrl.rejectWithdrawalRequestHandler);
  app.post('/admin/withdrawal-requests/complete', { preHandler: [requirePermission(['financial.process_payouts'])] }, ctrl.completeWithdrawalRequestHandler);

  // Admin transaction listing
  app.get('/admin/transactions', ctrl.listTransactionsHandler);
  app.get('/admin/transactions/:id', ctrl.getTransactionHandler);
  app.get('/admin/organisations', ctrl.listOrganisationsHandler);
}
