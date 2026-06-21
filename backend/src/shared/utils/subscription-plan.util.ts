export type BillingPeriod = 'monthly' | 'yearly';

export interface PlanPricing {
  priceMonthly: number | null;
  priceYearly: number | null;
  isUnlimited?: boolean;
}

export interface PlanFeature {
  featureKey: string;
  label: string;
  valueType: 'numeric' | 'boolean' | 'tier' | 'text';
  value: string;
  unit: string | null;
  sortOrder: number;
}

/** % saved vs paying monthly × 12 (rounded). Null if not applicable. */
export function annualSavingsPercent(priceMonthly: number | null, priceYearly: number | null): number | null {
  const monthly = priceMonthly ?? 0;
  const yearly = priceYearly ?? 0;
  if (monthly <= 0 || yearly <= 0) return null;
  const annualizedMonthly = monthly * 12;
  if (yearly >= annualizedMonthly) return null;
  return Math.round((1 - yearly / annualizedMonthly) * 100);
}

export function resolvePlanPrice(
  plan: PlanPricing,
  billingCycle: BillingPeriod,
): number {
  if (plan.isUnlimited) return 0;
  if (billingCycle === 'yearly') return plan.priceYearly ?? 0;
  return plan.priceMonthly ?? 0;
}

export function planSupportsBillingCycle(
  plan: PlanPricing,
  billingCycle: BillingPeriod,
): boolean {
  if (plan.isUnlimited) return true;
  if (billingCycle === 'yearly') return (plan.priceYearly ?? 0) >= 0 && plan.priceYearly != null;
  return (plan.priceMonthly ?? 0) >= 0 && plan.priceMonthly != null;
}

export function mapSubscriptionPlanBase(row: Record<string, unknown>) {
  const priceMonthly = row.price_monthly != null ? Number(row.price_monthly) : null;
  const priceYearly = row.price_yearly != null ? Number(row.price_yearly) : null;
  const isUnlimited = !!row.is_unlimited;
  return {
    id: row.id as number,
    planName: row.plan_name as string,
    priceMonthly,
    priceYearly,
    isUnlimited,
    annualSavingsPercent: annualSavingsPercent(priceMonthly, priceYearly),
    applicableOrgTypes: row.applicable_org_types
      ? typeof row.applicable_org_types === 'string'
        ? (JSON.parse(row.applicable_org_types as string) as (number | null)[]).filter(t => t != null)
        : (row.applicable_org_types as (number | null)[]).filter(t => t != null)
      : [],
    features: null as PlanFeature[] | null,
    isActive: !!row.is_active,
    isInternal: !!row.is_internal,
    sortOrder: (row.sort_order as number) ?? 0,
    createdAt: row.created_at,
  };
}

export function planFeatureToRecord(features: PlanFeature[] | null): Record<string, unknown> | null {
  if (!features?.length) return null;
  const record: Record<string, unknown> = {};
  for (const f of features) {
    const val = f.valueType === 'boolean' ? (f.value === 'true') : f.value;
    record[f.featureKey] = val;
  }
  return record;
}
