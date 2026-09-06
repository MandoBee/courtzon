import { describe, it, expect } from 'vitest';
import { calculateCoachSessionPrice } from '../application/coach-pricing.js';

/**
 * Coach session pricing — the canonical coach price calculation.
 *
 * Business rule: coach session duration ALWAYS equals the court booking
 * duration (same start/end window) and the coach is charged its hourly rate
 * prorated by that duration:
 *
 *   coach_price = hourly_rate × duration_minutes / 60
 *
 *   rate 350 EGP → 30m=175 · 60m=350 · 90m=525 · 120m=700
 */
describe('calculateCoachSessionPrice', () => {
  it('30-minute court booking → coach price = 0.5 × hourly rate', () => {
    expect(calculateCoachSessionPrice(350, '14:00', '14:30')).toBe(175);
    expect(calculateCoachSessionPrice(100, '09:00', '09:30')).toBe(50);
  });

  it('60-minute court booking → coach price = hourly rate', () => {
    expect(calculateCoachSessionPrice(350, '14:00', '15:00')).toBe(350);
    expect(calculateCoachSessionPrice(200, '10:00', '11:00')).toBe(200);
  });

  it('90-minute court booking → coach price = 1.5 × hourly rate', () => {
    expect(calculateCoachSessionPrice(350, '14:00', '15:30')).toBe(525);
    expect(calculateCoachSessionPrice(100, '10:00', '11:30')).toBe(150);
  });

  it('120-minute court booking → coach price = 2 × hourly rate', () => {
    expect(calculateCoachSessionPrice(350, '14:00', '16:00')).toBe(700);
    expect(calculateCoachSessionPrice(75, '09:00', '11:00')).toBe(150);
  });

  it('different hourly rates produce correct prorated amounts', () => {
    expect(calculateCoachSessionPrice(150, '14:00', '15:30')).toBe(225); // 90m
    expect(calculateCoachSessionPrice(500, '14:00', '16:00')).toBe(1000); // 120m
    expect(calculateCoachSessionPrice(250, '14:00', '14:30')).toBe(125); // 30m
  });

  it('rounds to 2 decimals using the platform money convention', () => {
    // 99.99 × 1.5 = 149.985 → 149.99 (never a floating-point artifact).
    expect(calculateCoachSessionPrice(99.99, '10:00', '11:30')).toBe(149.99);
    // 33.33 × 1.5 = 49.995 → 50.00
    expect(calculateCoachSessionPrice(33.33, '10:00', '11:30')).toBe(50);
  });

  it('handles a midnight-crossing window defensively (23:00 → 00:30 = 90 min)', () => {
    expect(calculateCoachSessionPrice(350, '23:00', '00:30')).toBe(525);
    expect(calculateCoachSessionPrice(100, '23:00', '00:30')).toBe(150);
  });

  it('zero / missing hourly rate yields 0', () => {
    expect(calculateCoachSessionPrice(0, '14:00', '15:00')).toBe(0);
    expect(calculateCoachSessionPrice(NaN, '14:00', '15:00')).toBe(0);
  });
});