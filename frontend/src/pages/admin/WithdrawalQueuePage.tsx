import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Modal, Spinner } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { getErrorMessage } from '../../utils/errors';

const STATUSES = ['pending', 'under_review', 'approved', 'rejected', 'processing', 'completed', 'cancelled'];

export default function WithdrawalQueuePage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-withdrawals', filter, search, page],
    queryFn: () => api.get('/admin/withdrawals', { params: { status: filter || undefined, search: search || undefined, page, limit: 20 } }).then(r => r.data),
  });

  const transitionMutation = useMutation({
    mutationFn: ({ id, toStatus, ...rest }: any) => api.put(`/admin/withdrawals/${id}/transition`, { toStatus, ...rest }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-withdrawals'] }); setSelected(null); showToast('Updated!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { pending: 'bg-yellow-100 text-yellow-800', under_review: 'bg-blue-100 text-blue-800', approved: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-800', processing: 'bg-purple-100 text-purple-800', completed: 'bg-green-200 text-green-900', cancelled: 'bg-gray-200 text-gray-700' };
    return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${map[s] || 'bg-gray-100'}`}>{s.replace(/_/g, ' ')}</span>;
  };

  const { data: stats } = useQuery({ queryKey: ['withdrawal-stats'], queryFn: () => api.get('/withdrawals/stats').then(r => r.data?.data) });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Withdrawal Queue</h1>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3"><div className="text-xs text-muted">Pending</div><div className="font-bold">{formatPrice(stats.pendingAmount)}</div><div className="text-xs">{stats.pendingCount} requests</div></Card>
          <Card className="p-3"><div className="text-xs text-muted">Completed (30d)</div><div className="font-bold">{formatPrice(stats.completedAmount)}</div><div className="text-xs">{stats.completedCount} requests</div></Card>
          <Card className="p-3"><div className="text-xs text-muted">Approval Rate</div><div className="font-bold">{stats.approvalRate}%</div></Card>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search user..." className="px-3 py-2 rounded border text-sm flex-1 min-w-[200px]" />
        <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded border text-sm">
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {isLoading ? <Spinner /> : !data?.data?.length ? <Card className="p-4 text-center text-sm text-muted">No withdrawal requests.</Card> : (
        <div className="bg-surface rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs text-muted">
              <th className="text-left px-3 py-2">User</th><th className="text-right px-3 py-2">Amount</th><th className="text-center px-3 py-2">Status</th><th className="text-left px-3 py-2">Date</th><th className="text-right px-3 py-2">Actions</th>
            </tr></thead>
            <tbody>
              {data.data.map((w: any) => (
                <tr key={w.id} className="border-b hover:bg-bg cursor-pointer" onClick={() => setSelected(w)}>
                  <td className="px-3 py-2"><div className="font-medium">{w.full_name}</div><div className="text-xs text-muted">{w.email}</div></td>
                  <td className="px-3 py-2 text-right font-medium">{formatPrice(Number(w.amount))}</td>
                  <td className="px-3 py-2 text-center">{statusBadge(w.status)}</td>
                  <td className="px-3 py-2 text-xs text-muted">{new Date(w.created_at).toLocaleDateString('en-GB')}</td>
                  <td className="px-3 py-2 text-right">
                    {w.status === 'pending' && <Button size="sm" onClick={(e: any) => { e.stopPropagation(); transitionMutation.mutate({ id: w.id, toStatus: 'under_review' }); }} className="!text-xs !px-2 !py-1">Review</Button>}
                    {w.status === 'under_review' && <><Button size="sm" onClick={(e: any) => { e.stopPropagation(); transitionMutation.mutate({ id: w.id, toStatus: 'approved' }); }} className="!text-xs !px-2 !py-1 mr-1">Approve</Button><Button size="sm" variant="ghost" onClick={(e: any) => { e.stopPropagation(); transitionMutation.mutate({ id: w.id, toStatus: 'rejected' }); }} className="!text-xs !px-2 !py-1 !text-red-600">Reject</Button></>}
                    {w.status === 'approved' && <Button size="sm" onClick={(e: any) => { e.stopPropagation(); transitionMutation.mutate({ id: w.id, toStatus: 'processing' }); }} className="!text-xs !px-2 !py-1">Process</Button>}
                    {w.status === 'processing' && <Button size="sm" onClick={(e: any) => { e.stopPropagation(); const m = prompt('Execution method (Bank Transfer/Cash/Other):'); if (m) { const r = prompt('Reference number (optional):'); transitionMutation.mutate({ id: w.id, toStatus: 'completed', executionMethod: m, referenceNumber: r || undefined }); } }} className="!text-xs !px-2 !py-1">Complete</Button>}
                    {(w.status === 'pending' || w.status === 'under_review') && <Button size="sm" variant="ghost" onClick={(e: any) => { e.stopPropagation(); if (confirm('Cancel?')) transitionMutation.mutate({ id: w.id, toStatus: 'cancelled' }); }} className="!text-xs !px-2 !py-1 !text-gray-500">Cancel</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.total > 20 && <div className="flex justify-center gap-2 p-3"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-xs border rounded">Prev</button><span className="text-xs">{page}/{Math.ceil(data.total / 20)}</span><button disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs border rounded">Next</button></div>}
        </div>
      )}

      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title={`Withdrawal #${selected.id}`} size="lg">
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted">User</label><div className="font-medium">{selected.full_name}</div></div>
              <div><label className="text-xs text-muted">Email</label><div>{selected.email}</div></div>
              <div><label className="text-xs text-muted">Amount</label><div className="font-bold">{formatPrice(Number(selected.amount))}</div></div>
              <div><label className="text-xs text-muted">Status</label><div>{statusBadge(selected.status)}</div></div>
              <div><label className="text-xs text-muted">Wallet Balance</label><div>{formatPrice(Number(selected.wallet_balance))}</div></div>
              <div><label className="text-xs text-muted">Reserved</label><div>{formatPrice(Number(selected.reserved_balance))}</div></div>
            </div>
            <div><label className="text-xs text-muted">Reason</label><div>{selected.reason || '\u2014'}</div></div>
            {selected.player_notes && <div><label className="text-xs text-muted">Player Notes</label><div>{selected.player_notes}</div></div>}
            {selected.resolution_notes && <div><label className="text-xs text-muted">Resolution Notes</label><div className="whitespace-pre-wrap">{selected.resolution_notes}</div></div>}
            {selected.execution_method && <div><label className="text-xs text-muted">Execution</label><div>{selected.execution_method}{selected.reference_number ? ` (Ref: ${selected.reference_number})` : ''}</div></div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
