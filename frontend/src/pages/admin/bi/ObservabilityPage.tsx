import { useState, useEffect } from 'react';
import { Can } from '../../../permissions/Can';
import api from '../../../services/api';

interface WebVital {
  date: string;
  avgLcp: number;
  avgCls: number;
  avgFcp: number;
  sampleCount: number;
}

interface ClientError {
  errorMessage: string;
  errorStack: string;
  errorType: string;
  frequency: number;
  firstSeen: string;
  lastSeen: string;
}

function TrendChart({ data, metricKey, label, unit, height = 120 }: { data: WebVital[]; metricKey: keyof WebVital; label: string; unit: string; height?: number }) {
  if (!data || data.length === 0) return <div className="text-sm text-[var(--color-text-muted)]">No data</div>;
  const values = data.map((d) => Number(d[metricKey] ?? 0));
  const maxVal = Math.max(...values, 1);
  const barWidth = Math.max(4, Math.min(20, Math.floor(400 / data.length)));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-[var(--color-text-muted)]">{unit}</span>
      </div>
      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((d, i) => {
          const val = Number(d[metricKey] ?? 0);
          const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
          return (
            <div key={i} className="flex flex-col items-center flex-1" title={`${d.date}: ${val}${unit}`}>
              <div
                className="w-full rounded-t bg-[var(--color-primary)]/70 hover:bg-[var(--color-primary)] transition-colors"
                style={{ height: `${Math.max(pct, val > 0 ? 8 : 0)}%`, maxWidth: barWidth }}
              />
              <span className="text-[9px] text-[var(--color-text-muted)] mt-1 truncate w-full text-center">{d.date?.slice(5) ?? ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ObservabilityPage() {
  const [vitals, setVitals] = useState<WebVital[]>([]);
  const [errors, setErrors] = useState<ClientError[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('limit', '60');

    Promise.all([
      api.get(`/bi/web-vitals?${params.toString()}`),
      api.get(`/bi/client-errors?${params.toString()}`),
    ]).then(([vitalRes, errorRes]) => {
      setVitals(vitalRes.data?.data ?? []);
      setErrors(errorRes.data?.data ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <Can permission="bi.observability.view">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Observability</h1>
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-surface)]" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-surface)]" />
            <button onClick={fetchData} className="px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90">
              {loading ? 'Loading...' : 'Filter'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <TrendChart data={vitals} metricKey="avgLcp" label="LCP (Largest Contentful Paint)" unit="ms" />
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <TrendChart data={vitals} metricKey="avgCls" label="CLS (Cumulative Layout Shift)" unit="score" />
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <TrendChart data={vitals} metricKey="avgFcp" label="FCP (First Contentful Paint)" unit="ms" />
          </div>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Client Errors</h2>
          {errors.length === 0 ? (
            <div className="text-sm text-[var(--color-text-muted)]">No errors reported</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="text-left py-2">Error Message</th>
                    <th className="text-left py-2">Type</th>
                    <th className="text-right py-2">Frequency</th>
                    <th className="text-left py-2">First Seen</th>
                    <th className="text-left py-2">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((e, i) => (
                    <tr key={i} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg)]">
                      <td className="py-2 max-w-xs truncate" title={e.errorMessage}>{e.errorMessage}</td>
                      <td className="py-2">{e.errorType ?? '-'}</td>
                      <td className="py-2 text-right font-medium">{e.frequency}</td>
                      <td className="py-2 text-xs">{e.firstSeen ? new Date(e.firstSeen).toLocaleDateString() : '-'}</td>
                      <td className="py-2 text-xs">{e.lastSeen ? new Date(e.lastSeen).toLocaleDateString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Can>
  );
}
