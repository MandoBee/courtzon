import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * W1-F-007 Phase B.2 — Inventory business-integrity remediation (R1, R2, R7, R8).
 *
 * Mocked-only tests (no MySQL, no SQL execution). They lock down:
 *   • R1: transfers require valid, distinct, organisation-owned source and
 *     destination warehouses plus an owned variant before any mutation;
 *   • R2: cancelling a pending transfer restores exactly the deducted quantity,
 *     atomically and idempotently; non-pending and concurrent attempts conflict;
 *   • R7: the legacy stock-adjustment endpoint strictly validates variant id
 *     and quantity (integer, non-negative, finite, in range) before DB work;
 *   • R8: purchase-order items validate quantity/unit cost and are computed in
 *     integer cents before any header/item mutation.
 */

const executeMock = vi.fn();
const getConnectionMock = vi.fn();

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: executeMock, query: executeMock, getConnection: getConnectionMock }),
}));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));

const {
  createStockTransferHandler,
  cancelStockTransferHandler,
  completeStockTransferHandler,
  createStockTransferFromFrontendHandler,
  adjustStockHandler,
  adjustStockFromFrontendHandler,
  createPurchaseOrderHandler,
  updatePurchaseOrderHandler,
} = await import('../presentation/inventory.controller.js');

function mockOrgAccess(granted = true) {
  executeMock.mockImplementation(async (sql: string) => {
    if (String(sql).includes('FROM organisations o')) {
      return [granted ? [{ ok: 1 }] : [], []];
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
    query: { orgId: '5' },
    params: {},
    body: {},
    userId: 1,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'vitest' },
    ...overrides,
  } as any;
}

const findCall = (calls: Array<{ sql: string; params: any[] }>, needle: string) =>
  calls.find((call) => call.sql.includes(needle));

const transferBody = (overrides: Record<string, any> = {}) => ({
  variantId: 9,
  quantity: 3,
  fromWarehouseId: 1,
  toWarehouseId: 2,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  executeMock.mockReset();
  getConnectionMock.mockReset();
});

// ── R1 ──────────────────────────────────────────────────────────────────────

describe('R1 — stock transfer source/destination validation', () => {
  it.each([
    ['missing source', { fromWarehouseId: null }],
    ['empty source', { fromWarehouseId: '' }],
    ['missing destination', { toWarehouseId: null }],
    ['malformed source', { fromWarehouseId: 'abc' }],
    ['zero source', { fromWarehouseId: 0 }],
    ['negative destination', { toWarehouseId: -2 }],
    ['fractional source', { fromWarehouseId: 1.5 }],
  ])('rejects %s before any database work', async (_label, override) => {
    mockOrgAccess();
    const { reply } = makeReply();

    await expect(
      createStockTransferHandler(request({ body: transferBody(override) }), reply),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(getConnectionMock).not.toHaveBeenCalled();
  });

  it('rejects identical source and destination warehouses', async () => {
    mockOrgAccess();
    const { reply } = makeReply();

    await expect(
      createStockTransferHandler(request({ body: transferBody({ toWarehouseId: 1 }) }), reply),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(getConnectionMock).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, 'abc'])('rejects invalid quantity %s', async (quantity) => {
    mockOrgAccess();
    const { reply } = makeReply();

    await expect(
      createStockTransferHandler(request({ body: transferBody({ quantity }) }), reply),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(getConnectionMock).not.toHaveBeenCalled();
  });

  it('rejects a foreign source warehouse without writes', async () => {
    mockOrgAccess();
    const { conn, calls } = makeConn([[]]); // from-warehouse ownership fails
    const { reply } = makeReply();

    await expect(
      createStockTransferHandler(request({ body: transferBody() }), reply),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'INSERT INTO stock_transfers')).toBeUndefined();
    expect(findCall(calls, 'UPDATE product_variants')).toBeUndefined();
    expect(findCall(calls, 'INSERT INTO inventory_logs')).toBeUndefined();
  });

  it('rejects a foreign destination warehouse without writes', async () => {
    mockOrgAccess();
    const { conn, calls } = makeConn([[{ id: 1 }], []]); // from ok, to fails
    const { reply } = makeReply();

    await expect(
      createStockTransferHandler(request({ body: transferBody() }), reply),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'INSERT INTO stock_transfers')).toBeUndefined();
  });

  it('rejects a foreign variant without writes', async () => {
    mockOrgAccess();
    const { conn, calls } = makeConn([[{ id: 1 }], [{ id: 2 }], []]);
    const { reply } = makeReply();

    await expect(
      createStockTransferHandler(request({ body: transferBody() }), reply),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'INSERT INTO stock_transfers')).toBeUndefined();
  });

  it('creates a transfer with a valid source and deducts exactly once', async () => {
    mockOrgAccess();
    const { conn, calls } = makeConn([
      [{ id: 1 }],
      [{ id: 2 }],
      [{ id: 9, quantity: 10 }],
      { insertId: 55 },
      { affectedRows: 1 },
      { affectedRows: 1 },
    ]);
    const { reply, state } = makeReply();

    await createStockTransferHandler(request({ body: transferBody() }), reply);

    expect(state.statusCode).toBe(201);
    expect(state.body).toEqual({ id: 55 });
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'INSERT INTO stock_transfers')?.params).toEqual([9, 1, 2, 3, 'pending', 1]);
    expect(findCall(calls, 'INSERT INTO inventory_logs')?.params.slice(0, 4)).toEqual([9, 1, 'out', -3]);
    expect(findCall(calls, 'UPDATE product_variants')?.params).toEqual([7, 9]);
  });

  it('rejects insufficient stock with a rollback and no writes', async () => {
    mockOrgAccess();
    const { conn, calls } = makeConn([
      [{ id: 1 }],
      [{ id: 2 }],
      [{ id: 9, quantity: 2 }],
    ]);
    const { reply, state } = makeReply();

    await createStockTransferHandler(request({ body: transferBody({ quantity: 3 }) }), reply);

    expect(state.statusCode).toBe(400);
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(findCall(calls, 'INSERT INTO stock_transfers')).toBeUndefined();
  });

  it('frontend adapter also requires both warehouses and distinct ids', async () => {
    mockOrgAccess();
    const { reply } = makeReply();

    await expect(
      createStockTransferFromFrontendHandler(
        request({ body: { variant_id: 9, quantity: 1, from_warehouse_id: 1, to_warehouse_id: 1 } }),
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(getConnectionMock).not.toHaveBeenCalled();
  });
});

// ── R2 ──────────────────────────────────────────────────────────────────────

describe('R2 — pending transfer cancellation', () => {
  it('restores exactly the deducted quantity atomically', async () => {
    mockOrgAccess();
    const { conn, calls } = makeConn([
      [{ id: 7, variant_id: 9, from_warehouse_id: 1, to_warehouse_id: 2, quantity: 3, status: 'pending' }],
      [{ id: 2 }],
      [{ id: 100, warehouse_id: 1, quantity: -3 }],
      [{ id: 1 }],
      [{ id: 9, quantity: 4 }],
      { affectedRows: 1 },
      { affectedRows: 1 },
      { affectedRows: 1 },
    ]);
    const { reply, state } = makeReply();

    await cancelStockTransferHandler(request({ params: { id: '7' } }), reply);

    expect(state.body).toEqual({ success: true, restored: true, restoredQuantity: 3 });
    expect(conn.commit).toHaveBeenCalledTimes(1);
    const restoreLog = findCall(calls, 'INSERT INTO inventory_logs');
    expect(restoreLog?.params.slice(0, 6)).toEqual([9, 1, 'return', 3, 4, 7]);
    expect(findCall(calls, 'UPDATE product_variants')?.params).toEqual([7, 9]);
    expect(findCall(calls, "UPDATE stock_transfers SET status = 'cancelled'")?.params).toEqual([7]);
  });

  it('restores from the recorded deduction when the source warehouse was removed (NULL)', async () => {
    mockOrgAccess();
    const { conn } = makeConn([
      [{ id: 7, variant_id: 9, from_warehouse_id: null, to_warehouse_id: 2, quantity: 3, status: 'pending' }],
      [{ id: 2 }],
      [{ id: 100, warehouse_id: 1, quantity: -3 }],
      [{ id: 9, quantity: 0 }],
      { affectedRows: 1 },
      { affectedRows: 1 },
      { affectedRows: 1 },
    ]);
    const { reply, state } = makeReply();

    await cancelStockTransferHandler(request({ params: { id: '7' } }), reply);

    expect(state.body).toEqual({ success: true, restored: true, restoredQuantity: 3 });
  });

  it('cancels legacy transfers that never deducted without changing stock', async () => {
    mockOrgAccess();
    const { conn, calls } = makeConn([
      [{ id: 7, variant_id: 9, from_warehouse_id: null, to_warehouse_id: 2, quantity: 3, status: 'pending' }],
      [{ id: 2 }],
      [],
      { affectedRows: 1 },
    ]);
    const { reply, state } = makeReply();

    await cancelStockTransferHandler(request({ params: { id: '7' } }), reply);

    expect(state.body).toEqual({ success: true, restored: false, restoredQuantity: 0 });
    expect(findCall(calls, 'INSERT INTO inventory_logs')).toBeUndefined();
    expect(findCall(calls, 'UPDATE product_variants')).toBeUndefined();
    expect(conn.commit).toHaveBeenCalledTimes(1);
  });

  it.each(['completed', 'cancelled'])('rejects cancelling a %s transfer (409)', async (status) => {
    mockOrgAccess();
    const { conn, calls } = makeConn([[{ id: 7, variant_id: 9, quantity: 3, status }]]);
    const { reply } = makeReply();

    await expect(
      cancelStockTransferHandler(request({ params: { id: '7' } }), reply),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'INSERT INTO inventory_logs')).toBeUndefined();
    expect(findCall(calls, 'UPDATE product_variants')).toBeUndefined();
  });

  it('returns 404 for a missing or foreign transfer without writes', async () => {
    mockOrgAccess();
    const { conn, calls } = makeConn([[]]);
    const { reply } = makeReply();

    await expect(
      cancelStockTransferHandler(request({ params: { id: '7' } }), reply),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'UPDATE stock_transfers')).toBeUndefined();
  });

  it('fails closed when the guarded status update loses a race (409)', async () => {
    mockOrgAccess();
    const { conn } = makeConn([
      [{ id: 7, variant_id: 9, from_warehouse_id: 1, to_warehouse_id: 2, quantity: 3, status: 'pending' }],
      [{ id: 2 }],
      [{ id: 100, warehouse_id: 1, quantity: -3 }],
      [{ id: 1 }],
      [{ id: 9, quantity: 4 }],
      { affectedRows: 1 }, // restore log
      { affectedRows: 1 }, // variant update
      { affectedRows: 0 }, // status update lost the race
    ]);
    const { reply } = makeReply();

    await expect(
      cancelStockTransferHandler(request({ params: { id: '7' } }), reply),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('repeated cancellation restores only once (second attempt conflicts)', async () => {
    mockOrgAccess();
    const first = makeConn([
      [{ id: 7, variant_id: 9, from_warehouse_id: 1, to_warehouse_id: 2, quantity: 3, status: 'pending' }],
      [{ id: 2 }],
      [{ id: 100, warehouse_id: 1, quantity: -3 }],
      [{ id: 1 }],
      [{ id: 9, quantity: 4 }],
      { affectedRows: 1 },
      { affectedRows: 1 },
      { affectedRows: 1 },
    ]);
    const firstReply = makeReply();
    await cancelStockTransferHandler(request({ params: { id: '7' } }), firstReply.reply);
    expect(firstReply.state.body).toMatchObject({ restored: true });

    mockOrgAccess();
    const second = makeConn([[{ id: 7, variant_id: 9, quantity: 3, status: 'cancelled' }]]);
    const secondReply = makeReply();
    await expect(
      cancelStockTransferHandler(request({ params: { id: '7' } }), secondReply.reply),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(findCall(second.calls, 'INSERT INTO inventory_logs')).toBeUndefined();
  });

  it('completion after cancellation is rejected and does not move stock', async () => {
    mockOrgAccess();
    const { conn, calls } = makeConn([[]]); // status='pending' scoped lookup finds nothing
    const { reply } = makeReply();

    await expect(
      completeStockTransferHandler(request({ params: { id: '7' } }), reply),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'UPDATE product_variants')).toBeUndefined();
  });
});

// ── Completion / cancellation ordering (deterministic, mocked) ─────────────

interface TransferHarnessState {
  status: 'pending' | 'completed' | 'cancelled';
  quantity: number;
  logs: any[][];
}

/**
 * Minimal in-memory transfer store shared by both handlers. Sequential calls
 * model the lock order: whichever operation runs first changes the status, and
 * the second operation must observe that status. No real database is involved.
 */
function makeTransferHarness(): { state: TransferHarnessState; conn: any } {
  const state: TransferHarnessState = { status: 'pending', quantity: 10, logs: [] };
  const conn: any = {
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
    execute: vi.fn(async (sql: string, params: any[]) => {
      const s = String(sql);
      if (s.includes('FROM stock_transfers st')) {
        const requiresPending = s.includes('st.status = ?');
        if (requiresPending && state.status !== 'pending') return [[], []];
        return [[{
          id: Number(params[0]),
          variant_id: 9,
          from_warehouse_id: 1,
          to_warehouse_id: 2,
          quantity: 3,
          status: state.status,
        }], []];
      }
      if (s.includes('INSERT INTO inventory_logs')) {
        state.logs.push(params);
        return [{ affectedRows: 1 }, []];
      }
      if (s.includes('FROM inventory_logs')) {
        return [[{ id: 100, warehouse_id: 1, quantity: -3 }], []];
      }
      if (s.includes('FROM warehouses')) return [[{ id: params[0] }], []];
      if (s.includes('SELECT pv.id, pv.quantity')) return [[{ id: 9, quantity: state.quantity }], []];
      if (s.includes('UPDATE product_variants')) {
        state.quantity = Number(params[0]);
        return [{ affectedRows: 1 }, []];
      }
      if (s.includes("SET status = 'completed'")) {
        if (state.status !== 'pending') return [{ affectedRows: 0 }, []];
        state.status = 'completed';
        return [{ affectedRows: 1 }, []];
      }
      if (s.includes("SET status = 'cancelled'")) {
        if (state.status !== 'pending') return [{ affectedRows: 0 }, []];
        state.status = 'cancelled';
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    }),
  };
  return { state, conn };
}

describe('transfer completion/cancellation ordering', () => {
  it('cancellation first: completion cannot complete the cancelled transfer', async () => {
    mockOrgAccess();
    const { state, conn } = makeTransferHarness();
    getConnectionMock.mockResolvedValue(conn);

    const cancelReply = makeReply();
    await cancelStockTransferHandler(request({ params: { id: '7' } }), cancelReply.reply);

    expect(state.status).toBe('cancelled');
    expect(state.quantity).toBe(13); // 10 + restored 3
    expect(state.logs.filter((log) => log[2] === 'return')).toHaveLength(1);

    mockOrgAccess();
    const completeReply = makeReply();
    await expect(
      completeStockTransferHandler(request({ params: { id: '7' } }), completeReply.reply),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(state.status).toBe('cancelled');
    expect(state.quantity).toBe(13); // no second movement
    expect(state.logs.filter((log) => log[2] === 'return')).toHaveLength(1);
    expect(state.logs.filter((log) => log[2] === 'in')).toHaveLength(0);
  });

  it('completion first: cancellation cannot restore stock', async () => {
    mockOrgAccess();
    const { state, conn } = makeTransferHarness();
    getConnectionMock.mockResolvedValue(conn);

    const completeReply = makeReply();
    await completeStockTransferHandler(request({ params: { id: '7' } }), completeReply.reply);

    expect(state.status).toBe('completed');
    expect(state.quantity).toBe(13); // completion added the destination quantity
    expect(state.logs.filter((log) => log[2] === 'return')).toHaveLength(0);

    mockOrgAccess();
    const cancelReply = makeReply();
    await expect(
      cancelStockTransferHandler(request({ params: { id: '7' } }), cancelReply.reply),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(state.status).toBe('completed');
    expect(state.quantity).toBe(13); // no duplicate movement
    expect(state.logs.filter((log) => log[2] === 'return')).toHaveLength(0);
  });

  it('restoration happens at most once across repeated cancellations', async () => {
    mockOrgAccess();
    const { state, conn } = makeTransferHarness();
    getConnectionMock.mockResolvedValue(conn);

    const firstReply = makeReply();
    await cancelStockTransferHandler(request({ params: { id: '7' } }), firstReply.reply);
    expect(state.quantity).toBe(13);
    expect(state.logs.filter((log) => log[2] === 'return')).toHaveLength(1);

    mockOrgAccess();
    const secondReply = makeReply();
    await expect(
      cancelStockTransferHandler(request({ params: { id: '7' } }), secondReply.reply),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(state.quantity).toBe(13);
    expect(state.logs.filter((log) => log[2] === 'return')).toHaveLength(1);
    expect(state.status).toBe('cancelled');
  });
});


describe('R7 — legacy stock adjustment validation', () => {
  it.each([0, 7, '12'])('accepts valid quantity %s', async (quantity) => {
    mockOrgAccess();
    const { conn, calls } = makeConn([
      [{ id: 9, quantity: 5, product_id: 3, organisation_id: 5 }],
      { affectedRows: 1 },
      { affectedRows: 1 },
    ]);
    const { reply, state } = makeReply();

    await adjustStockHandler(
      request({ params: { variantId: '9' }, body: { quantity } }),
      reply,
    );

    expect(state.body).toMatchObject({ success: true, stockBefore: 5, stockAfter: Number(quantity) });
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(findCall(calls, 'INSERT INTO inventory_logs')).toBeDefined();
  });

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', 'NaN'],
    ['Infinity', 'Infinity'],
    ['empty', ''],
    ['malformed', '12abc'],
    ['hex', '0x10'],
    ['exponent', '1e3'],
    ['plus sign', '+5'],
    ['out of range', 4294967296],
  ])('rejects %s quantity before any database work', async (_label, quantity) => {
    mockOrgAccess();
    const { reply } = makeReply();

    await expect(
      adjustStockHandler(request({ params: { variantId: '9' }, body: { quantity } }), reply),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(getConnectionMock).not.toHaveBeenCalled();
  });

  it('rejects a missing quantity', async () => {
    mockOrgAccess();
    const { reply } = makeReply();

    await expect(
      adjustStockHandler(request({ params: { variantId: '9' }, body: {} }), reply),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it.each(['abc', '0', '-1', '1.5', '', undefined])('rejects malformed variant id %s', async (variantId) => {
    mockOrgAccess();
    const { reply } = makeReply();

    await expect(
      adjustStockHandler(
        request({ params: { variantId }, body: { quantity: 1 } }),
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(getConnectionMock).not.toHaveBeenCalled();
  });

  it('frontend POST adapter delegates to the same validated handler', async () => {
    mockOrgAccess();
    const { conn } = makeConn([
      [{ id: 9, quantity: 5, product_id: 3, organisation_id: 5 }],
      { affectedRows: 1 },
      { affectedRows: 1 },
    ]);
    const { reply, state } = makeReply();

    await adjustStockFromFrontendHandler(
      request({ query: { orgId: '5' }, body: { variant_id: 9, new_quantity: 3 } }),
      reply,
    );

    expect(state.body).toMatchObject({ success: true, stockBefore: 5, stockAfter: 3 });
    expect(conn.commit).toHaveBeenCalledTimes(1);
  });

  it('frontend POST adapter still rejects invalid quantities', async () => {
    mockOrgAccess();
    const { reply } = makeReply();

    await expect(
      adjustStockFromFrontendHandler(
        request({ body: { variant_id: 9, new_quantity: -1 } }),
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(getConnectionMock).not.toHaveBeenCalled();
  });
});

// ── R8 ──────────────────────────────────────────────────────────────────────

describe('R8 — purchase-order item validation', () => {
  const poBody = (items: any[]) => ({ supplierId: 12, warehouseId: 13, notes: 'n', items });

  it('computes line and order totals in cents (no float drift)', async () => {
    mockOrgAccess();
    const { conn, calls } = makeConn([
      [{ id: 12 }],
      [{ id: 13 }],
      [{ id: 7 }],
      [{ id: 8 }],
      { insertId: 44 },
      { affectedRows: 1 },
      { affectedRows: 1 },
      { affectedRows: 1 },
    ]);
    const { reply, state } = makeReply();

    await createPurchaseOrderHandler(
      request({
        body: poBody([
          { variantId: 7, quantity: 1, unitCost: 0.1 },
          { variantId: 8, quantity: 3, unitCost: 0.2 },
        ]),
      }),
      reply,
    );

    expect(state.statusCode).toBe(201);
    const itemCalls = calls.filter((c) => c.sql.includes('INSERT INTO purchase_order_items'));
    expect(itemCalls[0].params).toEqual([44, 7, 1, 0.1, 0.1]);
    expect(itemCalls[1].params).toEqual([44, 8, 3, 0.2, 0.6]);
    expect(findCall(calls, 'UPDATE purchase_orders SET total_cost')?.params).toEqual([0.7, 44]);
  });

  it.each([
    ['zero quantity', { quantity: 0, unitCost: 1 }],
    ['negative quantity', { quantity: -1, unitCost: 1 }],
    ['fractional quantity', { quantity: 1.5, unitCost: 1 }],
    ['negative cost', { quantity: 1, unitCost: -0.01 }],
    ['NaN cost', { quantity: 1, unitCost: 'NaN' }],
    ['Infinity cost', { quantity: 1, unitCost: 'Infinity' }],
    ['empty cost', { quantity: 1, unitCost: '' }],
    ['malformed cost', { quantity: 1, unitCost: '1.2.3' }],
    ['exponent cost', { quantity: 1, unitCost: '1e3' }],
    ['hex cost', { quantity: 1, unitCost: '0x10' }],
    ['missing cost', { quantity: 1 }],
    ['null cost', { quantity: 1, unitCost: null }],
    ['out-of-range cost', { quantity: 1, unitCost: 1000000000000 }],
    ['missing variant', { quantity: 1, unitCost: 1 }],
  ])('rejects %s before any database work', async (label, item) => {
    mockOrgAccess();
    const { reply } = makeReply();
    const payloadItem = label === 'missing variant'
      ? { quantity: item.quantity, unitCost: item.unitCost }
      : { variantId: 7, ...item };

    await expect(
      createPurchaseOrderHandler(request({ body: poBody([payloadItem]) }), reply),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(getConnectionMock).not.toHaveBeenCalled();
  });

  it('applies the same validation on update before any mutation', async () => {
    mockOrgAccess();
    const { reply } = makeReply();

    await expect(
      updatePurchaseOrderHandler(
        request({ params: { id: '44' }, body: poBody([{ variantId: 7, quantity: 1, unitCost: -5 }]) }),
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(getConnectionMock).not.toHaveBeenCalled();
  });

  it('recomputes valid totals on update', async () => {
    mockOrgAccess();
    const { conn, calls } = makeConn([
      [{ id: 44, status: 'draft' }],
      [{ id: 12 }],
      [{ id: 13 }],
      [{ id: 7 }],
      { affectedRows: 1 }, // header update
      { affectedRows: 1 }, // delete items
      { affectedRows: 1 }, // item insert
      { affectedRows: 1 }, // total update
    ]);
    const { reply, state } = makeReply();

    await updatePurchaseOrderHandler(
      request({
        params: { id: '44' },
        body: poBody([{ variantId: 7, quantity: 2, unitCost: 2.25 }]),
      }),
      reply,
    );

    expect(state.body).toEqual({ success: true });
    expect(findCall(calls, 'INSERT INTO purchase_order_items')?.params).toEqual([44, 7, 2, 2.25, 4.5]);
    expect(findCall(calls, 'UPDATE purchase_orders SET total_cost')?.params).toEqual([4.5, 44]);
    expect(conn.commit).toHaveBeenCalledTimes(1);
  });
});
