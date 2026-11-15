import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

/**
 * P1 remediation — legacy `/admin/*` Inventory must be platform-admin-only.
 *
 * These tests exercise the REAL route plugin and the REAL auth/admin
 * middleware. The database pool is mocked because every negative case is
 * rejected by the platform-admin guard before any handler runs. The positive
 * Super Admin cases use a minimal mocked pool.
 */

const executeMock = vi.fn();
const getConnectionMock = vi.fn();

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: executeMock, query: executeMock, getConnection: getConnectionMock }),
}));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));

const { initAuthMiddleware } = await import('../../../shared/middleware/auth.middleware.js');
const { inventoryRoutes } = await import('../presentation/inventory.routes.js');

const checkRole = vi.fn();
const checkPermission = vi.fn();

initAuthMiddleware({
  resolveUser: async (request) => {
    const raw = request.headers['x-user-id'];
    const value = Number(Array.isArray(raw) ? raw[0] : raw);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  },
  checkRole,
  checkPermission,
  checkOrgApproved: async () => true,
});

interface AdminRouteCase {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  payload?: Record<string, unknown>;
}

const ADMIN_ROUTES: AdminRouteCase[] = [
  // Legacy warehouses
  { method: 'GET', url: '/admin/warehouses' },
  { method: 'POST', url: '/admin/warehouses', payload: {} },
  { method: 'PUT', url: '/admin/warehouses/1', payload: {} },
  { method: 'DELETE', url: '/admin/warehouses/1' },
  // Legacy suppliers
  { method: 'GET', url: '/admin/suppliers' },
  { method: 'POST', url: '/admin/suppliers', payload: {} },
  { method: 'PUT', url: '/admin/suppliers/1', payload: {} },
  { method: 'DELETE', url: '/admin/suppliers/1' },
  // Legacy purchase orders + lifecycle
  { method: 'GET', url: '/admin/purchase-orders' },
  { method: 'POST', url: '/admin/purchase-orders', payload: {} },
  { method: 'GET', url: '/admin/purchase-orders/1' },
  { method: 'PUT', url: '/admin/purchase-orders/1', payload: {} },
  { method: 'POST', url: '/admin/purchase-orders/1/submit', payload: {} },
  { method: 'POST', url: '/admin/purchase-orders/1/approve', payload: {} },
  { method: 'POST', url: '/admin/purchase-orders/1/receive', payload: {} },
  { method: 'POST', url: '/admin/purchase-orders/1/cancel', payload: {} },
  // Legacy stock transfers
  { method: 'POST', url: '/admin/stock-transfers', payload: {} },
  { method: 'GET', url: '/admin/stock-transfers' },
  { method: 'POST', url: '/admin/stock-transfers/1/complete', payload: {} },
  { method: 'POST', url: '/admin/stock-transfers/1/cancel', payload: {} },
  // Legacy stock adjustment + logs
  { method: 'PUT', url: '/admin/inventory/variants/1/stock', payload: {} },
  { method: 'GET', url: '/admin/inventory/logs' },
  // Frontend aliases
  { method: 'GET', url: '/admin/inventory/organisations' },
  { method: 'GET', url: '/admin/inventory/stock' },
  { method: 'GET', url: '/admin/inventory/variants/search' },
  { method: 'POST', url: '/admin/inventory/stock/adjust', payload: {} },
  { method: 'POST', url: '/admin/inventory/stock/transfer', payload: {} },
  { method: 'GET', url: '/admin/inventory/stock/logs' },
  { method: 'GET', url: '/admin/inventory/warehouses' },
  { method: 'POST', url: '/admin/inventory/warehouses', payload: {} },
  { method: 'PUT', url: '/admin/inventory/warehouses/1', payload: {} },
  { method: 'GET', url: '/admin/inventory/suppliers' },
  { method: 'POST', url: '/admin/inventory/suppliers', payload: {} },
  { method: 'PUT', url: '/admin/inventory/suppliers/1', payload: {} },
  { method: 'GET', url: '/admin/inventory/purchase-orders' },
  { method: 'POST', url: '/admin/inventory/purchase-orders', payload: {} },
  { method: 'GET', url: '/admin/inventory/purchase-orders/1' },
  { method: 'PUT', url: '/admin/inventory/purchase-orders/1/status', payload: { status: 'submitted' } },
];

async function buildApp() {
  const app = Fastify();
  await app.register(inventoryRoutes);
  await app.ready();
  return app;
}

async function injectAs(app: FastifyInstance, route: AdminRouteCase, userId?: number) {
  return app.inject({
    method: route.method,
    url: route.url,
    headers: userId ? { 'x-user-id': String(userId) } : {},
    ...(route.payload ? { payload: route.payload } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  executeMock.mockReset();
  executeMock.mockResolvedValue([[], []]);
  getConnectionMock.mockReset();
});

describe('legacy /admin Inventory is platform-admin-only', () => {
  it.each(ADMIN_ROUTES)(
    'rejects an organisation user with Inventory permissions: $method $url',
    async (route) => {
      checkRole.mockResolvedValue(false);
      // Simulates an organisation user carrying an Inventory permission from
      // Organisation A. adminGuard checks only platform.admin, so this must not
      // be enough to enter any /admin Inventory route.
      checkPermission.mockImplementation(async (_userId: number, keys: string[]) =>
        keys.some((key) => key.startsWith('inventory.')),
      );

      const app = await buildApp();
      try {
        const response = await injectAs(app, route, 42);
        expect(response.statusCode, `${route.method} ${route.url}`).toBe(403);
      } finally {
        await app.close();
      }
    },
  );

  it('blocks an Organisation-B request even when the user has an Inventory permission from Organisation A', async () => {
    checkRole.mockResolvedValue(false);
    checkPermission.mockImplementation(async (_userId: number, keys: string[]) =>
      keys.some((key) => key.startsWith('inventory.')),
    );

    const app = await buildApp();
    try {
      const response = await injectAs(
        app,
        { method: 'GET', url: '/admin/inventory/stock?orgId=6' },
        42,
      );
      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('blocks a receptionist from every legacy logs alias', async () => {
    checkRole.mockResolvedValue(false);
    checkPermission.mockImplementation(async (_userId: number, keys: string[]) =>
      keys.includes('inventory.stock.view'),
    );

    const app = await buildApp();
    try {
      for (const url of ['/admin/inventory/stock/logs', '/admin/inventory/logs']) {
        const response = await injectAs(app, { method: 'GET', url }, 42);
        expect(response.statusCode, url).toBe(403);
      }
    } finally {
      await app.close();
    }
  });

  it('rejects unauthenticated requests with 401', async () => {
    checkRole.mockResolvedValue(false);
    checkPermission.mockResolvedValue(false);

    const app = await buildApp();
    try {
      const response = await injectAs(app, { method: 'GET', url: '/admin/inventory/stock' });
      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('fails closed when the super-admin assignment is expired, inactive or deleted', async () => {
    // The DB helper returns no valid row for an expired/inactive/deleted
    // assignment; the platform.admin permission is also absent.
    executeMock.mockResolvedValue([[], []]);
    checkPermission.mockResolvedValue(false);

    const app = await buildApp();
    try {
      const response = await injectAs(app, { method: 'GET', url: '/admin/inventory/stock' }, 42);
      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('preserves Super Admin access to platform Inventory', async () => {
    checkRole.mockImplementation(async (_userId: number, roles: string[]) =>
      roles.includes('super_admin'),
    );
    checkPermission.mockResolvedValue(true);
    executeMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes("r.slug IN ('super_admin'")) return [[{ ok: 1 }], []];
      if (s.includes('FROM organisations o')) return [[{ ok: 1 }], []];
      if (s.includes('COUNT(*) AS total')) return [[{ total: 0 }], []];
      return [[], []];
    });

    const app = await buildApp();
    try {
      for (const url of ['/admin/inventory/stock?orgId=5', '/admin/inventory/warehouses?orgId=5']) {
        const response = await injectAs(app, { method: 'GET', url }, 1);
        expect(response.statusCode, url).toBe(200);
      }
    } finally {
      await app.close();
    }
  });

  it('preserves a legitimate global platform.admin role without organisation Inventory permissions', async () => {
    checkPermission.mockResolvedValue(true);
    executeMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes("r.slug IN ('super_admin','super-admin')")) return [[], []];
      if (s.includes('p.permission_key = ?')) return [[{ ok: 1 }], []];
      if (s.includes('FROM organisations o')) return [[{ ok: 1 }], []];
      if (s.includes('COUNT(*) AS total')) return [[{ total: 0 }], []];
      return [[], []];
    });

    const app = await buildApp();
    try {
      const response = await injectAs(
        app,
        { method: 'GET', url: '/admin/inventory/stock?orgId=5' },
        7,
      );
      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
