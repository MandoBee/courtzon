// ============================================================================
// Academy G5-A — enrollment refund orchestration (FULL refund only).
//
// The canonical refund event is the shared `payment:refunded`; the durable
// payment state change (`paid → refunded`) remains the idempotency guard. This
// service is the smallest Academy-side orchestrator:
//   - eligibility + tenant/ownership validation (server-derived)
//   - CARD/gateway → shared paymentService.refund (crash-window hardened)
//   - CASH/offline  → dedicated offline path (no gateway), same paid→refunded
//                     guard + canonical payment:refunded
//   - entitlement cancellation via the existing cancelBySourceIds mechanism
//     (history preserved, never deleted, idempotent)
// It intentionally contains NO gateway/ledger logic and performs no direct
// ledger writes — accounting reversal happens in the financial `payment:refunded`
// consumer.
// ============================================================================
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { enrollmentRepository } from '../infrastructure/repositories/enrollment.repository.js';
import { academyPaymentRepository } from '../infrastructure/repositories/academy-payment.repository.js';
import { resolveProgramScope, assertCanManageAcademy } from './academy-scope.js';
import { paymentRepository } from '../../payment/infrastructure/repositories/payment.repository.js';
import { paymentService } from '../../payment/application/payment.service.js';
import { financialEntitlementService } from '../../financial/application/financial-entitlement.service.js';

const log = createModuleLogger('academy-refund');

export interface AcademyRefundResult {
  success: boolean;
  paymentId: number;
  enrollmentId: number;
  amount: number;
  currency: string;
  method: string;
  reason: string | null;
}

class AcademyRefundService {
  /**
   * Full-refund an Academy enrollment payment. The enrollment must be paid
   * (an immutable snapshot with a settled `paid` payment transaction). The
   * caller must have Academy tenant access; the payment is validated to belong
   * to the enrollment before any refund.
   */
  async refund(enrollmentId: number, actorId: number, reason?: string | null): Promise<AcademyRefundResult> {
    const enrollment = await enrollmentRepository.getById(enrollmentId);
    if (!enrollment) throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);

    // G5-A tenancy: the actor must manage the enrollment's Academy org/branch.
    const scope = await resolveProgramScope(Number(enrollment.program_id));
    await assertCanManageAcademy(actorId, scope);

    // Immutable snapshot = the settled-payment source of truth.
    const snapshot = await academyPaymentRepository.getSnapshotByEnrollment(enrollmentId);
    if (!snapshot?.id || !snapshot.payment_transaction_id) {
      throw new ConflictError('Enrollment has no settled payment to refund', ErrorCodes.ACADEMY_PAYMENT_NOT_ELIGIBLE);
    }

    const paymentId = Number(snapshot.payment_transaction_id);
    const payment = await paymentRepository.findById(paymentId);
    if (!payment) throw new NotFoundError('Payment transaction', ErrorCodes.ACADEMY_PAYMENT_UNAVAILABLE);

    // The payment must belong to THIS enrollment (server-derived ownership).
    if (String(payment.reference_type ?? '') !== 'academy' || Number(payment.reference_id) !== enrollmentId) {
      throw new ConflictError('Payment does not belong to this Academy enrollment', ErrorCodes.ACADEMY_PAYMENT_NOT_ELIGIBLE);
    }

    // Only paid payments are refundable (paid → refunded is the idempotency guard).
    if (payment.payment_status !== 'paid') {
      throw new ConflictError('Only paid Academy payments can be refunded', ErrorCodes.ACADEMY_PAYMENT_NOT_ELIGIBLE);
    }

    const amount = Math.round(Number(snapshot.gross_amount || 0) * 100) / 100;
    const currency = snapshot.currency || 'EGP';
    const method = payment.payment_method || snapshot.payment_method || 'card';

    // Wallet remains disabled for Academy (preserve the wallet-disabled policy).
    if (method === 'wallet') {
      throw new ConflictError('Wallet payments cannot be refunded (Academy wallet is disabled)', ErrorCodes.ACADEMY_PAYMENT_NOT_ELIGIBLE);
    }

    if (method === 'cash') {
      await this.offlineCashRefund(enrollment, snapshot, paymentId, amount, currency, reason);
    } else {
      // CARD / online / bank transfer → shared gateway refund (crash-window
      // idempotent). paymentService emits the canonical payment:refunded.
      await paymentService.refund(paymentId, amount, reason ?? undefined);
    }

    // G5-A — void the created entitlements (never delete; idempotent). The
    // refund is already committed; a cancellation failure is logged, not fatal.
    try {
      const cancelled = await financialEntitlementService.cancelBySourceIds(
        'academy', [enrollmentId], `Academy enrollment refund${reason ? `: ${reason}` : ''}`,
      );
      log.info({ enrollmentId, cancelled }, 'Academy refund entitlements cancelled');
    } catch (err) {
      log.error({ err, enrollmentId }, 'Academy refund entitlement cancellation failed (refund already committed)');
    }

    return {
      success: true,
      paymentId,
      enrollmentId,
      amount,
      currency,
      method,
      reason: reason ?? null,
    };
  }

  /**
   * Dedicated Academy CASH/offline refund — MUST NOT call a gateway. Reuses the
   * platform's idempotent `paid → refunded` conditional guard and emits the
   * canonical `payment:refunded` AFTER the durable state change (cash context in
   * metadata so the accounting/notification consumers behave correctly).
   */
  private async offlineCashRefund(
    enrollment: any,
    _snapshot: any,
    paymentId: number,
    amount: number,
    currency: string,
    reason?: string | null,
  ): Promise<void> {
    // Idempotent paid → refunded conditional transition (no gateway).
    const applied = await academyPaymentRepository.markRefundedIfPaid(paymentId);
    if (!applied) {
      throw new ConflictError('Payment is no longer in paid state — cannot be refunded', ErrorCodes.ACADEMY_PAYMENT_NOT_ELIGIBLE);
    }

    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
    await eventBusV2.emit('payment:refunded', {
      paymentId,
      userId: Number(enrollment.player_id),
      amount,
      reason: reason ?? undefined,
      traceId: `academy_offline_${paymentId}_${Date.now().toString(36)}`,
      referenceType: 'academy',
      referenceId: Number(enrollment.id),
      metadata: { paymentMethod: 'cash', currency },
    } as any);
  }
}

export const academyRefundService = new AcademyRefundService();