import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { formatPrice } from '../../../utils/currency';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  approved: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  rejected: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  completed: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  cancelled: 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
};

export default function WithdrawalRequestsPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [notesModal, setNotesModal] = useState<{ id: number; action: 'approve' | 'reject' | 'complete' } | null>(null);
  [page, setPage];

  const { data, isLoading } = useQuery({
    queryKey: ['withdrawal-requests', page, statusFilter],
    queryFn: () => {
      let url = `/admin/withdrawal-requests?page=${page}&limit=20`;
      if (statusFilter) url += `&status=${statusFilter}`;
      return api.get(url).then((r: any) => r.data);
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) => api.post('/admin/withdrawal-requests/approve', { id, notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['withdrawal-requests'] }); setNotesModal(null); showToast('Request approved!'); },
    onError: (err: any) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) => api.post('/admin/withdrawal-requests/reject', { id, notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['withdrawal-requests'] }); setNotesModal(null); showToast('Request rejected!'); },
    onError: (err: any) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) => api.post('/admin/withdrawal-requests/complete', { id, notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['withdrawal-requests'] }); setNotesModal(null); showToast('Request completed!'); },
    onError: (err: any) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  const handleAction = () => {
    if (!notesModal) return;
    const { id, action } = notesModal;
    if (action === 'approve') approveMutation.mutate({ id });
    else if (action === 'reject') rejectMutation.mutate({ id });
    else completeMutation.mutate({ id });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-[var(--color-text)]">Withdrawal Requests</h1>

      <div className="flex gap-2">
        {['', 'pending', 'approved', 'rejected', 'completed'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1 text-xs rounded-[var(--radius-md)] border ${statusFilter === s ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'}`}>
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]">
              <th className="text-left px-3 py-2 font-medium">ID</th>
              <th className="text-left px-3 py-2 font-medium">User</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
              <th className="text-left px-3 py-2 font-medium">Bank</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">Notes</th>
              <th className="text-right px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="text-center py-4 text-xs text-[var(--color-text-muted)]">Loading...</td></tr>}
            {data?.data?.map((r: any) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]/30 text-[var(--color-text)]">
                <td className="px-3 py-2 font-mono text-xs">#{r.id}</td>
                <td className="px-3 py-2">
                  <div className="text-xs">{r.user_name || '-'}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">{r.user_email}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono">{formatPrice(Number(r.amount))}</td>
                <td className="px-3 py-2 text-xs">{r.bank_name ? `${r.bank_name} ••••${r.account_number?.slice(-4)}` : '-'}</td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[r.status] || ''}`}>{r.status}</span>
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{r.created_at?.slice(0, 10)}</td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-muted)] max-w-[120px] truncate">{r.admin_notes || '-'}</td>
                <td className="px-3 py-2 text-right">
                  {r.status === 'pending' && (
                    <div className="flex gap-1 justify-end">
                      <Can permission="financial.withdrawal-requests.approve">
                        <button onClick={() => approveMutation.mutate({ id: r.id })}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-info-bg)] text-[var(--color-info-text)] hover:opacity-90">Approve</button>
                      </Can>
                      <Can permission="financial.withdrawal-requests.reject">
                        <button onClick={() => rejectMutation.mutate({ id: r.id })}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] hover:bg-red-200">Reject</button>
                      </Can>
                    </div>
                  )}
                  {r.status === 'approved' && (
                    <Can permission="financial.withdrawal-requests.approve">
                      <button onClick={() => completeMutation.mutate({ id: r.id })}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-success-bg)] text-[var(--color-success-text)] hover:opacity-80">Mark Complete</button>
                    </Can>
                  )}
                  {r.status !== 'pending' && r.status !== 'approved' && (
                    <span className="text-[10px] text-[var(--color-text-muted)]">-</span>
                  )}
                </td>
              </tr>
            ))}
            {data?.data?.length === 0 && <tr><td colSpan={8} className="text-center py-4 text-xs text-[var(--color-text-muted)]">No withdrawal requests.</td></tr>}
          </tbody>
        </table>
      </div>

      {data && data.total > data.limit && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-xs border rounded-[var(--radius-md)] disabled:opacity-40">Prev</button>
          <span className="px-2 py-1 text-xs text-[var(--color-text-muted)]">Page {data.page} of {Math.ceil(data.total / data.limit)}</span>
          <button disabled={page >= Math.ceil(data.total / data.limit)} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs border rounded-[var(--radius-md)] disabled:opacity-40">Next</button>
        </div>
      )}

      {notesModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setNotesModal(null)}>
          <div className="p-4 rounded-[var(--radius-lg)] shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-2 text-[var(--color-text)]">Confirm {notesModal.action}</h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">Are you sure you want to {notesModal.action} withdrawal request #{notesModal.id}?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setNotesModal(null)} className="px-3 py-1.5 text-xs border rounded-[var(--radius-md)]">Cancel</button>
              <button onClick={handleAction}
                className={`px-3 py-1.5 text-xs text-white rounded-[var(--radius-md)] ${notesModal.action === 'reject' ? 'bg-[var(--color-error)]' : 'bg-[var(--color-primary)]'}`}>
                Confirm {notesModal.action}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
