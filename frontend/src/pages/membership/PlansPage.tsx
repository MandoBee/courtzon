import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { membershipApi } from '../../services/membership';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ui/Toast';
import { Skeleton, SkeletonRow } from '../../components/ui/Skeleton';

export default function PlansPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data: plans, isLoading } = useQuery({ queryKey: ['membership', 'plans'], queryFn: membershipApi.getPlans });

  const subscribe = useMutation({
    mutationFn: membershipApi.subscribe,
    onSuccess: () => { showToast('Subscribed successfully!', 'success'); qc.invalidateQueries({ queryKey: ['membership'] }); navigate('/membership'); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Subscription failed', 'error'),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton width={220} height={28} /><SkeletonRow count={6} /></div>;

  const PLAN_ICONS: Record<string, string> = {
    monthly: '📅', quarterly: '📆', semiannual: '📋', annual: '📦',
    unlimited: '♾️', credits: '💰', session_bundle: '🎾',
    corporate: '🏢', family: '👨‍👩‍👧‍👦', student: '🎓',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Membership Plans</h1>
        <button onClick={() => navigate('/membership')} className="text-sm text-[var(--color-primary)] hover:underline">Back</button>
      </div>

      {(!plans || plans.length === 0) ? (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-muted)]">No plans available yet.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan: any) => (
            <div key={plan.id} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-4 hover:shadow-lg transition-shadow">
              <div className="text-3xl">{PLAN_ICONS[plan.plan_type] || '📋'}</div>
              <h2 className="text-lg font-bold text-[var(--color-text)]">{plan.name}</h2>
              <p className="text-3xl font-bold text-[var(--color-primary)]">EGP {plan.price}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{plan.duration_days} days</p>
              {plan.credits && <p className="text-xs text-[var(--color-text-muted)]">{plan.credits} credits included</p>}
              {plan.sessions && <p className="text-xs text-[var(--color-text-muted)]">{plan.sessions} sessions included</p>}
              <ul className="space-y-1">
                {(plan.benefits || []).map((b: any, i: number) => (
                  <li key={i} className="text-xs text-[var(--color-text-muted)]">✓ {b.description || b.type.replace(/_/g, ' ')}</li>
                ))}
              </ul>
              <button onClick={() => subscribe.mutate(plan.id)} disabled={subscribe.isPending}
                className="w-full py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-xl hover:opacity-90 disabled:opacity-50">
                {subscribe.isPending ? 'Subscribing...' : 'Subscribe'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
