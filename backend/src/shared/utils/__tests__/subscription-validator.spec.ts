import { describe, it, expect } from 'vitest';
import {
  isSubscriptionActive,
  activeSubscriptionCondition,
  nonExpiredSubscriptionCondition,
} from '../subscription-validator.js';

describe('isSubscriptionActive', () => {
  const today = new Date();
  const futureDate = new Date(today.getFullYear() + 1, 0, 1);
  const pastDate = new Date(today.getFullYear() - 1, 0, 1);

  it('returns true for active + future end_date', () => {
    expect(isSubscriptionActive({ subscription_status: 'active', end_date: futureDate })).toBe(true);
  });

  it('returns true for active + NULL end_date', () => {
    expect(isSubscriptionActive({ subscription_status: 'active', end_date: null })).toBe(true);
  });

  it('returns true for active + undefined end_date', () => {
    expect(isSubscriptionActive({ subscription_status: 'active' })).toBe(true);
  });

  it('returns false for active + expired end_date', () => {
    expect(isSubscriptionActive({ subscription_status: 'active', end_date: pastDate })).toBe(false);
  });

  it('returns false for pending status regardless of end_date', () => {
    expect(isSubscriptionActive({ subscription_status: 'pending', end_date: futureDate })).toBe(false);
    expect(isSubscriptionActive({ subscription_status: 'pending', end_date: null })).toBe(false);
    expect(isSubscriptionActive({ subscription_status: 'pending', end_date: pastDate })).toBe(false);
  });

  it('returns false for cancelled status', () => {
    expect(isSubscriptionActive({ subscription_status: 'cancelled', end_date: futureDate })).toBe(false);
  });

  it('returns false for expired status', () => {
    expect(isSubscriptionActive({ subscription_status: 'expired', end_date: futureDate })).toBe(false);
  });

  it('returns false for null input', () => {
    expect(isSubscriptionActive(null)).toBe(false);
  });

  it('returns false for undefined input', () => {
    expect(isSubscriptionActive(undefined)).toBe(false);
  });
});

describe('activeSubscriptionCondition', () => {
  it('generates condition with the given alias', () => {
    const sql = activeSubscriptionCondition('os');
    expect(sql).toContain('os.subscription_status');
    expect(sql).toContain("'active'");
    expect(sql).toContain('os.end_date IS NULL');
    expect(sql).toContain('os.end_date >= CURDATE()');
  });
});

describe('nonExpiredSubscriptionCondition', () => {
  it('includes active and pending in the condition', () => {
    const sql = nonExpiredSubscriptionCondition('s');
    expect(sql).toContain("s.subscription_status IN ('active', 'pending')");
    expect(sql).toContain('s.end_date IS NULL');
    expect(sql).toContain('s.end_date >= CURDATE()');
  });
});
