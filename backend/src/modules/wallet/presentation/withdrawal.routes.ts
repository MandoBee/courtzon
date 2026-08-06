import type { FastifyInstance } from 'fastify';
import * as ctrl from './withdrawal.controller.js';
import { requirePermission } from '../../../shared/middleware/auth.middleware.js';

export async function withdrawalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/withdrawals/stats', { preHandler: [requirePermission(['financial.reconcile'])] }, ctrl.withdrawalStatsHandler);
  app.post('/withdrawals', { preHandler: [requirePermission(['financial.withdraw'])] }, ctrl.submitWithdrawalHandler);
  app.get('/withdrawals/me', ctrl.listMyWithdrawalsHandler);
  app.get('/withdrawals/me/:id', ctrl.getMyWithdrawalHandler);
  app.get('/admin/withdrawals', { preHandler: [requirePermission(['financial.reconcile'])] }, ctrl.adminListWithdrawalsHandler);
  app.get('/admin/withdrawals/:id', { preHandler: [requirePermission(['financial.reconcile'])] }, ctrl.adminGetWithdrawalHandler);
  app.put('/admin/withdrawals/:id/transition', { preHandler: [requirePermission(['financial.reconcile'])] }, ctrl.adminTransitionWithdrawalHandler);
}
