// ============================================================================
// Academy G5-A — academy-refund.service unit tests.
//
// Verifies orchestration: eligibility (paid only), tenant/ownership validation,
// CARD delegation to the shared paymentService.refund, CASH offline path (no
// gateway; paid→refunded conditional guard + canonical payment:refunded),
// wallet rejection, entitlement cancellation, and idempotent rejection on
// repeated/double attempts.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../infrastructure/repositories/enrollment.repository.js', () => ({
  enrollmentRepository: { getById: vi.fn() },
}));

vi.mock('../infrastructure/repositories/academy-payment.repository.js', () => ({
  academyPaymentRepository: { getSnapshotByEnrollment: vi.fn(), markRefundedIfPaid: vi.fn() },
}));

vi.mock('../application/academy-scope.js', () => ({
  resolveProgramScope: vi.fn(async () => ({ programId: 1, organisationId: 7, branchId: 5, lifecycleState: 'active' as const })),
  assertCanManageAcademy: vi.fn(async () => undefined),
  isApprovedCoach: vi.fn(async () => true),
  getCoachOrgRelation: vi.fn(async () => 'external'),
}));

vi.mock('../../payment/infrastructure/repositories/payment.repository.js', () => ({
  paymentRepository: { findById: vi.fn(), lockById: vi.fn() },
}));

vi.mock('../../payment/application/payment.service.js', () => ({
  paymentService: { refund: vi.fn(async () => ({ success: true })) },
}));

vi.mock('../../financial/application/financial-entitlement.service.js', () => ({
  financialEntitlementService: { cancelBySourceIds: vi.fn(async () => 2) },
}));

const emit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit } }));

import { academyRefundService } from '../application/academy-refund.service.js';
import { enrollmentRepository } from '../infrastructure/repositories/enrollment.repository.js';
import { academyPaymentRepository } from '../infrastructure/repositories/academy-payment.repository.js';
import { paymentRepository } from '../../payment/infrastructure/repositories/payment.repository.js';
import { paymentService } from '../../payment/application/payment.service.js';
import { financialEntitlementService } from '../../financial/application/financial-entitlement.service.js';
import { assertCanManageAcademy } from '../application/academy-scope.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';

const ENROLLMENT = { id: 11, player_id: 200, program_id: 1, group_id: 2, status: 'confirmed' };
const SNAPSHOT = { id: 7001, enrollment_id: 11, payment_transaction_id: 5001, gross_amount: 200, currency: 'EGP', commission_amount: 20, organization_earning_amount: 180, court_rental_amount: 60, organisation_id: 7, branch_id: 5, payment_method: 'cash' };
const PAID_PAYMENT = { id: 5001, reference_type: 'academy', reference_id: 11, user_id: 200, payment_method: 'cash', payment_status: 'paid', currency: 'EGP' };

beforeEach(() => {
  vi.clearAllMocks();
  emit.mockClear();
  enrollmentRepository.getById.mockResolvedValue(ENROLLMENT);
  academyPaymentRepository.getSnapshotByEnrollment.mockResolvedValue(SNAPSHOT);
  academyPaymentRepository.markRefundedIfPaid.mockResolvedValue(true);
  paymentRepository.findById.mockResolvedValue(PAID_PAYMENT);
  paymentService.refund.mockResolvedValue({ success: true });
  financialEntitlementService.cancelBySourceIds.mockResolvedValue(2);
});

describe('G5-A — academy refund orchestration', () => {
  it('CARD delegates to the shared paymentService.refund with the snapshot amount + reason', async () => {
    paymentRepository.findById.mockResolvedValue({ ...PAID_PAYMENT, payment_method: 'card' });
    const result = await academyRefundService.refund(11, 9, 'withdrawal');
    expect(paymentService.refund).toHaveBeenCalledWith(5001, 200, 'withdrawal');
    expect(result).toMatchObject({ success: true, paymentId: 5001, enrollmentId: 11, amount: 200, method: 'card' });
    expect(financialEntitlementService.cancelBySourceIds).toHaveBeenCalledWith('academy', [11], expect.stringContaining('withdrawal'));
  });

  it('CASH uses the offline paid→refunded guard and emits canonical payment:refunded with cash metadata', async () => {
    const result = await academyRefundService.refund(11, 9, 'cash refund');
    expect(paymentService.refund).not.toHaveBeenCalled();
    expect(academyPaymentRepository.markRefundedIfPaid).toHaveBeenCalledWith(5001);
    const paid = emit.mock.calls.find((c: any) => c[0] === 'payment:refunded');
    expect(paid[1]).toMatchObject({
      paymentId: 5001, userId: 200, amount: 200, referenceType: 'academy', referenceId: 11,
      metadata: { paymentMethod: 'cash', currency: 'EGP' },
    });
    expect(result.method).toBe('cash');
    expect(financialEntitlementService.cancelBySourceIds).toHaveBeenCalledWith('academy', [11], expect.stringContaining('cash refund'));
  });

  it('CASH offline refund: no gateway call on a payment whose paid→refunded guard wins', async () => {
    await academyRefundService.refund(11, 9, 'x');
    expect(paymentService.refund).not.toHaveBeenCalled();
  });

  it('CASH second attempt (already refunded) is rejected deterministically', async () => {
    academyPaymentRepository.markRefundedIfPaid.mockResolvedValueOnce(false);
    await expect(academyRefundService.refund(11, 9, 'double')).rejects.toMatchObject({ code: 'ACADEMY_PAYMENT_NOT_ELIGIBLE' });
    expect(emit.mock.calls.filter((c: any) => c[0] === 'payment:refunded').length).toBe(0);
  });

  it('eligibility: enrollment with no settled snapshot is rejected', async () => {
    academyPaymentRepository.getSnapshotByEnrollment.mockResolvedValue(null);
    await expect(academyRefundService.refund(11, 9)).rejects.toMatchObject({ code: 'ACADEMY_PAYMENT_NOT_ELIGIBLE' });
    expect(paymentService.refund).not.toHaveBeenCalled();
  });

  it('eligibility: a non-paid payment is rejected', async () => {
    paymentRepository.findById.mockResolvedValue({ ...PAID_PAYMENT, payment_status: 'pending' });
    await expect(academyRefundService.refund(11, 9)).rejects.toMatchObject({ code: 'ACADEMY_PAYMENT_NOT_ELIGIBLE' });
    expect(paymentService.refund).not.toHaveBeenCalled();
  });

  it('ownership: a payment not belonging to this enrollment is rejected', async () => {
    paymentRepository.findById.mockResolvedValue({ ...PAID_PAYMENT, reference_id: 99 });
    await expect(academyRefundService.refund(11, 9)).rejects.toMatchObject({ code: 'ACADEMY_PAYMENT_NOT_ELIGIBLE' });
  });

  it('eligibility: wallet payments are rejected (wallet remains disabled)', async () => {
    paymentRepository.findById.mockResolvedValue({ ...PAID_PAYMENT, payment_method: 'wallet' });
    await expect(academyRefundService.refund(11, 9)).rejects.toThrow(/wallet/);
    expect(paymentService.refund).not.toHaveBeenCalled();
  });

  it('tenancy: an actor without Academy scope is rejected before any refund', async () => {
    (assertCanManageAcademy as any).mockRejectedValueOnce(new NotFoundError('Academy program', 'ACADEMY_PROGRAM_NOT_FOUND'));
    await expect(academyRefundService.refund(11, 9)).rejects.toBeTruthy();
    expect(paymentService.refund).not.toHaveBeenCalled();
  });

  it('entitlement cancellation failure does not fail the already-committed refund', async () => {
    financialEntitlementService.cancelBySourceIds.mockRejectedValueOnce(new Error('boom'));
    const result = await academyRefundService.refund(11, 9);
    expect(result.success).toBe(true);
  });
});