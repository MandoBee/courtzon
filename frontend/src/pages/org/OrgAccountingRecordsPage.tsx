import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import { Spinner } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useCan } from '../../hooks/useCan';

interface AccountingRecord {
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

/**
 * Organisation Accounting Records — READ-ONLY.
 *
 * Lists every general-ledger entry that belongs to this organisation:
 * automatically-created entries (marketplace orders, bookings, settlements,
 * etc.) plus manual journal entries. Organisation-scoped: the org can only ever
 * see its own records (backend enforces organisation_id from the route).
 */
export default function OrgAccountingRecordsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { can } = useCan();

  if (!can('org.accounting.view')) return null;

  const { data, isLoading } = useQuery({
    queryKey: ['org', 'accounting', 'records', orgId],
    queryFn: () => api.get(`/org/${orgId}/accounting/records`).then((r: any) => r.data),
    enabled: !!orgId,
  });

  const records: AccountingRecord[] = data?.data || [];

  const fmt = (n: number) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const refLabel = (r: AccountingRecord) => {
    if (r.reference_type === 'journal') return 'Manual journal';
    const clean = String(r.reference_type || '').replace(/^marketplace_marketplace_/, 'marketplace_');
    return `${clean} #${r.reference_id ?? ''}`;
  };

  return (
    <Can permission="org.accounting.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">Accounting Records</h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              Your organisation's general ledger — automatically created entries (marketplace orders, bookings,
              settlements) and manual journal entries.
            </p>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
          {isLoading ? <Spinner /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Account</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Debit</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Credit</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--color-bg)]/30">
                    <td className="px-4 py-3 whitespace-nowrap text-[var(--color-text)]">{new Date(r.entry_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="text-[var(--color-text)]">{r.account_name}</div>
                      <div className="text-xs font-mono text-[var(--color-text-muted)]">{r.account_code}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{r.debit ? fmt(r.debit) : '-'}</td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{r.credit ? fmt(r.credit) : '-'}</td>
                    <td className="px-4 py-3 max-w-[300px]">
                      {r.description && <div className="text-[var(--color-text-muted)] truncate">{r.description}</div>}
                      <div className="text-xs text-[var(--color-text-muted)]/70">{refLabel(r)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!isLoading && !records.length && (
            <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No accounting records yet</p>
          )}
        </div>
      </div>
    </Can>
  );
}