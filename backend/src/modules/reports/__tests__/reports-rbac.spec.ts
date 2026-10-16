import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * P1-03 — Reports authorization regression suite.
 *
 * Contract under test:
 *   • all 28 report read endpoints are gated by `reports.view`;
 *   • the guard fails closed (401 / 403 / 500) and never fails open;
 *   • the `super_admin` / `super-admin` role bypass is preserved;
 *   • no route is gated on `reports.export` (export is frontend-only — there is
 *     no backend export endpoint).
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

import { initAuthMiddleware } from '../../../shared/middleware/auth.middleware.js';
import { reportsRoutes } from '../presentation/reports.routes.js';

const EXPECTED_PATHS = [
  '/reports/financial/summary',
  '/reports/financial/by-source',
  '/reports/financial/timeline',
  '/reports/financial/payment-methods',
  '/reports/financial/settlements',
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

let checkRoleMock: ReturnType<typeof vi.fn>;
let checkPermissionMock: ReturnType<typeof vi.fn>;

let routes: CapturedRoute[] = [];
let guard: Guard;

beforeAll(async () => {
  checkRoleMock = vi.fn(async () => false);
  checkPermissionMock = vi.fn(async () => false);

  // Same DI wiring as app.ts — mocks replace DB-backed deps (no DB access).
  initAuthMiddleware({
    resolveUser: vi.fn(async () => 7),
    checkRole: checkRoleMock as any,
    checkPermission: checkPermissionMock as any,
    checkOrgApproved: vi.fn(async () => false),
  });

  const captured = captureApp();
  await reportsRoutes(captured.app);
  routes = captured.routes;
  guard = routes[0].preHandler[0] as unknown as Guard;
});

beforeEach(() => {
  checkRoleMock.mockReset();
  checkPermissionMock.mockReset();
  checkRoleMock.mockResolvedValue(false);
  checkPermissionMock.mockResolvedValue(false);
});

describe('P1-03 — route registration & guard wiring', () => {
  it('1. registers exactly the 28 report read routes', () => {
    expect(routes).toHaveLength(28);
    expect(routes.map((r) => r.path).sort()).toEqual([...EXPECTED_PATHS].sort());
  });

  it('2. every route declares exactly one preHandler and they are all the same guard instance', () => {
    for (const route of routes) {
      expect(route.preHandler).toHaveLength(1);
      expect(route.preHandler[0]).toBe(guard);
    }
  });

  it('3. no route path is an export endpoint (export is frontend-only)', () => {
    expect(routes.some((r) => /export|download|csv|xlsx/i.test(r.path))).toBe(false);
  });
});

describe('P1-03 — guard authorization behavior', () => {
  it('A1. unauthenticated (no user id) → 401 before any permission lookup', async () => {
    const reply = makeReply();
    await guard(makeReq(undefined), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(401);
    expect(checkPermissionMock).not.toHaveBeenCalled();
  });

  it('A2. authenticated without reports.view → 403', async () => {
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockResolvedValue(false);
    const reply = makeReply();
    await guard(makeReq(7), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('A3. user holding reports.view → guard passes', async () => {
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockImplementation(async (_u: number, perms: string[]) => perms.includes('reports.view'));
    const reply = makeReply();
    const res = await guard(makeReq(7), reply as unknown as FastifyReply);
    expect(res).toBeUndefined();
    expect(reply.status).not.toHaveBeenCalled();
    expect(checkPermissionMock).toHaveBeenCalledWith(7, ['reports.view']);
  });

  it('A4. revoked permission (previously granted, now denied) → 403', async () => {
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockImplementation(async (_u: number, perms: string[]) => perms.includes('reports.view'));

    const granted = makeReply();
    expect(await guard(makeReq(7), granted as unknown as FastifyReply)).toBeUndefined();
    expect(granted.status).not.toHaveBeenCalled();

    // Permission revoked.
    checkPermissionMock.mockResolvedValue(false);
    const revoked = makeReply();
    await guard(makeReq(7), revoked as unknown as FastifyReply);
    expect(revoked.status).toHaveBeenCalledWith(403);
  });

  it('A5. super_admin bypass: role check passes even without the permission', async () => {
    checkRoleMock.mockImplementation(async (_u: number, roles: string[]) => roles.includes('super_admin'));
    checkPermissionMock.mockResolvedValue(false);
    const reply = makeReply();
    const res = await guard(makeReq(7), reply as unknown as FastifyReply);
    expect(res).toBeUndefined();
    expect(reply.status).not.toHaveBeenCalled();
    expect(checkRoleMock).toHaveBeenCalledWith(7, PLATFORM_ROLES);
  });

  it('A6. super-admin alias bypass: role check passes even without the permission', async () => {
    checkRoleMock.mockImplementation(async (_u: number, roles: string[]) => roles.includes('super-admin'));
    checkPermissionMock.mockResolvedValue(false);
    const reply = makeReply();
    expect(await guard(makeReq(7), reply as unknown as FastifyReply)).toBeUndefined();
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('A7. permission-check error → 500 (fail closed)', async () => {
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockRejectedValue(new Error('permission backend unavailable'));
    const reply = makeReply();
    await guard(makeReq(7), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(500);
  });

  it('A8. user holding only reports.export → 403 (export does not grant read access)', async () => {
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockImplementation(async (_u: number, perms: string[]) => perms.includes('reports.export'));
    const reply = makeReply();
    await guard(makeReq(7), reply as unknown as FastifyReply);
    expect(reply.status).toHaveBeenCalledWith(403);
  });
});

describe('P1-03 — all 28 routes enforce reports.view', () => {
  it('B1. every route requests reports.view and never reports.export', async () => {
    const requested: string[][] = [];
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockImplementation(async (_u: number, perms: string[]) => {
      requested.push(perms);
      return false;
    });

    for (const route of routes) {
      const g = route.preHandler[0] as unknown as Guard;
      await g(makeReq(7), makeReply() as unknown as FastifyReply);
    }

    expect(requested).toHaveLength(28);
    for (const perms of requested) {
      expect(perms).toContain('reports.view');
      expect(perms).not.toContain('reports.export');
    }
  });

  it('B2. every route denies a user who lacks reports.view', async () => {
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockResolvedValue(false);
    for (const route of routes) {
      const g = route.preHandler[0] as unknown as Guard;
      const reply = makeReply();
      await g(makeReq(7), reply as unknown as FastifyReply);
      expect(reply.status).toHaveBeenCalledWith(403);
    }
  });

  it('B3. every route allows a user who holds reports.view', async () => {
    checkRoleMock.mockResolvedValue(false);
    checkPermissionMock.mockImplementation(async (_u: number, perms: string[]) => perms.includes('reports.view'));
    for (const route of routes) {
      const g = route.preHandler[0] as unknown as Guard;
      const reply = makeReply();
      const res = await g(makeReq(7), reply as unknown as FastifyReply);
      expect(res).toBeUndefined();
      expect(reply.status).not.toHaveBeenCalled();
    }
  });
});
