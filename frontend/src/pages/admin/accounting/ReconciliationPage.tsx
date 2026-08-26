import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useTranslation } from '../../../i18n';

interface GlAccount {
  code: string;
  accountId: number;
  debits: number;
  credits: number;
  signedBalance: number;
}

interface SourceRow {
  sourceType: string;
  sourceId: number;
  entitlementCount: number;
  contributionToNet: number;
  statuses: string[];
}

interface OrgReport {
  organisationId: number;
  organisationName?: string;
  entitlements: { payableToOrg: number; receivableFromOrg: number; net: number; openCount: number };
  gl: { accounts: GlAccount[]; payableToOrg: number; receivableFromOrg: number; net: number };
  difference: number;
  direction: string;
  reconciled: boolean;
  sources: SourceRow[];
}

interface ReconciliationData {
  summary: { totalOrgs: number; reconciled: number; drifted: number };
  reports: OrgReport[];
}

const fmt = (n: number) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReconciliationPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<'all' | 'reconciled' | 'drift'>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const params: Record<string, string> = {};
  if (statusFilter === 'drift') params.status = 'drift';

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['accounting', 'reconciliation', statusFilter],
    queryFn: () =>
      api.get('/admin/accounting/reconciliation', { params }).then((r: any) => r.data.data || r.data),
  });

  const d: ReconciliationData | null = data || null;

  const filtered = useMemo(() => {
    if (!d?.reports) return [];
    if (!search.trim()) return d.reports;
    const q = search.toLowerCase();
    return d.reports.filter(
      (r) =>
        String(r.organisationId).includes(q) ||
        (r.organisationName || '').toLowerCase().includes(q),
    );
  }, [d, search]);

  const totalDifference = useMemo(() => {
    if (!d?.reports) return 0;
    return d.reports.reduce((sum, r) => sum + Math.abs(r.difference), 0);
  }, [d]);

  if (isLoading) return <Spinner />;

  if (isError) {
    return (
      <Can permission="accounting.gl.view">
        <div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-[var(--color-text)]">
              {t('accounting.reconciliation.title', 'Reconciliation')}
            </h1>
          </div>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-8 text-center">
            <p className="text-[var(--color-error)] mb-2 font-medium">
              {t('accounting.reconciliation.error', 'Failed to load reconciliation data')}
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              {(error as any)?.message || t('accounting.reconciliation.error_hint', 'Please try again later.')}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-4 px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white hover:opacity-90"
            >
              {t('accounting.reconciliation.retry', 'Retry')}
            </button>
          </div>
        </div>
      </Can>
    );
  }

  const summary = d?.summary || { totalOrgs: 0, reconciled: 0, drifted: 0 };

  return (
    <Can permission="accounting.gl.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">
            {t('accounting.reconciliation.title', 'Reconciliation')}
          </h1>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-50"
          >
            {isFetching
              ? t('accounting.reconciliation.refreshing', 'Refreshing…')
              : t('accounting.reconciliation.refresh', 'Refresh')}
          </button>
        </div>

        <div className="text-xs text-[var(--color-text-muted)] mb-4 leading-relaxed max-w-3xl">
          {t(
            'accounting.reconciliation.explanation',
            'Financial Entitlements are the authoritative position subledger. GL Control Accounts are the accounting mirror. Difference = Entitlement Position − GL Control Position.',
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4">
            <p className="text-xs text-[var(--color-text-muted)] mb-1">
              {t('accounting.reconciliation.total_orgs', 'Total Organisations')}
            </p>
            <p className="text-2xl font-bold text-[var(--color-text)]">{summary.totalOrgs}</p>
          </div>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4">
            <p className="text-xs text-[var(--color-text-muted)] mb-1">
              {t('accounting.reconciliation.reconciled', 'Reconciled')}
            </p>
            <p className="text-2xl font-bold text-[var(--color-success)]">{summary.reconciled}</p>
          </div>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4">
            <p className="text-xs text-[var(--color-text-muted)] mb-1">
              {t('accounting.reconciliation.drifted', 'Drifted')}
            </p>
            <p className="text-2xl font-bold text-[var(--color-error)]">{summary.drifted}</p>
          </div>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4">
            <p className="text-xs text-[var(--color-text-muted)] mb-1">
              {t('accounting.reconciliation.total_difference', 'Total Difference')}
            </p>
            <p className="text-2xl font-bold text-[var(--color-text)]">{fmt(totalDifference)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[160px]"
            aria-label={t('accounting.reconciliation.filter_status', 'Filter by status')}
          >
            <option value="all">{t('accounting.reconciliation.status_all', 'All')}</option>
            <option value="reconciled">{t('accounting.reconciliation.status_reconciled', 'Reconciled')}</option>
            <option value="drift">{t('accounting.reconciliation.status_drifted', 'Drifted')}</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('accounting.reconciliation.search_placeholder', 'Search by name or ID…')}
            className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[200px]"
            aria-label={t('accounting.reconciliation.search', 'Search organisations')}
          />
        </div>

        {/* Empty State — no open positions */}
        {d && summary.totalOrgs === 0 && (
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-8 text-center">
            <p className="text-[var(--color-text)] font-medium mb-2">
              {t('accounting.reconciliation.empty_title', 'Reconciliation is clean')}
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              {t(
                'accounting.reconciliation.empty_description',
                'There are no open positions to compare. Entitlements and GL control accounts have no outstanding balances.',
              )}
            </p>
          </div>
        )}

        {/* Empty State — search/filter yielded no results */}
        {d && summary.totalOrgs > 0 && filtered.length === 0 && (
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-8 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              {t('accounting.reconciliation.no_results', 'No organisations match the current filters.')}
            </p>
          </div>
        )}

        {/* Table */}
        {filtered.length > 0 && (
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-muted)]">
                    {t('accounting.reconciliation.col_organisation', 'Organisation')}
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--color-text-muted)]">
                    {t('accounting.reconciliation.col_entitlement_net', 'Entitlement Net Position')}
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--color-text-muted)]">
                    {t('accounting.reconciliation.col_gl_net', 'GL Control Net Position')}
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--color-text-muted)]">
                    {t('accounting.reconciliation.col_difference', 'Difference')}
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-[var(--color-text-muted)]">
                    {t('accounting.reconciliation.col_status', 'Status')}
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--color-text-muted)]">
                    {t('accounting.reconciliation.col_positions', 'Affected Positions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.map((r) => (
                  <>
                    <tr
                      key={r.organisationId}
                      className="hover:bg-[var(--color-bg)]/30 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === r.organisationId ? null : r.organisationId)}
                      data-testid={`recon-row-${r.organisationId}`}
                    >
                      <td className="px-4 py-3 text-[var(--color-text)] font-medium">
                        {r.organisationName || `Org #${r.organisationId}`}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">
                        {fmt(r.entitlements.net)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">
                        {fmt(r.gl.net)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-medium ${
                          Math.abs(r.difference) > 0.01
                            ? 'text-[var(--color-error)]'
                            : 'text-[var(--color-success)]'
                        }`}
                      >
                        {fmt(r.difference)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.reconciled ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            {t('accounting.reconciliation.status_reconciled', 'Reconciled')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                            {t('accounting.reconciliation.status_drifted', 'Drifted')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--color-text-muted)]">
                        {r.entitlements.openCount}
                      </td>
                    </tr>
                    {expandedId === r.organisationId && (
                      <tr key={`${r.organisationId}-detail`} data-testid={`recon-detail-${r.organisationId}`}>
                        <td colSpan={6} className="px-4 py-3 bg-[var(--color-bg)]/30">
                          <div className="text-xs font-medium text-[var(--color-text-muted)] mb-2">
                            {t('accounting.reconciliation.source_breakdown', 'Source Breakdown')}
                          </div>
                          {r.sources.length > 0 ? (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-[var(--color-border)]">
                                  <th className="text-left px-2 py-1 text-[var(--color-text-muted)]">
                                    {t('accounting.reconciliation.src_type', 'Source Type')}
                                  </th>
                                  <th className="text-left px-2 py-1 text-[var(--color-text-muted)]">
                                    {t('accounting.reconciliation.src_id', 'Source ID')}
                                  </th>
                                  <th className="text-right px-2 py-1 text-[var(--color-text-muted)]">
                                    {t('accounting.reconciliation.src_contribution', 'Contribution')}
                                  </th>
                                  <th className="text-right px-2 py-1 text-[var(--color-text-muted)]">
                                    {t('accounting.reconciliation.src_count', 'Entitlement Count')}
                                  </th>
                                  <th className="text-left px-2 py-1 text-[var(--color-text-muted)]">
                                    {t('accounting.reconciliation.src_statuses', 'Statuses')}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--color-border)]">
                                {r.sources.map((s, i) => (
                                  <tr key={i}>
                                    <td className="px-2 py-1 text-[var(--color-text)]">{s.sourceType}</td>
                                    <td className="px-2 py-1 font-mono text-[var(--color-text)]">{s.sourceId}</td>
                                    <td
                                      className={`px-2 py-1 text-right font-mono ${
                                        Math.abs(s.contributionToNet) > 0.01
                                          ? 'text-[var(--color-error)]'
                                          : 'text-[var(--color-text)]'
                                      }`}
                                    >
                                      {fmt(s.contributionToNet)}
                                    </td>
                                    <td className="px-2 py-1 text-right font-mono text-[var(--color-text-muted)]">
                                      {s.entitlementCount}
                                    </td>
                                    <td className="px-2 py-1 text-[var(--color-text-muted)]">
                                      {s.statuses.join(', ')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-xs text-[var(--color-text-muted)]">
                              {t('accounting.reconciliation.no_sources', 'No source data available.')}
                            </p>
                          )}

                          {r.gl.accounts.length > 0 && (
                            <div className="mt-3">
                              <div className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
                                {t('accounting.reconciliation.gl_accounts', 'GL Control Accounts')}
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-[var(--color-border)]">
                                    <th className="text-left px-2 py-1 text-[var(--color-text-muted)]">
                                      {t('accounting.reconciliation.gl_code', 'Code')}
                                    </th>
                                    <th className="text-right px-2 py-1 text-[var(--color-text-muted)]">
                                      {t('accounting.reconciliation.gl_debits', 'Debits')}
                                    </th>
                                    <th className="text-right px-2 py-1 text-[var(--color-text-muted)]">
                                      {t('accounting.reconciliation.gl_credits', 'Credits')}
                                    </th>
                                    <th className="text-right px-2 py-1 text-[var(--color-text-muted)]">
                                      {t('accounting.reconciliation.gl_balance', 'Signed Balance')}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--color-border)]">
                                  {r.gl.accounts.map((a, i) => (
                                    <tr key={i}>
                                      <td className="px-2 py-1 font-mono text-[var(--color-text)]">{a.code}</td>
                                      <td className="px-2 py-1 text-right font-mono text-[var(--color-text)]">
                                        {fmt(a.debits)}
                                      </td>
                                      <td className="px-2 py-1 text-right font-mono text-[var(--color-text)]">
                                        {fmt(a.credits)}
                                      </td>
                                      <td className="px-2 py-1 text-right font-mono text-[var(--color-text)]">
                                        {fmt(a.signedBalance)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Can>
  );
}
