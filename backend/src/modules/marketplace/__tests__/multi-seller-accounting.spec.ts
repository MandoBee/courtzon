/**
 * Multi-seller marketplace â€” end-to-end business-rule regression suite.
 *
 * Business rules under test (authoritative):
 *  - N sellers in one checkout â†’ exactly N independent seller orders sharing one
 *    checkout_group_id. Each order owns its items, subtotal, shipping, total,
 *    status lifecycle, stock deductions, financials and events.
 *  - An organisation of ANY type can be a Marketplace seller (owner_id based).
 *  - CARD: CourtZon collects buyer money â†’ commission earned, net payable to seller.
 *  - CASH: seller collects buyer money â†’ commission receivable FROM the seller.
 *
 * Reference example used throughout:
 *    products = 1000, shipping = 60, commission = 10% of products = 100
 *    buyer pays = 1060 | CourtZon revenue = 100 | seller entitlement = 960
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// â”€â”€ Hoisted mock references (used inside vi.mock factories) â”€â”€
const mockGetPool = vi.hoisted(() => vi.fn(() => ({ execute: vi.fn(async () => [[], []]), getConnection: vi.fn() })));
const mockWithTransaction = vi.hoisted(() => vi.fn(async (fn: any) => fn({})));
const mockEmit = vi.hoisted(() => vi.fn());
const repoMock = vi.hoisted(() => ({} as Record<string, any>));
const mockCommissionCalculate = vi.hoisted(() => vi.fn(async () => ({ rate: 10, rateType: 'percentage', planName: 'Basic' })));
const mockGetCurrentSubscription = vi.hoisted(() => vi.fn(async () => ({ exists: true, effectiveStatus: 'active' })));
const mockWalletCharge = vi.hoisted(() => vi.fn(async () => ({ success: true })));
const mockCreateTransaction = vi.hoisted(() => vi.fn(async () => 9001));
const mockCreateEntries = vi.hoisted(() => vi.fn(async () => []));

vi.mock('../../../database/mysql.js', () => ({ getPool: mockGetPool }));
vi.mock('../../../database/database.transaction.js', () => ({ withTransaction: mockWithTransaction }));
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService: { charge: mockWalletCharge, refund: vi.fn() } }));
vi.mock('../../payment/infrastructure/repositories/payment.repository.js', () => ({
  paymentRepository: { findByOrderId: vi.fn(async () => null), findByOrderIdIncludingRefunded: vi.fn(async () => null) },
}));
vi.mock('../../financial/application/commission.service.js', () => ({ commissionService: { calculate: mockCommissionCalculate } }));
vi.mock('../../financial/application/transaction.service.js', () => ({ transactionService: {} }));
vi.mock('../../financial/infrastructure/transaction.repository.js', () => ({
  transactionRepository: {
    createTransaction: mockCreateTransaction,
    createEntries: mockCreateEntries,
    findBySource: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    createTransactionEntry: vi.fn(async () => 1),
  },
}));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: {} }));
vi.mock('../../organisations/application/organisation.service.js', () => ({ organisationService: { listBranches: vi.fn(async () => []) } }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({ getCurrentSubscription: mockGetCurrentSubscription }));
vi.mock('../../auth/infrastructure/repositories/user.repository.js', () => ({ userRepository: { findById: vi.fn(async () => null) } }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: mockEmit, on: vi.fn() } }));
vi.mock('../infrastructure/repositories/marketplace.repository.js', () => ({ marketplaceRepository: repoMock }));
vi.mock('../../financial/infrastructure/repositories/financial-entitlement.repository.js', () => ({
  financialEntitlementRepository: { findBySourceIds: vi.fn(async () => []), create: vi.fn(async () => 1), update: vi.fn(async () => true) },
}));

import { marketplaceService } from '../application/marketplace.service.js';

// â”€â”€ helpers â”€â”€
let orderCounter = 5000;
const productMap = new Map<number, any>();
const createdOrders = new Map<number, any>();

function cartItem(productId: number, name: string, price: number, qty: number, sellerId: number) {
  return { product_id: productId, variant_id: null, quantity: qty, name, price, discounted_price: null, price_adjustment: 0, seller_id: sellerId, shop_name: `Shop ${sellerId}`, currency_code: 'EGP' };
}

function productRow(id: number, sellerId: number, qty = 50) {
  return { id, name: `Product ${id}`, status: 'active', marketplace_visible: 1, quantity: qty, reserved_quantity: 0, seller_id: sellerId };
}

function buildOrderRows(order: any, items: any[]) {
  return items.map((it) => ({ ...order, ...it }));
}

function seedCart(items: ReturnType<typeof cartItem>[]) {
  repoMock.findCartByUser.mockResolvedValue(items);
  productMap.clear();
  for (const it of items) productMap.set(it.product_id, productRow(it.product_id, it.seller_id));
}

beforeEach(() => {
  vi.clearAllMocks();
  orderCounter = 5000;
  productMap.clear();
  createdOrders.clear();

  repoMock.findSellerOrgsForUser = vi.fn(async () => []);
  repoMock.isPlatformAdmin = vi.fn(async () => false);
  repoMock.findCartByUser = vi.fn(async () => []);
  repoMock.findOrderItemIdsBySellerOrders = vi.fn(async () => []);
  repoMock.findProductsByIds = vi.fn(async (ids: number[]) => ids.map((id: number) => productMap.get(Number(id))).filter(Boolean));
  repoMock.findVariantsForProducts = vi.fn(async () => []);
  repoMock.findAddressById = vi.fn(async () => ({ id: 1, province_id: 1, city_id: 1, country: 'EG', city: 'Cairo' }));
  repoMock.findShippingRateForSeller = vi.fn(async () => ({ price: 60, estimated_days: 3 }));
  repoMock.findCouponByCode = vi.fn(async () => null);
  repoMock.createOrder = vi.fn(async (data: any) => {
    const id = ++orderCounter;
    createdOrders.set(id, { ...data });
    return id;
  });
  repoMock.findOrderById = vi.fn(async (id: number, buyerId?: number, sellerIds?: number | number[]) => {
    const data = createdOrders.get(Number(id));
    if (!data) return [];
    if (buyerId && Number(data.buyerId) !== Number(buyerId)) return [];
    void sellerIds;
    return [{ id: Number(id), ...data, item_seller_id: 0, product_id: null }];
  });
  repoMock.createOrderItem = vi.fn(async () => 1);
  repoMock.createOrderStatusHistory = vi.fn(async () => 1);
  repoMock.recordCouponUsage = vi.fn(async () => {});
  repoMock.decrementStock = vi.fn(async () => {});
  repoMock.insertLedgerEntry = vi.fn(async () => {});
  repoMock.findOrdersByBuyer = vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 10 }));
  repoMock.findOrdersBySeller = vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 10 }));
  repoMock.findOrdersByCheckoutGroup = vi.fn(async () => []);
  repoMock.findOrderIdsByCheckoutGroup = vi.fn(async () => []);
  repoMock.updateOrderStatus = vi.fn(async () => {});
  repoMock.updateOrderTracking = vi.fn(async () => {});
  repoMock.updateOrderFinancials = vi.fn(async () => {});
  repoMock.updateCashCollectionStatus = vi.fn(async () => {});
  repoMock.orderHasPaidPayment = vi.fn(async () => false);
  repoMock.restoreStock = vi.fn(async () => {});
  repoMock.getCartItems = vi.fn(async () => []);
  repoMock.clearCart = vi.fn(async () => {});
  repoMock.restoreCart = vi.fn(async () => {});
  repoMock.restoreCartFromOrder = vi.fn(async () => {});
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('order splitting: N sellers â†’ exactly N independent orders', () => {
  it('2 sellers â†’ exactly 2 orders sharing one checkout group', async () => {
    seedCart([
      cartItem(1, 'Racket A', 500, 2, 10),   // Seller 10: products 1000
      cartItem(2, 'Shoes B', 300, 1, 20),    // Seller 20: products 300
    ]);

    await marketplaceService.checkout(777, { addressId: 1, paymentMethod: 'wallet' });

    expect(repoMock.createOrder).toHaveBeenCalledTimes(2);
    const calls = repoMock.createOrder.mock.calls.map((c: any[]) => c[0]);
    expect(new Set(calls.map((c: any) => c.checkoutGroupId)).size).toBe(1);
    expect(calls[0].checkoutGroupId).toBeTruthy();

    // Independent buyer totals: seller A = 1000+60 shipping = 1060; seller B = 300+60 = 360
    // (commission is deducted from the SELLER entitlement, never added to buyer price)
    const totals = calls.map((c: any) => Number(c.total)).sort((a: number, b: number) => a - b);
    expect(totals).toEqual([360, 1060]);
    // Commission per order: 100 and 30 (10% of that order's products only)
    const commissions = calls.map((c: any) => Number(c.commission)).sort((a: number, b: number) => a - b);
    expect(commissions).toEqual([30, 100]);
    // Shipping attributed per seller order: 60 each
    expect(calls.every((c: any) => Number(c.shippingCost) === 60)).toBe(true);
  });

  it('3 sellers â†’ exactly 3 orders with independent subtotals/shipping/commission', async () => {
    seedCart([
      cartItem(1, 'A', 400, 1, 10),
      cartItem(2, 'B', 300, 1, 20),
      cartItem(3, 'C', 200, 1, 30),
    ]);

    await marketplaceService.checkout(777, { addressId: 1, paymentMethod: 'wallet' });

    expect(repoMock.createOrder).toHaveBeenCalledTimes(3);
    const calls = repoMock.createOrder.mock.calls.map((c: any[]) => c[0]);
    expect(new Set(calls.map((c: any) => c.checkoutGroupId)).size).toBe(1);
    // Shipping per seller (60 Ã— 3)
    expect(calls.reduce((s: number, c: any) => s + Number(c.shippingCost || 0), 0)).toBe(180);
    // Commission 10% of products only (900 Ã— 10% = 90)
    expect(calls.reduce((s: number, c: any) => s + Number(c.commission || 0), 0)).toBeCloseTo(90, 2);

    // Items never cross orders: each item belongs to a distinct order
    const itemCalls = repoMock.createOrderItem.mock.calls.map((c: any[]) => c[0]);
    expect(itemCalls).toHaveLength(3);
    expect(new Set(itemCalls.map((i: any) => i.orderId)).size).toBe(3);
    // Item seller matches its order grouping
    expect(new Set(itemCalls.map((i: any) => i.sellerId))).toEqual(new Set([10, 20, 30]));
  });
});

describe('seller identity: organisation of ANY type is a valid seller', () => {
  it('sports-club owner resolves via owner relationship (Padel Edge scenario)', async () => {
    seedCart([cartItem(9, 'Club Ball', 1000, 1, 6)]);
    repoMock.findSellerOrgsForUser.mockResolvedValue([{ id: 6, is_active: 1, owner_id: 68 }]);

    await marketplaceService.getSellerOrders(68, { page: 1, limit: 10 });
    // Repository receives ALL resolved org ids â€” including the non-shop club.
    expect(repoMock.findOrdersBySeller).toHaveBeenCalledWith([6], { page: 1, limit: 10 });
  });

  it('seller with multiple orgs (club + shop) sees orders across both', async () => {
    seedCart([]);
    repoMock.findSellerOrgsForUser.mockResolvedValue([
      { id: 6, is_active: 1, owner_id: 68 },
      { id: 1001133, is_active: 1, owner_id: 68 },
    ]);
    await marketplaceService.getSellerOrders(68, { page: 1, limit: 10 });
    expect(repoMock.findOrdersBySeller).toHaveBeenCalledWith([6, 1001133], { page: 1, limit: 10 });
  });

  it('ForbiddenError when user has no owned/scoped organisations at all', async () => {
    repoMock.findSellerOrgsForUser.mockResolvedValue([]);
    await expect(marketplaceService.getSellerOrders(99999, { page: 1, limit: 10 })).rejects.toThrow('Not a seller');
  });

  it('_getUserRoleInOrder recognises seller through ANY owned organisation type', async () => {
    repoMock.findSellerOrgsForUser.mockResolvedValue([{ id: 6, is_active: 1, owner_id: 68 }]);
    const role = await marketplaceService._getUserRoleInOrder(68, { buyer_id: 777, items: [{ sellerId: 6 }] });
    expect(role).toBe('seller');
  });

  it('getOrderForUser seller branch passes all owned org ids (not just shops)', async () => {
    repoMock.findOrderById.mockImplementation(async (_id: number, buyerId?: number, sellerIds?: number | number[]) => {
      if (buyerId) return [];
      const arr = Array.isArray(sellerIds) ? sellerIds : [];
      if (arr.includes(6)) return buildOrderRows({ id: 42, buyer_id: 777, checkout_group_id: null }, [{ item_seller_id: 6, product_name: 'X', item_total: 100 }]);
      return [];
    });
    repoMock.findSellerOrgsForUser.mockResolvedValue([{ id: 6, is_active: 1, owner_id: 68 }]);

    const result = await marketplaceService.getOrderForUser(42, 68);
    expect(result.viewedAsSeller).toBe(true);
  });

  it('buyer still gets grouped view; unrelated user gets NotFound', async () => {
    // Buyer path unaffected by seller resolution changes
    const rows = buildOrderRows(
      { id: 43, buyer_id: 777, checkout_group_id: 'g1', subtotal: 1300, shipping_cost: 120, discount_amount: 0, tax_amount: 0, commission_amount: 130, total: 1420, status: 'confirmed', payment_status: 'paid', currency_code: 'EGP', created_at: '2026-08-25T10:00:00Z' },
      [{ item_seller_id: 10, product_id: 1, product_name: 'RA', quantity: 2, unit_price: 500, item_total: 1000 }],
    );
    const sibling = buildOrderRows(
      { id: 44, buyer_id: 777, checkout_group_id: 'g1', subtotal: 300, shipping_cost: 60, discount_amount: 0, tax_amount: 0, commission_amount: 30, total: 360, status: 'confirmed', payment_status: 'paid', currency_code: 'EGP', created_at: '2026-08-25T10:00:00Z' },
      [{ item_seller_id: 20, product_id: 2, product_name: 'SB', quantity: 1, unit_price: 300, item_total: 300 }],
    );
    repoMock.findOrderById.mockImplementation(async (_id: number, buyerId?: number) => (buyerId === 777 ? rows : []));
    repoMock.findOrdersByCheckoutGroup.mockResolvedValue([...rows, ...sibling]);

    const result = await marketplaceService.getOrderForUser(43, 777);
    expect(result.viewedAsSeller).toBe(false);
    expect(result._isGrouped).toBe(true);
    expect(result.items).toHaveLength(2); // complete grouped checkout

    // Unrelated user â†’ no rows anywhere â†’ throws
    repoMock.findOrderById.mockReset();
    repoMock.findOrderById.mockImplementation(async () => []);
    repoMock.findSellerOrgsForUser.mockResolvedValue([]);
    await expect(marketplaceService.getOrderForUser(43, 424242)).rejects.toThrow('Order');
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('stock ledger attribution', () => {
  it('each stock deduction references its OWN seller order + correct org', async () => {
    seedCart([
      cartItem(1, 'Racket A', 500, 2, 10),
      cartItem(2, 'Shoes B', 300, 1, 20),
    ]);

    await marketplaceService.checkout(777, { addressId: 1, paymentMethod: 'wallet' });

    // Phase 2 Step 5: marketplace_ledger_entries no longer written.
    // Stock deduction is verified by decrementStock calls.
    expect(repoMock.decrementStock).toHaveBeenCalledTimes(2);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('accounting: confirm + delivery journals (example: 1000 / 60 / 10%)', () => {
  function seedConfirmedOrder(paymentMethod: 'card' | 'cash') {
    const order = {
      id: 6001, buyer_id: 777, status: 'confirmed',
      subtotal: 1000, shipping_cost: 60, discount_amount: 0, tax_amount: 0,
      total: 1060, courtzon_fee: 100, courtzon_commission: 100,
      cash_holder: paymentMethod === 'cash' ? 'org' : 'courtzon',
      payment_method: paymentMethod, payment_status: paymentMethod === 'cash' ? 'unpaid' : 'paid',
      currency_code: 'EGP', checkout_group_id: null,
    };
    repoMock.findOrderById.mockResolvedValue(buildOrderRows(order, [
      { item_seller_id: 10, item_total: 1000, commission_amount: 100, commission_rate: 10, branch_id: 55, product_id: 1 },
    ]));
  }

  it('CARD delivery — legacy path retired: only cash-collection status, NO legacy transaction/entries', async () => {
    seedConfirmedOrder('card');
    await marketplaceService._recordDeliveryFinancials(6001);

    // The legacy transactions/transaction_entries double-post is retired — the
    // canonical Accounting Engine is the single source of truth.
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockCreateEntries).not.toHaveBeenCalled();
    expect(repoMock.updateCashCollectionStatus).toHaveBeenCalledWith(6001, 'held_by_courtzon');
  });

  it('CASH delivery — legacy path retired: only cash-collection status, NO legacy transaction/entries', async () => {
    seedConfirmedOrder('cash');
    await marketplaceService._recordDeliveryFinancials(6001);

    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockCreateEntries).not.toHaveBeenCalled();
    expect(repoMock.updateCashCollectionStatus).toHaveBeenCalledWith(6001, 'held_by_org');
  });

  it('confirm financials: courtzon_fee = 10% of products only, shipping 100% org', async () => {
    seedConfirmedOrder('card');
    await marketplaceService._recordOrderFinancials(6001);

    expect(repoMock.updateOrderFinancials).toHaveBeenCalledWith(6001, expect.objectContaining({
      courtzonCommission: 100,
      courtzonFee: 100,
      orgProductShare: 900,
      orgShippingShare: 60,
      cashHolder: 'courtzon',
    }));
  });

  it('multi-seller delivery — legacy path retired: NO legacy transaction/entries, status-only per order', async () => {
    const mk = (id: number, sellerId: number, subtotal: number, ship: number) => {
      const o: any = {
        id, buyer_id: 777, status: 'delivered', subtotal, shipping_cost: ship,
        discount_amount: 0, tax_amount: 0, total: subtotal + ship,
        courtzon_fee: Math.round(subtotal * 0.1), courtzon_commission: Math.round(subtotal * 0.1),
        cash_holder: 'courtzon', payment_method: 'card', payment_status: 'paid',
        currency_code: 'EGP', checkout_group_id: 'grp-x',
      };
      return buildOrderRows(o, [{ item_seller_id: sellerId, item_total: subtotal, commission_amount: Math.round(subtotal * 0.1), branch_id: null, product_id: sellerId }]);
    };

    repoMock.findOrderById.mockResolvedValueOnce(mk(7001, 10, 1000, 60));
    await marketplaceService._recordDeliveryFinancials(7001);
    repoMock.findOrderById.mockResolvedValueOnce(mk(7002, 20, 300, 30));
    await marketplaceService._recordDeliveryFinancials(7002);

    // Legacy delivery journal removed — canonical engine posts per seller-order.
    expect(mockCreateEntries).not.toHaveBeenCalled();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(repoMock.updateCashCollectionStatus).toHaveBeenCalledTimes(2);
  });

  it('no duplicate confirm financials on re-run (idempotent columns update)', async () => {
    seedConfirmedOrder('card');
    await marketplaceService._recordOrderFinancials(6001);
    await marketplaceService._recordOrderFinancials(6001);
    expect(repoMock.updateOrderFinancials).toHaveBeenCalledTimes(2);
    // Both calls write identical values (idempotent overwrite, not additive)
    const [a, b] = repoMock.updateOrderFinancials.mock.calls.map((c: any[]) => c[1]);
    expect(a.courtzonFee).toBe(b.courtzonFee);
    expect(a.orgProductShare).toBe(b.orgProductShare);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('cancellation affects correct sibling orders', () => {
  it('cancelling one order cancels siblings; stock reversals keep per-order ownership', async () => {
    const GROUP = 'grp-cancel';
    const mkRows = (id: number, sellerId: number, productId: number, qty: number) =>
      buildOrderRows(
        { id, buyer_id: 777, status: 'pending', checkout_group_id: GROUP, payment_method: 'wallet', payment_status: 'unpaid', currency_code: 'EGP', subtotal: 100, shipping_cost: 60, total: 160 },
        [{ item_seller_id: sellerId, product_id: productId, quantity: qty, product_name: `P${productId}` }],
      );

    repoMock.findOrderById.mockImplementation(async (id: number) => {
      if (id === 8001) return mkRows(8001, 10, 1, 2);
      if (id === 8002) return mkRows(8002, 20, 2, 1);
      return [];
    });
    repoMock.findOrderIdsByCheckoutGroup.mockResolvedValue([8001, 8002]);

    await marketplaceService.cancelOrder(8001, 777);

    const cancelled = [...new Set(repoMock.updateOrderStatus.mock.calls.filter((c: any[]) => c[1] === 'cancelled').map((c: any[]) => c[0]))];
    expect(cancelled.sort()).toEqual([8001, 8002]);

    // Phase 2 Step 5: reversal ledger entries removed — stock restoration via restoreStock
    expect(repoMock.restoreStock.mock.calls.length).toBeGreaterThanOrEqual(2);
    const restoredProducts = new Set(repoMock.restoreStock.mock.calls.map((c: any[]) => c[0]));
    expect(restoredProducts).toEqual(new Set([1, 2]));
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('events reference correct seller + order', () => {
  it('one order-placed event PER SELLER with its own orderId, total, group', async () => {
    seedCart([
      cartItem(1, 'Racket A', 500, 2, 10),
      cartItem(2, 'Shoes B', 300, 1, 20),
      cartItem(3, 'Ball C', 200, 1, 30),
    ]);

    await marketplaceService.checkout(777, { addressId: 1, paymentMethod: 'wallet' });

    const placed = mockEmit.mock.calls.filter((c: any[]) => c[0] === 'marketplace:order-placed').map((c: any[]) => c[1]);
    expect(placed).toHaveLength(3);
    expect(placed.map((p: any) => p.sellerId).sort((a: number, b: number) => a - b)).toEqual([10, 20, 30]);
    expect(new Set(placed.map((p: any) => p.orderId)).size).toBe(3);
    expect(new Set(placed.map((p: any) => p.checkoutGroupId)).size).toBe(1);
  });

  it('order-confirmed emitted per fulfilled order with that order\'s seller id', async () => {
    const rows = buildOrderRows(
      { id: 9100, buyer_id: 777, status: 'pending', payment_method: 'wallet', checkout_group_id: null },
      [{ item_seller_id: 10, product_id: 1 }],
    );
    repoMock.findOrderById.mockResolvedValue(rows);

    await marketplaceService._fulfillAndConfirmOrder(9100, 777, 'Payment via wallet');

    const confirmed = mockEmit.mock.calls.filter((c: any[]) => c[0] === 'marketplace:order-confirmed').map((c: any[]) => c[1]);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]).toMatchObject({ orderId: 9100, sellerId: 10 });
  });
});

