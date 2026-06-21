import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Spinner, EntityImage } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

interface Brand {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  website: string | null;
  country: string | null;
  sort_order: number;
  is_active: number;
}

export default function BrandsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [country, setCountry] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [logoUrl, setLogoUrl] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'brands'],
    queryFn: () => api.get('/admin/brands').then((r: any) => r.data.data),
  });

  const brands: Brand[] = data || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/admin/brands', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'brands'] }); resetForm(); showToast('Brand created!'); },
    onError: (err: any) => { showToast('Failed: ' + getErrorMessage(err), 'error'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/admin/brands/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'brands'] }); resetForm(); showToast('Brand updated!'); },
    onError: (err: any) => { showToast('Failed: ' + getErrorMessage(err), 'error'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/brands/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'brands'] }); showToast('Brand deactivated!'); },
    onError: (err: any) => { showToast('Failed: ' + getErrorMessage(err), 'error'); },
  });

  const resetForm = () => {
    setShowForm(false); setEditing(null); setName(''); setSlug('');
    setDescription(''); setWebsite(''); setCountry(''); setSortOrder('0'); setLogoUrl('');
  };

  const openEdit = (b: Brand) => {
    setEditing(b); setName(b.name); setSlug(b.slug);
    setDescription(b.description || ''); setWebsite(b.website || '');
    setCountry(b.country || ''); setSortOrder(String(b.sort_order)); setLogoUrl(b.logo_url || '');
    setShowForm(true);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!editing) setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    const payload = { name, slug, description: description || undefined, website: website || undefined, country: country || undefined, sortOrder: parseInt(sortOrder) || 0, logoUrl: logoUrl || undefined };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Brands</h1>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Brand</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit Brand' : 'New Brand'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <Can permission="brands.edit.name">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
                <input value={name} onChange={(e: any) => handleNameChange(e.target.value)} required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </Can>
            <Can permission="brands.edit.slug">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Slug</label>
                <input value={slug} onChange={(e: any) => setSlug(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </Can>
            <Can permission="brands.edit.description">
              <div className="col-span-2">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Description</label>
                <textarea value={description} onChange={(e: any) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </Can>
            <Can permission="brands.edit.website">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Website</label>
                <input value={website} onChange={(e: any) => setWebsite(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </Can>
            <Can permission="brands.edit.country">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Country</label>
                <input value={country} onChange={(e: any) => setCountry(e.target.value)} placeholder="e.g. USA, Germany" className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </Can>
            <Can permission="brands.edit.sort-order">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Sort Order</label>
                <input type="number" value={sortOrder} onChange={(e: any) => setSortOrder(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-24" />
              </div>
            </Can>
            <Can permission="brands.edit.logo">
              <div className="col-span-2">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Logo URL</label>
                <input value={logoUrl} onChange={(e: any) => setLogoUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                {logoUrl && <EntityImage src={logoUrl} name={name || 'Brand'} className="mt-2 w-16 h-16 rounded-[var(--radius-md)] text-xl object-contain" />}
              </div>
            </Can>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Can permission={editing ? 'brands.edit' : 'brands.create'}>
              <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>{editing ? 'Update' : 'Create'}</Button>
            </Can>
            <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Logo</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Country</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Active</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {brands.map((b: any) => (
              <tr key={b.id} className="hover:bg-[var(--color-bg)]/30">
                <td className="px-4 py-3">
                  <EntityImage src={b.logo_url} name={b.name} className="w-10 h-10 rounded-[var(--radius-md)] text-sm object-contain" />
                </td>
                <td className="px-4 py-3 font-medium">{b.name}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{b.country || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${b.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>{b.is_active ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => openEdit(b)}>Edit</Button>
                    <Button variant="ghost" onClick={() => deleteMutation.mutate(b.id)} className="text-[var(--color-error)]">Deactivate</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!brands.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No brands found</p>}
      </div>
    </div>
  );
}
