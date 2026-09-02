import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { getErrorMessage } from '../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Button, Modal, Spinner } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';

interface Period {
  id: number; fiscal_year: number; period_number: number;
  start_date: string; end_date: string; status: 'open' | 'closed' | 'locked';
}
interface PreviewData {
  fiscalYear: number; netIncome: number; totalRevenue: number; totalExpense: number;
  affectedAccounts: number; estimatedClosingLines: number;
  periodsStatus: string;
  retainedEarningsAccount: { id: number; code: string; name: string };
  accountBreakdown: any[];
}
interface HistoryItem {
  id: number; fiscal_year: number; net_income: number; status: string;
  close_count: number; reopened_at: string; reopen_reason: string;
  created_at: string; cycle_count: number;
}

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  locked: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

/**
 * Organisation Accounting Periods + Year-End Closing.
 *
 * Org admins manage THEIR OWN fiscal periods and close THEIR OWN year through
 * the SAME canonical accounting logic as the Super Admin Accounting Periods
 * screen (the org routes force the route :orgId server-side). The organisation
 * is always taken from the route — there is no org selector and no path to
 * another organisation's periods or closing data.
 */
export default function OrgAccountingPeriodsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showGenerate, setShowGenerate] = useState(false);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [actionTarget, setActionTarget] = useState<{ id: number; action: 'close' | 'open' } | null>(null);

  const [ycFiscalYear, setYcFiscalYear] = useState(new Date().getFullYear());
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [showReopen, setShowReopen] = useState<{ id: number; fy: number } | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['org', 'accounting', 'periods', orgId],
    queryFn: () => api.get(`/org/${orgId}/accounting/periods`).then((r: any) => r.data.data || r.data),
    enabled: !!orgId,
  });

  const { data: history } = useQuery({
    queryKey: ['org', 'accounting', 'year-close', 'history', orgId],
    queryFn: () => api.get(`/org/${orgId}/accounting/year-close/history`).then((r) => r.data.data),
    enabled: !!orgId,
  });

  const periods: Period[] = data || [];
  const invalidateOrgAccounting = () => {
    queryClient.invalidateQueries({ queryKey: ['org', 'accounting', 'periods', orgId] });
    queryClient.invalidateQueries({ queryKey: ['org', 'accounting', 'year-close', 'history', orgId] });
  };

  const generateMutation = useMutation({
    mutationFn: () => api.post(`/org/${orgId}/accounting/periods/generate`, { fiscalYear }),
    onSuccess: () => { invalidateOrgAccounting(); setShowGenerate(false); showToast('Periods generated!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => api.post(`/org/${orgId}/accounting/periods/${id}/close`),
    onSuccess: () => { invalidateOrgAccounting(); setActionTarget(null); showToast('Period closed!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const openMutation = useMutation({
    mutationFn: (id: number) => api.post(`/org/${orgId}/accounting/periods/${id}/open`),
    onSuccess: () => { invalidateOrgAccounting(); setActionTarget(null); showToast('Period opened!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const previewMut = useMutation({
    mutationFn: () => api.get(`/org/${orgId}/accounting/year-close/preview`, { params: { fiscalYear: ycFiscalYear } }),
    onSuccess: (r: any) => setPreview(r.data.data),
    onError: (e: any) => showToast(getErrorMessage(e), 'error'),
  });

  const closeYrMut = useMutation({
    mutationFn: () => api.post(`/org/${orgId}/accounting/year-close`, { fiscalYear: ycFiscalYear }),
    onSuccess: (r: any) => {
      const d = r.data.data;
      showToast(`Year ${ycFiscalYear} closed. Net income: ${d.netIncome?.toLocaleString() ?? '0'}`);
      setPreview(null);
      invalidateOrgAccounting();
    },
    onError: (e: any) => showToast(getErrorMessage(e), 'error'),
  });

  const reopenMut = useMutation({
    mutationFn: () => api.post(`/org/${orgId}/accounting/year-close/reopen`, { fiscalYear: showReopen?.fy, reason: reopenReason }),
    onSuccess: () => {
      showToast('Year reopened. Adjustments may now be posted.');
      setShowReopen(null); setReopenReason('');
      invalidateOrgAccounting();
    },
    onError: (e: any) => showToast(getErrorMessage(e), 'error'),
  });

  if (isLoading) return <Spinner />;

  const fmt = (n: number) => n?.toLocaleString?.('en-US', { minimumFractionDigits: 2 }) ?? '0.00';
  const historyData: HistoryItem[] = history || [];

  const currentYearClosed = historyData.some(h => h.fiscal_year === ycFiscalYear && h.status === 'completed');
  const currentYearReopened = historyData.some(h => h.fiscal_year === ycFiscalYear && h.status === 'reopened');
  const ycPeriods = periods.filter(p => p.fiscal_year === ycFiscalYear);
  const all12Exist = ycPeriods.length === 12;
  const elevenClosed = ycPeriods.filter(p => p.period_number <= 11 && (p.status === 'closed' || p.status === 'locked')).length === 11;
  const p12Open = ycPeriods.some(p => p.period_number === 12 && p.status === 'open');
  const canClose = all12Exist && elevenClosed && p12Open && !currentYearClosed;

  return (
    <Can permission="org.accounting.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Accounting Periods</h1>
          <Can permission="org.accounting.manage">
            <Button onClick={() => { setShowGenerate(true); setFiscalYear(new Date().getFullYear()); }}>+ Generate Periods</Button>
          </Can>
        </div>

        {showGenerate && (
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
            <h3 className="font-semibold text-[var(--color-text)] mb-4">Generate Accounting Periods</h3>
            <div className="flex items-end gap-4 flex-wrap">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Fiscal Year</label>
                <input type="number" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}
                  className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-28" />
              </div>
              <Button onClick={() => generateMutation.mutate()} loading={generateMutation.isPending}>Generate</Button>
              <Button variant="ghost" onClick={() => setShowGenerate(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Fiscal Year</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Period</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Start Date</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">End Date</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
                <Can permission="org.accounting.manage">
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                </Can>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {periods.map(p => (
                <tr key={p.id} className="hover:bg-[var(--color-bg)]/30">
                  <td className="px-4 py-3 text-[var(--color-text)]">{p.fiscal_year}</td>
                  <td className="px-4 py-3 text-center text-[var(--color-text)]">{p.period_number}</td>
                  <td className="px-4 py-3 text-[var(--color-text)]">{new Date(p.start_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-[var(--color-text)]">{new Date(p.end_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${STATUS_BADGE[p.status]}`}>{p.status}</span>
                  </td>
                  <Can permission="org.accounting.manage">
                    <td className="px-4 py-3 text-right">
                      {p.status === 'open' && (
                        <button onClick={() => setActionTarget({ id: p.id, action: 'close' })}
                          className="text-xs text-[var(--color-primary)] hover:underline">Close</button>
                      )}
                      {p.status === 'closed' && (
                        <button onClick={() => setActionTarget({ id: p.id, action: 'open' })}
                          className="text-xs text-[var(--color-primary)] hover:underline">Open</button>
                      )}
                    </td>
                  </Can>
                </tr>
              ))}
            </tbody>
          </table>
          {!periods.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No periods found for this organisation. Generate periods to begin.</p>}
        </div>

        {/* ── Year-End Closing ── */}
        <div className="mt-8 bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-5">
          <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Year-End Closing</h2>

          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Fiscal Year</label>
              <input type="number" value={ycFiscalYear} onChange={e => setYcFiscalYear(Number(e.target.value))}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-28" />
            </div>
            <div className="flex items-end gap-2">
              <Can permission="org.accounting.manage">
                <Button variant="ghost" onClick={() => previewMut.mutate()}
                  loading={previewMut.isPending} disabled={!all12Exist}>
                  Preview
                </Button>
              </Can>
            </div>
          </div>

          {ycPeriods.length > 0 && (
            <div className="grid grid-cols-6 md:grid-cols-12 gap-1 mb-4">
              {ycPeriods.map(p => (
                <div key={p.id} className={`text-center text-[10px] px-1 py-1.5 rounded ${
                  p.status === 'open' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                  p.status === 'closed' ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' :
                  'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                }`}>
                  P{p.period_number}
                </div>
              ))}
            </div>
          )}
          {ycPeriods.length > 0 && ycPeriods.length < 12 && (
            <p className="text-xs text-[var(--color-text-muted)] mb-4">Only {ycPeriods.length}/12 periods generated for this year.</p>
          )}

          {preview && (
            <div className="border-t border-[var(--color-border)] pt-4 mb-4">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Closing Preview</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
                <div><span className="text-[var(--color-text-muted)]">Net Income:</span> <span className="font-mono font-semibold">{fmt(preview.netIncome)}</span></div>
                <div><span className="text-[var(--color-text-muted)]">Total Revenue:</span> <span className="font-mono">{fmt(preview.totalRevenue)}</span></div>
                <div><span className="text-[var(--color-text-muted)]">Total Expense:</span> <span className="font-mono">{fmt(preview.totalExpense)}</span></div>
                <div><span className="text-[var(--color-text-muted)]">Closing Lines:</span> <span className="font-mono">{preview.estimatedClosingLines}</span></div>
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mb-3">
                RE Account: <span className="font-mono">{preview.retainedEarningsAccount.code} - {preview.retainedEarningsAccount.name}</span>
                {' | '}Affected: {preview.affectedAccounts} accounts
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {!currentYearClosed && !currentYearReopened && (
              <Can permission="org.accounting.manage">
                <Button onClick={() => {
                  if (!canClose) { showToast('Periods 1-11 must be closed and period 12 open', 'warning'); return; }
                  if (confirm(`Close fiscal year ${ycFiscalYear}? This will lock all 12 periods. This action is irreversible without a reopen.`)) {
                    closeYrMut.mutate();
                  }
                }} loading={closeYrMut.isPending} disabled={!canClose}>
                  Close Year {ycFiscalYear}
                </Button>
                {!canClose && <span className="text-xs text-[var(--color-text-muted)]">(requires: 12 periods, P1-11 closed, P12 open)</span>}
              </Can>
            )}
            {currentYearClosed && (
              <Can permission="org.accounting.manage">
                <Button variant="ghost" onClick={() => {
                  const h = historyData.find(x => x.fiscal_year === ycFiscalYear && x.status === 'completed');
                  if (h) setShowReopen({ id: h.id, fy: ycFiscalYear });
                }}>
                  Reopen Year
                </Button>
              </Can>
            )}
            {currentYearReopened && (
              <span className="text-xs text-amber-600 dark:text-amber-400">Year reopened — adjustments possible. Close again when ready.</span>
            )}
          </div>

          {historyData.length > 0 && (
            <div className="border-t border-[var(--color-border)] pt-4 mt-4">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Close History</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      <th className="text-left px-2 py-1.5 text-[var(--color-text-muted)]">Year</th>
                      <th className="text-left px-2 py-1.5 text-[var(--color-text-muted)]">Net Income</th>
                      <th className="text-left px-2 py-1.5 text-[var(--color-text-muted)]">Status</th>
                      <th className="text-left px-2 py-1.5 text-[var(--color-text-muted)]">Cycles</th>
                      <th className="text-left px-2 py-1.5 text-[var(--color-text-muted)]">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {historyData.map(h => (
                      <tr key={h.id}>
                        <td className="px-2 py-1.5 font-mono text-[var(--color-text)]">{h.fiscal_year}</td>
                        <td className="px-2 py-1.5 font-mono text-[var(--color-text)]">{fmt(h.net_income)}</td>
                        <td className="px-2 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            h.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                            h.status === 'reopened' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
                            'bg-gray-100 text-gray-600'
                          }`}>{h.status}</span>
                        </td>
                        <td className="px-2 py-1.5 text-[var(--color-text-muted)]">{h.close_count}× ({h.cycle_count})</td>
                        <td className="px-2 py-1.5 text-[var(--color-text-muted)]">{new Date(h.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <Modal open={actionTarget !== null} onClose={() => setActionTarget(null)} title={actionTarget?.action === 'close' ? 'Close Period' : 'Open Period'}>
          <p className="text-sm text-[var(--color-text-muted)] mb-6">
            {actionTarget?.action === 'close' ? 'Are you sure you want to close this period? This may prevent new entries.' : 'Re-open this period for posting?'}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setActionTarget(null)}>Cancel</Button>
            <Button onClick={() => {
              if (!actionTarget) return;
              if (actionTarget.action === 'close') closeMutation.mutate(actionTarget.id);
              else openMutation.mutate(actionTarget.id);
            }} loading={closeMutation.isPending || openMutation.isPending}
              className="bg-[var(--color-primary)] text-white">Confirm</Button>
          </div>
        </Modal>

        <Modal open={showReopen !== null} onClose={() => { setShowReopen(null); setReopenReason(''); }} title="Reopen Closed Year">
          <p className="text-sm text-[var(--color-text-muted)] mb-2">
            Reopening fiscal year {showReopen?.fy} will create reversal entries for all closing entries and open period 12 for adjustments.
          </p>
          <div className="mb-4">
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Reason *</label>
            <textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)}
              rows={3} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
              placeholder="E.g., Late adjustment required..." />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => { setShowReopen(null); setReopenReason(''); }}>Cancel</Button>
            <Button onClick={() => reopenMut.mutate()} loading={reopenMut.isPending} disabled={!reopenReason.trim()}
              className="bg-[var(--color-primary)] text-white">Reopen Year</Button>
          </div>
        </Modal>
      </div>
    </Can>
  );
}
