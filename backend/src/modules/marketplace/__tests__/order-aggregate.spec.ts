import { describe, it, expect } from 'vitest';
import { assertValidTransition, planTransition, isTerminal } from '../domain/order-aggregate.js';

describe('OrderAggregate — state machine', () => {
  describe('assertValidTransition', () => {
    it('allows pending → cancelled by buyer', () => {
      expect(() => assertValidTransition('pending', 'cancelled', 'buyer')).not.toThrow();
    });

    it('allows pending → processing by seller', () => {
      expect(() => assertValidTransition('pending', 'processing', 'seller')).not.toThrow();
    });

    it('allows confirmed → cancelled by buyer', () => {
      expect(() => assertValidTransition('confirmed', 'cancelled', 'buyer')).not.toThrow();
    });

    it('allows processing → shipped by seller', () => {
      expect(() => assertValidTransition('processing', 'shipped', 'seller')).not.toThrow();
    });

    it('allows shipped → delivered by buyer', () => {
      expect(() => assertValidTransition('shipped', 'delivered', 'buyer')).not.toThrow();
    });

    it('allows delivered → refunded by buyer', () => {
      expect(() => assertValidTransition('delivered', 'refunded', 'buyer')).not.toThrow();
    });

    it('allows pending → confirmed by admin', () => {
      expect(() => assertValidTransition('pending', 'confirmed', 'admin')).not.toThrow();
    });

    it('rejects pending → shipped by buyer', () => {
      expect(() => assertValidTransition('pending', 'shipped', 'buyer')).toThrow();
    });

    it('rejects delivered → processing by seller', () => {
      expect(() => assertValidTransition('delivered', 'processing', 'seller')).toThrow();
    });

    it('rejects cancelled → confirmed by admin', () => {
      expect(() => assertValidTransition('cancelled', 'confirmed', 'admin')).toThrow();
    });
  });

  describe('planTransition', () => {
    it('increments version on valid transition', () => {
      const r = planTransition({ fromStatus: 'pending', toStatus: 'confirmed', role: 'admin', currentVersion: 1 });
      expect(r.newVersion).toBe(2);
      expect(r.didTransition).toBe(true);
    });
  });

  describe('isTerminal', () => {
    it('considers cancelled as terminal', () => expect(isTerminal('cancelled')).toBe(true));
    it('considers refunded as terminal', () => expect(isTerminal('refunded')).toBe(true));
    it('does not consider pending as terminal', () => expect(isTerminal('pending')).toBe(false));
    it('does not consider delivered as terminal', () => expect(isTerminal('delivered')).toBe(false));
  });
});
