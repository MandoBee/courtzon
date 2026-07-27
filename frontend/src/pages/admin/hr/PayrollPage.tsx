import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

const RUN_STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  calculated: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  posted: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  closed: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const COMP_CALC_TYPES = ['fixed', 'hourly', 'percentage', 'formula'];

export default function PayrollPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState<'runs' | 'components'>('runs');
  const [showRunForm, setShowRunForm] = useState(false);
  const [showCompForm, setShowCompForm] = useState(false);
  const [editingComp, setEditingComp] = useState<any>(null);
  const [runForm, setRunForm] = useState({ period_start: '', period_end: '', employee_ids: [] as number[] });
  const [compForm, setCompForm] = useState({ name: '', type: 'earning' as string, calculation_type: 'fixed' as string, default_amount: 0 });
  const [actionTarget, setActionTarget] = useState<{ id: number; action: string } | null>(null);

  const { data: runsData, isLoading: loadingRuns } = useQuery({
    queryKey: ['admin', 'hr', 'payroll', 'runs'],
    queryFn: () => api.get('/admin/hr/payroll/runs').then((r: any) => r.data.data || r.data),
    enabled: tab === 'runs',
  });

  const { data: compsData, isLoading: loadingComps } = useQuery({
    queryKey: ['admin', 'hr', 'payroll', 'components'],
    queryFn: () => api.get('/admin/hr/payroll/components').then((r: any) => r.data.data || r.data),
    enabled: tab === 'components',
  });

  const { data: employees } = useQuery({
    queryKey: ['admin', 'hr', 'employees-simple'],
    queryFn: () => api.get('/admin/hr/employees?limit=200').then((r: any) => r.data.data || []),
    staleTime: 60000,
  });

  const runs: any[] = runsData || [];
  const comps: any[] = compsData || [];
  const empList: any[] = employees || [];

  const createRunMutation = useMutation({
    mutationFn: (payload: any) => api.post('/admin/hr/payroll/runs', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'payroll', 'runs'] }); setShowRunForm(false); setRunForm({ period_start: '', period_end: '', employee_ids: [] }); showToast('Payroll run created!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: any) => api.post(`/admin/hr/payroll/runs/${id}/${action}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'payroll', 'runs'] }); setActionTarget(null); showToast(`Run ${actionTarget?.action}ed!`); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const createCompMutation = useMutation({
    mutationFn: (payload: any) => api.post('/admin/hr/payroll/components', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'payroll', 'components'] }); setShowCompForm(false); setEditingComp(null); setCompForm({ name: '', type: 'earning', calculation_type: 'fixed', default_amount: 0 }); showToast('Component created!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const updateCompMutation = useMutation({
    mutationFn: ({ id, payload }: any) => api.put(`/admin/hr/payroll/components/${id}`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'payroll', 'components'] }); setShowCompForm(false); setEditingComp(null); setCompForm({ name: '', type: 'earning', calculation_type: 'fixed', default_amount: 0 }); showToast('Component updated!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const deleteCompMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/hr/payroll/components/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'payroll', 'components'] }); showToast('Component deleted!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const allowedActions = (status: string): string[] => {
    const map: Record<string, string[]> = {
      draft: ['calculate'],
      calculated: ['approve'],
      approved: ['post'],
      posted: ['mark-paid'],
      paid: ['close'],
    };
    return map[status] || [];
  };

  return (
    <Can permission="hr.payroll.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-1 bg-[var(--color-bg)] rounded-[var(--radius-lg)] p-1 border">
            <button onClick={() => setTab('runs')}
              className={`px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors ${tab === 'runs' ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-text)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
              Payroll Runs
            </button>
            <button onClick={() => setTab('components')}
              className={`px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors ${tab === 'components' ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-text)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
              Components
            </button>
          </div>
          <Can permission="hr.payroll.manage">
            {tab === 'runs' && <Button onClick={() => setShowRunForm(true)}>+ New Run</Button>}
            {tab === 'components' && <Button onClick={() => { setEditingComp(null); setCompForm({ name: '', type: 'earning', calculation_type: 'fixed', default_amount: 0 }); setShowCompForm(true); }}>+ New Component</Button>}
          </Can>
        </div>

        {tab === 'runs' && (
          loadingRuns ? <Spinner /> : (
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Period</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Total Gross</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Total Net</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Employee Count</th>
                    <Can permission="hr.payroll.manage">
                      <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                    </Can>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {runs.map((r: any) => (
                    <tr key={r.id} className="hover:bg-[var(--color-bg)]/30">
                      <td className="px-4 py-3 text-[var(--color-text)]">
                        {r.period_start ? new Date(r.period_start).toLocaleDateString('en-GB') : '—'} — {r.period_end ? new Date(r.period_end).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${RUN_STATUS_BADGE[r.status] || ''}`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-muted)]">{r.total_gross != null ? Number(r.total_gross).toLocaleString('en-GB') : '—'}</td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-muted)]">{r.total_net != null ? Number(r.total_net).toLocaleString('en-GB') : '—'}</td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-muted)]">{r.employee_count ?? '—'}</td>
                      <Can permission="hr.payroll.manage">
                        <td className="px-4 py-3 text-right">
                          {allowedActions(r.status).map((action) => (
                            <button key={action}
                              onClick={() => setActionTarget({ id: r.id, action })}
                              className="text-xs text-[var(--color-primary)] hover:underline ml-2">
                              {action === 'mark-paid' ? 'Mark Paid' : action.charAt(0).toUpperCase() + action.slice(1)}
                            </button>
                          ))}
                        </td>
                      </Can>
                    </tr>
                  ))}
                  {!runs.length && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--color-text-muted)]">No payroll runs found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === 'components' && (
          loadingComps ? <Spinner /> : (
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Calculation</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Default Amount</th>
                    <Can permission="hr.payroll.manage">
                      <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                    </Can>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {comps.map((c: any) => (
                    <tr key={c.id} className="hover:bg-[var(--color-bg)]/30">
                      <td className="px-4 py-3 text-sm text-[var(--color-text)]">{c.name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${c.type === 'earning' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {c.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{c.calculation_type || 'fixed'}</td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-muted)]">{c.default_amount != null ? Number(c.default_amount).toLocaleString('en-GB') : '—'}</td>
                      <Can permission="hr.payroll.manage">
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => { setEditingComp(c); setCompForm({ name: c.name, type: c.type, calculation_type: c.calculation_type || 'fixed', default_amount: c.default_amount ?? 0 }); setShowCompForm(true); }}
                            className="text-xs text-[var(--color-primary)] hover:underline mr-2">Edit</button>
                          <button onClick={() => { if (confirm('Delete this component?')) deleteCompMutation.mutate(c.id); }}
                            className="text-xs text-[var(--color-error)] hover:underline">Delete</button>
                        </td>
                      </Can>
                    </tr>
                  ))}
                  {!comps.length && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--color-text-muted)]">No components found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )
        )}

        <Modal open={showRunForm} onClose={() => setShowRunForm(false)} title="New Payroll Run">
          <form onSubmit={(e) => { e.preventDefault(); if (!runForm.period_start || !runForm.period_end) return; createRunMutation.mutate(runForm); }}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Period Start *</label>
                  <input value={runForm.period_start} onChange={e => setRunForm({ ...runForm, period_start: e.target.value })} type="date" required
                    className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Period End *</label>
                  <input value={runForm.period_end} onChange={e => setRunForm({ ...runForm, period_end: e.target.value })} type="date" required
                    className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Select Employees</label>
                <div className="max-h-40 overflow-y-auto border rounded-[var(--radius-md)] p-2 bg-[var(--color-bg)]">
                  {empList.map((e: any) => (
                    <label key={e.id} className="flex items-center gap-2 text-sm py-1">
                      <input type="checkbox" checked={runForm.employee_ids.includes(e.id)}
                        onChange={() => setRunForm(prev => ({
                          ...prev,
                          employee_ids: prev.employee_ids.includes(e.id)
                            ? prev.employee_ids.filter(id => id !== e.id)
                            : [...prev.employee_ids, e.id],
                        }))}
                        className="rounded border-[var(--color-border)]" />
                      {e.full_name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="ghost" type="button" onClick={() => setShowRunForm(false)}>Cancel</Button>
              <Button type="submit" loading={createRunMutation.isPending}>Create</Button>
            </div>
          </form>
        </Modal>

        <Modal open={showCompForm} onClose={() => { setShowCompForm(false); setEditingComp(null); }} title={editingComp ? 'Edit Component' : 'New Component'}>
          <form onSubmit={(e) => { e.preventDefault(); if (!compForm.name) return; if (editingComp) { updateCompMutation.mutate({ id: editingComp.id, payload: compForm }); } else { createCompMutation.mutate(compForm); } }}>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
                <input value={compForm.name} onChange={e => setCompForm({ ...compForm, name: e.target.value })} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Type</label>
                <select value={compForm.type} onChange={e => setCompForm({ ...compForm, type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="earning">Earning</option>
                  <option value="deduction">Deduction</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Calculation Type</label>
                <select value={compForm.calculation_type} onChange={e => setCompForm({ ...compForm, calculation_type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  {COMP_CALC_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Default Amount</label>
                <input value={compForm.default_amount} onChange={e => setCompForm({ ...compForm, default_amount: Number(e.target.value) })} type="number" step="0.01"
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="ghost" type="button" onClick={() => { setShowCompForm(false); setEditingComp(null); }}>Cancel</Button>
              <Button type="submit" loading={createCompMutation.isPending || updateCompMutation.isPending}>
                {editingComp ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Modal>

        <Modal open={actionTarget !== null} onClose={() => setActionTarget(null)}
          title={`${actionTarget?.action === 'mark-paid' ? 'Mark Paid' : (actionTarget?.action ? actionTarget.action.charAt(0).toUpperCase() + actionTarget.action.slice(1) : '')} Payroll Run`}>
          <p className="text-sm text-[var(--color-text-muted)] mb-6">
            Are you sure you want to {actionTarget?.action === 'mark-paid' ? 'mark as paid' : actionTarget?.action} this payroll run?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setActionTarget(null)}>Cancel</Button>
            <Button onClick={() => actionMutation.mutate({ id: actionTarget!.id, action: actionTarget!.action })}
              loading={actionMutation.isPending}
              className="bg-[var(--color-primary)] text-white">Confirm</Button>
          </div>
        </Modal>
      </div>
    </Can>
  );
}
