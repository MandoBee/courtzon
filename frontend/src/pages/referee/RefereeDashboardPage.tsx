import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth.store';
import { formatISODate } from '../../utils/formatDate';
import { SkeletonRow } from '../../components/ui';
import { StatCard, SectionHeader, EmptyStateCard, QuickActions } from '../../components/workspace';
import { Can } from '../../permissions/Can';

export default function RefereeDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['referee-dashboard'],
    queryFn: () => api.get('/referee/dashboard').then((r) => r.data),
  });

  return (
    <div className="space-y-5 md:space-y-6 pb-4">
      <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)]">
        {t('referee.dashboard.title', 'Referee Dashboard')}
      </h1>
      <p className="text-sm text-[var(--color-text-muted)]">
        {t('referee.dashboard.welcome', 'Welcome back, {name}', { name: user?.fullName || '' })}
      </p>

      {isLoading && <SkeletonRow count={1} />}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon="📅" label={t('referee.dashboard.upcoming_matches', 'Upcoming')} value={dashboard.upcomingMatches} color="var(--color-primary)" />
          <StatCard icon="✅" label={t('referee.dashboard.completed_matches', 'Completed')} value={dashboard.completedMatches} color="var(--color-success)" />
          <StatCard icon="📋" label={t('referee.dashboard.total_assignments', 'Assignments')} value={dashboard.totalAssignments} color="var(--color-info)" />
          <StatCard icon="⭐" label={t('referee.dashboard.avg_rating', 'Avg Rating')} value={dashboard.averageRating ?? '—'} color="var(--color-warning)" />
        </div>
      )}

      <Can permission="referee.assignments.view">
        <QuickActions actions={[
          { label: t('referee.dashboard.view_assignments', 'View Assignments'), icon: '📋', path: '/referee/assignments' },
          { label: t('referee.dashboard.manage_availability', 'Manage Availability'), icon: '🕐', path: '/referee/availability' },
          { label: t('referee.dashboard.my_profile', 'My Profile'), icon: '👤', path: '/referee/profile' },
          { label: t('referee.dashboard.statistics', 'Statistics'), icon: '📊', path: '/referee/statistics' },
        ]} />
      </Can>

      <section>
        <SectionHeader
          icon="📅"
          title={t('referee.dashboard.today_matches', "Today's Upcoming Matches")}
          action={{ label: t('common.view_all', 'View All'), to: '/referee/assignments' }}
        />
        {isLoading && <SkeletonRow count={3} />}
        {!isLoading && (!dashboard?.todayMatches || dashboard.todayMatches.length === 0) && (
          <EmptyStateCard
            icon="📅"
            title={t('referee.dashboard.no_matches', 'No matches today')}
            description={t('referee.dashboard.no_matches_desc', 'You have no matches scheduled for today.')}
          />
        )}
        {dashboard?.todayMatches?.map((m: any) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </section>
    </div>
  );
}

function MatchCard({ match }: { match: any }) {
  const navigate = useNavigate();
  const statusColor =
    match.status === 'scheduled' ? 'var(--color-info)' :
    match.status === 'in_progress' ? 'var(--color-primary)' :
    'var(--color-text-muted)';

  return (
    <button
      onClick={() => navigate('/referee/assignments')}
      className="w-full text-left bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 md:p-4 hover:shadow-[var(--shadow-md)] transition-all duration-200 mb-2"
    >
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-sm font-semibold text-[var(--color-text)] truncate">
          {match.competitionName || match.competition_name || '—'}
        </p>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
          {match.status?.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <span>{match.matchType || match.match_type || '—'}</span>
        <span>·</span>
        <span>{formatISODate(match.date || match.scheduled_at)}</span>
        <span>·</span>
        <span>{new Date(match.date || match.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </button>
  );
}
