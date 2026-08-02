import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatISODate } from '../../utils/formatDate';

function calcDuration(startTime: string, endTime: string): string {
  if (!startTime || !endTime) return '';
  const [sh, sm] = startTime.slice(0, 5).split(':').map(Number);
  const [eh, em] = endTime.slice(0, 5).split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function bookingTypeLabel(type: string): string {
  const map: Record<string, string> = { public_match: 'Public', private_match: 'Private', academy: 'Academy', clinic: 'Clinic', coach_session: 'Coaching' };
  return map[type] || type;
}

const statusColors: Record<string, string> = {
  confirmed: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  pending: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  pending_payment: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  checked_in: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  completed: 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
  cancelled: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  no_show: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
};

export default function UpcomingSection() {
  const navigate = useNavigate();

  const { data: bookingsData } = useQuery({
    queryKey: ['home-upcoming-bookings'],
    queryFn: () => api.get('/bookings?status=confirmed&limit=3').then((r) => r.data),
    staleTime: 15000,
  });

  const { data: matchesData } = useQuery({
    queryKey: ['home-upcoming-matches'],
    queryFn: () => api.get('/matches?status=open,in_progress&limit=3').then((r) => r.data),
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
            onClick={() => navigate(`/bookings/${b.id}`)}
            className="w-full flex items-center gap-3 p-3 md:p-4 rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] hover:shadow-[var(--shadow-md)] transition-all duration-200 text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center shrink-0 text-lg">
              🎾
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-[var(--color-text)] truncate">{b.resource_name}</p>
                {b.booking_type && (
                  <span className="shrink-0 px-1.5 py-0.5 text-[10px] rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium">
                    {bookingTypeLabel(b.booking_type)}
                  </span>
                )}
                {b.booking_status && (
                  <span className={`shrink-0 px-1.5 py-0.5 text-[10px] rounded-full font-medium ${statusColors[b.booking_status] || 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>
                    {b.booking_status.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {b.branch_name} · {formatISODate(b.booking_date)} · {b.start_time?.slice(0, 5)}–{b.end_time?.slice(0, 5)}
                {b.start_time && b.end_time ? ` (${calcDuration(b.start_time, b.end_time)})` : ''}
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
                {m.booking_date ? formatISODate(m.booking_date) : ''} · {m.start_time?.slice(0, 5)} · {m.status}
              </p>
            </div>
            <span className="shrink-0 text-xs font-medium text-[var(--color-warning)]">View →</span>
          </button>
        ))}
      </div>
    </section>
  );
}
