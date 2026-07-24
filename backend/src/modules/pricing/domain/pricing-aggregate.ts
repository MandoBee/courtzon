export type RuleType = 'fixed' | 'percentage_increase' | 'percentage_decrease' | 'multiplier' | 'min_price' | 'max_price' | 'override';

export type RuleScope = 'global' | 'organisation' | 'branch' | 'resource';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sunday

export interface TimeRange {
  start: string; // HH:mm
  end: string;
}

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;
}

export interface PricingRule {
  id?: number;
  name: string;
  ruleType: RuleType;
  scope: RuleScope;
  scopeId?: number;
  resourceId?: number;
  value: number;
  priority: number;
  daysOfWeek?: DayOfWeek[];
  timeRange?: TimeRange;
  dateRange?: DateRange;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

export interface SeasonRule {
  id?: number;
  name: string;
  organisationId?: number;
  dateRange: DateRange;
  multiplier: number;
  isActive: boolean;
}

export interface DemandRule {
  id?: number;
  resourceId?: number;
  occupancyThreshold: number; // 0.0 - 1.0
  multiplier: number;
  isActive: boolean;
}

export interface PriceBreakdownStep {
  step: string;
  label: string;
  inputAmount: number;
  ruleName: string;
  outputAmount: number;
}

export interface PriceRequest {
  resourceId: number;
  date: string;
  startTime: string;
  endTime: string;
  userId?: number;
  couponCode?: string;
  membershipTier?: string;
  expectedOccupancy?: number;
}

export interface PriceResult {
  basePrice: number;
  breakdown: PriceBreakdownStep[];
  finalPrice: number;
  currency: string;
}

export function applyRule(base: number, rule: PricingRule): number {
  switch (rule.ruleType) {
    case 'fixed': return base + rule.value;
    case 'percentage_increase': return base * (1 + rule.value / 100);
    case 'percentage_decrease': return base * (1 - rule.value / 100);
    case 'multiplier': return base * rule.value;
    case 'min_price': return Math.max(base, rule.value);
    case 'max_price': return Math.min(base, rule.value);
    case 'override': return rule.value;
    default: return base;
  }
}

export function matchesDayOfWeek(rule: PricingRule, dateStr: string): boolean {
  if (!rule.daysOfWeek || rule.daysOfWeek.length === 0) return true;
  const day = new Date(dateStr).getDay() as DayOfWeek;
  return rule.daysOfWeek.includes(day);
}

export function matchesTimeRange(rule: PricingRule, time: string): boolean {
  if (!rule.timeRange) return true;
  return time >= rule.timeRange.start && time < rule.timeRange.end;
}

export function matchesDateRange(rule: PricingRule, date: string): boolean {
  if (!rule.dateRange) return true;
  return date >= rule.dateRange.start && date <= rule.dateRange.end;
}
