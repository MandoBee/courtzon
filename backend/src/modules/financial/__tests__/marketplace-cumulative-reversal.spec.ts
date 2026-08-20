import { describe, it, expect } from 'vitest';
import { computeCumulativeRefundFinancials } from '../application/marketplace-refund-calc.js';

describe('computeCumulativeRefundFinancials — multi-refund cumulative cap', () => {
  // Baseline: org earning 900, commission 100, disputed value 1000.
  const ORG = 900;
  const COMM = 100;
  const DV = 1000;

  it('first refund of 600 splits proportionally (org 540, courtzon 60)', () => {
    const f = computeCumulativeRefundFinancials(600, ORG, COMM, DV, 0, 0);
    expect(f.originalValuePortion).toBe(600);
    expect(f.additionalCompensation).toBe(0);
    expect(f.orgOriginalReversal).toBe(540);
    expect(f.commissionReversal).toBe(60);
    expect(f.orgAdjustment).toBe(540);
  });

  it('second refund of 600 respects remaining capacity (org 560, courtzon 40)', () => {
    // After refund A (org 540, comm 60 reversed), remaining capacity:
    //   org original remaining = 900 - 540 = 360
    //   commission remaining   = 100 - 60  = 40
    //   remaining original value = 1000 - (540+60) = 400
    // Refund B = 600: originalValuePortion = min(600, 400) = 400,
    //   additionalCompensation = 200
    //   commissionReversal = min(40, 400 * 0.1) = min(40, 40) = 40
    //   orgOriginalReversal = min(360, 400 * 0.9) = min(360, 360) = 360
    //   orgAdjustment = 360 + 200 = 560
    const f = computeCumulativeRefundFinancials(600, ORG, COMM, DV, 540, 60);
    expect(f.originalValuePortion).toBe(400);
    expect(f.additionalCompensation).toBe(200);
    expect(f.commissionReversal).toBe(40);
    expect(f.orgOriginalReversal).toBe(360);
    expect(f.orgAdjustment).toBe(560);
  });

  it('two refunds of 600 each cannot exceed original commission (cumulative -100)', () => {
    const a = computeCumulativeRefundFinancials(600, ORG, COMM, DV, 0, 0);
    const b = computeCumulativeRefundFinancials(600, ORG, COMM, DV, a.orgOriginalReversal, a.commissionReversal);
    expect(a.commissionReversal).toBe(60);
    expect(b.commissionReversal).toBe(40);
    expect(a.commissionReversal + b.commissionReversal).toBe(100);
  });

  it('two refunds cannot exceed original org earning on original-value portion', () => {
    const a = computeCumulativeRefundFinancials(600, ORG, COMM, DV, 0, 0);
    const b = computeCumulativeRefundFinancials(600, ORG, COMM, DV, a.orgOriginalReversal, a.commissionReversal);
    expect(a.orgOriginalReversal + b.orgOriginalReversal).toBe(900);
    // additional compensation is org-only and on top:
    expect(a.orgAdjustment + b.orgAdjustment).toBe(540 + 560); // 1100
  });

  it('additional compensation remains organization-only (never touches commission)', () => {
    // A single refund of 1200 (above original value 1000).
    const f = computeCumulativeRefundFinancials(1200, ORG, COMM, DV, 0, 0);
    expect(f.originalValuePortion).toBe(1000);
    expect(f.additionalCompensation).toBe(200);
    expect(f.commissionReversal).toBe(100); // never exceeds original commission
    expect(f.orgOriginalReversal).toBe(900);
    expect(f.orgAdjustment).toBe(1100); // 900 original + 200 compensation
  });

  it('third refund when all capacity consumed yields no commission reversal, only compensation', () => {
    // After A (540/60) and B (360/40), both org original and commission are fully reversed.
    const a = computeCumulativeRefundFinancials(600, ORG, COMM, DV, 0, 0);
    const b = computeCumulativeRefundFinancials(600, ORG, COMM, DV, a.orgOriginalReversal, a.commissionReversal);
    const c = computeCumulativeRefundFinancials(600, ORG, COMM, DV, a.orgOriginalReversal + b.orgOriginalReversal, a.commissionReversal + b.commissionReversal);
    expect(c.commissionReversal).toBe(0);
    expect(c.orgOriginalReversal).toBe(0);
    expect(c.additionalCompensation).toBe(600); // all remaining is org-only compensation
    expect(c.orgAdjustment).toBe(600);
  });

  it('uses historical original amounts — current config changes do not affect reversal', () => {
    // The function only depends on the passed original amounts (historical).
    const f = computeCumulativeRefundFinancials(500, ORG, COMM, DV, 0, 0);
    expect(f.orgOriginalReversal).toBe(450);
    expect(f.commissionReversal).toBe(50);
  });

  it('full remaining refund after a previous partial refund', () => {
    // Refund A = 600 (org 540, comm 60). Refund B = 400 (the remaining original value).
    const a = computeCumulativeRefundFinancials(600, ORG, COMM, DV, 0, 0);
    const b = computeCumulativeRefundFinancials(400, ORG, COMM, DV, a.orgOriginalReversal, a.commissionReversal);
    expect(b.originalValuePortion).toBe(400);
    expect(b.additionalCompensation).toBe(0);
    expect(b.commissionReversal).toBe(40);
    expect(b.orgOriginalReversal).toBe(360);
    expect(b.orgAdjustment).toBe(360);
    expect(a.commissionReversal + b.commissionReversal).toBe(100);
    expect(a.orgOriginalReversal + b.orgOriginalReversal).toBe(900);
  });

  it('refund where no CourtZon commission remains reverses none', () => {
    const f = computeCumulativeRefundFinancials(500, ORG, COMM, DV, 0, 100); // prior commission already fully reversed
    expect(f.commissionReversal).toBe(0);
    expect(f.orgOriginalReversal).toBe(450);
    expect(f.orgAdjustment).toBe(450);
  });

  it('refund where only additional compensation remains is org-only', () => {
    // Both org original and commission fully reversed; only compensation remains.
    const f = computeCumulativeRefundFinancials(300, ORG, COMM, DV, 900, 100);
    expect(f.originalValuePortion).toBe(0);
    expect(f.additionalCompensation).toBe(300);
    expect(f.commissionReversal).toBe(0);
    expect(f.orgOriginalReversal).toBe(0);
    expect(f.orgAdjustment).toBe(300);
  });

  it('rounds to 2 decimals', () => {
    const f = computeCumulativeRefundFinancials(333.33, ORG, COMM, DV, 0, 0);
    expect(f.orgOriginalReversal).toBeCloseTo(300, 2);
    expect(f.commissionReversal).toBeCloseTo(33.33, 2);
  });

  it('rejects negative values', () => {
    expect(() => computeCumulativeRefundFinancials(-1, ORG, COMM, DV, 0, 0)).toThrow();
    expect(() => computeCumulativeRefundFinancials(100, -1, COMM, DV, 0, 0)).toThrow();
  });
});