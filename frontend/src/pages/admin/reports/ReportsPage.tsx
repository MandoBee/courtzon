import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../../../services/api';
import { Spinner } from '../../../components/ui';
import DateRangePicker from '../../../components/reports/DateRangePicker';
import { getChartPalette } from '../../../theme/chart-colors';

type ReportTab = {
  key: string; label: string; icon: string;
  endpoints: { key: string; label: string; endpoint: string; type: 'kpi' | 'chart' | 'table' | 'bar' | 'pie' }[];
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
      { key: 'overview', label: 'Overview', endpoint: '/reports/tournaments/overview', type: 'kpi' },
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

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('financial');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const currentTab = tabs.find(t => t.key === activeTab)!;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Reports</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => {
            document.title = 'CourtZon Reports';
          }}
            className="px-3 py-1.5 text-xs border rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            📥 Export CSV
          </button>
        </div>
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
  if (ep.type === 'table') return <DataTable data={Array.isArray(result) ? result : []} label={ep.label} />;
  if (ep.type === 'chart' || ep.type === 'bar' || ep.type === 'pie')
    return <ChartBlock data={Array.isArray(result) ? result : []} type={ep.type} label={ep.label} />;

  return null;
}
