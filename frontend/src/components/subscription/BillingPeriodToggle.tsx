import { Can } from '../../permissions/Can';
import type { BillingPeriod } from '../../utils/subscription-pricing';

interface BillingPeriodToggleProps {
  value: BillingPeriod;
  onChange: (period: BillingPeriod) => void;
  savingsPercent?: number | null;
  className?: string;
  /** When omitted, toggle is always shown (e.g. public registration). */
  permission?: string | null;
}

export default function BillingPeriodToggle({
  value,
  onChange,
  savingsPercent,
  className = '',
  permission = 'subscription.plans.billing-period-toggle',
}: BillingPeriodToggleProps) {
  const inner = (
    <div
      className={`inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] p-1 ${className}`}
      role="group"
      aria-label="Billing period"
    >
      <button
        type="button"
        onClick={() => onChange('monthly')}
        className={`relative px-4 py-1.5 text-sm font-medium rounded-full transition-all ${
          value === 'monthly'
            ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
        }`}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange('yearly')}
        className={`relative px-4 py-1.5 text-sm font-medium rounded-full transition-all ${
          value === 'yearly'
            ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
        }`}
      >
        Annual
        {savingsPercent != null && savingsPercent > 0 && (
          <span className="ml-1.5 inline-flex items-center rounded-full bg-[var(--color-success-bg)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-success-text)]">
            −{savingsPercent}%
          </span>
        )}
      </button>
    </div>
  );

  if (permission == null) return inner;
  return <Can permission={permission}>{inner}</Can>;
}
