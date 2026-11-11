import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unit-only tests (no DB, no network). The auth/org guard, the entitlement
// service and the auth middleware are mocked; the handler and route
// registration are the real modules under test.
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

vi.mock('../../settlement/presentation/unified-settlement.controller.js', () => ({
  assertSettlementOrgAccess: vi.fn(),
}));
vi.mock('../application/financial-entitlement.service.js', () => ({
  financialEntitlementService: { getSettlementEntitlements: vi.fn() },
}));
vi.mock('../../../shared/middleware/auth.middleware.js', () => ({
  authMiddleware: vi.fn(),
  requirePermission: vi.fn((keys: string[]) => ({ guard: keys })),
}));

const { getSettlementEntitlementsHandler, financialEntitlementRoutes } = await import(
  '../presentation/financial-entitlement.routes.js'
);
const { assertSettlementOrgAccess } = await import(
  '../../settlement/presentation/unified-settlement.controller.js'
);
const { financialEntitlementService } = await import(
  '../application/financial-entitlement.service.js'
);
const { requirePermission, authMiddleware } = await import(
  '../../../shared/middleware/auth.middleware.js'
);
const { ForbiddenError, NotFoundError } = await import('../../../shared/errors/app-error.js');

const guard = vi.mocked(assertSettlementOrgAccess);
const readEntitlements = vi.mocked(financialEntitlementService.getSettlementEntitlements);

const makeReply = () => ({ send: vi.fn((payload: unknown) => ({ sent: payload })), status: vi.fn() });
const makeRequest = (userId: number, settlementId: number) => ({ params: { settlementId }, userId });

describe('GET /entitlements/settlement/:settlementId — cross-tenant protection', () => {
  beforeEach(() => {
    guard.mockReset();
    readEntitlements.mockReset();
    vi.mocked(requirePermission).mockClear();
  });

  it('ORG A reads entitlements of its OWN settlement', async () => {
    guard.mockResolvedValue(undefined);
    readEntitlements.mockResolvedValue([
      { id: 713655, status: 'SETTLED' },
      { id: 713912, status: 'SETTLED' },
    ] as any);
    const reply = makeReply();

    await getSettlementEntitlementsHandler(makeRequest(1, 3741), reply);

    expect(guard).toHaveBeenCalledWith(1, 3741);
    expect(readEntitlements).toHaveBeenCalledWith(3741);
    expect(reply.send).toHaveBeenCalledWith([
      { id: 713655, status: 'SETTLED' },
      { id: 713912, status: 'SETTLED' },
    ]);
  });

  it('ORG A cannot read entitlements of an ORG B settlement (403, no data)', async () => {
    guard.mockRejectedValue(new ForbiddenError('Access to this organisation denied'));
    const reply = makeReply();

    await expect(
      getSettlementEntitlementsHandler(makeRequest(1, 3743), reply),
    ).rejects.toMatchObject({ statusCode: 403 });

    // The entitlement read never runs, and nothing is sent back.
    expect(readEntitlements).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('ORG B reads entitlements of its OWN settlement', async () => {
    guard.mockResolvedValue(undefined);
    readEntitlements.mockResolvedValue([{ id: 713901, status: 'AVAILABLE' }] as any);
    const reply = makeReply();

    await getSettlementEntitlementsHandler(makeRequest(2, 3743), reply);

    expect(guard).toHaveBeenCalledWith(2, 3743);
    expect(readEntitlements).toHaveBeenCalledWith(3743);
    expect(reply.send).toHaveBeenCalledWith([{ id: 713901, status: 'AVAILABLE' }]);
  });

  it('a missing settlement is rejected with the settlement policy 404 and no data', async () => {
    guard.mockRejectedValue(new NotFoundError('Settlement not found'));
    const reply = makeReply();

    await expect(
      getSettlementEntitlementsHandler(makeRequest(1, 999999), reply),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(readEntitlements).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('authorises BEFORE reading entitlements (ordering proof)', async () => {
    const order: string[] = [];
    guard.mockImplementation(async () => {
      order.push('guard');
    });
    readEntitlements.mockImplementation(async () => {
      order.push('read');
      return [] as any;
    });

    await getSettlementEntitlementsHandler(makeRequest(1, 3741), makeReply());
    expect(order).toEqual(['guard', 'read']);

    order.length = 0;
    guard.mockReset();
    guard.mockImplementation(async () => {
      order.push('guard');
      throw new ForbiddenError('denied');
    });
    readEntitlements.mockReset();

    await expect(
      getSettlementEntitlementsHandler(makeRequest(1, 3743), makeReply()),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(order).toEqual(['guard']);
    expect(readEntitlements).not.toHaveBeenCalled();
  });

  it('registers the route behind the auth hook and the existing RBAC permission', async () => {
    const routes: Array<{ url: string; opts: any; handler: any }> = [];
    const app: any = {
      addHook: vi.fn(),
      get: vi.fn((url: string, opts: any, handler: any) => {
        routes.push({ url, opts, handler });
      }),
      post: vi.fn(),
    };

    await financialEntitlementRoutes(app);

    expect(app.addHook).toHaveBeenCalledWith('preHandler', authMiddleware);
    const route = routes.find((r) => r.url === '/entitlements/settlement/:settlementId');
    expect(route).toBeDefined();
    // RBAC is unchanged: still the existing settlements/entitlements view key.
    expect(route!.opts.preHandler).toEqual([{ guard: ['financial.entitlements.view'] }]);
    expect(vi.mocked(requirePermission)).toHaveBeenCalledWith(['financial.entitlements.view']);
    // The registered handler is the guarded one under test.
    expect(route!.handler).toBe(getSettlementEntitlementsHandler);
  });
});
