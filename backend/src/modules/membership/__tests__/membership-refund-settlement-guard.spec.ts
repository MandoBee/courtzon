// ============================================================================
// LAYER B — membership installment refund settlement-reservation preflight.
//
// Unit-only: repositories, payment engine, event bus and audit are mocked.
// Proves the WHOLE refund scope is validated before the first gateway/cash
// movement, and that a reserved installment rejects the entire operation.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

const mockRefund = vi.hoisted(() => vi.fn(async () => ({ success: true })));
const mockEmit = vi.hoisted(() => vi.fn());
const mockPreflight = vi.hoisted(() => vi.fn(async () => undefined));

const p1Repo = vi.hoisted(() => ({
  findSubscription: vi.fn(async () => ({
    id: 71,
    organisation_id: 7,
    user_id: 200,
    start_date: '2026-01-15',
    total_amount: '600.00',
    invoice_id: 31,
  })),
}));

const p2Repo = vi.hoisted(() => ({
  getOrgCancellationRefundPolicy: vi.fn(async () => JSON.stringify({ refund: { type: 'full', window_days_before_start: 0 } })),
  listInstallmentsBySubscription: vi.fn(async () => [
    { id: 101, status: 'paid', amount: '200.00', seq: 1, currency: 'EGP' },
    { id: 102, status: 'paid', amount: '200.00', seq: 2, currency: 'EGP' },
    { id: 103, status: 'pending', amount: '200.00', seq: 3, currency: 'EGP' },
  ]),
  findInstallmentPaymentId: vi.fn(async (id: number) => 5000 + id),
  findPaymentById: vi.fn(async (id: number) => ({ id, payment_method: 'card' })),
  markPaymentRefunded: vi.fn(async () => true),
  markInstallmentRefunded: vi.fn(async () => true),
  updateInvoicePaidAmount: vi.fn(async () => undefined),
}));

vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit: mockEmit } }));
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService: { refund: mockRefund } }));
vi.mock('../infrastructure/repositories/membership-p1.repository.js', () => ({ membershipP1Repository: p1Repo }));
vi.mock('../infrastructure/repositories/membership-p2.repository.js', () => ({ membershipP2Repository: p2Repo }));
vi.mock('../../financial/application/financial-entitlement.service.js', () => ({
  financialEntitlementService: { assertNoActiveSettlementReservation: mockPreflight },
}));

const { membershipCancelRefundService } = await import('../application/membership-cancel-refund.service.js');

const Conflict = async () => (await import('../../../shared/errors/app-error.js')).ConflictError;

describe('LAYER B — membership refund settlement-reservation preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreflight.mockReset().mockResolvedValue(undefined);
    p2Repo.getOrgCancellationRefundPolicy.mockResolvedValue(
      JSON.stringify({ refund: { type: 'full', window_days_before_start: 0 } }),
    );
    p2Repo.findPaymentById.mockImplementation(async (id: number) => ({ id, payment_method: 'card' }));
    p2Repo.markInstallmentRefunded.mockResolvedValue(true as any);
  });

  it('validates the whole scope (installments + subscription scope) before any refund', async () => {
    const result = await membershipCancelRefundService.refundInstallments(7, 71, 900);

    expect(mockPreflight).toHaveBeenCalledWith('membership', [101, 102, 71]);
    expect(result).toEqual({ refunded: 2, refundedAmount: 400 });
    expect(mockRefund).toHaveBeenCalledTimes(2);
  });

  it('blocks the entire refund (no gateway call, no cash flip, no audit) when any installment is reserved', async () => {
    const ConflictError = await Conflict();
    mockPreflight.mockRejectedValueOnce(new ConflictError('Refund blocked: entitlement 1 is reserved by settlement 91'));

    await expect(membershipCancelRefundService.refundInstallments(7, 71, 900)).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(mockPreflight).toHaveBeenCalledWith('membership', [101, 102, 71]);
    expect(mockRefund).not.toHaveBeenCalled();
    expect(p2Repo.markPaymentRefunded).not.toHaveBeenCalled();
    expect(p2Repo.markInstallmentRefunded).not.toHaveBeenCalled();
    expect(p2Repo.updateInvoicePaidAmount).not.toHaveBeenCalled();
  });

  it('rejects a mixed reserved/unreserved refund completely (no partial refund)', async () => {
    const ConflictError = await Conflict();
    mockPreflight.mockRejectedValueOnce(new ConflictError('Refund blocked: mixed scope'));

    await expect(
      membershipCancelRefundService.refundInstallments(7, 71, 900, [101, 102]),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(mockRefund).not.toHaveBeenCalled();
    expect(p2Repo.markInstallmentRefunded).not.toHaveBeenCalled();
  });

  it('orders preflight → refund (never the reverse)', async () => {
    const sequence: string[] = [];
    mockPreflight.mockImplementationOnce(async () => {
      sequence.push('preflight');
    });
    mockRefund.mockImplementation(async () => {
      sequence.push('refund');
      return { success: true };
    });

    await membershipCancelRefundService.refundInstallments(7, 71, 900, [101]);
    expect(sequence).toEqual(['preflight', 'refund']);
  });

  it('never runs the preflight when the policy itself rejects the refund', async () => {
    p2Repo.getOrgCancellationRefundPolicy.mockResolvedValue(JSON.stringify({ refund: { type: 'none' } }));

    await expect(membershipCancelRefundService.refundInstallments(7, 71, 900)).rejects.toBeTruthy();
    expect(mockPreflight).not.toHaveBeenCalled();
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('needs no HTTP user context (internal/worker-safe signature)', async () => {
    await membershipCancelRefundService.refundInstallments(7, 71, 900, [101]);
    expect(mockRefund).toHaveBeenCalledWith(5101, 200, expect.stringContaining('installment #1'));
  });
});
