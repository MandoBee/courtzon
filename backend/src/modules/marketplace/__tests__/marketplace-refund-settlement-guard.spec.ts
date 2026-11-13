// ============================================================================
// LAYER B — marketplace refund settlement-reservation preflight.
//
// Unit-only: every dependency is mocked; no DB, Redis or gateway is touched.
// Proves the preflight runs BEFORE the wallet credit / gateway refund and that a
// reserved source rejects the whole refund (no partial financial movement).
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetPool = vi.hoisted(() => vi.fn());
const mockWithTransaction = vi.hoisted(() => vi.fn(async (fn: any, conn?: any) => fn(conn || {})));
const mockRefund = vi.hoisted(() => vi.fn(async () => ({ success: true, refundId: 'mref_1' })));
const mockEmit = vi.hoisted(() => vi.fn());
const mockPreflight = vi.hoisted(() => vi.fn(async () => undefined));

const repoMock = vi.hoisted(() => ({
  findOrderById: vi.fn(async () => []),
  findOrderIdsByCheckoutGroup: vi.fn(async () => []),
}));
const paymentRepoMock = vi.hoisted(() => ({
  findByOrderId: vi.fn(async () => null),
  findByOrderIdIncludingRefunded: vi.fn(async () => null),
}));
const walletRepoMock = vi.hoisted(() => ({
  findTransactionsByReference: vi.fn(async () => []),
  findByUserId: vi.fn(async () => ({ id: 1 })),
  lockAndGetBalance: vi.fn(async () => ({ balance: 0, version: 1 })),
  updateBalance: vi.fn(async () => true),
  createTransaction: vi.fn(async () => 1),
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: mockGetPool }));
vi.mock('../../../database/database.transaction.js', () => ({ withTransaction: mockWithTransaction }));
vi.mock('../../payment/application/payment.service.js', () => ({
  paymentService: { charge: vi.fn(async () => ({ success: true })), refund: mockRefund },
}));
vi.mock('../../payment/infrastructure/repositories/payment.repository.js', () => ({ paymentRepository: paymentRepoMock }));
vi.mock('../../financial/application/commission.service.js', () => ({ commissionService: { calculate: vi.fn() } }));
vi.mock('../../financial/application/transaction.service.js', () => ({ transactionService: {} }));
vi.mock('../../financial/infrastructure/transaction.repository.js', () => ({
  transactionRepository: { findBySource: vi.fn(async () => []), findById: vi.fn(async () => null), createTransaction: vi.fn(async () => 1), createTransactionEntry: vi.fn(async () => 1) },
}));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: walletRepoMock }));
vi.mock('../../organisations/application/organisation.service.js', () => ({ organisationService: {} }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({ getCurrentSubscription: vi.fn(async () => ({ exists: true, effectiveStatus: 'active' })) }));
vi.mock('../../auth/infrastructure/repositories/user.repository.js', () => ({ userRepository: { findById: vi.fn(async () => null) } }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: mockEmit, on: vi.fn() } }));
vi.mock('../../financial/infrastructure/repositories/financial-entitlement.repository.js', () => ({
  financialEntitlementRepository: { findBySourceIds: vi.fn(async () => []) },
}));
vi.mock('../../financial/application/financial-entitlement.service.js', () => ({
  financialEntitlementService: { assertNoActiveSettlementReservation: mockPreflight },
}));
vi.mock('../infrastructure/repositories/marketplace.repository.js', () => ({ marketplaceRepository: repoMock }));
vi.mock('../../settlement/application/gateway-settlement.service.js', () => ({
  gatewaySettlementService: { detachPaymentTransaction: vi.fn() },
}));

const SINGLE_PT = { id: 500, amount: '300.00', payment_method: 'card', gateway_reference: 'mock_1' };

const order = (overrides: Record<string, any> = {}) => ({
  id: 102,
  buyer_id: 7,
  total: 300,
  payment_status: 'paid',
  payment_method: 'card',
  checkout_group_id: null,
  items: [{ itemId: 501 }, { itemId: 502 }],
  ...overrides,
});

const ConflictErrorOf = async () => (await import('../../../shared/errors/app-error.js')).ConflictError;

describe('LAYER B — marketplace refund settlement-reservation preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentRepoMock.findByOrderId).mockResolvedValue(SINGLE_PT as any);
    vi.mocked(paymentRepoMock.findByOrderIdIncludingRefunded).mockResolvedValue(null);
    vi.mocked(mockRefund).mockResolvedValue({ success: true, refundId: 'mref_1' });
  });

  it('runs the preflight with the canonical order-item ids before refunding', async () => {
    const { marketplaceService } = await import('../application/marketplace.service.js');
    await marketplaceService._processOrderRefund(order(), 102, 'single');

    expect(mockPreflight).toHaveBeenCalledWith('marketplace', [501, 502]);
    expect(mockRefund).toHaveBeenCalledTimes(1);
  });

  it('blocks the gateway refund when an entitlement is settlement-reserved', async () => {
    const ConflictError = await ConflictErrorOf();
    mockPreflight.mockRejectedValueOnce(new ConflictError('Refund blocked: entitlement 1 is reserved by settlement 91'));
    const { marketplaceService } = await import('../application/marketplace.service.js');

    await expect(marketplaceService._processOrderRefund(order(), 102, 'single')).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(mockRefund).not.toHaveBeenCalled();
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  it('blocks a WALLET order before any wallet credit', async () => {
    const ConflictError = await ConflictErrorOf();
    mockPreflight.mockRejectedValueOnce(new ConflictError('Refund blocked: entitlement 1 is reserved by settlement 91'));
    const { marketplaceService } = await import('../application/marketplace.service.js');

    await expect(
      marketplaceService._processOrderRefund(order({ payment_method: 'wallet', checkout_group_id: null }), 102, 'wallet'),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(walletRepoMock.findTransactionsByReference).not.toHaveBeenCalled();
    expect(walletRepoMock.updateBalance).not.toHaveBeenCalled();
    expect(walletRepoMock.createTransaction).not.toHaveBeenCalled();
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('rejects the WHOLE refund when the order mixes reserved and unreserved items', async () => {
    const ConflictError = await ConflictErrorOf();
    // The service-level preflight is whole-scope: a single reserved entitlement
    // rejects the batch before any item is refunded.
    mockPreflight.mockRejectedValueOnce(new ConflictError('Refund blocked: mixed batch'));
    const { marketplaceService } = await import('../application/marketplace.service.js');

    await expect(
      marketplaceService._processOrderRefund(order({ items: [{ itemId: 501 }, { itemId: 999 }] }), 102, 'mixed'),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(mockRefund).not.toHaveBeenCalled();
    expect(mockPreflight).toHaveBeenCalledWith('marketplace', [501, 999]);
  });

  it('orders preflight → refund (never the reverse)', async () => {
    const callOrder: string[] = [];
    mockPreflight.mockImplementationOnce(async () => {
      callOrder.push('preflight');
    });
    mockRefund.mockImplementationOnce(async () => {
      callOrder.push('refund');
      return { success: true, refundId: 'mref_1' };
    });
    const { marketplaceService } = await import('../application/marketplace.service.js');

    await marketplaceService._processOrderRefund(order(), 102, 'single');
    expect(callOrder).toEqual(['preflight', 'refund']);
  });

  it('keeps the unpaid-order early return (no refund, no preflight) — COD cancellation is not a refund', async () => {
    const { marketplaceService } = await import('../application/marketplace.service.js');
    await marketplaceService._processOrderRefund(order({ payment_status: 'pending' }), 102, 'unpaid');
    expect(mockPreflight).not.toHaveBeenCalled();
    expect(mockRefund).not.toHaveBeenCalled();
  });
});
