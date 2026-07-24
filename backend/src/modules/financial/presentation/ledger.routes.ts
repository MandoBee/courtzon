import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireRole } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './ledger.controller.js';

const superAdminGuard = requireRole(['super_admin', 'super-admin']);

export async function ledgerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/admin/financial/revenue', { preHandler: [superAdminGuard] }, ctrl.getRevenueHandler);
  app.get('/admin/financial/ledger', { preHandler: [superAdminGuard] }, ctrl.getLedgerHandler);
  app.get('/admin/financial/settlements', { preHandler: [superAdminGuard] }, ctrl.getSettlementsHandler);
  app.post('/admin/financial/settlements', { preHandler: [superAdminGuard] }, ctrl.createSettlementHandler);
  app.get('/admin/financial/entries/:sourceType/:sourceId', { preHandler: [superAdminGuard] }, ctrl.getEntryHandler);
}
