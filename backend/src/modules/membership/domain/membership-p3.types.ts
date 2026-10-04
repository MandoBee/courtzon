/**
 * G11.22 P3 — Fixed-date cycle math + proration (pure domain — no DB, no
 * framework, no date library).
 *
 * Approved rules (P3 decision gate):
 *   prorated = round2(periodPrice × remainingDays / periodDays)
 *   remaining = calendar days from join date through the fixed cycle end.
 *   If join >= fixed cycle end → the next cycle is a FULL cycle (full price).
 *   Fixed day 29/30/31 is clamped to the last valid day of the month.
 *   No additional rounding.
 *   initial_charge_percent is applied to the FULL cycle price (never the
 *   prorated amount).
 */
import { round2 } from './membership-p2.types.js';

/** Last valid day of a month (clamps 29/30/31). Returns the day-of-month. */
export function clampDayOfMonth(year: number, month1based: number, day: number): number {
  const lastDay = new Date(Date.UTC(year, month1based, 0)).getUTCDate(); // day 0 of next month
  return Math.max(1, Math.min(day, lastDay));
}

/** Clamped fixed date 'YYYY-MM-DD'. month1based 1..12, day clamped. */
export function fixedDateISO(year: number, month1based: number, day: number): string {
  const d = clampDayOfMonth(year, month1based, day);
  return new Date(Date.UTC(year, month1based - 1, d)).toISOString().slice(0, 10);
}

function utc(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getTime();
}

/** Calendar days between two dates, INCLUDING both ends. */
export function calendarDaysInclusive(startISO: string, endISO: string): number {
  return Math.round((utc(endISO) - utc(startISO)) / 86400000) + 1;
}

export function dayBefore(iso: string): string {
  return new Date(utc(iso) - 86400000).toISOString().slice(0, 10);
}

export function dayAfter(iso: string): string {
  return new Date(utc(iso) + 86400000).toISOString().slice(0, 10);
}

export function isSameOrAfter(iso: string, referenceISO: string): boolean {
  return iso >= referenceISO;
}

/**
 * The GREATEST fixed boundary <= `iso` (clamped). For an annual 01-01 cycle and
 * iso=2026-07-01 → 2026-01-01; iso=2027-01-01 → 2027-01-01.
 */
export function fixedBoundaryAtOrBefore(iso: string, month1based: number, day: number): string {
  const y = Number(iso.slice(0, 4));
  const thisYear = fixedDateISO(y, month1based, day);
  if (thisYear <= iso) return thisYear;
  return fixedDateISO(y - 1, month1based, day);
}

/** The SMALLEST fixed boundary > `iso` (clamped). */
export function fixedBoundaryAfter(iso: string, month1based: number, day: number): string {
  const y = Number(iso.slice(0, 4));
  const thisYear = fixedDateISO(y, month1based, day);
  if (thisYear > iso) return thisYear;
  return fixedDateISO(y + 1, month1based, day);
}

export interface FixedTermWindow {
  /** Join/start date of the first term (ISO). */
  startDate: string;
  /** Inclusive last day of the first term (= boundaryAfter(startDate) − 1 day). */
  termEnd: string;
  /** The boundary that BEGAN the current cycle (<= startDate). */
  cycleStartBoundary: string;
  /** Calendar days of a FULL cycle (boundary→boundary). */
  fullCycleDays: number;
  /** Calendar days the join actually spans inside the cycle (incl. both ends). */
  remainingDays: number;
  /** True when the join begins exactly on a cycle boundary → full term. */
  isFullTerm: boolean;
}

/**
 * Compute the first-term window for a fixed-date plan. A fixed-date term always
 * runs to the NEXT fixed boundary (one period), matching the established
 * behavior of `computeSubscriptionEndDate`. When the join is exactly ON a
 * boundary the first term is a FULL cycle (approved rule: join >= fixed cycle
 * end → next cycle as a full cycle).
 */
export function computeFixedTermWindow(
  startDate: string,
  month1based: number,
  day: number,
): FixedTermWindow {
  const nextBoundary = fixedBoundaryAfter(startDate, month1based, day);
  const termEnd = dayBefore(nextBoundary);
  const cycleStartBoundary = fixedBoundaryAtOrBefore(startDate, month1based, day);
  const fullCycleDays = calendarDaysInclusive(
    cycleStartBoundary,
    dayBefore(fixedBoundaryAfter(cycleStartBoundary, month1based, day)),
  );
  const remainingDays = calendarDaysInclusive(startDate, termEnd);
  const isFullTerm = remainingDays >= fullCycleDays;
  return { startDate, termEnd, cycleStartBoundary, fullCycleDays, remainingDays, isFullTerm };
}

/** Approved proration formula. */
export function computeProratedInitialAmount(periodPrice: number, fullCycleDays: number, remainingDays: number): number {
  if (fullCycleDays <= 0 || remainingDays <= 0) return round2(periodPrice);
  return round2(periodPrice * remainingDays / fullCycleDays);
}

export interface InitialChargePolicy {
  initialChargeType?: string | null;
  initialChargePercent?: number | null;
}

/**
 * First-term price for a fixed-date plan (approved rule):
 *   - full term → periodPrice
 *   - partial term with initialChargeType='percentage' → round2(periodPrice ×
 *     initialChargePercent / 100) applied to the FULL cycle price (never the
 *     prorated amount).
 *   - partial term otherwise → prorated amount.
 */
export function computeFirstTermAmount(
  policy: InitialChargePolicy,
  periodPrice: number,
  window: FixedTermWindow,
): { amount: number; prorated: boolean } {
  if (window.isFullTerm) return { amount: round2(periodPrice), prorated: false };
  if (policy.initialChargeType === 'percentage' && policy.initialChargePercent != null && policy.initialChargePercent > 0) {
    return { amount: round2(periodPrice * policy.initialChargePercent / 100), prorated: false };
  }
  return { amount: computeProratedInitialAmount(periodPrice, window.fullCycleDays, window.remainingDays), prorated: true };
}

/**
 * Scale an installment schedule so it sums EXACTLY to `newTotal` (residual on
 * the last installment — same residual rule as the commission allocator). Used
 * when a fixed-date partial first term prorates the subscription total while
 * the plan keeps the installment template amounts at the full-cycle level.
 */
export function scaleInstallmentTemplates(
  templates: Array<{ seq: number; amount: number; dueOffsetDays: number }>,
  newTotal: number,
): Array<{ seq: number; amount: number; dueOffsetDays: number }> {
  const current = round2(templates.reduce((s, t) => s + round2(t.amount), 0));
  if (current <= 0 || Math.abs(current - newTotal) < 0.01) return templates.map((t) => ({ ...t }));
  const ratio = newTotal / current;
  const scaled = templates.map((t) => ({ seq: t.seq, amount: round2(t.amount * ratio), dueOffsetDays: t.dueOffsetDays }));
  const diff = round2(newTotal) - round2(scaled.reduce((s, t) => s + t.amount, 0));
  if (scaled.length && Math.abs(diff) >= 0.01) {
    scaled[scaled.length - 1] = { ...scaled[scaled.length - 1], amount: round2(scaled[scaled.length - 1].amount + diff) };
  }
  return scaled;
}