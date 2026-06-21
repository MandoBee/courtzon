import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../services/api';
import { formatPrice } from '../../../utils/currency';
import BillingPeriodToggle from '../../../components/subscription/BillingPeriodToggle';
import {
  filterPlansForPeriod,
  maxAnnualSavingsAmongPlans,
  resolveDisplayPrice,
  type BillingPeriod,
} from '../../../utils/subscription-pricing';
import type { PlanCommissionRate } from '../../../components/subscription/SubscriptionPlanCard';

interface PlanFeature {
  featureKey: string;
  label: string;
  valueType: 'numeric' | 'boolean' | 'tier' | 'text';
  value: string;
  unit: string | null;
  sortOrder: number;
}

interface Plan {
  id: number;
  planName: string;
  priceMonthly?: number | null;
  priceYearly?: number | null;
  isUnlimited?: boolean;
  annualSavingsPercent?: number | null;
  features?: PlanFeature[] | null;
  applicableOrgTypes?: (number | string)[];
  commissionRates?: PlanCommissionRate[];
}

interface PricingPlansBlockProps {
  title?: string;
  subtitle?: string;
  orgTypeId?: number;
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

const ENTITY_LABELS: Record<string, string> = {
  marketplace: 'Marketplace commission',
  booking: 'Booking commission',
  academy: 'Academy commission',
  coach_session: 'Coach session commission',
  tournament: 'Tournament commission',
};

export default function PricingPlansBlock({
  title,
  subtitle,
  orgTypeId = 10,
}: PricingPlansBlockProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');

  useEffect(() => {
    api.get('/public/subscription-plans').then(r => {
      const data = r.data?.data || r.data || [];
      const filtered = data.filter((p: Plan) => {
        if (!p.applicableOrgTypes?.length) return true;
        return p.applicableOrgTypes.includes(orgTypeId);
      }).sort((a: Plan, b: Plan) => ((a as any).sortOrder ?? 0) - ((b as any).sortOrder ?? 0));
      setPlans(filtered);
    }).catch(() => {});
  }, [orgTypeId]);

  const visible = filterPlansForPeriod(plans, billingPeriod);
  const savings = maxAnnualSavingsAmongPlans(plans);

  if (!plans.length) return null;

  return (
    <section className="cz-landing-section cz-landing-section--surface">
      <div className="cz-landing-inner">
        <div className="cz-landing-section-header animate-fade-in">
          {title && <h2 className="cz-landing-h2">{title}</h2>}
          {subtitle && <p className="cz-landing-lead">{subtitle}</p>}
        </div>
        <div className="flex justify-center mb-8">
          <BillingPeriodToggle
            value={billingPeriod}
            onChange={setBillingPeriod}
            savingsPercent={savings}
            permission={null}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 cz-landing-grid max-w-5xl mx-auto items-stretch">
          {visible.map((p, i) => {
            const price = resolveDisplayPrice(p, billingPeriod);
            const features = p.features?.filter(f => {
              if (f.valueType === 'boolean') return f.value === 'true';
              return f.value !== '' && f.value != null;
            }) || [];
            return (
            <div
              key={p.id}
              className={`cz-landing-card animate-fade-in transition-all duration-300 flex flex-col ${i === 1 ? 'cz-landing-pricing-featured' : 'cz-landing-card--flat'}`}
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              {i === 1 && (
                <span className="inline-block px-3 py-1 text-xs font-semibold cz-on-gradient-btn rounded-full mb-4 w-fit">
                  Most Popular
                </span>
              )}
              <h3 className="text-xl font-bold text-[var(--color-text)] mb-2">{p.planName}</h3>
              <div className="mt-4 mb-4">
                <span className="text-4xl font-extrabold text-[var(--color-text)]">
                  {price === 0 ? 'Free' : formatPrice(price)}
                  <span className="text-lg font-normal text-[var(--color-text-muted)]">
                    {billingPeriod === 'yearly' ? '/yr' : '/mo'}
                  </span>
                </span>
              </div>

              {p.commissionRates && p.commissionRates.length > 0 && (
                <div className="mb-4 space-y-1">
                  <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Commission</p>
                  {p.commissionRates.map((cr, j) => (
                    <div key={j} className="flex justify-between text-[11px] sm:text-xs text-[var(--color-text-muted)]">
                      <span>{ENTITY_LABELS[cr.entity] || cr.entity}</span>
                      <span className="font-medium text-[var(--color-text)] tabular-nums">
                        {cr.rate}{cr.type === 'percentage' ? '%' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {features.length > 0 && (
                <ul className="mb-4 space-y-1.5 min-h-0 flex-1 overflow-y-auto">
                  {features.map((feat) => {
                    const label = formatFeatureValue(feat);
                    if (!label) return null;
                    return (
                      <li key={feat.featureKey} className="flex items-start gap-2 text-[11px] sm:text-xs text-[var(--color-text-muted)]">
                        <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--color-success-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{label}</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              <Link
                to={`/register/seller?planId=${p.id}&billing=${billingPeriod}`}
                className={`block text-center py-3 rounded-xl font-semibold transition-all mt-auto ${
                  i === 1
                    ? 'cz-on-gradient-btn hover:opacity-90 shadow-[var(--shadow-sm)]'
                    : 'border-2 border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary-bg)]'
                }`}
              >
                Get Started
              </Link>
            </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
