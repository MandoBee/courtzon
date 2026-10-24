import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { SkeletonRow } from '../../../components/ui/Skeleton';

export default function SystemHealthPage() {
  const { data: health, isLoading } = useQuery({
    queryKey: ['admin', 'security', 'system-health'],
    queryFn: () => api.get('/admin/security/system-health').then(r => r.data?.data ?? {}),
  });

  const { data: redisInfo } = useQuery({
    queryKey: ['admin', 'security', 'redis'],
    queryFn: () => api.get('/admin/security/redis').then(r => r.data?.data ?? {}),
  });

  // The Prometheus `/metrics` summary was removed: `GET /metrics` is fail-closed
  // in production (404 without METRICS_TOKEN, 401 without a valid Bearer token),
  // and the token must never be exposed to the browser — so an unauthenticated
  // browser fetch can only fail. Metrics are scraped server-side instead.

  if (isLoading) return <div className="space-y-4"><SkeletonRow count={6} /></div>;

  const checks = [
    { label: 'Database', status: health?.checks?.database?.status || 'unknown', latency: health?.checks?.database?.latencyMs, icon: '🗄️' },
    { label: 'Redis', status: health?.checks?.redis?.status || 'unknown', latency: health?.checks?.redis?.latencyMs, icon: '📡' },
    { label: 'Memory', status: health?.checks?.memory?.status || 'unknown', detail: `${health?.checks?.memory?.usagePercent || 0}% used`, icon: '💾' },
    { label: 'Uptime', status: 'ok', detail: `${Math.floor((health?.uptime || 0) / 3600)}h ${Math.floor(((health?.uptime || 0) % 3600) / 60)}m`, icon: '⏱️' },
  ];

  const redis = redisInfo?.redisInfo || redisInfo;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[var(--color-text)]">Platform Health</h1>

      {/* Health checks */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {checks.map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
            <div className="flex items-center gap-2 mb-2"><span className="text-2xl">{c.icon}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{c.status}</span>
            </div>
            <p className="text-sm font-medium text-[var(--color-text)]">{c.label}</p>
            {c.latency !== undefined && <p className="text-xs text-[var(--color-text-muted)]">{c.latency}ms latency</p>}
            {c.detail && <p className="text-xs text-[var(--color-text-muted)]">{c.detail}</p>}
          </div>
        ))}
      </div>

      {/* Redis Info */}
      {redis && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Redis</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-xs text-[var(--color-text-muted)]">Memory</span><p className="font-medium">{redis.usedMemory || redis.used_memory || '—'}</p></div>
            <div><span className="text-xs text-[var(--color-text-muted)]">Peak</span><p className="font-medium">{redis.usedMemoryPeak || redis.used_memory_peak || '—'}</p></div>
            <div><span className="text-xs text-[var(--color-text-muted)]">Clients</span><p className="font-medium">{redis.connectedClients || redis.connected_clients || '—'}</p></div>
            <div><span className="text-xs text-[var(--color-text-muted)]">Hit Rate</span><p className="font-medium">{redis.hitRate || redis.hit_rate || '—'}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}
