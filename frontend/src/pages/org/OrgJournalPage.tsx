import { useState } from 'react';
import { getErrorMessage } from '../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import { Button, Spinner } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';
import { localToday } from '../../utils/dateRange';

interface LineItem {
  account_id: number | '';
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
}

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

export default function OrgJournalPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ entry_date: localToday(), description: '' });
  const [lines, setLines] = useState<LineItem[]>([{ account_id: '', account_code: '', account_name: '', debit: 0, credit: 0 }]);

  const { data: entriesData, isLoading } = useQuery({
    queryKey: ['org', 'accounting', 'journal', orgId],
    queryFn: () => api.get(`/org/${orgId}/accounting/journal`).then((r: any) => r.data),
    enabled: !!orgId,
  });

  const { data: coaData } = useQuery({
    queryKey: ['org', 'accounting', 'coa', orgId],
    queryFn: () => api.get(`/org/${orgId}/accounting/coa`).then((r: any) => r.data.data || r.data),
    enabled: !!orgId,
  });

  const entries: JournalEntry[] = entriesData?.data || [];
  const globalAccts: any[] = coaData?.global || [];
  const orgAccts: any[] = coaData?.org || [];

  const accountList: any[] = [
    ...globalAccts
      .filter((a: any) => a.is_postable && (a.customization?.is_visible ?? true))
      .map((a: any) => ({ id: a.id, code: a.code, name: a.effective_name, scope: 'Global' })),
    ...orgAccts
      .filter((a: any) => a.is_postable)
      .map((a: any) => ({ id: a.id, code: a.code, name: a.name, scope: 'Organisation' })),
  ].sort((a, b) => a.code.localeCompare(b.code));

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post(`/org/${orgId}/accounting/journal`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['org', 'accounting', 'journal', orgId] }); resetForm(); showToast('Journal entry created!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const resetForm = () => { setShowForm(false); setForm({ entry_date: localToday(), description: '' }); setLines([{ account_id: '', account_code: '', account_name: '', debit: 0, credit: 0 }]); };

  const addLine = () => setLines([...lines, { account_id: '', account_code: '', account_name: '', debit: 0, credit: 0 }]);

  const removeLine = (idx: number) => { if (lines.length > 2) setLines(lines.filter((_, i) => i !== idx)); };

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

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Can permission="org.accounting.journal.view">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">Journal Entries</h1>
            <p className="text-sm text-[var(--color-text-muted)]">Manual journal entries for this organisation</p>
          </div>
          <Can permission="org.accounting.journal.create">
            <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Entry</Button>
          </Can>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
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
                          <button type="button" onClick={() => removeLine(idx)} disabled={lines.length <= 2}
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
