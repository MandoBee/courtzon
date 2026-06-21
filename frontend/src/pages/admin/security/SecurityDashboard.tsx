import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../../services/api';
import { Card, Badge, Spinner } from '../../../components/ui';

export default function SecurityDashboard() {
  const { data: secData, isLoading: secLoading } = useQuery({
    queryKey: ['admin', 'security', 'dashboard'],
    queryFn: () => api.get('/admin/security/dashboard').then(r => r.data?.data ?? {}),
  });

  const { data: alerts } = useQuery({
    queryKey: ['admin', 'security', 'alerts'],
    queryFn: () => api.get('/admin/security/alerts').then(r => r.data?.data ?? []),
  });

  const { data: health } = useQuery({
    queryKey: ['admin', 'security', 'system-health'],
    queryFn: () => api.get('/admin/security/system-health').then(r => r.data?.data ?? {}),
  });

  if (secLoading) return <Spinner size="lg" />;

  const s = secData || {};
  const severityColor: Record<string, string> = { high: 'danger', medium: 'warning', low: 'info' };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Security Dashboard</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Security monitoring & operations overview</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">Failed Logins (7d)</p>
          <p className="text-2xl font-bold text-[var(--color-error-text)]">{s.failedLogins ?? '—'}</p>
          <p className="text-xs text-red-500 mt-1">{s.todayFailedLogins ?? 0} today</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">Active Sessions</p>
          <p className="text-2xl font-bold text-[var(--color-text)]">{s.activeSessions ?? '—'}</p>
          <p className="text-xs text-amber-600 mt-1">{s.suspiciousSessions ?? 0} suspicious</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">Locked Accounts</p>
          <p className="text-2xl font-bold text-[var(--color-warning-text)]">{s.lockedAccounts ?? '—'}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Currently suspended</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">Audit Actions (7d)</p>
          <p className="text-2xl font-bold text-[var(--color-text)]">{s.auditActions ?? '—'}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">{s.recentUploads ?? 0} uploads</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Security Alerts</h3>
          {(!alerts || alerts.length === 0) ? (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-6">No recent security alerts</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {alerts.slice(0, 10).map((a: any, i: number) => (
                <div key={i} className="flex items-start gap-3 text-xs border-b border-[var(--color-border)] pb-2">
                  <Badge variant={severityColor[a.severity] as any || 'info'}>{a.severity}</Badge>
                  <div className="flex-1">
                    <p className="text-[var(--color-text)]">{a.description}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                      {a.ip_address} · {new Date(a.created_at).toLocaleString('en-GB')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">System Health</h3>
          {health?.checks ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-[var(--color-bg)] bg-[var(--color-surface)] rounded-[var(--radius-md)]">
                  <p className="text-[10px] text-[var(--color-text-muted)]">Database</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`w-2 h-2 rounded-full ${health.checks.database?.status === 'ok' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`} />
                    <span className="text-sm font-medium text-[var(--color-text)]">{health.checks.database?.status}</span>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{health.checks.database?.latencyMs}ms</p>
                </div>
                <div className="p-3 bg-[var(--color-bg)] bg-[var(--color-surface)] rounded-[var(--radius-md)]">
                  <p className="text-[10px] text-[var(--color-text-muted)]">Redis</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`w-2 h-2 rounded-full ${health.checks.redis?.status === 'ok' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`} />
                    <span className="text-sm font-medium text-[var(--color-text)]">{health.checks.redis?.status}</span>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{health.checks.redis?.latencyMs}ms</p>
                </div>
                <div className="p-3 bg-[var(--color-bg)] bg-[var(--color-surface)] rounded-[var(--radius-md)]">
                  <p className="text-[10px] text-[var(--color-text-muted)]">Memory</p>
                  <span className={`text-sm font-medium ${health.checks.memory?.usagePercent > 80 ? 'text-[var(--color-error-text)]' : 'text-[var(--color-success-text)]'}`}>
                    {health.checks.memory?.usagePercent?.toFixed(1) || '—'}%
                  </span>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{health.checks.memory?.freeMb}MB free</p>
                </div>
                <div className="p-3 bg-[var(--color-bg)] bg-[var(--color-surface)] rounded-[var(--radius-md)]">
                  <p className="text-[10px] text-[var(--color-text-muted)]">Uptime</p>
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {health.uptime ? `${Math.floor(health.uptime / 3600)}h` : '—'}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Server uptime</p>
                </div>
              </div>
            </div>
          ) : <Spinner size="sm" />}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Active Sessions', to: '/admin/security/sessions', icon: '💻', desc: 'Manage active user sessions' },
                { label: 'Failed Logins', to: '/admin/security/failed-logins', icon: '🚫', desc: 'View brute-force activity' },
                { label: 'Upload Security', to: '/admin/security/uploads', icon: '📁', desc: 'Review upload activity' },
                { label: 'Audit Log', to: '/admin/audit-logs', icon: '📋', desc: 'Full audit trail' },
                { label: 'System Health', to: '/admin/security/system-health', icon: '❤️', desc: 'Infrastructure status' },
              ].map(item => (
                <Link key={item.to} to={item.to}
                  className="p-3 border border-[var(--color-border)] rounded-[var(--radius-md)] hover:bg-[var(--color-bg)] transition-colors">
                  <p className="text-lg mb-1">{item.icon}</p>
                  <p className="text-sm font-medium text-[var(--color-text)]">{item.label}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">{item.desc}</p>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Redis Status</h3>
          {s.redis ? (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Memory</span><span className="font-mono">{s.redis.usedMemory || '—'}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Clients</span><span className="font-mono">{s.redis.connectedClients || '—'}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Hit Rate</span><span className="font-mono">{s.redis.hitRate || '—'}</span></div>
            </div>
          ) : <p className="text-xs text-[var(--color-text-muted)]">Redis info unavailable</p>}
        </Card>
      </div>
    </div>
  );
}
