import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import BillingPeriodToggle from '../../components/subscription/BillingPeriodToggle';
import {
  resolveDisplayPrice,
  type BillingPeriod,
} from '../../utils/subscription-pricing';
import type { PlanCommissionRate } from '../../components/subscription/SubscriptionPlanCard';

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
  isActive: boolean;
  isInternal: boolean;
  createdAt: string;
  features?: PlanFeature[] | null;
  applicableOrgTypes?: (number | string)[];
  commissionRates?: PlanCommissionRate[];
}

const ENTITY_LABELS: Record<string, string> = {
  marketplace: 'Marketplace',
  booking: 'Booking',
  academy: 'Academy',
  coach_session: 'Coach Session',
  tournament: 'Tournament',
};

function formatFeatureValue(feature: PlanFeature): string {
  const { label, value, valueType, unit } = feature;
  if (valueType === 'boolean') return value === 'true' ? label : '';
  if (value === '' || value == null) return '';
  const num = parseInt(value, 10);
  if (valueType === 'numeric') {
    if (value === '-1' || value === 'unlimited') return `Unlimited ${unit || label}`;
    if (!isNaN(num) && unit) return `Up to ${num} ${unit}`;
    if (!isNaN(num)) return `Up to ${num}`;
  }
  const display = value.charAt(0).toUpperCase() + value.slice(1);
  return `${display} ${label}`;
}

export default function SubscriptionPlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api.get(`/subscription-plans/${id}`)
      .then(r => {
        const data = r.data?.data;
        if (!data) { setError('Plan not found'); return; }
        setPlan(data);
      })
      .catch(() => setError('Failed to load plan details'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <p className="text-[var(--color-error)] font-medium">{error || 'Plan not found'}</p>
        <Link to="/" className="text-[var(--color-primary)] hover:underline text-sm">Back to home</Link>
      </div>
    );
  }

  const price = resolveDisplayPrice(plan, billingPeriod);
  const hasBothPeriods = plan.priceMonthly != null && plan.priceYearly != null;
  const features = plan.features?.filter(f => {
    if (f.valueType === 'boolean') return f.value === 'true';
    return f.value !== '' && f.value != null;
  }) || [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to home
      </Link>

      <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-lg)] p-8 border border-[var(--color-border)]">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text)]">{plan.planName}</h1>
            {plan.isInternal && (
              <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]">
                Internal Plan
              </span>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            plan.isActive ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'
          }`}>
            {plan.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        {hasBothPeriods && (
          <div className="mb-6">
            <BillingPeriodToggle
              value={billingPeriod}
              onChange={setBillingPeriod}
              savingsPercent={plan.annualSavingsPercent ?? null}
            />
          </div>
        )}

        <div className="mb-8">
          <p className="text-5xl font-extrabold text-[var(--color-text)]">
            {plan.isUnlimited ? 'Free' : formatPrice(price)}
            {!plan.isUnlimited && (
              <span className="text-xl font-normal text-[var(--color-text-muted)]">
                /{billingPeriod === 'yearly' ? 'yr' : 'mo'}
              </span>
            )}
          </p>
          {plan.annualSavingsPercent != null && plan.annualSavingsPercent > 0 && (
            <p className="mt-1 text-sm font-medium text-[var(--color-success-text)]">
              Save {plan.annualSavingsPercent}% with annual billing
            </p>
          )}
        </div>

        {plan.commissionRates && plan.commissionRates.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Commission Rates</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {plan.commissionRates.map((cr, i) => (
                <div key={i} className="flex items-center justify-between bg-[var(--color-bg)] rounded-xl px-4 py-3">
                  <span className="text-sm text-[var(--color-text-muted)]">{ENTITY_LABELS[cr.entity] || cr.entity}</span>
                  <span className="text-sm font-semibold text-[var(--color-text)] tabular-nums">
                    {cr.rate}{cr.type === 'percentage' ? '%' : ' EGP'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {features.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Features</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {features.map((feat) => {
                const label = formatFeatureValue(feat);
                if (!label) return null;
                return (
                  <div key={feat.featureKey} className="flex items-center gap-2.5 bg-[var(--color-bg)] rounded-xl px-4 py-3">
                    <svg className="w-4 h-4 shrink-0 text-[var(--color-success-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm text-[var(--color-text)]">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-6 border-t border-[var(--color-border)]">
          <Link
            to={`/register/seller?planId=${plan.id}&billing=${billingPeriod}`}
            className="cz-on-gradient-btn px-6 py-2.5 text-sm font-semibold rounded-xl"
          >
            Get Started with {plan.planName}
          </Link>
          <Link
            to="/register"
            className="px-6 py-2.5 text-sm font-semibold rounded-xl border-2 border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary-bg)]"
          >
            View All Plans
          </Link>
        </div>
      </div>
    </div>
  );
}
