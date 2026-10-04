/**
 * G11.22 P1 — Membership plan versioning + subscriptions.
 * Pure domain types and date/money helpers. No DB, no framework.
 *
 * A plan is mutable identity + lifecycle; a plan VERSION carries immutable
 * commercial terms; a membership SUBSCRIPTION snapshots the exact terms used
 * at purchase. P1 = FULL PAYMENT only; installments are flagged for P2.
 */

export const MEMBERSHIP_DURATIONS = ['monthly', 'quarterly', 'semi_annual', 'annual'] as const;
export type MembershipDuration = (typeof MEMBERSHIP_DURATIONS)[number];

export const PLAN_VERSION_STATUSES = ['draft', 'active', 'superseded', 'archived'] as const;
export type PlanVersionStatus = (typeof PLAN_VERSION_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ['pending', 'active', 'expired', 'cancelled', 'terminated'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const MEMBERSHIP_PAYMENT_METHODS = ['cash', 'card'] as const;
export type MembershipPaymentMethod = (typeof MEMBERSHIP_PAYMENT_METHODS)[number];

export type MembershipRenewalModel = 'anniversary' | 'fixed_date';
export type InitialChargeType = 'full' | 'percentage';
export type BranchScope = 'ALL' | 'SELECTED';
export type CommissionRateType = 'percentage' | 'fixed';

export interface PlanComponentInput {
  code: string;
  name: string;
  category?: string | null;
  amount: number;
  quantity: number;
  isRequired: boolean;
  sortOrder: number;
}

export interface PlanVersionInput {
  versionNo?: number;
  status?: PlanVersionStatus;
  effectiveFrom?: string | null;
  durationType: MembershipDuration;
  durationPeriods: number;
  renewalModel: MembershipRenewalModel;
  fixedRenewalMonth?: number | null;
  fixedRenewalDay?: number | null;
  initialChargeType: InitialChargeType;
  initialChargePercent?: number | null;
  graceDays: number;
  branchScope: BranchScope;
  branchIds: number[];
  allowedPaymentMethods: MembershipPaymentMethod[];
  currency: string;
  installmentsEnabled?: boolean;
  components: PlanComponentInput[];
}

/** Months per base duration unit (used for period math). */
export function monthsPerDuration(duration: MembershipDuration): number {
  switch (duration) {
    case 'monthly': return 1;
    case 'quarterly': return 3;
    case 'semi_annual': return 6;
    case 'annual': return 12;
  }
}

/** Sum of quantity × amount across components (subscription total). */
export function computeComponentTotal(components: PlanComponentInput[]): number {
  return Math.round(
    components.reduce((sum, c) => sum + c.quantity * c.amount, 0) * 100,
  ) / 100;
}

/** CourtZon commission on the TOTAL subscription amount (never per component). */
export function computeCommission(
  rateType: CommissionRateType | null | undefined,
  rateValue: number | null | undefined,
  total: number,
): number {
  if (!rateType || rateValue == null) return 0;
  if (rateType === 'fixed') return Math.round(rateValue * 100) / 100;
  return Math.round(total * rateValue) / 100;
}

function toUtcDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** G11.22 P3 — clamp 29/30/31 to the last valid day of the month (approved rule). */
export function clampDayOfMonthFixed(year: number, month1based: number, day: number): number {
  const lastDay = new Date(Date.UTC(year, month1based, 0)).getUTCDate();
  return Math.max(1, Math.min(day, lastDay));
}

/**
 * End date (inclusive period boundary — the day BEFORE the next period starts).
 * P1 stores the term; the full renewal engine (P3) refines fixed-cycle rules.
 */
export function computeSubscriptionEndDate(
  startISO: string,
  durationType: MembershipDuration,
  durationPeriods: number,
  renewalModel: MembershipRenewalModel,
  fixedRenewalMonth?: number | null,
  fixedRenewalDay?: number | null,
): string {
  const start = toUtcDate(new Date(`${startISO}T00:00:00Z`));
  const months = monthsPerDuration(durationType) * Math.max(1, durationPeriods);

  if (renewalModel === 'fixed_date' && fixedRenewalMonth && fixedRenewalDay) {
    // G11.22 P3 — the org-specific fixture (e.g. 31/12 vs per-plan) remains an
    // org configuration; the DATE MATH here is exact. Fixed day 29/30/31 is
    // CLAMPED to the last valid day of the month (never rolls into the next
    // month). The term runs to the NEXT occurrence of the fixed date after
    // start (or +1 year if start falls on the fixed date).
    const clamp = (y: number) => clampDayOfMonthFixed(y, fixedRenewalMonth, fixedRenewalDay ?? 1);
    let end = toUtcDate(new Date(Date.UTC(start.getUTCFullYear(), fixedRenewalMonth - 1, clamp(start.getUTCFullYear()))));
    if (end <= start) {
      end = toUtcDate(new Date(Date.UTC(start.getUTCFullYear() + 1, fixedRenewalMonth - 1, clamp(start.getUTCFullYear() + 1))));
    }
    end.setUTCDate(end.getUTCDate() - 1);
    return end.toISOString().slice(0, 10);
  }

  // Anniversary / period-based (monthly, quarterly, semi-annual, annual).
  const end = toUtcDate(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate())));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

export function computeGraceUntil(endDateISO: string, graceDays: number): string | null {
  if (!graceDays) return null;
  const end = toUtcDate(new Date(`${endDateISO}T00:00:00Z`));
  end.setUTCDate(end.getUTCDate() + graceDays);
  return end.toISOString().slice(0, 10);
}

/** Stable invoice number — unique per (org, subscription). */
export function buildMembershipInvoiceNumber(orgId: number, subscriptionId: number): string {
  return `MS-${orgId}-${subscriptionId}`;
}