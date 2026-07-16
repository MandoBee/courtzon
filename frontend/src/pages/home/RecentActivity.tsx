import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCan } from '../../hooks/useCan';
import api from '../../services/api';
import { formatISODate } from '../../utils/formatDate';

export default function RecentActivity() {
  const navigate = useNavigate();
  const { can } = useCan();
  const showRecentActivity = can('home.recent-activity');

  const { data } = useQuery({
    queryKey: ['home-recent-activity'],
    queryFn: () => api.get('/bookings?status=&limit=5').then((r) => r.data),
    enabled: showRecentActivity,
    staleTime: 15000,
  });

  if (!showRecentActivity) return null;

  const bookings = data?.data || [];

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">⏱</span>
        <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">Recent Activity</h2>
      </div>
      <div className="rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] p-4 md:p-5">
        {bookings.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-2">
            No recent activity. Start by booking a court!
          </p>
        )}
        <div className="space-y-2">
          {bookings.slice(0, 5).map((b: any, idx: number) => (
            <div
              key={b.id}
              className="flex items-center gap-3 p-2.5 rounded-[var(--radius-md)] bg-[var(--color-bg)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer"
              onClick={() => navigate('/bookings')}
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-base">
                  🎾
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--color-primary)] border-2 border-[var(--color-surface)] flex items-center justify-center">
                  <span className="text-[7px] text-white">✓</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-text)] truncate">
                  {b.resource_name} · {b.branch_name}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {formatISODate(b.booking_date)} · {b.start_time?.slice(0, 5)}
                </p>
              </div>
              <span
                className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                  b.booking_status === 'confirmed' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                  b.booking_status === 'checked_in' ? 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]' :
                  b.booking_status === 'completed' ? 'bg-[var(--color-border)] text-[var(--color-text-muted)]' :
                  b.booking_status === 'cancelled' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' :
                  'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'
                }`}
              >
                {b.booking_status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
