import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * P1-03 + D4-A1 — Reports authorization regression suite.
 *
 * Contract under test:
 *   • GENERAL report endpoints (23) are gated by `reports.view`, with the
 *     explicit `super_admin` / `super-admin` role bypass (unchanged P1-03).
 *   • FINANCIAL report endpoints (5 — `/reports/financial/*`) are gated by the
 *     same authoritative guard the Finance module uses
 *     (`requireFinancialReportsAccess`), so `reports.view` alone MUST NOT grant
 *     access. Global `super_admin`, or a global `finance-manager` holding
 *     `financial.reports.view` on that same role, are the only allowed actors.
 *   • Both guards fail closed (401 / 403 / 500) and never fail open.
 *   • No route is gated on `reports.export` (export is frontend-only — there is
 *     no backend export endpoint).
 *
 * The financial dependency is wired to the REAL policy function
 * (`evaluateFinancialReportsAccess`) with synthetic role rows, so the role
 * matrix below exercises the production decision logic — not a hand-rolled
 * mock that could agree with a broken guard.
 *
 * The controller module is mocked on purpose: the real controller transitively
 * builds `reportsRepository = new ReportsRepository()`, whose constructor calls
 * `getPool()`. Mocking keeps this suite fully isolated — no database, no
 * external services, no MySQL pool creation.
 */
vi.mock('../presentation/reports.controller.js', () => {
  const handler = () => vi.fn(async (_req: unknown, reply: { send: (b: unknown) => unknown }) => reply.send({ data: [] }));
  return {
    financialSummary: handler(),
    revenueBySource: handler(),
    revenueTimeline: handler(),
    paymentMethods: handler(),
    settlements: handler(),
    bookingVolume: handler(),
    bookingsByType: handler(),
    bookingsBySport: handler(),
    peakHours: handler(),
    cancellationRate: handler(),
    userRegistrations: handler(),
    userDemographics: handler(),
    userGenderDist: handler(),
    activeUsers: handler(),
    userRoles: handler(),
    topOrgs: handler(),
    orgTypeDist: handler(),
    subscriptionStatus: handler(),
    marketplaceOverview: handler(),
    topProducts: handler(),
    orderStatusDist: handler(),
    tournamentOverview: handler(),
    tournamentParticipation: handler(),
    coachPerformance: handler(),
    adsPerformance: handler(),
    adsDailySpend: handler(),
    auditActivity: handler(),
    topAuditEntities: handler(),
  };
});

import {
  initAuthMiddleware,
  evaluateFinancialReportsAccess,
  type FinancialReportsRoleRow,
} from '../../../shared/middleware/auth.middleware.js';
import { reportsRoutes } from '../presentation/reports.routes.js';

/** D4-A1 — the five endpoints that expose global financial aggregates. */
const FINANCIAL_PATHS = [
  '/reports/financial/summary',
  '/reports/financial/by-source',
  '/reports/financial/timeline',
  '/reports/financial/payment-methods',
  '/reports/financial/settlements',
];

/** Every non-financial report endpoint keeps the `reports.view` policy. */
const GENERAL_PATHS = [
  '/reports/bookings/volume',
  '/reports/bookings/by-type',
  '/reports/bookings/by-sport',
  '/reports/bookings/peak-hours',
  '/reports/bookings/cancellation',
  '/reports/users/registrations',
  '/reports/users/demographics',
  '/reports/users/gender',
  '/reports/users/active',
  '/reports/users/roles',
  '/reports/organisations/top',
  '/reports/organisations/by-type',
  '/reports/organisations/subscriptions',
  '/reports/marketplace/overview',
  '/reports/marketplace/top-products',
  '/reports/marketplace/orders',
  '/reports/tournaments/overview',
  '/reports/tournaments/participation',
  '/reports/coaches/performance',
  '/reports/ads/performance',
  '/reports/ads/daily-spend',
  '/reports/audit/activity',
  '/reports/audit/top-entities',
];

const EXPECTED_PATHS = [...FINANCIAL_PATHS, ...GENERAL_PATHS];

const PLATFORM_ROLES = ['super_admin', 'super-admin'];

type CapturedRoute = { path: string; preHandler: Array<(req: FastifyRequest, reply: FastifyReply) => unknown> };
type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

/** Minimal Fastify stand-in that records registered hooks/routes without a server. */
function captureApp() {
  const routes: CapturedRoute[] = [];
  const hooks: Array<{ name: string; fn: unknown }> = [];
  const app: any = {
    addHook: (name: string, fn: unknown) => {
      hooks.push({ name, fn });
    },
    get: (path: string, opts: any) => {
      routes.push({ path, preHandler: (opts?.preHandler ?? []) as CapturedRoute['preHandler'] });
      return app;
    },
  };
  return { app, routes, hooks };
}

function makeReq(userId?: number): FastifyRequest {
  return { userId } as unknown as FastifyRequest;
}

function makeReply() {
  const reply: any = {};
  reply.status = vi.fn((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.send = vi.fn((body: unknown) => {
    reply.body = body;
    return reply;
  });
  return reply;
}

/** Canonical role row, as produced by the authorization SQL. */
function roleRow(overrides: Partial<FinancialReportsRoleRow> = {}): FinancialReportsRoleRow {
  return {
    role_slug: 'finance-manager',
    organisation_id: null,
    role_deleted: 0,
    assignment_active: 1,
    assignment_expired: 0,
    permission_key: 'financial.reports.view',
    ...overrides,
  };
}

let checkRoleMock: ReturnType<typeof vi.fn>;
let checkPermissionMock: ReturnType<typeof vi.fn>;
let checkFinancialReportsAccessMock: ReturnType<typeof vi.fn>;
let financialRows: FinancialReportsRoleRow[];

let routes: CapturedRoute[] = [];
let generalGuard: Guard;
let financialGuards: Guard[] = [];

beforeAll(async () => {
  checkRoleMock = vi.fn(async () => false);
  checkPermissionMock = vi.fn(async () => false);
  financialRows = [];

  // The DI boundary is mocked, but its implementation is the REAL policy, so
  // the role matrix below proves the production decision logic.
  checkFinancialReportsAccessMock = vi.fn(async () => evaluateFinancialReportsAccess(financialRows));

  // Same DI wiring as app.ts — mocks replace DB-backed deps (no DB access).
  initAuthMiddleware({
    resolveUser: vi.fn(async () => 7),
    checkRole: checkRoleMock as any,
    checkPermission: checkPermissionMock as any,
    checkFinancialReportsAccess: checkFinancialReportsAccessMock as any,
    checkOrgApproved: vi.fn(async () => false),
  });

  const captured = captureApp();
  await reportsRoutes(captured.app);
  routes = captured.routes;

  const routeFor = (path: string) => {
    const route = routes.find((candidate) => candidate.path === path);
    if (!route) throw new Error(`route ${path} is not registered`);
    return route;
  };

  generalGuard = routeFor(GENERAL_PATHS[0]).preHandler[0] as unknown as Guard;
  financialGuards = FINANCIAL_PATHS.map((path) => routeFor(path).preHandler[0] as unknown as Guard);
});

beforeEach(() => {
  checkRoleMock.mockReset();
  checkPermissionMock.mockReset();
  checkFinancialReportsAccessMock.mockClear();
  checkRoleMock.mockResolvedValue(false);
  checkPermissionMock.mockResolvedValue(false);
  financialRows = [];
});

describe('P1-03 — route registration & guard wiring', () => {
  it('1. registers exactly the 28 report read routes', () => {
    expect(routes).toHaveLength(28);
    expect(routes.map((r) => r.path).sort()).toEqual([...EXPECTED_PATHS].sort());
  });

  it('2. every route declares exactly one preHandler', () => {
    for (const route of routes) {
      expect(route.preHandler, route.path).toHaveLength(1);
    }
  });

  it('3. no route path is an export endpoint (export is frontend-only)', () => {
    expect(routes.some((r) => /export|download|csv|xlsx/i.test(r.path))).toBe(false);
  });

  it('4. D4-A1 — financial and general routes use two DIFFERENT guard instances', () => {
    const financialInstances = new Set(
      FINANCIAL_PATHS.map((path) => routes.find((r) => r.path === path)!.preHandler[0]),
    );
    const generalInstances = new Set(
      GENERAL_PATHS.map((path) => routes.find((r) => r.path === path)!.preHandler[0]),
    );
    expect(financialInstances.size).toBe(1);
    expect(generalInstances.size).toBe(1);
    const [financialOnly] = [...financialInstances];
    const [generalOnly] = [...generalInstances];
    expect(financialOnly).not.toBe(generalOnly);
    expect(financialOnly).toBe(financialGuards[0]);
    expect(generalOnly).toBe(generalGuard);
  });

  it('5. D4-A1 — no financial route is registered on the reports.view guard', () => {
    for (const path of FINANCIAL_PATHS) {
      const route = routes.find((r) => r.path === path)!;
      expect(route.preHandler[0], path).not.toBe(generalGuard);
    }
  });
});

describe('P1-03 — general reports policy (reports.view)', () => {
  it('A1. unauthenticated (no user id) → 401 before any permission lookup', async () => {
    const reply = makeReply();
    await generalGuard(makeReq(undefined), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(401);
    expect(checkPermissionMock).not.toHaveBeenCalled();
  });

  it('A2. authenticated without reports.view → 403', async () => {
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockResolvedValue(false);
    const reply = makeReply();
    await generalGuard(makeReq(7), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('A3. user holding reports.view → guard passes', async () => {
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockImplementation(async (_u: number, perms: string[]) => perms.includes('reports.view'));
    const reply = makeReply();
    const res = await generalGuard(makeReq(7), reply as unknown as FastifyReply);
    expect(res).toBeUndefined();
    expect(reply.status).not.toHaveBeenCalled();
    expect(checkPermissionMock).toHaveBeenCalledWith(7, ['reports.view']);
  });

  it('A4. revoked permission (previously granted, now denied) → 403', async () => {
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockImplementation(async (_u: number, perms: string[]) => perms.includes('reports.view'));

    const granted = makeReply();
    expect(await generalGuard(makeReq(7), granted as unknown as FastifyReply)).toBeUndefined();
    expect(granted.status).not.toHaveBeenCalled();

    // Permission revoked.
    checkPermissionMock.mockResolvedValue(false);
    const revoked = makeReply();
    await generalGuard(makeReq(7), revoked as unknown as FastifyReply);
    expect(revoked.status).toHaveBeenCalledWith(403);
  });

  it('A5. super_admin bypass: role check passes even without the permission', async () => {
    checkRoleMock.mockImplementation(async (_u: number, roles: string[]) => roles.includes('super_admin'));
    checkPermissionMock.mockResolvedValue(false);
    const reply = makeReply();
    const res = await generalGuard(makeReq(7), reply as unknown as FastifyReply);
    expect(res).toBeUndefined();
    expect(reply.status).not.toHaveBeenCalled();
    expect(checkRoleMock).toHaveBeenCalledWith(7, PLATFORM_ROLES);
  });

  it('A6. super-admin alias bypass: role check passes even without the permission', async () => {
    checkRoleMock.mockImplementation(async (_u: number, roles: string[]) => roles.includes('super-admin'));
    checkPermissionMock.mockResolvedValue(false);
    const reply = makeReply();
    expect(await generalGuard(makeReq(7), reply as unknown as FastifyReply)).toBeUndefined();
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('A7. permission-check error → 500 (fail closed)', async () => {
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockRejectedValue(new Error('permission backend unavailable'));
    const reply = makeReply();
    await generalGuard(makeReq(7), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(500);
  });

  it('A8. user holding only reports.export → 403 (export does not grant read access)', async () => {
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockImplementation(async (_u: number, perms: string[]) => perms.includes('reports.export'));
    const reply = makeReply();
    await generalGuard(makeReq(7), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('B1. every general route requests reports.view and never reports.export', async () => {
    const requested: string[][] = [];
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockImplementation(async (_u: number, perms: string[]) => {
      requested.push(perms);
      return false;
    });

    for (const path of GENERAL_PATHS) {
      const guard = routes.find((r) => r.path === path)!.preHandler[0] as unknown as Guard;
      await guard(makeReq(7), makeReply() as unknown as FastifyReply);
    }

    expect(requested).toHaveLength(GENERAL_PATHS.length);
    for (const perms of requested) {
      expect(perms).toContain('reports.view');
      expect(perms).not.toContain('reports.export');
    }
  });

  it('B2. every general route denies a user who lacks reports.view', async () => {
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockResolvedValue(false);
    for (const path of GENERAL_PATHS) {
      const guard = routes.find((r) => r.path === path)!.preHandler[0] as unknown as Guard;
      const reply = makeReply();
      await guard(makeReq(7), reply as unknown as FastifyReply);
      expect(reply.status, path).toHaveBeenCalledWith(403);
    }
  });

  it('B3. every general route allows a user who holds reports.view', async () => {
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockImplementation(async (_u: number, perms: string[]) => perms.includes('reports.view'));
    for (const path of GENERAL_PATHS) {
      const guard = routes.find((r) => r.path === path)!.preHandler[0] as unknown as Guard;
      const reply = makeReply();
      const res = await guard(makeReq(7), reply as unknown as FastifyReply);
      expect(res, path).toBeUndefined();
      expect(reply.status, path).not.toHaveBeenCalled();
    }
    // The financial dependency is never consulted by general routes.
    expect(checkFinancialReportsAccessMock).not.toHaveBeenCalled();
  });
});

describe('D4-A1 — financial report endpoints require the dedicated financial policy', () => {
  it('registers exactly five financial routes, all on the same dedicated guard', () => {
    expect(FINANCIAL_PATHS).toHaveLength(5);
    for (const path of FINANCIAL_PATHS) {
      const route = routes.find((r) => r.path === path);
      expect(route, path).toBeDefined();
      expect(route!.preHandler, path).toHaveLength(1);
      expect(route!.preHandler[0], path).toBe(financialGuards[0]);
    }
  });

  it.each(FINANCIAL_PATHS)('unauthenticated → 401 and no policy lookup (%s)', async (path) => {
    const guard = routes.find((r) => r.path === path)!.preHandler[0] as unknown as Guard;
    const reply = makeReply();
    await guard(makeReq(undefined), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(401);
    expect(checkFinancialReportsAccessMock).not.toHaveBeenCalled();
  });

  it('global super_admin is allowed', async () => {
    financialRows = [roleRow({ role_slug: 'super_admin', permission_key: null })];
    const reply = makeReply();
    expect(await financialGuards[0](makeReq(7), reply as unknown as FastifyReply)).toBeUndefined();
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('global super-admin alias is allowed', async () => {
    financialRows = [roleRow({ role_slug: 'super-admin', permission_key: null })];
    const reply = makeReply();
    expect(await financialGuards[0](makeReq(7), reply as unknown as FastifyReply)).toBeUndefined();
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('global finance-manager holding financial.reports.view is allowed', async () => {
    financialRows = [roleRow()];
    const reply = makeReply();
    expect(await financialGuards[0](makeReq(7), reply as unknown as FastifyReply)).toBeUndefined();
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('global finance-manager WITHOUT the permission → 403', async () => {
    financialRows = [roleRow({ permission_key: null })];
    const reply = makeReply();
    await financialGuards[0](makeReq(7), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it.each([
    ['accountant', 'global accountant'],
    ['auditor', 'global auditor'],
    ['master-admin', 'global master admin'],
    ['read-only-admin', 'global read-only admin'],
  ])('global %s is denied → 403', async (roleSlug) => {
    financialRows = [roleRow({ role_slug: roleSlug })];
    const reply = makeReply();
    await financialGuards[0](makeReq(7), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('organisation-scoped accountant clone is denied → 403', async () => {
    financialRows = [roleRow({ role_slug: 'accountant', organisation_id: 276002726 })];
    const reply = makeReply();
    await financialGuards[0](makeReq(7), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('organisation-scoped finance-manager clone is denied even with the permission → 403', async () => {
    financialRows = [roleRow({ organisation_id: 6 })];
    const reply = makeReply();
    await financialGuards[0](makeReq(7), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('reports.view ALONE does not grant financial access (no fallback path)', async () => {
    // The user holds reports.view — the general policy would pass — but the
    // financial policy has no qualifying role row.
    financialRows = [];
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockImplementation(async (_u: number, perms: string[]) => perms.includes('reports.view'));
    const reply = makeReply();
    await financialGuards[0](makeReq(7), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(403);
    // The generic permission check is never consulted by the financial guard.
    expect(checkPermissionMock).not.toHaveBeenCalled();
  });

  it.each(FINANCIAL_PATHS)('the denial policy is enforced on %s', async (path) => {
    financialRows = [roleRow({ role_slug: 'auditor' })];
    const guard = routes.find((r) => r.path === path)!.preHandler[0] as unknown as Guard;
    const reply = makeReply();
    await guard(makeReq(7), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('fails closed with 500 when the authorization check throws', async () => {
    checkFinancialReportsAccessMock.mockRejectedValueOnce(new Error('authorization backend unavailable'));
    const reply = makeReply();
    await financialGuards[0](makeReq(7), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(500);
  });

  // The "dependency not wired" fail-closed case lives in
  // `financial-reports.fail-closed.spec.ts` (separate module context), because
  // `initAuthMiddleware` may only be initialized once per process.
});
