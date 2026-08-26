import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import { Spinner } from '../../components/ui';
import { Can } from '../../permissions/Can';

interface ReportLine {
  account_id: number;
  code: string;
  name: string;
  type: string;
  normal_side: string | null;
  total_debits: number;
  total_credits: number;
  balance: number;
  level: number;
  has_children: boolean;
}

const fmt = (n: number) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OrgFinancialReportsPage() {
  const { orgId, reportType } = useParams<{ orgId: string; reportType: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['org', 'accounting', 'report', reportType, orgId],
    queryFn: () => api.get(`/org/${orgId}/accounting/${reportType}`).then((r) => r.data.data || r.data),
    enabled: !!orgId && !!reportType,
  });

  if (isLoading) return <Spinner />;

  const title = reportType === 'trial-balance' ? 'Trial Balance'
    : reportType === 'income-statement' ? 'Income Statement'
    : reportType === 'balance-sheet' ? 'Balance Sheet'
    : 'Financial Report';

  return (
    <Can permission="org.accounting.view">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">{title}</h1>

        {reportType === 'trial-balance' && (
          <ReportTable rows={(Array.isArray(data) ? data : data?.lines || []) as ReportLine[]} />
        )}
        {reportType === 'income-statement' && <IncomeStatement data={data} />}
        {reportType === 'balance-sheet' && <BalanceSheet rows={(Array.isArray(data) ? data : []) as ReportLine[]} />}
      </div>
    </Can>
  );
}

function ReportTable({ rows }: { rows: ReportLine[] }) {
  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
            <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Code</th>
            <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Account</th>
            <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Debit</th>
            <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Credit</th>
            <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {rows.map((r, i) => (
            <tr key={i} className={`hover:bg-[var(--color-bg)]/30 ${r.has_children ? 'text-[var(--color-primary)]' : ''}`}>
              <td className="px-4 py-3 text-xs font-mono text-[var(--color-text-muted)]" style={{ paddingLeft: `${r.level * 16 + 16}px` }}>{r.code}</td>
              <td className="px-4 py-3 text-[var(--color-text)]">{r.name}</td>
              <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{r.total_debits ? fmt(r.total_debits) : '-'}</td>
              <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{r.total_credits ? fmt(r.total_credits) : '-'}</td>
              <td className={`px-4 py-3 text-right font-mono ${r.balance < 0 ? 'text-red-500' : 'text-[var(--color-text)]'}`}>
                {fmt(Math.abs(r.balance))} {r.balance < 0 ? 'CR' : 'DR'}
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No data</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function IncomeStatement({ data }: { data: any }) {
  const rows: ReportLine[] = data?.lines || (Array.isArray(data) ? data : []);
  const rev = rows.filter((r) => r.type === 'revenue');
  const contraRev = rows.filter((r) => r.type === 'contra_revenue');
  const exp = rows.filter((r) => r.type === 'expense');
  const contraExp = rows.filter((r) => r.type === 'contra_expense');
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Code</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Account</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            <tr className="bg-green-50 dark:bg-green-900/10"><td colSpan={3} className="px-4 py-2 text-sm font-semibold text-green-700 dark:text-green-400">Revenue</td></tr>
            {rev.map((r, i) => <LineRow key={`r${i}`} r={r} />)}
            {contraRev.length > 0 && <tr className="bg-orange-50 dark:bg-orange-900/10"><td colSpan={3} className="px-4 py-2 text-sm font-semibold text-orange-700 dark:text-orange-400">Contra Revenue</td></tr>}
            {contraRev.map((r, i) => <LineRow key={`cr${i}`} r={r} negative />)}
            <tr className="bg-red-50 dark:bg-red-900/10"><td colSpan={3} className="px-4 py-2 text-sm font-semibold text-red-700 dark:text-red-400">Expenses</td></tr>
            {exp.map((r, i) => <LineRow key={`e${i}`} r={r} />)}
            {contraExp.length > 0 && <tr className="bg-amber-50 dark:bg-amber-900/10"><td colSpan={3} className="px-4 py-2 text-sm font-semibold text-amber-700 dark:text-amber-400">Contra Expense</td></tr>}
            {contraExp.map((r, i) => <LineRow key={`ce${i}`} r={r} />)}
          </tbody>
        </table>
      </div>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4 space-y-1">
        <div className="flex justify-end gap-4 text-sm"><span className="text-[var(--color-text-muted)]">GL Net Income (Accounting):</span>
          <span className={`font-mono font-semibold ${(data?.net_income ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(data?.net_income ?? 0)}</span>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] text-right max-w-xl ml-auto leading-relaxed">
          Accounting/reporting result from your organisation's general-ledger slice. Not your settlement earnings — your settlement position is tracked by financial entitlements (see Financial Position).
        </p>
      </div>
    </div>
  );
}

function LineRow({ r, negative }: { r: ReportLine; negative?: boolean }) {
  return (
    <tr className="hover:bg-[var(--color-bg)]/30">
      <td className="px-4 py-2 text-xs font-mono text-[var(--color-text-muted)]" style={{ paddingLeft: `${r.level * 16 + 16}px` }}>{r.code}</td>
      <td className="px-4 py-2 text-[var(--color-text)]">{r.name}</td>
      <td className="px-4 py-2 text-right font-mono text-[var(--color-text)]">{negative ? `(${fmt(Math.abs(r.balance))})` : fmt(Math.abs(r.balance))}</td>
    </tr>
  );
}

function BalanceSheet({ rows }: { rows: ReportLine[] }) {
  const assets = rows.filter((r) => r.type === 'asset' || r.type === 'contra_asset');
  const liabEquity = rows.filter((r) => ['liability', 'equity', 'contra_liability', 'contra_equity'].includes(r.type));
  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
            <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Code</th>
            <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Account</th>
            <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          <tr className="bg-blue-50 dark:bg-blue-900/10"><td colSpan={3} className="px-4 py-2 text-sm font-semibold text-blue-700 dark:text-blue-400">Assets</td></tr>
          {assets.map((r, i) => (
            <tr key={`a${i}`} className="hover:bg-[var(--color-bg)]/30">
              <td className="px-4 py-2 text-xs font-mono text-[var(--color-text-muted)]" style={{ paddingLeft: `${r.level * 16 + 16}px` }}>{r.code}</td>
              <td className="px-4 py-2 text-[var(--color-text)]">{r.name}</td>
              <td className="px-4 py-2 text-right font-mono text-[var(--color-text)]">{fmt(r.balance)}</td>
            </tr>
          ))}
          <tr className="bg-amber-50 dark:bg-amber-900/10"><td colSpan={3} className="px-4 py-2 text-sm font-semibold text-amber-700 dark:text-amber-400">Liabilities & Equity</td></tr>
          {liabEquity.map((r, i) => (
            <tr key={`l${i}`} className="hover:bg-[var(--color-bg)]/30">
              <td className="px-4 py-2 text-xs font-mono text-[var(--color-text-muted)]" style={{ paddingLeft: `${r.level * 16 + 16}px` }}>{r.code}</td>
              <td className="px-4 py-2 text-[var(--color-text)]">{r.name}</td>
              <td className="px-4 py-2 text-right font-mono text-[var(--color-text)]">{fmt(r.balance)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No data</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
