import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { membershipApi } from '../../../services/membership';
import { useToast } from '../../../components/ui/Toast';
import { SkeletonRow } from '../../../components/ui/Skeleton';

export default function RewardsAdminPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ name: '', pointsCost: 100, rewardType: 'wallet_credit', rewardValue: 50, quantity: 10 });

  const { data: rewards, isLoading } = useQuery({ queryKey: ['admin', 'rewards'], queryFn: membershipApi.getRewards });

  const create = useMutation({
    mutationFn: membershipApi.adminCreateReward,
    onSuccess: () => { showToast('Reward created!', 'success'); qc.invalidateQueries({ queryKey: ['admin', 'rewards'] }); setShowForm(false); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed', 'error'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Rewards Catalog</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">{showForm ? 'Cancel' : 'Add Reward'}</button>
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-[var(--color-text-muted)]">Name</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Type</label>
              <select value={form.rewardType} onChange={e => setForm({...form, rewardType: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
                {['wallet_credit','coupon','free_booking','free_session','voucher','merchandise','tournament_ticket'].map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Points Cost</label><input type="number" value={form.pointsCost} onChange={e => setForm({...form, pointsCost: Number(e.target.value)})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Value (EGP)</label><input type="number" value={form.rewardValue} onChange={e => setForm({...form, rewardValue: Number(e.target.value)})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Quantity</label><input type="number" value={form.quantity} onChange={e => setForm({...form, quantity: Number(e.target.value)})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
          </div>
          <button onClick={() => create.mutate(form)} disabled={create.isPending || !form.name} className="btn-primary text-sm">Create</button>
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        {isLoading ? <SkeletonRow count={3} /> : (!rewards || rewards.length === 0) ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)] text-center">No rewards created yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
              <th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Type</th><th className="text-left px-4 py-3">Points</th><th className="text-left px-4 py-3">Value</th><th className="text-left px-4 py-3">Qty</th><th className="text-left px-4 py-3">Active</th>
            </tr></thead>
            <tbody>{rewards.map((r: any) => (
              <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-3 text-[var(--color-text)]">{r.name}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.reward_type}</td>
                <td className="px-4 py-3 font-medium">{r.points_cost}</td>
                <td className="px-4 py-3">EGP {r.reward_value}</td>
                <td className="px-4 py-3">{r.quantity}</td>
                <td className="px-4 py-3">{r.is_active ? <span className="text-green-600">✓</span> : <span className="text-red-600">✗</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
