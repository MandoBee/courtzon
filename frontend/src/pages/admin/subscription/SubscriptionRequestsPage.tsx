import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';

export default function SubscriptionRequestsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'pending');
  const [orgFilter, setOrgFilter] = useState<string>(searchParams.get('orgId') || '');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [reopeningId, setReopeningId] = useState<number | null>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-requests'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'organisation-subscriptions'] });
    queryClient.invalidateQueries({ queryKey: ['organisations'] });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'subscription-requests', { status: statusFilter, type: typeFilter, page, orgId: orgFilter }],
    queryFn: () =>
      api.get('/admin/subscription-requests', {
        params: {
          status: statusFilter,
          type: typeFilter || undefined,
          page,
          limit: 20,
          orgId: orgFilter || undefined,
        },
      }).then((r: any) => r.data),
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: number) =>
      api.post(`/admin/subscription-requests/${requestId}/approve`, {}),
    onSuccess: () => {
      invalidateAll();
      setApprovingId(null);
      showToast('Subscription request approved!');
    },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: number; reason: string }) =>
      api.post(`/admin/subscription-requests/${requestId}/reject`, { reason }),
    onSuccess: () => {
      invalidateAll();
      setRejectingId(null);
      setRejectReason('');
      showToast('Subscription request rejected');
    },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const reopenMutation = useMutation({
    mutationFn: (requestId: number) =>
      api.post(`/admin/subscription-requests/${requestId}/reopen`, {}),
    onSuccess: () => {
      invalidateAll();
      setReopeningId(null);
      showToast('Subscription request reopened');
    },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const items = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  const statusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-4">Subscription Requests</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected', 'cancelled', 'all'].map(s => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
                setSearchParams(s === 'all' ? {} : { status: s });
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] transition-colors ${
                statusFilter === s
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]'
              }`}
            >
              {s === 'all' ? 'All' : statusLabel(s)}
            </button>
          ))}
        </div>
        {orgFilter && (
          <button
            onClick={() => { setOrgFilter(''); setPage(1); setSearchParams({ status: statusFilter }); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[var(--color-info-bg)] text-[var(--color-info-text)] border border-[var(--color-info)]/40 hover:bg-[var(--color-info-bg)]/70"
            title="Remove organisation filter"
          >
            <span aria-hidden="true">🔍</span>
            Organisation #{orgFilter}
            <span aria-hidden="true" className="font-bold">×</span>
          </button>
        )}
        <select
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="px-2 py-1.5 text-xs border rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text)]"
        >
          <option value="">All Types</option>
          <option value="NEW_SUBSCRIPTION">New Subscription</option>
          <option value="PLAN_CHANGE">Plan Change</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-sm text-[var(--color-text-muted)]">
          No subscription requests found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
                <th className="px-3 py-2 font-medium">Organisation</th>
                <th className="px-3 py-2 font-medium">Current Plan</th>
                <th className="px-3 py-2 font-medium">Requested Plan</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Submitted By</th>
                <th className="px-3 py-2 font-medium">Submitted</th>
                <th className="px-3 py-2 font-medium">Decision Date</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((req: any) => (
                <tr key={req.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
                  <td className="px-3 py-3 font-medium text-[var(--color-text)]">{req.org_name}</td>
                  <td className="px-3 py-3 text-[var(--color-text-muted)]">{req.current_plan_name || '—'}</td>
                  <td className="px-3 py-3 text-[var(--color-text)]">{req.requested_plan_name}</td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      req.request_type === 'NEW_SUBSCRIPTION'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {req.request_type === 'NEW_SUBSCRIPTION' ? 'New' : 'Change'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--color-text-muted)]">
                    {req.requester_name}<br/>{req.requester_email}
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--color-text-muted)]">
                    {new Date(req.created_at).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--color-text-muted)]">
                    {req.approved_at || req.cancelled_at
                      ? new Date(req.approved_at || req.cancelled_at).toLocaleDateString('en-GB')
                      : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      req.status === 'approved' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                      req.status === 'rejected' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' :
                      req.status === 'cancelled' ? 'bg-gray-100 text-gray-500' :
                      'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'
                    }`}>
                      {statusLabel(req.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {req.status === 'pending' && (
                      <div className="flex items-center gap-1">
                        <Can permission="subscription.request.approve">
                          {approvingId === req.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-[var(--color-text-muted)]">
                                Approve <strong>{req.requested_plan_name}</strong> for {req.org_name}?
                              </span>
                              <button
                                onClick={() => approveMutation.mutate(req.id)}
                                disabled={approveMutation.isPending}
                                className="px-2 py-1 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-[10px] font-medium disabled:opacity-50"
                              >
                                {approveMutation.isPending ? '...' : 'Yes'}
                              </button>
                              <button
                                onClick={() => setApprovingId(null)}
                                className="px-2 py-1 border rounded-[var(--radius-md)] text-[10px]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setApprovingId(req.id)}
                              disabled={approveMutation.isPending}
                              className="px-2 py-1 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-[10px] font-medium disabled:opacity-50"
                            >
                              Approve
                            </button>
                          )}
                        </Can>
                        <Can permission="subscription.request.reject">
                          {rejectingId === req.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder="Reason..."
                                className="w-24 px-1.5 py-1 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-[10px]"
                              />
                              <button
                                onClick={() => rejectMutation.mutate({ requestId: req.id, reason: rejectReason })}
                                disabled={rejectMutation.isPending}
                                className="px-2 py-1 bg-[var(--color-error)] text-white rounded-[var(--radius-md)] text-[10px] font-medium"
                              >
                                OK
                              </button>
                              <button
                                onClick={() => { setRejectingId(null); setRejectReason(''); }}
                                className="px-2 py-1 border rounded-[var(--radius-md)] text-[10px]"
                              >
                                X
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setRejectingId(req.id)}
                              className="px-2 py-1 border border-[var(--color-error)] text-[var(--color-error)] rounded-[var(--radius-md)] text-[10px] font-medium"
                            >
                              Reject
                            </button>
                          )}
                        </Can>
                      </div>
                    )}
                    {req.status === 'rejected' && (
                      <div className="flex items-center gap-1">
                        <Can permission="subscription.request.reopen">
                          {reopeningId === req.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-[var(--color-text-muted)]">
                                Reopen this request?
                              </span>
                              <button
                                onClick={() => reopenMutation.mutate(req.id)}
                                disabled={reopenMutation.isPending}
                                className="px-2 py-1 bg-[var(--color-warning)] text-white rounded-[var(--radius-md)] text-[10px] font-medium disabled:opacity-50"
                              >
                                {reopenMutation.isPending ? '...' : 'Yes'}
                              </button>
                              <button
                                onClick={() => setReopeningId(null)}
                                className="px-2 py-1 border rounded-[var(--radius-md)] text-[10px]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setReopeningId(req.id)}
                              className="px-2 py-1 border border-[var(--color-warning)] text-[var(--color-warning-text)] rounded-[var(--radius-md)] text-[10px] font-medium"
                            >
                              Reopen
                            </button>
                          )}
                        </Can>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
