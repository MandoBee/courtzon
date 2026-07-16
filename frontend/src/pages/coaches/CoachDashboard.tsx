import { useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth.store';
import { formatISODate } from '../../utils/formatDate';
import { SkeletonRow } from '../../components/ui';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function CoachDashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const greeting = useMemo(getGreeting, []);
  const dateStr = useMemo(formatDate, []);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['coach-stats'],
    queryFn: () => api.get('/coaches/stats').then((r) => r.data),
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['coach-today-sessions'],
    queryFn: () => api.get('/coaches/sessions/me?role=coach&limit=10').then((r) => r.data),
  });

  const upcoming = Array.isArray(sessionsData?.data)
    ? sessionsData.data.filter((s: any) => !['cancelled', 'no_show', 'completed'].includes(s.status))
    : [];

  return (
    <div className="space-y-5 md:space-y-6 pb-4">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[var(--radius-xl)] bg-gradient-to-br from-[var(--color-warning)]/20 to-[var(--color-primary)]/10 p-5 md:p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-[var(--color-warning)]/20 flex items-center justify-center text-xl">
            {user?.fullName?.charAt(0) || 'C'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--color-text-muted)] font-medium">{greeting}</p>
            <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)] mt-0.5 truncate">
              {user?.fullName || 'Coach'}
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-[var(--color-warning)]/15 text-[var(--color-warning)]">
                🏋️ Coach
              </span>
              <span className="text-[11px] text-[var(--color-text-muted)]">{dateStr}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      {statsLoading && <SkeletonRow count={1} />}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon="📋" label="Today" value={stats.todaySessions} color="var(--color-primary)" />
          <StatCard icon="📥" label="Requests" value={stats.pendingRequests} color="var(--color-warning)" />
          <StatCard icon="👥" label="Players" value={stats.activePlayers} color="var(--color-info)" />
          <StatCard icon="✅" label="Completed" value={stats.totalSessionsCompleted} color="var(--color-success)" />
        </div>
      )}

      {/* Today's Sessions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">Today's Sessions</h2>
          </div>
          <Link to="/coach/sessions" className="text-xs text-[var(--color-primary)] font-medium">View All →</Link>
        </div>
        {sessionsLoading && <SkeletonRow count={3} />}
        {!sessionsLoading && upcoming.length === 0 && (
          <div className="rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] p-5 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">No sessions scheduled today.</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Check your availability or upcoming requests.</p>
          </div>
        )}
        {!sessionsLoading && upcoming.slice(0, 5).map((s: any) => (
          <SessionCard key={s.id} session={s} />
        ))}
      </section>

      {/* Quick Actions */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction icon="📋" label="My Sessions" onClick={() => navigate('/coach/sessions')} />
          <QuickAction icon="📥" label="Requests" onClick={() => navigate('/coach/requests')} />
          <QuickAction icon="⏰" label="Availability" onClick={() => navigate('/coach/availability')} />
          <QuickAction icon="👤" label="My Profile" onClick={() => navigate('/coach/profile')} />
        </div>
      </section>

      {/* Earnings placeholder */}
      <section className="rounded-[var(--radius-lg)] bg-gradient-to-r from-[var(--color-warning)]/5 to-[var(--color-primary)]/5 border border-dashed border-[var(--color-border)] p-4 md:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--color-text)]">Earnings</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Summary coming soon</p>
          </div>
          <span className="text-2xl">💰</span>
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] p-3 md:p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      </div>
      <p className="text-xl md:text-2xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 p-3 md:p-4 rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-xs font-semibold text-[var(--color-text)]">{label}</span>
    </button>
  );
}

function SessionCard({ session }: { session: any }) {
  const navigate = useNavigate();
  const statusColor =
    session.status === 'confirmed' ? 'var(--color-success)' :
    session.status === 'scheduled' ? 'var(--color-info)' :
    session.status === 'pending_court' || session.status === 'pending_acceptance' ? 'var(--color-warning)' :
    session.status === 'in_progress' ? 'var(--color-primary)' :
    'var(--color-text-muted)';

  return (
    <button
      onClick={() => navigate(`/coach/sessions`)}
      className="w-full text-left bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 md:p-4 hover:shadow-[var(--shadow-md)] transition-all duration-200 mb-2"
    >
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-sm font-semibold text-[var(--color-text)] truncate">
          {session.player_name || 'Player'}
        </p>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
          {session.status?.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <span>{formatISODate(session.start_time)}</span>
        <span>·</span>
        <span>{new Date(session.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
        {session.organisation_name && <><span>·</span><span>{session.organisation_name}</span></>}
      </div>
    </button>
  );
}
