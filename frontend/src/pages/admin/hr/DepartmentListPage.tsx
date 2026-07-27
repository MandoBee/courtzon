import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

interface Department {
  id: number;
  name: string;
  parent_id: number | null;
  head_name: string | null;
  status: 'active' | 'inactive';
  children?: Department[];
}

export default function DepartmentListPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState({ name: '', parent_id: '' as string | number, head_name: '', status: 'active' as string });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewTree, setViewTree] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'hr', 'departments'],
    queryFn: () => api.get('/admin/hr/departments').then((r: any) => r.data.data || r.data),
  });

  const departments: Department[] = data || [];

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/admin/hr/departments', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'departments'] }); resetForm(); showToast('Department created!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: any) => api.put(`/admin/hr/departments/${id}`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'departments'] }); resetForm(); showToast('Department updated!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/hr/departments/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'hr', 'departments'] }); setDeleteId(null); showToast('Department deleted!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const resetForm = () => { setShowForm(false); setEditing(null); setForm({ name: '', parent_id: '', head_name: '', status: 'active' }); };

  const openEdit = (d: Department) => {
    setEditing(d);
    setForm({ name: d.name, parent_id: d.parent_id ?? '', head_name: d.head_name || '', status: d.status });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    const payload = { ...form, parent_id: form.parent_id === '' ? null : Number(form.parent_id) };
    if (editing) { updateMutation.mutate({ id: editing.id, payload }); }
    else { createMutation.mutate(payload); }
  };

  const buildTree = (flat: Department[]): Department[] => {
    const map = new Map<number, Department>();
    const roots: Department[] = [];
    flat.forEach(d => map.set(d.id, { ...d, children: [] }));
    flat.forEach(d => {
      if (d.parent_id && map.has(d.parent_id)) {
        map.get(d.parent_id)!.children!.push(map.get(d.id)!);
      } else if (!d.parent_id) {
        roots.push(map.get(d.id)!);
      }
    });
    return roots;
  };

  function renderNode(node: Department, depth: number = 0) {
    return (
      <div key={node.id}>
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]/30 transition-colors"
          style={{ paddingLeft: `${12 + depth * 24}px` }}>
          <span className="text-sm font-medium text-[var(--color-text)] flex-1">{node.name}</span>
          <span className="text-xs text-[var(--color-text-muted)]">{node.head_name || '—'}</span>
          <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${node.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
            {node.status}
          </span>
          <Can permission="hr.departments.manage">
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

  const tree = viewTree ? buildTree(departments) : departments;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Departments</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setViewTree(!viewTree)}
            className="px-3 py-1.5 text-xs font-medium rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            {viewTree ? 'Flat View' : 'Tree View'}
          </button>
          <Can permission="hr.departments.manage">
            <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Department</Button>
          </Can>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit}
          className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit Department' : 'New Department'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Parent Department</label>
              <select value={String(form.parent_id)} onChange={e => setForm({ ...form, parent_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value="">None (Top Level)</option>
                {departments.filter(d => !editing || d.id !== editing.id).map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Head</label>
              <input value={form.head_name} onChange={e => setForm({ ...form, head_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
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
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Head</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
              <Can permission="hr.departments.manage">
                <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
              </Can>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {viewTree
              ? tree.map((node: Department) => renderNode(node))
              : departments.map(d => (
                  <tr key={d.id} className="hover:bg-[var(--color-bg)]/30">
                    <td className="px-4 py-3 text-sm text-[var(--color-text)]">{d.name}</td>
                    <td className="px-4 py-3 text-sm text-[var(--color-text-muted)]">{d.head_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${d.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                        {d.status}
                      </span>
                    </td>
                    <Can permission="hr.departments.manage">
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(d)} className="text-xs text-[var(--color-primary)] hover:underline mr-2">Edit</button>
                        <button onClick={() => setDeleteId(d.id)} className="text-xs text-[var(--color-error)] hover:underline">Delete</button>
                      </td>
                    </Can>
                  </tr>
                ))}
          </tbody>
        </table>
        {!departments.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No departments found</p>}
      </div>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Department">
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
