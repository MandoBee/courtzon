import { describe, it, expect } from 'vitest';
import {
  assertValidTransition,
  isTerminal,
  planTransition,
  validateAmount,
  type EntitlementStatus,
} from '../domain/financial-entitlement-aggregate.js';

describe('Financial Entitlement Aggregate — State machine', () => {
  const VALID_TRANSITIONS: [EntitlementStatus, EntitlementStatus][] = [
    ['PENDING', 'AVAILABLE'],
    ['PENDING', 'CANCELLED'],
    ['AVAILABLE', 'ON_HOLD'],
    ['AVAILABLE', 'SETTLED'],
    ['AVAILABLE', 'CANCELLED'],
    ['ON_HOLD', 'AVAILABLE'],
    ['ON_HOLD', 'CANCELLED'],
  ];

  const FORBIDDEN_TRANSITIONS: [EntitlementStatus, EntitlementStatus][] = [
    ['PENDING', 'ON_HOLD'],
    ['PENDING', 'SETTLED'],
    ['AVAILABLE', 'PENDING'],
    ['ON_HOLD', 'SETTLED'],
    ['ON_HOLD', 'PENDING'],
    ['SETTLED', 'PENDING'],
    ['SETTLED', 'AVAILABLE'],
    ['SETTLED', 'ON_HOLD'],
    ['SETTLED', 'CANCELLED'],
    ['CANCELLED', 'PENDING'],
    ['CANCELLED', 'AVAILABLE'],
    ['CANCELLED', 'ON_HOLD'],
    ['CANCELLED', 'SETTLED'],
  ];

  it.each(VALID_TRANSITIONS)('allows %s → %s', (from, to) => {
    expect(() => assertValidTransition(from, to)).not.toThrow();
  });

  it.each(FORBIDDEN_TRANSITIONS)('rejects %s → %s', (from, to) => {
    expect(() => assertValidTransition(from, to)).toThrow();
  });

  it('planTransition increments version', () => {
    const result = planTransition({ fromStatus: 'PENDING', toStatus: 'AVAILABLE', currentVersion: 1 });
    expect(result.newVersion).toBe(2);
    expect(result.didTransition).toBe(true);
  });
});

describe('Financial Entitlement Aggregate — isTerminal', () => {
  it('SETTLED is terminal', () => {
    expect(isTerminal('SETTLED')).toBe(true);
  });

  it('CANCELLED is terminal', () => {
    expect(isTerminal('CANCELLED')).toBe(true);
  });

  it('PENDING is not terminal', () => {
    expect(isTerminal('PENDING')).toBe(false);
  });

  it('AVAILABLE is not terminal', () => {
    expect(isTerminal('AVAILABLE')).toBe(false);
  });

  it('ON_HOLD is not terminal', () => {
    expect(isTerminal('ON_HOLD')).toBe(false);
  });
});

describe('Financial Entitlement Aggregate — validateAmount', () => {
  it('accepts valid positive amount', () => {
    expect(() => validateAmount(100.50)).not.toThrow();
  });

  it('accepts integer amount', () => {
    expect(() => validateAmount(100)).not.toThrow();
  });

  it('accepts amount with 2 decimal places', () => {
    expect(() => validateAmount(99.99)).not.toThrow();
  });

  it('rejects zero', () => {
    expect(() => validateAmount(0)).toThrow('positive');
  });

  it('rejects negative', () => {
    expect(() => validateAmount(-50)).toThrow('positive');
  });

  it('rejects Infinity', () => {
    expect(() => validateAmount(Infinity)).toThrow('finite');
  });

  it('rejects NaN', () => {
    expect(() => validateAmount(NaN)).toThrow('finite');
  });

  it('rejects more than 2 decimal places', () => {
    expect(() => validateAmount(10.999)).toThrow('2 decimal places');
  });
});
