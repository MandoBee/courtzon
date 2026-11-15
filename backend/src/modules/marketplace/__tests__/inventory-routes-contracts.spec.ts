import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

/**
 * W1-F-007 Phase B — Inventory route aliases and API contracts.
 *
 * Mocked-only tests (no MySQL, no SQL execution). They lock down:
 *   • the /admin/inventory/* alias routes and legacy /admin/* compatibility;
 *   • stock-level pagination/search/tenant scope and variant search caps;
 *   • the adjust / transfer body adapters delegating to the Phase A handlers;
 *   • supplier casing + pagination, warehouse pagination/partial updates;
 *   • purchase-order casing, list/detail response shapes and status mapping;
 *   • inventory-log aliases, filters, pagination and tenant scope.
 */

const executeMock = vi.fn();
const getConnectionMock = vi.fn();

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: executeMock, query: executeMock, getConnection: getConnectionMock }),
}));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));

const ctrl = await import('../presentation/inventory.controller.js');
const { inventoryRoutes } = await import('../presentation/inventory.routes.js');

interface PoolOptions {
  accessible?: number[];
  accessGranted?: boolean;
  platformAdmin?: boolean;
  counts?: Record<string, number>;
  rows?: Record<string, any[]>;
  orgScope?: any[];
}

function mockPool(options: PoolOptions = {}) {
  executeMock.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (s.includes('SELECT DISTINCT org_id')) {
      return [(options.accessible ?? []).map((id) => ({ id })), []];
    }
    if (s.includes('SELECT DISTINCT o.id, o.name')) return [options.orgScope ?? [], []];
    if (s.includes('SELECT id, name FROM organisations')) return [options.orgScope ?? [], []];
    if (s.includes('FROM organisations o')) {
      return [options.accessGranted ? [{ ok: 1 }] : [], []];
    }
    if (s.includes("r.slug IN ('super_admin'")) {
      return [options.platformAdmin ? [{ ok: 1 }] : [], []];
    }
    if (s.includes('COUNT(*) AS total')) {
      const table = s.includes('inventory_logs')
        ? 'logs'
        : s.includes('FROM product_variants')
          ? 'variants'
          : s.includes('FROM warehouses')
            ? 'warehouses'
            : s.includes('FROM suppliers')
              ? 'suppliers'
              : s.includes('FROM purchase_orders po')
                ? 'purchaseOrders'
                : 'unknown';
      return [[{ total: options.counts?.[table] ?? 0 }], []];
    }
    if (s.includes('FROM purchase_order_items poi')) return [options.rows?.poItems ?? [], []];
    if (s.includes('FROM purchase_orders po')) return [options.rows?.purchaseOrders ?? [], []];
    if (s.includes('FROM purchase_orders')) return [options.rows?.poStatus ?? [], []];
    if (s.includes('FROM inventory_logs')) return [options.rows?.logs ?? [], []];
    if (s.includes('FROM product_variants')) return [options.rows?.variants ?? [], []];
    if (s.includes('FROM warehouses')) return [options.rows?.warehouses ?? [], []];
    if (s.includes('FROM suppliers')) return [options.rows?.suppliers ?? [], []];
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

function makeConn(results: any[] = []) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const conn: any = {
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
    execute: vi.fn(async (sql: string, params: any[]) => {
      calls.push({ sql: String(sql), params });
      const next = results.shift();
      return [next === undefined ? [] : next, []];
    }),
  };
  getConnectionMock.mockResolvedValue(conn);
  return { conn, calls };
}

function request(overrides: Record<string, any> = {}) {
  return {
    query: {},
    params: {},
    body: {},
    userId: 1,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'vitest' },
    ...overrides,
  } as any;
}

const callsOf = () => executeMock.mock.calls.map(([sql, params]: any[]) => ({ sql: String(sql), params }));
const findCall = (calls: Array<{ sql: string; params: any[] }>, needle: string) =>
  calls.find((c) => c.sql.includes(needle));

beforeEach(() => {
  vi.clearAllMocks();
  executeMock.mockReset();
  getConnectionMock.mockReset();
});

// ── Route registration ──────────────────────────────────────────────────────

describe('inventory route compatibility', () => {
  it('registers every frontend route and keeps the legacy routes', async () => {
    const app = Fastify();
    await app.register(inventoryRoutes);
    await app.ready();

    const routes: Array<[string, string]> = [
      // Frontend namespace
      ['GET', '/admin/inventory/organisations'],
      ['GET', '/admin/inventory/stock'],
      ['GET', '/admin/inventory/variants/search'],
      ['POST', '/admin/inventory/stock/adjust'],
      ['POST', '/admin/inventory/stock/transfer'],
      ['GET', '/admin/inventory/stock/logs'],
      ['GET', '/admin/inventory/warehouses'],
      ['POST', '/admin/inventory/warehouses'],
      ['PUT', '/admin/inventory/warehouses/:id'],
      ['GET', '/admin/inventory/suppliers'],
      ['POST', '/admin/inventory/suppliers'],
      ['PUT', '/admin/inventory/suppliers/:id'],
      ['GET', '/admin/inventory/purchase-orders'],
      ['POST', '/admin/inventory/purchase-orders'],
      ['GET', '/admin/inventory/purchase-orders/:id'],
      ['PUT', '/admin/inventory/purchase-orders/:id/status'],
      // Legacy namespace
      ['GET', '/admin/warehouses'],
      ['POST', '/admin/warehouses'],
      ['PUT', '/admin/warehouses/:id'],
      ['DELETE', '/admin/warehouses/:id'],
      ['GET', '/admin/suppliers'],
      ['POST', '/admin/suppliers'],
      ['PUT', '/admin/suppliers/:id'],
      ['DELETE', '/admin/suppliers/:id'],
      ['GET', '/admin/purchase-orders'],
      ['POST', '/admin/purchase-orders'],
      ['GET', '/admin/purchase-orders/:id'],
      ['PUT', '/admin/purchase-orders/:id'],
      ['POST', '/admin/purchase-orders/:id/submit'],
      ['POST', '/admin/purchase-orders/:id/approve'],
      ['POST', '/admin/purchase-orders/:id/receive'],
      ['POST', '/admin/purchase-orders/:id/cancel'],
      ['POST', '/admin/stock-transfers'],
      ['GET', '/admin/stock-transfers'],
      ['POST', '/admin/stock-transfers/:id/complete'],
      ['PUT', '/admin/inventory/variants/:variantId/stock'],
      ['GET', '/admin/inventory/logs'],
    ];

    for (const [method, url] of routes) {
      expect(app.hasRoute({ method: method as any, url }), `${method} ${url}`).toBe(true);
    }

    await app.close();
  });
});

// ── Organisation scope endpoint (Phase B.1) ─────────────────────────────────

describe('inventory organisation scope endpoint', () => {
  it('returns exactly the resolver-authorised memberships and never role clones', async () => {
    mockPool({ orgScope: [{ id: 5, name: 'Owned Org' }, { id: 7, name: 'Member Org' }] });
    const { reply, state } = makeReply();

    await ctrl.listInventoryOrganisationsHandler(request(), reply);

    const sql = callsOf().map((c) => c.sql).join('\n');
    expect(sql).toContain('user_organisations');
    expect(sql).toContain('user_role_scopes');
    expect(sql).toContain('ur.is_active = TRUE');
    expect(sql).toContain('o.is_active = TRUE');
    expect(sql).toContain('o.deleted_at IS NULL');
    // Canonical guard does NOT authorise via role clones (`roles.organisation_id`).
    const scopeCall = findCall(callsOf(), 'SELECT DISTINCT o.id, o.name');
    expect(scopeCall?.sql).not.toContain('roles r');
    expect(scopeCall?.sql).not.toContain('r.organisation_id');

    expect(state.body).toEqual({
      data: [{ id: 5, name: 'Owned Org' }, { id: 7, name: 'Member Org' }],
      requiresExplicitSelection: true,
    });
  });

  it('does not require explicit selection for a single authorised organisation', async () => {
    mockPool({ orgScope: [{ id: 5, name: 'Owned Org' }] });
    const { reply, state } = makeReply();

    await ctrl.listInventoryOrganisationsHandler(request(), reply);

    expect(state.body).toEqual({
      data: [{ id: 5, name: 'Owned Org' }],
      requiresExplicitSelection: false,
    });
  });

  it('gives a platform administrator all active organisations and requires a choice', async () => {
    mockPool({
      platformAdmin: true,
      orgScope: [{ id: 1, name: 'Platform A' }, { id: 2, name: 'Platform B' }],
    });
    const { reply, state } = makeReply();

    await ctrl.listInventoryOrganisationsHandler(request(), reply);

    const adminQuery = findCall(callsOf(), 'SELECT id, name FROM organisations');
    expect(adminQuery?.sql).toContain('is_active = TRUE');
    expect(adminQuery?.sql).toContain('deleted_at IS NULL');
    expect(state.body).toEqual({
      data: [{ id: 1, name: 'Platform A' }, { id: 2, name: 'Platform B' }],
      requiresExplicitSelection: true,
    });
  });

  it('rejects an unauthenticated caller', async () => {
    const { reply } = makeReply();

    await expect(
      ctrl.listInventoryOrganisationsHandler(request({ userId: undefined }), reply),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ── Stock levels & variant search ───────────────────────────────────────────

describe('stock levels contract', () => {
  it('scopes by organisation, supports search/pagination and returns total', async () => {
    mockPool({ accessGranted: true, counts: { variants: 12 }, rows: { variants: [{ id: 1 }] } });
    const { reply, state } = makeReply();

    await ctrl.listStockLevelsHandler(
      request({ query: { orgId: '5', page: '2', limit: '10', search: 'rack' } }),
      reply,
    );

    const countCall = findCall(callsOf(), 'FROM product_variants pv');
    expect(countCall?.sql).toContain('COUNT(*) AS total');
    expect(countCall?.params).toEqual([5, '%rack%', '%rack%', '%rack%']);

    const listCall = findCall(callsOf(), 'quantity AS current_stock');
    expect(listCall?.sql).toContain('p.seller_id = ?');
    expect(listCall?.sql).toContain('LIMIT ? OFFSET ?');
    expect(listCall?.params).toEqual([5, '%rack%', '%rack%', '%rack%', 10, 10]);

    expect(state.body).toMatchObject({ total: 12, page: 2, limit: 10 });
  });

  it('clamps unsafe pagination limits', async () => {
    mockPool({ accessGranted: true, counts: { variants: 0 }, rows: { variants: [] } });
    const { reply, state } = makeReply();

    await ctrl.listStockLevelsHandler(request({ query: { orgId: '5', limit: '100000' } }), reply);

    const listCall = findCall(callsOf(), 'quantity AS current_stock');
    expect(listCall?.params.slice(-2)).toEqual([100, 0]);
    expect(state.body).toMatchObject({ page: 1, limit: 100 });
  });
});

describe('variant search contract', () => {
  it('scopes by organisation and caps results at 20', async () => {
    mockPool({ accessGranted: true, rows: { variants: [{ id: 1, name: 'Shirt', sku: 'SH-1', current_stock: 4 }] } });
    const { reply, state } = makeReply();

    await ctrl.searchInventoryVariantsHandler(request({ query: { orgId: '5', q: 'sh' } }), reply);

    const call = findCall(callsOf(), 'variant_name AS name');
    expect(call?.sql).toContain('p.seller_id = ?');
    expect(call?.sql).toContain('LIMIT 20');
    expect(call?.params).toEqual([5, '%sh%', '%sh%']);
    expect(state.body).toEqual({ data: [{ id: 1, name: 'Shirt', sku: 'SH-1', current_stock: 4 }] });
  });

  it('does not query when the term is shorter than two characters', async () => {
    mockPool({ accessGranted: true });
    const { reply, state } = makeReply();

    await ctrl.searchInventoryVariantsHandler(request({ query: { orgId: '5', q: 's' } }), reply);

    expect(findCall(callsOf(), 'variant_name AS name')).toBeUndefined();
    expect(state.body).toEqual({ data: [] });
  });
});

// ── Adjust / transfer adapters ──────────────────────────────────────────────

describe('stock adjustment adapter', () => {
  it('maps variant_id/new_quantity onto the secured adjustment handler', async () => {
    mockPool({ accessGranted: true });
    const { conn, calls } = makeConn([
      [{ id: 77, quantity: 10, product_id: 9, organisation_id: 5 }],
      { affectedRows: 1 },
      { affectedRows: 1 },
    ]);
    const { reply, state } = makeReply();

    await ctrl.adjustStockFromFrontendHandler(
      request({ query: { orgId: '5' }, body: { variant_id: 77, new_quantity: 4, reason: 'count' } }),
      reply,
    );

    expect(state.body).toMatchObject({ success: true, stockBefore: 10, stockAfter: 4 });
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'SELECT pv.id, pv.quantity, pv.product_id')?.params).toEqual([77, 5]);
    const logInsert = findCall(calls, 'INSERT INTO inventory_logs');
    expect(logInsert?.params.slice(0, 6)).toEqual([77, null, 'adjustment', -6, 10, 4]);
    expect(logInsert?.params[6]).toBe('count');
  });

  it('rejects malformed ids before touching the database', async () => {
    mockPool({ accessGranted: true });
    const { reply } = makeReply();

    await expect(
      ctrl.adjustStockFromFrontendHandler(
        request({ query: { orgId: '5' }, body: { variant_id: 'abc', new_quantity: 1 } }),
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(getConnectionMock).not.toHaveBeenCalled();
  });

  it('rejects negative quantities', async () => {
    mockPool({ accessGranted: true });
    const { reply } = makeReply();

    await expect(
      ctrl.adjustStockFromFrontendHandler(
        request({ query: { orgId: '5' }, body: { variant_id: 7, new_quantity: -2 } }),
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('stock transfer adapter', () => {
  it('maps snake_case payload onto the secured transfer handler', async () => {
    mockPool({ accessGranted: true });
    const { conn, calls } = makeConn([
      [{ id: 1 }],
      [{ id: 2 }],
      [{ id: 9, quantity: 8 }],
      { insertId: 55 },
      { affectedRows: 1 },
      { affectedRows: 1 },
    ]);
    const { reply, state } = makeReply();

    await ctrl.createStockTransferFromFrontendHandler(
      request({
        query: { orgId: '5' },
        body: { variant_id: 9, from_warehouse_id: 1, to_warehouse_id: 2, quantity: 3 },
      }),
      reply,
    );

    expect(state.statusCode).toBe(201);
    expect(state.body).toEqual({ id: 55 });
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'INSERT INTO stock_transfers')?.params).toEqual([9, 1, 2, 3, 'pending', 1]);
    expect(findCall(calls, 'INSERT INTO inventory_logs')?.params.slice(0, 4)).toEqual([9, 1, 'out', -3]);
  });

  it('rejects a foreign warehouse without writing anything', async () => {
    mockPool({ accessGranted: true });
    const { conn, calls } = makeConn([[]]); // warehouse ownership check fails
    const { reply } = makeReply();

    await expect(
      ctrl.createStockTransferFromFrontendHandler(
        request({
          query: { orgId: '5' },
          body: { variant_id: 9, from_warehouse_id: 999, to_warehouse_id: 2, quantity: 3 },
        }),
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'INSERT INTO stock_transfers')).toBeUndefined();
    expect(findCall(calls, 'UPDATE product_variants')).toBeUndefined();
  });
});

// ── Warehouses / suppliers ──────────────────────────────────────────────────

describe('warehouse contracts', () => {
  it('supports pagination, search and total', async () => {
    mockPool({ accessGranted: true, counts: { warehouses: 3 }, rows: { warehouses: [{ id: 1 }] } });
    const { reply, state } = makeReply();

    await ctrl.listWarehousesHandler(
      request({ query: { orgId: '5', page: '2', limit: '500', search: 'main' } }),
      reply,
    );

    const listCall = findCall(callsOf(), 'LIMIT ? OFFSET ?');
    expect(listCall?.sql).toContain('FROM warehouses');
    expect(listCall?.sql).toContain('LIMIT ? OFFSET ?');
    expect(listCall?.params).toEqual([5, '%main%', '%main%', 500, 500]);
    expect(state.body).toMatchObject({ total: 3, page: 2, limit: 500 });
  });

  it('supports the status-only archive update', async () => {
    mockPool({ accessGranted: true });
    executeMock.mockResolvedValueOnce([[{ ok: 1 }], []]); // org access
    executeMock.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const { reply, state } = makeReply();

    await ctrl.updateWarehouseHandler(
      request({ query: { orgId: '5' }, params: { id: '4' }, body: { status: 'archived' } }),
      reply,
    );

    expect(state.body).toEqual({ success: true });
    const updateCall = findCall(callsOf(), 'UPDATE warehouses');
    expect(updateCall?.sql).toContain('SET status = ?');
    expect(updateCall?.sql).not.toContain('name = ?');
    expect(updateCall?.params).toEqual(['archived', 4, 5]);
  });
});

describe('supplier contracts', () => {
  it('accepts snake_case create payloads', async () => {
    mockPool({ accessGranted: true });
    executeMock.mockResolvedValueOnce([[{ ok: 1 }], []]); // org access
    executeMock.mockResolvedValueOnce([{ insertId: 9 }, []]);
    const { reply, state } = makeReply();

    await ctrl.createSupplierHandler(
      request({
        query: { orgId: '5' },
        body: { name: 'Acme', contact_person: 'Alice', lead_time_days: 5, payment_terms: 'Net 30' },
      }),
      reply,
    );

    expect(state.statusCode).toBe(201);
    const insert = findCall(callsOf(), 'INSERT INTO suppliers');
    expect(insert?.params).toEqual([5, 'Acme', 'Alice', null, null, 'Net 30', 5, 'active']);
  });

  it('still accepts legacy camelCase create payloads', async () => {
    mockPool({ accessGranted: true });
    executeMock.mockResolvedValueOnce([[{ ok: 1 }], []]);
    executeMock.mockResolvedValueOnce([{ insertId: 9 }, []]);
    const { reply } = makeReply();

    await ctrl.createSupplierHandler(
      request({
        query: { orgId: '5' },
        body: { name: 'Acme', contactName: 'Alice', leadTimeDays: 5, paymentTerms: 'Net 30' },
      }),
      reply,
    );

    const insert = findCall(callsOf(), 'INSERT INTO suppliers');
    expect(insert?.params).toEqual([5, 'Acme', 'Alice', null, null, 'Net 30', 5, 'active']);
  });

  it('returns contact_person plus total/page/limit', async () => {
    mockPool({ accessGranted: true, counts: { suppliers: 1 }, rows: { suppliers: [{ id: 3, contact_person: 'Alice' }] } });
    const { reply, state } = makeReply();

    await ctrl.listSuppliersHandler(request({ query: { orgId: '5' } }), reply);

    const listCall = findCall(callsOf(), 'contact_name AS contact_person');
    expect(listCall?.sql).toContain('LIMIT ? OFFSET ?');
    expect(listCall?.params).toEqual([5, 20, 0]);
    expect(state.body).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(state.body.data[0].contact_person).toBe('Alice');
  });
});

// ── Purchase orders ─────────────────────────────────────────────────────────

describe('purchase order contracts', () => {
  it('accepts snake_case create payloads and keeps Phase A ownership checks', async () => {
    mockPool({ accessGranted: true });
    const { conn, calls } = makeConn([
      [{ id: 12 }], // supplier owned
      [{ id: 13 }], // warehouse owned
      [{ id: 7 }], // variant owned
      { insertId: 44 },
      { affectedRows: 1 },
      { affectedRows: 1 },
    ]);
    const { reply, state } = makeReply();

    await ctrl.createPurchaseOrderHandler(
      request({
        query: { orgId: '5' },
        body: {
          supplier_id: 12,
          warehouse_id: 13,
          notes: 'restock',
          items: [{ variant_id: 7, quantity: 2, unit_cost: 3.5 }],
        },
      }),
      reply,
    );

    expect(state.statusCode).toBe(201);
    expect(state.body).toEqual({ id: 44 });
    expect(findCall(calls, 'INSERT INTO purchase_orders')?.params).toEqual([5, 12, 13, 'restock', 1]);
    expect(findCall(calls, 'INSERT INTO purchase_order_items')?.params).toEqual([44, 7, 2, 3.5, 7]);
  });

  it('returns warehouse_name, total and pagination in the list', async () => {
    mockPool({
      accessGranted: true,
      counts: { purchaseOrders: 1 },
      rows: { purchaseOrders: [{ id: 44, warehouse_name: 'Main', total_cost: '10.00' }] },
    });
    const { reply, state } = makeReply();

    await ctrl.listPurchaseOrdersHandler(request({ query: { orgId: '5' } }), reply);

    const listCall = findCall(callsOf(), 'warehouse_name');
    expect(listCall?.sql).toContain('LEFT JOIN warehouses');
    expect(listCall?.sql).toContain('LIMIT ? OFFSET ?');
    expect(state.body).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(state.body.data[0].warehouse_name).toBe('Main');
  });

  it('returns detail in both the frontend ({data}) and legacy shapes', async () => {
    mockPool({
      accessGranted: true,
      rows: {
        purchaseOrders: [{ id: 44, supplier_name: 'Acme', warehouse_name: 'Main', status: 'draft' }],
        poItems: [{ variant_id: 7, quantity: 2, unit_cost: '3.50', total_cost: '7.00' }],
      },
    });
    const { reply, state } = makeReply();

    await ctrl.getPurchaseOrderHandler(request({ query: { orgId: '5' }, params: { id: '44' } }), reply);

    expect(state.body.id).toBe(44); // legacy
    expect(state.body.data).toMatchObject({ id: 44, supplier_name: 'Acme', warehouse_name: 'Main' });
    expect(state.body.data.items).toHaveLength(1);
    expect(state.body.items).toHaveLength(1);
  });

  it('maps supported status actions to the existing guarded transitions', async () => {
    mockPool({ accessGranted: true, rows: { poStatus: [{ id: 44, status: 'draft' }] } });
    executeMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes('FROM organisations o')) return [[{ ok: 1 }], []];
      if (s.includes('COUNT(*) AS total')) return [[{ total: 0 }], []];
      if (s.includes('FROM purchase_orders')) return [[{ id: 44, status: 'draft' }], []];
      return [[], []];
    });
    const { reply, state } = makeReply();

    await ctrl.updatePurchaseOrderStatusHandler(
      request({ query: { orgId: '5' }, params: { id: '44' }, body: { status: 'submitted' } }),
      reply,
    );

    expect(state.body).toEqual({ success: true });
    expect(findCall(callsOf(), 'UPDATE purchase_orders SET status = ?')?.params).toEqual(['submitted', 44]);
  });

  it('rejects unsupported status targets without any transition', async () => {
    mockPool({ accessGranted: true });
    const { reply } = makeReply();

    await expect(
      ctrl.updatePurchaseOrderStatusHandler(
        request({ query: { orgId: '5' }, params: { id: '44' }, body: { status: 'draft' } }),
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(findCall(callsOf(), 'UPDATE purchase_orders')).toBeUndefined();
  });

  it('rejects invalid transitions through the existing guard', async () => {
    mockPool({ accessGranted: true });
    executeMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes('FROM organisations o')) return [[{ ok: 1 }], []];
      if (s.includes('FROM purchase_orders')) return [[{ id: 44, status: 'received' }], []];
      return [[], []];
    });
    const { reply, state } = makeReply();

    await ctrl.updatePurchaseOrderStatusHandler(
      request({ query: { orgId: '5' }, params: { id: '44' }, body: { status: 'submitted' } }),
      reply,
    );

    expect(state.statusCode).toBe(400);
    expect(findCall(callsOf(), 'UPDATE purchase_orders SET status')).toBeUndefined();
  });
});

// ── Inventory logs ──────────────────────────────────────────────────────────

describe('inventory log contracts', () => {
  it('returns the frontend aliases with filters, pagination and tenant scope', async () => {
    mockPool({
      accessGranted: true,
      counts: { logs: 1 },
      rows: {
        logs: [{
          id: 1,
          quantity_change: -2,
          quantity_before: 5,
          quantity_after: 3,
          warehouse_name: 'Main',
        }],
      },
    });
    const { reply, state } = makeReply();

    await ctrl.getInventoryLogsHandler(
      request({ query: { orgId: '5', page: '1', limit: '20', variant_id: '9', from: '2026-01-01' } }),
      reply,
    );

    const countCall = findCall(callsOf(), 'FROM inventory_logs');
    expect(countCall?.sql).toContain('p.seller_id = ?');
    expect(countCall?.params).toEqual([5, 9, '2026-01-01']);

    const listCall = findCall(callsOf(), 'quantity AS quantity_change');
    expect(listCall?.sql).toContain('warehouse_name');
    expect(listCall?.sql).toContain('LIMIT ? OFFSET ?');
    expect(listCall?.params).toEqual([5, 9, '2026-01-01', 20, 0]);

    expect(state.body).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(state.body.data[0]).toMatchObject({
      quantity_change: -2,
      quantity_before: 5,
      quantity_after: 3,
      warehouse_name: 'Main',
    });
  });
});
