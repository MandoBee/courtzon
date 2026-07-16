import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatISODate } from '../../utils/formatDate';
import { SkeletonRow } from '../../components/ui';

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
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['coach-all-sessions'],
    queryFn: () => api.get('/coaches/sessions/me?role=coach&limit=50').then((r) => r.data),
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
        <div className="text-center py-16">
          <p className="text-[var(--color-text-muted)]">No sessions found</p>
        </div>
      )}

      {todaySessions.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide mb-3">Today</h2>
          <div className="space-y-2">
            {todaySessions.map((s: any) => renderSessionCard(s, navigate))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide mb-3">Upcoming</h2>
          <div className="space-y-2">
            {upcoming.map((s: any) => renderSessionCard(s, navigate))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide mb-3">Past</h2>
          <div className="space-y-2">
            {past.map((s: any) => renderSessionCard(s, navigate))}
          </div>
        </section>
      )}
    </div>
  );
}

function renderSessionCard(session: any, navigate: ReturnType<typeof useNavigate>) {
  const sc = statusColor[session.status] || '';
  return (
    <div
      key={session.id}
      className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 hover:shadow-[var(--shadow-md)] transition-shadow cursor-pointer"
      onClick={() => navigate('/coach/sessions')}
    >
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
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
        {session.organisation_name && <span>🏛️ {session.organisation_name}</span>}
        {session.branch_name && <span>📍 {session.branch_name}</span>}
        {session.price != null && <span>💰 {Number(session.price).toFixed(0)}</span>}
      </div>
    </div>
  );
}
