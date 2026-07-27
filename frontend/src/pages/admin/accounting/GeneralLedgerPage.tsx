import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { Spinner, Pagination } from '../../../components/ui';
import { Can } from '../../../permissions/Can';

interface JournalEntry {
  id: number;
  entry_date: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  balance: number;
  description: string;
  reference: string;
}

interface TrialBalanceRow {
  account_code: string;
  account_name: string;
  debit_total: number;
  credit_total: number;
  balance: number;
}

interface IncomeStatementRow {
  account_type: string;
  account_code: string;
  account_name: string;
  total: number;
}

interface BalanceSheetRow {
  account_type: string;
  account_code: string;
  account_name: string;
  balance: number;
}

type Tab = 'journal' | 'trial-balance' | 'income-statement' | 'balance-sheet';

export default function GeneralLedgerPage() {
  const [tab, setTab] = useState<Tab>('journal');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState({ period_id: '', account_code: '', date_from: '', date_to: '' });

  const { data: periods } = useQuery({
    queryKey: ['accounting', 'periods'],
    queryFn: () => api.get('/accounting/periods').then((r: any) => r.data.data || r.data),
  });

  const { data: journalData, isLoading: loadingJournal } = useQuery({
    queryKey: ['accounting', 'journal-entries', filters, page, pageSize],
    queryFn: () => api.get('/accounting/journal-entries', { params: { ...filters, page, pageSize } }).then((r: any) => r.data),
    enabled: tab === 'journal',
  });

  const { data: trialBalance, isLoading: loadingTB } = useQuery({
    queryKey: ['accounting', 'trial-balance'],
    queryFn: () => api.get('/accounting/trial-balance').then((r: any) => r.data.data || r.data),
    enabled: tab === 'trial-balance',
  });

  const { data: incomeStatement, isLoading: loadingIS } = useQuery({
    queryKey: ['accounting', 'income-statement'],
    queryFn: () => api.get('/accounting/income-statement').then((r: any) => r.data.data || r.data),
    enabled: tab === 'income-statement',
  });

  const { data: balanceSheet, isLoading: loadingBS } = useQuery({
    queryKey: ['accounting', 'balance-sheet'],
    queryFn: () => api.get('/accounting/balance-sheet').then((r: any) => r.data.data || r.data),
    enabled: tab === 'balance-sheet',
  });

  const entries: JournalEntry[] = journalData?.data || [];
  const total = journalData?.total || 0;
  const tbRows: TrialBalanceRow[] = trialBalance || [];
  const isRows: IncomeStatementRow[] = incomeStatement || [];
  const bsRows: BalanceSheetRow[] = balanceSheet || [];

  const TABS: { key: Tab; label: string }[] = [
    { key: 'journal', label: 'Journal Entries' },
    { key: 'trial-balance', label: 'Trial Balance' },
    { key: 'income-statement', label: 'Income Statement' },
    { key: 'balance-sheet', label: 'Balance Sheet' },
  ];

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Can permission="accounting.gl.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">General Ledger</h1>
        </div>

        <div className="flex gap-1 mb-6 bg-[var(--color-bg)] rounded-[var(--radius-lg)] p-1 border border-[var(--color-border)] w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors ${tab === t.key ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
              {t.label}
            </button>
          ))}
        </div>

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
                        <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Balance</th>
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
                          <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{e.debit ? fmt(e.debit) : '-'}</td>
                          <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{e.credit ? fmt(e.credit) : '-'}</td>
                          <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{fmt(e.balance)}</td>
                          <td className="px-4 py-3 text-[var(--color-text-muted)] max-w-[200px] truncate">{e.description}</td>
                          <td className="px-4 py-3 text-[var(--color-text-muted)]">{e.reference}</td>
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
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
            {loadingTB ? <Spinner /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Code</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Account</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Debit Total</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Credit Total</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {tbRows.map((r, i) => (
                    <tr key={i} className="hover:bg-[var(--color-bg)]/30">
                      <td className="px-4 py-3 text-xs font-mono text-[var(--color-text-muted)]">{r.account_code}</td>
                      <td className="px-4 py-3 text-[var(--color-text)]">{r.account_name}</td>
                      <td className="px-4 py-3 text-right font-mono">{r.debit_total ? fmt(r.debit_total) : '-'}</td>
                      <td className="px-4 py-3 text-right font-mono">{r.credit_total ? fmt(r.credit_total) : '-'}</td>
                      <td className={`px-4 py-3 text-right font-mono ${r.balance < 0 ? 'text-red-500' : 'text-[var(--color-text)]'}`}>{fmt(Math.abs(r.balance))} {r.balance < 0 ? 'CR' : 'DR'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'income-statement' && (
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
            {loadingIS ? <Spinner /> : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                      <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Code</th>
                      <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Account</th>
                      <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    <tr className="bg-green-50 dark:bg-green-900/10"><td colSpan={4} className="px-4 py-2 text-sm font-semibold text-green-700 dark:text-green-400">Revenue</td></tr>
                    {isRows.filter(r => r.account_type === 'revenue').map((r, i) => (
                      <tr key={i} className="hover:bg-[var(--color-bg)]/30">
                        <td className="px-4 py-2 text-[var(--color-text-muted)]">{r.account_type}</td>
                        <td className="px-4 py-2 text-xs font-mono text-[var(--color-text-muted)]">{r.account_code}</td>
                        <td className="px-4 py-2 text-[var(--color-text)]">{r.account_name}</td>
                        <td className="px-4 py-2 text-right font-mono text-[var(--color-text)]">{fmt(r.total)}</td>
                      </tr>
                    ))}
                    <tr className="bg-red-50 dark:bg-red-900/10"><td colSpan={4} className="px-4 py-2 text-sm font-semibold text-red-700 dark:text-red-400">Expenses</td></tr>
                    {isRows.filter(r => r.account_type === 'expense').map((r, i) => (
                      <tr key={i} className="hover:bg-[var(--color-bg)]/30">
                        <td className="px-4 py-2 text-[var(--color-text-muted)]">{r.account_type}</td>
                        <td className="px-4 py-2 text-xs font-mono text-[var(--color-text-muted)]">{r.account_code}</td>
                        <td className="px-4 py-2 text-[var(--color-text)]">{r.account_name}</td>
                        <td className="px-4 py-2 text-right font-mono text-[var(--color-text)]">{fmt(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-3 border-t border-[var(--color-border)] flex justify-end">
                  <span className="text-sm font-semibold text-[var(--color-text)]">
                    Net Income: {fmt(isRows.filter(r => r.account_type === 'revenue').reduce((s, r) => s + r.total, 0) - isRows.filter(r => r.account_type === 'expense').reduce((s, r) => s + r.total, 0))}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'balance-sheet' && (
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
            {loadingBS ? <Spinner /> : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                      <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Code</th>
                      <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Account</th>
                      <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    <tr className="bg-blue-50 dark:bg-blue-900/10"><td colSpan={4} className="px-4 py-2 text-sm font-semibold text-blue-700 dark:text-blue-400">Assets</td></tr>
                    {bsRows.filter(r => r.account_type === 'asset').map((r, i) => (
                      <tr key={i} className="hover:bg-[var(--color-bg)]/30">
                        <td className="px-4 py-2 text-[var(--color-text-muted)]">{r.account_type}</td>
                        <td className="px-4 py-2 text-xs font-mono text-[var(--color-text-muted)]">{r.account_code}</td>
                        <td className="px-4 py-2 text-[var(--color-text)]">{r.account_name}</td>
                        <td className="px-4 py-2 text-right font-mono text-[var(--color-text)]">{fmt(r.balance)}</td>
                      </tr>
                    ))}
                    <tr className="bg-amber-50 dark:bg-amber-900/10"><td colSpan={4} className="px-4 py-2 text-sm font-semibold text-amber-700 dark:text-amber-400">Liabilities & Equity</td></tr>
                    {bsRows.filter(r => r.account_type === 'liability' || r.account_type === 'equity').map((r, i) => (
                      <tr key={i} className="hover:bg-[var(--color-bg)]/30">
                        <td className="px-4 py-2 text-[var(--color-text-muted)]">{r.account_type}</td>
                        <td className="px-4 py-2 text-xs font-mono text-[var(--color-text-muted)]">{r.account_code}</td>
                        <td className="px-4 py-2 text-[var(--color-text)]">{r.account_name}</td>
                        <td className="px-4 py-2 text-right font-mono text-[var(--color-text)]">{fmt(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>
    </Can>
  );
}
