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

  const { data: metrics } = useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: () => api.get('/metrics').then(r => {
      const lines = r.data.split('\n').filter((l: string) => l.startsWith('courtzon_') && !l.startsWith('#'));
      const parsed: Record<string, number> = {};
      for (const line of lines) {
        const [name, val] = line.split(' ');
        if (name && val) parsed[name.split('{')[0]] = Number(val);
      }
      return parsed;
    }).catch(() => ({})),
  });

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

      {/* Prometheus metrics summary */}
      {metrics && Object.keys(metrics).length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Metrics Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {Object.entries(metrics).slice(0, 8).map(([key, val]) => (
              <div key={key}><span className="text-xs text-[var(--color-text-muted)]">{key.replace(/^courtzon_/, '').replace(/_/g, ' ')}</span><p className="font-medium">{val ?? 0}</p></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
