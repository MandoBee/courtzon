import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { SkeletonRow } from '../../components/ui';

export default function OrgDashboardPage() {
  const { orgId } = useParams<{ orgId: string }>();

  const { data: org, isLoading: orgLoading } = useQuery({
    queryKey: ['org', orgId],
    queryFn: () => api.get(`/org/${orgId}/info`).then((r) => r.data),
    enabled: !!orgId,
  });

  const { data: dash, isLoading: dashLoading } = useQuery({
    queryKey: ['org-dashboard', orgId],
    queryFn: () => api.get(`/org/${orgId}/dashboard`).then((r) => r.data),
    enabled: !!orgId,
  });

  if (!orgId) return <div className="text-center py-16 text-[var(--color-text-muted)]">Invalid organisation</div>;
  if (orgLoading) return <div className="py-8"><SkeletonRow count={4} /></div>;

  const orgName = org?.name || 'Organization';
  const d = dash || {};

  const maxBookingTrend = Math.max(1, ...((d.bookingTrend || []).map((b: any) => b.count)));
  const maxMonthlyRevenue = Math.max(1, ...((d.monthlyRevenue || []).map((m: any) => m.revenue)));

  const occupancyPct = Math.min(100, Math.max(0, Number(d.occupancyRate) || 0));

  return (
    <div className="space-y-5 md:space-y-6 pb-4">
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 md:p-6">
        <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)]">
          Welcome back, {orgName}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">Here is what is happening at your organisation today.</p>
      </div>

      {dashLoading && <SkeletonRow count={2} />}

      {d && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 md:p-4">
              <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Today's Bookings</p>
              <p className="text-2xl font-bold text-[var(--color-primary)] mt-1">{d.todayBookings ?? 0}</p>
            </div>
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 md:p-4">
              <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Today's Revenue</p>
              <p className="text-2xl font-bold text-[var(--color-success)] mt-1">{Number(d.todayRevenue ?? 0).toFixed(0)}</p>
            </div>
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 md:p-4">
              <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Branches</p>
              <p className="text-2xl font-bold text-[var(--color-info)] mt-1">{d.totalBranches ?? 0}</p>
            </div>
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 md:p-4">
              <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Resources</p>
              <p className="text-2xl font-bold text-[var(--color-warning)] mt-1">{d.totalResources ?? 0}</p>
            </div>
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 md:p-4">
              <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Members</p>
              <p className="text-2xl font-bold text-[var(--color-text)] mt-1">{d.totalMembers ?? 0}</p>
            </div>
          </div>

          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Pending Actions</h2>
            <div className="space-y-2">
              <Link to={`/org/${orgId}/members`} className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
                <span className="text-base">⏳</span>
                Access Requests <span className="ml-auto font-semibold text-[var(--color-text)]">{d.pendingAccessRequests ?? 0} pending</span>
              </Link>
              <Link to={`/org/${orgId}/coaches`} className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
                <span className="text-base">👨‍🏫</span>
                Coach Invites <span className="ml-auto font-semibold text-[var(--color-text)]">{d.pendingCoachInvites ?? 0} pending</span>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
              <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Booking Trend (7 days)</h2>
              <div className="flex items-end gap-2 h-28">
                {(d.bookingTrend || []).map((b: any, i: number) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-[var(--color-primary)] rounded-t"
                      style={{ height: `${(b.count / maxBookingTrend) * 100}%`, minHeight: b.count > 0 ? '4px' : '0' }}
                    />
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {b.date ? new Date(b.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' }) : ''}
                    </span>
                  </div>
                ))}
              </div>
              {(!d.bookingTrend || d.bookingTrend.length === 0) && (
                <p className="text-xs text-[var(--color-text-muted)] text-center py-4">No data yet</p>
              )}
            </div>

            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
              <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Monthly Revenue (6 months)</h2>
              <div className="flex items-end gap-2 h-28">
                {(d.monthlyRevenue || []).map((m: any, i: number) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-[var(--color-success)] rounded-t"
                      style={{ height: `${(m.revenue / maxMonthlyRevenue) * 100}%`, minHeight: m.revenue > 0 ? '4px' : '0' }}
                    />
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {m.month ? new Date(m.month + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short' }) : ''}
                    </span>
                  </div>
                ))}
              </div>
              {(!d.monthlyRevenue || d.monthlyRevenue.length === 0) && (
                <p className="text-xs text-[var(--color-text-muted)] text-center py-4">No data yet</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
              <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Top Resources</h2>
              {(d.topResources || []).length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)] text-center py-4">No data yet</p>
              ) : (
                <div className="space-y-2">
                  {(d.topResources || []).map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--color-text)] truncate">{r.name}</span>
                      <span className="text-[var(--color-text-muted)] shrink-0 ml-2">{r.bookings} bookings</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
              <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Occupancy Rate</h2>
              <div className="flex flex-col items-center justify-center py-4">
                <div className="relative w-28 h-28">
                  <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-border)" strokeWidth="10" />
                    <circle
                      cx="60" cy="60" r="52" fill="none"
                      stroke={occupancyPct > 75 ? 'var(--color-success)' : occupancyPct > 50 ? 'var(--color-warning)' : 'var(--color-error)'}
                      strokeWidth="10"
                      strokeDasharray={`${(occupancyPct / 100) * 326.73} 326.73`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-[var(--color-text)]">
                    {occupancyPct}%
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-2">Average occupancy rate</p>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to={`/org/${orgId}/bookings`} className="flex flex-col items-center gap-1 p-3 rounded-[var(--radius-md)] border border-[var(--color-border)] hover:bg-[var(--color-bg)] text-sm text-[var(--color-text)]">
            <span className="text-xl">📅</span> Bookings
          </Link>
          <Link to={`/org/${orgId}/marketplace`} className="flex flex-col items-center gap-1 p-3 rounded-[var(--radius-md)] border border-[var(--color-border)] hover:bg-[var(--color-bg)] text-sm text-[var(--color-text)]">
            <span className="text-xl">🛒</span> Marketplace
          </Link>
          <Link to={`/org/${orgId}/staff`} className="flex flex-col items-center gap-1 p-3 rounded-[var(--radius-md)] border border-[var(--color-border)] hover:bg-[var(--color-bg)] text-sm text-[var(--color-text)]">
            <span className="text-xl">👥</span> Staff
          </Link>
          <Link to={`/org/${orgId}/settings`} className="flex flex-col items-center gap-1 p-3 rounded-[var(--radius-md)] border border-[var(--color-border)] hover:bg-[var(--color-bg)] text-sm text-[var(--color-text)]">
            <span className="text-xl">⚙️</span> Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
