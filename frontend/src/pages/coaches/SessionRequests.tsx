import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatISODate } from '../../utils/formatDate';
import { SkeletonRow } from '../../components/ui';

export default function SessionRequests() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['coach-pending-requests'],
    queryFn: () => api.get('/coaches/sessions/pending').then((r) => r.data),
  });

  const requests = Array.isArray(data?.data) ? data.data : [];

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)]">Session Requests</h1>
      </div>

      {isLoading && <SkeletonRow count={3} />}

      {!isLoading && requests.length === 0 && (
        <div className="text-center py-16">
          <p className="text-lg text-[var(--color-text-muted)]">No pending requests</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">When players book sessions, they will appear here.</p>
        </div>
      )}

      {!isLoading && requests.length > 0 && (
        <div className="space-y-3">
          {requests.map((r: any) => (
            <div
              key={r.id}
              className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-semibold text-[var(--color-text)]">{r.player_name || 'Player'}</p>
                  {r.player_phone && (
                    <p className="text-xs text-[var(--color-text-muted)]">{r.player_phone}</p>
                  )}
                </div>
                <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-[var(--color-info-bg)] text-[var(--color-info-text)]">
                  {r.status?.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)] mb-3">
                <span>📅 {formatISODate(r.start_time)} · {new Date(r.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                {r.branch_name && <span>📍 {r.branch_name}</span>}
                {r.organisation_name && <span>🏛️ {r.organisation_name}</span>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate('/coach/sessions')}
                  className="px-4 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)]"
                >
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
