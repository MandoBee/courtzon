import { describe, it, expect } from 'vitest';
import { calculateTier, calculatePoints, getTierConfig, isMembershipActive } from '../domain/membership-aggregate.js';

describe('Membership Aggregate', () => {
  describe('Tier Calculation', () => {
    it('returns bronze for zero points', () => {
      expect(calculateTier(0)).toBe('bronze');
    });

    it('returns silver at 1000 points', () => {
      expect(calculateTier(1000)).toBe('silver');
    });

    it('returns gold at 5000 points', () => {
      expect(calculateTier(5000)).toBe('gold');
    });

    it('returns platinum at 15000 points', () => {
      expect(calculateTier(15000)).toBe('platinum');
    });

    it('returns diamond at 50000 points', () => {
      expect(calculateTier(50000)).toBe('diamond');
    });
  });

  describe('Points Calculation', () => {
    it('calculates base points for bronze', () => {
      expect(calculatePoints(100, 'bronze')).toBe(100);
    });

    it('applies gold multiplier', () => {
      expect(calculatePoints(100, 'gold')).toBe(150);
    });

    it('applies diamond multiplier', () => {
      expect(calculatePoints(100, 'diamond')).toBe(300);
    });

    it('applies campaign multiplier', () => {
      expect(calculatePoints(100, 'bronze', 2)).toBe(200);
    });

    it('stacks tier and campaign multipliers', () => {
      expect(calculatePoints(100, 'diamond', 2)).toBe(600);
    });
  });

  describe('Tier Config', () => {
    it('returns multiplier for each tier', () => {
      expect(getTierConfig('bronze').multiplier).toBe(1);
      expect(getTierConfig('silver').multiplier).toBe(1.2);
      expect(getTierConfig('gold').multiplier).toBe(1.5);
      expect(getTierConfig('platinum').multiplier).toBe(2);
      expect(getTierConfig('diamond').multiplier).toBe(3);
    });
  });

  describe('Membership Active Check', () => {
    it('returns true for active with future end date', () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      expect(isMembershipActive({ status: 'active', endDate: future } as any)).toBe(true);
    });

    it('returns false for expired status', () => {
      expect(isMembershipActive({ status: 'expired', endDate: new Date().toISOString() } as any)).toBe(false);
    });
  });
});
