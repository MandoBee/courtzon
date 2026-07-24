import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth.store';
import { useTranslation } from '../../i18n';
import { formatPrice } from '../../utils/currency';
import { Sparkline } from '../../components/ui';
import { ActionCenter } from '../../components/dashboard/ActionCenter';
import type { ApiData } from '../../types/api';
import type { DashboardStats, DashboardTrends } from '../../types/admin/dashboard';
import { getChartColor, CHART_STROKE_PRIMARY } from '../../theme/chart-colors';

function Skeleton({ h = 'h-24' }: { h?: string }) {
  return <div className={`${h} bg-[var(--color-surface)] rounded-[var(--radius-lg)] animate-pulse`} />;
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const { data: stats, isLoading: loading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api.get<ApiData<DashboardStats>>('/admin/dashboard').then((r) => r.data?.data ?? {}),
  });

  const { data: trends, isLoading: loadingTrends } = useQuery({
    queryKey: ['admin', 'dashboard-trends'],
    queryFn: () => api.get<ApiData<DashboardTrends>>('/admin/dashboard/trends').then((r) => r.data?.data ?? {}),
  });

  if (loading || loadingTrends) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <Skeleton h="h-8 w-48" />
          <Skeleton h="h-6 w-24" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {[...Array(6)].map((_, i) => <Skeleton key={i} h="h-32" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton h="h-72" />
          <Skeleton h="h-72" />
        </div>
      </div>
    );
  }

  const fmt = (v: number | string | null | undefined) =>
    v != null ? Number(v).toLocaleString('en-GB') : '—';

  const kpis = [
    { label: t('admin.dashboard.total_users'), v: fmt(stats?.totalUsers), sub: `${stats?.activeUsersToday ?? 0} ${t('admin.dashboard.active_today')}`, icon: '👥', trend: '+12%' },
    { label: t('admin.dashboard.organisations'), v: fmt(stats?.totalOrganisations), sub: `${stats?.pendingOrganisations ?? 0} ${t('common.pending')}`, icon: '🏢', trend: '+3' },
    { label: t('admin.dashboard.total_bookings'), v: fmt(stats?.totalBookings), sub: `${stats?.todayBookings ?? 0} ${t('admin.dashboard.today')}`, icon: '📅', trend: '' },
    { label: t('admin.dashboard.revenue'), v: stats ? formatPrice(Number(stats.totalRevenue ?? 0)) : '—', sub: t('admin.dashboard.platform_revenue'), icon: '💰', trend: '' },
    { label: t('admin.dashboard.products'), v: fmt(stats?.totalProducts), sub: t('admin.dashboard.active_listings'), icon: '🛍️', trend: '' },
    { label: t('admin.dashboard.coaches'), v: fmt(stats?.totalCoaches), sub: t('admin.dashboard.registered'), icon: '🏋️', trend: '' },
  ];

  const revData = (trends?.revenueTimeline || []).map((r) => ({ ...r, amount: Number(r.amount ?? 0) }));
  const bookData = (trends?.bookingTimeline || []).map((r) => ({ ...r, count: Number(r.count ?? 0) }));
  const health = trends?.systemHealth ?? {};
  const activity = trends?.recentActivity || {};

  const sparklineMap: Record<string, { value: number }[]> = {
    [t('admin.dashboard.revenue')]: revData.map((d) => ({ value: d.amount })),
    [t('admin.dashboard.total_bookings')]: bookData.map((d) => ({ value: d.count })),
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('admin.dashboard.title')}</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{t('admin.dashboard.welcome', { name: user?.fullName || user?.email || '' })}</p>
        </div>
        <span className="px-3 py-1 bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-xs font-medium rounded-full">
          {user?.roles?.[0] || t('admin.dashboard.admin')}
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {kpis.map((k, i) => (
          <div key={k.label} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 border border-[var(--color-border)] hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{k.icon}</span>
              {k.trend && (
                <span className="text-xs font-semibold bg-[var(--color-success-bg)] text-[var(--color-success-text)] px-2 py-0.5 rounded-full">
                  ↑ {k.trend}
                </span>
              )}
            </div>
            {sparklineMap[k.label] && sparklineMap[k.label].length > 1 && (
              <div className="mb-1 -mx-2">
                <Sparkline data={sparklineMap[k.label]} color={getChartColor(i)} height={36} />
              </div>
            )}
            <p className="text-2xl font-bold text-[var(--color-text)]">{k.v}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{k.label}</p>
            <p className="text-[10px] text-[var(--color-text-muted)]/60 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Action Center */}
      <ActionCenter title="Action Center" actions={[
        { label: 'Pending Organisations', icon: '🏢', path: '/admin/organisations', count: stats?.pendingOrganisations ?? 0, color: 'bg-yellow-100 text-yellow-700' },
        { label: 'Today\'s Bookings', icon: '📅', path: '/admin/bookings', count: stats?.todayBookings ?? 0 },
        { label: 'Active Users Today', icon: '👥', path: '/admin/users', count: stats?.activeUsersToday ?? 0 },
        { label: 'View Reports', icon: '📈', path: '/admin/reports' },
        { label: 'Settlements', icon: '💰', path: '/admin/settlements' },
        { label: 'Reception', icon: '🏪', path: '/admin/reception' },
      ]} />

      {/* Two charts side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Revenue Chart */}
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 border">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">{t('admin.dashboard.revenue_30d')}</h3>
          {revData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={revData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--color-text-muted)" />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--color-text-muted)" />
                <Tooltip />
                <Line type="monotone" dataKey="amount" stroke={CHART_STROKE_PRIMARY()} strokeWidth={2} dot={false} name={t('admin.dashboard.revenue')} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-[var(--color-text-muted)] text-center py-10">{t('admin.dashboard.no_revenue')}</p>}
        </div>

        {/* Bookings Chart */}
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 border">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">{t('admin.dashboard.bookings_7d')}</h3>
          {bookData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={bookData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--color-text-muted)" />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--color-text-muted)" />
                <Tooltip />
                <Bar dataKey="count" fill={getChartColor(1)} radius={[4, 4, 0, 0]} name={t('admin.dashboard.total_bookings')} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-[var(--color-text-muted)] text-center py-10">{t('admin.dashboard.no_bookings')}</p>}
        </div>
      </div>

      {/* Bottom row: Activity + Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Recent Activity Feed */}
        <div className="lg:col-span-2 bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 border">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">{t('admin.dashboard.recent_activity')}</h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {activity.bookings?.map((b) => (
              <div key={`b-${b.id}`} className="flex items-center gap-3 text-xs border-b border-[var(--color-border)] pb-2">
                <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] flex-shrink-0" />
                <span className="text-[var(--color-text)] flex-1">
                  <strong>{b.full_name}</strong> booked a {b.booking_type.replace('_',' ')}
                </span>
                <span className="text-[var(--color-text-muted)] font-mono">{formatPrice(Number(b.total_amount))}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  b.booking_status === 'confirmed' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                  b.booking_status === 'cancelled' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                }`}>{b.booking_status}</span>
              </div>
            ))}
            {activity.users?.map((u) => (
              <div key={`u-${u.id}`} className="flex items-center gap-3 text-xs border-b border-[var(--color-border)] pb-2">
                <span className="w-2 h-2 rounded-full bg-[var(--color-success)] flex-shrink-0" />
                <span className="text-[var(--color-text)] flex-1">
                  <strong>{u.full_name}</strong> joined
                </span>
                <span className="text-[var(--color-text-muted)] font-mono">{u.email}</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">{new Date(u.created_at).toLocaleDateString('en-GB')}</span>
              </div>
            ))}
            {activity.orders?.map((o) => (
              <div key={`o-${o.id}`} className="flex items-center gap-3 text-xs border-b border-[var(--color-border)] pb-2">
                <span className="w-2 h-2 rounded-full bg-[var(--color-warning)] flex-shrink-0" />
                <span className="text-[var(--color-text)] flex-1">
                  <strong>{o.full_name}</strong> placed order #{o.id}
                </span>
                <span className="text-[var(--color-text-muted)] font-mono">{formatPrice(Number(o.total))}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-border)] text-[var(--color-text-muted)] capitalize`}>{o.status}</span>
              </div>
            ))}
            {(!activity.bookings?.length && !activity.users?.length && !activity.orders?.length) && (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-4">{t('admin.dashboard.no_activity')}</p>
            )}
          </div>
        </div>

        {/* System Health & Quick Actions */}
        <div className="space-y-4">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 border">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">{t('admin.dashboard.system_health')}</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--color-text-muted)]">{t('admin.dashboard.uptime')}</span>
                <span className="font-mono font-medium text-[var(--color-text)]">
                  {health.uptime != null ? `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--color-text-muted)]">{t('admin.dashboard.database')}</span>
                <span className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${health.dbStatus ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`} />
                  <span className="font-mono text-[var(--color-text)]">{health.dbStatus ? t('admin.dashboard.online') : t('admin.dashboard.offline')}</span>
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--color-text-muted)]">{t('admin.dashboard.errors_24h')}</span>
                <span className={`font-mono font-medium ${(health.errors24h ?? 0) > 10 ? 'text-[var(--color-error)]' : 'text-[var(--color-success)]'}`}>{health.errors24h ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--color-text-muted)]">{t('admin.dashboard.pending_orgs')}</span>
                <span className="font-mono font-medium text-[var(--color-warning)]">{stats?.pendingOrganisations ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 border">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">{t('admin.dashboard.quick_actions')}</h3>
            <div className="space-y-1">
              {[
                { label: t('admin.dashboard.create_org'), to: '/admin/organisations/new', icon: '➕' },
                { label: t('admin.dashboard.manage_roles'), to: '/admin/roles', icon: '🔐' },
                { label: t('admin.dashboard.subscriptions'), to: '/admin/subscription', icon: '💳' },
                { label: t('admin.dashboard.view_reports'), to: '/admin/reports', icon: '📈' },
                { label: t('admin.dashboard.manage_users'), to: '/admin/users', icon: '👥' },
                { label: t('admin.dashboard.audit_log'), to: '/admin/audit-logs', icon: '📋' },
              ].map((item) => (
                <Link key={item.to} to={item.to}
                  className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-xs text-[var(--color-text)] hover:bg-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
                  <span>{item.icon}</span> {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
