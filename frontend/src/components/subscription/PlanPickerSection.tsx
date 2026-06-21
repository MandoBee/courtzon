import SubscriptionPlanCard, { type SubscriptionPlanCardPlan } from './SubscriptionPlanCard';
import BillingPeriodToggle from './BillingPeriodToggle';
import {
  filterPlansForPeriod,
  maxAnnualSavingsAmongPlans,
  type BillingPeriod,
} from '../../utils/subscription-pricing';

export interface PlanPickerPlan extends SubscriptionPlanCardPlan {
  applicableOrgTypes?: (number | string)[];
}

interface PlanPickerSectionProps {
  plans: PlanPickerPlan[];
  selectedPlanId: number;
  onSelectPlan: (planId: number) => void;
  billingPeriod: BillingPeriod;
  onBillingPeriodChange: (period: BillingPeriod) => void;
  displayCurrency?: string;
  /** Public registration: no permission gate on toggle */
  publicMode?: boolean;
}

export default function PlanPickerSection({
  plans,
  selectedPlanId,
  onSelectPlan,
  billingPeriod,
  onBillingPeriodChange,
  displayCurrency,
  publicMode = false,
}: PlanPickerSectionProps) {
  const sorted = plans.slice().sort((a, b) => ((a as any).sortOrder ?? 0) - ((b as any).sortOrder ?? 0));
  const visible = filterPlansForPeriod(sorted, billingPeriod);
  const hasAnnually = maxAnnualSavingsAmongPlans(sorted);

  if (plans.length === 0) {
    return <p className="text-center text-[var(--color-text-muted)] py-8">No plans available yet. Please check back later.</p>;
  }

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-[var(--color-text-muted)]">
          {billingPeriod === 'yearly' && hasAnnually != null && hasAnnually > 0
            ? `Pay annually and save up to ${hasAnnually}% compared to monthly billing.`
            : 'Choose how you want to be billed.'}
        </p>
        <BillingPeriodToggle
          value={billingPeriod}
          onChange={onBillingPeriodChange}
          savingsPercent={hasAnnually}
          permission={publicMode ? null : 'subscription.plans.billing-period-toggle'}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-4 items-stretch">
        {visible.map((p) => (
          <SubscriptionPlanCard
            key={p.id}
            plan={p}
            billingPeriod={billingPeriod}
            selected={selectedPlanId === p.id}
            onSelect={() => onSelectPlan(p.id)}
            displayCurrency={displayCurrency}
          />
        ))}
      </div>
    </div>
  );
}
