export type BillingPeriod = 'monthly' | 'yearly';

export interface SubscriptionPlanPricing {
  priceMonthly?: number | null;
  priceYearly?: number | null;
  isUnlimited?: boolean;
  annualSavingsPercent?: number | null;
}

export function annualSavingsPercent(
  priceMonthly: number | null | undefined,
  priceYearly: number | null | undefined,
): number | null {
  const monthly = priceMonthly ?? 0;
  const yearly = priceYearly ?? 0;
  if (monthly <= 0 || yearly <= 0) return null;
  const annualized = monthly * 12;
  if (yearly >= annualized) return null;
  return Math.round((1 - yearly / annualized) * 100);
}

export function resolveDisplayPrice(
  plan: SubscriptionPlanPricing,
  period: BillingPeriod,
): number {
  if (plan.isUnlimited) return 0;
  if (period === 'yearly') return plan.priceYearly ?? 0;
  return plan.priceMonthly ?? 0;
}

export function planHasPeriod(plan: SubscriptionPlanPricing, period: BillingPeriod): boolean {
  if (plan.isUnlimited) return true;
  if (period === 'yearly') return plan.priceYearly != null;
  return plan.priceMonthly != null;
}

export function filterPlansForPeriod<T extends SubscriptionPlanPricing>(
  plans: T[],
  period: BillingPeriod,
): T[] {
  return plans.filter((p) => planHasPeriod(p, period));
}

/** Recurring plans that offer both monthly and yearly (for showing savings badge). */
export function maxAnnualSavingsAmongPlans(plans: SubscriptionPlanPricing[]): number | null {
  let max: number | null = null;
  for (const p of plans) {
    const pct = p.annualSavingsPercent ?? annualSavingsPercent(p.priceMonthly, p.priceYearly);
    if (pct != null && (max == null || pct > max)) max = pct;
  }
  return max;
}
