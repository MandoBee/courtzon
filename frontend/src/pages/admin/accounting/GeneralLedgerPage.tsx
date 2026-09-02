import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { Spinner, Pagination } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { ExportCsvButton } from '../../../components/ui/ExportCsvButton';
import ShowZeroBalancesToggle from '../../../components/accounting/ShowZeroBalancesToggle';
import {
  TrialBalanceTable,
  IncomeStatementTable,
  BalanceSheetTable,
  AccountLedgerModal,
  financialFmt,
  type ReportLine,
} from '../../../components/accounting/financialReports';

interface JournalEntry {
  id: number;
  entry_date: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description: string;
  reference_type: string;
  reference_id: string | number;
}

type Tab = 'journal' | 'trial-balance' | 'income-statement' | 'balance-sheet';

export default function GeneralLedgerPage() {
  const [tab, setTab] = useState<Tab>('journal');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState({ period_id: '', account_code: '', date_from: '', date_to: '' });
  const [selectedOrg, setSelectedOrg] = useState('');
  const [orgs, setOrgs] = useState<{ id: number; name: string }[]>([]);
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');
  const [asOf, setAsOf] = useState('');
  const [showZeroBalances, setShowZeroBalances] = useState(false);
  const [ledgerAccount, setLedgerAccount] = useState<{ id: number; code: string; name: string } | null>(null);

  useEffect(() => {
    api.get('/organisations?limit=200').then((r) => {
      const orgsList = r.data?.data ?? r.data ?? [];
      if (Array.isArray(orgsList)) setOrgs(orgsList.map((o: any) => ({ id: o.id, name: o.name ?? o.organisationName ?? '' })));
    }).catch(() => {});
  }, []);

  const orgParam = selectedOrg ? { organisationId: selectedOrg } : {};

  const { data: periods } = useQuery({
    queryKey: ['accounting', 'periods'],
    queryFn: () => api.get('/admin/accounting/periods').then((r: any) => r.data.data || r.data),
  });

  const { data: journalData, isLoading: loadingJournal } = useQuery({
    queryKey: ['accounting', 'journal-entries', filters, page, pageSize],
    queryFn: () => api.get('/admin/accounting/journal', { params: { ...filters, page, pageSize } }).then((r: any) => r.data),
    enabled: tab === 'journal',
  });

  const { data: trialBalance, isLoading: loadingTB } = useQuery({
    queryKey: ['accounting', 'trial-balance', selectedOrg, reportFrom, reportTo],
    queryFn: () => api.get('/admin/accounting/trial-balance', { params: { ...orgParam, from: reportFrom || undefined, to: reportTo || undefined } }).then((r: any) => r.data.data || r.data),
    enabled: tab === 'trial-balance',
  });

  const { data: incomeStatementData, isLoading: loadingIS } = useQuery({
    queryKey: ['accounting', 'income-statement', selectedOrg, reportFrom, reportTo],
    queryFn: () => api.get('/admin/accounting/income-statement', { params: { ...orgParam, from: reportFrom || undefined, to: reportTo || undefined } }).then((r: any) => r.data.data || r.data),
    enabled: tab === 'income-statement',
  });

  const { data: balanceSheet, isLoading: loadingBS } = useQuery({
    queryKey: ['accounting', 'balance-sheet', selectedOrg, asOf],
    queryFn: () => api.get('/admin/accounting/balance-sheet', { params: { ...orgParam, asOf: asOf || undefined } }).then((r: any) => r.data.data || r.data),
    enabled: tab === 'balance-sheet',
  });

  const entries: JournalEntry[] = journalData?.data || [];
  const total = journalData?.total || 0;
  const tbRows: ReportLine[] = trialBalance || [];
  const bsRows: ReportLine[] = balanceSheet || [];

  const TABS: { key: Tab; label: string }[] = [
    { key: 'journal', label: 'Journal Entries' },
    { key: 'trial-balance', label: 'Trial Balance' },
    { key: 'income-statement', label: 'Income Statement' },
    { key: 'balance-sheet', label: 'Balance Sheet' },
  ];

  return (
    <Can permission="accounting.gl.view">
      <div>
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">General Ledger</h1>
          <div className="flex items-center gap-2">
            <label className="text-sm text-[var(--color-text-muted)]">Organization:</label>
            <select
              value={selectedOrg}
              onChange={(e) => { setSelectedOrg(e.target.value); }}
              className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[200px]"
            >
              <option value="">All Organizations</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-1 mb-6 bg-[var(--color-bg)] rounded-[var(--radius-lg)] p-1 border border-[var(--color-border)] w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors ${tab === t.key ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab !== 'journal' && (
          <div className="flex items-end gap-3 mb-4 flex-wrap">
            {tab === 'balance-sheet' ? (
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">As Of Date</label>
                <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
                  className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">From</label>
                  <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)}
                    className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">To</label>
                  <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)}
                    className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                </div>
              </>
            )}
            <button onClick={() => { setReportFrom(''); setReportTo(''); setAsOf(''); }}
              className="text-xs text-[var(--color-primary)] hover:underline">Reset</button>
            <ShowZeroBalancesToggle checked={showZeroBalances} onChange={setShowZeroBalances} className="self-end pb-2" />
          </div>
        )}

        {tab === 'journal' && (
          <div>
            <div className="flex gap-3 mb-4 flex-wrap">
              <select value={filters.period_id} onChange={e => setFilters({ ...filters, period_id: e.target.value })}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value="">All Periods</option>
                {(periods?.data || periods || []).map((p: any) => (
                  <option key={p.id} value={p.id}>FY{p.fiscal_year} P{p.period_number}</option>
                ))}
              </select>
              <input placeholder="Account Code" value={filters.account_code} onChange={e => setFilters({ ...filters, account_code: e.target.value })}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-32" />
              <input type="date" value={filters.date_from} onChange={e => setFilters({ ...filters, date_from: e.target.value })}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              <input type="date" value={filters.date_to} onChange={e => setFilters({ ...filters, date_to: e.target.value })}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              <ExportCsvButton
                endpoint="/admin/accounting/journal/export"
                params={{
                  periodId: filters.period_id || undefined,
                  from: filters.date_from || undefined,
                  to: filters.date_to || undefined,
                }}
                filename="general-ledger"
                label="Export CSV"
              />
            </div>

            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
              {loadingJournal ? <Spinner /> : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                        <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Date</th>
                        <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Account</th>
                        <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
                        <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Debit</th>
                        <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Credit</th>
                        <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Description</th>
                        <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {entries.map(e => (
                        <tr key={e.id} className="hover:bg-[var(--color-bg)]/30">
                          <td className="px-4 py-3 text-[var(--color-text)]">{new Date(e.entry_date).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-xs font-mono text-[var(--color-text-muted)]">{e.account_code}</td>
                          <td className="px-4 py-3 text-[var(--color-text)]">{e.account_name}</td>
                          <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{e.debit ? financialFmt(e.debit) : '-'}</td>
                          <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{e.credit ? financialFmt(e.credit) : '-'}</td>
                          <td className="px-4 py-3 text-[var(--color-text-muted)] max-w-[200px] truncate">{e.description}</td>
                          <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs">{e.reference_type || '—'}{e.reference_id ? ` #${e.reference_id}` : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!entries.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No journal entries found</p>}
                  <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'trial-balance' && (
          <TrialBalanceTable rows={tbRows} showZeroBalances={showZeroBalances} loading={loadingTB} onSelectAccount={setLedgerAccount} />
        )}

        {tab === 'income-statement' && (
          <IncomeStatementTable data={incomeStatementData} showZeroBalances={showZeroBalances} loading={loadingIS} netIncomeLabel="Net Income:" />
        )}

        {tab === 'balance-sheet' && (
          <BalanceSheetTable rows={bsRows} showZeroBalances={showZeroBalances} loading={loadingBS} />
        )}

        <AccountLedgerModal account={ledgerAccount} endpoint={(id) => `/admin/accounting/ledger/${id}`} onClose={() => setLedgerAccount(null)} />
      </div>
    </Can>
  );
}
