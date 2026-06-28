import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Card, Modal, Spinner, EntityImage } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { getErrorMessage } from '../../../utils/errors';
import { useCan } from '../../../hooks/useCan';
import { useTranslation } from '../../../i18n';

interface Sport {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  is_active: number;
  show_in_marketplace: number;
}

export default function SportsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Sport | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const { can } = useCan();
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'sports'],
    queryFn: () => api.get('/sports/all').then((r: any) => r.data.data),
  });

  const sports: Sport[] = data || [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/sports', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'sports'] }); resetForm(); showToast('Created successfully!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/sports/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'sports'] }); resetForm(); showToast('Updated successfully!'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/sports/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'sports'] }); setDeleteId(null); showToast('Deleted successfully!'); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.put(`/sports/${id}`, { isActive }),
    onSuccess: (_data, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sports'] });
      showToast(isActive ? 'Sport activated!' : 'Sport deactivated!');
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  });

  const marketMutation = useMutation({
    mutationFn: ({ id, showInMarketplace }: { id: number; showInMarketplace: boolean }) =>
      api.put(`/sports/${id}`, { showInMarketplace }),
    onSuccess: (_data, { showInMarketplace }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sports'] });
      showToast(showInMarketplace ? 'Sport shown in marketplace!' : 'Sport hidden from marketplace!');
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  });

  const resetForm = () => { setShowForm(false); setEditing(null); setName(''); setSlug(''); setIcon(''); setSortOrder('0'); setUploadingIcon(false); };

  const openEdit = (s: Sport) => {
    setEditing(s); setName(s.name); setSlug(s.slug); setIcon(s.icon || ''); setSortOrder(String(s.sort_order));
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug) return;
    const payload = { name, slug, icon: icon || undefined, sortOrder: parseInt(sortOrder) || 0 };
    if (editing) { updateMutation.mutate({ id: editing.id, data: payload }); }
    else { createMutation.mutate(payload); }
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/upload/sport-icon', formData);
      setIcon(res.data.iconUrl);
    } catch {
      // ignore upload errors
    } finally {
      setUploadingIcon(false);
    }
  };

  const isImageIcon = (iconVal: string | null) => iconVal && iconVal.startsWith('/uploads/');

  const renderIcon = (iconVal: string | null, sportName?: string) => {
    if (isImageIcon(iconVal)) {
      return <EntityImage src={iconVal} name={sportName || name || 'Sport'} className="w-8 h-8 rounded text-lg" />;
    }
    return <span className="text-3xl">{iconVal || '🏅'}</span>;
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('admin.sports.title')}</h1>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>+ {t('admin.sports.new_title')}</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit}
          className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? t('admin.sports.edit_title', { name }) : t('admin.sports.new_title')}</h3>
          <div className="flex items-center gap-3 flex-nowrap">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
              <Can permission="sports.edit.name">
                <input value={name} onChange={(e: any) => { const s = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, ''); setName(e.target.value); setSlug(s); }}
                  placeholder={t('admin.sports.name_placeholder')} required
                  className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-44" />
              </Can>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('admin.sports.icon')}</label>
              <div className="flex items-center gap-2">
                {isImageIcon(icon) && (
                  <EntityImage src={icon} name={name || 'Sport'} className="w-8 h-8 rounded border flex-shrink-0 text-lg" />
                )}
                <Can permission="sports.edit.icon">
                  <input value={icon} onChange={(e: any) => setIcon(e.target.value)}
                    placeholder={t('admin.sports.icon_placeholder')} maxLength={100}
                    className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-36" />
                </Can>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleIconUpload}
                  className="hidden" />
                <Button type="button" variant="ghost" loading={uploadingIcon}
                  onClick={() => fileInputRef.current?.click()}>
                  Upload
                </Button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Sort Order</label>
              <input type="number" value={sortOrder} onChange={(e: any) => setSortOrder(e.target.value)}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-20" />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Can permission={editing ? 'sports.edit' : 'sports.create'}>
                <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                  {editing ? 'Update' : 'Create'}
                </Button>
              </Can>
              <Button type="button" variant="ghost" onClick={resetForm}>{t('common.cancel')}</Button>
            </div>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sports.map((s: any) => (
          <div key={s.id}
            className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 border border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {renderIcon(s.icon, s.name)}
                <div>
                  <h3 className="font-semibold text-[var(--color-text)]">{s.name}</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">{s.slug}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {can('sports.edit.status') ? (
                  <button
                    type="button"
                    onClick={() => toggleMutation.mutate({ id: s.id, isActive: !s.is_active })}
                    disabled={toggleMutation.isPending}
                    title={s.is_active ? 'Click to deactivate' : 'Click to activate'}
                    className={`px-2 py-0.5 text-xs font-medium rounded-full transition-opacity hover:opacity-80 disabled:opacity-50 ${
                      s.is_active
                        ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'
                        : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                    }`}
                  >
                    {s.is_active ? 'Active' : 'Inactive'}
                  </button>
                ) : (
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full ${
                      s.is_active
                        ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'
                        : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                    }`}
                  >
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => marketMutation.mutate({ id: s.id, showInMarketplace: !s.show_in_marketplace })}
                  disabled={marketMutation.isPending}
                  title={s.show_in_marketplace ? 'Click to hide from marketplace' : 'Click to show in marketplace'}
                  className={`px-2 py-0.5 text-xs font-medium rounded-full transition-opacity hover:opacity-80 disabled:opacity-50 ${
                    s.show_in_marketplace
                      ? 'bg-[var(--color-primary-bg)] text-[var(--color-primary)]'
                      : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                  }`}
                >
                  {s.show_in_marketplace ? 'Market' : 'Market'}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-muted)]">Sort: {s.sort_order}</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" onClick={() => openEdit(s)}>{t('common.edit')}</Button>
                <Button variant="ghost" onClick={() => setDeleteId(s.id)}
                  className="text-[var(--color-error)]">{t('common.delete')}</Button>
              </div>
            </div>
          </div>
        ))}
        {!sports.length && (
          <div className="col-span-full">
            <Card>
              <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No sports found</p>
            </Card>
          </div>
        )}
      </div>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title={t('admin.sports.delete_title')}>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">Are you sure? This cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Button>
          <Can permission="sports.delete">
            <Button onClick={() => deleteMutation.mutate(deleteId!)} loading={deleteMutation.isPending}
              className="bg-[var(--color-error)] text-white">{t('common.delete')}</Button>
          </Can>
        </div>
      </Modal>
    </div>
  );
}
