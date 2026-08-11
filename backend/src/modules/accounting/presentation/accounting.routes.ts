import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './accounting.controller.js';

export async function accountingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Dashboard
  app.get('/admin/accounting/dashboard', { preHandler: [requirePermission(['accounting.dashboard'])] }, ctrl.getDashboardHandler);

  // Chart of Accounts
  app.get('/admin/accounting/accounts', { preHandler: [requirePermission(['accounting.coa.view'])] }, ctrl.listAccountsHandler);
  app.post('/admin/accounting/accounts', { preHandler: [requirePermission(['accounting.coa.manage'])] }, ctrl.createAccountHandler);
  app.put('/admin/accounting/accounts/:id', { preHandler: [requirePermission(['accounting.coa.manage'])] }, ctrl.updateAccountHandler);

  // Accounting Periods
  app.get('/admin/accounting/periods', { preHandler: [requirePermission(['accounting.periods.view'])] }, ctrl.listPeriodsHandler);
  app.post('/admin/accounting/periods/generate', { preHandler: [requirePermission(['accounting.periods.manage'])] }, ctrl.generatePeriodsHandler);
  app.post('/admin/accounting/periods/:id/close', { preHandler: [requirePermission(['accounting.periods.manage'])] }, ctrl.closePeriodHandler);
  app.post('/admin/accounting/periods/:id/open', { preHandler: [requirePermission(['accounting.periods.manage'])] }, ctrl.openPeriodHandler);

  // General Ledger / Trial Balance / Reports
  app.get('/admin/accounting/trial-balance', { preHandler: [requirePermission(['accounting.gl.view'])] }, ctrl.getTrialBalanceHandler);
  app.get('/admin/accounting/income-statement', { preHandler: [requirePermission(['accounting.gl.view'])] }, ctrl.getIncomeStatementHandler);
  app.get('/admin/accounting/balance-sheet', { preHandler: [requirePermission(['accounting.gl.view'])] }, ctrl.getBalanceSheetHandler);
  app.get('/admin/accounting/ledger/:accountId', { preHandler: [requirePermission(['accounting.gl.view'])] }, ctrl.getAccountLedgerHandler);

  // Journal Entry
  app.post('/admin/accounting/journal', { preHandler: [requirePermission(['accounting.journal.create'])] }, ctrl.createJournalEntryHandler);
  app.get('/admin/accounting/journal', { preHandler: [requirePermission(['accounting.journal.view'])] }, ctrl.listJournalEntriesHandler);

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
}
