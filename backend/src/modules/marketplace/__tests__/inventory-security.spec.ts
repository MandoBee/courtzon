import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * W1-F-007 Phase A — Inventory tenant isolation and IDOR remediation.
 *
 * Mocked-only tests (no MySQL, no SQL execution). They lock down:
 *   • organisation scope resolution (owner / membership / role scope /
 *     platform admin) and rejection of client-supplied `orgId` overrides;
 *   • cross-organisation variant adjustment rejection with rollback and no
 *     stock write or inventory-log insert;
 *   • ownership validation of referenced suppliers, warehouses and variants
 *     in purchase orders and stock transfers;
 *   • product-ownership scoping of inventory logs and stock-transfer lists.
 */

const executeMock = vi.fn();
const getConnectionMock = vi.fn();

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: executeMock, query: executeMock, getConnection: getConnectionMock }),
}));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));

const {
  listWarehousesHandler,
  listSuppliersHandler,
  listStockTransfersHandler,
  getInventoryLogsHandler,
  adjustStockHandler,
  createPurchaseOrderHandler,
  updatePurchaseOrderHandler,
  createStockTransferHandler,
  completeStockTransferHandler,
} = await import('../presentation/inventory.controller.js');

interface PoolOptions {
  /** Org ids returned by findPermittedOrgIds when no orgId is supplied. */
  accessible?: number[];
  /** Whether userCanAccessOrganisation accepts the requested org. */
  accessGranted?: boolean;
  platformAdmin?: boolean;
  warehouses?: any[];
  suppliers?: any[];
  logs?: any[];
  transfers?: any[];
  purchaseOrders?: any[];
}

function mockPool(options: PoolOptions = {}) {
  executeMock.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (s.includes('SELECT DISTINCT o.id, o.name')) {
      return [(options.accessible ?? []).map((id) => ({ id })), []];
    }
    if (s.includes('FROM organisations o')) {
      return [options.accessGranted ? [{ ok: 1 }] : [], []];
    }
    if (s.includes("r.slug IN ('super_admin'")) {
      return [options.platformAdmin ? [{ ok: 1 }] : [], []];
    }
    if (s.includes('FROM inventory_logs')) return [options.logs ?? [], []];
    if (s.includes('FROM stock_transfers')) return [options.transfers ?? [], []];
    if (s.includes('FROM warehouses WHERE organisation_id')) return [options.warehouses ?? [], []];
    if (s.includes('FROM suppliers WHERE organisation_id')) return [options.suppliers ?? [], []];
    if (s.includes('FROM purchase_orders po')) return [options.purchaseOrders ?? [], []];
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

const findCall = (calls: Array<{ sql: string; params: any[] }>, needle: string) =>
  calls.find((c) => c.sql.includes(needle));

beforeEach(() => {
  vi.clearAllMocks();
  executeMock.mockReset();
  getConnectionMock.mockReset();
});

// ── Organisation scope resolution ───────────────────────────────────────────

describe('inventory tenant resolution', () => {
  it('resolves the single organisation of an owner without a client orgId', async () => {
    mockPool({ accessible: [5], warehouses: [] });
    const { reply, state } = makeReply();

    await listWarehousesHandler(request(), reply);

    expect(state.statusCode).toBe(200);
    const warehouseCall = findCall(
      executeMock.mock.calls.map(([sql, params]: any[]) => ({ sql: String(sql), params })),
      'FROM warehouses WHERE organisation_id',
    );
    expect(warehouseCall?.params).toEqual([5]);
  });

  it('supports organisation staff/admin granted through an organisation role scope', async () => {
    mockPool({ accessible: [7], suppliers: [] });
    const { reply, state } = makeReply();

    await listSuppliersHandler(request(), reply);

    expect(state.statusCode).toBe(200);
    const supplierCall = findCall(
      executeMock.mock.calls.map(([sql, params]: any[]) => ({ sql: String(sql), params })),
      'FROM suppliers WHERE organisation_id',
    );
    expect(supplierCall?.params).toEqual([7]);
  });

  it('rejects an orgId override without membership (403) and never queries the data', async () => {
    mockPool({ accessGranted: false });
    const { reply } = makeReply();

    await expect(listWarehousesHandler(request({ query: { orgId: '99' } }), reply)).rejects.toMatchObject({
      statusCode: 403,
      errorCode: 'FORBIDDEN',
    });

    const warehouseQuery = findCall(
      executeMock.mock.calls.map(([sql, params]: any[]) => ({ sql: String(sql), params })),
      'FROM warehouses WHERE organisation_id',
    );
    expect(warehouseQuery).toBeUndefined();
  });

  it('denies a user with no permitted organisation (403)', async () => {
    mockPool({ accessible: [], platformAdmin: false });
    const { reply } = makeReply();

    await expect(listWarehousesHandler(request(), reply)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows a platform administrator to name an organisation explicitly', async () => {
    mockPool({ accessGranted: true, warehouses: [] });
    const { reply, state } = makeReply();

    await listWarehousesHandler(request({ query: { orgId: '42' } }), reply);

    expect(state.statusCode).toBe(200);
    const warehouseCall = findCall(
      executeMock.mock.calls.map(([sql, params]: any[]) => ({ sql: String(sql), params })),
      'FROM warehouses WHERE organisation_id',
    );
    expect(warehouseCall?.params).toEqual([42]);
  });

  it('requires an explicit organisation for a platform administrator (no implicit tenant)', async () => {
    mockPool({ platformAdmin: true });
    const { reply } = makeReply();

    await expect(listWarehousesHandler(request(), reply)).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
    });
  });

  it('requires orgId when the actor can access multiple organisations', async () => {
    mockPool({ accessible: [3, 4] });
    const { reply } = makeReply();

    await expect(listSuppliersHandler(request(), reply)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('treats a malformed orgId as a validation error', async () => {
    mockPool({});
    const { reply } = makeReply();

    await expect(listWarehousesHandler(request({ query: { orgId: 'abc' } }), reply)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

// ── Stock adjustment ownership ──────────────────────────────────────────────

describe('stock adjustment ownership', () => {
  it('rejects a variant owned by another organisation (404) with rollback and no writes', async () => {
    mockPool({ accessGranted: true });
    const { conn, calls } = makeConn([[]]); // scoped variant lookup → no row
    const { reply } = makeReply();

    await expect(
      adjustStockHandler(request({ query: { orgId: '5' }, params: { variantId: '77' }, body: { quantity: 10 } }), reply),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(findCall(calls, 'UPDATE product_variants')).toBeUndefined();
    expect(findCall(calls, 'INSERT INTO inventory_logs')).toBeUndefined();
  });

  it('adjusts a variant whose product belongs to the resolved organisation', async () => {
    mockPool({ accessGranted: true });
    const { conn, calls } = makeConn([
      [{ id: 77, quantity: 10, product_id: 9, organisation_id: 5 }],
      { affectedRows: 1 },
      { affectedRows: 1 },
    ]);
    const { reply, state } = makeReply();

    await adjustStockHandler(
      request({ query: { orgId: '5' }, params: { variantId: '77' }, body: { quantity: 4, reason: 'count' } }),
      reply,
    );

    expect(state.body).toMatchObject({ success: true, stockBefore: 10, stockAfter: 4 });
    expect(conn.commit).toHaveBeenCalledTimes(1);
    const variantLookup = findCall(calls, 'FROM product_variants pv');
    expect(variantLookup?.sql).toContain('p.seller_id = ?');
    expect(variantLookup?.params).toEqual([77, 5]);
    expect(findCall(calls, 'INSERT INTO inventory_logs')).toBeDefined();
    expect(findCall(calls, 'UPDATE product_variants')).toBeDefined();
  });
});

// ── Referenced entity ownership ─────────────────────────────────────────────

describe('purchase order referenced-entity ownership', () => {
  it('rejects a foreign supplier on create (400), rolls back and inserts nothing', async () => {
    mockPool({ accessGranted: true });
    const { conn, calls } = makeConn([[]]); // supplier ownership check fails
    const { reply } = makeReply();

    await expect(
      createPurchaseOrderHandler(
        request({ query: { orgId: '5' }, body: { supplierId: 999, items: [] } }),
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'INSERT INTO purchase_orders')).toBeUndefined();
  });

  it('rejects a foreign warehouse on create (400) without inserting', async () => {
    mockPool({ accessGranted: true });
    const { conn, calls } = makeConn([[{ id: 12 }], []]); // supplier ok, warehouse fails
    const { reply } = makeReply();

    await expect(
      createPurchaseOrderHandler(
        request({ query: { orgId: '5' }, body: { supplierId: 12, warehouseId: 999, items: [] } }),
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'INSERT INTO purchase_orders')).toBeUndefined();
  });

  it('rejects a foreign variant line on create (400)', async () => {
    mockPool({ accessGranted: true });
    const { conn, calls } = makeConn([[{ id: 12 }], [{ id: 13 }], []]); // supplier, warehouse, variant fails
    const { reply } = makeReply();

    await expect(
      createPurchaseOrderHandler(
        request({
          query: { orgId: '5' },
          body: { supplierId: 12, warehouseId: 13, items: [{ variantId: 999, quantity: 1, unitCost: 5 }] },
        }),
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'INSERT INTO purchase_order_items')).toBeUndefined();
  });

  it('creates an order when all references belong to the organisation', async () => {
    mockPool({ accessGranted: true });
    const { conn } = makeConn([[{ id: 12 }], [{ id: 13 }], { insertId: 44 }, { affectedRows: 1 }]);
    const { reply, state } = makeReply();

    await createPurchaseOrderHandler(
      request({ query: { orgId: '5' }, body: { supplierId: 12, warehouseId: 13, items: [] } }),
      reply,
    );

    expect(state.statusCode).toBe(201);
    expect(state.body).toEqual({ id: 44 });
    expect(conn.commit).toHaveBeenCalledTimes(1);
  });

  it('rejects a foreign supplier on purchase-order update (400)', async () => {
    mockPool({ accessGranted: true });
    const { conn, calls } = makeConn([[{ id: 44, status: 'draft' }], []]); // PO lock ok, supplier fails
    const { reply } = makeReply();

    await expect(
      updatePurchaseOrderHandler(
        request({ query: { orgId: '5' }, params: { id: '44' }, body: { supplierId: 999, items: [] } }),
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'UPDATE purchase_orders')).toBeUndefined();
  });
});

describe('stock transfer referenced-entity ownership', () => {
  it('rejects a foreign source warehouse (400)', async () => {
    mockPool({ accessGranted: true });
    const { conn, calls } = makeConn([[]]); // from warehouse ownership check fails
    const { reply } = makeReply();

    await expect(
      createStockTransferHandler(
        request({
          query: { orgId: '5' },
          body: { variantId: 1, fromWarehouseId: 999, toWarehouseId: 2, quantity: 1 },
        }),
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'INSERT INTO stock_transfers')).toBeUndefined();
    expect(findCall(calls, 'UPDATE product_variants')).toBeUndefined();
  });

  it('rejects a foreign destination warehouse (400)', async () => {
    mockPool({ accessGranted: true });
    const { conn, calls } = makeConn([[{ id: 1 }], []]); // from ok, to fails
    const { reply } = makeReply();

    await expect(
      createStockTransferHandler(
        request({
          query: { orgId: '5' },
          body: { variantId: 1, fromWarehouseId: 1, toWarehouseId: 999, quantity: 1 },
        }),
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'INSERT INTO stock_transfers')).toBeUndefined();
  });

  it('rejects a foreign variant (400)', async () => {
    mockPool({ accessGranted: true });
    const { conn, calls } = makeConn([[{ id: 1 }], [{ id: 2 }], []]); // warehouses ok, variant fails
    const { reply } = makeReply();

    await expect(
      createStockTransferHandler(
        request({
          query: { orgId: '5' },
          body: { variantId: 999, fromWarehouseId: 1, toWarehouseId: 2, quantity: 1 },
        }),
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'INSERT INTO stock_transfers')).toBeUndefined();
  });

  it('completes an owned transfer only (foreign transfer → 404, rollback)', async () => {
    mockPool({ accessGranted: true });
    const { conn, calls } = makeConn([[]]); // scoped transfer lookup → no row
    const { reply } = makeReply();

    await expect(
      completeStockTransferHandler(request({ query: { orgId: '5' }, params: { id: '9' } }), reply),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'UPDATE product_variants')).toBeUndefined();
    expect(findCall(calls, 'INSERT INTO inventory_logs')).toBeUndefined();
  });

  it('scopes the transfer list through product ownership', async () => {
    mockPool({ accessible: [5], transfers: [] });
    const { reply, state } = makeReply();

    await listStockTransfersHandler(request(), reply);

    expect(state.statusCode).toBe(200);
    const listCall = findCall(
      executeMock.mock.calls.map(([sql, params]: any[]) => ({ sql: String(sql), params })),
      'FROM stock_transfers',
    );
    expect(listCall?.sql).toContain('WHERE p.seller_id = ?');
    expect(listCall?.params).toEqual([5]);
  });
});

// ── Inventory logs ──────────────────────────────────────────────────────────

describe('inventory logs tenant isolation', () => {
  it('scopes log queries to the resolved organisation and keeps filters inside it', async () => {
    mockPool({ accessible: [5], logs: [{ id: 1 }] });
    const { reply, state } = makeReply();

    await getInventoryLogsHandler(request({ query: { variantId: '9', from: '2026-01-01' } }), reply);

    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({ data: [{ id: 1 }], total: 0, page: 1, limit: 20 });

    const logsCall = findCall(
      executeMock.mock.calls.map(([sql, params]: any[]) => ({ sql: String(sql), params })),
      'FROM inventory_logs',
    );
    expect(logsCall?.sql).toContain('WHERE p.seller_id = ?');
    expect(logsCall?.params).toEqual([5, 9, '2026-01-01']);
  });

  it('rejects a foreign orgId on log access without querying logs (403)', async () => {
    mockPool({ accessGranted: false });
    const { reply } = makeReply();

    await expect(
      getInventoryLogsHandler(request({ query: { orgId: '99' } }), reply),
    ).rejects.toMatchObject({ statusCode: 403 });

    const logsCall = findCall(
      executeMock.mock.calls.map(([sql, params]: any[]) => ({ sql: String(sql), params })),
      'FROM inventory_logs',
    );
    expect(logsCall).toBeUndefined();
  });
});
