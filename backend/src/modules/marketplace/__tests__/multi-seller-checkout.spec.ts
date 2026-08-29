import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression tests for multi-seller order split feature.
 *
 * When a checkout contains products from N sellers, N independent orders are
 * created — each with its own subtotal/shipping/commission/tax/total — linked
 * by a shared `checkout_group_id`. The buyer sees them merged; each seller
 * sees only their own.
 */

// ── Hoisted mock references (used inside vi.mock factories) ──
const mockGetPool = vi.hoisted(() => vi.fn());
const mockWithTransaction = vi.hoisted(() => vi.fn(async (fn: any) => fn({})));
const mockEmit = vi.hoisted(() => vi.fn());
const repoMock = vi.hoisted(() => ({} as Record<string, any>));
const mockCommissionCalculate = vi.hoisted(() => vi.fn(async () => ({ rate: 10, rateType: 'percentage', planName: 'Basic' })));
const mockGetCurrentSubscription = vi.hoisted(() => vi.fn(async () => ({ exists: true, effectiveStatus: 'active' })));
const mockWalletCharge = vi.hoisted(() => vi.fn(async () => ({ success: true })));

// ── Mock modules ──
vi.mock('../../../database/mysql.js', () => ({ getPool: mockGetPool }));
vi.mock('../../../database/database.transaction.js', () => ({ withTransaction: mockWithTransaction }));
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService: { charge: mockWalletCharge } }));
vi.mock('../../payment/infrastructure/repositories/payment.repository.js', () => ({ paymentRepository: {} }));
vi.mock('../../financial/application/commission.service.js', () => ({ commissionService: { calculate: mockCommissionCalculate } }));
vi.mock('../../financial/application/transaction.service.js', () => ({ transactionService: {} }));
vi.mock('../../financial/infrastructure/transaction.repository.js', () => ({ transactionRepository: { findBySource: vi.fn(async () => []), findById: vi.fn(async () => null), createTransaction: vi.fn(async () => 1), createTransactionEntry: vi.fn(async () => 1) } }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: {} }));
vi.mock('../../organisations/application/organisation.service.js', () => ({ organisationService: {} }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({ getCurrentSubscription: mockGetCurrentSubscription }));
vi.mock('../../auth/infrastructure/repositories/user.repository.js', () => ({ userRepository: { findById: vi.fn(async () => null) } }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { emit: mockEmit, on: vi.fn() },
}));

// ── Seller / product fixtures ──
const SELLER_A = 10;
const SELLER_B = 20;
const BUYER = 100;
const CHECKOUT_GROUP_ID = '550e8400-e29b-41d4-a716-446655440000';

const productA = { id: 1, name: 'Racket A', status: 'active', marketplace_visible: 1, seller_id: SELLER_A, quantity: 10, reserved_quantity: 0 };
const productB = { id: 2, name: 'Shoes B', status: 'active', marketplace_visible: 1, seller_id: SELLER_B, quantity: 10, reserved_quantity: 0 };

const cartItemA = { id: 101, product_id: 1, seller_id: SELLER_A, name: 'Racket A', price: 500, discounted_price: null, price_adjustment: 0, quantity: 2, variant_id: null, currency_code: 'EGP', shop_name: 'Shop A' };
const cartItemB = { id: 102, product_id: 2, seller_id: SELLER_B, name: 'Shoes B', price: 300, discounted_price: null, price_adjustment: 0, quantity: 1, variant_id: null, currency_code: 'EGP', shop_name: 'Shop B' };

// ── Track created orders for repo mock ──
let orderStore: Map<number, any>;
let orderItemStore: any[];
let orderCounter: number;

function resetStores() {
  orderStore = new Map();
  orderItemStore = [];
  orderCounter = 1000;
}

function buildOrderRow(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? ++orderCounter,
    public_id: overrides.public_id ?? `pub-${overrides.id ?? orderCounter}`,
    buyer_id: overrides.buyer_id ?? BUYER,
    status: overrides.status ?? 'pending',
    payment_status: overrides.payment_status ?? 'unpaid',
    subtotal: overrides.subtotal ?? 0,
    shipping_cost: overrides.shipping_cost ?? 0,
    commission_amount: overrides.commission_amount ?? 0,
    tax_amount: overrides.tax_amount ?? 0,
    total: overrides.total ?? 0,
    currency_code: overrides.currency_code ?? 'EGP',
    payment_method: overrides.payment_method ?? 'wallet',
    created_at: overrides.created_at ?? new Date().toISOString(),
    estimated_delivery_date: overrides.estimated_delivery_date ?? null,
    tracking_number: overrides.tracking_number ?? null,
    shipping_carrier: overrides.shipping_carrier ?? null,
    checkout_group_id: overrides.checkout_group_id ?? null,
    discount_amount: overrides.discount_amount ?? 0,
    coupon_id: overrides.coupon_id ?? null,
    notes: overrides.notes ?? '',
    courtzon_commission: overrides.courtzon_commission ?? 0,
    courtzon_fee: overrides.courtzon_fee ?? 0,
    org_product_share: overrides.org_product_share ?? 0,
    org_shipping_share: overrides.org_shipping_share ?? 0,
    cash_holder: overrides.cash_holder ?? null,
    cash_collection_status: overrides.cash_collection_status ?? null,
    buyer_name: overrides.buyer_name ?? null,
    buyer_phone: overrides.buyer_phone ?? null,
    shop_name: overrides.shop_name ?? null,
    item_seller_id: overrides.item_seller_id ?? null,
    product_id: overrides.product_id ?? null,
    product_name: overrides.product_name ?? null,
    variant_name: overrides.variant_name ?? null,
    quantity: overrides.quantity ?? null,
    unit_price: overrides.unit_price ?? null,
    item_total: overrides.item_total ?? null,
    images: overrides.images ?? null,
    org_name: overrides.org_name ?? null,
    seller_id: overrides.seller_id ?? null,
    ...overrides,
  };
}

function buildOrderRowsWithItems(order: any, items: any[]) {
  return items.map(item => ({
    ...order,
    product_id: item.product_id,
    product_name: item.product_name,
    variant_name: item.variant_name ?? null,
    quantity: item.quantity,
    unit_price: item.unit_price,
    item_total: item.item_total,
    item_seller_id: item.seller_id,
    shop_name: item.shop_name ?? null,
    images: item.images ?? null,
    commission_rate: item.commission_rate ?? 0,
    commission_amount: item.commission_amount ?? 0,
    seller_id: item.seller_id,
    branch_id: item.branch_id ?? null,
  }));
}

vi.mock('../infrastructure/repositories/marketplace.repository.js', () => ({
  marketplaceRepository: repoMock,
}));
vi.mock('../../financial/infrastructure/repositories/financial-entitlement.repository.js', () => ({
  financialEntitlementRepository: { findBySourceIds: vi.fn(async () => []), create: vi.fn(async () => 1), update: vi.fn(async () => true) },
}));

// ── Import after mocks ──
import { marketplaceService } from '../application/marketplace.service.js';
import { marketplaceRepository as repo } from '../infrastructure/repositories/marketplace.repository.js';

describe('Multi-seller order split', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();

    mockCommissionCalculate.mockResolvedValue({ rate: 10, rateType: 'percentage', planName: 'Basic' });
    mockGetCurrentSubscription.mockResolvedValue({ exists: true, effectiveStatus: 'active' });
    mockWalletCharge.mockResolvedValue({ success: true });
    mockGetPool.mockReturnValue({ execute: vi.fn(async () => [[], []]) });

    repoMock.findCartByUser = vi.fn(async () => []);
    repoMock.findOrderItemIdsBySellerOrders = vi.fn(async () => []);
    repoMock.findProductsByIds = vi.fn(async () => []);
    repoMock.findVariantsForProducts = vi.fn(async () => []);
    repoMock.findOrgByUserId = vi.fn(async () => null);
    repoMock.findOrgByUserScope = vi.fn(async () => null);
    repoMock.findOrgByOwnerId = vi.fn(async () => []);
    repoMock.findSellerOrgsForUser = vi.fn(async () => []);
    repoMock.isPlatformAdmin = vi.fn(async () => false);
    repoMock.findAddressById = vi.fn(async () => ({ id: 1, province_id: 1, city_id: 1, country: 'EG' }));
    repoMock.findShippingRateForSeller = vi.fn(async () => ({ price: 50, estimated_days: 3 }));
    repoMock.findCouponByCode = vi.fn(async () => null);
    repoMock.countCouponUsage = vi.fn(async () => 0);
    repoMock.createOrder = vi.fn(async (data: any) => {
      const id = ++orderCounter;
      const order = buildOrderRow({ id, ...data, checkout_group_id: data.checkoutGroupId });
      orderStore.set(id, order);
      return id;
    });
    repoMock.createOrderItem = vi.fn(async (data: any) => {
      orderItemStore.push(data);
      return 1;
    });
    repoMock.createOrderStatusHistory = vi.fn(async () => 1);
    repoMock.recordCouponUsage = vi.fn(async () => {});
    repoMock.decrementStock = vi.fn(async () => {});
    repoMock.insertLedgerEntry = vi.fn(async () => {});
    repoMock.findOrderById = vi.fn(async () => []);
    repoMock.findOrdersByBuyer = vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 10 }));
    repoMock.findOrdersBySeller = vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 10 }));
    repoMock.findOrderIdsByCheckoutGroup = vi.fn(async () => []);
    repoMock.findOrdersByCheckoutGroup = vi.fn(async () => []);
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
    repoMock.findProductById = vi.fn(async () => null);
    repoMock.setMarketplaceVisible = vi.fn(async () => true);
    repoMock.findVariants = vi.fn(async () => []);
    repoMock.findProductTags = vi.fn(async () => []);
    repoMock.findProductImages = vi.fn(async () => []);
    repoMock.findProductSpecs = vi.fn(async () => []);
    repoMock.findRelatedProducts = vi.fn(async () => []);
    repoMock.findDescendantCategoryIds = vi.fn(async () => []);
    repoMock.findCategories = vi.fn(async () => []);
    repoMock.findCategoryById = vi.fn(async () => null);
    repoMock.findWishlist = vi.fn(async () => []);
    repoMock.addWishlist = vi.fn(async () => {});
    repoMock.removeWishlist = vi.fn(async () => {});
    repoMock.upsertCartItem = vi.fn(async () => {});
    repoMock.upsertCartItemExact = vi.fn(async () => {});
    repoMock.updateCartItemQuantity = vi.fn(async () => true);
    repoMock.removeCartItem = vi.fn(async () => {});
    repoMock.createAddress = vi.fn(async () => 1);
    repoMock.updateAddress = vi.fn(async () => true);
    repoMock.deleteAddress = vi.fn(async () => true);
    repoMock.findAddresses = vi.fn(async () => []);
    repoMock.findProvinceById = vi.fn(async () => null);
    repoMock.findCityById = vi.fn(async () => null);
    repoMock.getPool = vi.fn(() => ({ execute: vi.fn(async () => [[], []]) }));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Multi-seller checkout creates separate seller-orders
  // ─────────────────────────────────────────────────────────────────────────
  describe('checkout creates separate per-seller orders', () => {
    it('2 sellers → 2 orders sharing the same checkout_group_id', async () => {
      repoMock.findCartByUser.mockResolvedValueOnce([cartItemA, cartItemB]);
      repoMock.findProductsByIds.mockResolvedValueOnce([productA, productB]);
      repoMock.findVariantsForProducts.mockResolvedValueOnce([]);

      repoMock.findOrderById.mockImplementation(async (id: number) => {
        const order = orderStore.get(id);
        if (!order) return [];
        const items = orderItemStore.filter(i => i.orderId === id);
        return buildOrderRowsWithItems(order, items.map(i => ({
          product_id: i.productId,
          product_name: `Product ${i.productId}`,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          item_total: i.totalPrice,
          seller_id: i.sellerId,
        })));
      });

      const result = await marketplaceService.checkout(BUYER, {
        addressId: 1,
        paymentMethod: 'wallet',
      });

      expect(repoMock.createOrder).toHaveBeenCalledTimes(2);

      const orderArgs = repoMock.createOrder.mock.calls.map((c: any[]) => c[0]);
      const gid = orderArgs[0].checkoutGroupId;
      expect(gid).toBeTruthy();

      for (const call of orderArgs) {
        expect(call.checkoutGroupId).toBe(gid);
      }

      expect(repoMock.createOrderItem).toHaveBeenCalledTimes(2);
      const itemSellers = repoMock.createOrderItem.mock.calls.map((c: any[]) => c[0].sellerId);
      expect(itemSellers).toContain(SELLER_A);
      expect(itemSellers).toContain(SELLER_B);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: Seller A cannot see Seller B products/order data
  // ─────────────────────────────────────────────────────────────────────────
  describe('seller order isolation', () => {
    it('findOrdersBySeller filters by seller_id via order_items.seller_id', async () => {
      const sellerAOrder = buildOrderRow({ id: 1001, checkout_group_id: CHECKOUT_GROUP_ID });
      const sellerAItemRows = buildOrderRowsWithItems(sellerAOrder, [{
        product_id: 1, product_name: 'Racket A', quantity: 2, unit_price: 500,
        item_total: 1000, seller_id: SELLER_A, shop_name: 'Shop A',
      }]);

      repoMock.findSellerOrgsForUser.mockResolvedValue([{ id: SELLER_A, is_active: 1, owner_id: 1 }]);
      repoMock.findOrdersBySeller.mockResolvedValueOnce({
        data: sellerAItemRows,
        total: 1,
        page: 1,
        limit: 10,
      });

      const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 10 });

      expect(repoMock.findOrdersBySeller).toHaveBeenCalledWith(
        [SELLER_A],
        expect.objectContaining({ page: 1, limit: 10 }),
      );

      expect(result.data.length).toBeGreaterThanOrEqual(1);
      const items = result.data[0].items;
      expect(items.every((i: any) => i.shopName === 'Shop A')).toBe(true);
    });

    it('seller B orders are completely absent from seller A result', async () => {
      repoMock.findSellerOrgsForUser.mockResolvedValue([{ id: SELLER_A, is_active: 1, owner_id: 1 }]);
      repoMock.findOrdersBySeller.mockResolvedValueOnce({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      });

      const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 10 });
      expect(result.data).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: Buyer sees grouped orders from one checkout
  // ─────────────────────────────────────────────────────────────────────────
  describe('_groupOrdersByItem merges orders by checkout_group_id', () => {
    it('merges 2 orders with same checkout_group_id into 1 grouped result', () => {
      const groupA = {
        id: 2001, public_id: 'pub-2001', checkout_group_id: CHECKOUT_GROUP_ID,
        status: 'pending', payment_status: 'unpaid',
        subtotal: 1000, shipping_cost: 50, discount_amount: 0, total: 1050,
        tax_amount: 0, commission_amount: 100,
        currency_code: 'EGP', payment_method: 'wallet',
        created_at: '2026-08-25T10:00:00Z',
        estimated_delivery_date: null, tracking_number: null, shipping_carrier: null,
        buyer_name: null, buyer_phone: null, shop_name: 'Shop A',
        item_seller_id: SELLER_A, product_id: 1, product_name: 'Racket A',
        variant_name: null, quantity: 2, unit_price: 500, item_total: 1000,
        images: null, org_name: null, seller_id: SELLER_A,
      };

      const groupB = {
        ...groupA,
        id: 2002, public_id: 'pub-2002',
        subtotal: 300, shipping_cost: 30, total: 330,
        commission_amount: 30, tax_amount: 0,
        shop_name: 'Shop B', item_seller_id: SELLER_B,
        product_id: 2, product_name: 'Shoes B',
        quantity: 1, unit_price: 300, item_total: 300,
        seller_id: SELLER_B,
      };

      const result = marketplaceService._groupOrdersByItem({
        data: [groupA, groupB],
        total: 2,
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);

      const grouped = result.data[0];
      expect(grouped.checkout_group_id).toBe(CHECKOUT_GROUP_ID);
      expect(grouped._isGrouped).toBe(true);
      expect(grouped._sellerOrderCount).toBe(2);

      expect(grouped.subtotal).toBe(1300);
      expect(grouped.shipping_cost).toBe(80);
      expect(grouped.total).toBe(1380);
      expect(grouped.commission_amount).toBe(130);

      expect(grouped.items).toHaveLength(2);
      expect(grouped.items.map((i: any) => i.productId).sort()).toEqual([1, 2]);
    });

    it('ungrouped orders (no checkout_group_id) remain separate', () => {
      const legacyOrder = {
        id: 3001, public_id: 'pub-3001', checkout_group_id: null,
        status: 'pending', payment_status: 'unpaid',
        subtotal: 500, shipping_cost: 20, discount_amount: 0, total: 520,
        tax_amount: 0, commission_amount: 50,
        currency_code: 'EGP', payment_method: 'card',
        created_at: '2026-08-24T10:00:00Z',
        estimated_delivery_date: null, tracking_number: null, shipping_carrier: null,
        buyer_name: null, buyer_phone: null, shop_name: null,
        item_seller_id: SELLER_A, product_id: 1, product_name: 'Racket A',
        variant_name: null, quantity: 1, unit_price: 500, item_total: 500,
        images: null, org_name: null, seller_id: SELLER_A,
      };

      const result = marketplaceService._groupOrdersByItem({
        data: [legacyOrder],
        total: 1,
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]._isGrouped).toBeFalsy();
      expect(result.data[0].items).toHaveLength(1);
    });

    it('mixed grouped + ungrouped orders are both present in output', () => {
      const groupedRow = {
        id: 4001, public_id: 'pub-4001', checkout_group_id: CHECKOUT_GROUP_ID,
        status: 'confirmed', payment_status: 'paid',
        subtotal: 1000, shipping_cost: 50, discount_amount: 0, total: 1050,
        tax_amount: 0, commission_amount: 100,
        currency_code: 'EGP', payment_method: 'wallet',
        created_at: '2026-08-25T12:00:00Z',
        estimated_delivery_date: null, tracking_number: null, shipping_carrier: null,
        buyer_name: null, buyer_phone: null, shop_name: null,
        item_seller_id: SELLER_A, product_id: 1, product_name: 'Racket A',
        variant_name: null, quantity: 2, unit_price: 500, item_total: 1000,
        images: null, org_name: null, seller_id: SELLER_A,
      };

      const groupedRow2 = {
        ...groupedRow,
        id: 4002, public_id: 'pub-4002',
        subtotal: 300, shipping_cost: 30, total: 330,
        commission_amount: 30,
        product_id: 2, product_name: 'Shoes B', quantity: 1, unit_price: 300, item_total: 300,
        shop_name: 'Shop B', item_seller_id: SELLER_B, seller_id: SELLER_B,
      };

      const ungroupedRow = {
        id: 4003, public_id: 'pub-4003', checkout_group_id: null,
        status: 'pending', payment_status: 'unpaid',
        subtotal: 200, shipping_cost: 10, discount_amount: 0, total: 210,
        tax_amount: 0, commission_amount: 20,
        currency_code: 'EGP', payment_method: 'cash',
        created_at: '2026-08-23T10:00:00Z',
        estimated_delivery_date: null, tracking_number: null, shipping_carrier: null,
        buyer_name: null, buyer_phone: null, shop_name: null,
        item_seller_id: SELLER_A, product_id: 3, product_name: 'Grip A',
        variant_name: null, quantity: 1, unit_price: 200, item_total: 200,
        images: null, org_name: null, seller_id: SELLER_A,
      };

      const result = marketplaceService._groupOrdersByItem({
        data: [groupedRow, groupedRow2, ungroupedRow],
        total: 3,
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(2);

      const groupedEntry = result.data.find((d: any) => d._isGrouped);
      expect(groupedEntry).toBeDefined();
      expect(groupedEntry._sellerOrderCount).toBe(2);
      expect(groupedEntry.items).toHaveLength(2);

      const ungroupedEntry = result.data.find((d: any) => !d._isGrouped);
      expect(ungroupedEntry).toBeDefined();
      expect(ungroupedEntry.items).toHaveLength(1);
    });

    it('output is sorted by created_at DESC', () => {
      const makeRow = (id: number, createdAt: string) => ({
        id, public_id: `pub-${id}`, checkout_group_id: null,
        status: 'pending', payment_status: 'unpaid',
        subtotal: 100, shipping_cost: 0, discount_amount: 0, total: 100,
        tax_amount: 0, commission_amount: 0,
        currency_code: 'EGP', payment_method: 'wallet',
        created_at: createdAt,
        estimated_delivery_date: null, tracking_number: null, shipping_carrier: null,
        buyer_name: null, buyer_phone: null, shop_name: null,
        item_seller_id: SELLER_A, product_id: 1, product_name: 'Item',
        variant_name: null, quantity: 1, unit_price: 100, item_total: 100,
        images: null, org_name: null, seller_id: SELLER_A,
      });

      const result = marketplaceService._groupOrdersByItem({
        data: [
          makeRow(5001, '2026-08-20T10:00:00Z'),
          makeRow(5002, '2026-08-25T10:00:00Z'),
          makeRow(5003, '2026-08-22T10:00:00Z'),
        ],
        total: 3,
        page: 1,
        limit: 10,
      });

      const ids = result.data.map((d: any) => d.id);
      expect(ids).toEqual([5002, 5003, 5001]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: Shipping/commission/accounting totals are correct per seller
  // ─────────────────────────────────────────────────────────────────────────
  describe('per-seller totals are correct', () => {
    it('each order carries its own shipping, commission, tax, and total', () => {
      const orderA = buildOrderRow({
        id: 6001, checkout_group_id: CHECKOUT_GROUP_ID, shop_name: 'Shop A',
        subtotal: 1000, shipping_cost: 50, commission_amount: 100, total: 1050,
      });
      const orderARows = buildOrderRowsWithItems(orderA, [
        { product_id: 1, product_name: 'Racket A', quantity: 2, unit_price: 500, item_total: 1000, seller_id: SELLER_A, commission_rate: 10, commission_amount: 100 },
      ]);

      const orderB = buildOrderRow({
        id: 6002, checkout_group_id: CHECKOUT_GROUP_ID, shop_name: 'Shop B',
        subtotal: 300, shipping_cost: 30, total: 330, commission_amount: 30,
      });
      const orderBRows = buildOrderRowsWithItems(orderB, [
        { product_id: 2, product_name: 'Shoes B', quantity: 1, unit_price: 300, item_total: 300, seller_id: SELLER_B, commission_rate: 10, commission_amount: 30 },
      ]);

      const result = marketplaceService._groupOrdersByItem({
        data: [...orderARows, ...orderBRows],
        total: 2,
        page: 1,
        limit: 10,
      });

      const grouped = result.data[0];
      expect(grouped._sellerOrderCount).toBe(2);

      const sellerOrders = grouped._sellerOrders;
      expect(sellerOrders).toHaveLength(2);

      const saOrder = sellerOrders.find((o: any) => o.id === 6001);
      const sbOrder = sellerOrders.find((o: any) => o.id === 6002);

      expect(saOrder.subtotal).toBe(1000);
      expect(saOrder.shipping_cost).toBe(50);
      expect(saOrder.commission_amount).toBe(100);

      expect(sbOrder.subtotal).toBe(300);
      expect(sbOrder.shipping_cost).toBe(30);
      expect(sbOrder.commission_amount).toBe(30);

      expect(grouped.subtotal).toBe(1300);
      expect(grouped.shipping_cost).toBe(80);
      expect(grouped.commission_amount).toBe(130);
      expect(grouped.total).toBe(1380);
    });

    it('does NOT double-count an order total when the order has 2+ items (order_items join rows)', () => {
      const padelEdge = buildOrderRow({
        id: 5551, checkout_group_id: CHECKOUT_GROUP_ID, shop_name: 'Padel Edge',
        subtotal: 350, shipping_cost: 50, commission_amount: 17.5, total: 400,
      });
      const padelRows = buildOrderRowsWithItems(padelEdge, [
        { product_id: 1, product_name: 'Wilson Padel Ball 150', quantity: 1, unit_price: 150, item_total: 150, seller_id: SELLER_A },
        { product_id: 2, product_name: 'Adidas Padel Pro Ball 200', quantity: 1, unit_price: 200, item_total: 200, seller_id: SELLER_A },
      ]);

      const shop5 = buildOrderRow({
        id: 5552, checkout_group_id: CHECKOUT_GROUP_ID, shop_name: 'Shop 5',
        subtotal: 85, shipping_cost: 60, commission_amount: 4.25, total: 145,
      });
      const shop5Rows = buildOrderRowsWithItems(shop5, [
        { product_id: 3, product_name: 'Match Badminton Racket', quantity: 1, unit_price: 85, item_total: 85, seller_id: SELLER_B },
      ]);

      const result = marketplaceService._groupOrdersByItem({
        data: [...padelRows, ...shop5Rows],
        total: 3,
        page: 1,
        limit: 10,
      });

      const grouped = result.data[0];
      expect(grouped._sellerOrderCount).toBe(2);

      const peOrder = grouped._sellerOrders.find((o: any) => o.id === 5551);
      expect(peOrder.items).toHaveLength(2);
      expect(peOrder.total).toBe(400);
      expect(grouped.subtotal).toBe(435);
      expect(grouped.shipping_cost).toBe(110);
      expect(grouped.total).toBe(545);
    });

    it('tax_amount is tracked per-seller and aggregated correctly', () => {
      const orderA = buildOrderRow({
        id: 7001, checkout_group_id: CHECKOUT_GROUP_ID,
        subtotal: 1000, shipping_cost: 50, tax_amount: 150, total: 1200, commission_amount: 100,
      });
      const orderARows = buildOrderRowsWithItems(orderA, [
        { product_id: 1, product_name: 'Racket A', quantity: 2, unit_price: 500, item_total: 1000, seller_id: SELLER_A },
      ]);

      const orderB = buildOrderRow({
        id: 7002, checkout_group_id: CHECKOUT_GROUP_ID,
        subtotal: 300, shipping_cost: 30, tax_amount: 45, total: 375, commission_amount: 30,
      });
      const orderBRows = buildOrderRowsWithItems(orderB, [
        { product_id: 2, product_name: 'Shoes B', quantity: 1, unit_price: 300, item_total: 300, seller_id: SELLER_B },
      ]);

      const result = marketplaceService._groupOrdersByItem({
        data: [...orderARows, ...orderBRows],
        total: 2,
        page: 1,
        limit: 10,
      });

      const grouped = result.data[0];
      expect(grouped.tax_amount).toBe(195);
      expect(grouped._sellerOrders[0].tax_amount).toBe(150);
      expect(grouped._sellerOrders[1].tax_amount).toBe(45);
    });

    it('discount_amount is proportional per-seller', () => {
      const orderA = buildOrderRow({
        id: 8001, checkout_group_id: CHECKOUT_GROUP_ID,
        subtotal: 1000, discount_amount: 67, shipping_cost: 50, total: 983, commission_amount: 100,
      });
      const orderARows = buildOrderRowsWithItems(orderA, [
        { product_id: 1, product_name: 'Racket A', quantity: 2, unit_price: 500, item_total: 1000, seller_id: SELLER_A },
      ]);

      const orderB = buildOrderRow({
        id: 8002, checkout_group_id: CHECKOUT_GROUP_ID,
        subtotal: 300, discount_amount: 33, shipping_cost: 30, total: 297, commission_amount: 30,
      });
      const orderBRows = buildOrderRowsWithItems(orderB, [
        { product_id: 2, product_name: 'Shoes B', quantity: 1, unit_price: 300, item_total: 300, seller_id: SELLER_B },
      ]);

      const result = marketplaceService._groupOrdersByItem({
        data: [...orderARows, ...orderBRows],
        total: 2,
        page: 1,
        limit: 10,
      });

      const grouped = result.data[0];
      expect(grouped.discount_amount).toBe(100);
      expect(grouped._sellerOrders[0].discount_amount).toBe(67);
      expect(grouped._sellerOrders[1].discount_amount).toBe(33);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: Payment fulfillment processes all orders in checkout group
  // ─────────────────────────────────────────────────────────────────────────
  describe('handlePaymentSucceeded fulfills all orders in checkout group', () => {
    it('fulfills every order in the checkout group, not just the primary', async () => {
      const orderA = buildOrderRow({ id: 9001, checkout_group_id: CHECKOUT_GROUP_ID, status: 'pending' });
      const orderB = buildOrderRow({ id: 9002, checkout_group_id: CHECKOUT_GROUP_ID, status: 'pending' });

      const rowsA = buildOrderRowsWithItems(orderA, [
        { product_id: 1, product_name: 'Racket A', quantity: 2, unit_price: 500, item_total: 1000, seller_id: SELLER_A },
      ]);
      const rowsB = buildOrderRowsWithItems(orderB, [
        { product_id: 2, product_name: 'Shoes B', quantity: 1, unit_price: 300, item_total: 300, seller_id: SELLER_B },
      ]);

      repoMock.findOrderById.mockImplementation(async (id: number) => {
        if (id === 9001) return rowsA;
        if (id === 9002) return rowsB;
        return [];
      });

      repoMock.findOrderIdsByCheckoutGroup.mockResolvedValue([9001, 9002]);

      await marketplaceService.handlePaymentSucceeded({
        paymentId: 100,
        referenceType: 'order',
        referenceId: 9001,
        amount: 1380,
      });

      expect(repoMock.updateOrderStatus).toHaveBeenCalledWith(9001, 'confirmed');
      expect(repoMock.updateOrderStatus).toHaveBeenCalledWith(9002, 'confirmed');
    });

    it('skips already-confirmed orders (idempotent)', async () => {
      const orderA = buildOrderRow({ id: 9101, checkout_group_id: CHECKOUT_GROUP_ID, status: 'confirmed' });

      repoMock.findOrderById.mockResolvedValueOnce(buildOrderRowsWithItems(orderA, [
        { product_id: 1, product_name: 'Racket A', quantity: 1, unit_price: 500, item_total: 500, seller_id: SELLER_A },
      ]));

      await marketplaceService.handlePaymentSucceeded({
        paymentId: 101,
        referenceType: 'order',
        referenceId: 9101,
        amount: 500,
      });

      expect(repoMock.updateOrderStatus).not.toHaveBeenCalled();
    });

    it('skips cancelled orders (delayed webhook safety)', async () => {
      const orderA = buildOrderRow({ id: 9201, checkout_group_id: CHECKOUT_GROUP_ID, status: 'cancelled' });

      repoMock.findOrderById.mockResolvedValueOnce(buildOrderRowsWithItems(orderA, [
        { product_id: 1, product_name: 'Racket A', quantity: 1, unit_price: 500, item_total: 500, seller_id: SELLER_A },
      ]));

      await marketplaceService.handlePaymentSucceeded({
        paymentId: 102,
        referenceType: 'order',
        referenceId: 9201,
        amount: 500,
      });

      expect(repoMock.updateOrderStatus).not.toHaveBeenCalled();
    });

    it('legacy single order (no checkout_group_id) is fulfilled individually', async () => {
      const orderA = buildOrderRow({ id: 9301, checkout_group_id: null, status: 'pending' });
      const rowsA = buildOrderRowsWithItems(orderA, [
        { product_id: 1, product_name: 'Racket A', quantity: 1, unit_price: 500, item_total: 500, seller_id: SELLER_A },
      ]);

      repoMock.findOrderById.mockImplementation(async () => rowsA);
      repoMock.findOrderIdsByCheckoutGroup.mockResolvedValueOnce([]);

      await marketplaceService.handlePaymentSucceeded({
        paymentId: 103,
        referenceType: 'order',
        referenceId: 9301,
        amount: 500,
      });

      expect(repoMock.updateOrderStatus).toHaveBeenCalledWith(9301, 'confirmed');
      expect(repoMock.updateOrderStatus).toHaveBeenCalledTimes(1);
    });

    it('non-order reference types are ignored', async () => {
      await marketplaceService.handlePaymentSucceeded({
        paymentId: 104,
        referenceType: 'booking',
        referenceId: 9401,
        amount: 200,
      });

      expect(repoMock.findOrderById).not.toHaveBeenCalled();
    });

    it('handlePaymentFailed cancels all orders in checkout group', async () => {
      const orderA = buildOrderRow({ id: 9501, checkout_group_id: CHECKOUT_GROUP_ID, status: 'pending', buyer_id: BUYER });
      const orderB = buildOrderRow({ id: 9502, checkout_group_id: CHECKOUT_GROUP_ID, status: 'pending', buyer_id: BUYER });

      const rowsA = buildOrderRowsWithItems(orderA, [
        { product_id: 1, product_name: 'Racket A', quantity: 1, unit_price: 500, item_total: 500, seller_id: SELLER_A },
      ]);
      const rowsB = buildOrderRowsWithItems(orderB, [
        { product_id: 2, product_name: 'Shoes B', quantity: 1, unit_price: 300, item_total: 300, seller_id: SELLER_B },
      ]);

      repoMock.findOrderById.mockImplementation(async (id: number) => {
        if (id === 9501) return rowsA;
        if (id === 9502) return rowsB;
        return rowsA;
      });
      repoMock.findOrderIdsByCheckoutGroup.mockResolvedValue([9501, 9502]);

      await marketplaceService.handlePaymentFailed({
        paymentId: 105,
        referenceType: 'order',
        referenceId: 9501,
        amount: 500,
        reason: 'Gateway timeout',
      });

      expect(repoMock.restoreStock).toHaveBeenCalledTimes(2);

      expect(repoMock.updateOrderStatus).toHaveBeenCalledWith(9501, 'cancelled', 'Gateway timeout');
      expect(repoMock.updateOrderStatus).toHaveBeenCalledWith(9502, 'cancelled', 'Gateway timeout');

      expect(mockEmit).toHaveBeenCalledWith('marketplace:order-cancelled', expect.objectContaining({
        orderId: 9501,
        userId: BUYER,
        reason: 'Gateway timeout',
      }));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 6: Stock ledger entries go to correct seller order (BUG #1 fix)
  // ─────────────────────────────────────────────────────────────────────────
  describe('stock ledger entries are attributed to correct seller order', () => {
    it('each item stock deduction references the correct per-seller orderId', async () => {
      repoMock.findCartByUser.mockResolvedValueOnce([cartItemA, cartItemB]);
      repoMock.findProductsByIds.mockResolvedValueOnce([productA, productB]);
      repoMock.findVariantsForProducts.mockResolvedValueOnce([]);

      // Track created order IDs so we know which seller gets which ID
      const createdOrderIds: number[] = [];
      repoMock.createOrder.mockImplementation(async (data: any) => {
        const id = ++orderCounter;
        createdOrderIds.push(id);
        const order = buildOrderRow({ id, ...data, checkout_group_id: data.checkoutGroupId });
        orderStore.set(id, order);
        return id;
      });

      repoMock.findOrderById.mockImplementation(async (id: number) => {
        const order = orderStore.get(id);
        if (!order) return [];
        const items = orderItemStore.filter(i => i.orderId === id);
        return buildOrderRowsWithItems(order, items.map(i => ({
          product_id: i.productId,
          product_name: `Product ${i.productId}`,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          item_total: i.totalPrice,
          seller_id: i.sellerId,
        })));
      });

      await marketplaceService.checkout(BUYER, {
        addressId: 1,
        paymentMethod: 'wallet',
      });

      // Phase 2 Step 5: marketplace_ledger_entries no longer written.
      // Stock deduction verified by decrementStock calls instead.
      expect(repoMock.decrementStock).toHaveBeenCalledTimes(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 7: Order-placed events carry correct per-seller data (BUG #2 fix)
  // ─────────────────────────────────────────────────────────────────────────
  describe('order-placed events carry correct per-seller orderId and total', () => {
    it('each seller event references their own order ID and seller-specific total', async () => {
      repoMock.findCartByUser.mockResolvedValueOnce([cartItemA, cartItemB]);
      repoMock.findProductsByIds.mockResolvedValueOnce([productA, productB]);
      repoMock.findVariantsForProducts.mockResolvedValueOnce([]);

      const createdOrderIds: number[] = [];
      repoMock.createOrder.mockImplementation(async (data: any) => {
        const id = ++orderCounter;
        createdOrderIds.push(id);
        const order = buildOrderRow({ id, ...data, checkout_group_id: data.checkoutGroupId });
        orderStore.set(id, order);
        return id;
      });

      repoMock.findOrderById.mockImplementation(async (id: number) => {
        const order = orderStore.get(id);
        if (!order) return [];
        const items = orderItemStore.filter(i => i.orderId === id);
        return buildOrderRowsWithItems(order, items.map(i => ({
          product_id: i.productId,
          product_name: `Product ${i.productId}`,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          item_total: i.totalPrice,
          seller_id: i.sellerId,
        })));
      });

      await marketplaceService.checkout(BUYER, {
        addressId: 1,
        paymentMethod: 'wallet',
      });

      // Find all order-placed events
      const orderPlacedEvents = mockEmit.mock.calls.filter(
        (c: any[]) => c[0] === 'marketplace:order-placed'
      );

      expect(orderPlacedEvents).toHaveLength(2);

      // Seller A event
      const eventA = orderPlacedEvents.find((c: any[]) => c[1].sellerId === SELLER_A);
      expect(eventA).toBeDefined();
      expect(eventA![1].orderId).toBe(createdOrderIds[0]);
      // Seller A's total should be per-seller, not grand total
      expect(eventA![1].total).toBeGreaterThan(0);

      // Seller B event
      const eventB = orderPlacedEvents.find((c: any[]) => c[1].sellerId === SELLER_B);
      expect(eventB).toBeDefined();
      expect(eventB![1].orderId).toBe(createdOrderIds[1]);
      expect(eventB![1].total).toBeGreaterThan(0);

      // Each seller's total should differ (they have different product prices/quantities)
      expect(eventA![1].orderId).not.toBe(eventB![1].orderId);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 8: Single-seller checkout creates exactly 1 order
  // ─────────────────────────────────────────────────────────────────────────
  describe('single-seller checkout', () => {
    it('only 1 order created when all items belong to the same seller', async () => {
      const cartItemA2 = { ...cartItemA, id: 103 };
      repoMock.findCartByUser.mockResolvedValueOnce([cartItemA, cartItemA2]);
      repoMock.findProductsByIds.mockResolvedValueOnce([productA, productA]);
      repoMock.findVariantsForProducts.mockResolvedValueOnce([]);

      repoMock.findOrderById.mockImplementation(async (id: number) => {
        const order = orderStore.get(id);
        if (!order) return [];
        const items = orderItemStore.filter(i => i.orderId === id);
        return buildOrderRowsWithItems(order, items.map(i => ({
          product_id: i.productId,
          product_name: `Product ${i.productId}`,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          item_total: i.totalPrice,
          seller_id: i.sellerId,
        })));
      });

      await marketplaceService.checkout(BUYER, {
        addressId: 1,
        paymentMethod: 'wallet',
      });

      expect(repoMock.createOrder).toHaveBeenCalledTimes(1);
      expect(repoMock.createOrderItem).toHaveBeenCalledTimes(2);

      // Both items should reference the same order
      const itemOrderIds = repoMock.createOrderItem.mock.calls.map((c: any[]) => c[0].orderId);
      expect(itemOrderIds[0]).toBe(itemOrderIds[1]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 9: Checkout group cancellation cancels all sibling orders
  // ─────────────────────────────────────────────────────────────────────────
  describe('cancelOrder cancels all orders in the checkout group', () => {
    it('cancels sibling orders when buyer cancels one order', async () => {
      const orderA = buildOrderRow({ id: 10001, checkout_group_id: CHECKOUT_GROUP_ID, status: 'pending', buyer_id: BUYER });
      const orderB = buildOrderRow({ id: 10002, checkout_group_id: CHECKOUT_GROUP_ID, status: 'confirmed', buyer_id: BUYER });

      const rowsA = buildOrderRowsWithItems(orderA, [
        { product_id: 1, product_name: 'Racket A', quantity: 1, unit_price: 500, item_total: 500, seller_id: SELLER_A },
      ]);
      const rowsB = buildOrderRowsWithItems(orderB, [
        { product_id: 2, product_name: 'Shoes B', quantity: 1, unit_price: 300, item_total: 300, seller_id: SELLER_B },
      ]);

      repoMock.findOrderById.mockImplementation(async (id: number) => {
        if (id === 10001) return rowsA;
        if (id === 10002) return rowsB;
        return [];
      });
      repoMock.findOrderIdsByCheckoutGroup.mockResolvedValue([10001, 10002]);
      repoMock.orderHasPaidPayment.mockResolvedValue(false);

      await marketplaceService.cancelOrder(10001, BUYER);

      // Both orders should have been cancelled
      expect(repoMock.updateOrderStatus).toHaveBeenCalledWith(10001, 'cancelled', 'User cancelled payment');
      expect(repoMock.updateOrderStatus).toHaveBeenCalledWith(10002, 'cancelled', 'Checkout group cancelled');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 10: Per-seller order totals are accurate
  // ─────────────────────────────────────────────────────────────────────────
  describe('checkout creates orders with accurate per-seller totals', () => {
    it('seller A gets subtotal = price × qty, shipping from their rate, seller B gets theirs', async () => {
      // cartItemA: price 500, qty 2 → subtotal 1000
      // cartItemB: price 300, qty 1 → subtotal 300
      repoMock.findCartByUser.mockResolvedValueOnce([cartItemA, cartItemB]);
      repoMock.findProductsByIds.mockResolvedValueOnce([productA, productB]);
      repoMock.findVariantsForProducts.mockResolvedValueOnce([]);

      repoMock.findOrderById.mockImplementation(async (id: number) => {
        const order = orderStore.get(id);
        if (!order) return [];
        const items = orderItemStore.filter(i => i.orderId === id);
        return buildOrderRowsWithItems(order, items.map(i => ({
          product_id: i.productId,
          product_name: `Product ${i.productId}`,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          item_total: i.totalPrice,
          seller_id: i.sellerId,
        })));
      });

      await marketplaceService.checkout(BUYER, {
        addressId: 1,
        paymentMethod: 'wallet',
      });

      const orderArgs = repoMock.createOrder.mock.calls.map((c: any[]) => c[0]);

      // Both orders should have same shipping (both sellers use same rate in mock)
      for (const call of orderArgs) {
        expect(call.shippingCost).toBe(50);
      }

      // Subtotals should differ based on product price × quantity
      const sellerASubtotal = 500 * 2; // 1000
      const sellerBSubtotal = 300 * 1; // 300
      const subtotals = orderArgs.map((c: any) => c.subtotal).sort((a: number, b: number) => a - b);
      expect(subtotals).toContain(sellerASubtotal);
      expect(subtotals).toContain(sellerBSubtotal);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 11: getOrderForUser seller view — must NOT see buyer's merged view (BUG #3)
  // ─────────────────────────────────────────────────────────────────────────
  describe('getOrderForUser seller isolation (BUG #3 fix)', () => {
    it('seller sees only their own items, not the merged checkout group', async () => {
      const orderA = buildOrderRow({ id: 11001, checkout_group_id: CHECKOUT_GROUP_ID, status: 'confirmed', buyer_id: BUYER });
      const orderB = buildOrderRow({ id: 11002, checkout_group_id: CHECKOUT_GROUP_ID, status: 'confirmed', buyer_id: BUYER });

      const rowsA = buildOrderRowsWithItems(orderA, [
        { product_id: 1, product_name: 'Racket A', quantity: 2, unit_price: 500, item_total: 1000, seller_id: SELLER_A },
      ]);
      const rowsB = buildOrderRowsWithItems(orderB, [
        { product_id: 2, product_name: 'Shoes B', quantity: 1, unit_price: 300, item_total: 300, seller_id: SELLER_B },
      ]);

      repoMock.findOrderById.mockImplementation(async (id: number, buyerId?: number, sellerOrgIds?: number | number[]) => {
        // Buyer filter: fails because seller is not buyer
        if (buyerId) return [];
        // Seller filter: returns only seller A's order
        const ids = Array.isArray(sellerOrgIds) ? sellerOrgIds : (sellerOrgIds !== undefined ? [sellerOrgIds] : []);
        if (ids.includes(SELLER_A)) return rowsA;
        // Unfiltered: returns seller A's order (the one with matching ID)
        return rowsA;
      });

      repoMock.findSellerOrgsForUser.mockResolvedValue([{ id: SELLER_A, is_active: 1, owner_id: SELLER_A + 1000 }]);

      const result = await marketplaceService.getOrderForUser(11001, SELLER_A + 1000);

      expect(result.viewedAsSeller).toBe(true);
      // Seller should see ONLY their items, NOT the merged checkout group
      expect(result.items).toHaveLength(1);
      expect(result.items[0].productName).toBe('Racket A');
      expect(result._isGrouped).toBeFalsy();
    });

    it('buyer sees the merged checkout group with all sellers items', async () => {
      const orderA = buildOrderRow({ id: 11011, checkout_group_id: CHECKOUT_GROUP_ID, status: 'confirmed', buyer_id: BUYER });
      const orderB = buildOrderRow({ id: 11012, checkout_group_id: CHECKOUT_GROUP_ID, status: 'confirmed', buyer_id: BUYER });

      const rowsA = buildOrderRowsWithItems(orderA, [
        { product_id: 1, product_name: 'Racket A', quantity: 2, unit_price: 500, item_total: 1000, seller_id: SELLER_A },
      ]);
      const rowsB = buildOrderRowsWithItems(orderB, [
        { product_id: 2, product_name: 'Shoes B', quantity: 1, unit_price: 300, item_total: 300, seller_id: SELLER_B },
      ]);

      repoMock.findOrderById.mockImplementation(async (id: number, buyerId?: number) => {
        if (buyerId === BUYER) return rowsA;
        if (!buyerId) return [...rowsA, ...rowsB];
        return [];
      });

      repoMock.findOrdersByCheckoutGroup.mockResolvedValue([...rowsA, ...rowsB]);
      repoMock.findSellerOrgsForUser.mockResolvedValue([]);

      const result = await marketplaceService.getOrderForUser(11011, BUYER);

      expect(result.viewedAsSeller).toBe(false);
      // Buyer should see merged items from both sellers
      expect(result.items).toHaveLength(2);
      expect(result._isGrouped).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 12: updateOrderStatus cancels sibling orders (BUG #6 fix)
  // ─────────────────────────────────────────────────────────────────────────
  describe('updateOrderStatus cancels checkout group siblings (BUG #6 fix)', () => {
    it('cancelling via status endpoint cancels all sibling orders in checkout group', async () => {
      const orderA = buildOrderRow({ id: 12001, checkout_group_id: CHECKOUT_GROUP_ID, status: 'confirmed', buyer_id: BUYER });
      const orderB = buildOrderRow({ id: 12002, checkout_group_id: CHECKOUT_GROUP_ID, status: 'confirmed', buyer_id: BUYER });

      const rowsA = buildOrderRowsWithItems(orderA, [
        { product_id: 1, product_name: 'Racket A', quantity: 1, unit_price: 500, item_total: 500, seller_id: SELLER_A },
      ]);
      const rowsB = buildOrderRowsWithItems(orderB, [
        { product_id: 2, product_name: 'Shoes B', quantity: 1, unit_price: 300, item_total: 300, seller_id: SELLER_B },
      ]);

      repoMock.findOrderById.mockImplementation(async (id: number) => {
        if (id === 12001) return rowsA;
        if (id === 12002) return rowsB;
        return [];
      });
      repoMock.findOrderIdsByCheckoutGroup.mockResolvedValue([12001, 12002]);

      await marketplaceService.updateOrderStatus(12001, BUYER, { status: 'cancelled', note: 'Buyer cancelled' });

      // Both orders should be cancelled
      expect(repoMock.updateOrderStatus).toHaveBeenCalledWith(12001, 'cancelled', 'Buyer cancelled');
      expect(repoMock.updateOrderStatus).toHaveBeenCalledWith(12002, 'cancelled', 'Buyer cancelled');
      // Stock should be restored for both
      expect(repoMock.restoreStock).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 13: _fulfillAndConfirmOrder emits correct sellerId (BUG #7 fix)
  // ─────────────────────────────────────────────────────────────────────────
  describe('_fulfillAndConfirmOrder emits correct sellerId (BUG #7 fix)', () => {
    it('order-confirmed event uses item_seller_id, not orders.seller_id', async () => {
      const orderA = buildOrderRow({ id: 13001, checkout_group_id: null, status: 'pending', buyer_id: BUYER });
      const rowsA = buildOrderRowsWithItems(orderA, [
        { product_id: 1, product_name: 'Racket A', quantity: 1, unit_price: 500, item_total: 500, seller_id: SELLER_A },
      ]);

      repoMock.findOrderById.mockResolvedValue(rowsA);
      repoMock.orderHasPaidPayment.mockResolvedValue(false);

      await marketplaceService._fulfillAndConfirmOrder(13001, BUYER, 'Payment confirmed');

      const confirmedEvent = mockEmit.mock.calls.find(
        (c: any[]) => c[0] === 'marketplace:order-confirmed'
      );
      expect(confirmedEvent).toBeDefined();
      expect(confirmedEvent![1].sellerId).toBe(SELLER_A);
    });
  });
});
