import { describe, it, expect } from 'vitest';
import { computeRefundFinancials } from '../application/marketplace-refund-calc.js';

describe('computeRefundFinancials — commission reversal model', () => {
  // Baseline: original org earning 900, commission 100, disputed value 1000.
  const COMMISSION = 100;
  const DISPUTED = 1000;

  it('full refund reverses 100% of commission and full org earning', () => {
    const f = computeRefundFinancials(1000, DISPUTED, COMMISSION);
    expect(f.refundPortion).toBe(1);
    expect(f.commissionReversal).toBe(100);
    expect(f.orgAdjustment).toBe(900);
    expect(f.isFullRefund).toBe(true);
    expect(f.extraCompensation).toBe(0);
  });

  it('partial refund of 50% reverses commission proportionally', () => {
    const f = computeRefundFinancials(500, DISPUTED, COMMISSION);
    expect(f.refundPortion).toBe(0.5);
    expect(f.commissionReversal).toBe(50);
    expect(f.orgAdjustment).toBe(450);
  });

  it('refund above original value never reverses more than original commission', () => {
    const f = computeRefundFinancials(1200, DISPUTED, COMMISSION);
    expect(f.refundPortion).toBe(1);
    expect(f.commissionReversal).toBe(100); // capped at original
    expect(f.orgAdjustment).toBe(1100); // 1200 - 100
    expect(f.extraCompensation).toBe(200); // org-only
  });

  it('refund below disputed value reverses commission proportionally', () => {
    const f = computeRefundFinancials(250, DISPUTED, COMMISSION);
    expect(f.refundPortion).toBe(0.25);
    expect(f.commissionReversal).toBe(25);
    expect(f.orgAdjustment).toBe(225);
  });

  it('refund equal to disputed value is a full refund', () => {
    const f = computeRefundFinancials(1000, DISPUTED, COMMISSION);
    expect(f.isFullRefund).toBe(true);
  });

  it('zero commission results in org-only adjustment', () => {
    const f = computeRefundFinancials(500, DISPUTED, 0);
    expect(f.commissionReversal).toBe(0);
    expect(f.orgAdjustment).toBe(500);
  });

  it('uses historical commission — current config changes do not affect reversal', () => {
    // Same inputs regardless of any "current" commission percentage.
    const historical = computeRefundFinancials(500, DISPUTED, 100);
    // The function only depends on the passed original commission (historical).
    expect(historical.commissionReversal).toBe(50);
    expect(historical.orgAdjustment).toBe(450);
  });

  it('rounds to 2 decimals', () => {
    const f = computeRefundFinancials(333.33, DISPUTED, COMMISSION);
    expect(f.refundPortion).toBeCloseTo(0.3333, 4);
    expect(f.commissionReversal).toBeCloseTo(33.33, 2);
    expect(f.orgAdjustment).toBeCloseTo(300.0, 2);
  });

  it('rejects negative refund and negative commission', () => {
    expect(() => computeRefundFinancials(-1, DISPUTED, COMMISSION)).toThrow();
    expect(() => computeRefundFinancials(100, DISPUTED, -1)).toThrow();
  });
});