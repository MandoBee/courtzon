import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';

export default function UpgradeRequestsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-marketplace-upgrades', statusFilter, page],
    queryFn: () => api.get('/marketplace/admin/upgrade-requests', { params: { status: statusFilter || undefined, page, limit: 20 } }).then((r: any) => r.data),
  });

  const approve = useMutation({
    mutationFn: (orgId: number) => api.post(`/marketplace/admin/approve-upgrade/${orgId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-marketplace-upgrades'] }),
  });

  const reject = useMutation({
    mutationFn: ({ orgId, reason }: { orgId: number; reason?: string }) => api.post(`/marketplace/admin/upgrade-requests/${orgId}/reject`, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-marketplace-upgrades'] }),
  });

  const [rejecting, setRejecting] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Seller Upgrade Requests</h1>
      </div>
      <div className="flex gap-2 mb-4">
        {['pending', 'approved', 'rejected', ''].map((s: any) => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-full border ${statusFilter === s ? 'bg-[var(--color-primary)] text-white' : ''}`}>{s || 'All'}</button>
        ))}
      </div>
      <div className="space-y-3">
        {data?.data?.length ? data.data.map((r: any) => (
          <div key={r.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">{r.org_name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">Requester: {r.requester_name} ({r.requester_email})</p>
                <p className="text-xs text-[var(--color-text-muted)]">Plan: {r.plan_name || '—'} · {r.org_phone || '—'}</p>
                <p className="text-xs text-[var(--color-text-muted)]">Notes: {r.notes || '—'}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                r.status === 'pending' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' :
                r.status === 'approved' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'
              }`}>{r.status}</span>
            </div>
            {r.status === 'pending' && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => approve.mutate(r.organisation_id)} disabled={approve.isPending}
                  className="px-3 py-1.5 bg-[var(--color-primary)] text-white text-xs rounded-lg">Approve</button>
                <button onClick={() => setRejecting(r.organisation_id)}
                  className="px-3 py-1.5 border border-red-300 text-[var(--color-error-text)] text-xs rounded-lg">Reject</button>
              </div>
            )}
            {rejecting === r.organisation_id && (
              <div className="mt-3 flex gap-2">
                <input value={rejectReason} onChange={(e: any) => setRejectReason(e.target.value)} placeholder="Reason (optional)" className="flex-1 px-3 py-1.5 text-sm border rounded-lg" />
                <button onClick={() => { reject.mutate({ orgId: r.organisation_id, reason: rejectReason || undefined }); setRejecting(null); setRejectReason(''); }}
                  className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg">Confirm</button>
                <button onClick={() => setRejecting(null)} className="px-3 py-1.5 border text-xs rounded-lg">Cancel</button>
              </div>
            )}
          </div>
        )) : <p className="text-sm text-[var(--color-text-muted)]">No requests found.</p>}
      </div>
      {data && data.total > data.limit && (
        <div className="flex justify-between mt-4">
          <button onClick={() => setPage((p: any) => Math.max(1, p - 1))} disabled={page <= 1} className="text-sm text-[var(--color-primary)] disabled:opacity-50">Previous</button>
          <span className="text-sm text-[var(--color-text-muted)]">Page {page}</span>
          <button onClick={() => setPage((p: any) => p + 1)} className="text-sm text-[var(--color-primary)]">Next</button>
        </div>
      )}
    </div>
  );
}
