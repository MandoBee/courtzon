import { recordAudit } from '../../audit-log/index.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { getCommissionRate, clearSubscriptionCache } from '../../organisations/application/current-subscription.service.js';
import { membershipP1Repository } from '../infrastructure/repositories/membership-p1.repository.js';
import { membershipP2Repository } from '../infrastructure/repositories/membership-p2.repository.js';
import {
  computeComponentTotal, computeCommission, computeGraceUntil, computeSubscriptionEndDate,
} from '../domain/membership-p1.types.js';
import {
  buildInstallmentSchedule, dayAfter, round2, todayISO,
} from '../domain/membership-p2.types.js';
import { notFoundError, conflictError, validationError } from './membership-p1.errors.js';

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

/**
 * G11.22 P2 — membership RENEWAL (approved decisions #3/#5/#6/#7/#8).
 *
 *   * Renewal is allowed even when the OLD subscription has overdue
 *     installments and/or is inside its grace window.
 *   * Renewal creates a NEW subscription: fresh snapshot, current effective
 *     plan version, FULL current price, NEW installment schedule, NEW
 *     commission snapshot, `renewal_of_subscription_id` → the old one.
 *   * Overdue balances NEVER merge into the new subscription — they stay on
 *     the old subscription and remain collectible (decision #3).
 *   * Historical snapshots stay immutable; the old subscription is untouched
 *     (its historical expiry date is never changed).
 */
export const membershipRenewalService = {

  /**
   * Renew `subscriptionId`. The new subscription starts the day AFTER the old
   * period's inclusive end date (anniversary), or per the current effective
   * version's terms. Post-creation, payment/activation follows the SAME P1/P2
   * purchase rules (full payment or first-installment activation).
   */
  async renewSubscription(orgId: number, subscriptionId: number, actorId: number, paymentMethod: 'cash' | 'card' = 'card'): Promise<{ subscriptionId: number; paymentId: number; totalAmount: number }> {
    const old = await membershipP1Repository.findSubscription(subscriptionId);
    if (!old || Number(old.organisation_id) !== orgId) throw notFoundError('Membership subscription');

    // Renewal eligibility: active (incl. grace window) or already expired.
    if (!['active', 'expired'].includes(old.status)) {
      throw conflictError(`Subscription is '${old.status}' and cannot be renewed`);
    }

    // Duplicate renewal prevention (service-level transactional guarantee).
    const open = await membershipP2Repository.countOpenRenewals(subscriptionId);
    if (open > 0) throw conflictError('This subscription already has an open renewal');

    const userId = Number(old.user_id);
    const planId = Number(old.plan_id);
    const currency = String(old.currency || 'EGP');
    const startDate = dayAfter(String(old.end_date instanceof Date ? old.end_date.toISOString().slice(0, 10) : String(old.end_date ?? todayISO()).slice(0, 10)));

    // Effective plan version AT the renewal date (decision #7).
    const version = await membershipP2Repository.findEffectivePlanVersion(planId, startDate);
    if (!version) {
      throw conflictError('No active plan version is available for renewal — contact the organisation');
    }
    const plan = await membershipP1Repository.findPlanById(planId);
    if (!plan || Number(plan.organisation_id) !== orgId) throw notFoundError('Membership plan');

    const components = await membershipP1Repository.listComponentsByVersionId(Number(version.id));
    if (!components.length) throw validationError('The current plan version has no components');

    // FULL current price (never a mid-cycle prorated price).
    const totalAmount = computeComponentTotal(components.map((c) => ({
      code: c.code, name: c.name, category: c.category, amount: Number(c.amount),
      quantity: Number(c.quantity), isRequired: Number(c.is_required) === 1, sortOrder: Number(c.sort_order),
    })));

    // FRESH commission snapshot at renewal (never the old snapshot).
    clearSubscriptionCache();
    const rate = await getCommissionRate(orgId, 'membership');
    const commissionAmount = computeCommission(rate?.rateType, rate?.rate ?? 0, totalAmount);
    const orgNetAmount = round2(totalAmount - commissionAmount);
    const endDate = computeSubscriptionEndDate(
      startDate, version.duration_type, Number(version.duration_periods), version.renewal_model,
      version.fixed_renewal_month != null ? Number(version.fixed_renewal_month) : null,
      version.fixed_renewal_day != null ? Number(version.fixed_renewal_day) : null,
    );
    const graceUntil = computeGraceUntil(endDate, Number(version.grace_days));
    const branchIds = version.branch_scope === 'SELECTED'
      ? await membershipP1Repository.listBranchIdsByVersionId(Number(version.id))
      : [];

    // NEW installment schedule from the current version's template.
    const installmentsEnabled = Number(version.installments_enabled) === 1;
    const templates = installmentsEnabled ? await membershipP2Repository.listInstallmentTemplates(Number(version.id)) : [];
    let schedule: Array<{ seq: number; amount: number; commissionAmount: number; dueDate: string; currency: string }> = [];
    if (templates.length > 0) {
      const tpl = templates.map((t) => ({ seq: Number(t.seq), amount: Number(t.amount), dueOffsetDays: Number(t.due_offset_days) }));
      const sum = round2(tpl.reduce((s, t) => s + round2(t.amount), 0));
      if (Math.abs(sum - totalAmount) >= 0.01) {
        throw validationError(`Renewal installment template amounts (${sum}) must equal the subscription total (${totalAmount})`);
      }
      schedule = buildInstallmentSchedule(tpl, rate?.rateType, rate?.rate ?? 0, totalAmount, startDate, currency);
    }

    const renewedId = await membershipP2Repository.createRenewedSubscription({
      organisationId: orgId,
      userId,
      planId,
      planVersionId: Number(version.id),
      renewalOfSubscriptionId: subscriptionId,
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
      currency,
      totalAmount,
      commissionRateType: rate?.rateType ?? null,
      commissionRateValue: rate?.rate ?? 0,
      commissionAmount,
      orgNetAmount,
      paymentMethod,
      actorId,
      components: components.map((c) => ({
        code: c.code, name: c.name, category: c.category, quantity: Number(c.quantity),
        unitAmount: Number(c.amount), totalAmount: round2(Number(c.quantity) * Number(c.amount)),
        isRequired: Number(c.is_required) === 1, sortOrder: Number(c.sort_order),
      })),
      installments: schedule,
    });

    // Pending payment — full amount OR first installment.
    const paymentId = schedule.length
      ? await membershipP2Repository.createInstallmentPayment(userId, renewedId, schedule[0].amount, currency, paymentMethod, 1)
      : await membershipP1Repository.createPayment({
        userId, referenceId: renewedId, amount: totalAmount, currency, paymentMethod,
        gatewayProvider: paymentMethod === 'card' ? 'paymob' : null,
        gatewayReference: paymentMethod === 'card' ? `ms_${renewedId}_${Date.now()}` : null,
        idempotencyKey: `ms_${renewedId}`, status: 'pending',
      });

    recordAudit({
      actorId,
      action: 'MEMBERSHIP_SUBSCRIPTION.RENEWED',
      entityType: 'membership_subscription',
      entityId: renewedId,
      afterState: { renewedFrom: subscriptionId, subscriptionId: renewedId, totalAmount, startDate, endDate },
    });

    eventBusV2.emit('membership:renewal-completed', {
      subscriptionId: renewedId, renewalOfSubscriptionId: subscriptionId, userId, organisationId: orgId,
      totalAmount, startDate, endDate, planVersionId: Number(version.id),
    } as Record<string, unknown>, {
      aggregateType: 'membership_subscription', aggregateId: String(renewedId), aggregateVersion: 1,
    });

    return { subscriptionId: renewedId, paymentId, totalAmount };
  },
};