import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import { Spinner } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';
import { getErrorMessage } from '../../utils/errors';

const TYPE_BADGE: Record<string, string> = {
  asset: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  liability: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  equity: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  revenue: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  expense: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  contra_asset: 'bg-blue-50 text-blue-600', contra_liability: 'bg-amber-50 text-amber-600', contra_equity: 'bg-purple-50 text-purple-600',
  contra_revenue: 'bg-green-50 text-green-600', contra_expense: 'bg-red-50 text-red-600',
};

export default function OrgChartOfAccountsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [renameTarget, setRenameTarget] = useState<{ id: number; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['org', 'accounting', 'coa', orgId],
    queryFn: () => api.get(`/org/${orgId}/accounting/coa`).then((r) => r.data.data || r.data),
    enabled: !!orgId,
  });

  const customizeMutation = useMutation({
    mutationFn: ({ accountId, isVisible, displayName }: { accountId: number; isVisible?: boolean; displayName?: string }) =>
      api.put(`/org/${orgId}/accounting/coa/customizations/${accountId}`, { isVisible, displayName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', 'accounting', 'coa', orgId] });
      setRenameTarget(null);
      showToast('Saved!');
    },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const resetMutation = useMutation({
    mutationFn: (accountId: number) => api.delete(`/org/${orgId}/accounting/coa/customizations/${accountId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', 'accounting', 'coa', orgId] });
      showToast('Restored default!');
    },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  if (isLoading) return <Spinner />;
  const globals: any[] = data?.global || [];
  const orgAccounts: any[] = data?.org || [];
  const visibleCount = globals.filter((a: any) => (a.customization?.is_visible ?? true)).length;

  return (
    <Can permission="org.accounting.view">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">Chart of Accounts</h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">
          Your accounts. Hide, show, or rename default accounts locally — this never affects other organisations or the platform.
        </p>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto mb-6">
          <div className="px-4 py-3 border-b border-[var(--color-border)] text-sm text-[var(--color-text-muted)]">
            {visibleCount} of {globals.length} default accounts visible
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Code</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
                <th className="text-center px-3 py-3 font-medium text-[var(--color-text-muted)]">Visible</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {globals.map((a: any) => {
                const vis = a.customization?.is_visible ?? true;
                return (
                  <tr key={a.id} className={`hover:bg-[var(--color-bg)]/30 ${vis ? '' : 'opacity-50'}`}>
                    <td className="px-4 py-3 text-xs font-mono text-[var(--color-text-muted)]">{a.code}</td>
                    <td className="px-4 py-3 text-[var(--color-text)]">
                      {renameTarget?.id === a.id ? (
                        <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') customizeMutation.mutate({ accountId: a.id, isVisible: vis, displayName: renameValue }); if (e.key === 'Escape') setRenameTarget(null); }}
                          className="px-2 py-1 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs" />
                      ) : (
                        <span>{a.effective_name}{a.customization?.display_name ? <span className="ml-1 text-[10px] text-amber-600">(renamed)</span> : null}</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${TYPE_BADGE[a.type] || ''}`}>{a.type.replace(/_/g, ' ')}</span></td>
                    <td className="px-3 py-3 text-center">
                      <Can permission="org.accounting.manage">
                        <input type="checkbox" checked={vis}
                          onChange={(e) => customizeMutation.mutate({ accountId: a.id, isVisible: e.target.checked, displayName: a.customization?.display_name ?? undefined })}
                          className="w-4 h-4 accent-[var(--color-primary)]" />
                      </Can>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Can permission="org.accounting.manage">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => { setRenameTarget({ id: a.id, name: a.effective_name }); setRenameValue(a.effective_name); }}
                            className="text-xs text-[var(--color-primary)] hover:underline">Rename</button>
                          {a.customization && (
                            <button onClick={() => resetMutation.mutate(a.id)} className="text-xs text-[var(--color-text-muted)] hover:underline">Reset</button>
                          )}
                        </div>
                      </Can>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {orgAccounts.length > 0 && (
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
            <div className="px-4 py-3 border-b border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)]">
              Organisation-specific Accounts ({orgAccounts.length})
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Code</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {orgAccounts.map((a: any) => (
                  <tr key={a.id} className="hover:bg-[var(--color-bg)]/30">
                    <td className="px-4 py-3 text-xs font-mono text-[var(--color-text-muted)]">{a.code}</td>
                    <td className="px-4 py-3 text-[var(--color-text)]">{a.name}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${TYPE_BADGE[a.type] || ''}`}>{a.type.replace(/_/g, ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Can>
  );
}
