import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Unit-only tests (no DB, no network). The org-access dependencies and the
// entitlement service are mocked; the REAL assertOrgAccess and the REAL route
// handlers are exercised at the handler level.
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
    getEntitlement: vi.fn(),
    getEntitlementsBySourceIds: vi.fn(),
    holdEntitlement: vi.fn(),
    releaseEntitlement: vi.fn(),
    cancelEntitlement: vi.fn(),
    holdBySourceIds: vi.fn(),
    releaseBySourceIds: vi.fn(),
    cancelBySourceIds: vi.fn(),
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
  get: vi.mocked(financialEntitlementService.getEntitlement),
  bySourceIds: vi.mocked(financialEntitlementService.getEntitlementsBySourceIds),
  hold: vi.mocked(financialEntitlementService.holdEntitlement),
  release: vi.mocked(financialEntitlementService.releaseEntitlement),
  cancel: vi.mocked(financialEntitlementService.cancelEntitlement),
  holdBatch: vi.mocked(financialEntitlementService.holdBySourceIds),
  releaseBatch: vi.mocked(financialEntitlementService.releaseBySourceIds),
  cancelBatch: vi.mocked(financialEntitlementService.cancelBySourceIds),
};

const routes = new Map<string, { opts: any; handler: any }>();
const fakeApp: any = {
  addHook: vi.fn(),
  get: vi.fn(),
  post: vi.fn((url: string, opts: any, handler: any) => {
    routes.set(url, { opts, handler });
  }),
};

const handlerFor = (url: string) => {
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
const req = (userId: number, params: Record<string, any> = {}, body: Record<string, any> = {}) => ({
  userId,
  params,
  body,
});

beforeAll(async () => {
  await financialEntitlementRoutes(fakeApp);
});

beforeEach(() => {
  vi.mocked(isPlatformAdmin).mockReset().mockResolvedValue(false);
  vi.mocked(canAccessOrganisation).mockReset().mockResolvedValue(false);
  Object.values(svc).forEach((fn) => (fn as any).mockReset());
  svc.hold.mockResolvedValue(undefined as any);
  svc.release.mockResolvedValue(undefined as any);
  svc.cancel.mockResolvedValue(undefined as any);
  svc.holdBatch.mockResolvedValue(0 as any);
  svc.releaseBatch.mockResolvedValue(0 as any);
  svc.cancelBatch.mockResolvedValue(0 as any);
});

// ── M1: POST /entitlements/:id/hold ─────────────────────────────────────────
describe('M1 POST /entitlements/:id/hold', () => {
  const call = (userId: number, id: string, body: any = { reason: 'audit' }) =>
    handlerFor('/entitlements/:id/hold')(req(userId, { id }, body), makeReply());

  it('allows the owning organisation and calls the mutation', async () => {
    svc.get.mockResolvedValue({ id: 55, organisation_id: 7 } as any);
    vi.mocked(canAccessOrganisation).mockResolvedValue(true);
    const reply = makeReply();

    await handlerFor('/entitlements/:id/hold')(req(1, { id: '55' }, { reason: 'audit' }), reply);

    expect(canAccessOrganisation).toHaveBeenCalledWith(1, 7);
    expect(svc.hold).toHaveBeenCalledWith(55, 'audit');
    expect(reply.sent).toEqual({ success: true });
  });

  it('denies a foreign organisation before the mutation', async () => {
    svc.get.mockResolvedValue({ id: 55, organisation_id: 999 } as any);
    vi.mocked(canAccessOrganisation).mockResolvedValue(false);

    await expect(call(1, '55')).rejects.toMatchObject({ statusCode: 403 });
    expect(svc.hold).not.toHaveBeenCalled();
  });

  it('returns 409 for a missing entitlement and never mutates', async () => {
    svc.get.mockResolvedValue(null as any);
    await expect(
      handlerFor('/entitlements/:id/hold')(req(1, { id: '404' }, { reason: 'x' }), makeReply())
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'CONFLICT',
      message: 'Entitlement not found',
    });
    expect(canAccessOrganisation).not.toHaveBeenCalled();
    expect(svc.hold).not.toHaveBeenCalled();
  });

  it('rejects a missing reason before any read', async () => {
    const reply = makeReply();
    await handlerFor('/entitlements/:id/hold')(req(1, { id: '55' }, {}), reply);
    expect(reply.statusCode).toBe(400);
    expect(svc.get).not.toHaveBeenCalled();
    expect(svc.hold).not.toHaveBeenCalled();
  });

  it('orders read → authorise → mutate', async () => {
    const order: string[] = [];
    svc.get.mockImplementation(async () => {
      order.push('read');
      return { id: 55, organisation_id: 7 } as any;
    });
    vi.mocked(canAccessOrganisation).mockImplementation(async () => {
      order.push('auth');
      return true;
    });
    svc.hold.mockImplementation(async () => {
      order.push('mutate');
    });

    await call(1, '55');
    expect(order).toEqual(['read', 'auth', 'mutate']);
  });

  it('platform admin bypasses organisation checks', async () => {
    vi.mocked(isPlatformAdmin).mockResolvedValue(true);
    svc.get.mockResolvedValue({ id: 55, organisation_id: 999 } as any);
    await call(1, '55');
    expect(canAccessOrganisation).not.toHaveBeenCalled();
    expect(svc.hold).toHaveBeenCalled();
  });
});

// ── M2: POST /entitlements/:id/release ──────────────────────────────────────
describe('M2 POST /entitlements/:id/release', () => {
  const url = '/entitlements/:id/release';
  const call = (userId: number, id: string) => handlerFor(url)(req(userId, { id }), makeReply());

  it('allows the owning organisation and calls the mutation', async () => {
    svc.get.mockResolvedValue({ id: 56, organisation_id: 7 } as any);
    vi.mocked(canAccessOrganisation).mockResolvedValue(true);
    const reply = makeReply();

    await handlerFor(url)(req(1, { id: '56' }), reply);

    expect(canAccessOrganisation).toHaveBeenCalledWith(1, 7);
    expect(svc.release).toHaveBeenCalledWith(56);
    expect(reply.sent).toEqual({ success: true });
  });

  it('denies a foreign organisation before the mutation', async () => {
    svc.get.mockResolvedValue({ id: 56, organisation_id: 999 } as any);
    vi.mocked(canAccessOrganisation).mockResolvedValue(false);
    await expect(call(1, '56')).rejects.toMatchObject({ statusCode: 403 });
    expect(svc.release).not.toHaveBeenCalled();
  });

  it('returns 409 for a missing entitlement and never mutates', async () => {
    svc.get.mockResolvedValue(null as any);
    await expect(handlerFor(url)(req(1, { id: '404' }), makeReply())).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'CONFLICT',
      message: 'Entitlement not found',
    });
    expect(svc.release).not.toHaveBeenCalled();
  });

  it('orders read → authorise → mutate', async () => {
    const order: string[] = [];
    svc.get.mockImplementation(async () => {
      order.push('read');
      return { id: 56, organisation_id: 7 } as any;
    });
    vi.mocked(canAccessOrganisation).mockImplementation(async () => {
      order.push('auth');
      return true;
    });
    svc.release.mockImplementation(async () => {
      order.push('mutate');
    });
    await call(1, '56');
    expect(order).toEqual(['read', 'auth', 'mutate']);
  });

  it('platform admin bypasses organisation checks', async () => {
    vi.mocked(isPlatformAdmin).mockResolvedValue(true);
    svc.get.mockResolvedValue({ id: 56, organisation_id: 999 } as any);
    await call(1, '56');
    expect(canAccessOrganisation).not.toHaveBeenCalled();
    expect(svc.release).toHaveBeenCalled();
  });
});

// ── M3: POST /entitlements/:id/cancel ───────────────────────────────────────
describe('M3 POST /entitlements/:id/cancel', () => {
  const url = '/entitlements/:id/cancel';
  const call = (userId: number, id: string, body: any = { reason: 'refund' }) =>
    handlerFor(url)(req(userId, { id }, body), makeReply());

  it('allows the owning organisation and calls the mutation', async () => {
    svc.get.mockResolvedValue({ id: 57, organisation_id: 7 } as any);
    vi.mocked(canAccessOrganisation).mockResolvedValue(true);
    const reply = makeReply();

    await handlerFor(url)(req(1, { id: '57' }, { reason: 'refund' }), reply);

    expect(canAccessOrganisation).toHaveBeenCalledWith(1, 7);
    expect(svc.cancel).toHaveBeenCalledWith(57, 'refund');
    expect(reply.sent).toEqual({ success: true });
  });

  it('denies a foreign organisation before the mutation', async () => {
    svc.get.mockResolvedValue({ id: 57, organisation_id: 999 } as any);
    vi.mocked(canAccessOrganisation).mockResolvedValue(false);
    await expect(call(1, '57')).rejects.toMatchObject({ statusCode: 403 });
    expect(svc.cancel).not.toHaveBeenCalled();
  });

  it('returns 409 for a missing entitlement and never mutates', async () => {
    svc.get.mockResolvedValue(null as any);
    await expect(
      handlerFor(url)(req(1, { id: '404' }, { reason: 'x' }), makeReply())
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'CONFLICT',
      message: 'Entitlement not found',
    });
    expect(svc.cancel).not.toHaveBeenCalled();
  });

  it('rejects a missing reason before any read', async () => {
    const reply = makeReply();
    await handlerFor(url)(req(1, { id: '57' }, {}), reply);
    expect(reply.statusCode).toBe(400);
    expect(svc.get).not.toHaveBeenCalled();
    expect(svc.cancel).not.toHaveBeenCalled();
  });

  it('orders read → authorise → mutate', async () => {
    const order: string[] = [];
    svc.get.mockImplementation(async () => {
      order.push('read');
      return { id: 57, organisation_id: 7 } as any;
    });
    vi.mocked(canAccessOrganisation).mockImplementation(async () => {
      order.push('auth');
      return true;
    });
    svc.cancel.mockImplementation(async () => {
      order.push('mutate');
    });
    await call(1, '57');
    expect(order).toEqual(['read', 'auth', 'mutate']);
  });

  it('platform admin bypasses organisation checks', async () => {
    vi.mocked(isPlatformAdmin).mockResolvedValue(true);
    svc.get.mockResolvedValue({ id: 57, organisation_id: 999 } as any);
    await call(1, '57');
    expect(canAccessOrganisation).not.toHaveBeenCalled();
    expect(svc.cancel).toHaveBeenCalled();
  });

  it('propagates the 409 settlement-reservation conflict from the service (no silent success)', async () => {
    const { ConflictError } = await import('../../../shared/errors/app-error.js');
    svc.get.mockResolvedValue({ id: 57, organisation_id: 7 } as any);
    vi.mocked(canAccessOrganisation).mockResolvedValue(true);
    svc.cancel.mockRejectedValueOnce(
      new ConflictError('Entitlement 57 is reserved by settlement 77; cancel the settlement through the settlement cancellation workflow'),
    );

    await expect(call(1, '57')).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'CONFLICT',
      message: expect.stringContaining('reserved by settlement 77'),
    });
  });
});

// ── Batch routes (M4–M6) ────────────────────────────────────────────────────
type BatchSpec = {
  title: string;
  url: string;
  body: (ids: number[]) => Record<string, any>;
  mutation: keyof typeof svc;
  responseKey: string;
};

const batchSpecs: BatchSpec[] = [
  {
    title: 'M4 POST /entitlements/hold-by-source',
    url: '/entitlements/hold-by-source',
    body: (ids) => ({ sourceType: 'marketplace', sourceIds: ids, reason: 'dispute' }),
    mutation: 'holdBatch',
    responseKey: 'held',
  },
  {
    title: 'M5 POST /entitlements/release-by-source',
    url: '/entitlements/release-by-source',
    body: (ids) => ({ sourceType: 'marketplace', sourceIds: ids }),
    mutation: 'releaseBatch',
    responseKey: 'released',
  },
  {
    title: 'M6 POST /entitlements/cancel-by-source',
    url: '/entitlements/cancel-by-source',
    body: (ids) => ({ sourceType: 'marketplace', sourceIds: ids, reason: 'refund' }),
    mutation: 'cancelBatch',
    responseKey: 'cancelled',
  },
];

for (const spec of batchSpecs) {
  describe(spec.title, () => {
    const invoke = (userId: number, ids: number[], reply = makeReply()) =>
      handlerFor(spec.url)(req(userId, {}, spec.body(ids)), reply);

    it('authorises the distinct organisation once and calls the mutation', async () => {
      svc.bySourceIds.mockResolvedValue([
        { id: 1, organisation_id: 7 },
        { id: 2, organisation_id: 7 },
      ] as any);
      vi.mocked(canAccessOrganisation).mockResolvedValue(true);
      (svc[spec.mutation] as any).mockResolvedValue(2);
      const reply = makeReply();

      await invoke(1, [10, 11], reply);

      expect(svc.bySourceIds).toHaveBeenCalledWith('marketplace', [10, 11]);
      expect(canAccessOrganisation).toHaveBeenCalledTimes(1);
      expect(canAccessOrganisation).toHaveBeenCalledWith(1, 7);
      expect(svc[spec.mutation]).toHaveBeenCalled();
      expect(reply.sent).toEqual({ success: true, [spec.responseKey]: 2 });
    });

    it('denies a foreign organisation before the mutation', async () => {
      svc.bySourceIds.mockResolvedValue([{ id: 1, organisation_id: 999 }] as any);
      vi.mocked(canAccessOrganisation).mockResolvedValue(false);

      await expect(invoke(1, [10])).rejects.toMatchObject({ statusCode: 403 });
      expect(svc[spec.mutation]).not.toHaveBeenCalled();
    });

    it('rejects the WHOLE mixed-organisation batch before mutating', async () => {
      svc.bySourceIds.mockResolvedValue([
        { id: 1, organisation_id: 7 },
        { id: 2, organisation_id: 999 },
      ] as any);
      vi.mocked(canAccessOrganisation).mockImplementation(async (_u: number, org: number) => org === 7);

      await expect(invoke(1, [10, 11])).rejects.toMatchObject({ statusCode: 403 });
      expect(svc[spec.mutation]).not.toHaveBeenCalled();
    });

    it('preserves the zero-count success response for an empty source result', async () => {
      svc.bySourceIds.mockResolvedValue([] as any);
      (svc[spec.mutation] as any).mockResolvedValue(0);
      const reply = makeReply();

      await invoke(1, [10], reply);

      expect(canAccessOrganisation).not.toHaveBeenCalled();
      expect(svc[spec.mutation]).toHaveBeenCalled();
      expect(reply.sent).toEqual({ success: true, [spec.responseKey]: 0 });
    });

    it('orders authorisation before the mutation', async () => {
      const order: string[] = [];
      svc.bySourceIds.mockImplementation(async () => {
        order.push('read');
        return [{ id: 1, organisation_id: 7 }] as any;
      });
      vi.mocked(canAccessOrganisation).mockImplementation(async () => {
        order.push('auth');
        return true;
      });
      (svc[spec.mutation] as any).mockImplementation(async () => {
        order.push('mutate');
        return 1;
      });

      await invoke(1, [10]);
      expect(order).toEqual(['read', 'auth', 'mutate']);
    });

    it('platform admin bypasses organisation checks', async () => {
      vi.mocked(isPlatformAdmin).mockResolvedValue(true);
      svc.bySourceIds.mockResolvedValue([{ id: 1, organisation_id: 999 }] as any);
      (svc[spec.mutation] as any).mockResolvedValue(1);
      const reply = makeReply();

      await invoke(1, [10], reply);

      expect(canAccessOrganisation).not.toHaveBeenCalled();
      expect(reply.sent).toEqual({ success: true, [spec.responseKey]: 1 });
    });

    it('propagates the 409 settlement-reservation conflict from the batch service', async () => {
      const { ConflictError } = await import('../../../shared/errors/app-error.js');
      svc.bySourceIds.mockResolvedValue([{ id: 1, organisation_id: 7 }] as any);
      vi.mocked(canAccessOrganisation).mockResolvedValue(true);
      (svc[spec.mutation] as any).mockRejectedValueOnce(
        new ConflictError('Refund/cancellation blocked: entitlement 1 is reserved by settlement 91'),
      );

      await expect(invoke(1, [10])).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'CONFLICT',
      });
    });
  });
}

// ── Wiring ──────────────────────────────────────────────────────────────────
describe('Mutation route wiring', () => {
  it('keeps the auth hook and the existing RBAC permission on all six routes', () => {
    expect(fakeApp.addHook).toHaveBeenCalledWith('preHandler', authMiddleware);

    const expectations: Array<[string, string]> = [
      ['/entitlements/:id/hold', 'financial.entitlements.hold'],
      ['/entitlements/:id/release', 'financial.entitlements.hold'],
      ['/entitlements/:id/cancel', 'financial.entitlements.cancel'],
      ['/entitlements/hold-by-source', 'financial.entitlements.hold'],
      ['/entitlements/release-by-source', 'financial.entitlements.hold'],
      ['/entitlements/cancel-by-source', 'financial.entitlements.cancel'],
    ];
    for (const [url, key] of expectations) {
      const route = routes.get(url);
      expect(route, url).toBeDefined();
      expect(route!.opts.preHandler, url).toEqual([{ guard: [key] }]);
    }
  });

  it('still rejects a missing reason for the reason-bearing routes before any read', async () => {
    for (const url of [
      '/entitlements/:id/hold',
      '/entitlements/:id/cancel',
      '/entitlements/hold-by-source',
      '/entitlements/cancel-by-source',
    ]) {
      const reply = makeReply();
      const params = url.includes(':id') ? { id: '5' } : {};
      const body = url.includes('by-source')
        ? { sourceType: 'marketplace', sourceIds: [1] }
        : {};
      await handlerFor(url)(req(1, params, body), reply);
      expect(reply.statusCode, url).toBe(400);
    }
    expect(svc.get).not.toHaveBeenCalled();
    expect(svc.bySourceIds).not.toHaveBeenCalled();
  });
});
