import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * B31 — concurrent double stock-restoration (REGRESSION SUITE).
 *
 * Before the fix, `handlePaymentFailed` restored stock and only then wrote the
 * terminal status, with no claim and no transaction. Two concurrent
 * `payment:failed` deliveries both read a non-terminal order, both restored the
 * same inventory, and the order was cancelled twice.
 *
 * Fix under test:
 *   `_cancelOrdersWithStockRestore()` runs ONE transaction that
 *     Phase 1 — claims each order with the conditional terminal UPDATE
 *               (`… WHERE status NOT IN ('cancelled','refunded')`),
 *     Phase 2 — restores stock only for the orders it claimed,
 *     Phase 3 — writes status history for the claimed orders.
 *   A duplicate/concurrent delivery claims 0 rows → restores nothing.
 *   A crash rolls the claim back → the next retry can still restore.
 *
 * Mocks only: no database, no network.
 */

const repoMock = vi.hoisted(() => ({} as Record<string, any>));
const mockEmit = vi.hoisted(() => vi.fn());
const mockGetPool = vi.hoisted(() => vi.fn(() => ({ execute: vi.fn(async () => [[], []]) })));

/** In-memory snapshot used by the withTransaction mock to emulate rollback. */
const txState = vi.hoisted(() => ({ snapshot: null as null | (() => void) }));

vi.mock('../../../database/mysql.js', () => ({ getPool: mockGetPool }));
vi.mock('../../../database/database.transaction.js', () => ({
  withTransaction: vi.fn(async (fn: (conn: unknown) => unknown) => {
    const restore = txState.snapshot;
    try {
      return await fn({ __tx: true });
    } catch (err) {
      restore?.(); // rollback: undo the claim and the partial inventory writes
      throw err;
    }
  }),
}));
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService: { charge: vi.fn() } }));
vi.mock('../../payment/infrastructure/repositories/payment.repository.js', () => ({ paymentRepository: {} }));
vi.mock('../../financial/application/commission.service.js', () => ({
  commissionService: { calculate: vi.fn(async () => ({ rate: 10, rateType: 'percentage', planName: 'Basic', commissionAmount: 10, netAmount: 90 })) },
}));
vi.mock('../../financial/application/transaction.service.js', () => ({ transactionService: {} }));
vi.mock('../../financial/infrastructure/transaction.repository.js', () => ({
  transactionRepository: { findBySource: vi.fn(async () => []), findById: vi.fn(async () => null), createTransaction: vi.fn(async () => 1), createTransactionEntry: vi.fn(async () => 1) },
}));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: {} }));
vi.mock('../../organisations/application/organisation.service.js', () => ({ organisationService: {} }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({
  getCurrentSubscription: vi.fn(async () => ({ exists: true, effectiveStatus: 'active' })),
}));
vi.mock('../../auth/infrastructure/repositories/user.repository.js', () => ({
  userRepository: { findById: vi.fn(async () => ({ id: 100, email: 'b@example.com', full_phone: '+20100', full_name: 'Buyer' })) },
}));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: mockEmit, on: vi.fn() } }));
vi.mock('../../financial/infrastructure/repositories/financial-entitlement.repository.js', () => ({
  financialEntitlementRepository: { findBySourceIds: vi.fn(async () => []), create: vi.fn(async () => 1), update: vi.fn(async () => true) },
}));
vi.mock('../../settlement/application/gateway-settlement.service.js', () => ({
  gatewaySettlementService: { detachPaymentTransaction: vi.fn(async () => ({ changed: false, paymentDetached: false, lineReleased: false, paymentId: 0, settlementId: null, lineId: null, releasedAmounts: null, before: null, after: null })) },
}));
vi.mock('../infrastructure/repositories/marketplace.repository.js', () => ({ marketplaceRepository: repoMock }));

import { marketplaceService } from '../application/marketplace.service.js';

const PAID_BUYER = 100;

type Order = { id: number; status: string; paid: boolean; group: string | null; items: Array<{ product_id: number | null; variant_id: number | null; quantity: number }> };

let orders: Map<number, Order>;
let stock: Map<number, number>;
let restoreCalls: Array<{ orderHint: string; qty: number }>;
let claimCalls: Array<{ id: number; status: string }>;
let failRestoreOnce: boolean;
let restoreGate: (() => Promise<void>) | null;

function orderRows(order: Order) {
  return order.items.map((item) => ({
    id: order.id,
    buyer_id: PAID_BUYER,
    status: order.status,
    payment_status: order.paid ? 'paid' : 'unpaid',
    checkout_group_id: order.group,
    product_id: item.product_id,
    variant_id: item.variant_id,
    quantity: item.quantity,
  }));
}

function snapshotState() {
  const orderCopy = [...orders.entries()].map(([id, o]) => [id, { ...o, items: o.items.map((i) => ({ ...i })) }] as const);
  const stockCopy = [...stock.entries()];
  return () => {
    orders = new Map(orderCopy.map(([id, o]) => [id, { ...o, items: o.items.map((i) => ({ ...i })) }]));
    stock = new Map(stockCopy);
  };
}

function makeOrder(id: number, opts: Partial<Order> = {}): Order {
  return { id, status: 'pending', paid: false, group: null, items: [{ product_id: 1, variant_id: null, quantity: 2 }], ...opts };
}

beforeEach(() => {
  orders = new Map([[500, makeOrder(500)]]);
  stock = new Map([[1, 10], [2, 10]]);
  restoreCalls = [];
  claimCalls = [];
  failRestoreOnce = false;
  restoreGate = null;
  vi.clearAllMocks();
  txState.snapshot = snapshotState();

  for (const key of Object.keys(repoMock)) delete repoMock[key];
  Object.assign(repoMock, {
    orderHasPaidPayment: vi.fn(async (id: number) => orders.get(Number(id))?.paid === true),
    findOrderById: vi.fn(async (id: number) => {
      const order = orders.get(Number(id));
      return order ? orderRows(order) : [];
    }),
    findOrderIdsByCheckoutGroup: vi.fn(async (group: string) =>
      [...orders.values()].filter((o) => o.group === group).map((o) => o.id).sort((a, b) => a - b),
    ),
    findAbandonedPendingOrders: vi.fn(async () => [...orders.values()].map((o) => ({ id: o.id, buyer_id: PAID_BUYER }))),
    // Atomic terminal claim — mirrors the SQL guard
    // `AND status NOT IN ('cancelled','refunded')` in the repository.
    updateOrderStatus: vi.fn(async (id: number, status: string, _reason?: string, _conn?: unknown) => {
      claimCalls.push({ id, status });
      const order = orders.get(Number(id));
      if (!order) return false;
      if ((status === 'cancelled' || status === 'refunded')
        && (order.status === 'cancelled' || order.status === 'refunded')) {
        return false;
      }
      order.status = status;
      return true;
    }),
    restoreStock: vi.fn(async (productId: number, _variantId: number | undefined, quantity: number, _conn?: unknown) => {
      if (failRestoreOnce) {
        failRestoreOnce = false;
        throw new Error('restore failed');
      }
      if (restoreGate) await restoreGate();
      restoreCalls.push({ orderHint: 'restore', qty: quantity });
      stock.set(productId, (stock.get(productId) ?? 0) + quantity);
    }),
    createOrderStatusHistory: vi.fn(async () => undefined),
  });
});

function failedEvent(orderId: number, paymentId = 1, reason = 'declined') {
  return { paymentId, referenceType: 'order', referenceId: orderId, amount: 500, reason };
}

describe('B31 — concurrent duplicate payment:failed', () => {
  it('restores stock EXACTLY ONCE when two failure events run concurrently', async () => {
    // Hold the winner's restore so the second delivery reaches its claim while
    // the first transaction is still open.
    let releaseRestore!: () => void;
    restoreGate = () => new Promise<void>((resolve) => { releaseRestore = resolve; });

    const first = marketplaceService.handlePaymentFailed(failedEvent(500, 1));
    await vi.waitFor(() => expect(restoreCalls).toHaveLength(0)); // waiting on the gate
    const second = marketplaceService.handlePaymentFailed(failedEvent(500, 2));

    // Second delivery must lose the atomic claim (status already cancelled in-tx).
    await vi.waitFor(() => expect(claimCalls.length).toBeGreaterThanOrEqual(2));

    releaseRestore();
    restoreGate = null;
    await Promise.all([first, second]);

    expect(restoreCalls).toHaveLength(1);
    expect(stock.get(1)).toBe(12); // 10 + 2, restored once
    expect(orders.get(500)!.status).toBe('cancelled');
    expect(mockEmit).toHaveBeenCalledTimes(1);
  });

  it('four concurrent duplicate deliveries still restore once', async () => {
    await Promise.all([
      marketplaceService.handlePaymentFailed(failedEvent(500, 1)),
      marketplaceService.handlePaymentFailed(failedEvent(500, 2)),
      marketplaceService.handlePaymentFailed(failedEvent(500, 3)),
      marketplaceService.handlePaymentFailed(failedEvent(500, 4)),
    ]);

    expect(restoreCalls).toHaveLength(1);
    expect(stock.get(1)).toBe(12);
    expect(mockEmit).toHaveBeenCalledTimes(1);
  });

  it('sequential retries restore once (second delivery is a no-op)', async () => {
    await marketplaceService.handlePaymentFailed(failedEvent(500, 1));
    await marketplaceService.handlePaymentFailed(failedEvent(500, 2));

    expect(restoreCalls).toHaveLength(1);
    expect(stock.get(1)).toBe(12);
    expect(mockEmit).toHaveBeenCalledTimes(1);
  });

  it('two legitimate independent orders are each restored once', async () => {
    orders.set(501, makeOrder(501, { items: [{ product_id: 2, variant_id: null, quantity: 3 }] }));

    await marketplaceService.handlePaymentFailed(failedEvent(500, 1));
    await marketplaceService.handlePaymentFailed(failedEvent(501, 2));

    expect(restoreCalls).toHaveLength(2);
    expect(stock.get(1)).toBe(12);
    expect(stock.get(2)).toBe(13);
    expect(orders.get(500)!.status).toBe('cancelled');
    expect(orders.get(501)!.status).toBe('cancelled');
  });

  it('a checkout group is restored once per order under concurrent duplicates', async () => {
    orders.set(500, makeOrder(500, { group: 'grp-1' }));
    orders.set(501, makeOrder(501, { group: 'grp-1', items: [{ product_id: 2, variant_id: null, quantity: 3 }] }));

    await Promise.all([
      marketplaceService.handlePaymentFailed(failedEvent(500, 1)),
      marketplaceService.handlePaymentFailed(failedEvent(500, 2)),
    ]);

    expect(restoreCalls).toHaveLength(2);
    expect(stock.get(1)).toBe(12);
    expect(stock.get(2)).toBe(13);
  });
});

describe('B31 — crash safety and guards', () => {
  it('a restore failure rolls the claim back, so a retry still restores once', async () => {
    failRestoreOnce = true;

    await expect(marketplaceService.handlePaymentFailed(failedEvent(500, 1))).rejects.toThrow(/restore failed/);

    // Rolled back: order non-terminal, inventory untouched.
    expect(orders.get(500)!.status).toBe('pending');
    expect(stock.get(1)).toBe(10);
    expect(restoreCalls).toHaveLength(0);

    // The listener catches the error; the retry now claims and restores once.
    await marketplaceService.handlePaymentFailed(failedEvent(500, 2));
    expect(orders.get(500)!.status).toBe('cancelled');
    expect(stock.get(1)).toBe(12);
    expect(restoreCalls).toHaveLength(1);
  });

  it('never cancels or restores an order with a paid payment', async () => {
    orders.set(500, makeOrder(500, { paid: true }));

    await marketplaceService.handlePaymentFailed(failedEvent(500, 1));

    expect(claimCalls).toHaveLength(0);
    expect(restoreCalls).toHaveLength(0);
    expect(orders.get(500)!.status).toBe('pending');
  });

  it('ignores an already terminal order before opening a transaction', async () => {
    orders.set(500, makeOrder(500, { status: 'cancelled' }));

    await marketplaceService.handlePaymentFailed(failedEvent(500, 1));

    expect(claimCalls).toHaveLength(0);
    expect(restoreCalls).toHaveLength(0);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('restores each order line with its own quantity and variant', async () => {
    orders.set(500, makeOrder(500, {
      items: [
        { product_id: 1, variant_id: null, quantity: 2 },
        { product_id: 2, variant_id: 7, quantity: 3 },
      ],
    }));

    await marketplaceService.handlePaymentFailed(failedEvent(500, 1));

    expect(repoMock.restoreStock).toHaveBeenNthCalledWith(1, 1, null, 2, expect.anything());
    expect(repoMock.restoreStock).toHaveBeenNthCalledWith(2, 2, 7, 3, expect.anything());
    expect(stock.get(1)).toBe(12);
    expect(stock.get(2)).toBe(13);
  });
});

describe('B31 — abandoned cleanup overlap', () => {
  it('two overlapping cleanup runs restore once and count a single cancellation', async () => {
    const [a, b] = await Promise.all([
      marketplaceService.cancelAbandonedOrders(30),
      marketplaceService.cancelAbandonedOrders(30),
    ]);

    expect(restoreCalls).toHaveLength(1);
    expect(stock.get(1)).toBe(12);
    expect(a.cancelled + b.cancelled).toBe(1);
    expect(orders.get(500)!.status).toBe('cancelled');
  });
});
