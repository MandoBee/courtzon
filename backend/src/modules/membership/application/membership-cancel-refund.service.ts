import { recordAudit } from '../../audit-log/index.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { paymentService } from '../../payment/application/payment.service.js';
import { membershipP1Repository } from '../infrastructure/repositories/membership-p1.repository.js';
import { membershipP2Repository } from '../infrastructure/repositories/membership-p2.repository.js';
import {
  normalizeCancellationRefundPolicy, round2, todayISO,
  isRefundableBeforeStart,
  type MembershipCancellationRefundPolicy,
} from '../domain/membership-p2.types.js';
import { notFoundError, conflictError, validationError } from './membership-p1.errors.js';

type Row = import('mysql2').RowDataPacket;

/**
 * G11.22 P2 — membership CANCELLATION & REFUND (approved decisions #10–#16).
 *
 * CANCEL ≠ REFUND:
 *   • Cancellation is a LIFECYCLE operation: it voids FUTURE (pending)
 *     unpaid installments per the organisation policy and NEVER reverses
 *     revenue/commission by itself (decision #11). Overdue installments
 *     remain collectible (decision #2).
 *   • Refund is a SEPARATE FINANCIAL operation that reverses ONLY the amount
 *     actually refunded using the existing payment/accounting architecture
 *     (decision #13). Paid financial history is never deleted.
 *   • Both are governed by the organisation's configurable policy (decision
 *     #7/#14/#15) stored in organisation_membership_settings.
 */
export const membershipCancelRefundService = {

  async loadPolicy(orgId: number): Promise<MembershipCancellationRefundPolicy> {
    const raw = await membershipP2Repository.getOrgCancellationRefundPolicy(orgId);
    if (raw == null) return normalizeCancellationRefundPolicy(null);
    try {
      return normalizeCancellationRefundPolicy(JSON.parse(raw));
    } catch {
      return normalizeCancellationRefundPolicy(null);
    }
  },

  async setPolicy(orgId: number, policyInput: Record<string, any>): Promise<MembershipCancellationRefundPolicy> {
    const policy = normalizeCancellationRefundPolicy(policyInput);
    await membershipP2Repository.setOrgCancellationRefundPolicy(orgId, JSON.stringify(policy));
    return policy;
  },

  /**
   * Cancel a membership. Voids FUTURE unpaid (pending) installments per policy.
   * No GL reversal and no refund here — refund is a separate operation.
   */
  async cancelSubscription(orgId: number, subscriptionId: number, actorId: number, reason?: string): Promise<void> {
    const subscription = await membershipP1Repository.findSubscription(subscriptionId);
    if (!subscription || Number(subscription.organisation_id) !== orgId) throw notFoundError('Membership subscription');
    if (subscription.status === 'cancelled') return; // idempotent
    if (subscription.status === 'expired' || subscription.status === 'terminated') {
      throw conflictError(`An ${subscription.status} subscription cannot be cancelled`);
    }

    const policy = await this.loadPolicy(orgId);
    const changed = await membershipP2Repository.setSubscriptionCancelled(subscriptionId);
    if (!changed) return;

    let voided = 0;
    if (policy.cancellation.void_future_unpaid) {
      voided = await membershipP2Repository.voidPendingInstallments(subscriptionId);
    }

    recordAudit({
      actorId,
      action: 'MEMBERSHIP_SUBSCRIPTION.CANCELLED',
      entityType: 'membership_subscription',
      entityId: subscriptionId,
      afterState: { subscriptionId, voidedPendingInstallments: voided, reason: reason ?? null },
    });
    eventBusV2.emit('membership:cancelled', {
      subscriptionId, userId: Number(subscription.user_id), organisationId: orgId,
      voidedInstallments: voided, reason: reason ?? null,
    } as Record<string, unknown>, {
      aggregateType: 'membership_subscription', aggregateId: String(subscriptionId), aggregateVersion: 1,
    });
  },

  /**
   * Refund paid installments (a separate financial operation). Only the actual
   * refunded amounts are reversed. `installmentIds` restricts the scope; when
   * omitted, the policy decides which paid installments qualify.
   */
  async refundInstallments(
    orgId: number,
    subscriptionId: number,
    actorId: number,
    installmentIds?: number[],
    reason?: string,
  ): Promise<{ refunded: number; refundedAmount: number }> {
    const subscription = await membershipP1Repository.findSubscription(subscriptionId);
    if (!subscription || Number(subscription.organisation_id) !== orgId) throw notFoundError('Membership subscription');

    const policy = await this.loadPolicy(orgId);
    if (policy.refund.type === 'none') {
      throw validationError('Refunds are not enabled by this organisation\'s membership policy');
    }

    const installments = await membershipP2Repository.listInstallmentsBySubscription(subscriptionId);
    const paid = installments.filter((i) => i.status === 'paid');
    if (!paid.length) throw conflictError('No paid installments to refund');

    const today = todayISO();
    const startDate = subscription.start_date instanceof Date
      ? subscription.start_date.toISOString().slice(0, 10)
      : String(subscription.start_date ?? '').slice(0, 10);

    // Policy qualification (time-proportional proration is a P3 engine concern;
    // P2 'proportional' refunds the paid installments of the period).
    const candidates = paid.filter((i) => {
      // before_start_only is a HARD policy gate: it applies even when explicit
      // installmentIds are provided (an operator may never override the org
      // policy by passing ids).
      if (policy.refund.type === 'before_start_only' && !isRefundableBeforeStart(today, startDate, policy.refund.window_days_before_start)) {
        return false;
      }
      if (installmentIds && installmentIds.length) return installmentIds.includes(Number(i.id));
      return true; // 'full' | 'proportional'
    });
    if (!candidates.length) throw conflictError('No paid installments qualify for a refund under the configured policy');

    let refunded = 0;
    let refundedAmount = 0;
    const total = round2(Number(subscription.total_amount));
    const invoiceId = subscription.invoice_id != null ? Number(subscription.invoice_id) : null;

    for (const inst of candidates) {
      const installmentId = Number(inst.id);
      const amount = round2(Number(inst.amount));
      const paymentId = await membershipP2Repository.findInstallmentPaymentId(installmentId);
      const payment = paymentId ? await membershipP2Repository.findPaymentById(paymentId) : null;
      const method = String(payment?.payment_method ?? 'cash');

      if (method === 'card' && paymentId) {
        // Reuse the EXISTING payment engine (gateway refund + canonical
        // payment:refunded emission). MockGateway in dev; Paymob in prod.
        await paymentService.refund(paymentId, amount, reason ?? `Membership subscription #${subscriptionId} installment #${inst.seq} refund`);
      } else if (paymentId) {
        // Cash has no gateway record — the operator returns physical cash.
        const ok = await membershipP2Repository.markPaymentRefunded(paymentId);
        if (!ok) continue;
        eventBusV2.emit('payment:refunded', {
          paymentId, userId: Number(subscription.user_id), amount, reason: reason ?? null,
          referenceType: 'membership_subscription', referenceId: subscriptionId,
          metadata: { paymentMethod: 'cash', currency: String(inst.currency || 'EGP'), installmentId },
        } as Record<string, unknown>, {
          aggregateType: 'payment_transaction', aggregateId: String(paymentId), aggregateVersion: 1,
        });
      }

      const marked = await membershipP2Repository.markInstallmentRefunded(installmentId);
      if (!marked) continue;

      if (invoiceId != null) {
        await membershipP2Repository.updateInvoicePaidAmount(invoiceId, -amount, total);
      }

      recordAudit({
        actorId,
        action: 'MEMBERSHIP_INSTALLMENT.REFUNDED',
        entityType: 'membership_installment',
        entityId: installmentId,
        afterState: { subscriptionId, installmentId, amount },
      });
      refunded++;
      refundedAmount = round2(refundedAmount + amount);
    }

    if (refunded > 0) {
      eventBusV2.emit('membership:refunded', {
        subscriptionId, userId: Number(subscription.user_id), organisationId: orgId,
        refundedCount: refunded, refundedAmount,
      } as Record<string, unknown>, {
        aggregateType: 'membership_subscription', aggregateId: String(subscriptionId), aggregateVersion: 1,
      });
    }
    return { refunded, refundedAmount };
  },
};