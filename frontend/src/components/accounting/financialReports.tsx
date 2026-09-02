import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Spinner } from '../ui';
import { filterZeroBalanceRows } from '../../utils/accountingZero';
import { getCurrencySymbol } from '../../utils/currency';

/**
 * Shared financial report building blocks.
 *
 * These components are the SINGLE rendering implementation for the Super Admin
 * (General Ledger page) and organisation accounting reports. The organisation
 * reports are a scoped view of the same accounting/reporting system — they reuse
 * this rendering exactly and only differ in the org-scoped data they receive.
 *
 * The Super Admin screen output must stay byte-identical: do not change layout,
 * columns, grouping, totals, or class names here without updating both surfaces.
 */

export interface ReportLine {
  account_id: number;
  code: string;
  name: string;
  type: string;
  normal_side: string | null;
  total_debits: number;
  total_credits: number;
  balance: number;
  level: number;
  parent_id: number | null;
  has_children: boolean;
}

export interface IncomeStatementData {
  lines: ReportLine[];
  net_income: number;
  net_revenue: number;
  net_expense: number;
  total_revenue: number;
  total_expense: number;
  contra_revenue: number;
  contra_expense: number;
}

export const financialFmt = (n: number) =>
  `${getCurrencySymbol()} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const indentStyle = (level: number) => ({ paddingLeft: `${level * 16 + 16}px` });

// ── Trial Balance ────────────────────────────────────────────────────────────

export function TrialBalanceTable({
  rows,
  showZeroBalances,
  loading,
  onSelectAccount,
}: {
  rows: ReportLine[];
  showZeroBalances: boolean;
  loading?: boolean;
  onSelectAccount?: (account: { id: number; code: string; name: string }) => void;
}) {
  const visibleRows = filterZeroBalanceRows(rows, showZeroBalances);
  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
      {loading ? <Spinner /> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Code</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Account</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Debit Total</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Credit Total</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {visibleRows.map((r, i) => (
              <tr key={i}
                onClick={() => { if (!r.has_children && onSelectAccount) onSelectAccount({ id: r.account_id, code: r.code, name: r.name }); }}
                className={`hover:bg-[var(--color-bg)]/30 ${r.level === 0 ? 'font-semibold' : ''} ${r.has_children ? 'text-[var(--color-primary)]' : 'cursor-pointer'}`}
                title={r.has_children ? undefined : 'View account ledger'}>
                <td className="px-4 py-3 text-xs font-mono text-[var(--color-text-muted)]" style={indentStyle(r.level)}>{r.code}</td>
                <td className="px-4 py-3 text-[var(--color-text)]">{r.name}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] capitalize">{r.type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-right font-mono">{r.total_debits ? financialFmt(r.total_debits) : '-'}</td>
                <td className="px-4 py-3 text-right font-mono">{r.total_credits ? financialFmt(r.total_credits) : '-'}</td>
                <td className={`px-4 py-3 text-right font-mono ${r.balance < 0 ? 'text-red-500' : 'text-[var(--color-text)]'}`}>{financialFmt(Math.abs(r.balance))} {r.balance < 0 ? 'CR' : 'DR'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Income Statement ─────────────────────────────────────────────────────────

export function IncomeStatementTable({
  data,
  showZeroBalances,
  loading,
  netIncomeLabel = 'Net Income:',
  footerNote,
}: {
  data: IncomeStatementData | null;
  showZeroBalances: boolean;
  loading?: boolean;
  netIncomeLabel?: string;
  footerNote?: ReactNode;
}) {
  const isRows: ReportLine[] = data?.lines || (Array.isArray(data) ? data : []);
  const isVisible = filterZeroBalanceRows(isRows, showZeroBalances);
  const netIncome = data?.net_income ?? 0;
  const netRevenue = data?.net_revenue ?? 0;
  const netExpense = data?.net_expense ?? 0;

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
      {loading ? <Spinner /> : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Code</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Account</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              <tr className="bg-green-50 dark:bg-green-900/10"><td colSpan={4} className="px-4 py-2 text-sm font-semibold text-green-700 dark:text-green-400">Revenue</td></tr>
              {isVisible.filter(r => r.type === 'revenue').map((r, i) => (
                <tr key={i} className={`hover:bg-[var(--color-bg)]/30 ${r.level === 0 ? 'font-semibold' : ''}`}>
                  <td className="px-4 py-2 text-xs font-mono text-[var(--color-text-muted)]" style={indentStyle(r.level)}>{r.code}</td>
                  <td className="px-4 py-2 text-[var(--color-text)]">{r.name}</td>
                  <td className="px-4 py-2 text-xs text-[var(--color-text-muted)] capitalize">{r.type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 text-right font-mono text-[var(--color-text)]">{financialFmt(r.balance)}</td>
                </tr>
              ))}
              {isVisible.filter(r => r.type === 'contra_revenue').length > 0 && (
                <>
                  <tr className="bg-orange-50 dark:bg-orange-900/10"><td colSpan={4} className="px-4 py-2 text-sm font-semibold text-orange-700 dark:text-orange-400">Contra Revenue</td></tr>
                  {isVisible.filter(r => r.type === 'contra_revenue').map((r, i) => (
                    <tr key={i} className={`hover:bg-[var(--color-bg)]/30 ${r.level === 0 ? 'font-semibold' : ''}`}>
                      <td className="px-4 py-2 text-xs font-mono text-[var(--color-text-muted)]" style={indentStyle(r.level)}>{r.code}</td>
                      <td className="px-4 py-2 text-[var(--color-text)]">{r.name}</td>
                      <td className="px-4 py-2 text-xs text-[var(--color-text-muted)] capitalize">{r.type.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2 text-right font-mono text-[var(--color-text)]">({financialFmt(Math.abs(r.balance))})</td>
                    </tr>
                  ))}
                </>
              )}
              <tr className="bg-red-50 dark:bg-red-900/10"><td colSpan={4} className="px-4 py-2 text-sm font-semibold text-red-700 dark:text-red-400">Expenses</td></tr>
              {isVisible.filter(r => r.type === 'expense').map((r, i) => (
                <tr key={i} className={`hover:bg-[var(--color-bg)]/30 ${r.level === 0 ? 'font-semibold' : ''}`}>
                  <td className="px-4 py-2 text-xs font-mono text-[var(--color-text-muted)]" style={indentStyle(r.level)}>{r.code}</td>
                  <td className="px-4 py-2 text-[var(--color-text)]">{r.name}</td>
                  <td className="px-4 py-2 text-xs text-[var(--color-text-muted)] capitalize">{r.type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 text-right font-mono text-[var(--color-text)]">{financialFmt(Math.abs(r.balance))}</td>
                </tr>
              ))}
              {isVisible.filter(r => r.type === 'contra_expense').length > 0 && (
                <>
                  <tr className="bg-amber-50 dark:bg-amber-900/10"><td colSpan={4} className="px-4 py-2 text-sm font-semibold text-amber-700 dark:text-amber-400">Contra Expense</td></tr>
                  {isVisible.filter(r => r.type === 'contra_expense').map((r, i) => (
                    <tr key={i} className={`hover:bg-[var(--color-bg)]/30 ${r.level === 0 ? 'font-semibold' : ''}`}>
                      <td className="px-4 py-2 text-xs font-mono text-[var(--color-text-muted)]" style={indentStyle(r.level)}>{r.code}</td>
                      <td className="px-4 py-2 text-[var(--color-text)]">{r.name}</td>
                      <td className="px-4 py-2 text-xs text-[var(--color-text-muted)] capitalize">{r.type.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2 text-right font-mono text-[var(--color-text)]">{financialFmt(r.balance)}</td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-[var(--color-border)] space-y-1">
            <div className="flex justify-end gap-4 text-sm">
              <span className="text-[var(--color-text-muted)]">Net Revenue:</span>
              <span className="font-mono text-[var(--color-text)]">{financialFmt(netRevenue)}</span>
            </div>
            <div className="flex justify-end gap-4 text-sm">
              <span className="text-[var(--color-text-muted)]">Net Expense:</span>
              <span className="font-mono text-[var(--color-text)]">{financialFmt(netExpense)}</span>
            </div>
            <div className="flex justify-end gap-4 text-base font-bold border-t border-[var(--color-border)] pt-2 mt-1">
              <span className="text-[var(--color-text)]">{netIncomeLabel}</span>
              <span className={`font-mono ${netIncome >= 0 ? 'text-green-600' : 'text-red-500'}`}>{financialFmt(netIncome)}</span>
            </div>
            {footerNote}
          </div>
        </>
      )}
    </div>
  );
}

// ── Balance Sheet ────────────────────────────────────────────────────────────

export function BalanceSheetTable({
  rows,
  showZeroBalances,
  loading,
}: {
  rows: ReportLine[];
  showZeroBalances: boolean;
  loading?: boolean;
}) {
  const bsVisible = filterZeroBalanceRows(rows, showZeroBalances);
  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
      {loading ? <Spinner /> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Code</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Account</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            <tr className="bg-blue-50 dark:bg-blue-900/10"><td colSpan={4} className="px-4 py-2 text-sm font-semibold text-blue-700 dark:text-blue-400">Assets</td></tr>
            {bsVisible.filter(r => r.type === 'asset' || r.type === 'contra_asset').map((r, i) => (
              <tr key={i} className={`hover:bg-[var(--color-bg)]/30 ${r.level === 0 ? 'font-semibold' : ''}`}>
                <td className="px-4 py-2 text-xs font-mono text-[var(--color-text-muted)]" style={indentStyle(r.level)}>{r.code}</td>
                <td className="px-4 py-2 text-[var(--color-text)]">{r.name}</td>
                <td className="px-4 py-2 text-xs text-[var(--color-text-muted)] capitalize">{r.type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2 text-right font-mono text-[var(--color-text)]">{financialFmt(r.balance)}</td>
              </tr>
            ))}
            <tr className="bg-amber-50 dark:bg-amber-900/10"><td colSpan={4} className="px-4 py-2 text-sm font-semibold text-amber-700 dark:text-amber-400">Liabilities & Equity</td></tr>
            {bsVisible.filter(r => r.type === 'liability' || r.type === 'equity' || r.type === 'contra_liability' || r.type === 'contra_equity').map((r, i) => (
              <tr key={i} className={`hover:bg-[var(--color-bg)]/30 ${r.level === 0 ? 'font-semibold' : ''}`}>
                <td className="px-4 py-2 text-xs font-mono text-[var(--color-text-muted)]" style={indentStyle(r.level)}>{r.code}</td>
                <td className="px-4 py-2 text-[var(--color-text)]">{r.name}</td>
                <td className="px-4 py-2 text-xs text-[var(--color-text-muted)] capitalize">{r.type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2 text-right font-mono text-[var(--color-text)]">{financialFmt(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Account Ledger modal ─────────────────────────────────────────────────────

export function AccountLedgerModal({
  account,
  endpoint,
  onClose,
}: {
  account: { id: number; code: string; name: string } | null;
  endpoint: (accountId: number) => string;
  onClose: () => void;
}) {
  const { data: accountLedger, isLoading } = useQuery({
    queryKey: ['account-ledger', account?.id],
    queryFn: () => api.get(endpoint(account!.id)).then((r: any) => r.data.data || r.data),
    enabled: !!account,
  });

  if (!account) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] w-full max-w-4xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">Account Ledger</h2>
            <p className="text-xs font-mono text-[var(--color-text-muted)]">[{account.code}] {account.name}</p>
          </div>
          <button onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-auto p-4">
          {isLoading ? <Spinner /> : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                    <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">Date</th>
                    <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">Debit</th>
                    <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">Credit</th>
                    <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">Description</th>
                    <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {(accountLedger?.entries || []).map((e: any, i: number) => (
                    <tr key={i} className="hover:bg-[var(--color-bg)]/30">
                      <td className="px-3 py-2 text-[var(--color-text)]">{new Date(e.entry_date).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-right font-mono text-[var(--color-text)]">{e.debit ? financialFmt(Number(e.debit)) : '-'}</td>
                      <td className="px-3 py-2 text-right font-mono text-[var(--color-text)]">{e.credit ? financialFmt(Number(e.credit)) : '-'}</td>
                      <td className="px-3 py-2 text-[var(--color-text-muted)] max-w-[240px] truncate">{e.description || '—'}</td>
                      <td className="px-3 py-2 text-[var(--color-text-muted)] text-xs">{e.reference_type || '—'}{e.reference_id ? ` #${e.reference_id}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(accountLedger?.entries || []).length && (
                <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No ledger entries for this account in the selected scope.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
