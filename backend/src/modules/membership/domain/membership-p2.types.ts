/**
 * G11.22 P2 — Membership installments, cancellation/refund policy, renewal &
 * eligibility facts (pure domain — no DB, no framework).
 *
 * Approved P2 decisions encoded here:
 *   - FIRST installment activates the membership (sub.status = 'active').
 *   - Overdue installments never deactivate/freeze/suspend the membership and
 *     remain collectible after expiry.
 *   - Fixed CourtZon commission is allocated PROPORTIONALLY across installments
 *     using installment_amount / original_subscription_total (residual on the
 *     last installment so Σ allocation == snapshot commission exactly).
 *   - Percentage commission follows the P1 model (computed on the total).
 *   - Cancellation and refund are SEPARATE operations; cancellation without an
 *     actual configured refund generates NO reversal accounting.
 *   - One invoice covers the FULL subscription amount; installments are payment
 *     obligations against that invoice.
 */

export const INSTALLMENT_STATUSES = ['pending', 'paid', 'overdue', 'voided', 'refunded'] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

// ── Organisation cancellation/refund policy (approved decision #7/#15/#16) ──

export const REFUND_TYPES = ['none', 'full', 'proportional', 'before_start_only'] as const;
export type RefundType = (typeof REFUND_TYPES)[number];

export interface MembershipCancellationRefundPolicy {
  cancellation: {
    /** Void future unpaid (pending) installments when the subscription is cancelled. */
    void_future_unpaid: boolean;
  };
  refund: {
    type: RefundType;
    /** Only meaningful when type = 'before_start_only' (days of tolerance). */
    window_days_before_start: number;
  };
}

export function defaultCancellationRefundPolicy(): MembershipCancellationRefundPolicy {
  return {
    cancellation: { void_future_unpaid: true },
    refund: { type: 'none', window_days_before_start: 0 },
  };
}

export function normalizeCancellationRefundPolicy(raw: unknown): MembershipCancellationRefundPolicy {
  const d = defaultCancellationRefundPolicy();
  if (!raw || typeof raw !== 'object') return d;
  const obj = raw as Record<string, any>;
  const cancellation = obj.cancellation && typeof obj.cancellation === 'object' ? (obj.cancellation as any) : {};
  const refund = obj.refund && typeof obj.refund === 'object' ? (obj.refund as any) : {};
  const type: RefundType = (REFUND_TYPES as readonly string[]).includes(String(refund.type))
    ? (refund.type as RefundType) : 'none';
  const window = Number(refund.window_days_before_start ?? d.refund.window_days_before_start);
  const result: MembershipCancellationRefundPolicy = {
    cancellation: {
      void_future_unpaid: typeof cancellation.void_future_unpaid === 'boolean'
        ? cancellation.void_future_unpaid : d.cancellation.void_future_unpaid,
    },
    refund: {
      type,
      window_days_before_start: Number.isFinite(window) && window >= 0 ? Math.floor(window) : 0,
    },
  };
  return result;
}

// ── Money rounding ────────────────────────────────────────────────────────

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ── Dates (UTC date-only arithmetic, mirrors membership-p1.types.ts) ───────

function toUtcDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDaysISO(iso: string, days: number): string {
  const d = toUtcDate(new Date(`${iso}T00:00:00Z`));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The day AFTER an inclusive end date (next subscription period start). */
export function dayAfter(iso: string): string {
  return addDaysISO(iso, 1);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isDateBefore(iso: string, referenceISO: string): boolean {
  return iso < referenceISO; // YYYY-MM-DD lexicographic == chronological
}

/**
 * `before_start_only` refund qualification (P2). A paid installment is
 * refundable ONLY while the refund still happens BEFORE the configured start
 * boundary: today <= startDate + windowDays (the boundary day itself AND the
 * tolerance window are INCLUDED — the membership has not yet taken effect).
 * Exactly at the boundary behaves consistently: allowed on the boundary day,
 * rejected strictly after it.
 */
export function isRefundableBeforeStart(todayISO: string, startDateISO: string, windowDays: number): boolean {
  const windowEnd = addDaysISO(startDateISO, windowDays);
  // allowed ⇔ today <= windowEnd ⇔ !(windowEnd < today)
  return !isDateBefore(windowEnd, todayISO);
}

// ── Commission allocation across installments (decision #8/#17/#18) ────────

export type CommissionRateType = 'percentage' | 'fixed';

/**
 * Allocate the subscription CourtZon commission across installment amounts.
 *
 * fixed:      prop_i = round2(fixed * amount_i / total) for i < n;
 *             last_i = fixed − Σ previous (residual) ⇒ Σ == fixed exactly.
 * percentage: each installment carries round2(amount_i * pct / 100) with the
 *             SAME residual rule on the last installment so
 *             Σ == round2(total * pct / 100) exactly (P1 model on the total).
 */
export function allocateInstallmentCommissions(
  rateType: CommissionRateType | null | undefined,
  rateValue: number | null | undefined,
  total: number,
  amounts: number[],
): number[] {
  if (!rateType || rateValue == null || !amounts.length || total <= 0) {
    return amounts.map(() => 0);
  }
  const n = amounts.length;
  const target = rateType === 'fixed'
    ? round2(rateValue)
    : round2(total * rateValue / 100);
  const allocated: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      allocated.push(round2(target - sum));
    } else if (rateType === 'fixed') {
      const part = round2(target * amounts[i] / total);
      allocated.push(part);
      sum += part;
    } else {
      const part = round2(amounts[i] * rateValue / 100);
      allocated.push(part);
      sum += part;
    }
  }
  return allocated;
}

/** Example from decision #8 verification: 100 on 2000 split 1000/600/400 → 50/30/20. */
export function verifyProportionalAllocationExample(): number[] {
  return allocateInstallmentCommissions('fixed', 100, 2000, [1000, 600, 400]);
}

// ── Installment schedule generation ─────────────────────────────────────────

export interface InstallmentTemplateInput {
  seq: number;
  amount: number;
  dueOffsetDays: number;
}

export interface GeneratedInstallment {
  seq: number;
  amount: number;
  commissionAmount: number;
  dueDate: string;
  currency: string;
}

/**
 * Build the per-subscription installment schedule at purchase/renewal.
 * The template amounts must sum to the subscription total (service validates);
 * due dates are startDate + due_offset_days.
 */
export function buildInstallmentSchedule(
  templates: InstallmentTemplateInput[],
  rateType: CommissionRateType | null | undefined,
  rateValue: number | null | undefined,
  total: number,
  startDate: string,
  currency: string,
): GeneratedInstallment[] {
  const ordered = [...templates].sort((a, b) => a.seq - b.seq);
  const amounts = ordered.map((t) => round2(t.amount));
  const commissions = allocateInstallmentCommissions(rateType, rateValue, total, amounts);
  return ordered.map((t, idx) => ({
    seq: t.seq,
    amount: amounts[idx],
    commissionAmount: commissions[idx],
    dueDate: addDaysISO(startDate, Number(t.dueOffsetDays) || 0),
    currency,
  }));
}

// ── Subscription eligibility facts (decision #2 — overdue never deactivates) ─

export interface MembershipEligibilityFacts {
  subscriptionId: number;
  status: string;
  paymentStatus: string;
  inGrace: boolean;
  eligible: boolean; // active (incl. grace) ONLY — no booking/academy/… enforcement
  overdueCount: number;
  paidAmount: number;
  outstandingAmount: number;
  endDate: string | null;
  graceUntil: string | null;
}

/**
 * Membership is eligible while status == 'active'. Grace is a DERIVED window
 * (end_date < today <= grace_until); being inside or past grace never changes
 * the stored status — only the derived facts. `eligible` stays true through the
 * grace window (decision #2/#5: renewal during grace is allowed).
 */
export function deriveEligibility(input: {
  subscriptionId: number;
  status: string;
  paymentStatus: string;
  endDate: string | null;
  graceUntil: string | null;
  installments: Array<{ amount: number; commissionAmount: number; status: string }>;
}): MembershipEligibilityFacts {
  const today = todayISO();
  const endDate = input.endDate;
  const graceUntil = input.graceUntil;
  const inGrace = input.status === 'active'
    && !!endDate && isDateBefore(endDate, today)
    && !!graceUntil && !isDateBefore(graceUntil, today);
  const paidAmount = input.installments
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + round2(i.amount), 0);
  const outstandingAmount = input.installments
    .filter((i) => i.status === 'pending' || i.status === 'overdue')
    .reduce((s, i) => s + round2(i.amount), 0);
  const overdueCount = input.installments.filter((i) => i.status === 'overdue').length;
  return {
    subscriptionId: Number(input.subscriptionId),
    status: input.status,
    paymentStatus: input.paymentStatus,
    inGrace,
    eligible: input.status === 'active',
    overdueCount,
    paidAmount: round2(paidAmount),
    outstandingAmount: round2(outstandingAmount),
    endDate,
    graceUntil,
  };
}