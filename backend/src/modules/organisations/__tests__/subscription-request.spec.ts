import { describe, it, expect } from 'vitest';
import { isSubscriptionActive, activeSubscriptionCondition } from '../../../shared/utils/subscription-validator.js';

describe('Subscription Request Validation Rules', () => {
  describe('isSubscriptionActive', () => {
    const future = new Date(Date.now() + 86400000);
    const past = new Date(Date.now() - 86400000);

    it('active + future end_date → valid', () => {
      expect(isSubscriptionActive({ subscription_status: 'active', end_date: future })).toBe(true);
    });

    it('active + NULL end_date → valid', () => {
      expect(isSubscriptionActive({ subscription_status: 'active', end_date: null })).toBe(true);
    });

    it('active + expired end_date → invalid (triggers NEW_SUBSCRIPTION)', () => {
      expect(isSubscriptionActive({ subscription_status: 'active', end_date: past })).toBe(false);
    });

    it('pending → invalid', () => {
      expect(isSubscriptionActive({ subscription_status: 'pending', end_date: future })).toBe(false);
    });

    it('cancelled → invalid', () => {
      expect(isSubscriptionActive({ subscription_status: 'cancelled' })).toBe(false);
    });

    it('null → invalid', () => {
      expect(isSubscriptionActive(null)).toBe(false);
    });
  });

  describe('activeSubscriptionCondition SQL fragment', () => {
    it('generates correct WHERE condition', () => {
      const sql = activeSubscriptionCondition('os');
      expect(sql).toContain("os.subscription_status = 'active'");
      expect(sql).toContain('os.end_date IS NULL');
      expect(sql).toContain('os.end_date >= CURDATE()');
    });
  });
});
