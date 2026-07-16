import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { formatISODate } from '../../utils/formatDate';
import { useToast } from '../../components/ui/Toast';
import { SkeletonRow } from '../../components/ui';
import { EmptyStateCard, SessionTimeline } from '../../components/workspace';

export default function SessionRequests() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['coach-requests'],
    queryFn: () => api.get('/coach-sessions/requests').then((r) => r.data),
  });

  const { data: detailData } = useQuery({
    queryKey: ['coach-session-detail', detailId],
    queryFn: () => api.get(`/coach-sessions/${detailId}`).then((r) => r.data),
    enabled: !!detailId,
  });

  const respondMut = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      api.post(`/coach-sessions/${id}/respond`, { action }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['coach-requests'] }); showToast('Response sent!'); setDetailId(null); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed', 'error'),
  });

  const requests = Array.isArray(data?.data) ? data.data : [];
  const detailTimeline = detailData?.timeline;

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)]">Session Requests</h1>
      </div>

      {isLoading && <SkeletonRow count={3} />}

      {!isLoading && requests.length === 0 && (
        <EmptyStateCard icon="📥" title="No pending requests" description="When players request coaching sessions, they will appear here." />
      )}

      {!isLoading && requests.map((r: any) => (
        <div key={r.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="font-semibold text-[var(--color-text)]">{r.player_name || 'Player'}</p>
              {r.player_phone && <p className="text-xs text-[var(--color-text-muted)]">{r.player_phone}</p>}
            </div>
            <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-[var(--color-info-bg)] text-[var(--color-info-text)]">
              {r.status?.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)] mb-3">
            <span>📅 {formatISODate(r.start_time)} · {new Date(r.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
            {r.branch_name && <span>📍 {r.branch_name}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setDetailId(r.id)} className="px-3 py-1.5 text-xs font-medium border border-[var(--color-border)] rounded-[var(--radius-md)]">
              📋 Details
            </button>
            {r.status === 'requested' && (
              <>
                <button onClick={() => respondMut.mutate({ id: r.id, action: 'accepted' })}
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--color-success)] text-white rounded-[var(--radius-md)]">
                  ✅ Accept
                </button>
                <button onClick={() => respondMut.mutate({ id: r.id, action: 'declined' })}
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--color-error)] text-white rounded-[var(--radius-md)]">
                  ❌ Decline
                </button>
              </>
            )}
          </div>

          {detailId === r.id && detailTimeline && (
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
              <SessionTimeline events={detailTimeline} title="Session Timeline" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
