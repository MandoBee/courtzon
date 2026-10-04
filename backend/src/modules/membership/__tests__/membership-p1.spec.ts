import { describe, it, expect } from 'vitest';
import {
  computeComponentTotal,
  computeCommission,
  computeGraceUntil,
  computeSubscriptionEndDate,
  monthsPerDuration,
} from '../domain/membership-p1.types.js';
import {
  PlanVersionP1Schema,
  PurchaseSubscriptionP1Schema,
  CreateMembershipPlanP1Schema,
} from '../presentation/membership-p1.dto.js';

const components = (overrides: Record<string, unknown>[] = []) => [
  { code: 'membership', name: 'Membership fee', amount: 2000, quantity: 1, isRequired: true, sortOrder: 0 },
  { code: 'facilities', name: 'Facilities', amount: 200, quantity: 1, isRequired: true, sortOrder: 1 },
  { code: 'donation', name: 'Donation', amount: 100, quantity: 1, isRequired: false, sortOrder: 2 },
  ...overrides,
];

describe('G11.22 P1 — membership domain invariants', () => {
  it('monthsPerDuration maps the four supported durations', () => {
    expect(monthsPerDuration('monthly')).toBe(1);
    expect(monthsPerDuration('quarterly')).toBe(3);
    expect(monthsPerDuration('semi_annual')).toBe(6);
    expect(monthsPerDuration('annual')).toBe(12);
  });

  it('component total = sum(quantity × amount)', () => {
    expect(computeComponentTotal(components())).toBe(2300);
    expect(computeComponentTotal([{ code: 'x', name: 'x', amount: 0, quantity: 1, isRequired: true, sortOrder: 0 }])).toBe(0);
  });

  it('commission is on the TOTAL (never per component) — percentage and fixed', () => {
    expect(computeCommission('percentage', 5, 2300)).toBe(115);
    expect(computeCommission('fixed', 300, 2300)).toBe(300);
    expect(computeCommission(null, null, 2300)).toBe(0);
  });

  it('anniversary end dates: monthly / quarterly / semi-annual / annual', () => {
    expect(computeSubscriptionEndDate('2026-03-15', 'monthly', 1, 'anniversary')).toBe('2026-04-14');
    expect(computeSubscriptionEndDate('2026-03-15', 'quarterly', 1, 'anniversary')).toBe('2026-06-14');
    expect(computeSubscriptionEndDate('2026-03-15', 'semi_annual', 1, 'anniversary')).toBe('2026-09-14');
    expect(computeSubscriptionEndDate('2026-03-15', 'annual', 1, 'anniversary')).toBe('2027-03-14');
  });

  it('fixed_date end date runs to the next fixed occurrence after start', () => {
    // Fixed renewal 01/01: starting 2026-03-15 → ends 2026-12-31.
    expect(computeSubscriptionEndDate('2026-03-15', 'annual', 1, 'fixed_date', 1, 1)).toBe('2026-12-31');
    // Starting before the fixed date in the same year → same year's fixed date.
    expect(computeSubscriptionEndDate('2026-06-01', 'annual', 1, 'fixed_date', 10, 1)).toBe('2026-09-30');
  });

  it('grace until = end date + grace days', () => {
    expect(computeGraceUntil('2027-03-14', 15)).toBe('2027-03-29');
    expect(computeGraceUntil('2027-03-14', 0)).toBeNull();
  });
});

describe('G11.22 P1 — DTO validation (strict)', () => {
  const baseVersion = {
    durationType: 'annual',
    renewalModel: 'anniversary',
    initialChargeType: 'full',
    graceDays: 0,
    branchScope: 'ALL',
    allowedPaymentMethods: ['cash', 'card'],
    currency: 'EGP',
    components: components(),
  };

  it('accepts a valid version', () => {
    expect(PlanVersionP1Schema.parse(baseVersion).durationType).toBe('annual');
  });

  it('rejects an invalid duration', () => {
    expect(() => PlanVersionP1Schema.parse({ ...baseVersion, durationType: 'weekly' })).toThrow();
  });

  it('rejects an out-of-range initial percentage', () => {
    expect(() => PlanVersionP1Schema.parse({ ...baseVersion, initialChargeType: 'percentage', initialChargePercent: 150 })).toThrow();
  });

  it('rejects a version with no components', () => {
    expect(() => PlanVersionP1Schema.parse({ ...baseVersion, components: [] })).toThrow();
  });

  it('rejects an unsupported payment method', () => {
    expect(() => PlanVersionP1Schema.parse({ ...baseVersion, allowedPaymentMethods: ['cheque'] })).toThrow();
  });

  it('rejects an invalid purchase payment method', () => {
    expect(() => PurchaseSubscriptionP1Schema.parse({ planVersionId: 1, paymentMethod: 'cheque' })).toThrow();
    expect(PurchaseSubscriptionP1Schema.parse({ planVersionId: 1, paymentMethod: 'cash' }).paymentMethod).toBe('cash');
  });

  it('rejects a plan without a name', () => {
    expect(() => CreateMembershipPlanP1Schema.parse({ name: '  ' })).toThrow();
  });
});