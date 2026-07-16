import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatISODate } from '../../utils/formatDate';

export default function UpcomingSection() {
  const navigate = useNavigate();

  const { data: bookingsData } = useQuery({
    queryKey: ['home-upcoming-bookings'],
    queryFn: () => api.get('/bookings?status=confirmed&limit=3').then((r) => r.data),
    staleTime: 15000,
  });

  const { data: matchesData } = useQuery({
    queryKey: ['home-upcoming-matches'],
    queryFn: () => api.get('/matches?limit=3').then((r) => r.data),
    staleTime: 15000,
  });

  const bookings = bookingsData?.data || [];
  const matches = matchesData?.data || [];
  const hasAny = bookings.length > 0 || matches.length > 0;

  if (!hasAny) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">📅</span>
          <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">Upcoming</h2>
        </div>
        <div className="rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] p-4 md:p-5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Nothing scheduled yet</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Book a court or join a match to get started.</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">📅</span>
        <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">Upcoming</h2>
      </div>
      <div className="space-y-2">
        {bookings.map((b: any) => (
          <button
            key={`b-${b.id}`}
            onClick={() => navigate(`/bookings`)}
            className="w-full flex items-center gap-3 p-3 md:p-4 rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] hover:shadow-[var(--shadow-md)] transition-all duration-200 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center shrink-0 text-lg">
              🎾
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--color-text)] truncate">{b.resource_name}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {formatISODate(b.booking_date)} · {b.start_time?.slice(0, 5)}–{b.end_time?.slice(0, 5)} · {b.branch_name}
              </p>
            </div>
            <span className="shrink-0 text-xs font-medium text-[var(--color-primary)]">View →</span>
          </button>
        ))}
        {matches.map((m: any) => (
          <button
            key={`m-${m.id}`}
            onClick={() => navigate(`/matches/${m.id}`)}
            className="w-full flex items-center gap-3 p-3 md:p-4 rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] hover:shadow-[var(--shadow-md)] transition-all duration-200 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--color-warning)]/10 flex items-center justify-center shrink-0 text-lg">
              🏸
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--color-text)] truncate">{m.title || 'Match'}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {m.scheduled_date ? formatISODate(m.scheduled_date) : ''} · {m.status}
              </p>
            </div>
            <span className="shrink-0 text-xs font-medium text-[var(--color-warning)]">View →</span>
          </button>
        ))}
      </div>
    </section>
  );
}
