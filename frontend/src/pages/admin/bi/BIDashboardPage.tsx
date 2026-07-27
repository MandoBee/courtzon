import { useState, useEffect } from 'react';
import { Can } from '../../../permissions/Can';
import { ExportPanel } from './ExportPanel';
import api from '../../../services/api';

interface DashboardData {
  revenue: { last30d: number; last7d: number; today: number };
  bookings: { last30d: number; last7d: number; today: number };
  activeUsers: number;
  activeOrganisations: number;
  revenueTrend: { month: string; total: number }[];
  bookingTrend: { date: string; total: number }[];
  topOrgs: { id: number; organisationName: string; revenue: number }[];
  userGrowth: { month: string; total: number }[];
}

interface OrgOption {
  id: number;
  name: string;
}

function BarChart({ data, xKey, yKey, height = 200 }: { data: any[]; xKey: string; yKey: string; height?: number }) {
  if (!data || data.length === 0) return <div className="text-sm text-[var(--color-text-muted)]">No data</div>;
  const maxVal = Math.max(...data.map((d) => Number(d[yKey])));
  const barWidth = Math.max(4, Math.min(24, Math.floor(600 / data.length)));

  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => {
        const val = Number(d[yKey]);
        const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
        return (
          <div key={i} className="flex flex-col items-center flex-1" title={`${d[xKey]}: ${val}`}>
            <div
              className="w-full rounded-t bg-[var(--color-primary)]/70 hover:bg-[var(--color-primary)] transition-colors"
              style={{ height: `${pct}%`, minHeight: val > 0 ? 4 : 0, maxWidth: barWidth }}
            />
            <span className="text-[10px] text-[var(--color-text-muted)] mt-1 truncate w-full text-center">
              {xKey === 'month' ? d[xKey].slice(-2) : d[xKey]?.slice(5) ?? ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  const fmt = typeof value === 'number' ? (value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toLocaleString()) : value;
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="text-sm text-[var(--color-text-muted)]">{label}</div>
      <div className="text-2xl font-bold mt-1">{fmt}</div>
      {sub && <div className="text-xs text-[var(--color-text-muted)] mt-1">{sub}</div>}
    </div>
  );
}

export default function BIDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [orgData, setOrgData] = useState<any>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/organisations?limit=200').then((r) => {
      const orgsList = r.data?.data ?? r.data ?? [];
      if (Array.isArray(orgsList)) setOrgs(orgsList.map((o: any) => ({ id: o.id, name: o.name ?? o.organisationName ?? '' })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    const url = selectedOrg ? `/bi/dashboard/org/${selectedOrg}` : '/bi/dashboard';
    api.get(url).then((r) => {
      const d = r.data?.data;
      if (d) {
        if (selectedOrg) setOrgData(d);
        else setData(d);
      }
      setLoading(false);
    }).catch((e) => {
      setError(e?.response?.data?.message || e.message || 'Failed to load dashboard');
      setLoading(false);
    });
  }, [selectedOrg]);

  const dashboardData = selectedOrg ? orgData : data;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return <div className="text-[var(--color-error)] p-4">{error}</div>;
  }

  const rev = dashboardData?.revenue;
  const bks = dashboardData?.bookings;

  return (
    <Can permission="bi.dashboard.view">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Business Intelligence{selectedOrg ? ` — ${orgs.find(o => String(o.id) === selectedOrg)?.name ?? ''}` : ''}</h1>
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-surface)]"
          >
            <option value="">Executive Dashboard</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>

        {dashboardData && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Revenue (30d)" value={rev?.last30d ?? 0} sub={`7d: ${((rev?.last7d ?? 0) / (rev?.last30d ?? 1) * 100).toFixed(0)}%`} />
              <KpiCard label="Bookings (30d)" value={bks?.last30d ?? 0} sub={`Today: ${bks?.today ?? 0}`} />
              <KpiCard label="Active Users" value={dashboardData.activeUsers ?? 0} />
              {!selectedOrg && <KpiCard label="Active Orgs" value={dashboardData.activeOrganisations ?? 0} />}
              {selectedOrg && <KpiCard label="Revenue Today" value={rev?.today ?? 0} />}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <h2 className="text-lg font-semibold mb-3">Revenue Trend (12 months)</h2>
                <BarChart data={dashboardData.revenueTrend ?? []} xKey="month" yKey="total" height={180} />
              </div>
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <h2 className="text-lg font-semibold mb-3">Booking Trend (30 days)</h2>
                <BarChart data={dashboardData.bookingTrend ?? []} xKey="date" yKey="total" height={180} />
              </div>
            </div>

            {!selectedOrg && (
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <h2 className="text-lg font-semibold mb-3">Top Organisations by Revenue</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        <th className="text-left py-2">#</th>
                        <th className="text-left py-2">Organisation</th>
                        <th className="text-right py-2">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dashboardData.topOrgs ?? []).map((o: any, i: number) => (
                        <tr key={o.id} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg)]">
                          <td className="py-2">{i + 1}</td>
                          <td className="py-2">{o.organisationName}</td>
                          <td className="py-2 text-right font-medium">{Number(o.revenue).toLocaleString()}</td>
                        </tr>
                      ))}
                      {(dashboardData.topOrgs ?? []).length === 0 && (
                        <tr><td colSpan={3} className="py-4 text-center text-[var(--color-text-muted)]">No data</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-3">User Growth (12 months)</h2>
              {dashboardData.userGrowth && dashboardData.userGrowth.length > 0 ? (
                <BarChart data={dashboardData.userGrowth} xKey="month" yKey="total" height={160} />
              ) : (
                <div className="text-sm text-[var(--color-text-muted)]">No data</div>
              )}
            </div>

            {selectedOrg && (
              <>
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                  <h2 className="text-lg font-semibold mb-3">Branch Breakdown</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border)]">
                          <th className="text-left py-2">Branch</th>
                          <th className="text-right py-2">Bookings</th>
                          <th className="text-right py-2">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dashboardData.branches ?? []).map((b: any) => (
                          <tr key={b.id} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg)]">
                            <td className="py-2">{b.name}</td>
                            <td className="py-2 text-right">{b.totalBookings}</td>
                            <td className="py-2 text-right">{Number(b.revenue).toLocaleString()}</td>
                          </tr>
                        ))}
                        {(dashboardData.branches ?? []).length === 0 && (
                          <tr><td colSpan={3} className="py-4 text-center text-[var(--color-text-muted)]">No branches</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                    <h2 className="text-lg font-semibold mb-3">Coach Utilization (avg. sessions/day)</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--color-border)]">
                            <th className="text-left py-2">Coach</th>
                            <th className="text-right py-2">Sessions</th>
                            <th className="text-right py-2">Utilization</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(dashboardData.coachUtilization ?? []).map((c: any) => (
                            <tr key={c.id} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg)]">
                              <td className="py-2">{c.coachName}</td>
                              <td className="py-2 text-right">{c.totalSessions}</td>
                              <td className="py-2 text-right">{c.availableDays > 0 ? `${(c.totalSessions / c.availableDays).toFixed(2)}/day` : '-'}</td>
                            </tr>
                          ))}
                          {(dashboardData.coachUtilization ?? []).length === 0 && (
                            <tr><td colSpan={3} className="py-4 text-center text-[var(--color-text-muted)]">No coaches</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                    <h2 className="text-lg font-semibold mb-3">Court Utilization</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--color-border)]">
                            <th className="text-left py-2">Court</th>
                            <th className="text-right py-2">Bookings</th>
                            <th className="text-right py-2">Utilization</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(dashboardData.courtUtilization ?? []).map((c: any) => (
                            <tr key={c.id} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg)]">
                              <td className="py-2">{c.name}</td>
                              <td className="py-2 text-right">{c.totalBookings}</td>
                              <td className="py-2 text-right">{c.availableSlots > 0 ? `${(c.totalBookings / c.availableSlots * 100).toFixed(1)}%` : '-'}</td>
                            </tr>
                          ))}
                          {(dashboardData.courtUtilization ?? []).length === 0 && (
                            <tr><td colSpan={3} className="py-4 text-center text-[var(--color-text-muted)]">No courts</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <ExportPanel />
      </div>
    </Can>
  );
}
