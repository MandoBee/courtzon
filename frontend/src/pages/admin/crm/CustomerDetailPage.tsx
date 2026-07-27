import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { EntityImage } from '../../../components/ui';
import { Skeleton } from '../../../components/ui/Skeleton';

type Tab = 'timeline' | 'bookings' | 'orders' | 'communications';

const tabs: { key: Tab; label: string }[] = [
  { key: 'timeline', label: 'Timeline' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'orders', label: 'Orders' },
  { key: 'communications', label: 'Communications' },
];

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('timeline');

  const { data: customer, isLoading: loadingCustomer } = useQuery({
    queryKey: ['admin', 'crm', 'customers', id],
    queryFn: () => api.get(`/admin/crm/customers/${id}`).then((r: any) => r.data?.data),
    enabled: !!id,
  });

  const { data: timeline, isLoading: loadingTimeline } = useQuery({
    queryKey: ['admin', 'crm', 'customers', id, 'timeline'],
    queryFn: () => api.get(`/admin/crm/customers/${id}/timeline`).then((r: any) => r.data?.data || []),
    enabled: !!id && activeTab === 'timeline',
  });

  const { data: bookings, isLoading: loadingBookings } = useQuery({
    queryKey: ['admin', 'crm', 'customers', id, 'bookings'],
    queryFn: () => api.get(`/admin/crm/customers/${id}/bookings`).then((r: any) => r.data?.data || []),
    enabled: !!id && activeTab === 'bookings',
  });

  const { data: orders, isLoading: loadingOrders } = useQuery({
    queryKey: ['admin', 'crm', 'customers', id, 'orders'],
    queryFn: () => api.get(`/admin/crm/customers/${id}/orders`).then((r: any) => r.data?.data || []),
    enabled: !!id && activeTab === 'orders',
  });

  const { data: communications, isLoading: loadingComms } = useQuery({
    queryKey: ['admin', 'crm', 'customers', id, 'communications'],
    queryFn: () => api.get(`/admin/crm/customers/${id}/communications`).then((r: any) => r.data?.data || []),
    enabled: !!id && activeTab === 'communications',
  });

  if (loadingCustomer) {
    return (
      <div>
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-32 mb-4" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!customer) {
    return <div className="text-center py-12 text-[var(--color-text-muted)]">Customer not found</div>;
  }

  const stats = [
    { label: 'Total Bookings', value: customer.total_bookings ?? 0, icon: '📅' },
    { label: 'Total Orders', value: customer.total_orders ?? 0, icon: '🛒' },
    { label: 'Wallet Balance', value: customer.wallet_balance != null ? Number(customer.wallet_balance).toLocaleString('en-GB') : '0', icon: '💰' },
    { label: 'Enrollments', value: customer.total_enrollments ?? 0, icon: '🎓' },
  ];

  const timelineItems = Array.isArray(timeline) ? timeline : [];

  return (
    <Can permission="crm.customers.view">
      <div>
        <Link to="/admin/crm/customers" className="text-sm text-[var(--color-primary)] hover:underline mb-4 inline-block">&larr; Back to Customers</Link>

        {/* Profile Header */}
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-6 mb-6">
          <div className="flex items-center gap-4">
            <EntityImage src={customer.avatar_url} name={customer.full_name || customer.email || '?'} className="w-16 h-16 rounded-full text-lg" />
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text)]">{customer.full_name || 'Unknown'}</h1>
              <p className="text-sm text-[var(--color-text-muted)]">{customer.email}</p>
              {customer.phone && <p className="text-sm text-[var(--color-text-muted)]">{customer.phone}</p>}
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Member since {customer.created_at ? new Date(customer.created_at).toLocaleDateString('en-GB') : '—'}</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((s) => (
            <div key={s.label} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg">{s.icon}</span>
              </div>
              <p className="text-2xl font-bold text-[var(--color-text)]">{s.value}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)]">
          <div className="flex border-b border-[var(--color-border)]">
            {tabs.map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* Timeline */}
            {activeTab === 'timeline' && (
              loadingTimeline ? <Skeleton className="h-48" /> : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {timelineItems.length === 0 && <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No activity yet</p>}
                  {timelineItems.map((item: any, idx: number) => (
                    <div key={item.id || idx} className="flex items-start gap-3 text-sm border-b border-[var(--color-border)] pb-3 last:border-0">
                      <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        item.type === 'booking' ? 'bg-blue-500' :
                        item.type === 'order' ? 'bg-green-500' :
                        item.type === 'wallet' ? 'bg-amber-500' :
                        item.type === 'enrollment' ? 'bg-purple-500' : 'bg-gray-400'
                      }`} />
                      <div className="flex-1">
                        <p className="text-[var(--color-text)] font-medium">{item.summary || item.description || item.type}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{item.detail || ''}</p>
                      </div>
                      <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString('en-GB') : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Bookings */}
            {activeTab === 'bookings' && (
              loadingBookings ? <Skeleton className="h-48" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[var(--color-bg)]/30">
                        <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">ID</th>
                        <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">Resource</th>
                        <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">Date</th>
                        <th className="text-center px-3 py-2 font-medium text-[var(--color-text-muted)]">Status</th>
                        <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(bookings || []).map((b: any) => (
                        <tr key={b.id} className="hover:bg-[var(--color-bg)]/30">
                          <td className="px-3 py-2 font-mono text-xs text-[var(--color-text-muted)]">#{b.id}</td>
                          <td className="px-3 py-2 text-[var(--color-text)]">{b.resource_name || '—'}</td>
                          <td className="px-3 py-2 text-[var(--color-text-muted)]">{b.start_date ? new Date(b.start_date).toLocaleDateString('en-GB') : '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              b.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                              b.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                            }`}>{b.status}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[var(--color-text)]">{b.total_amount ?? '—'}</td>
                        </tr>
                      ))}
                      {(!bookings || bookings.length === 0) && <tr><td colSpan={5} className="text-center py-6 text-[var(--color-text-muted)]">No bookings</td></tr>}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Orders */}
            {activeTab === 'orders' && (
              loadingOrders ? <Skeleton className="h-48" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[var(--color-bg)]/30">
                        <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">ID</th>
                        <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">Product</th>
                        <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">Date</th>
                        <th className="text-center px-3 py-2 font-medium text-[var(--color-text-muted)]">Status</th>
                        <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(orders || []).map((o: any) => (
                        <tr key={o.id} className="hover:bg-[var(--color-bg)]/30">
                          <td className="px-3 py-2 font-mono text-xs text-[var(--color-text-muted)]">#{o.id}</td>
                          <td className="px-3 py-2 text-[var(--color-text)]">{o.product_name || '—'}</td>
                          <td className="px-3 py-2 text-[var(--color-text-muted)]">{o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB') : '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 text-xs rounded-full capitalize ${
                              o.status === 'delivered' ? 'bg-green-100 text-green-700' :
                              o.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                              o.status === 'shipped' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                            }`}>{o.status}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[var(--color-text)]">{o.total ?? '—'}</td>
                        </tr>
                      ))}
                      {(!orders || orders.length === 0) && <tr><td colSpan={5} className="text-center py-6 text-[var(--color-text-muted)]">No orders</td></tr>}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Communications */}
            {activeTab === 'communications' && (
              loadingComms ? <Skeleton className="h-48" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[var(--color-bg)]/30">
                        <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">Channel</th>
                        <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">Subject</th>
                        <th className="text-center px-3 py-2 font-medium text-[var(--color-text-muted)]">Direction</th>
                        <th className="text-center px-3 py-2 font-medium text-[var(--color-text-muted)]">Status</th>
                        <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(communications || []).map((c: any, idx: number) => (
                        <tr key={c.id || idx} className="hover:bg-[var(--color-bg)]/30">
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              c.channel === 'email' ? 'bg-blue-100 text-blue-700' :
                              c.channel === 'sms' ? 'bg-purple-100 text-purple-700' :
                              c.channel === 'push' ? 'bg-amber-100 text-amber-700' :
                              c.channel === 'in_app' ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-500'
                            }`}>{c.channel || '—'}</span>
                          </td>
                          <td className="px-3 py-2 text-[var(--color-text)]">{c.subject || c.template_name || '—'}</td>
                          <td className="px-3 py-2 text-center text-[var(--color-text-muted)] capitalize">{c.direction || '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              c.status === 'sent' || c.status === 'delivered' ? 'bg-green-100 text-green-700' :
                              c.status === 'failed' || c.status === 'bounced' ? 'bg-red-100 text-red-700' :
                              c.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                            }`}>{c.status}</span>
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-[var(--color-text-muted)]">
                            {c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : '—'}
                          </td>
                        </tr>
                      ))}
                      {(!communications || communications.length === 0) && <tr><td colSpan={5} className="text-center py-6 text-[var(--color-text-muted)]">No communications</td></tr>}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </Can>
  );
}
