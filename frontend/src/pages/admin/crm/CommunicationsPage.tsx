import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { Pagination } from '../../../components/ui/Pagination';
import { SkeletonRow } from '../../../components/ui/Skeleton';

const channelBadge = (channel: string) => {
  const colors: Record<string, string> = {
    email: 'bg-blue-100 text-blue-700',
    sms: 'bg-purple-100 text-purple-700',
    push: 'bg-amber-100 text-amber-700',
    in_app: 'bg-teal-100 text-teal-700',
  };
  return colors[channel] || 'bg-gray-100 text-gray-500';
};

const statusBadge = (status: string) => {
  const colors: Record<string, string> = {
    sent: 'bg-green-100 text-green-700',
    delivered: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    failed: 'bg-red-100 text-red-700',
    bounced: 'bg-red-100 text-red-700',
    opened: 'bg-blue-100 text-blue-700',
    clicked: 'bg-indigo-100 text-indigo-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-500';
};

export default function CommunicationsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'crm', 'communications', page, pageSize, channelFilter, statusFilter, search, dateFrom, dateTo],
    queryFn: () => api.get('/admin/crm/communications', {
      params: {
        page, limit: pageSize,
        channel: channelFilter || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      },
    }).then((r: any) => r.data),
  });

  const communications = data?.data || [];
  const total = data?.total || 0;

  if (isLoading) return <SkeletonRow count={5} />;

  return (
    <Can permission="crm.communications.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Communication Log</h1>
        </div>

        <div className="flex flex-wrap gap-3 items-center mb-4">
          <input value={search} onChange={(e: any) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by user or subject..."
            className="px-3 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-bg)] w-64" />
          <select value={channelFilter} onChange={(e: any) => { setChannelFilter(e.target.value); setPage(1); }}
            className="px-2 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-bg)]">
            <option value="">All Channels</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="push">Push</option>
            <option value="in_app">In-App</option>
          </select>
          <select value={statusFilter} onChange={(e: any) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-2 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-bg)]">
            <option value="">All Statuses</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="bounced">Bounced</option>
            <option value="opened">Opened</option>
            <option value="clicked">Clicked</option>
          </select>
          <input type="date" value={dateFrom} onChange={(e: any) => { setDateFrom(e.target.value); setPage(1); }}
            className="px-2 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-bg)]" title="From date" />
          <input type="date" value={dateTo} onChange={(e: any) => { setDateTo(e.target.value); setPage(1); }}
            className="px-2 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-bg)]" title="To date" />
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[var(--color-bg)]/50">
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">User</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Channel</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Direction</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Subject</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {communications.map((c: any) => (
                <tr key={c.id} className="hover:bg-[var(--color-bg)]/30">
                  <td className="px-4 py-3">
                    <span className="text-[var(--color-text)] font-medium">{c.user_name || c.user_email || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${channelBadge(c.channel)}`}>{c.channel}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-[var(--color-text-muted)] capitalize">{c.direction || '—'}</td>
                  <td className="px-4 py-3 text-[var(--color-text)] max-w-xs truncate">{c.subject || c.template_name || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${statusBadge(c.status)}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-[var(--color-text-muted)]">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!communications.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No communications found</p>}
        </div>

        <div className="mt-4">
          <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
        </div>
      </div>
    </Can>
  );
}
