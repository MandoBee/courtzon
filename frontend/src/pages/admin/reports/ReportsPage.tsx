import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../../../services/api';
import { Spinner } from '../../../components/ui';
import { ExportButton } from '../../../components/ui/ExportButton';
import { formatPrice } from '../../../utils/currency';
import DateRangePicker from '../../../components/reports/DateRangePicker';
import { getChartPalette } from '../../../theme/chart-colors';

type ReportEndpointType = 'kpi' | 'chart' | 'table' | 'bar' | 'pie' | 'tournament-finance';
type ReportTab = {
  key: string; label: string; icon: string;
  endpoints: { key: string; label: string; endpoint: string; type: ReportEndpointType }[];
};

const tabs: ReportTab[] = [
  {
    key: 'financial', label: 'Financial', icon: '💰',
    endpoints: [
      { key: 'summary', label: 'Revenue Summary', endpoint: '/reports/financial/summary', type: 'kpi' },
      { key: 'timeline', label: 'Revenue Timeline', endpoint: '/reports/financial/timeline?groupBy=day', type: 'chart' },
      { key: 'by-source', label: 'By Source', endpoint: '/reports/financial/by-source', type: 'pie' },
      { key: 'settlements', label: 'Settlements', endpoint: '/reports/financial/settlements', type: 'table' },
      { key: 'payment-methods', label: 'Payment Methods', endpoint: '/reports/financial/payment-methods', type: 'bar' },
    ],
  },
  {
    key: 'bookings', label: 'Bookings', icon: '📅',
    endpoints: [
      { key: 'volume', label: 'Booking Volume', endpoint: '/reports/bookings/volume?groupBy=day', type: 'chart' },
      { key: 'by-type', label: 'By Type', endpoint: '/reports/bookings/by-type', type: 'pie' },
      { key: 'by-sport', label: 'By Sport', endpoint: '/reports/bookings/by-sport', type: 'bar' },
      { key: 'peak-hours', label: 'Peak Hours', endpoint: '/reports/bookings/peak-hours', type: 'bar' },
      { key: 'cancellation', label: 'Cancellation Rate', endpoint: '/reports/bookings/cancellation', type: 'kpi' },
    ],
  },
  {
    key: 'users', label: 'Users', icon: '👥',
    endpoints: [
      { key: 'registrations', label: 'New Registrations', endpoint: '/reports/users/registrations?groupBy=day', type: 'chart' },
      { key: 'demographics', label: 'By Country', endpoint: '/reports/users/demographics', type: 'bar' },
      { key: 'gender', label: 'Gender', endpoint: '/reports/users/gender', type: 'pie' },
      { key: 'active', label: 'Active Users', endpoint: '/reports/users/active?groupBy=day', type: 'chart' },
      { key: 'roles', label: 'Role Distribution', endpoint: '/reports/users/roles', type: 'table' },
    ],
  },
  {
    key: 'organisations', label: 'Orgs', icon: '🏢',
    endpoints: [
      { key: 'top', label: 'Top Organisations', endpoint: '/reports/organisations/top', type: 'table' },
      { key: 'by-type', label: 'By Type', endpoint: '/reports/organisations/by-type', type: 'bar' },
      { key: 'subscriptions', label: 'Subscriptions', endpoint: '/reports/organisations/subscriptions', type: 'table' },
    ],
  },
  {
    key: 'marketplace', label: 'Marketplace', icon: '🛍️',
    endpoints: [
      { key: 'overview', label: 'Overview', endpoint: '/reports/marketplace/overview', type: 'kpi' },
      { key: 'top-products', label: 'Top Products', endpoint: '/reports/marketplace/top-products', type: 'table' },
      { key: 'orders', label: 'Order Status', endpoint: '/reports/marketplace/orders', type: 'pie' },
    ],
  },
  {
    key: 'tournaments', label: 'Tournaments', icon: '🏆',
    endpoints: [
      { key: 'overview', label: 'Overview', endpoint: '/reports/tournaments/overview', type: 'tournament-finance' },
      { key: 'participation', label: 'Participation', endpoint: '/reports/tournaments/participation', type: 'table' },
    ],
  },
  {
    key: 'ads', label: 'Ads', icon: '📢',
    endpoints: [
      { key: 'performance', label: 'Campaign Performance', endpoint: '/reports/ads/performance', type: 'table' },
      { key: 'daily-spend', label: 'Daily Spend', endpoint: '/reports/ads/daily-spend?groupBy=day', type: 'chart' },
    ],
  },
  {
    key: 'audit', label: 'Audit', icon: '📋',
    endpoints: [
      { key: 'activity', label: 'Activity Summary', endpoint: '/reports/audit/activity', type: 'table' },
      { key: 'top-entities', label: 'Top Entities', endpoint: '/reports/audit/top-entities', type: 'table' },
    ],
  },
];

function KpiCard({ label, data }: { label: string; data: Record<string, unknown> }) {
  if (!data) return null;
  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 border">
      <h4 className="text-sm font-medium text-[var(--color-text-muted)] mb-2">{label}</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(data).filter(([k]) => !k.startsWith('total_transactions')).map(([key, value]) => (
          <div key={key} className="text-center p-2 bg-[var(--color-bg)]/50 rounded-[var(--radius-md)]">
            <p className="text-2xl font-bold text-[var(--color-text)]">
              {String(value).includes('.') && !isNaN(Number(value)) ? Number(value).toLocaleString('en-GB') : String(value)}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] capitalize">
              {key.replace(/_/g, ' ').replace('total ', '')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataTable({ data, label }: { data: any[]; label: string }) {
  if (!data || !data.length) return <p className="text-sm text-[var(--color-text-muted)] py-4">No data</p>;
  const keys = Object.keys(data[0]);
  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden border">
      <h4 className="px-4 py-3 text-sm font-medium text-[var(--color-text-muted)] border-b">{label}</h4>
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-[var(--color-bg)]/50">
              {keys.map(k => <th key={k} className="px-3 py-2 text-left font-medium text-[var(--color-text-muted)] capitalize">{k.replace(/_/g, ' ')}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((row: any, i: number) => (
              <tr key={i} className="hover:bg-[var(--color-bg)]/30">
                {keys.map(k => (
                  <td key={k} className="px-3 py-2 text-[var(--color-text)] font-mono">
                    {isNaN(Number(row[k])) ? String(row[k] ?? '—') : Number(row[k]).toLocaleString('en-GB')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartBlock({ data, type, label, dataKey, xKey }: { data: any[]; type: string; label: string; dataKey?: string; xKey?: string }) {
  if (!data || !data.length) return <p className="text-sm text-[var(--color-text-muted)] py-4">No data</p>;
  const colors = getChartPalette();
  const keys = Object.keys(data[0]).filter(k => k !== dataKey && k !== xKey && k !== 'period');
  xKey = xKey || keys[0] || 'period';

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 border">
      <h4 className="text-sm font-medium text-[var(--color-text-muted)] mb-3">{label}</h4>
      <ResponsiveContainer width="100%" height={320}>
        {type === 'chart' ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
            <Tooltip />
            <Legend />
            {keys.map((k: any, i: any) => (
              <Line key={k} type="monotone" dataKey={k} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        ) : type === 'bar' ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey={keys[0]} tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
            <Tooltip />
            <Legend />
            {keys.slice(1).map((k: any, i: any) => (
              <Bar key={k} dataKey={k} fill={colors[i % colors.length]} radius={[4,4,0,0]} />
            ))}
          </BarChart>
        ) : type === 'pie' ? (
          <PieChart>
            <Pie data={data} dataKey={keys[1] || 'total'} nameKey={keys[0]} cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
              {data.map((_: any, i: any) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        ) : null}
      </ResponsiveContainer>
    </div>
  );
}

/**
 * G11.9 — Build client-side CSV rows from the authoritative `/reports/tournaments/overview`
 * JSON payload. One row per currency (buckets are NEVER numerically mixed). Columns mirror
 * the fields the API actually returns — no invented financial fields.
 */
export function tournamentFinanceCsvRows(data: any): Record<string, string>[] {
  const currencies = data?.currencies ?? {};
  return Object.keys(currencies).map((code) => {
    const b = currencies[code] ?? {};
    return {
      currency: code,
      tournaments: String(b.tournaments ?? 0),
      revenue: Number(b.revenue ?? 0).toFixed(2),
      prize_expense: Number(b.prizeExpense ?? 0).toFixed(2),
      commission_expense: Number(b.commissionExpense ?? 0).toFixed(2),
      platform_commission: Number(b.platformCommission ?? 0).toFixed(2),
      net: Number(b.net ?? 0).toFixed(2),
    };
  });
}

/**
 * G11.9 — Tournament finance overview (admin reports, read-only).
 * Renders the authoritative ledger-backed `/reports/tournaments/overview`
 * payload with one independent card per currency (never mixed), a clear
 * zero-ledger state, and a CLIENT-SIDE CSV export built from the same JSON
 * response (no backend export endpoint).
 */
function TournamentFinanceOverview({ data }: { data: any }) {
  const currencies = data?.currencies ?? {};
  const codes = Object.keys(currencies);
  const noData = !data || (data.total_tournaments ?? 0) === 0;
  const zeroLedger = !noData && codes.length === 0;
  const counts = {
    total_tournaments: data?.total_tournaments ?? 0,
    completed: data?.completed ?? 0,
    in_progress: data?.in_progress ?? 0,
    total_registrations: data?.total_registrations ?? 0,
  };

  const csvRows = tournamentFinanceCsvRows(data);

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="font-medium text-[var(--color-text)]">Tournament Finances (ledger-authoritative)</p>
        <ExportButton data={csvRows} filename="tournament_finances" label="Export" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
        <div><p className="text-[var(--color-text-muted)]">Total tournaments</p><p className="font-bold">{counts.total_tournaments}</p></div>
        <div><p className="text-[var(--color-text-muted)]">Completed</p><p className="font-bold">{counts.completed}</p></div>
        <div><p className="text-[var(--color-text-muted)]">In progress</p><p className="font-bold">{counts.in_progress}</p></div>
        <div><p className="text-[var(--color-text-muted)]">Total registrations</p><p className="font-bold">{counts.total_registrations}</p></div>
      </div>

      {(noData || zeroLedger) && (
        <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">
          {noData
            ? 'No tournament data for the selected period.'
            : 'No posted tournament accounting for the selected period — recognised revenue/expense are zero until ledger postings exist.'}
        </p>
      )}

      {!noData && !zeroLedger && (
        <div className="space-y-3">
          {codes.map((code) => {
            const b = currencies[code] ?? {};
            return (
              <div key={code} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-[var(--color-text)]">{code} bucket</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{b.tournaments ?? 0} tournament(s)</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                  <div><p className="text-[var(--color-text-muted)]">Revenue</p><p className="font-medium">{formatPrice(Number(b.revenue ?? 0), code)}</p></div>
                  <div><p className="text-[var(--color-text-muted)]">Prize expense</p><p className="font-medium">{formatPrice(Number(b.prizeExpense ?? 0), code)}</p></div>
                  <div><p className="text-[var(--color-text-muted)]">Commission expense</p><p className="font-medium">{formatPrice(Number(b.commissionExpense ?? 0), code)}</p></div>
                  <div><p className="text-[var(--color-text-muted)]">Platform commission</p><p className="font-medium">{formatPrice(Number(b.platformCommission ?? 0), code)}</p></div>
                  <div><p className="text-[var(--color-text-muted)]">Net</p><p className={`font-medium ${Number(b.net ?? 0) >= 0 ? 'text-[var(--color-primary)]' : 'text-[var(--color-error)]'}`}>{formatPrice(Number(b.net ?? 0), code)}</p></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('financial');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const currentTab = tabs.find(t => t.key === activeTab)!;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Reports</h1>
      </div>

      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-2">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-[var(--radius-md)] whitespace-nowrap transition-colors ${
              activeTab === tab.key ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)]'
            }`}>
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <DateRangePicker onChange={(from: any, to: any) => { setDateFrom(from); setDateTo(to); }} />
      </div>

      <div className="space-y-6">
        {currentTab.endpoints.map(ep => (
          <ReportEndpointBlock key={ep.key} ep={ep} dateFrom={dateFrom} dateTo={dateTo} />
        ))}
      </div>
    </div>
  );
}

function ReportEndpointBlock({ ep, dateFrom, dateTo }: { ep: any; dateFrom: string; dateTo: string }) {
  const queryString = [dateFrom && `dateFrom=${dateFrom}`, dateTo && `dateTo=${dateTo}`].filter(Boolean).join('&');
  const fullUrl = ep.endpoint.includes('?') ? `${ep.endpoint}&${queryString}` : `${ep.endpoint}${queryString ? '?' + queryString : ''}`;

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', ep.key, dateFrom, dateTo],
    queryFn: () => api.get(fullUrl).then((r: any) => r.data?.data || []),
    enabled: !!dateFrom && !!dateTo,
  });

  if (isLoading) return <div key={ep.key} className="py-8 text-center"><Spinner /></div>;
  if (error) return null;

  const result = data;

  if (ep.type === 'kpi') return <KpiCard label={ep.label} data={result} />;
  if (ep.type === 'tournament-finance') return <TournamentFinanceOverview data={result} />;
  if (ep.type === 'table') return <DataTable data={Array.isArray(result) ? result : []} label={ep.label} />;
  if (ep.type === 'chart' || ep.type === 'bar' || ep.type === 'pie')
    return <ChartBlock data={Array.isArray(result) ? result : []} type={ep.type} label={ep.label} />;

  return null;
}
