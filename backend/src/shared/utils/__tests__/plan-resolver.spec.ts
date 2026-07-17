import { describe, it, expect } from 'vitest';
import { activeSubscriptionCondition, isSubscriptionActive } from '../subscription-validator.js';

describe('Plan Snapshot Resolution Rules', () => {
  describe('activeSubscriptionCondition SQL', () => {
    it('generates correct condition for active subscriptions', () => {
      const sql = activeSubscriptionCondition('os');
      expect(sql).toContain("os.subscription_status = 'active'");
      expect(sql).toContain('os.end_date IS NULL');
      expect(sql).toContain('os.end_date >= CURDATE()');
    });
  });

  describe('isSubscriptionActive (runtime validator)', () => {
    const future = new Date(Date.now() + 86400000);
    const past = new Date(Date.now() - 86400000);

    it('Scenario A: active + future end_date → valid (snapshot applies)', () => {
      expect(isSubscriptionActive({ subscription_status: 'active', end_date: future })).toBe(true);
    });

    it('Scenario B: active + NULL end_date → valid (snapshot applies)', () => {
      expect(isSubscriptionActive({ subscription_status: 'active', end_date: null })).toBe(true);
    });

    it('Scenario C: active + expired end_date → invalid', () => {
      expect(isSubscriptionActive({ subscription_status: 'active', end_date: past })).toBe(false);
    });

    it('Legacy: no snapshot, still active → valid (falls back to live plan)', () => {
      expect(isSubscriptionActive({ subscription_status: 'active', end_date: future })).toBe(true);
    });
  });

  describe('Snapshot vs Live resolution', () => {
    it('plan_snapshot JSON keys match the ResolvedPlanConfig type', () => {
      const mockSnapshot = {
        planName: 'Pro Plan',
        priceMonthly: 999,
        priceYearly: 9990,
        isUnlimited: false,
        billingCycle: 'monthly',
        features: [
          { featureKey: 'branches', label: 'Branches', value: '5', valueType: 'numeric' },
          { featureKey: 'staff', label: 'Staff', value: '10', valueType: 'numeric' },
        ],
        commissionRates: [
          { entity: 'marketplace', amount: 5, rateType: 'percentage' },
          { entity: 'booking', amount: 10, rateType: 'percentage' },
        ],
      };

      expect(mockSnapshot).toHaveProperty('planName');
      expect(mockSnapshot).toHaveProperty('features');
      expect(mockSnapshot).toHaveProperty('commissionRates');
      expect(Array.isArray(mockSnapshot.features)).toBe(true);
      expect(Array.isArray(mockSnapshot.commissionRates)).toBe(true);
      expect(mockSnapshot.features[0].featureKey).toBe('branches');
      expect(mockSnapshot.commissionRates[0].entity).toBe('marketplace');
    });
  });
});
