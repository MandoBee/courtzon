import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { EntityImage } from '../../components/ui';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  processing: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  shipped: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export default function OrgDashboardPage() {
  const { orgId } = useParams<{ orgId: string }>();

  const { data: org } = useQuery({
    queryKey: ['org', orgId],
    queryFn: () => api.get(`/org/${orgId}/info`).then((r) => r.data),
    enabled: !!orgId,
  });

  const { data: stats } = useQuery({
    queryKey: ['org-stats', orgId],
    queryFn: () => api.get(`/org/${orgId}/stats`).then((r) => r.data),
    enabled: !!orgId,
  });

  const { data: sellerStats } = useQuery({
    queryKey: ['mp-seller-stats-dash', orgId],
    queryFn: () => api.get('/marketplace/seller/stats').then((r) => r.data),
    enabled: !!orgId,
  });

  const { data: recentOrdersData } = useQuery({
    queryKey: ['mp-recent-orders-dash', orgId],
    queryFn: () => api.get('/marketplace/seller/orders', { params: { page: 1, limit: 5 } }).then((r) => r.data),
    enabled: !!orgId,
  });

  const recentOrders = recentOrdersData?.data ?? recentOrdersData?.orders ?? [];
  const totalRevenue = sellerStats?.totalRevenue ?? sellerStats?.total_revenue ?? 0;
  const totalOrders = sellerStats?.totalOrders ?? sellerStats?.total_orders ?? stats?.totalOrders ?? 0;

  if (!orgId) return <div>Invalid organisation</div>;

  const statCards = [
    {
      label: 'Total Products',
      value: stats?.totalProducts ?? 0,
      icon: '🛒',
      color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
      link: `/org/${orgId}/marketplace`,
      permission: 'org.sidebar.marketplace',
    },
    {
      label: 'Total Orders',
      value: totalOrders,
      icon: '📦',
      color: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800',
      link: `/org/${orgId}/orders`,
      permission: 'org.sidebar.orders',
    },
    {
      label: 'Revenue',
      value: `${Number(totalRevenue).toFixed(2)} EGP`,
      icon: '💰',
      color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
      link: `/org/${orgId}/orders`,
      permission: 'org.sidebar.orders',
    },
    {
      label: 'Total Bookings',
      value: stats?.totalBookings ?? 0,
      icon: '📅',
      color: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
      link: `/org/${orgId}/bookings`,
      permission: 'org.sidebar.bookings',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <EntityImage src={org?.logo_url} name={org?.name || 'Organisation'} className="w-14 h-14 rounded-xl text-xl" />
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{org?.name || 'Dashboard'}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Welcome back! Here's what's happening with your shop.</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Can key={card.label} permission={card.permission}>
            <Link to={card.link}
              className={`block rounded-xl p-5 border ${card.color} transition-shadow hover:shadow-md`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{card.icon}</span>
                <span className="text-xs text-[var(--color-text-muted)]">&rarr;</span>
              </div>
              <p className="text-2xl font-bold text-[var(--color-text)]">{card.value}</p>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">{card.label}</p>
            </Link>
          </Can>
        ))}
      </div>

      {/* Recent Orders */}
      <Can permission="org.sidebar.orders">
        <div className="bg-[var(--color-surface)] rounded-xl p-5 border border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Recent Orders</h2>
            <Link to={`/org/${orgId}/orders`} className="text-sm text-[var(--color-primary)] hover:underline">
              View All &rarr;
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">No orders yet</p>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-[var(--color-bg)]">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">{item.product_name || 'Product'}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Order #{item.public_id?.slice(0, 8) || item.id} · {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    <span className="text-sm font-medium text-[var(--color-text)]">
                      {item.item_total != null ? `${Number(item.item_total).toFixed(2)} ${item.currency_code || 'EGP'}` : ''}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[item.status] || ''}`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Can>

      {/* Quick Actions */}
      <div className="bg-[var(--color-surface)] rounded-xl p-5 border border-[var(--color-border)]">
        <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Can permission="org.sidebar.marketplace">
            <Link to={`/org/${orgId}/marketplace`}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors">
              <span className="text-2xl">🛒</span>
              <span className="text-xs font-medium text-[var(--color-text)]">Products</span>
            </Link>
          </Can>
          <Can permission="org.sidebar.orders">
            <Link to={`/org/${orgId}/orders`}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors">
              <span className="text-2xl">📦</span>
              <span className="text-xs font-medium text-[var(--color-text)]">Orders</span>
            </Link>
          </Can>
          <Can permission="org.sidebar.staff">
            <Link to={`/org/${orgId}/staff`}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors">
              <span className="text-2xl">👥</span>
              <span className="text-xs font-medium text-[var(--color-text)]">Staff</span>
            </Link>
          </Can>
          <Can permission="org.sidebar.settings">
            <Link to={`/org/${orgId}/settings`}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors">
              <span className="text-2xl">⚙️</span>
              <span className="text-xs font-medium text-[var(--color-text)]">Settings</span>
            </Link>
          </Can>
        </div>
      </div>
    </div>
  );
}
