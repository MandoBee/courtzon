import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { Card, Spinner, Button } from '../../../components/ui';

interface AnalyticsRecord {
  id: number;
  notificationId: number;
  userId: number;
  eventName: string | null;
  categorySlug: string | null;
  channel: string | null;
  action: string;
  metadata: Record<string, any> | null;
  createdAt: string;
}

interface AnalyticsResponse {
  records: AnalyticsRecord[];
  summary: Record<string, number>;
}

const ACTION_LABELS: Record<string, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  opened: 'Opened',
  clicked: 'Clicked',
  read: 'Read',
  archived: 'Archived',
  deleted: 'Deleted',
  delivery_failed: 'Failed',
  expired: 'Expired',
};

const COLORS: Record<string, string> = {
  sent: 'bg-blue-500/10 text-blue-600',
  delivered: 'bg-green-500/10 text-green-600',
  opened: 'bg-emerald-500/10 text-emerald-600',
  clicked: 'bg-amber-500/10 text-amber-600',
  read: 'bg-violet-500/10 text-violet-600',
  archived: 'bg-gray-500/10 text-gray-600',
  deleted: 'bg-red-500/10 text-red-600',
  delivery_failed: 'bg-red-500/10 text-red-600',
  expired: 'bg-orange-500/10 text-orange-600',
};

export default function AdminAnalyticsPage() {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'notifications', 'analytics', from, to],
    queryFn: () =>
      api
        .get('/admin/notifications/analytics', { params: { from, to } })
        .then((r) => r.data as AnalyticsResponse),
  });

  const summary = data?.summary || {};
  const records = data?.records || [];
  const orderedActions = ['sent', 'delivered', 'opened', 'clicked', 'read', 'archived', 'deleted', 'delivery_failed', 'expired'];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Notification Analytics</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 text-sm rounded-[var(--radius-md)] border bg-[var(--color-bg)]"
          />
          <span className="text-[var(--color-text-muted)]">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 text-sm rounded-[var(--radius-md)] border bg-[var(--color-bg)]"
          />
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3 mb-8">
            {orderedActions.map((action) => (
              <Card key={action} className="text-center p-4">
                <div className={`text-2xl font-bold ${COLORS[action] || 'text-[var(--color-text)]'}`}>
                  {summary[action] ?? 0}
                </div>
                <div className="text-xs text-[var(--color-text-muted)] mt-1">{ACTION_LABELS[action] || action}</div>
              </Card>
            ))}
          </div>

          <Card>
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Event Log</h2>
            {records.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-6">
                No events found in this date range.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                      <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Event</th>
                      <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Action</th>
                      <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Channel</th>
                      <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">User ID</th>
                      <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {records.map((r) => (
                      <tr key={r.id} className="hover:bg-[var(--color-bg)]/30">
                        <td className="px-3 py-2 font-mono text-xs text-[var(--color-text)]">
                          {r.eventName || '-'}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full ${
                              COLORS[r.action] || 'bg-gray-500/10 text-gray-600'
                            }`}
                          >
                            {ACTION_LABELS[r.action] || r.action}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[var(--color-text-muted)]">{r.channel || '-'}</td>
                        <td className="px-3 py-2 text-[var(--color-text-muted)]">#{r.userId}</td>
                        <td className="px-3 py-2 text-[var(--color-text-muted)]">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
