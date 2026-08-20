import { describe, it, expect } from 'vitest';
import { calculateDisputedValue } from '../application/marketplace-refund-calc.js';

describe('Marketplace Refund Calc — disputed value', () => {
  const order = {
    id: 200,
    subtotal: 300.0,
    discount_amount: 30.0,
    shipping_cost: 20.0,
    tax_amount: 15.0,
    total: 305.0,
  };

  it('full-item dispute returns full item value with proportional allocations', () => {
    const result = calculateDisputedValue(order, [
      { itemId: 11, itemTotal: 100.0, unitPrice: 100, commissionAmount: 10.0, quantity: 1, disputedQuantity: 1 },
    ]);

    expect(result.disputedValue).toBeCloseTo(100 + 6.67 + 5, 1); // item + shipping share (20×1/3) + tax share (15×1/3)
    expect(result.refundableOrgEarning).toBeCloseTo(100 - 10 - 10 + 6.67 + 5, 1); // minus discount share (30×1/3) and commission
    expect(result.refundableCommission).toBe(10.0);
    expect(result.refundRatio).toBeGreaterThan(1); // refund value exceeds the underlying earnings
  });

  it('partial quantity dispute prorates the item value', () => {
    const result = calculateDisputedValue(order, [
      { itemId: 12, itemTotal: 200.0, unitPrice: 100, commissionAmount: 20.0, quantity: 2, disputedQuantity: 1 },
    ]);

    expect(result.disputedValue).toBeCloseTo(100 + 6.67 + 5, 1); // 1 of 2 units → half the item
    expect(result.refundableCommission).toBe(0); // partial dispute reverses no commission (not the full item)
  });

  it('no dispute window on zero subtotal does not crash', () => {
    const zero = { id: 1, subtotal: 0, discount_amount: 0, shipping_cost: 0, tax_amount: 0, total: 0 };
    const result = calculateDisputedValue(zero, [
      { itemId: 1, itemTotal: 0, unitPrice: 0, commissionAmount: 0, quantity: 1, disputedQuantity: 1 },
    ]);
    expect(result.disputedValue).toBe(0);
    expect(result.itemDetails).toHaveLength(1);
  });

  it('empty dispute list returns zero', () => {
    const result = calculateDisputedValue(order, []);
    expect(result.disputedValue).toBe(0);
    expect(result.refundableOrgEarning).toBe(0);
    expect(result.refundableCommission).toBe(0);
    expect(result.refundRatio).toBe(0);
  });
});