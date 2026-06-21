import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../../services/api';
import { Card, Badge, Spinner } from '../../../components/ui';
import { CHART_STROKE_ERROR } from '../../../theme/chart-colors';

export default function FailedLoginsPage() {
  const [days, setDays] = useState(7);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'security', 'failed-logins', days],
    queryFn: () => api.get('/admin/security/failed-logins', { params: { days } }).then(r => r.data?.data ?? {}),
  });

  const { data: feed } = useQuery({
    queryKey: ['admin', 'security', 'failed-logins', 'feed'],
    queryFn: () => api.get('/admin/security/failed-logins/feed', { params: { limit: 30 } }).then(r => r.data?.data ?? []),
  });

  if (isLoading) return <Spinner size="lg" />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Failed Login Monitoring</h1>
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
          <option value={1}>Last 24h</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-xs text-[var(--color-text-muted)]">Total Failed Logins</p>
          <p className="text-2xl font-bold text-[var(--color-error-text)]">{stats?.totalFailed ?? 0}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-[var(--color-text-muted)]">Locked Accounts</p>
          <p className="text-2xl font-bold text-[var(--color-warning-text)]">{stats?.lockedAccounts ?? 0}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-[var(--color-text-muted)]">Top Attacked IPs</p>
          <p className="text-2xl font-bold text-[var(--color-text)]">{stats?.topIps?.length ?? 0}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Failed Login Trend</h3>
          {stats?.daily?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={stats.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--color-text-muted)" />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--color-text-muted)" />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke={CHART_STROKE_ERROR()} strokeWidth={2} dot={false} name="Failed Logins" />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-[var(--color-text-muted)] text-center py-10">No data for this period</p>}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Top Attacked IPs / Accounts</h3>
          {stats?.topIps?.length > 0 ? (
            <div className="space-y-2">
              {stats.topIps.map((ip: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs border-b border-[var(--color-border)] pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-4 text-center text-[var(--color-text-muted)]">{i + 1}</span>
                    <span className="font-mono text-[var(--color-text)]">{ip.identifier}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="danger">{ip.attempts} attempts</Badge>
                    <span className="text-[10px] text-[var(--color-text-muted)]">{new Date(ip.last_attempt).toLocaleString('en-GB')}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-[var(--color-text-muted)] text-center py-6">No recent attacks</p>}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Recent Failed Login Feed</h3>
        {feed?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Identifier</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                  <th className="px-4 py-3 font-medium">User</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {feed.map((f: any) => (
                  <tr key={f.id} className="hover:bg-[var(--color-bg)]/50">
                    <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{new Date(f.created_at).toLocaleString('en-GB')}</td>
                    <td className="px-4 py-3 font-mono text-xs">{f.identifier}</td>
                    <td className="px-4 py-3 font-mono text-xs">{f.ip_address || '—'}</td>
                    <td className="px-4 py-3 text-xs">{f.full_name || <span className="text-[var(--color-text-muted)]">Unknown</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-[var(--color-text-muted)] text-center py-6">No failed login attempts recorded</p>}
      </Card>
    </div>
  );
}
