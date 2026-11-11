import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * D4 follow-up — Financial Reports data endpoints.
 *
 * STRICT GLOBAL-role policy:
 *   • global super_admin (organisation_id NULL) → allow (no permission needed)
 *   • global finance-manager with `financial.reports.view` on the SAME role → allow
 *   • organization-scoped finance-manager clone → deny, even with permission
 *   • any other role → deny, even with permission
 *   • expired / inactive assignment or deleted role → deny
 *   • missing dependency or authorization error → fail closed (500)
 *
 * The authorization decision itself is unit-tested through
 * `evaluateFinancialReportsAccess` (below). The route tests verify wiring and
 * the HTTP status codes. The controller is mocked so no DB pool is created.
 */

const { ledgerCtrlMock } = vi.hoisted(() => ({
  ledgerCtrlMock: {
    getRevenueHandler: vi.fn(),
    getLedgerHandler: vi.fn(),
    getWalletSummaryHandler: vi.fn(),
    getEntryHandler: vi.fn(),
  },
}));

vi.mock('../presentation/ledger.controller.js', () => ledgerCtrlMock);

import {
  initAuthMiddleware,
  evaluateFinancialReportsAccess,
  type FinancialReportsRoleRow,
} from '../../../shared/middleware/auth.middleware.js';
import { ledgerRoutes } from '../presentation/ledger.routes.js';

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
  return reply;
}

async function invoke(route: CapturedRoute, userId?: number): Promise<number> {
  const reply = makeReply();
  for (const guard of route.preHandler) {
    await guard({ userId } as unknown, reply);
    if (reply.statusCode) return reply.statusCode;
  }
  return 0;
}

const checkRole = vi.fn(async (_userId: number, _roles: string[]) => false);
const checkPermission = vi.fn(async (_userId: number, _permissions: string[]) => false);
const checkFinancialReportsAccess = vi.fn(async (_userId: number) => false);

beforeAll(async () => {
  initAuthMiddleware({
    resolveUser: vi.fn(async () => 7),
    checkRole: checkRole as any,
    checkPermission: checkPermission as any,
    checkOrgApproved: vi.fn(async () => true),
    checkFinancialReportsAccess: checkFinancialReportsAccess as any,
  });
});

beforeEach(() => {
  checkRole.mockReset();
  checkPermission.mockReset();
  checkFinancialReportsAccess.mockReset();
  checkRole.mockResolvedValue(false);
  checkPermission.mockResolvedValue(false);
  checkFinancialReportsAccess.mockResolvedValue(false);
});

let routes: CapturedRoute[] = [];
beforeAll(async () => {
  const captured = captureApp();
  await ledgerRoutes(captured.app);
  routes = captured.routes;
});

const route = (path: string): CapturedRoute => {
  const found = routes.find((r) => r.path === path);
  if (!found) throw new Error(`Route not registered: ${path}`);
  return found;
};

const REPORT_ROUTES = [
  '/admin/financial/revenue',
  '/admin/financial/ledger',
  '/admin/financial/wallet-summary',
];

/**
 * Evaluator row factory. One row = one (role assignment, permission) pair.
 * Defaults describe a qualifying global finance-manager with the permission.
 */
const row = (overrides: Partial<FinancialReportsRoleRow> = {}): FinancialReportsRoleRow => ({
  role_slug: 'finance-manager',
  organisation_id: null,
  role_deleted: 0,
  assignment_active: 1,
  assignment_expired: 0,
  permission_key: 'financial.reports.view',
  ...overrides,
});

describe('evaluateFinancialReportsAccess — global role + same-role permission', () => {
  it('allows a global super_admin without the permission', () => {
    expect(evaluateFinancialReportsAccess([row({ role_slug: 'super_admin', permission_key: null })])).toBe(true);
    expect(evaluateFinancialReportsAccess([row({ role_slug: 'super-admin', permission_key: null })])).toBe(true);
  });

  it('allows a global finance-manager when the permission belongs to that role', () => {
    expect(evaluateFinancialReportsAccess([row()])).toBe(true);
  });

  it('denies a global finance-manager without the permission', () => {
    expect(evaluateFinancialReportsAccess([row({ permission_key: null })])).toBe(false);
  });

  it('denies an organization-scoped finance-manager clone even with the permission', () => {
    expect(evaluateFinancialReportsAccess([row({ organisation_id: 6 })])).toBe(false);
  });

  it('denies an organization-scoped super_admin clone', () => {
    expect(
      evaluateFinancialReportsAccess([row({ role_slug: 'super_admin', organisation_id: 6, permission_key: null })]),
    ).toBe(false);
  });

  it('denies another global role even with the permission', () => {
    expect(evaluateFinancialReportsAccess([row({ role_slug: 'accountant' })])).toBe(false);
    expect(evaluateFinancialReportsAccess([row({ role_slug: 'master-admin' })])).toBe(false);
  });

  it('denies a finance-manager whose permission comes only from another role', () => {
    expect(
      evaluateFinancialReportsAccess([
        row({ permission_key: null }), // global finance-manager, no permission
        row({ role_slug: 'accountant' }), // permission lives on a different role
      ]),
    ).toBe(false);
  });

  it('denies an expired finance-manager assignment', () => {
    expect(evaluateFinancialReportsAccess([row({ assignment_expired: 1 })])).toBe(false);
  });

  it('denies an inactive finance-manager assignment', () => {
    expect(evaluateFinancialReportsAccess([row({ assignment_active: 0 })])).toBe(false);
  });

  it('denies a deleted global finance-manager role', () => {
    expect(evaluateFinancialReportsAccess([row({ role_deleted: 1 })])).toBe(false);
  });

  it('fails closed for an undefined organisation_id', () => {
    expect(evaluateFinancialReportsAccess([row({ organisation_id: undefined })])).toBe(false);
  });

  it('fails closed for a null role_deleted flag', () => {
    expect(evaluateFinancialReportsAccess([row({ role_deleted: null })])).toBe(false);
  });

  it('fails closed for a null assignment_active flag', () => {
    expect(evaluateFinancialReportsAccess([row({ assignment_active: null })])).toBe(false);
  });

  it('fails closed for a null assignment_expired flag', () => {
    expect(evaluateFinancialReportsAccess([row({ assignment_expired: null })])).toBe(false);
  });

  it('fails closed for unexpected (non-canonical) flag values', () => {
    expect(evaluateFinancialReportsAccess([row({ role_deleted: '0' as any })])).toBe(false);
    expect(evaluateFinancialReportsAccess([row({ assignment_active: '1' as any })])).toBe(false);
    expect(evaluateFinancialReportsAccess([row({ assignment_expired: '0' as any })])).toBe(false);
  });

  it('denies an empty assignment set', () => {
    expect(evaluateFinancialReportsAccess([])).toBe(false);
  });
});

describe('Financial Reports data endpoints — route wiring', () => {
  it('registers exactly one dedicated guard per report route', () => {
    for (const path of REPORT_ROUTES) {
      expect(route(path).preHandler, path).toHaveLength(1);
    }
  });

  it('returns 401 when unauthenticated', async () => {
    for (const path of REPORT_ROUTES) {
      expect(await invoke(route(path), undefined), path).toBe(401);
    }
  });

  it('allows the request only when the dedicated authorization returns true', async () => {
    checkFinancialReportsAccess.mockResolvedValue(true);
    for (const path of REPORT_ROUTES) {
      expect(await invoke(route(path), 7), path).toBe(0);
    }
  });

  it('denies with 403 when the dedicated authorization returns false', async () => {
    for (const path of REPORT_ROUTES) {
      expect(await invoke(route(path), 7), path).toBe(403);
    }
  });

  it('fails closed with 500 when the authorization check throws', async () => {
    checkFinancialReportsAccess.mockRejectedValueOnce(new Error('authorization backend unavailable'));
    expect(await invoke(route('/admin/financial/revenue'), 7)).toBe(500);
  });

  it('entry drill-down stays super-admin only and never uses the reports authorization', async () => {
    const entryRoute = route('/admin/financial/entries/:sourceType/:sourceId');
    expect(entryRoute.preHandler).toHaveLength(1);

    // A user that passes the reports authorization is still denied here.
    checkFinancialReportsAccess.mockResolvedValue(true);
    expect(await invoke(entryRoute, 7)).toBe(403);
    expect(checkFinancialReportsAccess).not.toHaveBeenCalled();

    // super_admin role passes the platform guard.
    checkRole.mockResolvedValue(true);
    expect(await invoke(entryRoute, 7)).toBe(0);
  });
});
