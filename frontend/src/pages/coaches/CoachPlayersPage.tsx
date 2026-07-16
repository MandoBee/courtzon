import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatISODate } from '../../utils/formatDate';
import { SkeletonRow } from '../../components/ui';

export default function CoachPlayersPage() {

  const { data, isLoading } = useQuery({
    queryKey: ['coach-players'],
    queryFn: () => api.get('/coaches/players').then((r) => r.data),
  });

  const players = Array.isArray(data?.data) ? data.data : [];

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)]">My Players</h1>
      </div>

      {isLoading && <SkeletonRow count={5} />}

      {!isLoading && players.length === 0 && (
        <div className="text-center py-16">
          <p className="text-lg text-[var(--color-text-muted)]">No players yet</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Complete coaching sessions to build your player roster.</p>
        </div>
      )}

      {!isLoading && players.length > 0 && (
        <div className="space-y-3">
          {players.map((p: any) => (
            <div
              key={p.player_id}
              className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-sm font-bold text-[var(--color-primary)] shrink-0">
                    {p.player_name?.charAt(0) || 'P'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--color-text)] truncate">{p.player_name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{p.total_sessions} session{p.total_sessions !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                  {p.last_session_date ? formatISODate(p.last_session_date) : 'N/A'}
                </span>
              </div>
              <div className="flex gap-2">
                {p.player_phone && (
                  <a
                    href={`tel:${p.player_phone}`}
                    className="px-3 py-1 text-xs font-medium border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text)] hover:bg-[var(--color-bg)]"
                  >
                    📞 Call
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
