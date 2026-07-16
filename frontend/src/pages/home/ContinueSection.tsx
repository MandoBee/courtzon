import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatISODate } from '../../utils/formatDate';

export default function ContinueSection() {
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['home-continue'],
    queryFn: () => api.get('/bookings?status=pending,confirmed&limit=5').then((r) => r.data),
    staleTime: 15000,
  });

  const items = data?.data || [];

  if (!items.length) {
    return (
      <section className="rounded-[var(--radius-lg)] bg-gradient-to-r from-[var(--color-primary)]/5 to-[var(--color-info)]/5 border border-dashed border-[var(--color-border)] p-4 md:p-5">
        <p className="text-sm text-[var(--color-text-muted)] text-center">
          No pending bookings —{' '}
          <button onClick={() => navigate('/browse')} className="text-[var(--color-primary)] hover:underline font-medium">
            book a court now
          </button>
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">📋</span>
        <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">Continue Where You Left Off</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 scrollbar-none">
        {items.map((b: any) => (
          <button
            key={b.id}
            onClick={() => navigate(`/bookings`)}
            className="shrink-0 w-56 md:w-64 text-left bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 hover:shadow-[var(--shadow-md)] transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🎾</span>
              <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                {b.booking_status}
              </span>
            </div>
            <p className="text-sm font-semibold text-[var(--color-text)] truncate">{b.resource_name}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{b.branch_name}</p>
            <div className="flex items-center gap-2 mt-2 text-xs text-[var(--color-text-muted)]">
              <span>{formatISODate(b.booking_date)}</span>
              <span>·</span>
              <span>{b.start_time?.slice(0, 5)}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
