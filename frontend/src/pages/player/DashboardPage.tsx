import { useAuthStore } from '../../store/auth.store';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { Can } from '../../permissions/Can';
import { SkeletonRow } from '../../components/ui/Skeleton';
import api from '../../services/api';
import { localToday } from '../../utils/dateRange';

function StatCard({ label, value, icon, href }: { label: string; value: string | number | undefined | null; icon: string; href?: string }) {
  const inner = (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-4 flex items-center gap-3">
      <span className="text-2xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[var(--color-text-muted)] truncate">{label}</p>
        <p className="text-lg font-bold text-[var(--color-text)]">{value ?? '—'}</p>
      </div>
    </div>
  );
  if (href) return <Link to={href} className="block hover:opacity-80 transition-opacity">{inner}</Link>;
  return inner;
}

function QuickAction({ label, icon, to }: { label: string; icon: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center justify-center gap-1 p-3 bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/40 transition-colors text-center"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-xs font-medium text-[var(--color-text)]">{label}</span>
    </Link>
  );
}

export default function PlayerDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();
  const { data: wallet } = useQuery({
    queryKey: ['wallet', 'me'],
    queryFn: () => api.get('/wallets/me').then((r) => r.data),
  });

  const { data: unreadCount } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data?.count ?? r.data ?? 0),
  });

  const { data: upcomingBookings, isLoading: loadingBookings } = useQuery({
    queryKey: ['bookings', 'upcoming'],
    queryFn: () => {
      const today = localToday();
      return api.get(`/bookings?status=confirmed&from=${today}&limit=5`).then((r) => r.data?.data || []);
    },
  });

  const { data: matches, isLoading: loadingMatches } = useQuery({
    queryKey: ['matches', 'upcoming'],
    queryFn: () => api.get('/matches?limit=5').then((r) => r.data?.data || []),
  });

  const { data: enrollments, isLoading: loadingEnrollments } = useQuery({
    queryKey: ['my', 'academy', 'enrollments'],
    queryFn: () => api.get('/my/academy/enrollments').then((r) => r.data?.data || r.data || []),
  });

  const { data: tournaments, isLoading: loadingTournaments } = useQuery({
    queryKey: ['my', 'tournaments'],
    queryFn: () => api.get('/my/tournaments').then((r) => r.data?.data || r.data || []),
  });

  const { data: recentActivity } = useQuery({
    queryKey: ['my', 'dashboard'],
    queryFn: () => api.get('/players/my/dashboard').then((r) => r.data?.recent_activity || r.data?.activity || r.data?.recentActivity || []).catch(() => []),
  });

  return (
    <div className="space-y-5 md:space-y-6 pb-4">
      {/* Welcome */}
      <div className="bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-info)]/5 rounded-[var(--radius-lg)] p-5 md:p-6">
        <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)]">
          {t('player.dashboard.welcome', { name: user?.fullName || t('player.dashboard.player') })}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">{t('player.dashboard.subtitle')}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('player.dashboard.wallet_balance')} value={wallet?.balance != null ? `${Number(wallet.balance).toFixed(2)} ${wallet.currency || ''}` : '—'} icon="💰" href="/my/wallet" />
        <StatCard label={t('player.dashboard.unread_notifications')} value={unreadCount ?? '—'} icon="🔔" href="/notifications" />
        <StatCard label={t('player.dashboard.upcoming_bookings')} value={Array.isArray(upcomingBookings) ? upcomingBookings.length : '—'} icon="📅" href="/bookings" />
        <Can permission="membership.view">
          <StatCard label={t('player.dashboard.membership')} value={t('player.dashboard.view_plans')} icon="⭐" href="/membership" />
        </Can>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">{t('player.dashboard.quick_actions')}</h2>
        <div className="grid grid-cols-4 gap-2">
          <QuickAction label={t('player.dashboard.book_court')} icon="🎾" to="/bookings?newBooking=true" />
          <QuickAction label={t('player.dashboard.find_matches')} icon="🤝" to="/matches" />
          <Can permission="academies.view">
            <QuickAction label={t('player.dashboard.browse_academies')} icon="🎓" to="/academies" />
          </Can>
          <Can permission="tournaments.view">
            <QuickAction label={t('player.dashboard.browse_tournaments')} icon="🏆" to="/tournaments" />
          </Can>
        </div>
      </div>

      {/* Upcoming Bookings */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">{t('player.dashboard.upcoming_bookings')}</h2>
          <Link to="/bookings" className="text-xs text-[var(--color-primary)] hover:underline">{t('common.view_all')}</Link>
        </div>
        {loadingBookings ? <SkeletonRow count={2} /> : (
          <div className="space-y-2">
            {Array.isArray(upcomingBookings) && upcomingBookings.length > 0 ? upcomingBookings.slice(0, 3).map((b: any) => (
              <Link key={b.id} to={`/bookings/${b.id}`} className="block bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 hover:border-[var(--color-primary)]/30 transition-colors">
                <p className="text-sm font-medium text-[var(--color-text)]">{b.resource_name || b.organisation_name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{b.booking_date ? new Date(b.booking_date).toLocaleDateString() : ''} {b.start_time?.slice(0, 5)}</p>
              </Link>
            )) : (
              <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">{t('player.dashboard.no_upcoming_bookings')}</p>
            )}
          </div>
        )}
      </div>

      {/* Upcoming Matches */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">{t('player.dashboard.upcoming_matches')}</h2>
          <Link to="/matches" className="text-xs text-[var(--color-primary)] hover:underline">{t('common.view_all')}</Link>
        </div>
        {loadingMatches ? <SkeletonRow count={2} /> : (
          <div className="space-y-2">
            {Array.isArray(matches) && matches.length > 0 ? matches.slice(0, 3).map((m: any) => (
              <Link key={m.id} to={`/matches/${m.id}`} className="block bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 hover:border-[var(--color-primary)]/30 transition-colors">
                <p className="text-sm font-medium text-[var(--color-text)]">{m.title || m.name || `${t('player.dashboard.match')} #${m.id}`}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString() : ''}</p>
              </Link>
            )) : (
              <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">{t('player.dashboard.no_upcoming_matches')}</p>
            )}
          </div>
        )}
      </div>

      {/* Active Academy Enrollments */}
      <Can permission="academies.enroll">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">{t('player.dashboard.active_enrollments')}</h2>
            <Link to="/academies" className="text-xs text-[var(--color-primary)] hover:underline">{t('common.view_all')}</Link>
          </div>
          {loadingEnrollments ? <SkeletonRow count={1} /> : (
            <div className="space-y-2">
              {Array.isArray(enrollments) && enrollments.length > 0 ? enrollments.slice(0, 3).map((e: any) => (
                <div key={e.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3">
                  <p className="text-sm font-medium text-[var(--color-text)]">{e.program_name || e.academy_name || t('player.dashboard.academy')}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{e.status}</p>
                </div>
              )) : (
                <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">{t('player.dashboard.no_enrollments')}</p>
              )}
            </div>
          )}
        </div>
      </Can>

      {/* Active Tournament Registrations */}
      <Can permission="player.tournaments.register">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">{t('player.dashboard.active_tournaments')}</h2>
            <Link to="/tournaments" className="text-xs text-[var(--color-primary)] hover:underline">{t('common.view_all')}</Link>
          </div>
          {loadingTournaments ? <SkeletonRow count={1} /> : (
            <div className="space-y-2">
              {Array.isArray(tournaments) && tournaments.length > 0 ? tournaments.slice(0, 3).map((t: any) => (
                <Link key={t.id} to={`/tournaments/${t.id}`} className="block bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 hover:border-[var(--color-primary)]/30 transition-colors">
                  <p className="text-sm font-medium text-[var(--color-text)]">{t.name || t.title}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{t.status}</p>
                </Link>
              )) : (
                <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">{t('player.dashboard.no_tournaments')}</p>
              )}
            </div>
          )}
        </div>
      </Can>

      {/* Recent Activity */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">{t('player.dashboard.recent_activity')}</h2>
        {Array.isArray(recentActivity) && recentActivity.length > 0 ? (
          <div className="space-y-2">
            {recentActivity.slice(0, 5).map((a: any, i: number) => (
              <div key={a.id ?? i} className="flex items-center gap-3 bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3">
                <span className="text-lg">{a.icon || '📌'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--color-text)] truncate">{a.description || a.message || a.title || a.action}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{a.timestamp || a.created_at ? new Date(a.timestamp || a.created_at).toLocaleDateString() : ''}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">{t('player.dashboard.no_activity')}</p>
        )}
      </div>
    </div>
  );
}
