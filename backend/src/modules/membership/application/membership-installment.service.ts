import { membershipP1Repository } from '../infrastructure/repositories/membership-p1.repository.js';
import { membershipP2Repository } from '../infrastructure/repositories/membership-p2.repository.js';
import { buildMembershipInvoiceNumber } from '../domain/membership-p1.types.js';
import { round2, todayISO } from '../domain/membership-p2.types.js';
import { notFoundError, conflictError, validationError } from './membership-p1.errors.js';
import { recordAudit } from '../../audit-log/index.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';

type Row = import('mysql2').RowDataPacket;

/**
 * G11.22 P2 — installment lifecycle for membership subscriptions.
 *
 * Approved decisions implemented:
 *   - FIRST installment paid+finalized ⇒ subscription.status = 'active'
 *     (payment_status = 'partially_paid').
 *   - Subsequent installments simply become 'paid'; overdue / being unpaid
 *     NEVER deactivates the membership.
 *   - Post-expiry payments settle the outstanding installment with normal
 *     accounting and never reactivate / extend the expired subscription.
 *   - ONE invoice covers the FULL subscription total; installments are
 *     payments against it (invoices.paid_amount updated per payment).
 */
export const membershipInstallmentService = {

  async subscriptionHasInstallments(subscriptionId: number): Promise<boolean> {
    const rows = await membershipP2Repository.listInstallmentsBySubscription(subscriptionId);
    return rows.length > 0;
  },

  /** Validate template amounts sum to the subscription total (round2-exact). */
  validateTemplateTotal(templates: Array<{ seq: number; amount: number; dueOffsetDays: number }>, total: number): void {
    if (!templates.length) throw validationError('Installments enabled but no installment schedule was provided');
    const sum = round2(templates.reduce((s, t) => s + round2(t.amount), 0));
    if (Math.abs(sum - total) >= 0.01) {
      throw validationError(`Installment template amounts (${sum}) must equal the subscription total (${total})`);
    }
  },

  /**
   * Operator confirmation of a CASH installment payment (first or subsequent,
   * incl. post-expiry collection).
   */
  async confirmInstallmentCash(orgId: number, subscriptionId: number, seq: number, actorId: number): Promise<void> {
    const subscription = await this.assertPayable(orgId, subscriptionId, seq);
    const userId = Number(subscription.user_id);
    const installment = await membershipP2Repository.findInstallment(subscriptionId, seq);
    if (!installment) throw notFoundError('Membership installment');
    if (installment.status === 'paid') return; // idempotent replay — no-op
    if (installment.status === 'voided' || installment.status === 'refunded') {
      throw conflictError(`Installment is ${installment.status}`);
    }
    let payment: { id: number; amount: number } | null = (await membershipP2Repository.findPendingInstallmentPayment(subscriptionId, 'cash', userId)) as any;
    if (!payment) {
      const paymentId = await membershipP2Repository.createInstallmentPayment(
        userId, subscriptionId, Number(installment.amount), String(subscription.currency || 'EGP'), 'cash', seq,
      );
      payment = { id: paymentId, amount: Number(installment.amount) };
    }
    await membershipP2Repository.markPaymentPaid(payment.id);
    await membershipP2Repository.linkInstallmentPayment(Number(installment.id), payment.id);
    this.emitInstallmentPaymentSucceeded(subscriptionId, payment.id, 'cash', payment.amount, String(subscription.currency || 'EGP'), seq);
    await this.finalizeInstallmentPaid(subscriptionId, seq, 'cash');
    recordAudit({ actorId, action: 'MEMBERSHIP_INSTALLMENT.CONFIRM_CASH', entityType: 'membership_installment', entityId: Number(installment.id), afterState: { subscriptionId, seq } });
  },

  /** Operator fallback for a CARD installment payment. */
  async completeInstallmentCard(orgId: number, subscriptionId: number, seq: number, actorId: number): Promise<void> {
    const subscription = await this.assertPayable(orgId, subscriptionId, seq);
    const userId = Number(subscription.user_id);
    const installment = await membershipP2Repository.findInstallment(subscriptionId, seq);
    if (!installment) throw notFoundError('Membership installment');
    if (installment.status === 'paid') return; // idempotent replay — no-op
    if (installment.status === 'voided' || installment.status === 'refunded') {
      throw conflictError(`Installment is ${installment.status}`);
    }
    let payment: { id: number; amount: number } | null = (await membershipP2Repository.findPendingInstallmentPayment(subscriptionId, 'card', userId)) as any;
    if (!payment) {
      const paymentId = await membershipP2Repository.createInstallmentPayment(
        userId, subscriptionId, Number(installment.amount), String(subscription.currency || 'EGP'), 'card', seq,
      );
      payment = { id: paymentId, amount: Number(installment.amount) };
    }
    await membershipP2Repository.markPaymentPaid(payment.id);
    await membershipP2Repository.linkInstallmentPayment(Number(installment.id), payment.id);
    this.emitInstallmentPaymentSucceeded(subscriptionId, payment.id, 'card', payment.amount, String(subscription.currency || 'EGP'), seq);
    await this.finalizeInstallmentPaid(subscriptionId, seq, 'card');
    recordAudit({ actorId, action: 'MEMBERSHIP_INSTALLMENT.COMPLETE_CARD', entityType: 'membership_installment', entityId: Number(installment.id), afterState: { subscriptionId, seq } });
  },

  /** Org + subscription validations shared by cash/card installment confirms. */
  async assertPayable(orgId: number, subscriptionId: number, seq: number): Promise<Row> {
    const subscription = await membershipP1Repository.findSubscription(subscriptionId);
    if (!subscription || Number(subscription.organisation_id) !== orgId) throw notFoundError('Membership subscription');
    const installment = await membershipP2Repository.findInstallment(subscriptionId, seq);
    if (!installment) throw notFoundError('Membership installment');
    return subscription;
  },

  emitInstallmentPaymentSucceeded(
    subscriptionId: number, paymentId: number, method: string, amount: number, currency: string, seq: number,
  ): void {
    eventBusV2.emit('payment:succeeded', {
      referenceType: 'membership_subscription',
      referenceId: subscriptionId,
      paymentId,
      amount,
      userId: undefined,
      metadata: { paymentMethod: method, currency, seq },
    } as Record<string, unknown>, {
      aggregateType: 'payment_transaction', aggregateId: String(paymentId), aggregateVersion: 1,
    });
  },

  /**
   * Finalise a paid installment. Idempotent.
   *   seq == 1  → create the FULL-subscription invoice once + ACTIVATE.
   *   seq  > 1  → update invoice paid_amount; no status change.
   * Allowed on 'pending' (first), 'active', and 'expired' (post-expiry
   * collection — decision #4: never reactivates, never extends).
   */
  async finalizeInstallmentPaid(subscriptionId: number, seq: number, paymentMethod: string): Promise<void> {
    const installment = await membershipP2Repository.findInstallment(subscriptionId, seq);
    if (!installment) return;
    if (installment.status === 'paid') return;
    if (installment.status === 'voided' || installment.status === 'refunded') {
      throw conflictError(`Installment is ${installment.status}`);
    }
    const subscription = await membershipP1Repository.findSubscription(subscriptionId);
    if (!subscription) return;
    const userId = Number(subscription.user_id);
    const orgId = Number(subscription.organisation_id);
    const amount = round2(Number(installment.amount));
    const total = round2(Number(subscription.total_amount));
    const componentTotal = await this.componentTotal(subscriptionId);

    const paymentId = await membershipP2Repository.findInstallmentPaymentId(installment.id);
    await membershipP2Repository.markInstallmentPaid(Number(installment.id), paymentId ?? 0);

    if (seq === 1) {
      let invoiceId = subscription.invoice_id != null ? Number(subscription.invoice_id) : null;
      if (invoiceId == null) {
        const components = await membershipP1Repository.listSubscriptionComponents(subscriptionId);
        invoiceId = await membershipP1Repository.createInvoice({
          organisationId: orgId,
          userId,
          invoiceNumber: buildMembershipInvoiceNumber(orgId, subscriptionId),
          issueDate: todayISO(),
          subtotal: componentTotal,
          total,
          referenceType: 'membership_subscription',
          referenceId: subscriptionId,
          actorId: userId,
          status: 'partially_paid',
          paidAmount: amount,
          items: components.map((c: Row) => ({
            description: c.component_name,
            quantity: Number(c.quantity),
            unitPrice: Number(c.unit_amount),
            netAmount: Number(c.total_amount),
            totalAmount: Number(c.total_amount),
          })),
        });
      } else {
        await membershipP2Repository.updateInvoicePaidAmount(invoiceId, amount, total);
      }
      const activated = await membershipP2Repository.activateSubscriptionOnFirstInstallment(subscriptionId, invoiceId, paymentMethod);
      if (!activated) {
        // Already activated by a replay — nothing more to do.
        return;
      }
      recordAudit({
        actorId: userId,
        action: 'MEMBERSHIP_SUBSCRIPTION.ACTIVATED_FIRST_INSTALLMENT',
        entityType: 'membership_subscription',
        entityId: subscriptionId,
        afterState: { subscriptionId, invoiceId, seq },
      });
      eventBusV2.emit('membership:activated', {
        subscriptionId, userId, organisationId: orgId, paymentMethod, installmentSeq: seq,
      } as Record<string, unknown>, {
        aggregateType: 'membership_subscription', aggregateId: String(subscriptionId), aggregateVersion: 1,
      });
    } else {
      const invoiceId = subscription.invoice_id != null ? Number(subscription.invoice_id) : null;
      if (invoiceId != null) {
        await membershipP2Repository.updateInvoicePaidAmount(invoiceId, amount, total);
      }
    }

    recordAudit({
      actorId: userId,
      action: 'MEMBERSHIP_INSTALLMENT.PAID',
      entityType: 'membership_installment',
      entityId: Number(installment.id),
      afterState: { subscriptionId, seq, amount },
    });
    eventBusV2.emit('membership:payment-received', {
      subscriptionId, installmentId: Number(installment.id), seq, amount, userId, organisationId: orgId,
    } as Record<string, unknown>, {
      aggregateType: 'membership_installment', aggregateId: String(installment.id), aggregateVersion: 1,
    });
  },

  async componentTotal(subscriptionId: number): Promise<number> {
    const components = await membershipP1Repository.listSubscriptionComponents(subscriptionId);
    return round2(components.reduce((s, c) => s + Number(c.total_amount), 0));
  },

  /** Decorate installments for API responses. */
  decorate(subscriptionId: number, rows: Row[]): any[] {
    return rows.map((r) => ({
      id: Number(r.id),
      subscriptionId: Number(r.subscription_id),
      seq: Number(r.seq),
      amount: Number(r.amount),
      commissionAmount: Number(r.commission_amount),
      dueDate: r.due_date instanceof Date ? r.due_date.toISOString().slice(0, 10) : String(r.due_date ?? '').slice(0, 10),
      status: r.status,
      paidAt: r.paid_at ? (r.paid_at instanceof Date ? r.paid_at.toISOString() : r.paid_at) : null,
      currency: r.currency,
    }));
  },
};