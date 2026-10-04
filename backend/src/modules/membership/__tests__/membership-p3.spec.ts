import { describe, it, expect } from 'vitest';
import {
  clampDayOfMonth,
  fixedDateISO,
  calendarDaysInclusive,
  fixedBoundaryAtOrBefore,
  fixedBoundaryAfter,
  computeFixedTermWindow,
  computeProratedInitialAmount,
  computeFirstTermAmount,
  scaleInstallmentTemplates,
} from '../domain/membership-p3.types.js';
import { computeSubscriptionEndDate } from '../domain/membership-p1.types.js';
import { buildInstallmentSchedule, round2 } from '../domain/membership-p2.types.js';
import { entitlementOwnsSource } from '../../financial/domain/financial-entitlement-aggregate.js';

describe('G11.22 P3 — fixed-date cycle math', () => {
  it('clamps fixed day 29/30/31 to the last valid day (rule: 29/30/31 clamp)', () => {
    expect(clampDayOfMonth(2026, 2, 29)).toBe(28); // non-leap Feb
    expect(clampDayOfMonth(2028, 2, 29)).toBe(29); // leap Feb
    expect(clampDayOfMonth(2026, 4, 31)).toBe(30); // April
    expect(clampDayOfMonth(2026, 1, 31)).toBe(31);
    expect(fixedDateISO(2026, 2, 29)).toBe('2026-02-28');
    expect(fixedDateISO(2028, 2, 29)).toBe('2028-02-29');
  });

  it('calendar days are inclusive of both ends', () => {
    expect(calendarDaysInclusive('2026-01-01', '2026-12-31')).toBe(365);
    expect(calendarDaysInclusive('2026-01-01', '2026-01-01')).toBe(1);
  });

  it('boundaries step in calendar years', () => {
    expect(fixedBoundaryAtOrBefore('2026-07-02', 1, 1)).toBe('2026-01-01');
    expect(fixedBoundaryAtOrBefore('2026-01-01', 1, 1)).toBe('2026-01-01');
    expect(fixedBoundaryAfter('2026-07-02', 1, 1)).toBe('2027-01-01');
    expect(fixedBoundaryAfter('2026-01-01', 1, 1)).toBe('2027-01-01');
  });
});

describe('G11.22 P3 — proration (approved formula: daily, round2, remaining ≤ 0 ⇒ full next cycle)', () => {
  const PRICE = 2000;
  const m = 1; // annual 01-01 cycle
  const d = 1;

  it('join exactly ON the boundary ⇒ FULL price', () => {
    const w = computeFixedTermWindow('2026-01-01', m, d);
    expect(w.isFullTerm).toBe(true);
    const r = computeFirstTermAmount({}, PRICE, w);
    expect(r.amount).toBe(2000);
    expect(r.prorated).toBe(false);
  });

  it('mid-cycle join 2026-07-02 ⇒ 1002.74 (183/365 of 2000)', () => {
    const w = computeFixedTermWindow('2026-07-02', m, d);
    expect(w.isFullTerm).toBe(false);
    expect(w.fullCycleDays).toBe(365);
    expect(w.remainingDays).toBe(183);
    expect(w.termEnd).toBe('2026-12-31');
    expect(computeProratedInitialAmount(PRICE, w.fullCycleDays, w.remainingDays)).toBe(1002.74);
    expect(computeFirstTermAmount({}, PRICE, w).amount).toBe(1002.74);
  });

  it('join on the LAST day (2026-12-31) ⇒ 5.48 (1/365)', () => {
    const w = computeFixedTermWindow('2026-12-31', m, d);
    expect(w.remainingDays).toBe(1);
    expect(computeProratedInitialAmount(PRICE, w.fullCycleDays, w.remainingDays)).toBe(5.48);
  });

  it('LEAP-containing cycle (03-01 boundary, 2027): 365/366 × 2000 = 1994.54', () => {
    const w = computeFixedTermWindow('2027-03-02', 3, 1);
    expect(w.fullCycleDays).toBe(366); // cycle Mar-2027..Feb-2028 contains 29-Feb-2028
    expect(w.remainingDays).toBe(365);
    expect(w.termEnd).toBe('2028-02-29');
    expect(computeProratedInitialAmount(PRICE, w.fullCycleDays, w.remainingDays)).toBe(1994.54);
  });

  it('remaining ≤ 0 never occurs (boundary join = full); helper guards fullCycleDays ≤ 0', () => {
    expect(computeProratedInitialAmount(PRICE, 0, 0)).toBe(PRICE);
  });

  it('initial_charge_percent applies to the FULL cycle price, NOT the prorated amount (rule)', () => {
    const w = computeFixedTermWindow('2026-07-02', m, d); // partial, prorated 1002.74
    const r = computeFirstTermAmount({ initialChargeType: 'percentage', initialChargePercent: 50 }, PRICE, w);
    expect(r.amount).toBe(1000); // 50% of FULL 2000, not 50% of 1002.74
    expect(r.amount).not.toBe(501.37);
  });

  it('first term amount is deterministic and proration is exact', () => {
    const w = computeFixedTermWindow('2026-07-02', m, d);
    const once = computeFirstTermAmount({}, PRICE, w).amount;
    const twice = computeFirstTermAmount({}, PRICE, w).amount;
    expect(once).toBe(twice);
  });

  it('scaleInstallmentTemplates preserves the Σ == newTotal invariant (residual on last)', () => {
    const scaled = scaleInstallmentTemplates([
      { seq: 1, amount: 1000, dueOffsetDays: 0 },
      { seq: 2, amount: 600, dueOffsetDays: 30 },
      { seq: 3, amount: 400, dueOffsetDays: 60 },
    ], 1400);
    expect(scaled.reduce((s, t) => s + t.amount, 0)).toBe(1400);
    expect(scaled.map((t) => t.seq)).toEqual([1, 2, 3]);
    // Unchanged when totals already match.
    const same = scaleInstallmentTemplates([{ seq: 1, amount: 500, dueOffsetDays: 0 }], 500);
    expect(same[0].amount).toBe(500);
  });

  it('prorated fixed-date cycle with installments: Σ installments == prorated total AND Σ commission == commission(prorated total)', () => {
    const window = computeFixedTermWindow('2026-07-02', 1, 1);
    const proratedTotal = computeFirstTermAmount({}, 2000, window).amount; // 1002.74
    const templates = scaleInstallmentTemplates([
      { seq: 1, amount: 1000, dueOffsetDays: 0 },
      { seq: 2, amount: 600, dueOffsetDays: 30 },
      { seq: 3, amount: 400, dueOffsetDays: 60 },
    ], proratedTotal);
    const schedule = buildInstallmentSchedule(templates, 'fixed', 100, proratedTotal, '2026-07-02', 'EGP');
    expect(round2(schedule.reduce((s, i) => s + i.amount, 0))).toBe(proratedTotal);
    // Fixed commission target is the FULL fixed amount (100) — allocated
    // proportionally across the prorated installments, with the residual rule.
    expect(round2(schedule.reduce((s, i) => s + i.commissionAmount, 0))).toBe(100);
    expect(schedule.length).toBe(3);
  });
});

describe('G11.22 P3 — metadata-aware entitlement ownership predicate (approved #4)', () => {
  const instRow = (id: number, subId: number) => ({ source_id: id, metadata: { subscriptionId: subId, installmentId: id } });
  const subRow = (id: number) => ({ source_id: id, metadata: { subscriptionId: id, installmentId: null } });

  it('installment scope matches the SAME installment only', () => {
    expect(entitlementOwnsSource(instRow(7, 100), { installmentId: 7 }, 7)).toBe(true);
    expect(entitlementOwnsSource(instRow(8, 100), { installmentId: 7 }, 7)).toBe(false);
  });

  it('subscription scope matches the SAME subscription only (and never an installment row)', () => {
    expect(entitlementOwnsSource(subRow(7), { subscriptionId: 7 }, 7)).toBe(true);
    // numeric collision: an installment row whose id equals the subscriptionId
    expect(entitlementOwnsSource(instRow(7, 414), { subscriptionId: 7 }, 7)).toBe(false);
    expect(entitlementOwnsSource(subRow(9), { subscriptionId: 7 }, 7)).toBe(false);
  });

  it('source_id mismatch is never owned', () => {
    expect(entitlementOwnsSource(subRow(7), { subscriptionId: 99 }, 7)).toBe(false);
  });
});

describe('G11.22 P3 — computeSubscriptionEndDate fixed-date clamp (regression guard)', () => {
  it('Feb 29 on a non-leap year clamps instead of rolling into March', () => {
    // start Jan 2026 with a 29-Feb fixed cycle → boundary clamps to 2026-02-28,
    // and the inclusive term ends the day before it: 2026-02-27.
    expect(computeSubscriptionEndDate('2026-01-01', 'annual', 1, 'fixed_date', 2, 29)).toBe('2026-02-27');
  });

  it('leap year retains the full Feb 29 boundary', () => {
    expect(computeSubscriptionEndDate('2028-01-01', 'annual', 1, 'fixed_date', 2, 29)).toBe('2028-02-28');
  });
});