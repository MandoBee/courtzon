import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { Card, Badge, Spinner } from '../../../components/ui';

export default function SystemHealthPage() {
  const { data: health, isLoading } = useQuery({
    queryKey: ['admin', 'security', 'system-health'],
    queryFn: () => api.get('/admin/security/system-health').then(r => r.data?.data ?? {}),
  });

  const { data: redisInfo } = useQuery({
    queryKey: ['admin', 'security', 'redis'],
    queryFn: () => api.get('/admin/security/redis').then(r => r.data?.data ?? {}),
  });

  if (isLoading) return <Spinner size="lg" />;

  const checks = health?.checks || {};
  const redis = redisInfo || {};

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">System Health</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            Overall: <Badge variant={health?.status === 'ok' ? 'success' : health?.status === 'degraded' ? 'warning' : 'danger'}>{health?.status || 'unknown'}</Badge>
          </p>
        </div>
        <span className="text-xs text-[var(--color-text-muted)]">
          Updated: {health?.timestamp ? new Date(health.timestamp).toLocaleString('en-GB') : '—'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">Database</p>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${checks.database?.status === 'ok' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`} />
            <span className="text-lg font-bold text-[var(--color-text)] capitalize">{checks.database?.status}</span>
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Latency: {checks.database?.latencyMs}ms</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">Redis</p>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${checks.redis?.status === 'ok' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`} />
            <span className="text-lg font-bold text-[var(--color-text)] capitalize">{checks.redis?.status}</span>
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Latency: {checks.redis?.latencyMs}ms</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">Memory Usage</p>
          <p className={`text-lg font-bold ${checks.memory?.usagePercent > 80 ? 'text-[var(--color-error-text)]' : 'text-[var(--color-success-text)]'}`}>
            {checks.memory?.usagePercent?.toFixed(1) || '—'}%
          </p>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{checks.memory?.freeMb}MB free of {checks.memory?.totalMb}MB</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">Uptime</p>
          <p className="text-lg font-bold text-[var(--color-text)]">
            {health?.uptime ? `${Math.floor(health.uptime / 86400)}d ${Math.floor((health.uptime % 86400) / 3600)}h` : '—'}
          </p>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Server uptime</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Redis Details</h3>
          {redis && !redis.error ? (
            <div className="space-y-3 text-sm">
              {[
                { label: 'Used Memory', value: redis.usedMemory },
                { label: 'Peak Memory', value: redis.usedMemoryPeak },
                { label: 'Connected Clients', value: redis.connectedClients },
                { label: 'Total Connections', value: redis.totalConnectionsReceived },
                { label: 'Cache Hit Rate', value: redis.hitRate },
                { label: 'Keyspace Hits', value: redis.keyspaceHits },
                { label: 'Keyspace Misses', value: redis.keyspaceMisses },
              ].map(item => (
                <div key={item.label} className="flex justify-between border-b border-[var(--color-border)] pb-1.5">
                  <span className="text-[var(--color-text-muted)]">{item.label}</span>
                  <span className="font-mono text-[var(--color-text)]">{item.value || '—'}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-red-500">{redis?.error || 'Redis unavailable'}</p>}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Service Status</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg)] bg-[var(--color-surface)] rounded-[var(--radius-md)]">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">API Server</p>
                <p className="text-xs text-[var(--color-text-muted)]">CourtZon Backend</p>
              </div>
              <Badge variant={health?.status !== 'down' ? 'success' : 'danger'}>
                {health?.status !== 'down' ? 'Online' : 'Offline'}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg)] bg-[var(--color-surface)] rounded-[var(--radius-md)]">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">Queue Worker</p>
                <p className="text-xs text-[var(--color-text-muted)]">BullMQ jobs</p>
              </div>
              <Badge variant="success">Active</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-[var(--color-bg)] bg-[var(--color-surface)] rounded-[var(--radius-md)]">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">Redis</p>
                <p className="text-xs text-[var(--color-text-muted)]">Cache & queue backend</p>
              </div>
              <Badge variant={checks.redis?.status === 'ok' ? 'success' : 'danger'}>
                {checks.redis?.status === 'ok' ? 'Online' : 'Offline'}
              </Badge>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
