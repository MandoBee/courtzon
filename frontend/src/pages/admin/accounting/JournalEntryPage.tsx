import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Spinner, Pagination } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { localToday } from '../../../utils/dateRange';
import { formatISODate } from '../../../utils/formatDate';
import { getCurrencySymbol } from '../../../utils/currency';

interface LineItem {
  account_id: number | '';
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
}

interface GroupedEntry {
  id: number;
  entry_date: string;
  description: string;
  reference_type: string;
  reference_id: string | number | null;
  organisation_id: number | null;
  lines: { account_code: string; account_name: string; debit: number; credit: number }[];
}

export interface JournalEntityOption {
  id: number;
  name: string;
  value: string;
}

/**
 * Build ONE option per unique entity from the organisation + merchant sources.
 *
 * Root cause of duplicates: merchants are seller ORGANISATIONS, so the SAME
 * entity (same organisation_id) can be returned by both the organisation source
 * and the merchant source. Deduplicate by the canonical entity identity
 * (organisation_id), preferring the organisation identity (`organisation:<id>`)
 * whenever the id is present in the organisation source. An entity that exists
 * ONLY in the merchant source keeps its `merchant:<id>` value. Two genuinely
 * different entities that merely share a display name have different ids and are
 * NEVER merged. The visible label is just the entity name.
 */
export function buildUniqueEntities(
  orgs: { id: number | string; name?: string }[],
  merchants: { id: number | string; name?: string }[],
): JournalEntityOption[] {
  const byId = new Map<number, JournalEntityOption>();
  for (const o of orgs || []) {
    const id = Number(o.id);
    if (!Number.isFinite(id)) continue;
    byId.set(id, { id, name: String(o.name || `Entity #${id}`), value: `organisation:${id}` });
  }
  for (const m of merchants || []) {
    const id = Number(m.id);
    if (!Number.isFinite(id) || byId.has(id)) continue;
    byId.set(id, { id, name: String(m.name || `Entity #${id}`), value: `merchant:${id}` });
  }
  return [...byId.values()];
}

export default function JournalEntryPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  // Entity selection is applied IMMEDIATELY (independent of Apply). Dates are
  // applied only on Apply. `entityType`/`entityId` are therefore always the
  // active query scope, while `appliedFrom`/`appliedTo` are the active date range.
  const [entityType, setEntityType] = useState<'courtzon' | 'organisation' | 'merchant' | 'all'>('courtzon');
  const [entityId, setEntityId] = useState('');
  const [form, setForm] = useState({ entry_date: localToday(), description: '' });
  const [lines, setLines] = useState<LineItem[]>([{ account_id: '', account_code: '', account_name: '', debit: 0, credit: 0 }]);

  const { data: entriesData, isLoading } = useQuery({
    queryKey: ['accounting', 'journal-entries-grouped', page, pageSize, appliedFrom, appliedTo, entityType, entityId],
    queryFn: () => api.get('/admin/accounting/journal', {
      params: {
        grouped: true, page, pageSize,
        dateFrom: appliedFrom || undefined, dateTo: appliedTo || undefined,
        entityType, entityId: entityId || undefined,
      },
    }).then((r: any) => r.data),
  });

  // Canonical entity sources (same endpoints used elsewhere in the admin app):
  // organisations from /admin/organisations, marketplace sellers (merchants)
  // from /marketplace/admin/sellers. Server-side validated on query.
  const { data: orgs } = useQuery({
    queryKey: ['accounting', 'journal-entity-orgs'],
    queryFn: () => api.get('/admin/organisations').then((r: any) => (Array.isArray(r.data) ? r.data : (r.data?.data || []))),
  });

  const { data: merchants } = useQuery({
    queryKey: ['accounting', 'journal-entity-merchants'],
    queryFn: () => api.get('/marketplace/admin/sellers', { params: { limit: 500 } }).then((r: any) => r.data?.data || []),
  });

  // One option per unique entity (merchants are seller orgs and can overlap with
  // the organisation source — deduplicate by canonical entity id).
  const entityOptions = buildUniqueEntities(orgs || [], merchants || []);

  const { data: accounts } = useQuery({
    queryKey: ['accounting', 'chart-of-accounts'],
    queryFn: () => api.get('/admin/accounting/accounts').then((r: any) => r.data.data || r.data),
  });

  const entries: GroupedEntry[] = entriesData?.data || [];
  const total = entriesData?.total || 0;
  const accountList: any[] = (accounts || []).filter((a: any) => a.is_postable);

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/admin/accounting/journal', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounting', 'journal-entries-grouped'] }); resetForm(); showToast('Journal entry created!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const resetForm = () => { setShowForm(false); setForm({ entry_date: localToday(), description: '' }); setLines([{ account_id: '', account_code: '', account_name: '', debit: 0, credit: 0 }]); };

  const addLine = () => setLines([...lines, { account_id: '', account_code: '', account_name: '', debit: 0, credit: 0 }]);

  const removeLine = (idx: number) => { if (lines.length > 1) setLines(lines.filter((_, i) => i !== idx)); };

  const updateLine = (idx: number, field: keyof LineItem, value: any) => {
    const updated = lines.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, [field]: value };
      if (field === 'account_id') {
        const acct = accountList.find((a: any) => a.id === Number(value));
        if (acct) { next.account_code = acct.code; next.account_name = acct.name; }
      }
      return next;
    });
    setLines(updated);
  };

  const totalDebits = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredits = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.001;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.entry_date) return;
    if (!isBalanced) { showToast('Debits must equal credits', 'error'); return; }
    const hasEmpty = lines.some(l => !l.account_id);
    if (hasEmpty) { showToast('All line items must have an account selected', 'error'); return; }
    createMutation.mutate({
      entryDate: form.entry_date,
      description: form.description,
      entries: lines.map(l => ({ accountId: Number(l.account_id), debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
    });
  };

  // Apply is concerned ONLY with the date range. The entity is already applied
  // immediately on change, so this does not re-apply the entity scope.
  const applyFilters = () => {
    if (filterFrom && filterTo && filterFrom > filterTo) {
      showToast('From date must be before or equal to To date', 'error');
      return;
    }
    setPage(1);
    setAppliedFrom(filterFrom);
    setAppliedTo(filterTo);
  };

  // Clear resets ONLY the date filter state. The entity selection is preserved
  // because it is now an immediately-applied independent filter.
  const clearFilters = () => {
    setFilterFrom('');
    setFilterTo('');
    setAppliedFrom('');
    setAppliedTo('');
    setPage(1);
  };

  // Entity selection applies immediately (no Apply click required).
  const onEntityChange = (value: string) => {
    if (value === 'courtzon' || value === 'all') {
      setEntityType(value);
      setEntityId('');
    } else {
      const sep = value.indexOf(':');
      const t = value.slice(0, sep) as 'organisation' | 'merchant';
      const id = value.slice(sep + 1);
      setEntityType(t);
      setEntityId(id);
    }
    setPage(1);
  };

  const entitySelectValue = entityType === 'organisation' || entityType === 'merchant'
    ? `${entityType}:${entityId}`
    : entityType;

  const fmt = (n: number) => `${getCurrencySymbol()} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Can permission="accounting.journal.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Journal Entries</h1>
          <Can permission="accounting.journal.create">
            <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Entry</Button>
          </Can>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit}
            className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
            <h3 className="font-semibold text-[var(--color-text)] mb-4">New Journal Entry</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Entry Date *</label>
                <input type="date" value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Description *</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[var(--color-text)]">Line Items</span>
                <Button type="button" variant="ghost" onClick={addLine}>+ Add Line</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                      <th className="text-left px-2 py-2">Account</th>
                      <th className="text-right px-2 py-2">Debit</th>
                      <th className="text-right px-2 py-2">Credit</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, idx) => (
                      <tr key={idx} className="border-b border-[var(--color-border)]">
                        <td className="px-2 py-2">
                          <select value={String(l.account_id)} onChange={e => updateLine(idx, 'account_id', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs">
                            <option value="">Select account...</option>
                            {accountList.map((a: any) => (
                              <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" step="0.01" min="0" value={l.debit || ''} onChange={e => updateLine(idx, 'debit', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs text-right" />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" step="0.01" min="0" value={l.credit || ''} onChange={e => updateLine(idx, 'credit', e.target.value)}
                            className="w-full px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs text-right" />
                        </td>
                        <td className="px-2 py-2">
                          <button type="button" onClick={() => removeLine(idx)} disabled={lines.length <= 1}
                            className="text-xs text-[var(--color-error)] disabled:opacity-30">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-end gap-4 mt-2 text-sm">
                <span className="text-[var(--color-text-muted)]">Total Debits: <strong className="text-[var(--color-text)]">{fmt(totalDebits)}</strong></span>
                <span className="text-[var(--color-text-muted)]">Total Credits: <strong className="text-[var(--color-text)]">{fmt(totalCredits)}</strong></span>
                <span className={`font-semibold ${isBalanced ? 'text-green-600' : 'text-red-500'}`}>
                  {isBalanced ? '✓ Balanced' : '✕ Not Balanced'}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" loading={createMutation.isPending} disabled={!isBalanced}>Post Entry</Button>
              <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
            </div>
          </form>
        )}

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border mb-4 p-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">From Date</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} aria-label="From Date"
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">To Date</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} aria-label="To Date"
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <Button onClick={applyFilters}>Apply</Button>
            <Button variant="ghost" onClick={clearFilters}>Clear</Button>
            <div className="ml-auto">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Entity</label>
              <select
                value={entitySelectValue}
                onChange={(e) => onEntityChange(e.target.value)}
                aria-label="Entity"
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[200px]"
              >
                <option value="courtzon">CourtZon</option>
                {entityOptions.map((e) => (
                  <option key={e.value} value={e.value}>{e.name}</option>
                ))}
                <option value="all">All</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          {isLoading ? (
            <div className="py-12"><Spinner /></div>
          ) : !entries.length ? (
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-12 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">No journal entries found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map(entry => {
                const debits = entry.lines.filter(l => l.debit > 0);
                const credits = entry.lines.filter(l => l.credit > 0);
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
