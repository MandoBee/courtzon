import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';

export default function AdminApprovalsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-approvals', statusFilter, page],
    queryFn: () => api.get('/admin/approvals', { params: { status: statusFilter || undefined, page, limit: 20 } }).then((r: any) => r.data),
  });

  const approve = useMutation({
    mutationFn: (requestId: number) => api.post(`/admin/approvals/${requestId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-approvals'] });
      showToast('Registration approved successfully');
    },
    onError: (err) => {
      showToast(getErrorMessage(err, 'Failed to approve'), 'error');
    },
  });

  const reject = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: number; reason?: string }) => api.post(`/admin/approvals/${requestId}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-approvals'] });
      showToast('Registration rejected');
    },
    onError: (err) => {
      showToast(getErrorMessage(err, 'Failed to reject'), 'error');
    },
  });

  const [rejecting, setRejecting] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  if (isLoading) return <div className="text-[var(--color-text-muted)]">Loading...</div>;

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      player: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      seller: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      organization: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
      upgrade: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    };
    return `px-2 py-0.5 text-xs rounded-full font-medium ${colors[type] || 'bg-[var(--color-border)] text-[var(--color-text)]'}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Registration Approvals</h1>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { label: 'Pending', value: 'pending' },
          { label: 'Approved', value: 'approved' },
          { label: 'Rejected', value: 'rejected' },
          { label: 'All', value: '' },
        ].map((s: any) => (
          <button key={s.value} onClick={() => { setStatusFilter(s.value); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              statusFilter === s.value
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]/30'
            }`}>{s.label}</button>
        ))}
      </div>

      <div className="space-y-3">
        {data?.data?.length ? data.data.map((r: any) => (
          <div key={r.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-[var(--color-text)]">{r.org_name || r.organisation_name}</p>
                  <span className={getTypeBadge(r.registration_type)}>{r.registration_type}</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Requester: {r.requester_name || r.user_name || r.user?.fullName || '—'} ({r.requester_email || r.user?.email || '—'})
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Plan: {r.plan_name || '—'} &middot; Phone: {r.org_phone || r.phone || '—'}
                </p>
                {r.payment_method && (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Payment: <span className="capitalize">{r.payment_method.replace(/_/g, ' ')}</span>
                  </p>
                )}
                {r.notes && <p className="text-xs text-[var(--color-text-muted)]">Notes: {r.notes}</p>}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                r.status === 'pending' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)] dark:bg-yellow-900/30 dark:text-yellow-400' :
                r.status === 'approved' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                'bg-[var(--color-error-bg)] text-[var(--color-error-text)] dark:bg-red-900/30 dark:text-red-400'
              }`}>{r.status}</span>
            </div>

            {r.status === 'pending' && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => approve.mutate(r.id)} disabled={approve.isPending}
                  className="px-4 py-1.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary)] text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
                  {approve.isPending ? 'Approving...' : 'Approve'}
                </button>
                <button onClick={() => setRejecting(r.id)}
                  className="px-4 py-1.5 border border-red-300 dark:border-red-700 text-[var(--color-error-text)] dark:text-red-400 text-xs font-medium rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  Reject
                </button>
              </div>
            )}

            {rejecting === r.id && (
              <div className="mt-3 flex gap-2">
                <input value={rejectReason} onChange={(e: any) => setRejectReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="flex-1 px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)] text-[var(--color-text)]" />
                <button onClick={() => { reject.mutate({ requestId: r.id, reason: rejectReason || undefined }); setRejecting(null); setRejectReason(''); }}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors">Confirm</button>
                <button onClick={() => { setRejecting(null); setRejectReason(''); }}
                  className="px-3 py-1.5 border border-[var(--color-border)] text-[var(--color-text-muted)] text-xs rounded-lg hover:bg-[var(--color-bg)] transition-colors">Cancel</button>
              </div>
            )}
          </div>
        )) : <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">No requests found.</p>}
      </div>

      {data && data.total > data.limit && (
        <div className="flex items-center justify-between mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="text-sm text-[var(--color-primary)] font-medium disabled:opacity-50 hover:underline">Previous</button>
          <span className="text-sm text-[var(--color-text-muted)]">Page {page}</span>
          <button onClick={() => setPage(p => p + 1)}
            className="text-sm text-[var(--color-primary)] font-medium hover:underline">Next</button>
        </div>
      )}
    </div>
  );
}
