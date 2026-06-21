import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

interface Amenity {
  id: number;
  name_en: string;
  name_ar: string;
  icon: string;
  category: 'facilities' | 'equipment' | 'accessibility' | 'convenience' | 'services';
  sort_order: number;
  is_active: number;
}

const CATEGORIES = [
  { value: 'facilities', label: 'Facilities' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'accessibility', label: 'Accessibility' },
  { value: 'convenience', label: 'Convenience' },
  { value: 'services', label: 'Services' },
];

const ICON_MAP: Record<string, string> = {
  floodlight: '💡', parking: '🅿️', changing: '🚪', shower: '🚿', seating: '🪑',
  ac: '❄️', covered: '🏟️', cafe: '☕', drinks: '🥤', wifi: '📶',
  locker: '🔐', kids: '🧒', rental: '🔧', ballmachine: '🎾', ballpickup: '🧺',
  proshop: '🛍️', coach: '📋', video: '📹', firstaid: '🩹', wheelchair: '♿',
  floodlights: '💡',
};

function amenityEmoji(iconKey: string): string {
  return ICON_MAP[iconKey] || '✓';
}

export default function AmenitiesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Amenity | null>(null);
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [icon, setIcon] = useState('');
  const [category, setCategory] = useState('facilities');
  const [sortOrder, setSortOrder] = useState('0');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'amenities'],
    queryFn: () => api.get('/amenities').then((r: any) => r.data.data),
  });

  const amenities: Amenity[] = data || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/amenities', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'amenities'] }); resetForm(); showToast('Created successfully!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/amenities/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'amenities'] }); resetForm(); showToast('Updated successfully!'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/amenities/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'amenities'] }); setDeleteId(null); showToast('Deleted successfully!'); },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.put(`/amenities/${id}`, { isActive }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'amenities'] }); showToast('Status updated!'); },
    onError: (err: any) => { console.error('Toggle active failed', err); showToast('Failed: ' + getErrorMessage(err), 'error'); },
  });

  const resetForm = () => { setShowForm(false); setEditing(null); setNameEn(''); setNameAr(''); setIcon(''); setCategory('facilities'); setSortOrder('0'); };

  const openEdit = (a: Amenity) => {
    setEditing(a); setNameEn(a.name_en); setNameAr(a.name_ar); setIcon(a.icon || '');
    setCategory(a.category); setSortOrder(String(a.sort_order));
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameEn || !nameAr) return;
    const payload = { nameEn, nameAr, icon, category, sortOrder: parseInt(sortOrder) || 0 };
    if (editing) { updateMutation.mutate({ id: editing.id, data: payload }); }
    else { createMutation.mutate(payload); }
  };

  const filtered = amenities.filter((a: any) => {
    if (filterCategory && a.category !== filterCategory) return false;
    if (filterActive === 'active' && !a.is_active) return false;
    if (filterActive === 'inactive' && a.is_active) return false;
    return true;
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Amenities</h1>
        <Can permission="amenities.create">
          <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Amenity</Button>
        </Can>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit}
          className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit Amenity' : 'New Amenity'}</h3>
          <div className="flex items-end gap-3 flex-wrap">
            <Can permission="amenities.edit.name">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name (EN) *</label>
                <input value={nameEn} onChange={(e: any) => setNameEn(e.target.value)}
                  placeholder="Floodlights" required
                  className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[160px]" />
              </div>
            </Can>
            <Can permission="amenities.edit.name">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name (AR) *</label>
                <input value={nameAr} onChange={(e: any) => setNameAr(e.target.value)}
                  placeholder="إضاءة ليلية" required dir="rtl"
                  className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[160px]" />
              </div>
            </Can>
            <Can permission="amenities.edit.icon">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Icon</label>
                <input value={icon} onChange={(e: any) => setIcon(e.target.value)}
                  placeholder="floodlight"
                  className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-28" />
              </div>
            </Can>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Category</label>
              <select value={category} onChange={(e: any) => setCategory(e.target.value)}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                {CATEGORIES.map((c: any) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Sort Order</label>
              <input type="number" value={sortOrder} onChange={(e: any) => setSortOrder(e.target.value)}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-20" />
            </div>
            <Can permission={editing ? 'amenities.edit' : 'amenities.create'}>
              <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                {editing ? 'Update' : 'Create'}
              </Button>
            </Can>
            <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)] w-14">Icon</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name (EN)</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name (AR)</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Category</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Order</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Active</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
            </tr>
            <tr className="border-b border-[var(--color-border)]">
              <th></th>
              <th></th>
              <th></th>
              <th className="px-4 py-2">
                <select value={filterCategory} onChange={(e: any) => setFilterCategory(e.target.value)}
                  className="w-full px-2 py-1 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs">
                  <option value="">All</option>
                  {CATEGORIES.map((c: any) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </th>
              <th></th>
              <th className="px-4 py-2">
                <select value={filterActive} onChange={(e: any) => setFilterActive(e.target.value)}
                  className="w-full px-2 py-1 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs">
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map((a: any) => (
              <tr key={a.id} className={`hover:bg-[var(--color-bg)]/30 ${editing?.id === a.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-lg" title={a.icon || ''}>
                    {amenityEmoji(a.icon)}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--color-text)]">{a.name_en}</td>
                <td className="px-4 py-3 text-[var(--color-text)]" dir="rtl">{a.name_ar}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-info-bg)] text-[var(--color-info-text)]">
                    {a.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">{a.sort_order}</td>
                <td className="px-4 py-3 text-center">
                  <Can permission="amenities.edit.status">
                    <button
                      onClick={() => toggleActiveMutation.mutate({ id: a.id, isActive: !a.is_active })}
                      disabled={toggleActiveMutation.isPending}
                      className={`px-2 py-0.5 text-xs rounded-full border transition-colors cursor-pointer disabled:opacity-50 ${
                        a.is_active
                          ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)] border-[var(--color-border)] hover:opacity-80 bg-[var(--color-success-bg)] text-[var(--color-success-text)]'
                          : 'bg-[var(--color-border)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)]'
                      }`}
                      title={a.is_active ? 'Click to deactivate' : 'Click to activate'}
                    >
                      {a.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </Can>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Can permission="amenities.edit">
                      <Button variant="ghost" onClick={() => openEdit(a)}>Edit</Button>
                    </Can>
                    <Can permission="amenities.delete">
                      <Button variant="ghost" onClick={() => setDeleteId(a.id)}
                        className="text-[var(--color-error)]">Delete</Button>
                    </Can>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No amenities found</p>}
      </div>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Amenity">
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
