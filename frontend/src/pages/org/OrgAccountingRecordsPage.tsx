import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Button, Spinner, Pagination } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useCan } from '../../hooks/useCan';
import { formatISODate } from '../../utils/formatDate';
import { getCurrencySymbol } from '../../utils/currency';

interface GroupedEntry {
  id: number;
  entry_date: string;
  description: string;
  reference_type: string;
  reference_id: string | number | null;
  organisation_id: number | null;
  lines: { account_code: string; account_name: string; debit: number; credit: number }[];
}

/**
 * Organisation Accounting Records — READ-ONLY.
 *
 * Renders the SAME canonical journal-entry data as the Super Admin Journal
 * Entries screen (grouped general-ledger entries with DEBIT / CREDIT sections
 * and balanced totals), scoped server-side to the currently authenticated
 * organisation via GET /org/:orgId/accounting/journal-entries. No accounting
 * calculation happens on the client — all lines/totals come from the backend.
 */
export default function OrgAccountingRecordsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { can } = useCan();

  if (!can('org.accounting.view')) return null;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['org', 'accounting', 'journal-entries', orgId, page, pageSize, appliedFrom, appliedTo],
    queryFn: () =>
      api.get(`/org/${orgId}/accounting/journal-entries`, {
        params: { grouped: true, page, pageSize, dateFrom: appliedFrom || undefined, dateTo: appliedTo || undefined },
      }).then((r: any) => r.data),
    enabled: !!orgId,
  });

  const entries: GroupedEntry[] = data?.data || [];
  const total = data?.total || 0;

  const applyFilters = () => {
    if (filterFrom && filterTo && filterFrom > filterTo) return;
    setPage(1);
    setAppliedFrom(filterFrom);
    setAppliedTo(filterTo);
  };

  const clearFilters = () => {
    setFilterFrom('');
    setFilterTo('');
    setAppliedFrom('');
    setAppliedTo('');
    setPage(1);
  };

  const fmt = (n: number) => `${getCurrencySymbol()} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Can permission="org.accounting.view">
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Accounting Records</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Your organisation's journal entries — automatically created entries (marketplace orders, bookings,
            settlements) and manual journal entries. Same data as the platform journal, scoped to your organisation.
          </p>
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border mb-4 p-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">From Date</label>
              <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">To Date</label>
              <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <Button onClick={applyFilters}>Apply</Button>
            <Button variant="ghost" onClick={clearFilters}>Clear</Button>
          </div>
        </div>

        <div>
          {isLoading ? (
            <div className="py-12"><Spinner /></div>
          ) : isError ? (
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-12 text-center">
              <p className="text-sm text-[var(--color-error)]">Failed to load accounting records. Please try again.</p>
            </div>
          ) : !entries.length ? (
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-12 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">No journal entries found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => {
                const debits = entry.lines.filter((l) => l.debit > 0);
                const credits = entry.lines.filter((l) => l.credit > 0);
                const totalDebit = debits.reduce((s, l) => s + l.debit, 0);
                const totalCredit = credits.reduce((s, l) => s + l.credit, 0);

                return (
                  <div key={entry.id}
                    className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] overflow-hidden">
                    <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]/30 flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-[var(--color-text)]">
                          {formatISODate(entry.entry_date)}
                        </span>
                        {entry.reference_type && (
                          <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                            {entry.reference_type}{entry.reference_id ? ` #${entry.reference_id}` : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--color-text-muted)] max-w-md truncate">{entry.description || '—'}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--color-border)]">
                      <div className="p-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Debit</h4>
                        <div className="space-y-1.5">
                          {debits.map((line, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="text-[var(--color-text)]">
                                <span className="font-mono text-[var(--color-text-muted)]">{line.account_code}</span>
                                <span className="mx-1.5 text-[var(--color-text-muted)]">—</span>
                                {line.account_name}
                              </span>
                              <span className="font-mono font-medium text-[var(--color-text)]">{fmt(line.debit)}</span>
                            </div>
                          ))}
                          {!debits.length && <p className="text-xs text-[var(--color-text-muted)]">None</p>}
                        </div>
                        <div className="flex items-center justify-between text-sm font-semibold mt-2 pt-2 border-t border-[var(--color-border)]">
                          <span className="text-[var(--color-text-muted)]">Total</span>
                          <span className="font-mono text-[var(--color-text)]">{fmt(totalDebit)}</span>
                        </div>
                      </div>

                      <div className="p-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Credit</h4>
                        <div className="space-y-1.5">
                          {credits.map((line, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="text-[var(--color-text)]">
                                <span className="font-mono text-[var(--color-text-muted)]">{line.account_code}</span>
                                <span className="mx-1.5 text-[var(--color-text-muted)]">—</span>
                                {line.account_name}
                              </span>
                              <span className="font-mono font-medium text-[var(--color-text)]">{fmt(line.credit)}</span>
                            </div>
                          ))}
                          {!credits.length && <p className="text-xs text-[var(--color-text-muted)]">None</p>}
                        </div>
                        <div className="flex items-center justify-between text-sm font-semibold mt-2 pt-2 border-t border-[var(--color-border)]">
                          <span className="text-[var(--color-text-muted)]">Total</span>
                          <span className="font-mono text-[var(--color-text)]">{fmt(totalCredit)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {total > 0 && (
            <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          )}
        </div>
      </div>
    </Can>
  );
}