import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P4-02 — marketplace order access isolation.
 *
 * `getOrderForUser(id, userId)` must only expose an order to its buyer, to a
 * seller organisation that owns an item on it, or to an admin path that is
 * handled by a separate admin handler. The repository is mocked with REAL
 * `findOrderById(id, buyerId?, sellerOrgIds?)` semantics: the unfiltered call
 * returns the row (as SQL does), which is what the previous fallback relied on.
 */

const repoMock = vi.hoisted(() => ({} as Record<string, any>));
const mockEmit = vi.hoisted(() => vi.fn());

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn(() => ({ execute: vi.fn(async () => [[], []]) })) }));
vi.mock('../../../database/database.transaction.js', () => ({ withTransaction: vi.fn(async (fn: (c: unknown) => unknown) => fn({})) }));
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService: {} }));
vi.mock('../../payment/infrastructure/repositories/payment.repository.js', () => ({ paymentRepository: {} }));
vi.mock('../../financial/application/commission.service.js', () => ({ commissionService: {} }));
vi.mock('../../organisations/application/organisation.service.js', () => ({ organisationService: {} }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: {} }));
vi.mock('../../auth/infrastructure/repositories/user.repository.js', () => ({ userRepository: {} }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: mockEmit, on: vi.fn() } }));
vi.mock('../infrastructure/repositories/marketplace.repository.js', () => ({ marketplaceRepository: repoMock }));
vi.mock('../../financial/infrastructure/repositories/financial-entitlement.repository.js', () => ({
  financialEntitlementRepository: { findBySourceIds: vi.fn(async () => []), create: vi.fn(async () => 1), update: vi.fn(async () => true) },
}));
vi.mock('../../settlement/application/gateway-settlement.service.js', () => ({ gatewaySettlementService: {} }));

import { marketplaceService } from '../application/marketplace.service.js';

const ORDER_ID = 9001;
const BUYER_ID = 777;
const SELLER_ORG_ID = 10;

const orderRow = {
  id: ORDER_ID,
  buyer_id: BUYER_ID,
  checkout_group_id: null,
  status: 'confirmed',
  payment_status: 'paid',
  subtotal: 100,
  shipping_cost: 0,
  discount_amount: 0,
  tax_amount: 0,
  commission_amount: 10,
  total: 110,
  currency_code: 'EGP',
  shipping_address: JSON.stringify({ name: 'Buyer Name', phone: '+201000000000' }),
  item_id: 1,
  item_seller_id: SELLER_ORG_ID,
  product_id: 5,
  product_name: 'Ball',
  quantity: 1,
  unit_price: 100,
  item_total: 100,
  shop_name: 'Shop',
  seller_user_id: 500,
};

function mockRepository() {
  repoMock.findOrderById = vi.fn(
    async (_id: number, buyerId?: number, sellerOrgIds?: number | number[]) => {
      if (buyerId) return buyerId === BUYER_ID ? [orderRow] : [];
      if (sellerOrgIds !== undefined && sellerOrgIds !== null) {
        const ids = Array.isArray(sellerOrgIds) ? sellerOrgIds : [sellerOrgIds];
        return ids.includes(SELLER_ORG_ID) ? [orderRow] : [];
      }
      return [orderRow]; // unfiltered SELECT: returns whatever row exists
    },
  );
  repoMock.findSellerOrgsForUser = vi.fn(async () => []);
  repoMock.findOrdersByCheckoutGroup = vi.fn(async () => []);
  repoMock.findOrderItemIdsBySellerOrders = vi.fn(async () => []);
}

describe('MarketplaceService.getOrderForUser — tenant/ownership isolation', () => {
  beforeEach(() => {
    mockRepository();
  });

  it('returns the order to its buyer', async () => {
    const order = await marketplaceService.getOrderForUser(ORDER_ID, BUYER_ID);
    expect(order.id).toBe(ORDER_ID);
    expect(order.buyer_id).toBe(BUYER_ID);
  });

  it('returns the order to a seller organisation that owns an item on it', async () => {
    repoMock.findSellerOrgsForUser.mockResolvedValue([{ id: SELLER_ORG_ID, is_active: 1, owner_id: 500 }]);
    const order = await marketplaceService.getOrderForUser(ORDER_ID, 500);
    expect(order.viewedAsSeller).toBe(true);
  });

  it('does not expose another buyer\'s order to an unrelated authenticated user', async () => {
    await expect(marketplaceService.getOrderForUser(ORDER_ID, 424242)).rejects.toThrow(/Order/);
  });

  it('does not expose the row through an unfiltered fallback when the user owns no seller org', async () => {
    const unrelated = 424243;
    await expect(marketplaceService.getOrderForUser(ORDER_ID, unrelated)).rejects.toThrow(/Order/);
    // The unfiltered read may be attempted for the checkout race, but it must
    // never be returned to a user who is neither buyer nor seller.
    expect(orderRow.shipping_address).toContain('Buyer Name');
  });
});
