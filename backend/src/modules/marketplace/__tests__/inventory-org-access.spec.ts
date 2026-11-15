import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P1 — organisation-scoped Inventory authorisation.
 *
 * Mocked-only tests (no MySQL, no SQL execution). They lock down:
 *   • the explicit Inventory capability allowlist and legacy fallback mapping;
 *   • the organisation boundary: a permission granted for Organisation A never
 *     authorises Organisation B;
 *   • the role matrix (owner/admin, inventory manager, accountant, receptionist,
 *     coach/player);
 *   • the organisation-aware route guard (401/400/403, platform admin, scope
 *     attachment, ID tampering);
 *   • .ts/.mjs role-template parity for every Inventory key.
 */

const executeMock = vi.fn();

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: executeMock, query: executeMock }),
}));

const {
  INVENTORY_PERMISSION_KEYS,
  isInventoryPermissionGranted,
  expandInventoryPermissionKeys,
  getOrgBoundPermissionKeys,
  resolveOrgInventoryScope,
  requireOrgInventoryPermission,
  requireOrgInventoryAccess,
} = await import('../application/inventory-access.js');

const { listStockLevelsHandler } = await import('../presentation/inventory.controller.js');
const { isPlatformAdmin, hasGlobalPermission } = await import('../../../shared/middleware/org-access.js');
const {
  canAccessInventoryOrganisation,
  organisationExists,
} = await import('../infrastructure/repositories/inventory-access.repository.js');

const {
  isOrgAssignablePermission,
  isPlatformOnlyPermission,
  canOrgRoleReceivePermission,
  INVENTORY_ORG_ASSIGNABLE_KEYS,
} = await import('../../rbac/domain/org-permission-policy.js');

const { permissionMatchesTemplate, TEMPLATE_SLUGS } = await import(
  '../../rbac/application/role-permission-templates.js'
);

const mjsModule = await import('../../../../scripts/role-permission-templates.mjs');
const mjsMatch = mjsModule.permissionMatchesTemplate;

const ALL = [...INVENTORY_PERMISSION_KEYS];

interface PoolOptions {
  platformAdmin?: boolean;
  /** Organisations the actor can access. */
  accessibleOrgs?: number[];
  /** Permission keys granted by roles bound to each organisation. */
  orgPermissions?: Record<number, string[]>;
}

function mockPool(options: PoolOptions = {}) {
  executeMock.mockImplementation(async (sql: string, params: any[] = []) => {
    const s = String(sql);
    if (s.includes('JOIN role_permissions rp')) {
      const orgId = Number(params[0]);
      return [(options.orgPermissions?.[orgId] ?? []).map((permission_key) => ({ permission_key })), []];
    }
    if (s.includes("r.slug IN ('super_admin'")) {
      return [options.platformAdmin ? [{ ok: 1 }] : [], []];
    }
    if (s.includes('FROM organisations o')) {
      const orgId = Number(params[1]);
      return [(options.accessibleOrgs ?? []).includes(orgId) ? [{ ok: 1 }] : [], []];
    }
    if (s.includes('FROM organisations WHERE id =')) {
      const orgId = Number(params[0]);
      return [(options.accessibleOrgs ?? []).includes(orgId) ? [{ ok: 1 }] : [], []];
    }
    return [[], []];
  });
}

function makeReply() {
  const state: any = { statusCode: 200, body: null };
  const reply: any = {
    status(code: number) {
      state.statusCode = code;
      return reply;
    },
    send(body: any) {
      state.body = body;
      return reply;
    },
  };
  return { reply, state };
}

beforeEach(() => {
  vi.clearAllMocks();
  executeMock.mockReset();
});

describe('Inventory capability allowlist', () => {
  it('contains exactly the 15 reviewed organisation-assignable keys', () => {
    expect(ALL).toHaveLength(15);
    for (const key of ALL) expect(key.startsWith('inventory.')).toBe(true);
    // The coarse legacy key is NOT in the allowlist; it remains a fallback only.
    expect(ALL).not.toContain('inventory.stock.manage');
    // The route guard and the organisation assignment policy must agree exactly.
    expect([...ALL].sort()).toEqual([...INVENTORY_ORG_ASSIGNABLE_KEYS].sort());
  });

  it('accepts the legacy coarse key only as a fallback', () => {
    expect(isInventoryPermissionGranted(['inventory.stock.manage'], 'inventory.stock.adjust')).toBe(true);
    expect(isInventoryPermissionGranted(['inventory.stock.manage'], 'inventory.transfers.cancel')).toBe(true);
    expect(isInventoryPermissionGranted(['inventory.stock.adjust'], 'inventory.stock.manage')).toBe(false);
    expect(isInventoryPermissionGranted(['inventory.stock.adjust'], 'inventory.transfers.create')).toBe(false);
  });

  it('expands granted keys into the effective capability list used by the UI', () => {
    expect(expandInventoryPermissionKeys(['inventory.stock.view'])).toEqual([
      'inventory.stock.view',
      'inventory.transfers.view',
    ]);
    expect(expandInventoryPermissionKeys(['inventory.stock.manage'])).toEqual(
      expect.arrayContaining([
        'inventory.stock.view',
        'inventory.stock.adjust',
        'inventory.transfers.create',
        'inventory.transfers.complete',
        'inventory.transfers.cancel',
        'inventory.logs.view',
      ]),
    );
    // A stock viewer (e.g. receptionist) must never receive logs or reports.
    const stockViewer = expandInventoryPermissionKeys(['inventory.stock.view']);
    expect(stockViewer).not.toContain('inventory.logs.view');
    expect(stockViewer).not.toContain('inventory.reports.view');
    expect(stockViewer).not.toContain('inventory.reports.export');
  });

  it('never treats an arbitrary inventory.* key as organisation-assignable', () => {
    expect(isOrgAssignablePermission('inventory.stock.view')).toBe(true);
    expect(isOrgAssignablePermission('inventory.stock.adjust')).toBe(true);
    expect(isOrgAssignablePermission('inventory.stock.manage')).toBe(false);
    expect(isOrgAssignablePermission('inventory.future-feature.manage')).toBe(false);
    // The namespace itself stays platform-only.
    expect(isPlatformOnlyPermission('inventory.future-feature.manage')).toBe(true);
  });
});

describe('role-aware Inventory matrix', () => {
  const expectations: Record<string, string[]> = {
    'org-admin': ALL,
    'marketplace-manager': [
      'inventory.warehouses.view',
      'inventory.warehouses.manage',
      'inventory.stock.view',
      'inventory.stock.adjust',
      'inventory.transfers.view',
      'inventory.transfers.create',
      'inventory.transfers.complete',
      'inventory.transfers.cancel',
      'inventory.logs.view',
    ],
    accountant: [
      'inventory.warehouses.view',
      'inventory.stock.view',
      'inventory.transfers.view',
      'inventory.logs.view',
      'inventory.reports.view',
      'inventory.reports.export',
    ],
    receptionist: [
      'inventory.warehouses.view',
      'inventory.stock.view',
      'inventory.transfers.view',
    ],
  };

  it.each(Object.entries(expectations))('%s receives exactly its reviewed keys', (role, keys) => {
    for (const key of ALL) {
      expect(canOrgRoleReceivePermission(role, key), `${role} / ${key}`).toBe(keys.includes(key));
    }
  });

  it('accountant cannot adjust stock or manage warehouses', () => {
    expect(canOrgRoleReceivePermission('accountant', 'inventory.stock.adjust')).toBe(false);
    expect(canOrgRoleReceivePermission('accountant', 'inventory.stock.manage')).toBe(false);
    expect(canOrgRoleReceivePermission('accountant', 'inventory.warehouses.manage')).toBe(false);
    expect(canOrgRoleReceivePermission('accountant', 'inventory.reports.export')).toBe(true);
  });

  it('receptionist can only view warehouses, stock and transfers', () => {
    expect(canOrgRoleReceivePermission('receptionist', 'inventory.warehouses.view')).toBe(true);
    expect(canOrgRoleReceivePermission('receptionist', 'inventory.stock.view')).toBe(true);
    expect(canOrgRoleReceivePermission('receptionist', 'inventory.transfers.view')).toBe(true);
    for (const key of ALL) {
      if (key.endsWith('.view')) continue;
      expect(canOrgRoleReceivePermission('receptionist', key), key).toBe(false);
    }
    expect(canOrgRoleReceivePermission('receptionist', 'inventory.logs.view')).toBe(false);
  });

  it('coach and player receive no Inventory permission', () => {
    for (const role of ['coach', 'independent_coach', 'resident_coach', 'player', 'referee']) {
      for (const key of ALL) {
        expect(canOrgRoleReceivePermission(role, key), `${role} / ${key}`).toBe(false);
      }
    }
  });

  it('.ts and .mjs templates agree for every Inventory key and template', () => {
    for (const slug of TEMPLATE_SLUGS) {
      for (const key of ALL) {
        expect(permissionMatchesTemplate(slug, key), `${slug} / ${key}`)
          .toBe(mjsMatch(slug, key));
      }
    }
  });

  it('the legacy coarse key is not granted by any template (Super Admin gets it globally)', () => {
    for (const slug of TEMPLATE_SLUGS) {
      if (slug === 'super_admin') continue;
      expect(permissionMatchesTemplate(slug, 'inventory.stock.manage'), slug).toBe(false);
    }
  });
});

describe('organisation boundary in permission resolution', () => {
  it('binds every permission query to the requested organisation', async () => {
    mockPool({ orgPermissions: { 5: ['inventory.stock.view'] } });

    const keys = await getOrgBoundPermissionKeys(42, 5);

    expect(keys).toEqual(['inventory.stock.view']);
    const [sql, params] = executeMock.mock.calls[0];
    expect(String(sql)).toContain('r.organisation_id = ?');
    expect(String(sql)).toContain('r.is_active = TRUE');
    expect(String(sql)).toContain('r.deleted_at IS NULL');
    expect(String(sql)).toContain('urs.scope_type = \'organisation\'');
    expect(String(sql)).toContain('urs.scope_id = ?');
    expect(params).toEqual([5, 42, 5]);
  });

  it('does not authorise Organisation B with a permission granted for Organisation A', async () => {
    mockPool({
      accessibleOrgs: [5, 6],
      orgPermissions: { 5: ['inventory.stock.adjust'], 6: [] },
    });

    const orgA = await resolveOrgInventoryScope(42, '5');
    const orgB = await resolveOrgInventoryScope(42, '6');

    expect(orgA.ok).toBe(true);
    if (orgA.ok) {
      expect(orgA.scope.permissions).toContain('inventory.stock.adjust');
    }
    expect(orgB.ok).toBe(true);
    if (orgB.ok) {
      expect(orgB.scope.permissions).toEqual([]);
    }
  });

  it('rejects an organisation the actor cannot access', async () => {
    mockPool({ accessibleOrgs: [5] });
    const result = await resolveOrgInventoryScope(42, '6');
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects an invalid organisation id before any lookup', async () => {
    mockPool();
    const result = await resolveOrgInventoryScope(42, '5abc');
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('preserves platform-admin access and returns the full capability list', async () => {
    mockPool({ platformAdmin: true, accessibleOrgs: [999] });
    const result = await resolveOrgInventoryScope(1, '999');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope.isPlatformAdmin).toBe(true);
      expect(result.scope.permissions).toEqual(ALL);
    }
  });

  it('rejects a non-existent organisation even for a platform administrator', async () => {
    mockPool({ platformAdmin: true, accessibleOrgs: [5] });
    const result = await resolveOrgInventoryScope(1, '999');
    expect(result).toMatchObject({ ok: false, status: 403 });
  });
});

describe('shared role state checks (H1/H2/M1)', () => {
  it('platform-admin detection requires an active, unexpired assignment on an active non-deleted role', async () => {
    executeMock.mockResolvedValueOnce([[{ ok: 1 }], []]);

    await expect(isPlatformAdmin(42)).resolves.toBe(true);

    const [sql, params] = executeMock.mock.calls[0];
    expect(String(sql)).toContain('ur.is_active = TRUE');
    expect(String(sql)).toContain('(ur.expires_at IS NULL OR ur.expires_at > NOW())');
    expect(String(sql)).toContain('r.is_active = TRUE');
    expect(String(sql)).toContain('r.deleted_at IS NULL');
    expect(String(sql)).toContain("r.slug IN ('super_admin','super-admin')");
    expect(String(sql)).toContain('r.organisation_id IS NULL');
    expect(params).toEqual([42]);
  });

  it('platform-admin detection fails closed when no valid assignment row exists', async () => {
    executeMock.mockResolvedValueOnce([[], []]);
    await expect(isPlatformAdmin(42)).resolves.toBe(false);
  });

  it('global platform permission requires an active global role, not an organisation role', async () => {
    executeMock.mockResolvedValueOnce([[{ ok: 1 }], []]);

    await expect(hasGlobalPermission(42, 'platform.admin')).resolves.toBe(true);

    const [sql, params] = executeMock.mock.calls[0];
    expect(String(sql)).toContain('r.organisation_id IS NULL');
    expect(String(sql)).toContain('ur.is_active = TRUE');
    expect(String(sql)).toContain('(ur.expires_at IS NULL OR ur.expires_at > NOW())');
    expect(String(sql)).toContain('r.is_active = TRUE');
    expect(String(sql)).toContain('r.deleted_at IS NULL');
    expect(params).toEqual([42, 'platform.admin']);
  });

  it('organisation access requires an active organisation and active role state', async () => {
    executeMock.mockResolvedValueOnce([[{ ok: 1 }], []]);

    await expect(canAccessInventoryOrganisation(42, 5)).resolves.toBe(true);

    const [sql, params] = executeMock.mock.calls[0];
    expect(String(sql)).toContain('o.is_active = TRUE');
    expect(String(sql)).toContain('r.is_active = TRUE');
    expect(String(sql)).toContain('ur2.is_active = TRUE');
    expect(String(sql)).toContain('ur3.is_active = TRUE');
    expect(String(sql)).toContain('(ur3.expires_at IS NULL OR ur3.expires_at > NOW())');
    expect(String(sql)).toContain('r3.deleted_at IS NULL');
    expect(String(sql)).toContain('r3.organisation_id IS NULL');
    expect(params).toEqual([42, 5, 42, 42, 42, 42]);
  });

  it('platform-admin organisation validation allows inactive organisations but rejects deleted ones at the query level', async () => {
    executeMock.mockResolvedValueOnce([[{ ok: 1 }], []]);

    await expect(organisationExists(5)).resolves.toBe(true);

    const [sql, params] = executeMock.mock.calls[0];
    expect(String(sql)).toContain('deleted_at IS NULL');
    expect(String(sql)).not.toContain('is_active = TRUE');
    expect(params).toEqual([5]);
  });

  it('does not short-circuit an expired/inactive/deleted super-admin row into platform capabilities', async () => {
    mockPool({
      platformAdmin: false,
      accessibleOrgs: [5],
      orgPermissions: { 5: [] },
    });

    const result = await resolveOrgInventoryScope(42, '5');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope.isPlatformAdmin).toBe(false);
      expect(result.scope.permissions).toEqual([]);
    }
  });

  it('rejects an inactive organisation for a normal organisation user', async () => {
    mockPool({ accessibleOrgs: [], orgPermissions: { 5: [] } });

    const result = await resolveOrgInventoryScope(42, '5');

    expect(result).toMatchObject({ ok: false, status: 403 });
    const accessSql = executeMock.mock.calls
      .map(([sql]: any[]) => String(sql))
      .find((sql) => sql.includes('FROM organisations o'));
    expect(accessSql).toContain('o.is_active = TRUE');
  });

  it('allows a platform administrator to validate an inactive organisation (documented platform policy)', async () => {
    mockPool({ platformAdmin: true, accessibleOrgs: [999] });

    const result = await resolveOrgInventoryScope(1, '999');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope.isPlatformAdmin).toBe(true);
      expect(result.scope.permissions).toEqual(ALL);
    }
  });
});

describe('organisation-aware route guard', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const guard = requireOrgInventoryPermission(['inventory.stock.view']);
    const { reply, state } = makeReply();
    await guard({ params: { orgId: '5' } } as any, reply);
    expect(state.statusCode).toBe(401);
  });

  it('rejects an invalid organisation id with 400', async () => {
    mockPool();
    const guard = requireOrgInventoryPermission(['inventory.stock.view']);
    const { reply, state } = makeReply();
    await guard({ userId: 42, params: { orgId: 'not-a-number' } } as any, reply);
    expect(state.statusCode).toBe(400);
  });

  it('rejects a valid organisation without the required capability with 403', async () => {
    mockPool({ accessibleOrgs: [5], orgPermissions: { 5: ['inventory.stock.view'] } });
    const guard = requireOrgInventoryPermission(['inventory.stock.adjust']);
    const { reply, state } = makeReply();
    await guard({ userId: 42, params: { orgId: '5' } } as any, reply);
    expect(state.statusCode).toBe(403);
  });

  it('allows a granted capability and attaches the resolved scope', async () => {
    mockPool({ accessibleOrgs: [5], orgPermissions: { 5: ['inventory.stock.adjust'] } });
    const guard = requireOrgInventoryPermission(['inventory.stock.adjust']);
    const { reply, state } = makeReply();
    const request: any = { userId: 42, params: { orgId: '5' } };
    await guard(request, reply);
    expect(state.statusCode).toBe(200);
    expect(request.orgInventoryScope).toMatchObject({
      orgId: 5,
      isPlatformAdmin: false,
    });
    expect(request.orgInventoryScope.permissions).toContain('inventory.stock.adjust');
  });

  it('allows the legacy coarse capability as a fallback', async () => {
    mockPool({ accessibleOrgs: [5], orgPermissions: { 5: ['inventory.stock.manage'] } });
    const guard = requireOrgInventoryPermission(['inventory.transfers.cancel']);
    const { reply, state } = makeReply();
    await guard({ userId: 42, params: { orgId: '5' } } as any, reply);
    expect(state.statusCode).toBe(200);
  });

  it('allows platform administrators regardless of organisation role bindings', async () => {
    mockPool({ platformAdmin: true, accessibleOrgs: [999] });
    const guard = requireOrgInventoryPermission(['inventory.warehouses.manage']);
    const { reply, state } = makeReply();
    await guard({ userId: 1, params: { orgId: '999' } } as any, reply);
    expect(state.statusCode).toBe(200);
  });

  it('access-only guard resolves a valid organisation with an empty capability list', async () => {
    mockPool({ accessibleOrgs: [5], orgPermissions: { 5: [] } });
    const guard = requireOrgInventoryAccess();
    const { reply, state } = makeReply();
    const request: any = { userId: 42, params: { orgId: '5' } };
    await guard(request, reply);
    expect(state.statusCode).toBe(200);
    expect(request.orgInventoryScope).toMatchObject({ orgId: 5, permissions: [] });
  });

  it('uses the validated route scope, never a tampered ?orgId query parameter', async () => {
    executeMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('COUNT(*) AS total')) return [[{ total: 0 }], []];
      return [[], []];
    });
    const request: any = {
      userId: 42,
      params: { orgId: '5' },
      query: { orgId: '6', page: '1', limit: '20' },
      orgInventoryScope: { orgId: 5, isPlatformAdmin: false, permissions: ['inventory.stock.view'] },
    };
    const { reply } = makeReply();

    await listStockLevelsHandler(request, reply);

    const countCall = executeMock.mock.calls.find(([sql]: any[]) =>
      String(sql).includes('FROM product_variants pv'),
    );
    expect(countCall?.[1]?.[0]).toBe(5);
    expect(countCall?.[1]).not.toContain(6);
  });
});
