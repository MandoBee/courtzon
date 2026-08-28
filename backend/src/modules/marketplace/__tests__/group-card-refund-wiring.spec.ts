import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression — multi-seller GROUP CARD refund amount wiring.
 *
 * Group card payments are captured ONCE on the primary order's
 * payment_transactions row for the checkout-group GRAND TOTAL. Before this
 * fix, every sibling order's refund issued its OWN gateway refund for its OWN
 * order.total — so (a) a cancelled group fronted N gateway partial refunds and
 * (b) the sibling shares were never fully returned to the card until every
 * member cancelled. Now `_processOrderRefund` requests the FULL captured amount
 * (paymentTxn.amount) for every group member; `paymentService.refund`
 * serializes execution per payment (row lock), so the group is refunded exactly
 * once for the full amount. Non-group card orders keep their own order.total.
 */

// ── Hoisted mock references ──
const mockGetPool = vi.hoisted(() => vi.fn());
const mockWithTransaction = vi.hoisted(() => vi.fn(async (fn: any, conn?: any) => fn(conn || {})));
const mockRefund = vi.hoisted(() => vi.fn(async () => ({ success: true, refundId: 'mref_1' })));
const mockEmit = vi.hoisted(() => vi.fn());
const mockCommissionCalculate = vi.hoisted(() => vi.fn(async () => ({ rate: 10, rateType: 'percentage', planName: 'Basic' })));
const mockGetCurrentSubscription = vi.hoisted(() => vi.fn(async () => ({ exists: true, effectiveStatus: 'active' })));
const repoMock = vi.hoisted(() => ({
  findOrderIdsByCheckoutGroup: vi.fn(async () => [101, 102]),
  findOrderById: vi.fn(async () => []),
}));
const paymentRepoMock = vi.hoisted(() => ({
  findByOrderId: vi.fn(async () => null),
  findByOrderIdIncludingRefunded: vi.fn(async () => null),
}));

// ── Mock modules ──
vi.mock('../../../database/mysql.js', () => ({ getPool: mockGetPool }));
vi.mock('../../../database/database.transaction.js', () => ({ withTransaction: mockWithTransaction }));
vi.mock('../../payment/application/payment.service.js', () => ({
  paymentService: { charge: vi.fn(async () => ({ success: true })), refund: mockRefund },
}));
vi.mock('../../payment/infrastructure/repositories/payment.repository.js', () => ({ paymentRepository: paymentRepoMock }));
vi.mock('../../financial/application/commission.service.js', () => ({ commissionService: { calculate: mockCommissionCalculate } }));
vi.mock('../../financial/application/transaction.service.js', () => ({ transactionService: {} }));
vi.mock('../../financial/infrastructure/transaction.repository.js', () => ({ transactionRepository: { findBySource: vi.fn(async () => []), findById: vi.fn(async () => null), createTransaction: vi.fn(async () => 1), createTransactionEntry: vi.fn(async () => 1) } }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: {} }));
vi.mock('../../organisations/application/organisation.service.js', () => ({ organisationService: {} }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({ getCurrentSubscription: mockGetCurrentSubscription }));
vi.mock('../../auth/infrastructure/repositories/user.repository.js', () => ({ userRepository: { findById: vi.fn(async () => null) } }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: mockEmit, on: vi.fn() } }));
vi.mock('../../financial/infrastructure/repositories/financial-entitlement.repository.js', () => ({}));
vi.mock('../infrastructure/repositories/marketplace.repository.js', () => ({ marketplaceRepository: repoMock }));

const GROUP_PT = { id: 777, amount: '1000.00', payment_method: 'card', gateway_reference: 'mock_grp_1' };
const SINGLE_ORDER_PT = { id: 500, amount: '300.00', payment_method: 'card', gateway_reference: 'mock_1' };

function makeOrder(overrides: Record<string, any> = {}) {
  return {
    id: 102,
    buyer_id: 7,
    total: 300,
    payment_status: 'paid',
    payment_method: 'card',
    checkout_group_id: 'grp-5440e8400',
    cash_holder: 'courtzon',
    cash_collection_status: 'collected',
    ...overrides,
  };
}

describe('Marketplace group card refund wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockRefund).mockResolvedValue({ success: true, refundId: 'mref_1' });
    vi.mocked(paymentRepoMock.findByOrderId).mockResolvedValue(null);
    vi.mocked(paymentRepoMock.findByOrderIdIncludingRefunded).mockResolvedValue(GROUP_PT);
    vi.mocked(repoMock.findOrderIdsByCheckoutGroup).mockResolvedValue([101, 102]);
  });

  it('refunds the FULL captured group amount once (not the sibling share) when the order is part of a checkout group', async () => {
    const { marketplaceService } = await import('../application/marketplace.service.js');

    // Grouped SIBLING (id 102): no direct payment row → resolves to the group
    // primary's payment (captured 1000 for the whole group) and asks for 1000,
    // never its own share (300).
    await marketplaceService._processOrderRefund(makeOrder(), 102, 'Group cancelled');

    expect(mockRefund).toHaveBeenCalledTimes(1);
    const [paymentId, amount, reason] = mockRefund.mock.calls[0];
    expect(paymentId).toBe(GROUP_PT.id);
    expect(amount).toBe(1000);
    expect(reason).toBe('Group cancelled');
    expect(repoMock.findOrderIdsByCheckoutGroup).toHaveBeenCalledWith('grp-5440e8400');
    expect(paymentRepoMock.findByOrderIdIncludingRefunded).toHaveBeenCalledWith(101);
  });

  it('refunds the FULL captured amount even when the GROUP PRIMARY order itself is being refunded', async () => {
    const { marketplaceService } = await import('../application/marketplace.service.js');

    // Primary has its own direct payment row (1000 = group capture).
    vi.mocked(paymentRepoMock.findByOrderId).mockResolvedValue(GROUP_PT);

    await marketplaceService._processOrderRefund(makeOrder({ id: 101, total: 1000 }), 101, 'Primary cancelled');

    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund.mock.calls[0][0]).toBe(GROUP_PT.id);
    expect(mockRefund.mock.calls[0][1]).toBe(1000);
  });

  it('keeps the order.total amount for a NON-grouped card order (partial-refund contract preserved)', async () => {
    const { marketplaceService } = await import('../application/marketplace.service.js');

    vi.mocked(paymentRepoMock.findByOrderId).mockResolvedValue(SINGLE_ORDER_PT);

    await marketplaceService._processOrderRefund(
      makeOrder({ checkout_group_id: null, total: 300 }),
      102,
      'Single order refunded',
    );

    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund.mock.calls[0][0]).toBe(SINGLE_ORDER_PT.id);
    expect(mockRefund.mock.calls[0][1]).toBe(300);
    expect(repoMock.findOrderIdsByCheckoutGroup).not.toHaveBeenCalled();
  });

  it('surfaces a gateway refund failure as an error (order must not claim refunded while funds are captured — W4)', async () => {
    const { marketplaceService } = await import('../application/marketplace.service.js');

    vi.mocked(paymentRepoMock.findByOrderId).mockResolvedValue(SINGLE_ORDER_PT);
    vi.mocked(mockRefund).mockResolvedValue({ success: false, errorMessage: 'gateway down' });

    await expect(
      marketplaceService._processOrderRefund(
        makeOrder({ checkout_group_id: null, total: 300 }),
        102,
        'fail',
      ),
    ).rejects.toThrow(/gateway refund failed/);
  });
});