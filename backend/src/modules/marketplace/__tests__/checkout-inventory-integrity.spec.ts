import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P4-04 — marketplace inventory integrity and seller eligibility (B26).
 *
 * Deterministic service-level tests with an in-memory order/stock store:
 *  • inactive/expired/suspended sellers are rejected at checkout (eligible pass);
 *  • a failed card checkout restores stock exactly ONCE and cancels the orders
 *    (the abandoned-order worker can no longer restore the same inventory);
 *  • a part-way stock decrement restores only the items actually decremented;
 *  • a retried payment:failed event cannot restore stock twice.
 */

const repoMock = vi.hoisted(() => ({} as Record<string, any>));
const mockEmit = vi.hoisted(() => vi.fn());
const mockCharge = vi.hoisted(() => vi.fn());
const mockGetCurrentSubscription = vi.hoisted(() => vi.fn());
const mockGetPool = vi.hoisted(() => vi.fn(() => ({ execute: vi.fn(async () => [[], []]) })));

vi.mock('../../../database/mysql.js', () => ({ getPool: mockGetPool }));
vi.mock('../../../database/database.transaction.js', () => ({ withTransaction: vi.fn(async (fn: (c: unknown) => unknown) => fn({})) }));
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService: { charge: mockCharge } }));
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
vi.mock('../../organisations/application/current-subscription.service.js', () => ({ getCurrentSubscription: mockGetCurrentSubscription }));
vi.mock('../../auth/infrastructure/repositories/user.repository.js', () => ({ userRepository: { findById: vi.fn(async () => ({ id: 100, email: 'b@example.com', full_phone: '+20100', full_name: 'Buyer' })) } }));
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

const SELLER_A = 10;
const SELLER_B = 20;
const BUYER = 100;

const productA = { id: 1, name: 'Racket A', status: 'active', marketplace_visible: 1, seller_id: SELLER_A, quantity: 10, reserved_quantity: 0 };
const productB = { id: 2, name: 'Shoes B', status: 'active', marketplace_visible: 1, seller_id: SELLER_B, quantity: 10, reserved_quantity: 0 };

const cartItemA = { id: 101, product_id: 1, seller_id: SELLER_A, name: 'Racket A', price: 500, discounted_price: null, price_adjustment: 0, quantity: 2, variant_id: null, currency_code: 'EGP', shop_name: 'Shop A' };
const cartItemB = { id: 102, product_id: 2, seller_id: SELLER_B, name: 'Shoes B', price: 300, discounted_price: null, price_adjustment: 0, quantity: 1, variant_id: null, currency_code: 'EGP', shop_name: 'Shop B' };

interface OrderRec {
  id: number;
  buyer_id: number;
  status: string;
  payment_status: string;
  checkout_group_id: string | null;
  items: Array<{ product_id: number; variant_id: number | null; quantity: number; seller_id: number }>;
}

let orders: Map<number, OrderRec>;
let orderCounter: number;
let stock: Map<number, number>;
let restoreCalls: Array<[number, number | undefined, number]>;
let statusUpdates: Array<[number, string]>;
let failDecrementForProduct: number | null;

function orderRows(order: OrderRec) {
  if (!order.items.length) {
    return [{ id: order.id, buyer_id: order.buyer_id, status: order.status, payment_status: order.payment_status, checkout_group_id: order.checkout_group_id, product_id: null }];
  }
  return order.items.map((item) => ({
    id: order.id,
    buyer_id: order.buyer_id,
    status: order.status,
    payment_status: order.payment_status,
    checkout_group_id: order.checkout_group_id,
    product_id: item.product_id,
    variant_id: item.variant_id,
    quantity: item.quantity,
    item_seller_id: item.seller_id,
    shop_name: `Shop ${item.seller_id}`,
  }));
}

function resetState(cart: unknown[] = [cartItemA, cartItemB]) {
  orders = new Map();
  orderCounter = 1000;
  stock = new Map([[1, 10], [2, 10]]);
  restoreCalls = [];
  statusUpdates = [];
  failDecrementForProduct = null;

  for (const key of Object.keys(repoMock)) delete repoMock[key];
  Object.assign(repoMock, {
    findCartByUser: vi.fn(async () => cart),
    getCartItems: vi.fn(async () => cart),
    clearCart: vi.fn(async () => undefined),
    restoreCart: vi.fn(async () => undefined),
    findProductsByIds: vi.fn(async () => [productA, productB]),
    findVariantsForProducts: vi.fn(async () => []),
    findAddressById: vi.fn(async () => ({ id: 5, province_id: 1, city_id: 2, country: 'EG', state: 'Cairo', city: 'Cairo', street_address: 'Street' })),
    findShippingRateForSeller: vi.fn(async () => ({ price: 10, estimated_days: 2 })),
    createOrder: vi.fn(async (data: any) => {
      const id = ++orderCounter;
      orders.set(id, {
        id, buyer_id: data.buyerId, status: 'pending', payment_status: 'unpaid',
        checkout_group_id: data.checkoutGroupId ?? null, items: [],
      });
      return id;
    }),
    createOrderItem: vi.fn(async (data: any) => {
      orders.get(data.orderId)?.items.push({ product_id: data.productId, variant_id: data.variantId ?? null, quantity: data.quantity, seller_id: data.sellerId });
    }),
    createOrderStatusHistory: vi.fn(async () => undefined),
    recordCouponUsage: vi.fn(async () => undefined),
    decrementStock: vi.fn(async (productId: number, _variantId: number | undefined, quantity: number) => {
      if (failDecrementForProduct === productId) throw new Error('Insufficient stock');
      stock.set(productId, (stock.get(productId) ?? 0) - quantity);
    }),
    restoreStock: vi.fn(async (productId: number, variantId: number | undefined, quantity: number) => {
      restoreCalls.push([productId, variantId, quantity]);
      stock.set(productId, (stock.get(productId) ?? 0) + quantity);
    }),
    findOrderById: vi.fn(async (id: number) => {
      const order = orders.get(Number(id));
      return order ? orderRows(order) : [];
    }),
    findOrderIdsByCheckoutGroup: vi.fn(async (groupId: string) =>
      [...orders.values()].filter((o) => o.checkout_group_id === groupId).map((o) => o.id),
    ),
    updateOrderStatus: vi.fn(async (id: number, status: string) => {
      statusUpdates.push([id, status]);
      const order = orders.get(Number(id));
      if (!order) return false;
      // Mirror the repository's atomic terminal-claim guard (B31).
      if ((status === 'cancelled' || status === 'refunded')
        && (order.status === 'cancelled' || order.status === 'refunded')) {
        return false;
      }
      order.status = status;
      return true;
    }),
    orderHasPaidPayment: vi.fn(async () => false),
    findAbandonedPendingOrders: vi.fn(async () => []),
    createOrderStatusHistoryRaw: vi.fn(async () => undefined),
  });
}

const checkoutData = { addressId: 5, paymentMethod: 'card', returnUrl: 'https://return' };

describe('checkout seller-subscription enforcement (B26)', () => {
  beforeEach(() => {
    resetState();
    mockCharge.mockReset();
    mockCharge.mockResolvedValue({ success: true, paymentUrl: 'https://pay', clientSecret: 'cs', paymentId: 77 });
  });

  it('rejects a seller with no subscription plan before creating any order', async () => {
    mockGetCurrentSubscription.mockResolvedValue({ exists: false, effectiveStatus: 'none' });
    await expect(marketplaceService.checkout(BUYER, checkoutData)).rejects.toThrow(/no active subscription plan/i);
    expect(repoMock.createOrder).not.toHaveBeenCalled();
  });

  it.each(['expired', 'suspended', 'cancelled'])('rejects a seller whose subscription is %s', async (status) => {
    mockGetCurrentSubscription.mockResolvedValue({ exists: true, effectiveStatus: status });
    await expect(marketplaceService.checkout(BUYER, checkoutData)).rejects.toThrow(/does not have an active subscription/i);
    expect(repoMock.createOrder).not.toHaveBeenCalled();
  });

  it('keeps normal checkout behaviour for an active seller', async () => {
    mockGetCurrentSubscription.mockResolvedValue({ exists: true, effectiveStatus: 'active' });
    const result = await marketplaceService.checkout(BUYER, checkoutData);
    expect(result.paymentUrl).toBe('https://pay');
    expect(repoMock.createOrder).toHaveBeenCalledTimes(2);
    expect([...orders.values()].every((o) => o.status === 'pending')).toBe(true);
  });
});

describe('checkout failure — stock restored exactly once', () => {
  beforeEach(() => {
    resetState();
    mockGetCurrentSubscription.mockResolvedValue({ exists: true, effectiveStatus: 'active' });
    mockCharge.mockReset();
  });

  it('restores each item once and cancels every order when the gateway rejects the charge', async () => {
    mockCharge.mockResolvedValue({ success: false, errorMessage: 'declined' });

    await expect(marketplaceService.checkout(BUYER, checkoutData)).rejects.toThrow(/declined/);

    // Exactly one restore per ordered item (2 items in this cart), not one per order twice.
    expect(restoreCalls.map((c) => c[0]).sort()).toEqual([1, 2]);
    expect(restoreCalls.find((c) => c[0] === 1)?.[2]).toBe(2);
    expect(restoreCalls.find((c) => c[0] === 2)?.[2]).toBe(1);
    expect(stock.get(1)).toBe(10);
    expect(stock.get(2)).toBe(10);

    // Orders are terminal, so the abandoned-order worker cannot restore them again.
    expect([...orders.values()].every((o) => o.status === 'cancelled')).toBe(true);
    expect(statusUpdates.filter(([, s]) => s === 'cancelled')).toHaveLength(2);
    expect(repoMock.restoreCart).toHaveBeenCalledTimes(1);
  });

  it('treats a charge without a payment URL as a failed checkout (single restore + cancel)', async () => {
    mockCharge.mockResolvedValue({ success: true });

    await expect(marketplaceService.checkout(BUYER, checkoutData)).rejects.toThrow(/checkout URL/i);
    expect(restoreCalls.map((c) => c[0]).sort()).toEqual([1, 2]);
    expect([...orders.values()].every((o) => o.status === 'cancelled')).toBe(true);
  });

  it('restores only the items actually decremented when a concurrent sale exhausts stock', async () => {
    failDecrementForProduct = 2;

    await expect(marketplaceService.checkout(BUYER, checkoutData)).rejects.toThrow(/Insufficient stock/);

    // Product 1 was decremented then restored; product 2 was never decremented and
    // must NOT be restored (that would inflate inventory).
    expect(restoreCalls).toEqual([[1, undefined, 2]]);
    expect(stock.get(1)).toBe(10);
    expect(stock.get(2)).toBe(10);
    expect([...orders.values()].every((o) => o.status === 'cancelled')).toBe(true);
  });
});

describe('payment failure event — idempotent stock restoration', () => {
  beforeEach(() => {
    resetState([cartItemA]);
    mockGetCurrentSubscription.mockResolvedValue({ exists: true, effectiveStatus: 'active' });
    mockCharge.mockReset();
    orders.set(5000, {
      id: 5000, buyer_id: BUYER, status: 'pending', payment_status: 'unpaid',
      checkout_group_id: null, items: [{ product_id: 1, variant_id: null, quantity: 2, seller_id: SELLER_A }],
    });
  });

  it('a repeated payment:failed event cannot restore the same stock twice', async () => {
    const payload = { paymentId: 9, referenceType: 'order', referenceId: 5000, amount: 1000, reason: 'declined' };

    await marketplaceService.handlePaymentFailed(payload);
    await marketplaceService.handlePaymentFailed(payload);

    expect(restoreCalls).toHaveLength(1);
    expect(statusUpdates).toEqual([[5000, 'cancelled']]);
    expect(stock.get(1)).toBe(12); // initial 10 + one restore of 2
  });
});
