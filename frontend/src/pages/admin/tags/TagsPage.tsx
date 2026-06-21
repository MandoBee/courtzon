import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

interface Tag {
  id: number;
  name: string;
  slug: string;
  is_active: number;
  product_count: number;
}

export default function TagsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'tags'],
    queryFn: () => api.get('/admin/tags').then((r: any) => r.data.data),
  });

  const tags: Tag[] = data || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/admin/tags', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'tags'] }); resetForm(); showToast('Tag created!'); },
    onError: (err: any) => { showToast('Failed: ' + getErrorMessage(err), 'error'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/admin/tags/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'tags'] }); resetForm(); showToast('Tag updated!'); },
    onError: (err: any) => { showToast('Failed: ' + getErrorMessage(err), 'error'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/tags/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'tags'] }); showToast('Tag deleted!'); },
    onError: (err: any) => { showToast('Failed: ' + getErrorMessage(err), 'error'); },
  });

  const resetForm = () => { setShowForm(false); setEditing(null); setName(''); setSlug(''); };

  const openEdit = (t: Tag) => { setEditing(t); setName(t.name); setSlug(t.slug); setShowForm(true); };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!editing) setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    if (editing) updateMutation.mutate({ id: editing.id, data: { name, slug } });
    else createMutation.mutate({ name, slug });
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Product Tags</h1>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Tag</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit Tag' : 'New Tag'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <Can permission="tags.edit.name">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
                <input value={name} onChange={(e: any) => handleNameChange(e.target.value)} required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </Can>
            {editing && (
              <Can permission="tags.edit.slug">
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Slug</label>
                  <input value={slug} onChange={(e: any) => setSlug(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                </div>
              </Can>
            )}
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Can permission={editing ? 'tags.edit' : 'tags.create'}>
              <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>{editing ? 'Update' : 'Create'}</Button>
            </Can>
            <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        {tags.map((t: any) => (
          <div key={t.id} className="group flex items-center gap-1 px-3 py-1.5 bg-[var(--color-surface)] border rounded-full text-sm hover:shadow-sm">
            <span className="text-[var(--color-text)]">{t.name}</span>
            <span className="text-xs text-[var(--color-text-muted)]">({t.product_count})</span>
            <Can permission="tags.edit">
              <button onClick={() => openEdit(t)} className="ml-1 text-xs text-[var(--color-primary)] opacity-0 group-hover:opacity-100">✎</button>
            </Can>
            <Can permission="tags.delete">
              <button onClick={() => deleteMutation.mutate(t.id)} className="text-xs text-red-400 opacity-0 group-hover:opacity-100">×</button>
            </Can>
          </div>
        ))}
        {!tags.length && <p className="text-sm text-[var(--color-text-muted)] py-4">No tags yet</p>}
      </div>
    </div>
  );
}
