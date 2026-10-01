import { describe, it, expect } from 'vitest';
import { isEligiblePrizeRegistration } from '../domain/tournament-aggregate.js';

/**
 * G11.15 — the SINGLE prize-registration eligibility rule shared by automatic
 * placement binding and manualGrant. Pure: same inputs → same verdict.
 */
describe('G11.15 isEligiblePrizeRegistration', () => {
  it('accepts confirmed + unpaid (free tournaments) and confirmed + paid', () => {
    expect(isEligiblePrizeRegistration('confirmed', 'paid')).toBe(true);
    expect(isEligiblePrizeRegistration('confirmed', 'unpaid')).toBe(true);
    expect(isEligiblePrizeRegistration('registered', 'paid')).toBe(true);
    expect(isEligiblePrizeRegistration('registered', 'unpaid')).toBe(true);
  });

  it('rejects withdrawn / disqualified / waiting', () => {
    expect(isEligiblePrizeRegistration('withdrawn', 'paid')).toBe(false);
    expect(isEligiblePrizeRegistration('disqualified', 'paid')).toBe(false);
    expect(isEligiblePrizeRegistration('waiting', 'paid')).toBe(false);
    for (const s of ['withdrawn', 'disqualified', 'waiting', 'registered', 'confirmed']) {
      expect(isEligiblePrizeRegistration(s, 'refunded')).toBe(false);
    }
  });

  it('is null-safe and treats unknown state as ineligible', () => {
    expect(isEligiblePrizeRegistration(null, null)).toBe(false);
    expect(isEligiblePrizeRegistration(undefined, 'paid')).toBe(false);
    expect(isEligiblePrizeRegistration('declined', 'paid')).toBe(false);
  });
});