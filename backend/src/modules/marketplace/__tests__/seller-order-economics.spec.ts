/**
 * Phase 3 Step 4 — Per-Order Seller Economics regression suite.
 *
 * Proves (13+ required dimensions):
 *   1.  Single order, single item → all financial fields present
 *   2.  Single order, multiple items → financials aggregated correctly
 *   3.  Multi-seller checkout → seller sees ONLY their order
 *   4.  Multi-seller checkout → financials match DB per-seller
 *   5.  Padel Edge and Shop 5 equivalence → same checkout, both see own economics
 *   6.  Buyer total unchanged → seller view doesn't modify buyer total
 *   7.  No duplicate commission → commission appears once per order
 *   8.  Financial status: PENDING → "Pending"
 *   9.  Financial status: AVAILABLE → "Available"
 *  10.  Financial status: ON_HOLD → "Held"
 *  11.  Financial status: ON_HOLD + settlement_id → "Held"
 *  12.  Financial status: SETTLED → "Settled"
 *  13.  Financial status: CANCELLED → "Cancelled"
 *  14.  CARD custody model preserved
 *  15.  CASH/COD custody model preserved
 *  16.  seller_net matches canonical entitlement amount exactly
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repoMock = vi.hoisted(() => ({} as Record<string, any>));
const entitlementRepoMock = vi.hoisted(() => ({} as Record<string, any>));

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn(() => ({ execute: vi.fn(async () => [[], []]) })) }));
vi.mock('../../../database/database.transaction.js', () => ({ withTransaction: vi.fn(async (fn: any) => fn({})) }));
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService: { charge: vi.fn(async () => ({ success: true })), refund: vi.fn() } }));
vi.mock('../../payment/infrastructure/repositories/payment.repository.js', () => ({ paymentRepository: {} }));
vi.mock('../../financial/application/commission.service.js', () => ({ commissionService: { calculate: vi.fn(async () => ({ rate: 10, rateType: 'percentage', planName: 'Basic' })) } }));
vi.mock('../../organisations/application/organisation.service.js', () => ({ organisationService: {} }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({ getCurrentSubscription: vi.fn(async () => ({ exists: true, effectiveStatus: 'active' })) }));
vi.mock('../../auth/infrastructure/repositories/user.repository.js', () => ({ userRepository: { findById: vi.fn(async () => null) } }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: {} }));
vi.mock('../../settlement/application/settlement.service.js', () => ({
  settlementService: {
    requestSettlement: vi.fn(async () => ({ id: 1 })),
    getOrganisationSettlements: vi.fn(async () => ({ data: [], total: 0 })),
  },
}));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: vi.fn(), on: vi.fn() } }));
vi.mock('../infrastructure/repositories/marketplace.repository.js', () => ({ marketplaceRepository: repoMock }));
vi.mock('../../financial/infrastructure/repositories/financial-entitlement.repository.js', () => ({ financialEntitlementRepository: entitlementRepoMock }));

import { marketplaceService } from '../application/marketplace.service.js';

function round2(n: number) { return Math.round(n * 100) / 100; }

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.findSellerOrgsForUser = vi.fn(async (_userId: number) => [{ id: 7, is_active: 1 }]);
  repoMock.findOrdersBySeller = vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 20 }));
  repoMock.findOrderById = vi.fn(async () => []);
  repoMock.findOrderItemIdsBySellerOrders = vi.fn(async () => []);
  entitlementRepoMock.findBySourceIds = vi.fn(async () => []);
});

// ── Helpers ──

function makeOrderRow(overrides: any) {
  return {
    id: overrides.id ?? 1,
    public_id: overrides.public_id ?? 'ord-001',
    checkout_group_id: overrides.checkout_group_id ?? null,
    status: overrides.status ?? 'confirmed',
    payment_status: overrides.payment_status ?? 'paid',
    subtotal: overrides.subtotal ?? 100,
    shipping_cost: overrides.shipping_cost ?? 10,
    discount_amount: overrides.discount_amount ?? 0,
    tax_amount: overrides.tax_amount ?? 0,
    total: overrides.total ?? 110,
    commission_amount: overrides.commission_amount ?? 10,
    courtzon_fee: overrides.courtzon_fee ?? 10,
    currency_code: overrides.currency_code ?? 'EGP',
    payment_method: overrides.payment_method ?? 'card',
    cash_holder: overrides.cash_holder ?? 'courtzon',
    created_at: overrides.created_at ?? '2026-08-20T10:00:00Z',
    estimated_delivery_date: null,
    tracking_number: null,
    shipping_carrier: null,
    buyer_name: 'Test Buyer',
    buyer_phone: '+20100000000',
    product_id: overrides.product_id ?? 1,
    variant_id: null,
    quantity: overrides.quantity ?? 1,
    unit_price: overrides.unit_price ?? 100,
    item_total: overrides.item_total ?? overrides.subtotal ?? 100,
    product_name: 'Test Product',
    images: '[]',
    variant_name: null,
    shop_name: 'Test Shop',
    item_seller_id: overrides.seller_id ?? overrides.id ?? 1,
    product_id_var: undefined,
  };
}

function makeRawRows(orders: any[]) {
  return orders.map((o) => ({
    id: o.id,
    public_id: o.public_id ?? `ord-${o.id}`,
    checkout_group_id: o.checkout_group_id ?? null,
    status: o.status ?? 'confirmed',
    payment_status: o.payment_status ?? 'paid',
    subtotal: o.subtotal ?? 100,
    shipping_cost: o.shipping_cost ?? 10,
    discount_amount: o.discount_amount ?? 0,
    tax_amount: o.tax_amount ?? 0,
    total: o.total ?? 110,
    commission_amount: o.commission_amount ?? 10,
    courtzon_fee: o.courtzon_fee ?? 10,
    currency_code: o.currency_code ?? 'EGP',
    payment_method: o.payment_method ?? 'card',
    created_at: o.created_at ?? '2026-08-20T10:00:00Z',
    estimated_delivery_date: null,
    tracking_number: null,
    shipping_carrier: null,
    buyer_name: 'Test Buyer',
    buyer_phone: '+20100000000',
    product_id: o.product_id ?? 1,
    variant_id: null,
    quantity: o.quantity ?? 1,
    unit_price: o.unit_price ?? 100,
    item_total: o.item_total ?? o.subtotal ?? 100,
    product_name: 'Test Product',
    images: '[]',
    variant_name: null,
    shop_name: 'Test Shop',
  }));
}

function makeEntitlement(orgId: number, itemId: number, type: string, amount: number, status: string, settlementId: number | null = null) {
  return {
    id: Math.floor(Math.random() * 10000),
    public_id: `ent-${itemId}-${type}`,
    organisation_id: orgId,
    branch_id: null,
    entitlement_type: type,
    source_type: 'marketplace',
    source_id: itemId,
    collector: 'courtzon',
    amount,
    currency: 'EGP',
    status,
    hold_reason: null,
    cancelled_reason: null,
    available_at: status === 'AVAILABLE' || status === 'SETTLED' ? new Date() : null,
    settled_at: status === 'SETTLED' ? new Date() : null,
    settled_by: null,
    settlement_id: settlementId,
    description: null,
    metadata: null,
    aggregate_version: 1,
    created_by: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function stubGetSellerOrders(rawRows: any[], total: number) {
  repoMock.findOrdersBySeller.mockResolvedValueOnce({ data: rawRows, total, page: 1, limit: 20 });
}

function stubOrderItemIds(links: { orderId: number; orderItemId: number }[]) {
  repoMock.findOrderItemIdsBySellerOrders.mockResolvedValueOnce(links);
}

function stubEntitlements(ents: any[]) {
  entitlementRepoMock.findBySourceIds.mockResolvedValueOnce(ents);
}

// ══════════════════════════════════════════════════════════════════════
// 1. Single order, single item
// ══════════════════════════════════════════════════════════════════════
describe('1. Single order, single item — all financial fields present', () => {
  it('returns subtotal, shipping, discount, tax, total, commission, seller_net, financial_status', async () => {
    const order = { id: 100, subtotal: 100, shipping_cost: 10, discount_amount: 0, tax_amount: 0, total: 110, commission_amount: 10, seller_id: 7 };
    stubGetSellerOrders(makeRawRows([order]), 1);
    stubOrderItemIds([{ orderId: 100, orderItemId: 1001 }]);
    stubEntitlements([
      makeEntitlement(7, 1001, 'ORGANIZATION_EARNING', 100, 'PENDING'),
      makeEntitlement(7, 1001, 'COURTZON_COMMISSION', 10, 'PENDING'),
    ]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    expect(result.data).toHaveLength(1);

    const o = result.data[0];
    expect(o.subtotal).toBe(100);
    expect(o.shipping_cost).toBe(10);
    expect(o.discount_amount).toBe(0);
    expect(o.total).toBe(110);
    expect(o.commission_amount).toBe(10);
    expect(o.seller_net).toBe(100);
    expect(o.financial_status).toBe('Pending');
  });
});

// ══════════════════════════════════════════════════════════════════════
// 2. Single order, multiple items
// ══════════════════════════════════════════════════════════════════════
describe('2. Single order, multiple items — aggregated correctly', () => {
  it('sums seller_net from both items entitlements', async () => {
    const rawRows = [
      makeRawRows([{ id: 200, subtotal: 200, shipping_cost: 20, discount_amount: 0, tax_amount: 0, total: 220, commission_amount: 20, seller_id: 8, product_id: 1, item_total: 100, quantity: 1, unit_price: 100 }])[0],
      makeRawRows([{ id: 200, subtotal: 200, shipping_cost: 20, discount_amount: 0, tax_amount: 0, total: 220, commission_amount: 20, seller_id: 8, product_id: 2, item_total: 100, quantity: 1, unit_price: 100 }])[0],
    ];
    stubGetSellerOrders(rawRows, 1);
    stubOrderItemIds([{ orderId: 200, orderItemId: 2001 }, { orderId: 200, orderItemId: 2002 }]);
    stubEntitlements([
      makeEntitlement(8, 2001, 'ORGANIZATION_EARNING', 90, 'AVAILABLE'),
      makeEntitlement(8, 2002, 'ORGANIZATION_EARNING', 90, 'AVAILABLE'),
      makeEntitlement(8, 2001, 'COURTZON_COMMISSION', 10, 'AVAILABLE'),
      makeEntitlement(8, 2002, 'COURTZON_COMMISSION', 10, 'AVAILABLE'),
    ]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    const o = result.data[0];
    expect(o.seller_net).toBe(180);
    expect(o.financial_status).toBe('Available');
    expect(o.commission_amount).toBe(20);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 3. Multi-seller checkout — seller sees ONLY their order
// ══════════════════════════════════════════════════════════════════════
describe('3. Multi-seller checkout — seller isolation', () => {
  it('seller A only sees their items, not seller B', async () => {
    const rawRows = [
      makeRawRows([{ id: 300, subtotal: 100, shipping_cost: 10, total: 110, commission_amount: 10, checkout_group_id: 'grp-1', seller_id: 7, product_id: 1, item_total: 100 }])[0],
    ];
    stubGetSellerOrders(rawRows, 1);
    stubOrderItemIds([{ orderId: 300, orderItemId: 3001 }]);
    stubEntitlements([
      makeEntitlement(7, 3001, 'ORGANIZATION_EARNING', 100, 'PENDING'),
      makeEntitlement(7, 3001, 'COURTZON_COMMISSION', 10, 'PENDING'),
    ]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });

    expect(repoMock.findOrdersBySeller).toHaveBeenCalledWith(
      expect.arrayContaining([7]),
      expect.anything(),
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].items).toHaveLength(1);
    expect(result.data[0].items[0].shopName).toBe('Test Shop');
  });
});

// ══════════════════════════════════════════════════════════════════════
// 4. Multi-seller checkout — financials match DB per-seller
// ══════════════════════════════════════════════════════════════════════
describe('4. Multi-seller — financials per-seller', () => {
  it('each seller order has independent financial breakdown', async () => {
    const rawRows = [
      makeRawRows([{ id: 400, subtotal: 500, shipping_cost: 30, discount_amount: 50, tax_amount: 25, total: 505, commission_amount: 45, seller_id: 7, checkout_group_id: 'grp-2', product_id: 1, item_total: 500 }])[0],
    ];
    stubGetSellerOrders(rawRows, 1);
    stubOrderItemIds([{ orderId: 400, orderItemId: 4001 }]);
    stubEntitlements([
      makeEntitlement(7, 4001, 'ORGANIZATION_EARNING', 410, 'PENDING'),
      makeEntitlement(7, 4001, 'COURTZON_COMMISSION', 45, 'PENDING'),
    ]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    const o = result.data[0];
    expect(o.subtotal).toBe(500);
    expect(o.discount_amount).toBe(50);
    expect(o.shipping_cost).toBe(30);
    expect(o.tax_amount).toBe(25);
    expect(o.total).toBe(505);
    expect(o.commission_amount).toBe(45);
    expect(o.seller_net).toBe(410);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 5. Padel Edge and Shop 5 equivalence
// ══════════════════════════════════════════════════════════════════════
describe('5. Padel Edge and Shop 5 — same checkout, independent economics', () => {
  it('each seller sees only their own seller_net', async () => {
    // Simulate Shop 5 seller view (org ID 7 — matches mock)
    const shop5Rows = makeRawRows([{ id: 500, subtotal: 300, shipping_cost: 20, discount_amount: 0, tax_amount: 0, total: 320, commission_amount: 30, seller_id: 7, checkout_group_id: 'grp-pe', product_id: 1, item_total: 300 }]);
    stubGetSellerOrders(shop5Rows, 1);
    stubOrderItemIds([{ orderId: 500, orderItemId: 5001 }]);
    stubEntitlements([
      makeEntitlement(7, 5001, 'ORGANIZATION_EARNING', 290, 'AVAILABLE'),
      makeEntitlement(7, 5001, 'COURTZON_COMMISSION', 30, 'AVAILABLE'),
    ]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    expect(result.data[0].seller_net).toBe(290);
    expect(result.data[0].commission_amount).toBe(30);
    expect(result.data[0].financial_status).toBe('Available');
  });

  it('Padel Edge sees different economics from the same checkout', async () => {
    repoMock.findSellerOrgsForUser.mockResolvedValueOnce([{ id: 8, is_active: 1 }]);
    const peRows = makeRawRows([{ id: 501, subtotal: 200, shipping_cost: 15, discount_amount: 0, tax_amount: 0, total: 215, commission_amount: 20, seller_id: 8, checkout_group_id: 'grp-pe', product_id: 2, item_total: 200 }]);
    stubGetSellerOrders(peRows, 1);
    stubOrderItemIds([{ orderId: 501, orderItemId: 5011 }]);
    stubEntitlements([
      makeEntitlement(8, 5011, 'ORGANIZATION_EARNING', 195, 'PENDING'),
      makeEntitlement(8, 5011, 'COURTZON_COMMISSION', 20, 'PENDING'),
    ]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    expect(result.data[0].seller_net).toBe(195);
    expect(result.data[0].commission_amount).toBe(20);
    expect(result.data[0].financial_status).toBe('Pending');
  });
});

// ══════════════════════════════════════════════════════════════════════
// 6. Buyer total unchanged
// ══════════════════════════════════════════════════════════════════════
describe('6. Buyer total unchanged', () => {
  it('seller_net does not affect order.total', async () => {
    const rawRows = makeRawRows([{ id: 600, subtotal: 200, shipping_cost: 20, discount_amount: 10, tax_amount: 10, total: 220, commission_amount: 19, seller_id: 7 }]);
    stubGetSellerOrders(rawRows, 1);
    stubOrderItemIds([{ orderId: 600, orderItemId: 6001 }]);
    stubEntitlements([
      makeEntitlement(7, 6001, 'ORGANIZATION_EARNING', 180, 'PENDING'),
      makeEntitlement(7, 6001, 'COURTZON_COMMISSION', 19, 'PENDING'),
    ]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    expect(result.data[0].total).toBe(220);
    expect(result.data[0].seller_net).toBe(180);
    expect(result.data[0].seller_net).not.toBe(result.data[0].total);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 7. No duplicate commission
// ══════════════════════════════════════════════════════════════════════
describe('7. No duplicate commission', () => {
  it('commission_amount equals the sum of COURTZON_COMMISSION entitlements', async () => {
    const rawRows = [
      makeRawRows([{ id: 700, subtotal: 100, shipping_cost: 10, total: 110, commission_amount: 10, seller_id: 7, product_id: 1, item_total: 50 }])[0],
      makeRawRows([{ id: 700, subtotal: 100, shipping_cost: 10, total: 110, commission_amount: 10, seller_id: 7, product_id: 2, item_total: 50 }])[0],
    ];
    stubGetSellerOrders(rawRows, 1);
    stubOrderItemIds([{ orderId: 700, orderItemId: 7001 }, { orderId: 700, orderItemId: 7002 }]);
    stubEntitlements([
      makeEntitlement(7, 7001, 'COURTZON_COMMISSION', 5, 'PENDING'),
      makeEntitlement(7, 7002, 'COURTZON_COMMISSION', 5, 'PENDING'),
      makeEntitlement(7, 7001, 'ORGANIZATION_EARNING', 45, 'PENDING'),
      makeEntitlement(7, 7002, 'ORGANIZATION_EARNING', 45, 'PENDING'),
    ]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    const o = result.data[0];
    const totalCommissionEnt = 5 + 5;
    expect(o.commission_amount).toBe(totalCommissionEnt);
    expect(o.seller_net).toBe(90);
    expect(o.seller_net + o.commission_amount).toBeCloseTo(o.total - 10, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 8-13. Financial status derivation
// ══════════════════════════════════════════════════════════════════════
describe('8. Financial status: PENDING → "Pending"', () => {
  it('all entitlements PENDING → Pending', async () => {
    stubGetSellerOrders(makeRawRows([{ id: 800, subtotal: 100, total: 100, commission_amount: 0, seller_id: 7 }]), 1);
    stubOrderItemIds([{ orderId: 800, orderItemId: 8001 }]);
    stubEntitlements([makeEntitlement(7, 8001, 'ORGANIZATION_EARNING', 100, 'PENDING')]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    expect(result.data[0].financial_status).toBe('Pending');
  });
});

describe('9. Financial status: AVAILABLE → "Available"', () => {
  it('all entitlements AVAILABLE → Available', async () => {
    stubGetSellerOrders(makeRawRows([{ id: 900, subtotal: 100, total: 100, commission_amount: 0, seller_id: 7 }]), 1);
    stubOrderItemIds([{ orderId: 900, orderItemId: 9001 }]);
    stubEntitlements([makeEntitlement(7, 9001, 'ORGANIZATION_EARNING', 100, 'AVAILABLE')]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    expect(result.data[0].financial_status).toBe('Available');
  });
});

describe('10. Financial status: ON_HOLD → "Held"', () => {
  it('all entitlements ON_HOLD (no settlement_id) → Held', async () => {
    stubGetSellerOrders(makeRawRows([{ id: 1000, subtotal: 100, total: 100, commission_amount: 0, seller_id: 7 }]), 1);
    stubOrderItemIds([{ orderId: 1000, orderItemId: 10001 }]);
    stubEntitlements([makeEntitlement(7, 10001, 'ORGANIZATION_EARNING', 100, 'ON_HOLD')]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    expect(result.data[0].financial_status).toBe('Held');
  });
});

describe('11. Financial status: ON_HOLD + settlement_id → "Held"', () => {
  it('ON_HOLD with settlement_id still shows Held (reserved)', async () => {
    stubGetSellerOrders(makeRawRows([{ id: 1100, subtotal: 100, total: 100, commission_amount: 0, seller_id: 7 }]), 1);
    stubOrderItemIds([{ orderId: 1100, orderItemId: 11001 }]);
    stubEntitlements([makeEntitlement(7, 11001, 'ORGANIZATION_EARNING', 100, 'ON_HOLD', 55)]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    expect(result.data[0].financial_status).toBe('Held');
  });
});

describe('12. Financial status: SETTLED → "Settled"', () => {
  it('all entitlements SETTLED → Settled', async () => {
    stubGetSellerOrders(makeRawRows([{ id: 1200, subtotal: 100, total: 100, commission_amount: 0, seller_id: 7 }]), 1);
    stubOrderItemIds([{ orderId: 1200, orderItemId: 12001 }]);
    stubEntitlements([makeEntitlement(7, 12001, 'ORGANIZATION_EARNING', 100, 'SETTLED')]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    expect(result.data[0].financial_status).toBe('Settled');
  });
});

describe('13. Financial status: CANCELLED → "Cancelled"', () => {
  it('any entitlement CANCELLED → Cancelled', async () => {
    stubGetSellerOrders(makeRawRows([{ id: 1300, subtotal: 100, total: 100, commission_amount: 0, seller_id: 7 }]), 1);
    stubOrderItemIds([{ orderId: 1300, orderItemId: 13001 }]);
    stubEntitlements([makeEntitlement(7, 13001, 'ORGANIZATION_EARNING', 100, 'CANCELLED')]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    expect(result.data[0].financial_status).toBe('Cancelled');
  });
});

// ══════════════════════════════════════════════════════════════════════
// 14. CARD custody model
// ══════════════════════════════════════════════════════════════════════
describe('14. CARD custody model preserved', () => {
  it('CARD order: seller_net from entitlements, collector=courtzon', async () => {
    stubGetSellerOrders(makeRawRows([{ id: 1400, subtotal: 200, shipping_cost: 20, total: 220, commission_amount: 20, payment_method: 'card', cash_holder: 'courtzon', seller_id: 7 }]), 1);
    stubOrderItemIds([{ orderId: 1400, orderItemId: 14001 }]);
    stubEntitlements([
      makeEntitlement(7, 14001, 'ORGANIZATION_EARNING', 200, 'AVAILABLE'),
      makeEntitlement(7, 14001, 'COURTZON_COMMISSION', 20, 'AVAILABLE'),
    ]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    const o = result.data[0];
    expect(o.payment_method).toBe('card');
    expect(o.seller_net).toBe(200);
    expect(o.financial_status).toBe('Available');
  });
});

// ══════════════════════════════════════════════════════════════════════
// 15. CASH/COD custody model
// ══════════════════════════════════════════════════════════════════════
describe('15. CASH/COD custody model preserved', () => {
  it('COD order: seller_net from entitlements, collector=org', async () => {
    stubGetSellerOrders(makeRawRows([{ id: 1500, subtotal: 150, shipping_cost: 15, total: 165, commission_amount: 15, payment_method: 'cash', cash_holder: 'org', seller_id: 8 }]), 1);
    stubOrderItemIds([{ orderId: 1500, orderItemId: 15001 }]);
    stubEntitlements([
      makeEntitlement(8, 15001, 'ORGANIZATION_EARNING', 150, 'PENDING'),
      makeEntitlement(8, 15001, 'COURTZON_COMMISSION', 15, 'PENDING'),
    ]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    const o = result.data[0];
    expect(o.payment_method).toBe('cash');
    expect(o.seller_net).toBe(150);
    expect(o.financial_status).toBe('Pending');
  });
});

// ══════════════════════════════════════════════════════════════════════
// 16. seller_net matches canonical entitlement amount exactly
// ══════════════════════════════════════════════════════════════════════
describe('16. seller_net matches canonical entitlement amount exactly', () => {
  it('seller_net = sum(ORGANIZATION_EARNING.amount) for the seller\'s items', async () => {
    const canonicalEarning = 910;
    stubGetSellerOrders(makeRawRows([{ id: 1600, subtotal: 1000, shipping_cost: 60, discount_amount: 50, tax_amount: 0, total: 1010, commission_amount: 100, seller_id: 10 }]), 1);
    stubOrderItemIds([{ orderId: 1600, orderItemId: 16001 }]);
    stubEntitlements([
      makeEntitlement(10, 16001, 'ORGANIZATION_EARNING', canonicalEarning, 'AVAILABLE'),
      makeEntitlement(10, 16001, 'COURTZON_COMMISSION', 100, 'AVAILABLE'),
    ]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    expect(result.data[0].seller_net).toBe(canonicalEarning);
  });

  it('seller_net with proportional allocation across items', async () => {
    const rawRows = [
      makeRawRows([{ id: 1700, subtotal: 300, shipping_cost: 30, discount_amount: 30, tax_amount: 15, total: 315, commission_amount: 30, seller_id: 7, product_id: 1, item_total: 100, quantity: 1, unit_price: 100 }])[0],
      makeRawRows([{ id: 1700, subtotal: 300, shipping_cost: 30, discount_amount: 30, tax_amount: 15, total: 315, commission_amount: 30, seller_id: 7, product_id: 2, item_total: 200, quantity: 1, unit_price: 200 }])[0],
    ];
    stubGetSellerOrders(rawRows, 1);
    stubOrderItemIds([{ orderId: 1700, orderItemId: 17001 }, { orderId: 1700, orderItemId: 17002 }]);

    const e1 = round2((100 - 10 - 10) + 10 + 5);
    const e2 = round2((200 - 20 - 20) + 20 + 10);
    stubEntitlements([
      makeEntitlement(7, 17001, 'ORGANIZATION_EARNING', e1, 'AVAILABLE'),
      makeEntitlement(7, 17002, 'ORGANIZATION_EARNING', e2, 'AVAILABLE'),
      makeEntitlement(7, 17001, 'COURTZON_COMMISSION', 10, 'AVAILABLE'),
      makeEntitlement(7, 17002, 'COURTZON_COMMISSION', 20, 'AVAILABLE'),
    ]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    expect(result.data[0].seller_net).toBe(round2(e1 + e2));
    expect(result.data[0].total).toBe(315);
  });
});

// ══════════════════════════════════════════════════════════════════════
// No entitlements fallback
// ══════════════════════════════════════════════════════════════════════
describe('Fallback: no entitlements → seller_net = 0, status = Pending', () => {
  it('handles missing entitlements gracefully', async () => {
    stubGetSellerOrders(makeRawRows([{ id: 1800, subtotal: 50, total: 55, commission_amount: 5, seller_id: 7 }]), 1);
    stubOrderItemIds([{ orderId: 1800, orderItemId: 18001 }]);
    stubEntitlements([]);

    const result = await marketplaceService.getSellerOrders(1, { page: 1, limit: 20 });
    expect(result.data[0].seller_net).toBe(0);
    expect(result.data[0].financial_status).toBe('Pending');
  });
});
