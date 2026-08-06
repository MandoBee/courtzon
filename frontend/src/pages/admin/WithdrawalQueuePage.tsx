import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Modal, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { getErrorMessage } from '../../utils/errors';

const STATUSES = ['pending', 'under_review', 'approved', 'rejected', 'processing', 'completed', 'cancelled'];
const FILTERS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'dueToday', label: 'Due Today' },
  { key: 'unassigned', label: 'Unassigned' },
];

function slaBadge(slaDueAt: string|null, status: string) {
  if (!slaDueAt || ['completed','rejected','cancelled'].includes(status)) return null;
  const due = new Date(slaDueAt).getTime();
  const now = Date.now();
  const diffMs = due - now;
  const diffHrs = diffMs / (1000*60*60);
  if (diffMs < 0) return <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-100 text-red-800 font-medium">Overdue</span>;
  if (diffHrs <= 4) return <span className="px-1.5 py-0.5 text-[10px] rounded bg-orange-100 text-orange-800 font-medium">Due Soon</span>;
  return <span className="px-1.5 py-0.5 text-[10px] rounded bg-green-100 text-green-800 font-medium">On Time</span>;
}

function statusBadge(s: string) {
  const map: Record<string,string> = { pending: 'bg-yellow-100 text-yellow-800', under_review: 'bg-blue-100 text-blue-800', approved: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-800', processing: 'bg-purple-100 text-purple-800', completed: 'bg-green-200 text-green-900', cancelled: 'bg-gray-200 text-gray-700' };
  return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${map[s] || 'bg-gray-100'}`}>{s.replace(/_/g, ' ')}</span>;
}

export default function WithdrawalQueuePage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);
  const [activeFilters, setActiveFilters] = useState<Record<string,boolean>>({});

  const toggleFilter = (key: string) => setActiveFilters(p => ({ ...p, [key]: !p[key] }));

  const { data, isLoading } = useQuery({
    queryKey: ['admin-withdrawals', filter, search, page, activeFilters],
    queryFn: () => api.get('/admin/withdrawals', { params: { status: filter||undefined, search: search||undefined, page, limit: 20, ...Object.fromEntries(Object.entries(activeFilters).filter(([,v]) => v)) } }).then(r => r.data),
  });

  const { data: stats } = useQuery({ queryKey: ['withdrawal-stats'], queryFn: () => api.get('/withdrawals/stats').then(r => r.data?.data) });
  const { data: admins = [] } = useQuery({ queryKey: ['assignable-admins'], queryFn: () => api.get('/admin/withdrawals/assignable-admins').then(r => r.data?.data || []) });

  const transitionMutation = useMutation({
    mutationFn: ({ id, toStatus, ...rest }: any) => api.put(`/admin/withdrawals/${id}/transition`, { toStatus, ...rest }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-withdrawals'] }); qc.invalidateQueries({ queryKey: ['withdrawal-stats'] }); setSelected(null); showToast('Updated!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, assignedTo }: { id: number; assignedTo: number }) => api.put(`/admin/withdrawals/${id}/assign`, { assignedTo }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-withdrawals'] }); setSelected((p: any) => p ? { ...p, assigned_to: 0, assigned_name: '' } : p); showToast('Assigned!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Withdrawal Queue</h1>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card className="p-3"><div className="text-[10px] text-muted">Pending</div><div className="font-bold text-sm">{formatPrice(stats.pendingAmount)}</div><div className="text-[10px]">{stats.pendingCount} reqs</div></Card>
          <Card className="p-3"><div className="text-[10px] text-muted">Due Today</div><div className="font-bold text-sm text-orange-600">{stats.dueTodayCount ?? 0}</div></Card>
          <Card className="p-3"><div className="text-[10px] text-muted">Overdue</div><div className="font-bold text-sm text-red-600">{stats.overdueCount ?? 0}</div></Card>
          <Card className="p-3"><div className="text-[10px] text-muted">Completed (30d)</div><div className="font-bold text-sm">{formatPrice(stats.completedAmount)}</div></Card>
          <Card className="p-3"><div className="text-[10px] text-muted">Approval Rate</div><div className="font-bold text-sm">{stats.approvalRate}%</div></Card>
          <Card className="p-3"><div className="text-[10px] text-muted">Avg Resolution</div><div className="font-bold text-sm">{stats.avgResolutionMinutes ? `${Math.round(stats.avgResolutionMinutes/60)}h` : '—'}</div></Card>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search user..." className="px-3 py-2 rounded border text-sm flex-1 min-w-[180px] max-w-xs" />
        <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded border text-sm">
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => toggleFilter(f.key)} className={`px-3 py-2 rounded border text-xs ${activeFilters[f.key] ? 'bg-primary/10 border-primary text-primary' : 'text-muted'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? <Spinner /> : !data?.data?.length ? <Card className="p-4 text-center text-sm text-muted">No withdrawal requests.</Card> : (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs text-muted">
              <th className="text-left px-3 py-2">User</th><th className="text-right px-3 py-2">Amount</th><th className="text-center px-3 py-2">Status</th><th className="text-center px-3 py-2">SLA</th><th className="text-left px-3 py-2">Assigned</th><th className="text-left px-3 py-2">Date</th><th className="text-right px-3 py-2">Actions</th>
            </tr></thead>
            <tbody>
              {data.data.map((w: any) => (
                <tr key={w.id} className="border-b hover:bg-bg cursor-pointer" onClick={() => setSelected(w)}>
                  <td className="px-3 py-2"><div className="font-medium">{w.full_name}</div><div className="text-[10px] text-muted">{w.email}</div></td>
                  <td className="px-3 py-2 text-right font-medium">{formatPrice(Number(w.amount))}</td>
                  <td className="px-3 py-2 text-center">{statusBadge(w.status)}</td>
                  <td className="px-3 py-2 text-center">{slaBadge(w.sla_due_at, w.status)}</td>
                  <td className="px-3 py-2 text-xs">
                    {w.assigned_name || <button className="text-primary hover:underline" onClick={(e) => { e.stopPropagation(); const a = admins[0]; if (a) assignMutation.mutate({ id: w.id, assignedTo: a.id }); }}>Assign</button>}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-muted">{new Date(w.created_at).toLocaleDateString('en-GB')}</td>
                  <td className="px-3 py-2 text-right">
                    {w.status === 'pending' && <Button size="sm" onClick={(e) => { e.stopPropagation(); transitionMutation.mutate({ id: w.id, toStatus: 'under_review' }); }} className="!text-[10px] !px-2 !py-1">Review</Button>}
                    {w.status === 'under_review' && <><Button size="sm" onClick={(e) => { e.stopPropagation(); transitionMutation.mutate({ id: w.id, toStatus: 'approved' }); }} className="!text-[10px] !px-2 !py-1 mr-1">Approve</Button><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); transitionMutation.mutate({ id: w.id, toStatus: 'rejected' }); }} className="!text-[10px] !px-2 !py-1 !text-red-600">Reject</Button></>}
                    {w.status === 'approved' && <Button size="sm" onClick={(e) => { e.stopPropagation(); transitionMutation.mutate({ id: w.id, toStatus: 'processing' }); }} className="!text-[10px] !px-2 !py-1">Process</Button>}
                    {w.status === 'processing' && <Button size="sm" onClick={(e) => { e.stopPropagation(); const m = prompt('Execution method (Bank Transfer/Cash/Other):'); if (m) { const r = prompt('Reference number (optional):'); transitionMutation.mutate({ id: w.id, toStatus: 'completed', executionMethod: m, referenceNumber: r || undefined }); } }} className="!text-[10px] !px-2 !py-1">Complete</Button>}
                    {(w.status === 'pending' || w.status === 'under_review') && <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); if (confirm('Cancel?')) transitionMutation.mutate({ id: w.id, toStatus: 'cancelled' }); }} className="!text-[10px] !px-2 !py-1 !text-gray-500">Cancel</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title={`Withdrawal #${selected.id}`} size="lg">
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-[10px] text-muted">User</label><div className="font-medium">{selected.full_name}</div></div>
              <div><label className="text-[10px] text-muted">Email</label><div className="text-xs">{selected.email}</div></div>
              <div><label className="text-[10px] text-muted">Assigned</label><div className="text-xs">
                {selected.assigned_name || 'Unassigned'}
                {admins.length > 1 && <select className="ml-2 text-[10px] border rounded px-1" onChange={(e) => { if (e.target.value) assignMutation.mutate({ id: selected.id, assignedTo: Number(e.target.value) }); }} value=""><option value="">Reassign...</option>{admins.filter((a:any) => a.id !== selected.assigned_to).map((a:any) => <option key={a.id} value={a.id}>{a.full_name}</option>)}</select>}
              </div></div>
              <div><label className="text-[10px] text-muted">Amount</label><div className="font-bold">{formatPrice(Number(selected.amount))}</div></div>
              <div><label className="text-[10px] text-muted">Status</label><div>{statusBadge(selected.status)}</div></div>
              <div><label className="text-[10px] text-muted">SLA</label><div className="text-xs">{selected.sla_due_at ? new Date(selected.sla_due_at).toLocaleString('en-GB') : '—'} {slaBadge(selected.sla_due_at, selected.status)}</div></div>
              <div><label className="text-[10px] text-muted">Submitted</label><div className="text-xs">{selected.submitted_at ? new Date(selected.submitted_at).toLocaleString('en-GB') : new Date(selected.created_at).toLocaleString('en-GB')}</div></div>
              <div><label className="text-[10px] text-muted">Wallet</label><div>{formatPrice(Number(selected.wallet_balance))}</div></div>
              <div><label className="text-[10px] text-muted">Reserved</label><div>{formatPrice(Number(selected.reserved_balance))}</div></div>
            </div>
            <div><label className="text-[10px] text-muted">Reason</label><div>{selected.reason || '—'}</div></div>
            {selected.player_notes && <div><label className="text-[10px] text-muted">Player Notes</label><div className="text-xs">{selected.player_notes}</div></div>}
            {selected.resolution_notes && <div><label className="text-[10px] text-muted">Resolution Notes</label><div className="text-xs whitespace-pre-wrap">{selected.resolution_notes}</div></div>}
            {selected.execution_method && <div><label className="text-[10px] text-muted">Execution</label><div className="text-xs">{selected.execution_method}{selected.reference_number ? ` (Ref: ${selected.reference_number})` : ''}</div></div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
