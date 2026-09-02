import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
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
  app.get('/org/:orgId/accounting/journal-entries', { preHandler: [orgAccountingView] }, ctrl.orgJournalEntriesHandler);
  app.get('/org/:orgId/accounting/trial-balance', { preHandler: [orgAccountingView] }, ctrl.orgTrialBalanceHandler);
  app.get('/org/:orgId/accounting/income-statement', { preHandler: [orgAccountingView] }, ctrl.orgIncomeStatementHandler);
  app.get('/org/:orgId/accounting/balance-sheet', { preHandler: [orgAccountingView] }, ctrl.orgBalanceSheetHandler);
  app.get('/org/:orgId/accounting/ledger/:accountId', { preHandler: [orgAccountingView] }, ctrl.orgAccountLedgerHandler);
  app.get('/org/:orgId/accounting/tax-summary', { preHandler: [orgAccountingView] }, ctrl.orgTaxSummaryHandler);
  app.put('/org/:orgId/accounting/coa/customizations/:accountId', { preHandler: [orgAccountingManage] }, ctrl.orgUpsertCustomizationHandler);
  app.delete('/org/:orgId/accounting/coa/customizations/:accountId', { preHandler: [orgAccountingManage] }, ctrl.orgResetCustomizationHandler);

  // ── Organisation-scoped Manual Journal ──
  // The organisation manual journal reuses the CANONICAL journal-entry creation
  // (orgJournalCreateHandler -> createJournalEntryHandler). Authorised org
  // accounting users (org.accounting.journal.create) may post manual entries,
  // but ONLY for their own organisation: orgJournalCreateHandler forces the
  // :orgId route param as authoritative (a body-supplied organisationId is
  // ignored), restricts accounts to the org's postable/visible set, and
  // requires balanced entries. Platform admins and super admins retain access.
  const orgJournalView = requireOrgScopedPermission('org.accounting.journal.view');
  const orgJournalCreate = requireOrgScopedPermission('org.accounting.journal.create');
  app.get('/org/:orgId/accounting/journal', { preHandler: [orgJournalView] }, ctrl.orgJournalListHandler);
  app.post('/org/:orgId/accounting/journal', { preHandler: [orgJournalCreate] }, ctrl.orgJournalCreateHandler);

  // ── Organisation-scoped Accounting Periods & Year Close ──
  // Org admins manage their own periods and year-end closing through the SAME
  // canonical logic as Super Admin. scopedRequest injects the route :orgId as
  // the authoritative organisationId on every handler, so an organisation can
  // only ever list/generate/close/open ITS OWN periods and close/reopen ITS OWN
  // fiscal year. Platform (Super Admin) behaviour is unchanged.
  app.get('/org/:orgId/accounting/periods', { preHandler: [orgAccountingView] }, ctrl.orgListPeriodsHandler);
  app.post('/org/:orgId/accounting/periods/generate', { preHandler: [orgAccountingManage] }, ctrl.orgGeneratePeriodsHandler);
  app.post('/org/:orgId/accounting/periods/:id/close', { preHandler: [orgAccountingManage] }, ctrl.orgClosePeriodHandler);
  app.post('/org/:orgId/accounting/periods/:id/open', { preHandler: [orgAccountingManage] }, ctrl.orgOpenPeriodHandler);
  app.get('/org/:orgId/accounting/year-close/preview', { preHandler: [orgAccountingView] }, ctrl.orgYearClosePreviewHandler);
  app.post('/org/:orgId/accounting/year-close', { preHandler: [orgAccountingManage] }, ctrl.orgYearCloseHandler);
  app.get('/org/:orgId/accounting/year-close/history', { preHandler: [orgAccountingView] }, ctrl.orgYearCloseHistoryHandler);
  app.post('/org/:orgId/accounting/year-close/reopen', { preHandler: [orgAccountingManage] }, ctrl.orgYearCloseReopenHandler);

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
