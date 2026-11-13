import { describe, expect, it } from 'vitest';
import {
  assertAmounts,
  assertCaseTransition,
  deriveOperationalStatus,
  deriveOverallStatus,
  derivePayoutStatus,
  isTerminalCaseStatus,
} from '../domain/refund-case.aggregate.js';

describe('refund case aggregate — case state machine', () => {
  it('allows only the documented transitions', () => {
    expect(() => assertCaseTransition('REQUESTED', 'APPROVED')).not.toThrow();
    expect(() => assertCaseTransition('REQUESTED', 'UNDER_REVIEW')).not.toThrow();
    expect(() => assertCaseTransition('APPROVED', 'OPERATIONAL_PROCESSING')).not.toThrow();
    expect(() => assertCaseTransition('OPERATIONAL_PROCESSING', 'PAYOUT_PENDING')).not.toThrow();
    expect(() => assertCaseTransition('PAYOUT_PENDING', 'COMPLETED')).not.toThrow();
    expect(() => assertCaseTransition('PARTIALLY_COMPLETED', 'COMPLETED')).not.toThrow();
    expect(() => assertCaseTransition('FAILED', 'OPERATIONAL_PROCESSING')).not.toThrow();
  });

  it('rejects illegal transitions, including out of COMPLETED and REJECTED', () => {
    expect(() => assertCaseTransition('REQUESTED', 'COMPLETED')).toThrow(/Illegal refund case transition/);
    expect(() => assertCaseTransition('COMPLETED', 'PAYOUT_PENDING')).toThrow();
    expect(() => assertCaseTransition('REJECTED', 'APPROVED')).toThrow();
    expect(() => assertCaseTransition('PAYOUT_PENDING', 'OPERATIONAL_PROCESSING')).toThrow();
  });

  it('marks COMPLETED and REJECTED as terminal', () => {
    expect(isTerminalCaseStatus('COMPLETED')).toBe(true);
    expect(isTerminalCaseStatus('REJECTED')).toBe(true);
    expect(isTerminalCaseStatus('FAILED')).toBe(false);
  });
});

describe('refund case aggregate — amount invariants (integer cents)', () => {
  const base = {
    canceledValueCents: 10_000,
    approvedCents: 6_000,
    feeCents: 100,
    discountCents: 0,
    paidCents: 0,
  };

  it('accepts a valid partial refund', () => {
    expect(() => assertAmounts(base)).not.toThrow();
  });

  it('rejects a refund above the canceled service value', () => {
    expect(() => assertAmounts({ ...base, approvedCents: 10_001 })).toThrow(
      /cannot exceed the canceled service value/,
    );
  });

  it('rejects paid above approved', () => {
    expect(() => assertAmounts({ ...base, paidCents: 6_001 })).toThrow(
      /cannot exceed the approved refund/,
    );
  });

  it('rejects negative and non-integer cents', () => {
    expect(() => assertAmounts({ ...base, feeCents: -1 })).toThrow(/non-negative integer/);
    expect(() => assertAmounts({ ...base, approvedCents: 10.5 })).toThrow(/non-negative integer/);
  });
});

describe('refund case aggregate — derived statuses', () => {
  it('derives operational status from the lines', () => {
    expect(deriveOperationalStatus([])).toBe('FAILED');
    expect(deriveOperationalStatus(['COMPLETED', 'COMPLETED'])).toBe('COMPLETED');
    expect(deriveOperationalStatus(['COMPLETED', 'FAILED'])).toBe('FAILED');
    expect(deriveOperationalStatus(['COMPLETED', 'PROCESSING'])).toBe('PROCESSING');
  });

  it('derives payout status from the paid amount', () => {
    expect(derivePayoutStatus(6_000, 0)).toBe('PENDING');
    expect(derivePayoutStatus(6_000, 2_000)).toBe('PARTIALLY_COMPLETED');
    expect(derivePayoutStatus(6_000, 6_000)).toBe('COMPLETED');
  });

  it('never reports COMPLETED until cancellation and full payout are both done', () => {
    expect(
      deriveOverallStatus({
        operational: 'COMPLETED',
        payout: 'PENDING',
        approvedCents: 6_000,
        paidCents: 0,
      }),
    ).toBe('PAYOUT_PENDING');
    expect(
      deriveOverallStatus({
        operational: 'COMPLETED',
        payout: 'PARTIALLY_COMPLETED',
        approvedCents: 6_000,
        paidCents: 2_000,
      }),
    ).toBe('PARTIALLY_COMPLETED');
    expect(
      deriveOverallStatus({
        operational: 'PROCESSING',
        payout: 'COMPLETED',
        approvedCents: 6_000,
        paidCents: 6_000,
      }),
    ).toBe('OPERATIONAL_PROCESSING');
    expect(
      deriveOverallStatus({
        operational: 'COMPLETED',
        payout: 'COMPLETED',
        approvedCents: 6_000,
        paidCents: 6_000,
      }),
    ).toBe('COMPLETED');
    expect(
      deriveOverallStatus({
        operational: 'FAILED',
        payout: 'COMPLETED',
        approvedCents: 6_000,
        paidCents: 6_000,
      }),
    ).toBe('FAILED');
  });
});
