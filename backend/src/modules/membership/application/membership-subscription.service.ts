import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { getCommissionRate, clearSubscriptionCache } from '../../organisations/application/current-subscription.service.js';
import { membershipP1Repository } from '../infrastructure/repositories/membership-p1.repository.js';
import { membershipP2Repository } from '../infrastructure/repositories/membership-p2.repository.js';
import { membershipPlanVersionService } from './membership-plan-version.service.js';
import { membershipInstallmentService } from './membership-installment.service.js';
import { notFoundError, validationError, conflictError } from './membership-p1.errors.js';
import {
  computeComponentTotal,
  computeCommission,
  computeGraceUntil,
  computeSubscriptionEndDate,
  buildMembershipInvoiceNumber,
} from '../domain/membership-p1.types.js';
import { buildInstallmentSchedule, round2, deriveEligibility } from '../domain/membership-p2.types.js';

type Row = import('mysql2').RowDataPacket;

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* fallthrough */ }
    return value ? value.split(',') : [];
  }
  return [];
}

function toNumberArray(value: unknown): number[] {
  return toArray(value).map(Number).filter((n) => Number.isFinite(n));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const membershipSubscriptionService = {

  /**
   * Player purchase — FULL PAYMENT in P1.
   * Creates the immutable subscription (+ component snapshot) and a pending
   * payment_transactions row. The subscription activates when the payment is
   * confirmed (cash: operator; card: gateway/webhook or operator fallback),
   * which emits `payment:succeeded` → finalisation + accounting.
   */
  async createSubscription(
    orgId: number,
    userId: number,
    planVersionId: number,
    paymentMethod: 'cash' | 'card',
    actorId: number,
  ): Promise<{ subscriptionId: number; paymentId: number; totalAmount: number }> {
    const version = await membershipP1Repository.findVersion(planVersionId);
    if (!version) throw notFoundError('Membership plan version');
    if (version.status !== 'active') throw validationError('The selected plan version is not active');

    const plan = await membershipP1Repository.findPlanById(Number(version.membership_plan_id));
    if (!plan || plan.organisation_id !== orgId) throw notFoundError('Membership plan');

    // Commission settings belong to CourtZon organisation subscription settings
    // — read fresh (no stale per-request cache) so in-session rate changes apply.
    clearSubscriptionCache();

    // Organisation settings: payment channel must be enabled org-wide too.
    const settings = await membershipPlanVersionService.getOrganisationSettings(orgId);
    const allowedOrg = new Set(settings.allowed_payment_methods);
    const allowedVersion = new Set(toArray(version.allowed_payment_methods));
    if (!allowedOrg.has(paymentMethod) || !allowedVersion.has(paymentMethod)) {
      throw validationError(`Payment method '${paymentMethod}' is not enabled for this membership`);
    }

    const components = await membershipP1Repository.listComponentsByVersionId(planVersionId);
    if (!components.length) throw validationError('The plan version has no components');

    const totalAmount = computeComponentTotal(components.map((c) => ({
      code: c.code, name: c.name, category: c.category, amount: Number(c.amount),
      quantity: Number(c.quantity), isRequired: Number(c.is_required) === 1, sortOrder: Number(c.sort_order),
    })));

    // CourtZon commission snapshot at purchase (percentage or fixed; 0 if unconfigured).
    const rate = await getCommissionRate(orgId, 'membership');
    const commissionAmount = computeCommission(rate?.rateType, rate?.rate ?? 0, totalAmount);
    const orgNetAmount = Math.round((totalAmount - commissionAmount) * 100) / 100;

    const startDate = today();
    const endDate = computeSubscriptionEndDate(
      startDate,
      version.duration_type,
      Number(version.duration_periods),
      version.renewal_model,
      version.fixed_renewal_month != null ? Number(version.fixed_renewal_month) : null,
      version.fixed_renewal_day != null ? Number(version.fixed_renewal_day) : null,
    );
    const graceUntil = computeGraceUntil(endDate, Number(version.grace_days));

    const branchIds = version.branch_scope === 'SELECTED'
      ? await membershipP1Repository.listBranchIdsByVersionId(planVersionId)
      : [];

    // ── G11.22 P2 — installment mode ────────────────────────────────────────
    // When the version enables installments AND carries a schedule, the
    // subscription is paid in installments: the FIRST installment activates it,
    // the invoice covers the FULL total, and every subsequent installment is a
    // payment against that same invoice. Overdue installments never affect the
    // membership status (approved decisions #1/#2).
    const installmentsEnabled = Number(version.installments_enabled) === 1;
    const installmentTemplates = installmentsEnabled
      ? await membershipP2Repository.listInstallmentTemplates(planVersionId)
      : [];
    let schedule: Array<{ seq: number; amount: number; commissionAmount: number; dueDate: string; currency: string }> = [];
    if (installmentTemplates.length > 0) {
      membershipInstallmentService.validateTemplateTotal(
        installmentTemplates.map((t) => ({ seq: Number(t.seq), amount: Number(t.amount), dueOffsetDays: Number(t.due_offset_days) })),
        totalAmount,
      );
      schedule = buildInstallmentSchedule(
        installmentTemplates.map((t) => ({ seq: Number(t.seq), amount: Number(t.amount), dueOffsetDays: Number(t.due_offset_days) })),
        rate?.rateType,
        rate?.rate ?? 0,
        totalAmount,
        startDate,
        version.currency || 'EGP',
      );
    }

    const subscriptionId = await membershipP1Repository.createSubscriptionWithParts({
      organisationId: orgId,
      userId,
      planId: Number(plan.id),
      planVersionId,
      startDate,
      endDate,
      graceUntil,
      snapshots: {
        durationType: version.duration_type,
        durationPeriods: Number(version.duration_periods),
        renewalModel: version.renewal_model,
        fixedRenewalMonth: version.fixed_renewal_month != null ? Number(version.fixed_renewal_month) : null,
        fixedRenewalDay: version.fixed_renewal_day != null ? Number(version.fixed_renewal_day) : null,
        initialChargeType: version.initial_charge_type,
        initialChargePercent: version.initial_charge_percent != null ? Number(version.initial_charge_percent) : null,
        graceDays: Number(version.grace_days),
        branchScope: version.branch_scope,
      },
      selectedBranchIds: branchIds.length ? branchIds : null,
      allowedPaymentMethods: toArray(version.allowed_payment_methods),
      currency: version.currency || 'EGP',
      totalAmount,
      commissionRateType: rate?.rateType ?? null,
      commissionRateValue: rate?.rate ?? 0,
      commissionAmount,
      orgNetAmount,
      paymentMethod,
      actorId,
      components: components.map((c) => ({
        code: c.code, name: c.name, category: c.category, quantity: Number(c.quantity),
        unitAmount: Number(c.amount), totalAmount: Math.round(Number(c.quantity) * Number(c.amount) * 100) / 100,
        isRequired: Number(c.is_required) === 1, sortOrder: Number(c.sort_order),
      })),
      installments: schedule.length ? schedule : null,
    });

    // Pending payment — the FULL amount (P1 mode) or the FIRST installment (P2 mode).
    const paymentId = schedule.length
      ? await membershipP2Repository.createInstallmentPayment(
        userId, subscriptionId, schedule[0].amount, version.currency || 'EGP', paymentMethod, 1,
      )
      : await membershipP1Repository.createPayment({
        userId,
        referenceId: subscriptionId,
        amount: totalAmount,
        currency: version.currency || 'EGP',
        paymentMethod,
        gatewayProvider: paymentMethod === 'card' ? 'paymob' : null,
        gatewayReference: paymentMethod === 'card' ? `ms_${subscriptionId}_${Date.now()}` : null,
        idempotencyKey: `ms_${subscriptionId}`,
        status: 'pending',
      });

    eventBusV2.emit('membership:created', {
      subscriptionId, userId, planId: Number(plan.id), planVersionId, organisationId: orgId,
      installmentsEnabled: schedule.length > 0,
    } as Record<string, unknown>, {
      aggregateType: 'membership_subscription', aggregateId: String(subscriptionId), aggregateVersion: 1,
    });
    if (schedule.length > 0) {
      eventBusV2.emit('membership:pending-payment', {
        subscriptionId, userId, organisationId: orgId, installmentSeq: 1,
        amount: schedule[0].amount, totalAmount,
      } as Record<string, unknown>, {
        aggregateType: 'membership_subscription', aggregateId: String(subscriptionId), aggregateVersion: 1,
      });
    }

    return { subscriptionId, paymentId, totalAmount };
  },

  /** Operator confirmation of a CASH membership payment (full amount). */
  async confirmCashPayment(orgId: number, subscriptionId: number, actorId: number): Promise<void> {
    const subscription = await membershipP1Repository.findSubscription(subscriptionId);
    if (!subscription || Number(subscription.organisation_id) !== orgId) throw notFoundError('Membership subscription');
    if (subscription.status !== 'pending') throw conflictError('Subscription is not pending');
    if (await membershipInstallmentService.subscriptionHasInstallments(subscriptionId)) {
      throw conflictError('This subscription is paid in installments — use the per-installment confirm endpoint');
    }
    const payment = await this.findPendingPayment(subscriptionId, 'cash', Number(subscription.user_id));
    if (!payment) throw conflictError('No pending cash payment found for this subscription');
    await membershipP1Repository.markPaymentPaid(Number(payment.id));
    this.emitPaymentSucceeded(subscriptionId, Number(payment.id), 'cash', Number(subscription.total_amount), String(subscription.currency));
    await this.finalizePaidSubscription(subscriptionId, 'cash');
    recordAudit({ actorId, action: 'MEMBERSHIP_SUBSCRIPTION.CONFIRM_CASH', entityType: 'membership_subscription', entityId: subscriptionId, afterState: { subscriptionId } });
  },

  /** Operator fallback for a CARD membership payment (offline/webhook stand-in). */
  async completeCardPayment(orgId: number, subscriptionId: number, actorId: number): Promise<void> {
    const subscription = await membershipP1Repository.findSubscription(subscriptionId);
    if (!subscription || Number(subscription.organisation_id) !== orgId) throw notFoundError('Membership subscription');
    if (subscription.status !== 'pending') throw conflictError('Subscription is not pending');
    if (await membershipInstallmentService.subscriptionHasInstallments(subscriptionId)) {
      throw conflictError('This subscription is paid in installments — use the per-installment confirm endpoint');
    }
    const payment = await this.findPendingPayment(subscriptionId, 'card', Number(subscription.user_id));
    if (!payment) throw conflictError('No pending card payment found for this subscription');
    await membershipP1Repository.markPaymentPaid(Number(payment.id));
    this.emitPaymentSucceeded(subscriptionId, Number(payment.id), 'card', Number(subscription.total_amount), String(subscription.currency));
    await this.finalizePaidSubscription(subscriptionId, 'card');
    recordAudit({ actorId, action: 'MEMBERSHIP_SUBSCRIPTION.COMPLETE_CARD', entityType: 'membership_subscription', entityId: subscriptionId, afterState: { subscriptionId } });
  },

  async findPendingPayment(subscriptionId: number, method: string, userId: number): Promise<Row | null> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT id, amount FROM payment_transactions
       WHERE reference_type = 'membership_subscription' AND reference_id = ? AND payment_method = ?
         AND user_id = ? AND payment_status = 'pending'
       ORDER BY id DESC LIMIT 1`,
      [subscriptionId, method, userId],
    );
    return rows[0] || null;
  },

  emitPaymentSucceeded(subscriptionId: number, paymentId: number, method: string, amount: number, currency: string): void {
    eventBusV2.emit('payment:succeeded', {
      referenceType: 'membership_subscription',
      referenceId: subscriptionId,
      paymentId,
      amount,
      userId: undefined,
      metadata: { paymentMethod: method, currency },
    } as Record<string, unknown>, {
      aggregateType: 'payment_transaction', aggregateId: String(paymentId), aggregateVersion: 1,
    });
  },

  /**
   * Finalise a membership subscription once its full payment is confirmed.
   * Idempotent — activates only a 'pending' subscription and creates the invoice
   * exactly once (invoice_id already set ⇒ skip).
   */
  async finalizePaidSubscription(referenceId: number, paymentMethod: string): Promise<void> {
    const subscription = await membershipP1Repository.findSubscription(referenceId);
    if (!subscription || subscription.status !== 'pending') return;
    // P2: installment-mode subscriptions are finalised by the per-installment
    // flow (first installment activates). The legacy full-payment path must
    // never touch them (it would wrongly mark the subscription fully paid).
    if (await membershipInstallmentService.subscriptionHasInstallments(referenceId)) return;
    const userId = Number(subscription.user_id);
    const orgId = Number(subscription.organisation_id);

    let invoiceId: number | null = subscription.invoice_id != null ? Number(subscription.invoice_id) : null;
    if (invoiceId == null) {
      const components = await membershipP1Repository.listSubscriptionComponents(referenceId);
      const subtotal = components.reduce((s, c) => s + Number(c.total_amount), 0);
      const total = Math.round(subtotal * 100) / 100;
      invoiceId = await membershipP1Repository.createInvoice({
        organisationId: orgId,
        userId,
        invoiceNumber: buildMembershipInvoiceNumber(orgId, referenceId),
        issueDate: today(),
        subtotal: total,
        total,
        referenceType: 'membership_subscription',
        referenceId,
        actorId: userId,
        items: components.map((c) => ({
          description: c.component_name,
          quantity: Number(c.quantity),
          unitPrice: Number(c.unit_amount),
          netAmount: Number(c.total_amount),
          totalAmount: Number(c.total_amount),
        })),
      });
    }

    await membershipP1Repository.activateSubscription(referenceId, invoiceId, paymentMethod);

    recordAudit({
      actorId: userId,
      action: 'MEMBERSHIP_SUBSCRIPTION.ACTIVATED',
      entityType: 'membership_subscription',
      entityId: referenceId,
      afterState: { subscriptionId: referenceId, invoiceId, paymentMethod },
    });

    eventBusV2.emit('membership:activated', {
      subscriptionId: referenceId, userId, organisationId: orgId, paymentMethod,
    } as Record<string, unknown>, {
      aggregateType: 'membership_subscription', aggregateId: String(referenceId), aggregateVersion: 1,
    });
  },

  async listOrgSubscriptions(orgId: number): Promise<any[]> {
    return this.decorateSubscriptions(await membershipP1Repository.listSubscriptionsByOrg(orgId));
  },

  async listMySubscriptions(userId: number): Promise<any[]> {
    return this.decorateSubscriptions(await membershipP1Repository.listSubscriptionsByUser(userId));
  },

  async getSubscriptionScoped(subscriptionId: number, orgId: number): Promise<any | null> {
    const row = await membershipP1Repository.findSubscription(subscriptionId);
    if (!row) return null;
    if (Number(row.organisation_id) !== orgId) return null;
    const componentRows = await membershipP1Repository.listSubscriptionComponents(subscriptionId);
    const item = this.decorate({ ...row }, componentRows);
    const instRows = await membershipP2Repository.listInstallmentsBySubscription(subscriptionId);
    item.installments = membershipInstallmentService.decorate(subscriptionId, instRows);
    item.eligibility = this.decorateEligibility({ ...row }, instRows);
    return item;
  },

  async decorateSubscriptions(rows: Row[]): Promise<any[]> {
    const out: any[] = [];
    for (const r of rows) {
      const compRows = await membershipP1Repository.listSubscriptionComponents(Number(r.id));
      const item = this.decorate({ ...r }, compRows);
      const instRows = await membershipP2Repository.listInstallmentsBySubscription(Number(r.id));
      item.installments = membershipInstallmentService.decorate(Number(r.id), instRows);
      item.eligibility = this.decorateEligibility({ ...r }, instRows);
      out.push(item);
    }
    return out;
  },

  decorateEligibility(row: Row, instRows: Row[]): any {
    const facts = deriveEligibility({
      subscriptionId: Number(row.id),
      status: row.status,
      paymentStatus: row.payment_status,
      endDate: row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().slice(0, 10) : String(row.end_date).slice(0, 10)) : null,
      graceUntil: row.grace_until ? (row.grace_until instanceof Date ? row.grace_until.toISOString().slice(0, 10) : String(row.grace_until).slice(0, 10)) : null,
      installments: (instRows || []).map((i) => ({
        amount: Number(i.amount), commissionAmount: Number(i.commission_amount), status: i.status,
      })),
    });
    return facts;
  },

  decorate(row: any, components: Row[]): any {
    return {
      id: Number(row.id),
      publicId: row.public_id,
      organisationId: Number(row.organisation_id),
      userId: Number(row.user_id),
      planId: Number(row.plan_id),
      planVersionId: Number(row.plan_version_id),
      planName: row.plan_name || null,
      memberName: row.member_name ?? null,
      status: row.status,
      startDate: row.start_date instanceof Date ? row.start_date.toISOString().slice(0, 10) : String(row.start_date ?? '').slice(0, 10),
      endDate: row.end_date ? (row.end_date instanceof Date ? row.end_date.toISOString().slice(0, 10) : String(row.end_date).slice(0, 10)) : null,
      graceUntil: row.grace_until ? (row.grace_until instanceof Date ? row.grace_until.toISOString().slice(0, 10) : String(row.grace_until).slice(0, 10)) : null,
      durationTypeSnapshot: row.duration_type_snapshot,
      durationPeriodsSnapshot: Number(row.duration_periods_snapshot),
      renewalModelSnapshot: row.renewal_model_snapshot,
      fixedRenewalMonthSnapshot: row.fixed_renewal_month_snapshot != null ? Number(row.fixed_renewal_month_snapshot) : null,
      fixedRenewalDaySnapshot: row.fixed_renewal_day_snapshot != null ? Number(row.fixed_renewal_day_snapshot) : null,
      initialChargeTypeSnapshot: row.initial_charge_type_snapshot,
      initialChargePercentSnapshot: row.initial_charge_percent_snapshot != null ? Number(row.initial_charge_percent_snapshot) : null,
      graceDaysSnapshot: Number(row.grace_days_snapshot),
      branchScopeSnapshot: row.branch_scope_snapshot,
      selectedBranchIds: toNumberArray(row.selected_branch_ids),
      currency: row.currency,
      totalAmount: Number(row.total_amount),
      commissionRateTypeSnapshot: row.commission_rate_type_snapshot,
      commissionRateValueSnapshot: row.commission_rate_value_snapshot != null ? Number(row.commission_rate_value_snapshot) : null,
      commissionAmount: Number(row.commission_amount),
      orgNetAmount: Number(row.org_net_amount),
      paymentStatus: row.payment_status,
      paymentMethod: row.payment_method,
      invoiceId: row.invoice_id != null ? Number(row.invoice_id) : null,
      components: components.map((c) => ({
        code: c.component_code, name: c.component_name, category: c.category,
        quantity: Number(c.quantity), unitAmount: Number(c.unit_amount),
        totalAmount: Number(c.total_amount), isRequired: Number(c.is_required_at_purchase) === 1,
      })),
      createdAt: row.created_at,
    };
  },
};