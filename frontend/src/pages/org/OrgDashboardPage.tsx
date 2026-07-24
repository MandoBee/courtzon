import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth.store';
import { Can } from '../../permissions/Can';
import { SkeletonRow } from '../../components/ui';
import { WorkspaceHero, StatCard, SectionHeader, EmptyStateCard } from '../../components/workspace';
import { ActionCenter, QuickActions } from '../../components/dashboard/ActionCenter';

export default function OrgDashboardPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const user = useAuthStore((s) => s.user);

  const { data: org, isLoading: orgLoading } = useQuery({
    queryKey: ['org', orgId],
    queryFn: () => api.get(`/org/${orgId}/info`).then((r) => r.data),
    enabled: !!orgId,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['org-stats', orgId],
    queryFn: () => api.get(`/org/${orgId}/stats`).then((r) => r.data),
    enabled: !!orgId,
  });

  const { data: bookingsData } = useQuery({
    queryKey: ['org-recent-bookings', orgId],
    queryFn: () => api.get(`/org/${orgId}/bookings?limit=5`).then((r) => r.data),
    enabled: !!orgId,
  });

  const recentBookings = bookingsData?.data || [];

  if (!orgId) return <div className="text-center py-16 text-[var(--color-text-muted)]">Invalid organisation</div>;
  if (orgLoading) return <div className="py-8"><SkeletonRow count={4} /></div>;

  const orgName = org?.name || 'Organization';

  return (
    <div className="space-y-5 md:space-y-6 pb-4">
      <WorkspaceHero
        fullName={user?.fullName || orgName}
        avatarUrl={org?.logo_url}
        workspaceLabel="Organization"
        greetingIcon="🏛️"
        accentColor="var(--color-info)"
        gradientFrom="from-[var(--color-info)]/20"
        gradientTo="to-[var(--color-primary)]/10"
        primaryCta={{ label: 'View Dashboard', icon: '📊', to: `/org/${orgId}/dashboard` }}
      />

      {statsLoading && <SkeletonRow count={1} />}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Can permission="org.sidebar.bookings">
            <Link to={`/org/${orgId}/bookings`}>
              <StatCard icon="📅" label="Bookings" value={stats.totalBookings ?? 0} color="var(--color-primary)" />
            </Link>
          </Can>
          <Can permission="org.sidebar.orders">
            <Link to={`/org/${orgId}/orders`}>
              <StatCard icon="📦" label="Orders" value={stats.totalOrders ?? 0} color="var(--color-info)" />
            </Link>
          </Can>
          <Can permission="org.sidebar.marketplace">
            <Link to={`/org/${orgId}/marketplace`}>
              <StatCard icon="🛒" label="Products" value={stats.totalProducts ?? 0} color="var(--color-warning)" />
            </Link>
          </Can>
          <Can permission="org.sidebar.finance">
            <Link to={`/org/${orgId}/finance`}>
              <StatCard icon="💰" label="Revenue" value={stats.totalRevenue ? `${Number(stats.totalRevenue).toFixed(0)}` : '0'} color="var(--color-success)" />
            </Link>
          </Can>
        </div>
      )}

      {/* Action Center */}
      <ActionCenter title="Pending" actions={[
        { label: 'Pending Approvals', icon: '⏳', path: `/org/${orgId}/members` },
        { label: 'Recent Bookings', icon: '📅', path: `/org/${orgId}/bookings`, count: recentBookings.length },
        { label: 'Staff', icon: '👥', path: `/org/${orgId}/staff` },
        { label: 'Coaches', icon: '👨‍🏫', path: `/org/${orgId}/coaches` },
      ]} />

      <QuickActions actions={[
        { label: 'Bookings', icon: '📅', path: `/org/${orgId}/bookings` },
        { label: 'Marketplace', icon: '🛒', path: `/org/${orgId}/marketplace` },
        { label: 'Staff', icon: '👥', path: `/org/${orgId}/staff` },
        { label: 'Settings', icon: '⚙️', path: `/org/${orgId}/settings` },
      ]} />

      <Can permission="org.sidebar.bookings">
      <section>
        <SectionHeader icon="📅" title="Recent Bookings" action={{ label: 'View All', to: `/org/${orgId}/bookings` }} />
        {recentBookings.length === 0 ? (
          <EmptyStateCard icon="📅" title="No recent bookings" description="Bookings will appear here when customers book your courts." />
        ) : (
          <div className="space-y-2">
            {recentBookings.slice(0, 5).map((b: any) => (
              <div key={b.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 md:p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-[var(--color-text)] truncate">{b.resource_name}</p>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-info-bg)] text-[var(--color-info-text)]">
                    {b.booking_status}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">{b.branch_name} · {b.booking_date} · {b.start_time?.slice(0, 5)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
      </Can>
    </div>
  );
}
