import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * D4 Expanded — backend export route guards.
 *
 * Verifies the AND semantics of the sequential preHandlers:
 *   1. the existing view permission (unchanged),
 *   2. the dedicated export permission (with an explicit super_admin bypass).
 *
 * Controllers are mocked so this suite never creates a DB pool. The fake app
 * records route registration exactly like the reports RBAC suite.
 */

const { accountingCtrlMock, templateCtrlMock, settlementCtrlMock, translationsCtrlMock } = vi.hoisted(() => {
  const make = (names: string[]) => Object.fromEntries(names.map((n) => [n, vi.fn()]));
  return {
    accountingCtrlMock: make([
      'applyTemplateHandler', 'cancelInvoiceHandler', 'closePeriodHandler', 'createAccountHandler',
      'createInvoiceHandler', 'createJournalEntryHandler', 'createTaxRateHandler', 'createTemplateHandler',
      'deactivateTemplateHandler', 'deleteMappingHandler', 'exportJournalEntriesHandler',
      'exportReconciliationHandler', 'generatePeriodsHandler', 'getAccountLedgerHandler',
      'getBalanceSheetHandler', 'getDashboardHandler', 'getIncomeStatementHandler', 'getInvoiceHandler',
      'getMappingHandler', 'getOrgPositionReconciliationHandler', 'getPositionReconciliationListHandler',
      'getTemplateHandler', 'getTrialBalanceHandler', 'issueInvoiceHandler', 'listAccountsHandler',
      'listInvoicesHandler', 'listJournalEntriesHandler', 'listMappingsHandler', 'listOrgAccountsHandler',
      'listPeriodsHandler', 'listTaxRatesHandler', 'listTemplatesHandler', 'openPeriodHandler',
      'orgAccountLedgerHandler', 'orgBalanceSheetHandler', 'orgClosePeriodHandler', 'orgCoaHandler',
      'orgDashboardHandler', 'orgGeneratePeriodsHandler', 'orgIncomeStatementHandler',
      'orgJournalCreateHandler', 'orgJournalEntriesHandler', 'orgJournalListHandler',
      'orgListPeriodsHandler', 'orgOpenPeriodHandler', 'orgResetCustomizationHandler',
      'orgTaxSummaryHandler', 'orgTrialBalanceHandler', 'orgUpsertCustomizationHandler',
      'orgYearCloseHandler', 'orgYearCloseHistoryHandler', 'orgYearClosePreviewHandler',
      'orgYearCloseReopenHandler', 'previewTemplateHandler', 'processPendingEventsHandler',
      'recordInvoicePaymentHandler', 'resetOrgCustomizationHandler', 'taxSummaryHandler',
      'updateAccountHandler', 'updateMappingHandler', 'updateTaxRateHandler', 'updateTemplateHandler',
      'upsertOrgCustomizationHandler', 'yearCloseHandler', 'yearCloseHistoryHandler',
      'yearClosePreviewHandler', 'yearCloseReopenHandler',
    ]),
    templateCtrlMock: make([
      'applyTemplateHandler', 'createTemplateHandler', 'deactivateTemplateHandler', 'getTemplateHandler',
      'listTemplatesHandler', 'previewTemplateHandler', 'updateTemplateHandler',
    ]),
    settlementCtrlMock: make([
      'previewSettlementHandler', 'createSettlementHandler', 'getSettlementHandler',
      'recordSettlementPaymentHandler', 'cancelSettlementHandler', 'listSettlementsHandler',
      'exportSettlementsHandler',
    ]),
    translationsCtrlMock: make([
      'createLocalePackHandler', 'createTranslationHandler', 'deleteTranslationHandler',
      'exportTranslationsHandler', 'getLocalePackHandler', 'getPublicTranslationsHandler',
      'getTranslationHandler', 'listKeysHandler', 'listLocalesHandler',
      'listTranslationElementTypesHandler', 'listTranslationModulesHandler',
      'listTranslationsGridHandler', 'listTranslationsHandler', 'syncLocalePackHandler',
      'syncTranslationKeysHandler', 'updateTranslationHandler', 'upsertTranslationHandler',
    ]),
  };
});

vi.mock('../../accounting/presentation/accounting.controller.js', () => accountingCtrlMock);
vi.mock('../../accounting/presentation/template.controller.js', () => templateCtrlMock);
vi.mock('../../settlement/presentation/unified-settlement.controller.js', () => settlementCtrlMock);
vi.mock('../../translations/presentation/translations.controller.js', () => translationsCtrlMock);

import { initAuthMiddleware } from '../../../shared/middleware/auth.middleware.js';
import { accountingRoutes } from '../../accounting/presentation/accounting.routes.js';
import { unifiedSettlementRoutes } from '../../settlement/presentation/unified-settlement.routes.js';
import { translationsRoutes } from '../../translations/presentation/translations.routes.js';

type Guard = (req: unknown, reply: unknown) => unknown;
type CapturedRoute = { path: string; preHandler: Guard[] };

function captureApp() {
  const routes: CapturedRoute[] = [];
  const app: any = {
    addHook: () => undefined,
    get: (path: string, opts: any) => {
      routes.push({ path, preHandler: (opts?.preHandler ?? []) as Guard[] });
      return app;
    },
    post: () => app,
    put: () => app,
    delete: () => app,
  };
  return { app, routes };
}

function makeReply() {
  const reply: any = { statusCode: 0 };
  reply.status = vi.fn((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.send = vi.fn(() => reply);
  reply.header = vi.fn(() => reply);
  return reply;
}

/** Run the preHandler chain in order; stop as soon as a guard replies. */
async function invoke(route: CapturedRoute, userId: number): Promise<number> {
  const reply = makeReply();
  for (const guard of route.preHandler) {
    await guard({ userId } as unknown, reply);
    if (reply.statusCode) return reply.statusCode;
  }
  return 0;
}

const checkRole = vi.fn(async (_userId: number, _roles: string[]) => false);
const checkPermission = vi.fn(async (_userId: number, _permissions: string[]) => false);

beforeAll(async () => {
  initAuthMiddleware({
    resolveUser: vi.fn(async () => 7),
    checkRole: checkRole as any,
    checkPermission: checkPermission as any,
    checkOrgApproved: vi.fn(async () => true),
  });
});

beforeEach(() => {
  checkRole.mockReset();
  checkPermission.mockReset();
  checkRole.mockResolvedValue(false);
  checkPermission.mockResolvedValue(false);
});

let accounting: CapturedRoute[] = [];
let settlements: CapturedRoute[] = [];
let translations: CapturedRoute[] = [];

beforeAll(async () => {
  const a = captureApp();
  await accountingRoutes(a.app);
  accounting = a.routes;

  const s = captureApp();
  await unifiedSettlementRoutes(s.app);
  settlements = s.routes;

  const t = captureApp();
  await translationsRoutes(t.app);
  translations = t.routes;
});

function route(routes: CapturedRoute[], path: string): CapturedRoute {
  const found = routes.find((r) => r.path === path);
  if (!found) throw new Error(`Route not registered: ${path}`);
  return found;
}

const grant = (keys: string[]) => {
  checkPermission.mockImplementation(async (_u: number, perms: string[]) => perms.some((p) => keys.includes(p)));
};

describe('D4 Expanded — accounting export routes', () => {
  const journal = () => route(accounting, '/admin/accounting/journal/export');
  const reconciliation = () => route(accounting, '/admin/accounting/reconciliation/export');

  it('registers exactly two sequential guards (view + export) per export route', () => {
    expect(journal().preHandler).toHaveLength(2);
    expect(reconciliation().preHandler).toHaveLength(2);
  });

  it('journal export: no permissions → 403', async () => {
    expect(await invoke(journal(), 7)).toBe(403);
  });

  it('journal export: view only → 403', async () => {
    grant(['accounting.journal.view']);
    expect(await invoke(journal(), 7)).toBe(403);
  });

  it('journal export: export only → 403 (view is still required)', async () => {
    grant(['accounting.export']);
    expect(await invoke(journal(), 7)).toBe(403);
  });

  it('journal export: view + export → allowed', async () => {
    grant(['accounting.journal.view', 'accounting.export']);
    expect(await invoke(journal(), 7)).toBe(0);
  });

  it('journal export: super_admin passes the export guard without the export row', async () => {
    grant(['accounting.journal.view']);
    checkRole.mockImplementation(async (_u: number, roles: string[]) => roles.includes('super_admin'));
    expect(await invoke(journal(), 7)).toBe(0);
  });

  it('journal export: super_admin without the view permission is still denied', async () => {
    checkRole.mockImplementation(async (_u: number, roles: string[]) => roles.includes('super_admin'));
    expect(await invoke(journal(), 7)).toBe(403);
  });

  it('reconciliation export: view only → 403; view + export → allowed', async () => {
    grant(['accounting.gl.view']);
    expect(await invoke(reconciliation(), 7)).toBe(403);
    grant(['accounting.gl.view', 'accounting.export']);
    expect(await invoke(reconciliation(), 7)).toBe(0);
  });

  it('a non-super-admin role cannot bypass the export permission', async () => {
    grant(['accounting.gl.view']);
    checkRole.mockImplementation(async (_u: number, roles: string[]) => roles.includes('finance-manager'));
    expect(await invoke(reconciliation(), 7)).toBe(403);
  });
});

describe('D4 Expanded — settlements export route', () => {
  const exportRoute = () => route(settlements, '/unified-settlements/export');

  it('registers two sequential guards (view + export)', () => {
    expect(exportRoute().preHandler).toHaveLength(2);
  });

  it('no permissions → 403', async () => {
    expect(await invoke(exportRoute(), 7)).toBe(403);
  });

  it('settlements.view only → 403 (export is a separate grant)', async () => {
    grant(['settlements.view']);
    expect(await invoke(exportRoute(), 7)).toBe(403);
  });

  it('settlements.export only → 403 (view is still required)', async () => {
    grant(['settlements.export']);
    expect(await invoke(exportRoute(), 7)).toBe(403);
  });

  it('settlements.view + settlements.export → allowed', async () => {
    grant(['settlements.view', 'settlements.export']);
    expect(await invoke(exportRoute(), 7)).toBe(0);
  });

  it('super_admin passes the export guard without the export row', async () => {
    grant(['settlements.view']);
    checkRole.mockImplementation(async (_u: number, roles: string[]) => roles.includes('super_admin'));
    expect(await invoke(exportRoute(), 7)).toBe(0);
  });

  it('operations-manager (no export grant) is denied', async () => {
    grant(['settlements.view']);
    checkRole.mockImplementation(async (_u: number, roles: string[]) => roles.includes('operations-manager'));
    expect(await invoke(exportRoute(), 7)).toBe(403);
  });

  it('tenant isolation code path is preserved in the controller', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const controller = readFileSync(
      resolve(here, '../../../../../backend/src/modules/settlement/presentation/unified-settlement.controller.ts'),
      'utf8',
    );
    expect(controller).toContain('async function exportSettlementsHandler');
    expect(controller).toContain('resolveOrgScope(userId, query.orgId)');
  });
});

describe('D4 Expanded — translations export route', () => {
  const exportRoute = () => route(translations, '/translations/export');

  it('no permissions → 403', async () => {
    expect(await invoke(exportRoute(), 7)).toBe(403);
  });

  it('translations.export → allowed', async () => {
    grant(['translations.export']);
    expect(await invoke(exportRoute(), 7)).toBe(0);
  });

  it('super_admin passes without the permission row', async () => {
    checkRole.mockImplementation(async (_u: number, roles: string[]) => roles.includes('super_admin'));
    expect(await invoke(exportRoute(), 7)).toBe(0);
  });

  it('a non-super-admin role cannot bypass via unrelated permissions', async () => {
    grant(['translations.view', 'platform.admin']);
    expect(await invoke(exportRoute(), 7)).toBe(403);
  });
});
