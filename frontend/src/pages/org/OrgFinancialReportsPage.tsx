import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import ShowZeroBalancesToggle from '../../components/accounting/ShowZeroBalancesToggle';
import {
  TrialBalanceTable,
  IncomeStatementTable,
  BalanceSheetTable,
  AccountLedgerModal,
  type ReportLine,
} from '../../components/accounting/financialReports';

/**
 * Organisation Financial Reports — Trial Balance / Income Statement / Balance Sheet.
 *
 * These are the SAME canonical accounting reports as the Super Admin General
 * Ledger page (identical rendering via the shared financialReports components),
 * strictly scoped to the organisation: the org route (`/org/:orgId/accounting/...`)
 * is authoritative and the backend forces organisationId server-side, so only the
 * organisation's own general-ledger slice and its Chart of Accounts are shown.
 * Date filters, "Show Zero Balances", totals, hierarchy and formatting match the
 * Super Admin screens exactly.
 */
export default function OrgFinancialReportsPage() {
  const { orgId, reportType } = useParams<{ orgId: string; reportType: string }>();
  const [showZeroBalances, setShowZeroBalances] = useState(false);
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');
  const [asOf, setAsOf] = useState('');
  const [ledgerAccount, setLedgerAccount] = useState<{ id: number; code: string; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['org', 'accounting', 'report', reportType, orgId, reportFrom, reportTo, asOf],
    queryFn: () =>
      api.get(`/org/${orgId}/accounting/${reportType}`, {
        params: { from: reportFrom || undefined, to: reportTo || undefined, asOf: asOf || undefined },
      }).then((r) => r.data.data || r.data),
    enabled: !!orgId && !!reportType,
  });

  const title = reportType === 'trial-balance' ? 'Trial Balance'
    : reportType === 'income-statement' ? 'Income Statement'
    : reportType === 'balance-sheet' ? 'Balance Sheet'
    : 'Financial Report';

  const rows = (Array.isArray(data) ? data : (data?.lines || [])) as ReportLine[];
  const isBalanceSheet = reportType === 'balance-sheet';

  return (
    <Can permission="org.accounting.view">
      <div>
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{title}</h1>
          <ShowZeroBalancesToggle checked={showZeroBalances} onChange={setShowZeroBalances} />
        </div>

        <div className="flex items-end gap-3 mb-4 flex-wrap">
          {isBalanceSheet ? (
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
        </div>

        {reportType === 'trial-balance' && (
          <TrialBalanceTable rows={rows} showZeroBalances={showZeroBalances} loading={isLoading} onSelectAccount={setLedgerAccount} />
        )}
        {reportType === 'income-statement' && (
          <IncomeStatementTable
            data={data}
            showZeroBalances={showZeroBalances}
            loading={isLoading}
            netIncomeLabel="GL Net Income (Accounting):"
            footerNote={
              <p className="text-xs text-[var(--color-text-muted)] text-right max-w-xl ml-auto leading-relaxed pt-1">
                Accounting/reporting result from your organisation&apos;s general-ledger slice. Not your settlement earnings — your settlement position is tracked by financial entitlements (see Financial Position).
              </p>
            }
          />
        )}
        {reportType === 'balance-sheet' && (
          <BalanceSheetTable rows={rows} showZeroBalances={showZeroBalances} loading={isLoading} />
        )}

        <AccountLedgerModal
          account={ledgerAccount}
          endpoint={(id) => `/org/${orgId}/accounting/ledger/${id}`}
          onClose={() => setLedgerAccount(null)}
        />
      </div>
    </Can>
  );
}
