import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useCan } from '../../hooks/useCan';
import { formatPrice } from '../../utils/currency';
import { Badge } from '../../components/ui';

type ViewRole = 'player' | 'coach';

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  scheduled: 'info',
  confirmed: 'success',
  in_progress: 'warning',
  completed: 'default',
  cancelled: 'danger',
  no_show: 'danger',
};

function formatDateTime(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function CoachSessionsPage() {
  const navigate = useNavigate();
  const { can } = useCan();
  const isCoach = can('coaches.create_sessions');
  const [role, setRole] = useState<ViewRole>('player');

  const { data: sessions = [], isLoading, isError } = useQuery({
    queryKey: ['my-coach-sessions', role],
    queryFn: () => api.get(`/coaches/sessions/me?role=${role}`).then((r) => r.data?.data ?? []),
  });

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">My Coaching Sessions</h1>
        <button
          onClick={() => navigate('/coaches')}
          className="px-4 py-2 border rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          Find a Coach
        </button>
      </div>

      {isCoach && (
        <div className="inline-flex rounded-[var(--radius-md)] border border-[var(--color-border)] overflow-hidden text-sm">
          <button
            onClick={() => setRole('player')}
            className={`px-4 py-2 ${role === 'player' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
          >
            As Player
          </button>
          <button
            onClick={() => setRole('coach')}
            className={`px-4 py-2 ${role === 'coach' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
          >
            As Coach
          </button>
        </div>
      )}

      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading sessions…</p>}
      {isError && <p className="text-sm text-[var(--color-error)]">Failed to load sessions.</p>}

      {!isLoading && !isError && sessions.length === 0 && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-8 text-center text-[var(--color-text-muted)]">
          No sessions yet.
        </div>
      )}

      <div className="space-y-3">
        {sessions.map((s: any) => {
          const counterpartName = role === 'coach' ? s.player_name : s.coach_name;
          const counterpartLabel = role === 'coach' ? 'Player' : 'Coach';
          const status = String(s.status ?? 'scheduled');
          return (
            <div key={s.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-4 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="font-medium text-[var(--color-text)]">{formatDateTime(s.start_time)}</div>
                <div className="text-sm text-[var(--color-text-muted)]">
                  {counterpartLabel}: {counterpartName || '—'}
                </div>
                {s.organisation_name && (
                  <div className="text-sm text-[var(--color-text-muted)]">At: {s.organisation_name}</div>
                )}
              </div>
              <div className="text-right space-y-2">
                <Badge variant={STATUS_VARIANT[status] ?? 'default'}>{status.replace(/_/g, ' ')}</Badge>
                <div className="text-sm font-medium text-[var(--color-text)]">
                  {s.price != null ? formatPrice(Number(s.price), s.currency_code) : '—'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
