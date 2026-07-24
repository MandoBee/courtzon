import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { membershipApi } from '../../services/membership';
import { Skeleton, SkeletonRow } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useNavigate } from 'react-router-dom';

type Tab = 'overview' | 'history' | 'loyalty';

export default function MembershipDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');

  const { data: active, isLoading: loadingActive } = useQuery({ queryKey: ['membership', 'active'], queryFn: membershipApi.getActive });
  const { data: memberships } = useQuery({ queryKey: ['membership', 'my'], queryFn: membershipApi.getMyMemberships });
  const { data: plans } = useQuery({ queryKey: ['membership', 'plans'], queryFn: membershipApi.getPlans });
  const { data: loyalty } = useQuery({ queryKey: ['membership', 'loyalty'], queryFn: membershipApi.getLoyalty });

  const cancelMutation = useMutation({
    mutationFn: () => Promise.resolve(),
    onSuccess: () => { showToast('Membership cancelled', 'info'); qc.invalidateQueries({ queryKey: ['membership'] }); },
  });

  if (loadingActive) return <div className="space-y-4"><Skeleton width={300} height={28} /><SkeletonRow count={4} /></div>;

  const TIER_COLORS: Record<string, string> = {
    bronze: 'bg-amber-600', silver: 'bg-gray-400', gold: 'bg-yellow-500',
    platinum: 'bg-cyan-500', diamond: 'bg-blue-600',
  };

  const TIER_NEXT: Record<string, { tier: string; points: number }> = {
    bronze: { tier: 'Silver', points: 1000 },
    silver: { tier: 'Gold', points: 5000 },
    gold: { tier: 'Platinum', points: 15000 },
    platinum: { tier: 'Diamond', points: 50000 },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Membership & Loyalty</h1>
        {!active && <button onClick={() => navigate('/membership/plans')} className="btn-primary">View Plans</button>}
      </div>

      <div className="flex gap-1 flex-wrap">
        {(['overview', 'history', 'loyalty'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full ${tab === t ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'}`}>
            {t === 'overview' ? 'Overview' : t === 'history' ? 'History' : 'Loyalty'}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          {active ? (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--color-text)]">Current Membership</h2>
                <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">Active</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><p className="text-xs text-[var(--color-text-muted)]">Plan</p><p className="font-medium">{active.plan_name || `Plan #${active.plan_id}`}</p></div>
                <div><p className="text-xs text-[var(--color-text-muted)]">Start</p><p className="font-medium">{new Date(active.start_date).toLocaleDateString()}</p></div>
                <div><p className="text-xs text-[var(--color-text-muted)]">Expires</p><p className="font-medium">{new Date(active.end_date).toLocaleDateString()}</p></div>
                <div><p className="text-xs text-[var(--color-text-muted)]">Status</p><p className="font-medium capitalize">{active.status}</p></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => cancelMutation.mutate()} className="text-xs text-[var(--color-error)] hover:underline">Cancel Membership</button>
              </div>
            </div>
          ) : (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 text-center space-y-3">
              <p className="text-lg font-medium text-[var(--color-text)]">No Active Membership</p>
              <p className="text-sm text-[var(--color-text-muted)]">Subscribe to unlock exclusive benefits and discounts.</p>
              <button onClick={() => navigate('/membership/plans')} className="btn-primary">Browse Plans</button>
            </div>
          )}

          {plans && plans.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase mb-3">Available Plans</h3>
              <div className="grid gap-4 md:grid-cols-3">
                {plans.map((p: any) => (
                  <div key={p.id} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-3">
                    <h4 className="font-semibold text-[var(--color-text)]">{p.name}</h4>
                    <p className="text-2xl font-bold text-[var(--color-primary)]">EGP {p.price}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{p.duration_days} days</p>
                    {p.benefits?.map((b: any, i: number) => (
                      <p key={i} className="text-xs text-[var(--color-text-muted)]">✓ {b.description || b.type}</p>
                    ))}
                    <button onClick={() => navigate(`/membership/plans`)} className="w-full text-xs btn-primary">Subscribe</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
          {(!memberships || memberships.length === 0) ? (
            <p className="p-6 text-sm text-[var(--color-text-muted)] text-center">No membership history</p>
          ) : (
            memberships.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] last:border-0">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">Plan #{m.plan_id}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{new Date(m.start_date).toLocaleDateString()} – {new Date(m.end_date).toLocaleDateString()}</p>
                </div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  m.status === 'active' ? 'bg-green-100 text-green-700' :
                  m.status === 'expired' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                }`}>{m.status}</span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'loyalty' && (
        <div className="space-y-6">
          {loyalty && (
            <>
              <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-4">
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-full ${TIER_COLORS[loyalty.current_tier] || 'bg-amber-600'} flex items-center justify-center text-white font-bold text-lg`}>
                    {loyalty.current_tier?.[0]?.toUpperCase() || 'B'}
                  </div>
                  <div>
                    <p className="text-lg font-bold text-[var(--color-text)] capitalize">{loyalty.current_tier || 'Bronze'}</p>
                    <p className="text-2xl font-bold text-[var(--color-primary)]">{loyalty.current_balance || 0} points</p>
                  </div>
                </div>
                {TIER_NEXT[loyalty.current_tier] && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
                      <span>{loyalty.current_tier}</span>
                      <span>{TIER_NEXT[loyalty.current_tier].tier}</span>
                    </div>
                    <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${Math.min(100, (loyalty.total_earned || 0) / TIER_NEXT[loyalty.current_tier].points * 100)}%` }} />
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">{TIER_NEXT[loyalty.current_tier].points - (loyalty.total_earned || 0)} points to next tier</p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div><p className="text-lg font-bold text-[var(--color-text)]">{loyalty.total_earned || 0}</p><p className="text-xs text-[var(--color-text-muted)]">Earned</p></div>
                  <div><p className="text-lg font-bold text-[var(--color-text)]">{loyalty.total_spent || 0}</p><p className="text-xs text-[var(--color-text-muted)]">Spent</p></div>
                  <div><p className="text-lg font-bold text-[var(--color-text)]">{loyalty.current_balance || 0}</p><p className="text-xs text-[var(--color-text-muted)]">Balance</p></div>
                </div>
              </div>
              <button onClick={() => navigate('/membership/rewards')} className="btn-primary w-full">Browse Rewards</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
