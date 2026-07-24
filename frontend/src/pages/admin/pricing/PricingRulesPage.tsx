import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pricingApi } from '../../../services/pricing';
import { useToast } from '../../../components/ui/Toast';
import { SkeletonRow } from '../../../components/ui/Skeleton';

export default function PricingRulesPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState<'rules' | 'seasons'>('rules');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ name: '', ruleType: 'percentage_increase', scope: 'global', value: 10, priority: 0 });

  const { data: rules, isLoading: loadingRules } = useQuery({ queryKey: ['admin', 'pricing', 'rules'], queryFn: pricingApi.getRules });
  const { data: seasons, isLoading: loadingSeasons } = useQuery({ queryKey: ['admin', 'pricing', 'seasons'], queryFn: pricingApi.getSeasons });

  const createRule = useMutation({
    mutationFn: pricingApi.createRule,
    onSuccess: () => { showToast('Rule created!', 'success'); qc.invalidateQueries({ queryKey: ['admin', 'pricing'] }); setShowForm(false); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed', 'error'),
  });

  const deleteRule = useMutation({
    mutationFn: pricingApi.deleteRule,
    onSuccess: () => { showToast('Rule deleted', 'info'); qc.invalidateQueries({ queryKey: ['admin', 'pricing'] }); },
  });

  const deleteSeason = useMutation({
    mutationFn: pricingApi.deleteSeason,
    onSuccess: () => { showToast('Season deleted', 'info'); qc.invalidateQueries({ queryKey: ['admin', 'pricing'] }); },
  });

  const RULE_TYPE_LABELS: Record<string, string> = {
    fixed: 'Fixed', percentage_increase: '% Increase', percentage_decrease: '% Decrease',
    multiplier: 'Multiplier', min_price: 'Min Price', max_price: 'Max Price', override: 'Override',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Pricing Rules</h1>
        <div className="flex gap-2">
          {['rules', 'seasons'].map(t => (
            <button key={t} onClick={() => setTab(t as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full ${tab === t ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'}`}>{t === 'rules' ? 'Rules' : 'Seasons'}</button>
          ))}
        </div>
      </div>

      {tab === 'rules' && (
        <>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">{showForm ? 'Cancel' : 'Add Rule'}</button>

          {showForm && (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><label className="text-xs text-[var(--color-text-muted)]">Name</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
                <div><label className="text-xs text-[var(--color-text-muted)]">Type</label>
                  <select value={form.ruleType} onChange={e => setForm({...form, ruleType: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
                    {Object.entries(RULE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
                <div><label className="text-xs text-[var(--color-text-muted)]">Scope</label>
                  <select value={form.scope} onChange={e => setForm({...form, scope: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
                    {['global','organisation','branch','resource'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select></div>
                <div><label className="text-xs text-[var(--color-text-muted)]">Value</label><input type="number" value={form.value} onChange={e => setForm({...form, value: Number(e.target.value)})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
                <div><label className="text-xs text-[var(--color-text-muted)]">Priority</label><input type="number" value={form.priority} onChange={e => setForm({...form, priority: Number(e.target.value)})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
              </div>
              <button onClick={() => createRule.mutate(form)} disabled={createRule.isPending || !form.name} className="btn-primary text-sm">Create</button>
            </div>
          )}

          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
            {loadingRules ? <SkeletonRow count={4} /> : (!rules || rules.length === 0) ? (
              <p className="p-6 text-sm text-[var(--color-text-muted)] text-center">No pricing rules yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                  <th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Type</th><th className="text-left px-4 py-3">Scope</th><th className="text-left px-4 py-3">Value</th><th className="text-left px-4 py-3">Priority</th><th className="text-left px-4 py-3">Active</th><th className="text-left px-4 py-3"></th>
                </tr></thead>
                <tbody>{rules.map((r: any) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]">
                    <td className="px-4 py-3 text-[var(--color-text)]">{r.name}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{RULE_TYPE_LABELS[r.rule_type] || r.rule_type}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{r.scope}</td>
                    <td className="px-4 py-3 font-medium">{r.value}</td>
                    <td className="px-4 py-3">{r.priority}</td>
                    <td className="px-4 py-3">{r.is_active ? <span className="text-green-600">✓</span> : <span className="text-red-600">✗</span>}</td>
                    <td className="px-4 py-3"><button onClick={() => deleteRule.mutate(r.id)} className="text-xs text-[var(--color-error)] hover:underline">Delete</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'seasons' && (
        <>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">{showForm ? 'Cancel' : 'Add Season'}</button>

          {showForm && (
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-[var(--color-text-muted)]">Name</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
                <div><label className="text-xs text-[var(--color-text-muted)]">Multiplier</label><input type="number" step="0.1" value={form.multiplier} onChange={e => setForm({...form, multiplier: Number(e.target.value)})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
                <div><label className="text-xs text-[var(--color-text-muted)]">Start</label><input type="date" onChange={e => setForm({...form, dateRange: { ...form.dateRange, start: e.target.value }})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
                <div><label className="text-xs text-[var(--color-text-muted)]">End</label><input type="date" onChange={e => setForm({...form, dateRange: { ...form.dateRange, end: e.target.value }})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
              </div>
              <button onClick={() => pricingApi.createSeason(form).then(() => { qc.invalidateQueries({ queryKey: ['admin', 'pricing'] }); setShowForm(false); showToast('Season created!', 'success'); }).catch((e: any) => showToast(e?.response?.data?.message || 'Failed', 'error'))}
                disabled={!form.name} className="btn-primary text-sm">Create</button>
            </div>
          )}

          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
            {loadingSeasons ? <SkeletonRow count={3} /> : (!seasons || seasons.length === 0) ? (
              <p className="p-6 text-sm text-[var(--color-text-muted)] text-center">No seasons yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                  <th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Multiplier</th><th className="text-left px-4 py-3">Start</th><th className="text-left px-4 py-3">End</th><th className="text-left px-4 py-3">Active</th><th className="text-left px-4 py-3"></th>
                </tr></thead>
                <tbody>{seasons.map((s: any) => (
                  <tr key={s.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-3 text-[var(--color-text)]">{s.name}</td>
                    <td className="px-4 py-3 font-medium">{s.multiplier}x</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{new Date(s.date_start).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{new Date(s.date_end).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{s.is_active ? <span className="text-green-600">✓</span> : <span className="text-red-600">✗</span>}</td>
                    <td className="px-4 py-3"><button onClick={() => deleteSeason.mutate(s.id)} className="text-xs text-[var(--color-error)] hover:underline">Delete</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
