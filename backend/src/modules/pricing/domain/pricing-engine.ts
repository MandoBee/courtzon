import type { PricingRule, SeasonRule, DemandRule, PriceRequest, PriceResult, PriceBreakdownStep } from './pricing-aggregate.js';
import { applyRule, matchesDayOfWeek, matchesTimeRange, matchesDateRange } from './pricing-aggregate.js';

export function calculatePrice(
  basePrice: number,
  rules: PricingRule[],
  seasons: SeasonRule[],
  demands: DemandRule[],
  request: PriceRequest,
): PriceResult {
  const breakdown: PriceBreakdownStep[] = [];
  let current = basePrice;

  // Step 1: Base price
  breakdown.push({ step: 'base', label: 'Base Price', inputAmount: 0, ruleName: 'Standard rate', outputAmount: current });

  // Step 2: Season rules
  const activeSeason = seasons.find(s =>
    s.isActive &&
    (!s.organisationId || true) &&
    request.date >= s.dateRange.start &&
    request.date <= s.dateRange.end,
  );
  if (activeSeason) {
    const before = current;
    current = current * activeSeason.multiplier;
    breakdown.push({
      step: 'season', label: 'Season Adjustment', inputAmount: before,
      ruleName: activeSeason.name, outputAmount: current,
    });
  }

  // Step 3: Apply pricing rules in priority order
  const sortedRules = [...rules]
    .filter(r => r.isActive && matchesDayOfWeek(r, request.date) && matchesTimeRange(r, request.startTime) && matchesDateRange(r, request.date))
    .sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    const before = current;
    current = applyRule(current, rule);
    if (current !== before) {
      breakdown.push({
        step: `rule_${rule.id || rule.name}`, label: rule.name,
        inputAmount: before, ruleName: `${rule.ruleType} (${rule.value})`, outputAmount: current,
      });
    }
  }

  // Step 4: Demand multiplier
  if (request.expectedOccupancy !== undefined) {
    for (const d of demands) {
      if (d.isActive && (!d.resourceId || d.resourceId === request.resourceId) && request.expectedOccupancy >= d.occupancyThreshold) {
        const before = current;
        current = current * d.multiplier;
        breakdown.push({
          step: 'demand', label: 'Demand Multiplier', inputAmount: before,
          ruleName: `${Math.round(d.occupancyThreshold * 100)}%+ occupancy`, outputAmount: current,
        });
        break;
      }
    }
  }

  return {
    basePrice,
    breakdown,
    finalPrice: Math.round(current * 100) / 100,
    currency: 'EGP',
  };
}
