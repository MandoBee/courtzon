import { describe, it, expect } from 'vitest';
import { assertValidWithdrawalTransition, planWithdrawalTransition } from '../domain/financial-aggregate.js';

describe('Financial Aggregate — Withdrawal state machine', () => {
  it('allows pending → approved', () => {
    expect(() => assertValidWithdrawalTransition('pending', 'approved')).not.toThrow();
  });

  it('allows pending → rejected', () => {
    expect(() => assertValidWithdrawalTransition('pending', 'rejected')).not.toThrow();
  });

  it('allows approved → completed', () => {
    expect(() => assertValidWithdrawalTransition('approved', 'completed')).not.toThrow();
  });

  it('rejects completed → approved', () => {
    expect(() => assertValidWithdrawalTransition('completed', 'approved')).toThrow();
  });

  it('planWithdrawalTransition increments version', () => {
    const r = planWithdrawalTransition('pending', 'approved', 1);
    expect(r.newVersion).toBe(2);
  });
});
