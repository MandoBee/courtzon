import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Unit-only tests (no DB, no network). The org-access dependencies and the
// entitlement service are mocked; the REAL assertOrgAccess / route handlers are
// exercised end-to-end at the handler level.
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

vi.mock('../../../shared/middleware/org-access.js', () => ({
  isPlatformAdmin: vi.fn(),
  canAccessOrganisation: vi.fn(),
  findAccessibleOrgIds: vi.fn(),
}));
vi.mock('../application/financial-entitlement.service.js', () => ({
  financialEntitlementService: {
    getOrganisationEntitlements: vi.fn(),
    getOrganisationBalance: vi.fn(),
    getEntitlement: vi.fn(),
    getEntitlementByPublicId: vi.fn(),
    getEntitlementsBySource: vi.fn(),
  },
}));
vi.mock('../../../shared/middleware/auth.middleware.js', () => ({
  authMiddleware: vi.fn(),
  requirePermission: vi.fn((keys: string[]) => ({ guard: keys })),
}));

const { financialEntitlementRoutes } = await import(
  '../presentation/financial-entitlement.routes.js'
);
const { financialEntitlementService } = await import(
  '../application/financial-entitlement.service.js'
);
const { isPlatformAdmin, canAccessOrganisation } = await import(
  '../../../shared/middleware/org-access.js'
);
const { authMiddleware, requirePermission } = await import(
  '../../../shared/middleware/auth.middleware.js'
);
const { ForbiddenError } = await import('../../../shared/errors/app-error.js');

const svc = {
  list: vi.mocked(financialEntitlementService.getOrganisationEntitlements),
  balance: vi.mocked(financialEntitlementService.getOrganisationBalance),
  one: vi.mocked(financialEntitlementService.getEntitlement),
  byPublicId: vi.mocked(financialEntitlementService.getEntitlementByPublicId),
  bySource: vi.mocked(financialEntitlementService.getEntitlementsBySource),
};

const routes = new Map<string, { opts: any; handler: any }>();
const fakeApp: any = {
  addHook: vi.fn(),
  get: vi.fn((url: string, opts: any, handler: any) => {
    routes.set(url, { opts, handler });
  }),
  post: vi.fn(),
};

const handler = (url: string) => {
  const route = routes.get(url);
  if (!route) throw new Error(`route not registered: ${url}`);
  return route.handler;
};

const makeReply = () => {
  const reply: any = { statusCode: undefined, sent: undefined };
  reply.status = vi.fn((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.send = vi.fn((payload: unknown) => {
    reply.sent = payload;
    return reply;
  });
  return reply;
};
const req = (userId: number, params: Record<string, any> = {}, query: Record<string, any> = {}) => ({
  userId,
  params,
  query,
});

beforeAll(async () => {
  await financialEntitlementRoutes(fakeApp);
});

beforeEach(() => {
  vi.mocked(isPlatformAdmin).mockReset().mockResolvedValue(false);
  vi.mocked(canAccessOrganisation).mockReset().mockResolvedValue(false);
  svc.list.mockReset();
  svc.balance.mockReset();
  svc.one.mockReset();
  svc.byPublicId.mockReset();
  svc.bySource.mockReset();
});

describe('E1 GET /entitlements — organisation list', () => {
  it('allows a member of the requested organisation and keeps filters/pagination', async () => {
    vi.mocked(canAccessOrganisation).mockResolvedValue(true);
    svc.list.mockResolvedValue({ data: [{ id: 1, organisation_id: 276002726 }], total: 1, page: 2, limit: 5 } as any);
    const reply = makeReply();

    await handler('/entitlements')(req(1, {}, { organisationId: '276002726', status: 'AVAILABLE', entitlementType: 'ORGANIZATION_EARNING', page: 2, limit: 5 }), reply);

    expect(canAccessOrganisation).toHaveBeenCalledWith(1, 276002726);
    expect(svc.list).toHaveBeenCalledWith(276002726, { status: 'AVAILABLE', entitlementType: 'ORGANIZATION_EARNING', page: 2, limit: 5 });
    expect(reply.send).toHaveBeenCalledWith({ data: [{ id: 1, organisation_id: 276002726 }], total: 1, page: 2, limit: 5 });
  });

  it('denies a foreign organisation BEFORE the list read', async () => {
    vi.mocked(canAccessOrganisation).mockResolvedValue(false);
    const reply = makeReply();

    await expect(
      handler('/entitlements')(req(1, {}, { organisationId: '999' }), reply),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(svc.list).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('rejects missing / non-positive / non-integer organisationId before any auth or read', async () => {
    for (const value of [undefined, '', 'abc', '0', '-5', '1.5']) {
      const reply = makeReply();
      await handler('/entitlements')(req(1, {}, { organisationId: value }), reply);
      expect(reply.statusCode, `value=${String(value)}`).toBe(400);
      expect(reply.send).toHaveBeenCalled();
    }
    expect(canAccessOrganisation).not.toHaveBeenCalled();
    expect(svc.list).not.toHaveBeenCalled();
  });

  it('orders authorization before the read (explicit)', async () => {
    const order: string[] = [];
    vi.mocked(canAccessOrganisation).mockImplementation(async () => {
      order.push('auth');
      return true;
    });
    svc.list.mockImplementation(async () => {
      order.push('read');
      return { data: [], total: 0 } as any;
    });

    await handler('/entitlements')(req(1, {}, { organisationId: '7' }), makeReply());
    expect(order).toEqual(['auth', 'read']);
  });
});

describe('E2 GET /entitlements/balance/:organisationId', () => {
  it('allows the owning organisation and preserves the response shape', async () => {
    vi.mocked(canAccessOrganisation).mockResolvedValue(true);
    svc.balance.mockResolvedValue(10 as any);
    const reply = makeReply();

    await handler('/entitlements/balance/:organisationId')(req(1, { organisationId: '276002726' }), reply);

    expect(canAccessOrganisation).toHaveBeenCalledWith(1, 276002726);
    expect(svc.balance).toHaveBeenCalledTimes(5);
    expect(reply.send).toHaveBeenCalledWith({ pending: 10, available: 10, onHold: 10, settled: 10, cancelled: 10 });
  });

  it('denies a foreign organisation BEFORE any balance read', async () => {
    vi.mocked(canAccessOrganisation).mockResolvedValue(false);
    const reply = makeReply();

    await expect(
      handler('/entitlements/balance/:organisationId')(req(1, { organisationId: '999' }), reply),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(svc.balance).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('rejects an invalid organisationId before any read', async () => {
    const reply = makeReply();
    await handler('/entitlements/balance/:organisationId')(req(1, { organisationId: 'abc' }), reply);
    expect(reply.statusCode).toBe(400);
    expect(svc.balance).not.toHaveBeenCalled();
  });
});

describe('E3 GET /entitlements/:id', () => {
  it('allows the owning organisation and sends the record', async () => {
    svc.one.mockResolvedValue({ id: 55, organisation_id: 276002726 } as any);
    vi.mocked(canAccessOrganisation).mockResolvedValue(true);
    const reply = makeReply();

    await handler('/entitlements/:id')(req(1, { id: '55' }), reply);

    expect(canAccessOrganisation).toHaveBeenCalledWith(1, 276002726);
    expect(reply.send).toHaveBeenCalledWith({ id: 55, organisation_id: 276002726 });
  });

  it('denies a foreign organisation and sends no body', async () => {
    svc.one.mockResolvedValue({ id: 55, organisation_id: 999 } as any);
    vi.mocked(canAccessOrganisation).mockResolvedValue(false);
    const reply = makeReply();

    await expect(
      handler('/entitlements/:id')(req(1, { id: '55' }), reply),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(reply.send).not.toHaveBeenCalled();
  });

  it('preserves 404 for a missing record and never checks access', async () => {
    svc.one.mockResolvedValue(null as any);
    const reply = makeReply();

    await handler('/entitlements/:id')(req(1, { id: '404404' }), reply);

    expect(reply.statusCode).toBe(404);
    expect(reply.sent).toEqual({ error: 'Entitlement not found' });
    expect(canAccessOrganisation).not.toHaveBeenCalled();
  });

  it('orders record fetch, then authorization, then send', async () => {
    const order: string[] = [];
    svc.one.mockImplementation(async () => {
      order.push('read');
      return { id: 55, organisation_id: 7 } as any;
    });
    vi.mocked(canAccessOrganisation).mockImplementation(async () => {
      order.push('auth');
      return true;
    });
    const reply = makeReply();
    reply.send.mockImplementation((p: unknown) => {
      order.push('send');
      reply.sent = p;
      return reply;
    });

    await handler('/entitlements/:id')(req(1, { id: '55' }), reply);

    expect(order).toEqual(['read', 'auth', 'send']);
  });
});

describe('E4 GET /entitlements/source/:type/:id', () => {
  it('allows records that all belong to accessible organisations', async () => {
    svc.bySource.mockResolvedValue([
      { id: 1, organisation_id: 7 },
      { id: 2, organisation_id: 7 },
    ] as any);
    vi.mocked(canAccessOrganisation).mockResolvedValue(true);
    const reply = makeReply();

    await handler('/entitlements/source/:sourceType/:sourceId')(req(1, { sourceType: 'booking', sourceId: '10' }), reply);

    expect(canAccessOrganisation).toHaveBeenCalledTimes(1); // distinct org
    expect(reply.send).toHaveBeenCalledWith([
      { id: 1, organisation_id: 7 },
      { id: 2, organisation_id: 7 },
    ]);
  });

  it('rejects the WHOLE result when records span an inaccessible organisation', async () => {
    svc.bySource.mockResolvedValue([
      { id: 1, organisation_id: 7 },
      { id: 2, organisation_id: 999 },
    ] as any);
    vi.mocked(canAccessOrganisation).mockImplementation(async (_u: number, org: number) => org === 7);
    const reply = makeReply();

    await expect(
      handler('/entitlements/source/:sourceType/:sourceId')(req(1, { sourceType: 'booking', sourceId: '10' }), reply),
    ).rejects.toMatchObject({ statusCode: 403 });

    // No partial cross-tenant body.
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('preserves the existing empty response and skips access checks', async () => {
    svc.bySource.mockResolvedValue([] as any);
    const reply = makeReply();

    await handler('/entitlements/source/:sourceType/:sourceId')(req(1, { sourceType: 'booking', sourceId: '11' }), reply);

    expect(reply.send).toHaveBeenCalledWith([]);
    expect(canAccessOrganisation).not.toHaveBeenCalled();
  });
});

describe('E5 GET /entitlements/public/:publicId', () => {
  it('allows the owning organisation and keeps the UUID lookup', async () => {
    svc.byPublicId.mockResolvedValue({ id: 77, organisation_id: 7 } as any);
    vi.mocked(canAccessOrganisation).mockResolvedValue(true);
    const reply = makeReply();

    await handler('/entitlements/public/:publicId')(req(1, { publicId: 'uuid-77' }), reply);

    expect(svc.byPublicId).toHaveBeenCalledWith('uuid-77');
    expect(reply.send).toHaveBeenCalledWith({ id: 77, organisation_id: 7 });
  });

  it('denies a foreign organisation', async () => {
    svc.byPublicId.mockResolvedValue({ id: 77, organisation_id: 999 } as any);
    vi.mocked(canAccessOrganisation).mockResolvedValue(false);
    const reply = makeReply();

    await expect(
      handler('/entitlements/public/:publicId')(req(1, { publicId: 'uuid-77' }), reply),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(reply.send).not.toHaveBeenCalled();
  });

  it('preserves 404 for an unknown public_id', async () => {
    svc.byPublicId.mockResolvedValue(null as any);
    const reply = makeReply();

    await handler('/entitlements/public/:publicId')(req(1, { publicId: 'nope' }), reply);

    expect(reply.statusCode).toBe(404);
    expect(reply.sent).toEqual({ error: 'Entitlement not found' });
    expect(canAccessOrganisation).not.toHaveBeenCalled();
  });
});

describe('Platform administrators and route wiring', () => {
  it('platform admin bypasses organisation checks (E1)', async () => {
    vi.mocked(isPlatformAdmin).mockResolvedValue(true);
    svc.list.mockResolvedValue({ data: [], total: 0 } as any);
    const reply = makeReply();

    await handler('/entitlements')(req(1, {}, { organisationId: '999' }), reply);

    expect(canAccessOrganisation).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalled();
  });

  it('keeps the auth hook and the existing RBAC permission on all five routes', () => {
    expect(fakeApp.addHook).toHaveBeenCalledWith('preHandler', authMiddleware);
    for (const url of [
      '/entitlements',
      '/entitlements/balance/:organisationId',
      '/entitlements/:id',
      '/entitlements/public/:publicId',
      '/entitlements/source/:sourceType/:sourceId',
    ]) {
      const route = routes.get(url);
      expect(route, url).toBeDefined();
      expect(route!.opts.preHandler, url).toEqual([{ guard: ['financial.entitlements.view'] }]);
    }
    expect(vi.mocked(requirePermission)).toHaveBeenCalledWith(['financial.entitlements.view']);
  });
});
