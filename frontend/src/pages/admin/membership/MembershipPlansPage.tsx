import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  membershipApi,
  type AdminMembershipPlanInput,
  MEMBERSHIP_PLAN_DURATION_TYPE_OPTIONS,
  MEMBERSHIP_PLAN_TYPE_OPTIONS,
} from '../../../services/membership';
import { useToast } from '../../../components/ui/Toast';
import { SkeletonRow } from '../../../components/ui/Skeleton';

export default function MembershipPlansPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AdminMembershipPlanInput>({
    code: '',
    name: '',
    category: 'general',
    duration_type: 'months',
    duration_value: 1,
    plan_type: 'monthly',
    duration_days: 30,
    price: 0,
    currency: 'EGP',
    status: 'active',
  });

  const { data: plans, isLoading } = useQuery({ queryKey: ['admin', 'membership', 'plans'], queryFn: membershipApi.adminGetPlans });

  const createPlan = useMutation({
    mutationFn: membershipApi.adminCreatePlan,
    onSuccess: () => { showToast('Plan created!', 'success'); qc.invalidateQueries({ queryKey: ['admin', 'membership'] }); setShowForm(false); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed', 'error'),
  });

  if (isLoading) return <SkeletonRow count={5} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Membership Plans</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          {showForm ? 'Cancel' : 'Create Plan'}
        </button>
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-[var(--color-text-muted)]">Code</label><input value={form.code} onChange={e => setForm({...form, code: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Name</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Category</label><input value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Plan type</label>
              <select value={form.plan_type} onChange={e => setForm({...form, plan_type: e.target.value as AdminMembershipPlanInput['plan_type']})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
                {MEMBERSHIP_PLAN_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Duration type</label>
              <select value={form.duration_type} onChange={e => setForm({...form, duration_type: e.target.value as AdminMembershipPlanInput['duration_type']})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
                {MEMBERSHIP_PLAN_DURATION_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Duration value</label><input type="number" min={1} value={form.duration_value} onChange={e => setForm({...form, duration_value: Number(e.target.value)})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Duration (days)</label><input type="number" min={1} value={form.duration_days} onChange={e => setForm({...form, duration_days: Number(e.target.value)})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Price (EGP)</label><input type="number" value={form.price} onChange={e => setForm({...form, price: Number(e.target.value)})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
          </div>
          <button onClick={() => createPlan.mutate(form)} disabled={createPlan.isPending || !form.name || !form.code} className="btn-primary text-sm">
            {createPlan.isPending ? 'Creating...' : 'Create Plan'}
          </button>
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        {(!plans || plans.length === 0) ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)] text-center">No plans created yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
              <th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Type</th><th className="text-left px-4 py-3">Duration</th><th className="text-left px-4 py-3">Price</th><th className="text-left px-4 py-3">Active</th>
            </tr></thead>
            <tbody>{plans.map((p: any) => (
              <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]">
                <td className="px-4 py-3 text-[var(--color-text)]">{p.name}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{p.plan_type}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{p.duration_days} days</td>
                <td className="px-4 py-3 font-medium">EGP {p.price}</td>
                <td className="px-4 py-3">{p.is_active ? <span className="text-green-600">✓</span> : <span className="text-red-600">✗</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
