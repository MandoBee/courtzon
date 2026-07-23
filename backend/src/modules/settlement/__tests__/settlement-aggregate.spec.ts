import { describe, it, expect } from 'vitest';
import { assertValidTransition, planTransition, isTerminal, canBeRolledBack } from '../domain/settlement-aggregate.js';

describe('SettlementAggregate — state machine', () => {
  describe('assertValidTransition', () => {
    it('allows requested → pending_approval', () => {
      expect(() => assertValidTransition('requested', 'pending_approval')).not.toThrow();
    });

    it('allows pending_approval → approved', () => {
      expect(() => assertValidTransition('pending_approval', 'approved')).not.toThrow();
    });

    it('allows approved → paid', () => {
      expect(() => assertValidTransition('approved', 'paid')).not.toThrow();
    });

    it('allows paid → completed', () => {
      expect(() => assertValidTransition('paid', 'completed')).not.toThrow();
    });

    it('allows pending_approval → rejected', () => {
      expect(() => assertValidTransition('pending_approval', 'rejected')).not.toThrow();
    });

    it('allows requested → cancelled', () => {
      expect(() => assertValidTransition('requested', 'cancelled')).not.toThrow();
    });

    it('rejects paid → cancelled', () => {
      expect(() => assertValidTransition('paid', 'cancelled')).toThrow();
    });

    it('rejects completed → any', () => {
      expect(() => assertValidTransition('completed', 'approved')).toThrow();
    });

    it('rejects rejected → approved', () => {
      expect(() => assertValidTransition('rejected', 'approved')).toThrow();
    });
  });

  describe('planTransition', () => {
    it('increments version on valid transition', () => {
      const r = planTransition({ fromStatus: 'pending_approval', toStatus: 'approved', currentVersion: 1 });
      expect(r.newVersion).toBe(2);
      expect(r.didTransition).toBe(true);
    });
  });

  describe('isTerminal', () => {
    it('considers completed as terminal', () => expect(isTerminal('completed')).toBe(true));
    it('considers rejected as terminal', () => expect(isTerminal('rejected')).toBe(true));
    it('considers cancelled as terminal', () => expect(isTerminal('cancelled')).toBe(true));
    it('does not consider requested as terminal', () => expect(isTerminal('requested')).toBe(false));
    it('does not consider approved as terminal', () => expect(isTerminal('approved')).toBe(false));
  });

  describe('canBeRolledBack', () => {
    it('allows rollback for requested', () => expect(canBeRolledBack('requested')).toBe(true));
    it('allows rollback for calculating', () => expect(canBeRolledBack('calculating')).toBe(true));
    it('allows rollback for pending_approval', () => expect(canBeRolledBack('pending_approval')).toBe(true));
    it('rejects rollback for approved', () => expect(canBeRolledBack('approved')).toBe(false));
    it('rejects rollback for paid', () => expect(canBeRolledBack('paid')).toBe(false));
  });
});
