import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';

type ReportTab = 'bookings' | 'revenue' | 'members';

export default function OrgReportsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [tab, setTab] = useState<ReportTab>('bookings');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const params = { from: fromDate, to: toDate };

  const { data: bookingsReport, isLoading: bkLoading } = useQuery({
    queryKey: ['org-report-bookings', orgId, params],
    queryFn: () => api.get(`/org/${orgId}/reports/bookings`, { params }).then((r) => r.data),
    enabled: !!orgId && tab === 'bookings',
  });

  const { data: revenueReport, isLoading: revLoading } = useQuery({
    queryKey: ['org-report-revenue', orgId, params],
    queryFn: () => api.get(`/org/${orgId}/reports/revenue`, { params }).then((r) => r.data),
    enabled: !!orgId && tab === 'revenue',
  });

  const { data: membersReport, isLoading: mbrLoading } = useQuery({
    queryKey: ['org-report-members', orgId],
    queryFn: () => api.get(`/org/${orgId}/reports/members`).then((r) => r.data),
    enabled: !!orgId && tab === 'members',
  });

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;

  const bk = bookingsReport || {};
  const rev = revenueReport || {};
  const mbr = membersReport || {};

  const maxDailyRev = Math.max(1, ...((rev.dailyRevenue || []).map((d: any) => d.revenue)));

  const tabs: { key: ReportTab; label: string }[] = [
    { key: 'bookings', label: 'Bookings' },
    { key: 'revenue', label: 'Revenue' },
    { key: 'members', label: 'Members' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">📊 Reports</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">View and analyse your organisation's performance.</p>
      </div>

      <Can permission="org.reports.view" fallback={<p className="text-sm text-[var(--color-text-muted)]">You do not have permission to view reports.</p>}>
        <>
          <div className="flex gap-1 border-b border-[var(--color-border)]">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  tab === t.key
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {(tab === 'bookings' || tab === 'revenue') && (
            <div className="flex items-center gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--color-text-muted)]">From</label>
                <input
                  type="date" value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="ml-2 px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--color-text-muted)]">To</label>
                <input
                  type="date" value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="ml-2 px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]"
                />
              </div>
            </div>
          )}

          {tab === 'bookings' && (
            <>
              {bkLoading ? (
                <div className="animate-pulse h-32 bg-[var(--color-surface)] rounded-xl" />
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
                      <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Total Bookings</p>
                      <p className="text-2xl font-bold text-[var(--color-primary)] mt-1">{bk.totalBookings ?? 0}</p>
                    </div>
                    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
                      <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Revenue</p>
                      <p className="text-2xl font-bold text-[var(--color-success)] mt-1">{Number(bk.totalRevenue ?? 0).toFixed(0)}</p>
                    </div>
                    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
                      <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Completed</p>
                      <p className="text-2xl font-bold text-[var(--color-info)] mt-1">{bk.completedBookings ?? 0}</p>
                    </div>
                    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
                      <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Cancelled</p>
                      <p className="text-2xl font-bold text-[var(--color-error)] mt-1">{bk.cancelledBookings ?? 0}</p>
                    </div>
                  </div>

                  <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                            <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Date</th>
                            <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Resource</th>
                            <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Branch</th>
                            <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Customer</th>
                            <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
                            <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(bk.bookings || []).length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-6 text-center text-[var(--color-text-muted)]">No bookings in this date range.</td>
                            </tr>
                          ) : (
                            (bk.bookings || []).map((b: any) => (
                              <tr key={b.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                                <td className="px-4 py-3 text-[var(--color-text-muted)]">{b.date ? new Date(b.date + 'T00:00:00').toLocaleDateString('en-GB') : '—'}</td>
                                <td className="px-4 py-3 text-[var(--color-text)]">{b.resource_name || '—'}</td>
                                <td className="px-4 py-3 text-[var(--color-text-muted)]">{b.branch_name || '—'}</td>
                                <td className="px-4 py-3 text-[var(--color-text)]">{b.customer_name || '—'}</td>
                                <td className="px-4 py-3">
                                  <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${
                                    b.status === 'confirmed' || b.status === 'completed' ? 'bg-green-100 text-green-700' :
                                    b.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>{b.status}</span>
                                </td>
                                <td className="px-4 py-3 text-right text-[var(--color-text)]">{b.amount ? Number(b.amount).toFixed(2) : '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'revenue' && (
            <>
              {revLoading ? (
                <div className="animate-pulse h-32 bg-[var(--color-surface)] rounded-xl" />
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
                      <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Total Revenue</p>
                      <p className="text-2xl font-bold text-[var(--color-success)] mt-1">{Number(rev.totalRevenue ?? 0).toFixed(0)}</p>
                    </div>
                    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
                      <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Transactions</p>
                      <p className="text-2xl font-bold text-[var(--color-primary)] mt-1">{rev.totalTransactions ?? 0}</p>
                    </div>
                    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
                      <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Average / Transaction</p>
                      <p className="text-2xl font-bold text-[var(--color-info)] mt-1">{Number(rev.averageTransaction ?? 0).toFixed(0)}</p>
                    </div>
                  </div>

                  <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
                    <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Daily Revenue</h3>
                    <div className="flex items-end gap-2 h-32">
                      {(rev.dailyRevenue || []).length === 0 ? (
                        <p className="text-xs text-[var(--color-text-muted)] text-center w-full py-4">No revenue data in this range.</p>
                      ) : (
                        (rev.dailyRevenue || []).map((d: any, i: number) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div
                              className="w-full bg-[var(--color-success)] rounded-t"
                              style={{ height: `${(d.revenue / maxDailyRev) * 100}%`, minHeight: d.revenue > 0 ? '4px' : '0' }}
                            />
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              {d.date ? new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'members' && (
            <>
              {mbrLoading ? (
                <div className="animate-pulse h-32 bg-[var(--color-surface)] rounded-xl" />
              ) : (
                <>
                  <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
                    <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Total Members</p>
                    <p className="text-3xl font-bold text-[var(--color-primary)] mt-1">{mbr.totalMembers ?? 0}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
                      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">By Status</h3>
                      {(mbr.byStatus || []).length === 0 ? (
                        <p className="text-xs text-[var(--color-text-muted)]">No data</p>
                      ) : (
                        <div className="space-y-2">
                          {(mbr.byStatus || []).map((s: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="text-[var(--color-text)] capitalize">{s.status}</span>
                              <span className="text-[var(--color-text-muted)]">{s.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
                      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">By Branch</h3>
                      {(mbr.byBranch || []).length === 0 ? (
                        <p className="text-xs text-[var(--color-text-muted)]">No data</p>
                      ) : (
                        <div className="space-y-2">
                          {(mbr.byBranch || []).map((b: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="text-[var(--color-text)]">{b.branch_name}</span>
                              <span className="text-[var(--color-text-muted)]">{b.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      </Can>
    </div>
  );
}
