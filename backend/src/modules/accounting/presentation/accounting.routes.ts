import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission, requireRole } from '../../../shared/middleware/auth.middleware.js';
import { requireOrgScopedPermission } from '../../../shared/middleware/route-guard.js';
import * as ctrl from './accounting.controller.js';
import * as tplCtrl from './template.controller.js';

export async function accountingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Organisation-scoped accounting (tenant-isolated; :orgId is authoritative) ──
  const orgAccountingView = requireOrgScopedPermission('org.accounting.view');
  const orgAccountingManage = requireOrgScopedPermission('org.accounting.manage');

  app.get('/org/:orgId/accounting/dashboard', { preHandler: [orgAccountingView] }, ctrl.orgDashboardHandler);
  app.get('/org/:orgId/accounting/coa', { preHandler: [orgAccountingView] }, ctrl.orgCoaHandler);
  app.get('/org/:orgId/accounting/records', { preHandler: [orgAccountingView] }, ctrl.orgAccountingRecordsHandler);
  app.get('/org/:orgId/accounting/trial-balance', { preHandler: [orgAccountingView] }, ctrl.orgTrialBalanceHandler);
  app.get('/org/:orgId/accounting/income-statement', { preHandler: [orgAccountingView] }, ctrl.orgIncomeStatementHandler);
  app.get('/org/:orgId/accounting/balance-sheet', { preHandler: [orgAccountingView] }, ctrl.orgBalanceSheetHandler);
  app.get('/org/:orgId/accounting/ledger/:accountId', { preHandler: [orgAccountingView] }, ctrl.orgAccountLedgerHandler);
  app.get('/org/:orgId/accounting/tax-summary', { preHandler: [orgAccountingView] }, ctrl.orgTaxSummaryHandler);
  app.put('/org/:orgId/accounting/coa/customizations/:accountId', { preHandler: [orgAccountingManage] }, ctrl.orgUpsertCustomizationHandler);
  app.delete('/org/:orgId/accounting/coa/customizations/:accountId', { preHandler: [orgAccountingManage] }, ctrl.orgResetCustomizationHandler);

  // ── Organisation-scoped Manual Journal ──
  // P1-1: Org users must NOT create arbitrary manual entries in CourtZon's
  // canonical general_ledger. The POST path is restricted to CourtZon platform
  // accounting roles (super_admin / super-admin). Organisation journal viewing
  // remains available to authorised org accounting users. CourtZon admins can
  // still post org-scoped journals through /admin/accounting/journal.
  const orgJournalView = requireOrgScopedPermission('org.accounting.journal.view');
  const orgJournalCreate = requireRole(['super_admin', 'super-admin']);
  app.get('/org/:orgId/accounting/journal', { preHandler: [orgJournalView] }, ctrl.orgJournalListHandler);
  app.post('/org/:orgId/accounting/journal', { preHandler: [orgJournalCreate] }, ctrl.orgJournalCreateHandler);

  // Dashboard
  app.get('/admin/accounting/dashboard', { preHandler: [requirePermission(['accounting.dashboard'])] }, ctrl.getDashboardHandler);

  // Chart of Accounts
  app.get('/admin/accounting/accounts', { preHandler: [requirePermission(['accounting.coa.view'])] }, ctrl.listAccountsHandler);
  app.post('/admin/accounting/accounts', { preHandler: [requirePermission(['accounting.coa.manage'])] }, ctrl.createAccountHandler);
  app.put('/admin/accounting/accounts/:id', { preHandler: [requirePermission(['accounting.coa.manage'])] }, ctrl.updateAccountHandler);

  // Organisation COA customization (per-org overlay on global default accounts)
  app.get('/admin/accounting/org-accounts', { preHandler: [requirePermission(['accounting.coa.view'])] }, ctrl.listOrgAccountsHandler);
  app.put('/admin/accounting/org-customizations/:accountId', { preHandler: [requirePermission(['accounting.coa.manage'])] }, ctrl.upsertOrgCustomizationHandler);
  app.delete('/admin/accounting/org-customizations/:accountId', { preHandler: [requirePermission(['accounting.coa.manage'])] }, ctrl.resetOrgCustomizationHandler);

  // Account Templates
  app.get('/admin/accounting/templates', { preHandler: [requirePermission(['accounting.templates.view'])] }, tplCtrl.listTemplatesHandler);
  app.get('/admin/accounting/templates/:id', { preHandler: [requirePermission(['accounting.templates.view'])] }, tplCtrl.getTemplateHandler);
  app.post('/admin/accounting/templates', { preHandler: [requirePermission(['accounting.templates.manage'])] }, tplCtrl.createTemplateHandler);
  app.put('/admin/accounting/templates/:id', { preHandler: [requirePermission(['accounting.templates.manage'])] }, tplCtrl.updateTemplateHandler);
  app.post('/admin/accounting/templates/:id/deactivate', { preHandler: [requirePermission(['accounting.templates.manage'])] }, tplCtrl.deactivateTemplateHandler);
  app.get('/admin/accounting/templates/preview', { preHandler: [requirePermission(['accounting.templates.view'])] }, tplCtrl.previewTemplateHandler);
  app.post('/admin/accounting/templates/apply', { preHandler: [requirePermission(['accounting.templates.manage'])] }, tplCtrl.applyTemplateHandler);

  // Accounting Periods
  app.get('/admin/accounting/periods', { preHandler: [requirePermission(['accounting.periods.view'])] }, ctrl.listPeriodsHandler);
  app.post('/admin/accounting/periods/generate', { preHandler: [requirePermission(['accounting.periods.manage'])] }, ctrl.generatePeriodsHandler);
  app.post('/admin/accounting/periods/:id/close', { preHandler: [requirePermission(['accounting.periods.manage'])] }, ctrl.closePeriodHandler);
  app.post('/admin/accounting/periods/:id/open', { preHandler: [requirePermission(['accounting.periods.manage'])] }, ctrl.openPeriodHandler);

  // Year Close
  app.get('/admin/accounting/year-close/preview', { preHandler: [requirePermission(['accounting.year-close.view'])] }, ctrl.yearClosePreviewHandler);
  app.post('/admin/accounting/year-close', { preHandler: [requirePermission(['accounting.year-close.manage'])] }, ctrl.yearCloseHandler);
  app.get('/admin/accounting/year-close/history', { preHandler: [requirePermission(['accounting.year-close.view'])] }, ctrl.yearCloseHistoryHandler);
  app.post('/admin/accounting/year-close/reopen', { preHandler: [requirePermission(['accounting.year-close.reopen'])] }, ctrl.yearCloseReopenHandler);

  // Tax Summary
  app.get('/admin/accounting/tax-summary', { preHandler: [requirePermission(['accounting.tax-report.view'])] }, ctrl.taxSummaryHandler);

  // General Ledger / Trial Balance / Reports
  app.get('/admin/accounting/trial-balance', { preHandler: [requirePermission(['accounting.gl.view'])] }, ctrl.getTrialBalanceHandler);
  app.get('/admin/accounting/income-statement', { preHandler: [requirePermission(['accounting.gl.view'])] }, ctrl.getIncomeStatementHandler);
  app.get('/admin/accounting/balance-sheet', { preHandler: [requirePermission(['accounting.gl.view'])] }, ctrl.getBalanceSheetHandler);
  app.get('/admin/accounting/ledger/:accountId', { preHandler: [requirePermission(['accounting.gl.view'])] }, ctrl.getAccountLedgerHandler);

  // Journal Entry
  app.post('/admin/accounting/journal', { preHandler: [requirePermission(['accounting.journal.create'])] }, ctrl.createJournalEntryHandler);
  app.get('/admin/accounting/journal', { preHandler: [requirePermission(['accounting.journal.view'])] }, ctrl.listJournalEntriesHandler);
  app.get('/admin/accounting/journal/export', { preHandler: [requirePermission(['accounting.journal.view'])] }, ctrl.exportJournalEntriesHandler);

  // Invoices
  app.get('/admin/accounting/invoices', { preHandler: [requirePermission(['accounting.invoices.view'])] }, ctrl.listInvoicesHandler);
  app.post('/admin/accounting/invoices', { preHandler: [requirePermission(['accounting.invoices.manage'])] }, ctrl.createInvoiceHandler);
  app.get('/admin/accounting/invoices/:id', { preHandler: [requirePermission(['accounting.invoices.view'])] }, ctrl.getInvoiceHandler);
  app.post('/admin/accounting/invoices/:id/issue', { preHandler: [requirePermission(['accounting.invoices.manage'])] }, ctrl.issueInvoiceHandler);
  app.post('/admin/accounting/invoices/:id/record-payment', { preHandler: [requirePermission(['accounting.invoices.manage'])] }, ctrl.recordInvoicePaymentHandler);
  app.post('/admin/accounting/invoices/:id/cancel', { preHandler: [requirePermission(['accounting.invoices.manage'])] }, ctrl.cancelInvoiceHandler);

  // Tax Rates
  app.get('/admin/accounting/tax-rates', { preHandler: [requirePermission(['accounting.tax.view'])] }, ctrl.listTaxRatesHandler);
  app.post('/admin/accounting/tax-rates', { preHandler: [requirePermission(['accounting.tax.manage'])] }, ctrl.createTaxRateHandler);
  app.put('/admin/accounting/tax-rates/:id', { preHandler: [requirePermission(['accounting.tax.manage'])] }, ctrl.updateTaxRateHandler);

  // Event-to-Journal processing
  app.post('/admin/accounting/process-events', { preHandler: [requirePermission(['accounting.journal.create'])] }, ctrl.processPendingEventsHandler);

  // Accounting Event Mappings (Decision #2)
  app.get('/admin/accounting/mappings', { preHandler: [requirePermission(['accounting.mappings.view'])] }, ctrl.listMappingsHandler);
  app.get('/admin/accounting/mappings/:eventType', { preHandler: [requirePermission(['accounting.mappings.view'])] }, ctrl.getMappingHandler);
  app.put('/admin/accounting/mappings/:eventType', { preHandler: [requirePermission(['accounting.mappings.manage'])] }, ctrl.updateMappingHandler);
  app.delete('/admin/accounting/mappings/:eventType', { preHandler: [requirePermission(['accounting.mappings.manage'])] }, ctrl.deleteMappingHandler);

  // ── Position Reconciliation (Phase 2 Step 1 — READ-ONLY, admin-only) ──
  // financial_entitlements (single position authority) vs GL control accounts.
  app.get('/admin/accounting/reconciliation', { preHandler: [requirePermission(['accounting.gl.view'])] }, ctrl.getPositionReconciliationListHandler);
  app.get('/admin/accounting/reconciliation/export', { preHandler: [requirePermission(['accounting.gl.view'])] }, ctrl.exportReconciliationHandler);
  app.get('/admin/accounting/reconciliation/organisations/:organisationId', { preHandler: [requirePermission(['accounting.gl.view'])] }, ctrl.getOrgPositionReconciliationHandler);
}
