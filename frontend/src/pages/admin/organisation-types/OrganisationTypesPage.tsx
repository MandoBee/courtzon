import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Card, Modal, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

interface OrgType {
  id: number;
  slug: string;
  name: string | null;
  description: string | null;
  is_active: number;
  sort_order: number;
}

export default function OrganisationTypesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OrgType | null>(null);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'organisation-types'],
    queryFn: () => api.get('/organisation-types').then((r: any) => r.data.data),
  });

  const types: OrgType[] = data || [];

  const createMutation = useMutation({
    mutationFn: (data: { slug: string; name?: string; description?: string; sortOrder: number }) =>
      api.post('/organisation-types', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organisation-types'] });
      resetForm();
      showToast('Created successfully!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) =>
      api.put(`/organisation-types/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organisation-types'] });
      resetForm();
      showToast('Updated successfully!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/organisation-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organisation-types'] });
      setDeleteId(null);
      showToast('Deleted successfully!');
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditing(null);
    setSlug('');
    setName('');
    setDescription('');
    setSortOrder('0');
  };

  const openEdit = (t: OrgType) => {
    setEditing(t);
    setName(t.name || '');
    setSlug(t.slug);
    setDescription(t.description || '');
    setSortOrder(String(t.sort_order));
    setShowForm(true);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return;
    const payload = { slug, name: name || undefined, description: description || undefined, sortOrder: parseInt(sortOrder) || 0 };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Organisation Types</h1>
        <Button onClick={openCreate}>+ New Type</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit}
          className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">
            {editing ? 'Edit Type' : 'New Type'}
          </h3>
          <div className="flex items-end gap-3 flex-wrap">
            <Can permission="organisation-types.edit.name">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
                <input value={name} onChange={(e: any) => { const s = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, ''); setName(e.target.value); setSlug(s); }}
                  placeholder="Display name" required
                  className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[160px]" />
              </div>
            </Can>
            <Can permission="organisation-types.edit.sort-order">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Sort Order</label>
                <input type="number" value={sortOrder} onChange={(e: any) => setSortOrder(e.target.value)}
                  className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-20" />
              </div>
            </Can>
            <Can permission="organisation-types.edit.description">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Description</label>
                <input value={description} onChange={(e: any) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </Can>
            <Can permission={editing ? 'organisation-types.edit' : 'organisation-types.create'}>
              <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                {editing ? 'Update' : 'Create'}
              </Button>
            </Can>
            <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="grid gap-4">
        {types.map((t: any) => (
          <div key={t.id}
            className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 border border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-[var(--color-text)]">
                  {t.name || t.slug}
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">Slug: {t.slug}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-xs rounded-full ${t.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>
                  {t.is_active ? 'Active' : 'Inactive'}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">Sort: {t.sort_order}</span>
                <Button variant="ghost" onClick={() => openEdit(t)}>Edit</Button>
                <Button variant="ghost" onClick={() => setDeleteId(t.id)}
                  className="text-[var(--color-error)]">Delete</Button>
              </div>
            </div>
            {t.description && <p className="text-sm text-[var(--color-text-muted)]">{t.description}</p>}
          </div>
        ))}
        {types.length === 0 && (
          <Card>
            <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No organisation types found</p>
          </Card>
        )}
      </div>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Type">
        <p className="text-sm text-[var(--color-text-muted)] mb-6">Are you sure? This cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={() => deleteMutation.mutate(deleteId!)}
            loading={deleteMutation.isPending}
            className="bg-[var(--color-error)] text-white">Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
