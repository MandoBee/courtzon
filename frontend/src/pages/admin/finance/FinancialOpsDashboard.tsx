import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { SkeletonRow } from '../../../components/ui';

export default function FinancialOpsDashboard() {
  const { data: health, isLoading: hl } = useQuery({
    queryKey: ['payments-health'],
    queryFn: () => api.get('/payments/health').then((r) => r.data),
    refetchInterval: 30000,
  });

  const { data: readiness } = useQuery({
    queryKey: ['payments-readiness'],
    queryFn: () => api.get('/payments/production-readiness').then((r) => r.data),
    refetchInterval: 60000,
  });

  const { data: reconHistory } = useQuery({
    queryKey: ['recon-history'],
    queryFn: () => api.get('/payments/reconciliation/history').then((r) => r.data),
  });

  if (hl) return <SkeletonRow count={6} />;

  const metrics = health?.metrics || {};
  const pending = health?.pending || {};
  const checks = readiness?.checks || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Financial Operations</h1>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
          readiness?.overall === 'READY' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
          readiness?.overall === 'NEEDS_ATTENTION' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' :
          'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'
        }`}>
          {readiness?.overall || 'CHECKING'}
        </span>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon="💰" label="Revenue (7d)" value={metrics.successCount7d ? `${metrics.successCount7d}` : '0'} />
        <MetricCard icon="✅" label="Success Rate" value={metrics.successRate7d != null ? `${metrics.successRate7d}%` : '—'} color="var(--color-success)" />
        <MetricCard icon="❌" label="Failed (7d)" value={metrics.failedCount7d || 0} color="var(--color-error)" />
        <MetricCard icon="↩️" label="Refunded (7d)" value={metrics.refundedCount7d || 0} color="var(--color-warning)" />
      </div>

      {/* Pending Payments */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 md:p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide mb-3">⚠️ Pending Payments</h2>
        {Object.keys(pending).length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No pending payments</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(pending).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text)] capitalize">{status}</span>
                <span className="font-semibold text-[var(--color-warning)]">{count as number}</span>
              </div>
            ))}
            {health?.staleOver15min > 0 && (
              <div className="flex items-center justify-between text-sm pt-2 border-t border-[var(--color-border)]">
                <span className="text-[var(--color-error)]">Stale (&gt;15 min)</span>
                <span className="font-semibold text-[var(--color-error)]">{health.staleOver15min}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gateway Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 md:p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide mb-3">🌐 Gateway</h2>
          <div className="space-y-2 text-sm">
            <Row label="Provider" value={health?.provider || '—'} />
            <Row label="Connectivity" value={health?.gatewayConnectivity || '—'} status={health?.gatewayConnectivity === 'ok' ? 'PASS' : health?.gatewayConnectivity === 'unknown' ? 'WARN' : 'FAIL'} />
            <Row label="Failed (1h)" value={health?.failedLastHour || 0} status={health?.failedLastHour > 0 ? 'WARN' : 'PASS'} />
            <Row label="Webhook" value={health?.lastWebhookAt ? new Date(health.lastWebhookAt).toLocaleString() : 'Never'} />
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 md:p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide mb-3">✅ Readiness Checks</h2>
          <div className="space-y-2 text-sm">
            {Object.entries(checks).slice(0, 8).map(([key, check]: [string, any]) => (
              <Row key={key} label={key.replace(/_/g, ' ')} value={check.status} status={check.status} />
            ))}
          </div>
        </div>
      </div>

      {/* Reconciliation History */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 md:p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide mb-3">🔄 Reconciliation History</h2>
        {!reconHistory?.data?.length ? (
          <p className="text-sm text-[var(--color-text-muted)]">No reconciliation runs yet. Run via POST /payments/reconciliation/run</p>
        ) : (
          <div className="space-y-2">
            {(reconHistory.data as any[]).slice(0, 10).map((r: any) => {
              const state = typeof r.after_state === 'string' ? JSON.parse(r.after_state) : r.after_state;
              return (
                <div key={r.id} className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                  <span>{new Date(r.created_at).toLocaleString()}</span>
                  <span>🔍 {state?.itemsChecked || 0} checked</span>
                  {state?.criticalCount > 0 && <span className="text-[var(--color-error)]">{state.criticalCount} critical</span>}
                  {state?.warningCount > 0 && <span className="text-[var(--color-warning)]">{state.warningCount} warnings</span>}
                  {state?.autoFixed > 0 && <span className="text-[var(--color-success)]">{state.autoFixed} auto-fixed</span>}
                  {!state?.criticalCount && !state?.warningCount && !state?.autoFixed && <span className="text-[var(--color-success)]">✅ Clean</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, color }: { icon: string; label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] p-3 md:p-4">
      <div className="text-xs text-[var(--color-text-muted)] mb-1">{icon} {label}</div>
      <p className="text-xl md:text-2xl font-bold" style={{ color: color || 'var(--color-text)' }}>{value}</p>
    </div>
  );
}

function Row({ label, value, status }: { label: string; value: any; status?: string }) {
  const color = status === 'PASS' ? 'var(--color-success)' : status === 'WARN' || status === 'WARNING' ? 'var(--color-warning)' : status === 'FAIL' ? 'var(--color-error)' : undefined;
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-muted)] capitalize">{label}</span>
      <span style={{ color }} className="font-medium">{typeof value === 'string' ? value : String(value)}</span>
    </div>
  );
}
