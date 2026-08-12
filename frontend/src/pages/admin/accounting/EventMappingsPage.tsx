import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useCan } from '../../../hooks/useCan';
import { useToast } from '../../../components/ui/Toast';

interface AccountOption {
  id: number;
  code: string;
  name: string;
  type: string;
  is_active: boolean;
  organisation_id: number | null;
}

const SIDE_COLOR: Record<string, string> = {
  debit: 'text-red-600',
  credit: 'text-green-600',
};

export default function EventMappingsPage() {
  const { can } = useCan();
  if (!can('accounting.mappings.view')) return null;

  return <EventMappingsContent />;
}

function EventMappingsContent() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [orgId, setOrgId] = useState<string>('');
  const [eventType, setEventType] = useState<string>('card_payment');
  const [editing, setEditing] = useState(false);
  const [editLines, setEditLines] = useState<Record<string, string>>({});
  const [confirmRestore, setConfirmRestore] = useState(false);

  const { data: orgs } = useQuery({
    queryKey: ['organisations', 'list-minimal'],
    queryFn: () => api.get('/organisations', { params: { limit: 200 } }).then((r: any) => r.data.data || r.data),
  });

  const orgList: any[] = Array.isArray(orgs) ? orgs : [];

  const numericOrgId = orgId ? Number(orgId) : null;

  const { data: accountList } = useQuery({
    queryKey: ['accounting', 'accounts', numericOrgId],
    queryFn: () => api.get('/admin/accounting/accounts').then((r: any) => r.data.data || r.data),
  });

  const accounts: AccountOption[] = (accountList || []).filter((a: any) =>
    a.is_active && a.is_postable &&
    (a.organisation_id === null || a.organisation_id === numericOrgId)
  );

  const { data: mappingData, isLoading } = useQuery({
    queryKey: ['accounting', 'mappings', eventType, numericOrgId],
    queryFn: () => api.get(`/admin/accounting/mappings/${eventType}`, { params: { organisationId: numericOrgId } })
      .then((r: any) => r.data.data || r.data),
    enabled: !!eventType,
  });

  const isOverridden = mappingData?.isOverridden ?? false;
  const requiredConcepts: any[] = mappingData?.requiredConcepts || [];

  useEffect(() => {
    setEditing(false);
    setConfirmRestore(false);
  }, [eventType, orgId]);

  const EVENT_TYPES = [
    'wallet_topup', 'card_payment', 'wallet_payment', 'card_refund', 'wallet_refund',
    'cod_payment', 'marketplace_delivery', 'marketplace_reversal',
    'withdrawal_request', 'withdrawal_completion', 'settlement_paid', 'settlement_paid_otc',
    'payment_failure', 'invoice_issue', 'invoice_payment',
    'purchase_invoice_issue', 'purchase_invoice_payment',
    'invoice_cancel', 'purchase_invoice_cancel',
  ];

  const saveMutation = useMutation({
    mutationFn: () => {
      const lines = Object.entries(editLines).map(([concept, accountId]) => ({
        concept,
        accountId: Number(accountId),
      }));
      return api.put(`/admin/accounting/mappings/${eventType}`, {
        organisationId: numericOrgId,
        lines,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting', 'mappings', eventType, numericOrgId] });
      setEditing(false);
      showToast('Mapping saved!');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to save mapping', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/accounting/mappings/${eventType}`, { params: { organisationId: numericOrgId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting', 'mappings', eventType, numericOrgId] });
      setConfirmRestore(false);
      showToast('Restored to global default!');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to restore', 'error'),
  });

  const startEdit = () => {
    const init: Record<string, string> = {};
    for (const c of requiredConcepts) {
      init[c.concept] = c.account_id ? String(c.account_id) : '';
    }
    setEditLines(init);
    setEditing(true);
  };

  const updateLine = (concept: string, accountId: string) => {
    setEditLines(prev => ({ ...prev, [concept]: accountId }));
  };

  const canSave = () => {
    const allFilled = requiredConcepts.every((c: any) => editLines[c.concept] && editLines[c.concept] !== '');
    return allFilled;
  };

  if (isLoading) return <Spinner />;

  const fmt = (label: string) => label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">Accounting Event Mappings</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5">
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">Organization</label>
          <select value={orgId} onChange={e => setOrgId(e.target.value)}
            className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
            <option value="">All (Global Defaults)</option>
            {orgList.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">Event Type</label>
          <select value={eventType} onChange={e => setEventType(e.target.value)}
            className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
            {EVENT_TYPES.map(et => <option key={et} value={et}>{fmt(et)}</option>)}
          </select>
        </div>
      </div>

      {numericOrgId && (
        <div className="flex items-center gap-3 mb-6">
          <span className={`px-3 py-1 text-xs font-medium rounded-full ${
            isOverridden ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
          }`}>
            {isOverridden ? 'Organization Override' : 'Global Default'}
          </span>
          {!editing && (
            <Can permission="accounting.mappings.manage">
              <Button onClick={startEdit}>
                {isOverridden ? 'Edit Override' : 'Create Override'}
              </Button>
            </Can>
          )}
          {isOverridden && !editing && (
            <Can permission="accounting.mappings.manage">
              <Button variant="ghost" onClick={() => setConfirmRestore(true)}
                className="text-[var(--color-error)]">
                Restore Global Default
              </Button>
            </Can>
          )}
        </div>
      )}

      {editing && (
        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-[var(--radius-md)] p-4 mb-4">
          <p className="text-sm text-blue-700 dark:text-blue-400">
            Editing {isOverridden ? 'override' : 'new override'} for <strong>{fmt(eventType)}</strong>.
            All required concepts must be mapped to save.
          </p>
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)] w-20">Side</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Concept</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Account</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)] w-32">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {requiredConcepts.map((c: any) => {
              const isMerged = requiredConcepts.some((other: any) =>
                other !== c && other.account_id === c.account_id && other.side === c.side
              );
              return (
                <tr key={c.concept} className="hover:bg-[var(--color-bg)]/30">
                  <td className={`px-4 py-3 font-mono text-xs uppercase ${SIDE_COLOR[c.side] || ''}`}>
                    {c.side.slice(0, 2)}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text)]">
                    <code className="text-xs bg-[var(--color-bg)] px-1.5 py-0.5 rounded">{c.concept}</code>
                  </td>
                  <td className="px-4 py-3">
                    {editing ? (
                      <select value={editLines[c.concept] || ''} onChange={e => updateLine(c.concept, e.target.value)}
                        className="w-full px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs">
                        <option value="">Select account...</option>
                        {accounts.map((a: AccountOption) => (
                          <option key={a.id} value={a.id}>
                            [{a.code}] {a.name} {a.organisation_id === null ? '(Global)' : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-[var(--color-text-muted)]">[{c.account_code || '—'}]</span>
                        <span className="text-xs text-[var(--color-text)]">{c.account_name || 'Not mapped'}</span>
                        {!c.account_active && c.mapped && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-red-100 text-red-800">
                            Inactive
                          </span>
                        )}
                        {isMerged && c.mapped && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-amber-100 text-amber-800">
                            Merged
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-[var(--color-text-muted)]">
                    {!numericOrgId ? 'Global' : isOverridden ? 'Override' : 'Global'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {requiredConcepts.length === 0 && (
          <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">Select an event type to view mappings</p>
        )}
      </div>

      {editing && (
        <div className="flex gap-3 mt-6">
          <Can permission="accounting.mappings.manage">
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!canSave()}>
              Save Override
            </Button>
          </Can>
          <Button variant="ghost" onClick={() => { setEditing(false); setConfirmRestore(false); }}>
            Cancel
          </Button>
        </div>
      )}

      {confirmRestore && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmRestore(false)}>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] w-full max-w-md"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <h2 className="text-lg font-bold text-[var(--color-text)]">Restore Global Default</h2>
              <button onClick={() => setConfirmRestore(false)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none">&times;</button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-[var(--color-text-muted)]">
                This will remove the organization override for <strong>{fmt(eventType)}</strong> and restore the global default mapping.
              </p>
              <p className="text-sm text-[var(--color-text-muted)]">
                Existing ledger entries are not affected.
              </p>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-[var(--color-border)]">
              <button onClick={() => setConfirmRestore(false)}
                className="px-4 py-2 rounded-[var(--radius-md)] border text-sm">Cancel</button>
              <Can permission="accounting.mappings.manage">
                <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}
                  className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--color-error)] text-white text-sm disabled:opacity-50">
                  {deleteMutation.isPending ? 'Restoring...' : 'Restore'}
                </button>
              </Can>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
