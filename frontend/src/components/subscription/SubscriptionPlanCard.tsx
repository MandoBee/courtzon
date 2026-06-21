import { formatPriceParts } from '../../utils/currency';
import {
  resolveDisplayPrice,
  type BillingPeriod,
} from '../../utils/subscription-pricing';

export interface PlanCommissionRate {
  entity: string;
  rate: number;
  type: string;
}

export interface PlanFeature {
  featureKey: string;
  label: string;
  valueType: 'numeric' | 'boolean' | 'tier' | 'text';
  value: string;
  unit: string | null;
  sortOrder: number;
}

export interface SubscriptionPlanCardPlan {
  id: number;
  planName: string;
  priceMonthly?: number | null;
  priceYearly?: number | null;
  isUnlimited?: boolean;
  annualSavingsPercent?: number | null;
  commissionRates?: PlanCommissionRate[];
  features?: PlanFeature[] | null;
}

function formatFeatureValue(feature: PlanFeature): string {
  const { label, value, valueType, unit } = feature;
  if (valueType === 'boolean') return value === 'true' ? label : '';
  if (value === '' || value == null) return '';
  const num = parseInt(value, 10);
  if (valueType === 'numeric') {
    if (value === '-1' || value === 'unlimited') return `Unlimited ${unit || label}`;
    if (!isNaN(num) && unit) return `Up to ${num} ${unit}`;
    if (!isNaN(num)) return `Up to ${num} ${label}`;
  }
  const display = value.charAt(0).toUpperCase() + value.slice(1);
  return `${display} ${label}`;
}

interface SubscriptionPlanCardProps {
  plan: SubscriptionPlanCardPlan;
  billingPeriod: BillingPeriod;
  selected: boolean;
  onSelect: () => void;
  displayCurrency?: string;
  badge?: string;
}

export default function SubscriptionPlanCard({
  plan,
  billingPeriod,
  selected,
  onSelect,
  displayCurrency = 'EGP',
  badge,
}: SubscriptionPlanCardProps) {
  const price = resolveDisplayPrice(plan, billingPeriod);
  const priceParts = price > 0 ? formatPriceParts(price) : null;
  const cycleSuffix = plan.isUnlimited ? '' : billingPeriod === 'yearly' ? '/yr' : '/mo';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full min-w-0 h-full flex flex-col p-4 sm:p-5 rounded-xl border-2 text-left transition-all overflow-hidden box-border ${
        selected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg)]/30 ring-1 ring-[var(--color-primary)]'
          : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/30'
      }`}
    >
      {badge && (
        <span className="inline-block w-fit max-w-full px-2 py-0.5 text-[10px] font-bold text-white bg-[var(--gradient-primary)] rounded-full mb-2 truncate">
          {badge}
        </span>
      )}
      <h3 className="font-bold text-[var(--color-text)] text-base sm:text-lg leading-tight break-words">
        {plan.planName}
      </h3>
      <div className="mt-2 shrink-0">
        {plan.isUnlimited || price === 0 ? (
          <span className="text-lg sm:text-xl font-bold text-[var(--color-text)]">
            Free
            {cycleSuffix && (
              <span className="text-sm font-normal text-[var(--color-text-muted)]">{cycleSuffix}</span>
            )}
          </span>
        ) : priceParts ? (
          <span className="inline-flex max-w-full items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-sm font-semibold text-[var(--color-text-muted)] shrink-0">{priceParts.symbol}</span>
            <span className="text-lg sm:text-xl font-bold tabular-nums text-[var(--color-text)] shrink-0">
              {priceParts.amount}
            </span>
            {cycleSuffix && (
              <span className="text-sm font-normal text-[var(--color-text-muted)] shrink-0">{cycleSuffix}</span>
            )}
          </span>
        ) : null}
      </div>
      {(plan.commissionRates?.length || (plan.features && plan.features.length > 0)) && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] min-h-0 flex-1 overflow-y-auto space-y-2">
          {plan.commissionRates && plan.commissionRates.length > 0 && (
            <div>
              <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Commission</p>
              {plan.commissionRates.map((cr, j) => (
                <div key={j} className="flex justify-between gap-2 text-[11px] sm:text-xs text-[var(--color-text-muted)] min-w-0">
                  <span className="truncate">{cr.entity}</span>
                  <span className="font-medium text-[var(--color-text)] shrink-0 tabular-nums">
                    {cr.rate}
                    {cr.type === 'percentage' ? '%' : ` ${displayCurrency}`}
                  </span>
                </div>
              ))}
            </div>
          )}
          {plan.features && plan.features.length > 0 && (
            <div>
              <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Features</p>
              {plan.features
                .filter(f => {
                  if (f.valueType === 'boolean') return f.value === 'true';
                  return f.value !== '' && f.value != null;
                })
                .map((feat) => {
                  const label = formatFeatureValue(feat);
                  if (!label) return null;
                  return (
                    <div key={feat.featureKey} className="flex items-start gap-2 text-[11px] sm:text-xs text-[var(--color-text-muted)]">
                      <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--color-success-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>{label}</span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </button>
  );
}
