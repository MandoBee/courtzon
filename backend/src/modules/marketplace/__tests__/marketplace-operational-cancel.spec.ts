// ============================================================================
// B1/B2 — Refund Engine marketplace operational cancellation.
//
// Unit-only: marketplace repository/payment/event collaborators are mocked.
// Proves the operational-only path never calls the legacy refund/reversal
// machinery, while the legacy path still does.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  orders: new Map<number, any>(),
  emit: vi.fn(),
  updateOrderStatus: vi.fn(async (id: number, status: string) => {
    const row = mocks.orders.get(id);
    if (row) row.status = status;
    return true;
  }),
  findOrderById: vi.fn(async (id: number) => {
    const row = mocks.orders.get(id);
    return row ? [row] : [];
  }),
  findOrderIdsByCheckoutGroup: vi.fn(async () => [] as number[]),
  restoreStock: vi.fn(async () => undefined),
  createOrderStatusHistory: vi.fn(async () => undefined),
  updateOrderFinancials: vi.fn(async () => undefined),
  findSellerOrgsForUser: vi.fn(async () => []),
  isPlatformAdmin: vi.fn(async () => false),
  orgPermissions: { 100: ['refunds.approve'], 200: ['refunds.approve'] } as Record<number, string[]>,
  orgScopes: [100, 200] as number[],
  hasOrganisationPermission: vi.fn(async (_userId: number, orgId: number, key: string) =>
    mocks.orgScopes.includes(Number(orgId))
    && (mocks.orgPermissions[Number(orgId)] ?? []).includes(key)),
}));

vi.mock('../../rbac/infrastructure/repositories/rbac.repository.js', () => ({
  rbacRepository: {
    hasOrganisationPermission: mocks.hasOrganisationPermission,
  },
}));

const repoMock = {
  findOrderById: mocks.findOrderById,
  findOrderIdsByCheckoutGroup: mocks.findOrderIdsByCheckoutGroup,
  updateOrderStatus: mocks.updateOrderStatus,
  restoreStock: mocks.restoreStock,
  createOrderStatusHistory: mocks.createOrderStatusHistory,
  updateOrderFinancials: mocks.updateOrderFinancials,
  findSellerOrgsForUser: mocks.findSellerOrgsForUser,
  isPlatformAdmin: mocks.isPlatformAdmin,
};

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ getConnection: vi.fn(), execute: vi.fn(async () => [[], []]) }),
}));
vi.mock('../../../database/database.transaction.js', () => ({
  withTransaction: async (fn: any) => fn({}),
}));
vi.mock('../../payment/application/payment.service.js', () => ({
  paymentService: { charge: vi.fn(), refund: vi.fn(async () => ({ success: true })) },
}));
vi.mock('../../payment/infrastructure/repositories/payment.repository.js', () => ({
  paymentRepository: {
    findByOrderId: vi.fn(async () => null),
    findByOrderIdIncludingRefunded: vi.fn(async () => null),
  },
}));
vi.mock('../../financial/application/commission.service.js', () => ({
  commissionService: { calculate: vi.fn() },
}));
vi.mock('../../financial/application/transaction.service.js', () => ({ transactionService: {} }));
vi.mock('../../financial/infrastructure/transaction.repository.js', () => ({
  transactionRepository: {
    findBySource: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    createTransaction: vi.fn(async () => 1),
    createTransactionEntry: vi.fn(async () => 1),
  },
}));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({
  walletRepository: {},
}));
vi.mock('../../organisations/application/organisation.service.js', () => ({ organisationService: {} }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({
  getCurrentSubscription: vi.fn(async () => ({ exists: true, effectiveStatus: 'active' })),
}));
vi.mock('../../auth/infrastructure/repositories/user.repository.js', () => ({
  userRepository: { findById: vi.fn(async () => null) },
}));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { emit: mocks.emit, on: vi.fn() },
}));
vi.mock('../../financial/infrastructure/repositories/financial-entitlement.repository.js', () => ({
  financialEntitlementRepository: { findBySourceIds: vi.fn(async () => []) },
}));
vi.mock('../../financial/application/financial-entitlement.service.js', () => ({
  financialEntitlementService: { assertNoActiveSettlementReservation: vi.fn(async () => undefined) },
}));
vi.mock('../infrastructure/repositories/marketplace.repository.js', () => ({ marketplaceRepository: repoMock }));
vi.mock('../../settlement/application/gateway-settlement.service.js', () => ({
  gatewaySettlementService: { detachPaymentTransaction: vi.fn() },
}));

const { marketplaceService } = await import('../application/marketplace.service.js');

const BUYER = 7;
const ACTOR = 900;
const GROUP = 'checkout-group-1';

function row(id: number, overrides: Record<string, any> = {}) {
  return {
    id,
    buyer_id: BUYER,
    status: 'pending',
    payment_status: 'paid',
    payment_method: 'card',
    total: 300,
    subtotal: 300,
    shipping_cost: 0,
    tax_amount: 0,
    commission_amount: 30,
    discount_amount: 0,
    currency_code: 'EGP',
    checkout_group_id: GROUP,
    item_id: id * 10,
    product_id: id,
    product_name: `Product ${id}`,
    quantity: 1,
    item_total: 300,
    item_seller_id: id === 101 ? 100 : 200,
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.orders.clear();
  mocks.orders.set(101, row(101));
  mocks.orders.set(102, row(102));
  mocks.findOrderIdsByCheckoutGroup.mockResolvedValue([101, 102]);
  mocks.orgPermissions = { 100: ['refunds.approve'], 200: ['refunds.approve'] };
  mocks.orgScopes = [100, 200];
  mocks.hasOrganisationPermission.mockImplementation(async (_userId: number, orgId: number, key: string) =>
    mocks.orgScopes.includes(Number(orgId))
    && (mocks.orgPermissions[Number(orgId)] ?? []).includes(key));
});

describe('cancelOrderForRefund — operational-only', () => {
  it('cancels without legacy refund, financial reversal, commission reset or financial event', async () => {
    const processSpy = vi.spyOn(marketplaceService, '_processOrderRefund').mockResolvedValue(undefined);
    const reversalSpy = vi.spyOn(marketplaceService, '_recordReversalFinancials').mockResolvedValue(undefined);

    await marketplaceService.cancelOrderForRefund(101, ACTOR, 'refund operational');

    expect(mocks.orders.get(101)?.status).toBe('cancelled');
    expect(processSpy).not.toHaveBeenCalled();
    expect(reversalSpy).not.toHaveBeenCalled();
    expect(mocks.updateOrderFinancials).not.toHaveBeenCalled();
    expect(mocks.restoreStock).toHaveBeenCalled();

    const cancelled = mocks.emit.mock.calls.find((call) => call[0] === 'marketplace:order-cancelled');
    expect(cancelled?.[1]).toMatchObject({ orderId: 101, operationalOnly: true });
  });

  it('cancels processing, shipped and delivered orders for an authorized refund actor', async () => {
    for (const status of ['processing', 'shipped', 'delivered']) {
      mocks.orders.get(101)!.status = status;
      mocks.orders.get(101)!.checkout_group_id = null;
      mocks.findOrderIdsByCheckoutGroup.mockResolvedValue([]);

      await marketplaceService.cancelOrderForRefund(101, ACTOR, `refund ${status}`);

      expect(mocks.orders.get(101)?.status, status).toBe('cancelled');
    }
  });

  it('rejects an actor without refunds.approve', async () => {
    mocks.orgPermissions = { 100: ['refunds.view'], 200: ['refunds.view'] };

    await expect(
      marketplaceService.cancelOrderForRefund(101, ACTOR, 'refund operational'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.orders.get(101)?.status).toBe('pending');
  });

  it('rejects an actor with refunds.approve but no organisation access', async () => {
    mocks.orgScopes = [];

    await expect(
      marketplaceService.cancelOrderForRefund(101, ACTOR, 'refund operational'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.orders.get(101)?.status).toBe('pending');
  });

  it('rejects the cross-org exploit: permission in A, only scope in B', async () => {
    // Actor is properly authorised in org 100 but only has an unrelated org
    // scope (no refunds.approve) in org 200.
    mocks.orgPermissions = { 100: ['refunds.approve'], 200: ['org.accounting.view'] };
    mocks.orgScopes = [100, 200];

    await expect(
      marketplaceService.cancelOrderForRefund(102, ACTOR, 'cross-org attempt'),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(mocks.orders.get(102)?.status).toBe('pending');
    expect(mocks.updateOrderStatus).not.toHaveBeenCalled();
    expect(mocks.updateOrderFinancials).not.toHaveBeenCalled();
  });

  it('never cancels a sibling from an organisation the actor cannot manage', async () => {
    mocks.orgPermissions = { 100: ['refunds.approve'], 200: ['org.accounting.view'] };

    const result = await marketplaceService.cancelOrderForRefund(101, ACTOR, 'refund operational');

    expect(mocks.orders.get(101)?.status).toBe('cancelled');
    expect(mocks.orders.get(102)?.status).toBe('pending');
    expect(result).toMatchObject({
      mainCancelled: true,
      cancelledSiblingIds: [],
      skippedSiblingIds: [102],
      complete: false,
    });

    const updatedIds = mocks.updateOrderStatus.mock.calls.map((call) => call[0]);
    expect(updatedIds).toEqual([101]);
    expect(mocks.restoreStock).toHaveBeenCalledTimes(1);
  });

  it('retries remaining siblings after the main order is already cancelled', async () => {
    mocks.orders.get(101)!.status = 'cancelled';
    mocks.orgPermissions = { 100: ['refunds.approve'], 200: ['refunds.approve'] };

    const result = await marketplaceService.cancelOrderForRefund(101, ACTOR, 'retry');

    expect(mocks.orders.get(102)?.status).toBe('cancelled');
    expect(result).toMatchObject({
      mainCancelled: false,
      cancelledSiblingIds: [102],
      skippedSiblingIds: [],
      complete: true,
    });
    const updatedIds = mocks.updateOrderStatus.mock.calls.map((call) => call[0]);
    expect(updatedIds).toEqual([102]);
  });

  it('does not duplicate work for an already-cancelled sibling', async () => {
    mocks.orders.get(102)!.status = 'cancelled';

    const result = await marketplaceService.cancelOrderForRefund(101, ACTOR, 'refund operational');

    expect(result).toMatchObject({
      mainCancelled: true,
      cancelledSiblingIds: [],
      skippedSiblingIds: [],
      complete: true,
    });
    const updatedIds = mocks.updateOrderStatus.mock.calls.map((call) => call[0]);
    expect(updatedIds).toEqual([101]);
    expect(mocks.restoreStock).toHaveBeenCalledTimes(1);
  });

  it('propagates operational-only through authorized checkout-group siblings', async () => {
    const processSpy = vi.spyOn(marketplaceService, '_processOrderRefund').mockResolvedValue(undefined);
    const reversalSpy = vi.spyOn(marketplaceService, '_recordReversalFinancials').mockResolvedValue(undefined);

    await marketplaceService.cancelOrderForRefund(101, ACTOR, 'refund operational');

    expect(mocks.orders.get(101)?.status).toBe('cancelled');
    expect(mocks.orders.get(102)?.status).toBe('cancelled');
    expect(processSpy).not.toHaveBeenCalled();
    expect(reversalSpy).not.toHaveBeenCalled();
    expect(mocks.updateOrderFinancials).not.toHaveBeenCalled();
    const cancelledEvents = mocks.emit.mock.calls.filter((call) => call[0] === 'marketplace:order-cancelled');
    expect(cancelledEvents).toHaveLength(2);
    for (const event of cancelledEvents) {
      expect(event[1]).toMatchObject({ operationalOnly: true });
    }
  });

  it('processes sibling refunds in legacy mode', async () => {
    const processSpy = vi.spyOn(marketplaceService, '_processOrderRefund').mockResolvedValue(undefined);

    await marketplaceService.updateOrderStatus(101, BUYER, { status: 'cancelled', note: 'legacy' });

    expect(processSpy).toHaveBeenCalledTimes(2);
    expect(mocks.orders.get(102)?.status).toBe('cancelled');
  });

  it('preserves legacy financial behavior when operationalOnly is not set', async () => {
    mocks.orders.get(101)!.checkout_group_id = null;
    mocks.findOrderIdsByCheckoutGroup.mockResolvedValue([]);
    const processSpy = vi.spyOn(marketplaceService, '_processOrderRefund').mockResolvedValue(undefined);

    await marketplaceService.updateOrderStatus(101, BUYER, { status: 'cancelled', note: 'legacy' });

    expect(processSpy).toHaveBeenCalledTimes(1);
    expect(mocks.updateOrderFinancials).toHaveBeenCalled();
  });
});
