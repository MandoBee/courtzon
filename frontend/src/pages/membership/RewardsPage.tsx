import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { membershipApi } from '../../services/membership';
import { useToast } from '../../components/ui/Toast';
import { Skeleton, SkeletonRow } from '../../components/ui/Skeleton';

export default function RewardsPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data: rewards, isLoading } = useQuery({ queryKey: ['membership', 'rewards'], queryFn: membershipApi.getRewards });
  const { data: loyalty } = useQuery({ queryKey: ['membership', 'loyalty'], queryFn: membershipApi.getLoyalty });

  const claim = useMutation({
    mutationFn: membershipApi.claimReward,
    onSuccess: () => { showToast('Reward claimed!', 'success'); qc.invalidateQueries({ queryKey: ['membership'] }); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Claim failed', 'error'),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton width={220} height={28} /><SkeletonRow count={6} /></div>;

  const REWARD_ICONS: Record<string, string> = {
    wallet_credit: '💰', coupon: '🎫', free_booking: '🎾',
    free_session: '🏋️', voucher: '🏷️', merchandise: '👕', tournament_ticket: '🏆',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Rewards Catalog</h1>
        {loyalty && <p className="text-sm text-[var(--color-primary)] font-medium">{loyalty.current_balance} points available</p>}
      </div>

      {(!rewards || rewards.length === 0) ? (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-muted)]">No rewards available yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rewards.map((r: any) => (
            <div key={r.id} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-3">
              <div className="text-3xl">{REWARD_ICONS[r.reward_type] || '🎁'}</div>
              <h3 className="font-semibold text-[var(--color-text)]">{r.name}</h3>
              {r.description && <p className="text-xs text-[var(--color-text-muted)]">{r.description}</p>}
              <p className="text-lg font-bold text-[var(--color-primary)]">{r.points_cost} pts</p>
              <p className="text-xs text-[var(--color-text-muted)]">Value: EGP {r.reward_value} • {r.quantity} left</p>
              <button onClick={() => claim.mutate(r.id)} disabled={claim.isPending || (loyalty?.current_balance || 0) < r.points_cost || r.quantity <= 0}
                className="w-full py-2 text-xs font-medium text-white bg-[var(--color-primary)] rounded-xl hover:opacity-90 disabled:opacity-30">
                {r.quantity <= 0 ? 'Sold Out' : claim.isPending ? 'Claiming...' : (loyalty?.current_balance || 0) < r.points_cost ? 'Not enough points' : 'Claim'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
