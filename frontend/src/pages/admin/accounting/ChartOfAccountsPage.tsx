import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

interface Account {
  id: number;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parent_id: number | null;
  description: string;
  is_active: boolean;
  children?: Account[];
}

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;

const TYPE_BADGE: Record<string, string> = {
  asset: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  liability: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  equity: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  revenue: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  expense: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function ChartOfAccountsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState({ code: '', name: '', type: 'asset' as string, parent_id: '' as string | number, description: '' });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewTree, setViewTree] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'chart-of-accounts'],
    queryFn: () => api.get('/accounting/chart-of-accounts').then((r: any) => r.data.data || r.data),
  });

  const accounts: Account[] = data || [];

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/accounting/chart-of-accounts', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounting', 'chart-of-accounts'] }); resetForm(); showToast('Account created!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: any) => api.put(`/accounting/chart-of-accounts/${id}`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounting', 'chart-of-accounts'] }); resetForm(); showToast('Account updated!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/accounting/chart-of-accounts/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounting', 'chart-of-accounts'] }); setDeleteId(null); showToast('Account deleted!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const resetForm = () => { setShowForm(false); setEditing(null); setForm({ code: '', name: '', type: 'asset', parent_id: '', description: '' }); };

  const openEdit = (a: Account) => {
    setEditing(a);
    setForm({ code: a.code, name: a.name, type: a.type, parent_id: a.parent_id ?? '', description: a.description || '' });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code || !form.name) return;
    const payload = { ...form, parent_id: form.parent_id === '' ? null : Number(form.parent_id) };
    if (editing) { updateMutation.mutate({ id: editing.id, payload }); }
    else { createMutation.mutate(payload); }
  };

  const buildTree = (flat: Account[]): Account[] => {
    const map = new Map<number, Account>();
    const roots: Account[] = [];
    flat.forEach(a => map.set(a.id, { ...a, children: [] }));
    flat.forEach(a => {
      if (a.parent_id && map.has(a.parent_id)) {
        map.get(a.parent_id)!.children!.push(map.get(a.id)!);
      } else if (!a.parent_id) {
        roots.push(map.get(a.id)!);
      }
    });
    return roots;
  };

  function renderNode(node: Account, depth: number = 0) {
    return (
      <div key={node.id}>
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]/30 transition-colors"
          style={{ paddingLeft: `${12 + depth * 24}px` }}>
          <span className="text-xs font-mono text-[var(--color-text-muted)] w-20 shrink-0">{node.code}</span>
          <span className="text-sm font-medium text-[var(--color-text)] flex-1">{node.name}</span>
          <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${TYPE_BADGE[node.type] || ''}`}>
            {node.type}
          </span>
          <span className={`w-2 h-2 rounded-full ${node.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
          <Can permission="accounting.coa.manage">
            <div className="flex items-center gap-1 ml-2">
              <button onClick={() => openEdit(node)} className="text-xs text-[var(--color-primary)] hover:underline">Edit</button>
              <button onClick={() => setDeleteId(node.id)} className="text-xs text-[var(--color-error)] hover:underline">Delete</button>
            </div>
          </Can>
        </div>
        {node.children?.map(child => renderNode(child, depth + 1))}
      </div>
    );
  }

  if (isLoading) return <Spinner />;

  const tree = viewTree ? buildTree(accounts) : accounts;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Chart of Accounts</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setViewTree(!viewTree)}
            className="px-3 py-1.5 text-xs font-medium rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            {viewTree ? 'Flat View' : 'Tree View'}
          </button>
          <Can permission="accounting.coa.manage">
            <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Account</Button>
          </Can>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit}
          className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit Account' : 'New Account'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Code *</label>
              <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Parent Account</label>
              <select value={String(form.parent_id)} onChange={e => setForm({ ...form, parent_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value="">None (Top Level)</option>
                {accounts.filter(a => !editing || a.id !== editing.id).map(a => (
                  <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
          </div>
          <div className="flex gap-3 mt-4">
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
              {editing ? 'Update' : 'Create'}
            </Button>
            <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Code</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Active</th>
              <Can permission="accounting.coa.manage">
                <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
              </Can>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {viewTree
              ? tree.map((node: Account) => renderNode(node))
              : accounts.map(a => (
                  <tr key={a.id} className="hover:bg-[var(--color-bg)]/30">
                    <td className="px-4 py-3 text-xs font-mono text-[var(--color-text-muted)]">{a.code}</td>
                    <td className="px-4 py-3 text-sm text-[var(--color-text)]">{a.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${TYPE_BADGE[a.type]}`}>{a.type}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`w-2 h-2 rounded-full inline-block ${a.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                    </td>
                    <Can permission="accounting.coa.manage">
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(a)} className="text-xs text-[var(--color-primary)] hover:underline mr-2">Edit</button>
                        <button onClick={() => setDeleteId(a.id)} className="text-xs text-[var(--color-error)] hover:underline">Delete</button>
                      </td>
                    </Can>
                  </tr>
                ))}
          </tbody>
        </table>
        {!accounts.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No accounts found</p>}
      </div>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Account">
        <p className="text-sm text-[var(--color-text-muted)] mb-6">Are you sure? This cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={() => deleteMutation.mutate(deleteId!)} loading={deleteMutation.isPending}
            className="bg-[var(--color-error)] text-white">Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
