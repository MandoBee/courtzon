import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import { Spinner } from '../../components/ui';
import { Can } from '../../permissions/Can';

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

/**
 * Organisation Manual Journal — READ-ONLY.
 *
 * P1-1: Organisation users may view their organisation's journal entries but
 * cannot create manual entries in CourtZon's canonical general_ledger. Manual
 * journal creation is restricted to CourtZon platform accounting admins via
 * the admin accounting journal path.
 */
export default function OrgJournalPage() {
  const { orgId } = useParams<{ orgId: string }>();

  const { data: entriesData, isLoading } = useQuery({
    queryKey: ['org', 'accounting', 'journal', orgId],
    queryFn: () => api.get(`/org/${orgId}/accounting/journal`).then((r: any) => r.data),
    enabled: !!orgId,
  });

  const entries: JournalEntry[] = entriesData?.data || [];

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Can permission="org.accounting.journal.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">Journal Entries</h1>
            <p className="text-sm text-[var(--color-text-muted)]">Manual journal entries for this organisation (read-only)</p>
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
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-[var(--color-bg)]/30">
                    <td className="px-4 py-3 text-[var(--color-text)]">{new Date(e.entry_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="text-[var(--color-text)]">{e.account_name}</div>
                      <div className="text-xs font-mono text-[var(--color-text-muted)]">{e.account_code}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{e.debit ? fmt(Number(e.debit)) : '-'}</td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{e.credit ? fmt(Number(e.credit)) : '-'}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] max-w-[240px] truncate">{e.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!isLoading && !entries.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No journal entries yet</p>}
        </div>
      </div>
    </Can>
  );
}