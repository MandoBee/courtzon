import { describe, it, expect } from 'vitest';
import {
  assertValidPrizeAwardTransition,
  ALLOWED_PRIZE_AWARD_TRANSITIONS,
  validatePrizeAwardAmount,
} from '../domain/tournament-aggregate.js';

/**
 * G11.5 — Prize award aggregate invariants.
 *
 * Lifecycle: awarded → credited → refunded. Refund is a FULL-ONLY clawback
 * while funds remain in wallet custody (Q10b); post-payout recovery is OUT OF
 * SCOPE (no debt/recovery system). Amounts are positive, finite, 2-dp.
 */
describe('tournament prize award aggregate', () => {
  it('exposes the locked lifecycle transitions', () => {
    expect(ALLOWED_PRIZE_AWARD_TRANSITIONS).toEqual({
      awarded: ['credited'],
      credited: ['refunded'],
      refunded: [],
    });
  });

  it('allows awarded → credited and credited → refunded', () => {
    expect(() => assertValidPrizeAwardTransition('awarded', 'credited')).not.toThrow();
    expect(() => assertValidPrizeAwardTransition('credited', 'refunded')).not.toThrow();
  });

  it('rejects every illegal transition', () => {
    expect(() => assertValidPrizeAwardTransition('awarded', 'refunded')).toThrow(/Illegal prize award state transition/);
    expect(() => assertValidPrizeAwardTransition('credited', 'awarded')).toThrow(/Illegal prize award state transition/);
    expect(() => assertValidPrizeAwardTransition('refunded', 'credited')).toThrow(/Illegal prize award state transition/);
    expect(() => assertValidPrizeAwardTransition('refunded', 'awarded')).toThrow(/Illegal prize award state transition/);
  });

  it('accepts positive finite amounts with at most 2 decimals', () => {
    expect(() => validatePrizeAwardAmount(100)).not.toThrow();
    expect(() => validatePrizeAwardAmount(100.5)).not.toThrow();
    expect(() => validatePrizeAwardAmount(0.01)).not.toThrow();
  });

  it('rejects zero, negative, non-finite and >2dp amounts (full-credit payout integrity)', () => {
    expect(() => validatePrizeAwardAmount(0)).toThrow(/positive/);
    expect(() => validatePrizeAwardAmount(-100)).toThrow(/positive/);
    expect(() => validatePrizeAwardAmount(NaN)).toThrow(/finite/);
    expect(() => validatePrizeAwardAmount(Infinity)).toThrow(/finite/);
    expect(() => validatePrizeAwardAmount(100.001)).toThrow(/at most 2 decimal places/);
  });
});