import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useTranslation } from '../../../i18n';

export default function PermissionsPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [moduleId, setModuleId] = useState('');
  const [permissionKey, setPermissionKey] = useState('');
  const [description, setDescription] = useState('');

  const { data: modules } = useQuery({
    queryKey: ['admin', 'permission-modules'],
    queryFn: () => api.get('/permission-modules').then((r: any) => r.data.data),
  });

  const { data: permissions } = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: () => api.get('/permissions').then((r: any) => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/permissions', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'permissions'] }); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/permissions/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'permissions'] }); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/permissions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'permissions'] }),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setModuleId('');
    setPermissionKey('');
    setDescription('');
  };

  const openEdit = (perm: any) => {
    setEditingId(perm.id);
    setModuleId(String(perm.module_id));
    setPermissionKey(perm.permission_key);
    setDescription(perm.description || '');
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!moduleId || !permissionKey) return;
    const payload = { moduleId: Number(moduleId), permissionKey, description: description || undefined };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const groupedPerms = (permissions || []).reduce((acc: Record<number, any[]>, p: any) => {
    if (!acc[p.module_id]) acc[p.module_id] = [];
    acc[p.module_id].push(p);
    return acc;
  }, {} as Record<number, any[]>);

  const modMap = (modules || []).reduce((acc: Record<number, any>, m: any) => {
    acc[m.id] = m;
    return acc;
  }, {} as Record<number, any>);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('admin.permissions.title')}</h1>
        <Can permission="permissions.create">
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
            + New Permission
          </button>
        </Can>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border border-[var(--color-border)]">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editingId ? 'Edit Permission' : 'New Permission'}</h3>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Module</label>
              <select value={moduleId} onChange={e => setModuleId(e.target.value)} required
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[160px]">
                <option value="">Select module...</option>
                {modules?.map((m: any) => <option key={m.id} value={m.id}>{m.slug}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Permission Key</label>
              <input value={permissionKey} onChange={e => setPermissionKey(e.target.value)}
                placeholder="e.g. bookings.approve" required
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div className="flex-1 min-w-[240px]">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)}
                placeholder={t('admin.permissions.desc_placeholder')}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
              className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={resetForm}
              className="px-5 py-2 border rounded-[var(--radius-md)] text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-6">
        {(Object.entries(groupedPerms) as [string, any[]][])
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([modId, perms]) => (
            <div key={modId} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
              <div className="px-5 py-3 border-b bg-[var(--color-bg)]/50">
                <h2 className="font-semibold text-[var(--color-text)] capitalize">
                  {modMap[Number(modId)]?.slug || `Module #${modId}`}
                  <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">{perms.length} permissions</span>
                </h2>
              </div>
              <div className="divide-y">
                {perms.map((perm: any) => (
                  <div key={perm.id} className="px-5 py-3 flex items-center justify-between hover:bg-[var(--color-bg)]/30">
                    <div className="flex-1 min-w-0">
                      <code className="text-sm font-mono text-[var(--color-text)]">{perm.permission_key}</code>
                      {perm.description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{perm.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <Can permission="permissions.edit">
                        <button onClick={() => openEdit(perm)}
                          className="text-xs px-3 py-1.5 border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)]">
                          Edit
                        </button>
                      </Can>
                      <Can permission="permissions.delete">
                        <button onClick={() => { if (confirm(`Delete "${perm.permission_key}"?`)) deleteMutation.mutate(perm.id); }}
                          className="text-xs px-3 py-1.5 border rounded-[var(--radius-md)] text-[var(--color-error)] hover:bg-red-50">
                          Delete
                        </button>
                      </Can>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
