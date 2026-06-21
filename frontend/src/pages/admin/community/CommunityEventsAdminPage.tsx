import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]', cancelled: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]', completed: 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
};

export default function CommunityEventsAdminPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-events', page, statusFilter],
    queryFn: () => {
      let url = `/admin/events?page=${page}&limit=20`;
      if (statusFilter) url += `&status=${statusFilter}`;
      return api.get(url).then((r: any) => r.data);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/community/events/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-events'] }); showToast('Event cancelled!'); },
    onError: (err: any) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-[var(--color-text)]">Community Events (Admin)</h1>
      <div className="flex gap-2">
        {['', 'active', 'cancelled', 'completed'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1 text-xs rounded-[var(--radius-md)] border ${statusFilter === s ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]">
              <th className="text-left px-3 py-2">Title</th>
              <th className="text-left px-3 py-2">Creator</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Start</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="text-center py-4 text-xs text-[var(--color-text-muted)]">Loading...</td></tr>}
            {data?.data?.map((e: any) => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-[var(--color-bg)] text-[var(--color-text)]">
                <td className="px-3 py-2 font-medium">{e.title}</td>
                <td className="px-3 py-2 text-xs">{e.creator_name || '-'}</td>
                <td className="px-3 py-2 text-xs">{e.event_type}</td>
                <td className="px-3 py-2"><span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[e.status] || ''}`}>{e.status}</span></td>
                <td className="px-3 py-2 text-xs">{e.start_time?.slice(0, 16) || '-'}</td>
                <td className="px-3 py-2 text-right">
                  {e.status === 'active' && (
                    <Can permission="community.delete_events">
                      <button onClick={() => { if (confirm('Cancel this event?')) deleteMutation.mutate(e.id); }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] hover:opacity-80">Cancel</button>
                    </Can>
                  )}
                  {e.status !== 'active' && <span className="text-[10px] text-[var(--color-text-muted)]">-</span>}
                </td>
              </tr>
            ))}
            {data?.data?.length === 0 && <tr><td colSpan={6} className="text-center py-4 text-xs text-[var(--color-text-muted)]">No events.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && data.total > data.limit && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-xs border rounded disabled:opacity-40">Prev</button>
          <span className="px-2 py-1 text-xs text-[var(--color-text-muted)]">Page {data.page} of {Math.ceil(data.total / data.limit)}</span>
          <button disabled={page >= Math.ceil(data.total / data.limit)} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs border rounded disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
