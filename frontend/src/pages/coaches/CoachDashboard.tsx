import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth.store';
import { formatISODate } from '../../utils/formatDate';
import { SkeletonRow } from '../../components/ui';
import { WorkspaceHero, StatCard, QuickActions, SectionHeader, EmptyStateCard, SummaryCard } from '../../components/workspace';

export default function CoachDashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

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
      <WorkspaceHero
        fullName={user?.fullName}
        avatarUrl={user?.avatarUrl}
        workspaceLabel="Coach"
        greetingIcon="🏋️"
        accentColor="var(--color-warning)"
        gradientFrom="from-[var(--color-warning)]/20"
        gradientTo="to-[var(--color-primary)]/10"
        primaryCta={{ label: 'Manage Sessions', icon: '📋', to: '/coach/sessions' }}
      />

      {statsLoading && <SkeletonRow count={1} />}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon="📋" label="Today" value={stats.todaySessions} color="var(--color-primary)" />
          <StatCard icon="📥" label="Requests" value={stats.pendingRequests} color="var(--color-warning)" />
          <StatCard icon="👥" label="Players" value={stats.activePlayers} color="var(--color-info)" />
          <StatCard icon="✅" label="Completed" value={stats.totalSessionsCompleted} color="var(--color-success)" />
        </div>
      )}

      <section>
        <SectionHeader icon="📋" title="Today's Sessions" action={{ label: 'View All', to: '/coach/sessions' }} />
        {sessionsLoading && <SkeletonRow count={3} />}
        {!sessionsLoading && upcoming.length === 0 && (
          <EmptyStateCard
            icon="📋"
            title="No sessions scheduled today"
            description="Check your availability or upcoming requests."
          />
        )}
        {!sessionsLoading && upcoming.slice(0, 5).map((s: any) => (
          <CoachSessionCard key={s.id} session={s} />
        ))}
      </section>

      <QuickActions
        actions={[
          { icon: '📋', label: 'My Sessions', onClick: () => navigate('/coach/sessions') },
          { icon: '📥', label: 'Requests', onClick: () => navigate('/coach/requests') },
          { icon: '⏰', label: 'Availability', onClick: () => navigate('/coach/availability') },
          { icon: '👤', label: 'My Profile', onClick: () => navigate('/coach/profile') },
        ]}
        accentColor="var(--color-warning)"
      />

      <SummaryCard icon="💰" title="Earnings" description="Summary coming soon" accentColor="var(--color-warning)" />
    </div>
  );
}

function CoachSessionCard({ session }: { session: any }) {
  const navigate = useNavigate();
  const statusColor =
    session.status === 'confirmed' ? 'var(--color-success)' :
    session.status === 'scheduled' ? 'var(--color-info)' :
    session.status === 'pending_court' || session.status === 'pending_acceptance' ? 'var(--color-warning)' :
    session.status === 'in_progress' ? 'var(--color-primary)' :
    'var(--color-text-muted)';

  return (
    <button
      onClick={() => navigate('/coach/sessions')}
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
