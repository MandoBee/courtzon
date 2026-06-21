import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';

export default function SubscriptionUpgradeRequestsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'subscription-upgrade-requests', { status: statusFilter, page }],
    queryFn: () =>
      api.get('/admin/subscription-upgrade-requests', { params: { status: statusFilter, page, limit: 20 } })
        .then((r: any) => r.data),
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: number) =>
      api.post(`/admin/subscription-upgrade-requests/${requestId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-upgrade-requests'] });
      showToast('Upgrade approved!');
    },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: number; reason: string }) =>
      api.post(`/admin/subscription-upgrade-requests/${requestId}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-upgrade-requests'] });
      setRejectingId(null);
      setRejectReason('');
      showToast('Upgrade request rejected');
    },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const items = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-4">Subscription Upgrade Requests</h1>

      <div className="flex gap-2 mb-6">
        {['pending', 'approved', 'rejected', 'all'].map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] transition-colors ${
              statusFilter === s
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-sm text-[var(--color-text-muted)]">
          No {statusFilter !== 'all' ? statusFilter : ''} upgrade requests found.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((req: any) => (
            <div
              key={req.id}
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-[var(--color-text)]">{req.org_name}</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {req.requester_name} ({req.requester_email})
                    {req.plan_name && <span className="ml-2">→ <strong>{req.plan_name}</strong></span>}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    Requested: {new Date(req.created_at).toLocaleDateString('en-GB')}
                  </p>
                  {req.notes && (
                    <p className="text-xs text-[var(--color-text-muted)] mt-1 italic">"{req.notes}"</p>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  req.status === 'approved' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                  req.status === 'rejected' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' :
                  'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'
                }`}>
                  {req.status}
                </span>
              </div>

              {req.status === 'pending' && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--color-border)]">
                  <Can permission="subscription.upgrade.approve">
                    <button
                      onClick={() => approveMutation.mutate(req.id)}
                      disabled={approveMutation.isPending}
                      className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium disabled:opacity-50"
                    >
                      {approveMutation.isPending ? 'Approving...' : 'Approve'}
                    </button>
                  </Can>
                  <Can permission="subscription.upgrade.reject">
                    {rejectingId === req.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                          placeholder="Rejection reason..."
                          className="flex-1 px-2 py-1 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs"
                        />
                        <button
                          onClick={() => rejectMutation.mutate({ requestId: req.id, reason: rejectReason })}
                          disabled={rejectMutation.isPending}
                          className="px-3 py-1.5 bg-[var(--color-error)] text-white rounded-[var(--radius-md)] text-xs font-medium disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => { setRejectingId(null); setRejectReason(''); }}
                          className="px-3 py-1.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRejectingId(req.id)}
                        className="px-3 py-1.5 border border-[var(--color-error)] text-[var(--color-error)] rounded-[var(--radius-md)] text-xs font-medium"
                      >
                        Reject
                      </button>
                    )}
                  </Can>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-xs border rounded-[var(--radius-md)] disabled:opacity-30"
          >Previous</button>
          <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-xs border rounded-[var(--radius-md)] disabled:opacity-30"
          >Next</button>
        </div>
      )}
    </div>
  );
}
