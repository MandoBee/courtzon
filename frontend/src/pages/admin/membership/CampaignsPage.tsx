import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { membershipApi } from '../../../services/membership';
import { useToast } from '../../../components/ui/Toast';
import { SkeletonRow } from '../../../components/ui/Skeleton';

export default function CampaignsPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ name: '', pointsMultiplier: 2, startDate: '', endDate: '' });

  const { data: campaigns, isLoading } = useQuery({ queryKey: ['admin', 'campaigns'], queryFn: membershipApi.adminGetCampaigns });

  const create = useMutation({
    mutationFn: membershipApi.adminCreateCampaign,
    onSuccess: () => { showToast('Campaign created!', 'success'); qc.invalidateQueries({ queryKey: ['admin', 'campaigns'] }); setShowForm(false); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed', 'error'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Loyalty Campaigns</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">{showForm ? 'Cancel' : 'Create Campaign'}</button>
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-[var(--color-text-muted)]">Name</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Points Multiplier</label><input type="number" step="0.5" value={form.pointsMultiplier} onChange={e => setForm({...form, pointsMultiplier: Number(e.target.value)})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Start</label><input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">End</label><input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
          </div>
          <button onClick={() => create.mutate(form)} disabled={create.isPending || !form.name} className="btn-primary text-sm">Create</button>
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        {isLoading ? <SkeletonRow count={3} /> : (!campaigns || campaigns.length === 0) ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)] text-center">No campaigns yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
              <th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Multiplier</th><th className="text-left px-4 py-3">Start</th><th className="text-left px-4 py-3">End</th><th className="text-left px-4 py-3">Active</th>
            </tr></thead>
            <tbody>{campaigns.map((c: any) => (
              <tr key={c.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-3 text-[var(--color-text)]">{c.name}</td>
                <td className="px-4 py-3 font-medium">{c.points_multiplier}x</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{new Date(c.start_date).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{new Date(c.end_date).toLocaleDateString()}</td>
                <td className="px-4 py-3">{c.is_active ? <span className="text-green-600">✓</span> : <span className="text-red-600">✗</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
