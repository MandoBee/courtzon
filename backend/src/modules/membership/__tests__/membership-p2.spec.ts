import { describe, it, expect } from 'vitest';
import {
  allocateInstallmentCommissions,
  verifyProportionalAllocationExample,
  buildInstallmentSchedule,
  deriveEligibility,
  normalizeCancellationRefundPolicy,
  defaultCancellationRefundPolicy,
  round2,
  addDaysISO,
  isRefundableBeforeStart,
} from '../domain/membership-p2.types.js';

describe('G11.22 P2 — commission allocation (decisions #8/#17/#18)', () => {
  it('FIXED commission is allocated proportionally → 100 on 2000 split 1000/600/400 = 50/30/20', () => {
    expect(verifyProportionalAllocationExample()).toEqual([50, 30, 20]);
  });

  it('fixed allocation always sums exactly to the snapshot fixed amount (residual on last)', () => {
    // Non-exact thirds still sum exactly to 100.
    const alloc = allocateInstallmentCommissions('fixed', 100, 2000, [667, 667, 666]);
    expect(round2(alloc.reduce((s, a) => s + a, 0))).toBe(100);
  });

  it('PERCENTAGE follows the P1 model and sums to round2(total × pct / 100)', () => {
    const alloc = allocateInstallmentCommissions('percentage', 5, 2000, [1000, 600, 400]);
    // 5% on each installment: 50 / 30 / 20 with residual on the last.
    expect(alloc).toEqual([50, 30, 20]);
    expect(round2(alloc.reduce((s, a) => s + a, 0))).toBe(100);
  });

  it('no rate → zero commissions', () => {
    expect(allocateInstallmentCommissions(null, null, 2000, [1000, 1000])).toEqual([0, 0]);
  });

  it('single installment (full payment shape) carries the whole commission', () => {
    expect(allocateInstallmentCommissions('fixed', 100, 2000, [2000])).toEqual([100]);
  });
});

describe('G11.22 P2 — installment schedule generation', () => {
  it('builds due dates from start + offset and carries allocated commissions', () => {
    const schedule = buildInstallmentSchedule(
      [
        { seq: 1, amount: 1000, dueOffsetDays: 0 },
        { seq: 2, amount: 600, dueOffsetDays: 30 },
        { seq: 3, amount: 400, dueOffsetDays: 60 },
      ],
      'fixed', 100, 2000, '2026-10-04', 'EGP',
    );
    expect(schedule).toEqual([
      { seq: 1, amount: 1000, commissionAmount: 50, dueDate: '2026-10-04', currency: 'EGP' },
      { seq: 2, amount: 600, commissionAmount: 30, dueDate: '2026-11-03', currency: 'EGP' },
      { seq: 3, amount: 400, commissionAmount: 20, dueDate: '2026-12-03', currency: 'EGP' },
    ]);
  });

  it('addDaysISO adds days across month boundaries', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysISO('2026-12-15', 20)).toBe('2027-01-04');
  });
});

describe('G11.22 P2 — eligibility facts (decision #2: overdue never deactivates)', () => {
  const base = {
    subscriptionId: 1,
    status: 'active',
    paymentStatus: 'partially_paid',
    endDate: '2026-12-31',
    graceUntil: null,
    installments: [
      { amount: 1000, commissionAmount: 50, status: 'paid' },
      { amount: 600, commissionAmount: 30, status: 'overdue' },
      { amount: 400, commissionAmount: 20, status: 'pending' },
    ],
  };

  it('active with an overdue installment remains ELIGIBLE with overdueCount = 1', () => {
    const facts = deriveEligibility(base);
    expect(facts.eligible).toBe(true);
    expect(facts.overdueCount).toBe(1);
    expect(facts.paidAmount).toBe(1000);
    expect(facts.outstandingAmount).toBe(1000);
  });

  it('derives the GRACE window without changing status; eligible stays true', () => {
    const facts = deriveEligibility({
      ...base,
      endDate: '2026-10-01', // in the past
      graceUntil: '2026-10-10', // still open
    });
    expect(facts.inGrace).toBe(true);
    expect(facts.eligible).toBe(true);
    expect(facts.status).toBe('active');
  });

  it('expired status is never eligible', () => {
    const facts = deriveEligibility({ ...base, status: 'expired' });
    expect(facts.eligible).toBe(false);
    expect(facts.inGrace).toBe(false);
  });
});

describe('G11.22 P2 — cancellation/refund policy normalization (#15/#16)', () => {
  it('absent/null policy → default (void_future_unpaid true, refund none)', () => {
    const p = normalizeCancellationRefundPolicy(null);
    expect(p.cancellation.void_future_unpaid).toBe(true);
    expect(p.refund.type).toBe('none');
    expect(defaultCancellationRefundPolicy()).toEqual(p);
  });

  it('parses a valid full-refund policy', () => {
    const p = normalizeCancellationRefundPolicy({
      cancellation: { void_future_unpaid: false },
      refund: { type: 'full', window_days_before_start: 0 },
    });
    expect(p.cancellation.void_future_unpaid).toBe(false);
    expect(p.refund.type).toBe('full');
  });

  it('invalid refund type falls back to none (fail-safe)', () => {
    const p = normalizeCancellationRefundPolicy({ refund: { type: 'nonsense' } });
    expect(p.refund.type).toBe('none');
  });
});

describe('G11.22 P2 — before_start_only boundary predicate (blocker fix)', () => {
  const START = '2026-10-04';

  it('BEFORE membership start → refund ALLOWED', () => {
    expect(isRefundableBeforeStart('2026-10-03', START, 0)).toBe(true);
    expect(isRefundableBeforeStart('2026-09-01', START, 0)).toBe(true);
  });

  it('EXACTLY at the start boundary (window 0) → refund allowed (consistent policy)', () => {
    expect(isRefundableBeforeStart(START, START, 0)).toBe(true);
  });

  it('AFTER membership start (window 0) → refund REJECTED', () => {
    expect(isRefundableBeforeStart('2026-10-05', START, 0)).toBe(false);
    expect(isRefundableBeforeStart('2027-01-01', START, 0)).toBe(false);
  });

  it('tolerance window includes the window boundary day and rejects the day after', () => {
    const W = 3;
    expect(isRefundableBeforeStart('2026-10-06', START, W)).toBe(true); // before boundary
    expect(isRefundableBeforeStart('2026-10-07', START, W)).toBe(true); // EXACTLY window end
    expect(isRefundableBeforeStart('2026-10-08', START, W)).toBe(false); // one day after
  });

  it('window 0 boundary is consistent with addDaysISO(start, 0) === start', () => {
    expect(addDaysISO(START, 0)).toBe(START);
    expect(isRefundableBeforeStart(START, START, 0)).toBe(true);
  });
});