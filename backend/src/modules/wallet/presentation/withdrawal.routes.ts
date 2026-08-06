import type { FastifyInstance } from 'fastify';
import * as ctrl from './withdrawal.controller.js';
import { requirePermission, authMiddleware } from '../../../shared/middleware/auth.middleware.js';

export async function withdrawalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/withdrawals/stats', { preHandler: [requirePermission(['financial.reconcile'])] }, ctrl.withdrawalStatsHandler);
  app.post('/withdrawals', { preHandler: [requirePermission(['financial.withdraw'])] }, ctrl.submitWithdrawalHandler);
  app.get('/withdrawals/me', { preHandler: [authMiddleware] }, ctrl.listMyWithdrawalsHandler);
  app.get('/withdrawals/me/:id', { preHandler: [authMiddleware] }, ctrl.getMyWithdrawalHandler);
  app.get('/admin/withdrawals', { preHandler: [requirePermission(['financial.reconcile'])] }, ctrl.adminListWithdrawalsHandler);
  app.get('/admin/withdrawals/:id', { preHandler: [requirePermission(['financial.reconcile'])] }, ctrl.adminGetWithdrawalHandler);
  app.put('/admin/withdrawals/:id/transition', { preHandler: [requirePermission(['financial.reconcile'])] }, ctrl.adminTransitionWithdrawalHandler);
  app.put('/admin/withdrawals/:id/assign', { preHandler: [requirePermission(['financial.reconcile'])] }, ctrl.assignWithdrawalHandler);
  app.get('/admin/withdrawals/assignable-admins', { preHandler: [requirePermission(['financial.reconcile'])] }, ctrl.listAssignableAdminsHandler);
}
