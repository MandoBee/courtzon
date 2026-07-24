import { describe, it, expect } from 'vitest';
import { calculatePrice } from '../domain/pricing-engine.js';
import type { PricingRule, SeasonRule, DemandRule } from '../domain/pricing-aggregate.js';

describe('PricingEngine', () => {
  it('returns base price when no rules apply', () => {
    const result = calculatePrice(100, [], [], [], {
      resourceId: 1, date: '2026-07-24', startTime: '10:00', endTime: '11:00',
    });
    expect(result.basePrice).toBe(100);
    expect(result.finalPrice).toBe(100);
    expect(result.breakdown).toHaveLength(1);
  });

  it('applies season multiplier', () => {
    const seasons: SeasonRule[] = [
      { id: 1, name: 'Summer', dateRange: { start: '2026-06-01', end: '2026-08-31' }, multiplier: 1.5, isActive: true },
    ];
    const result = calculatePrice(100, [], seasons, [], {
      resourceId: 1, date: '2026-07-24', startTime: '10:00', endTime: '11:00',
    });
    expect(result.finalPrice).toBe(150);
    expect(result.breakdown).toHaveLength(2);
    expect(result.breakdown[1].step).toBe('season');
  });

  it('applies percentage increase rule', () => {
    const rules: PricingRule[] = [
      { id: 1, name: 'Peak Hour', ruleType: 'percentage_increase', scope: 'global', value: 20, priority: 1, isActive: true },
    ];
    const result = calculatePrice(100, rules, [], [], {
      resourceId: 1, date: '2026-07-24', startTime: '18:00', endTime: '19:00',
    });
    expect(result.finalPrice).toBe(120);
  });

  it('applies demand multiplier at high occupancy', () => {
    const demand: DemandRule[] = [
      { resourceId: 1, occupancyThreshold: 0.8, multiplier: 1.3, isActive: true },
    ];
    const result = calculatePrice(100, [], [], demand, {
      resourceId: 1, date: '2026-07-24', startTime: '10:00', endTime: '11:00',
      expectedOccupancy: 0.9,
    });
    expect(result.finalPrice).toBe(130);
  });

  it('respects rule priority order', () => {
    const rules: PricingRule[] = [
      { id: 1, name: 'Weekend Surcharge', ruleType: 'percentage_increase', scope: 'global', value: 10, priority: 2, isActive: true },
      { id: 2, name: 'Member Discount', ruleType: 'percentage_decrease', scope: 'global', value: 15, priority: 1, isActive: true },
    ];
    const result = calculatePrice(100, rules, [], [], {
      resourceId: 1, date: '2026-07-24', startTime: '10:00', endTime: '11:00',
    });
    // Priority 1 first: 15% off → 85, then Priority 2: 10% on 85 → 93.5
    expect(result.finalPrice).toBe(93.5);
  });

  it('applies min_price rule', () => {
    const rules: PricingRule[] = [
      { id: 1, name: 'Min Price', ruleType: 'min_price', scope: 'global', value: 80, priority: 1, isActive: true },
    ];
    const result = calculatePrice(50, rules, [], [], {
      resourceId: 1, date: '2026-07-24', startTime: '10:00', endTime: '11:00',
    });
    expect(result.finalPrice).toBe(80);
  });

  it('provides full breakdown explanation', () => {
    const rules: PricingRule[] = [
      { id: 1, name: 'Weekend', ruleType: 'percentage_increase', scope: 'global', value: 20, priority: 1, isActive: true },
    ];
    const result = calculatePrice(100, rules, [], [], {
      resourceId: 1, date: '2026-07-24', startTime: '10:00', endTime: '11:00',
    });
    expect(result.breakdown.length).toBeGreaterThanOrEqual(1);
    expect(result.breakdown[0]).toHaveProperty('step');
    expect(result.breakdown[0]).toHaveProperty('label');
    expect(result.breakdown[0]).toHaveProperty('inputAmount');
    expect(result.breakdown[0]).toHaveProperty('outputAmount');
    if (result.breakdown[1]) {
      expect(result.breakdown[1].inputAmount).toBe(100);
      expect(result.breakdown[1].outputAmount).toBe(120);
    }
  });
});
