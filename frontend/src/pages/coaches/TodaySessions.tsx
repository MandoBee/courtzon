import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { formatISODate } from '../../utils/formatDate';
import { useToast } from '../../components/ui/Toast';
import { SkeletonRow } from '../../components/ui';
import { EmptyStateCard, SessionTimeline } from '../../components/workspace';

const STATUSES = ['all', 'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'pending_court', 'pending_acceptance'];

const statusColor: Record<string, string> = {
  scheduled: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  confirmed: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  in_progress: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  completed: 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
  cancelled: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  no_show: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  pending_court: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  pending_acceptance: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
};

export default function TodaySessions() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [filter, setFilter] = useState('all');
  const [detailId, setDetailId] = useState<number | null>(null);

  const sessionMut = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      api.post(`/coach-sessions/${id}/${action}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['coach-all-sessions'] }); showToast('Updated!'); setDetailId(null); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed', 'error'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['coach-all-sessions'],
    queryFn: () => api.get('/coaches/sessions/me?role=coach&limit=50').then((r) => r.data),
  });

  const { data: detailData } = useQuery({
    queryKey: ['coach-session-detail', detailId],
    queryFn: () => api.get(`/coach-sessions/${detailId}`).then((r) => r.data),
    enabled: !!detailId,
  });

  const sessions = Array.isArray(data?.data) ? data.data : [];
  const filtered = filter === 'all' ? sessions : sessions.filter((s: any) => s.status === filter);

  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = filtered.filter((s: any) => s.start_time?.startsWith(today));
  const upcoming = filtered.filter((s: any) => !s.start_time?.startsWith(today) && !['cancelled', 'no_show', 'completed'].includes(s.status));
  const past = filtered.filter((s: any) => ['completed', 'cancelled', 'no_show'].includes(s.status));

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)]">My Sessions</h1>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filter === s
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)]'
            }`}
          >
            {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {isLoading && <SkeletonRow count={5} />}

      {!isLoading && filtered.length === 0 && (
        <EmptyStateCard
          icon="📋"
          title={filter === 'all' ? 'No sessions yet' : `No ${filter.replace(/_/g, ' ')} sessions`}
          description={filter === 'all' ? 'Sessions will appear here when players book coaching sessions.' : 'Try selecting a different status filter.'}
        />
      )}

      {todaySessions.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide mb-3">Today</h2>
          <div className="space-y-2">
            {todaySessions.map((s: any) => <SessionDetailCard key={s.id} session={s} detailId={detailId} setDetailId={setDetailId} sessionMut={sessionMut} detailTimeline={detailData?.timeline} />)}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide mb-3">Upcoming</h2>
          <div className="space-y-2">
            {upcoming.map((s: any) => <SessionDetailCard key={s.id} session={s} detailId={detailId} setDetailId={setDetailId} sessionMut={sessionMut} detailTimeline={detailData?.timeline} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide mb-3">Past</h2>
          <div className="space-y-2">
            {past.map((s: any) => <SessionDetailCard key={s.id} session={s} detailId={detailId} setDetailId={setDetailId} sessionMut={sessionMut} detailTimeline={detailData?.timeline} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function SessionDetailCard({ session, detailId, setDetailId, sessionMut, detailTimeline }: {
  session: any; detailId: number | null; setDetailId: (id: number | null) => void;
  sessionMut: any; detailTimeline: any[];
}) {
  const sc = statusColor[session.status] || '';
  const isExpanded = detailId === session.id;

  const actions: { label: string; action: string; color: string }[] = [];
  if (session.status === 'confirmed') actions.push({ label: '▶️ Start', action: 'start', color: 'bg-[var(--color-primary)]' });
  if (session.status === 'in_progress') actions.push({ label: '🏁 Complete', action: 'complete', color: 'bg-[var(--color-success)]' });
  if (session.status === 'in_progress') actions.push({ label: '👤 No Show', action: 'no-show', color: 'bg-[var(--color-error)]' });
  if (['requested', 'confirmed', 'in_progress'].includes(session.status)) actions.push({ label: '🚫 Cancel', action: 'cancel', color: 'bg-[var(--color-error)]' });

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--color-text)] truncate">{session.player_name || 'Player'}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {formatISODate(session.start_time)} · {new Date(session.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full ${sc}`}>
          {session.status?.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)] mb-2">
        {session.organisation_name && <span>🏛️ {session.organisation_name}</span>}
        {session.branch_name && <span>📍 {session.branch_name}</span>}
        {session.price != null && <span>💰 {Number(session.price).toFixed(0)}</span>}
      </div>
      <div className="flex gap-2">
        <button onClick={() => setDetailId(isExpanded ? null : session.id)} className="px-3 py-1 text-xs font-medium border border-[var(--color-border)] rounded-[var(--radius-md)]">
          {isExpanded ? '▲ Less' : '▼ More'}
        </button>
        {actions.map((a) => (
          <button key={a.action} onClick={() => sessionMut.mutate({ id: session.id, action: a.action })}
            className={`px-3 py-1 text-xs font-medium text-white rounded-[var(--radius-md)] ${a.color}`}>
            {a.label}
          </button>
        ))}
      </div>
      {isExpanded && detailTimeline && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
          <SessionTimeline events={detailTimeline} title="Session Timeline" />
        </div>
      )}
    </div>
  );
}
