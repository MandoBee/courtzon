import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireRole, requireFinancialReportsAccess } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './ledger.controller.js';

const superAdminGuard = requireRole(['super_admin', 'super-admin']);

/**
 * Financial Reports data — STRICT global-role policy.
 *
 * Approved policy:
 *   • global `super_admin` / `super-admin`: allowed (role bypass).
 *   • global `finance-manager`: allowed ONLY when `financial.reports.view` is
 *     attached to that SAME global role.
 *   • organization-scoped `finance-manager` clones: denied even with the
 *     permission.
 *   • every other role: denied even with the permission.
 *
 * `requireFinancialReportsAccess` performs the whole decision (scope + role +
 * same-role permission) and fails closed. It deliberately does not use the
 * generic `checkRole` / `checkPermission` pair: those accept organization-scoped
 * role clones and permissions granted through any role.
 */
const financialReportsGuard = requireFinancialReportsAccess();

export async function ledgerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/admin/financial/revenue', { preHandler: [financialReportsGuard] }, ctrl.getRevenueHandler);
  app.get('/admin/financial/ledger', { preHandler: [financialReportsGuard] }, ctrl.getLedgerHandler);
  app.get('/admin/financial/wallet-summary', { preHandler: [financialReportsGuard] }, ctrl.getWalletSummaryHandler);
  // Entry drill-down stays super-admin only (not part of the reports screens).
  app.get('/admin/financial/entries/:sourceType/:sourceId', { preHandler: [superAdminGuard] }, ctrl.getEntryHandler);
}
