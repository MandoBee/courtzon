import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { Pagination } from '../../../components/ui/Pagination';

interface Warehouse {
  id: number;
  name: string;
  location: string;
  status: 'active' | 'inactive' | 'archived';
  created_at: string;
}

const statusBadge = (status: string) => {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700 border-green-300',
    inactive: 'bg-amber-100 text-amber-700 border-amber-300',
    archived: 'bg-gray-100 text-gray-500 border-gray-300',
  };
  return colors[status] || 'bg-gray-100 text-gray-500';
};

export default function WarehousesPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'archived'>('active');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'warehouses', page, pageSize, search],
    queryFn: () => api.get('/admin/inventory/warehouses', { params: { page, limit: pageSize, search: search || undefined } }).then((r: any) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/admin/inventory/warehouses', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'warehouses'] }); resetForm(); showToast(t('inventory.warehouses.created')); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: any) => api.put(`/admin/inventory/warehouses/${id}`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'warehouses'] }); resetForm(); showToast(t('inventory.warehouses.updated')); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => api.put(`/admin/inventory/warehouses/${id}`, { status: 'archived' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'warehouses'] }); showToast(t('inventory.warehouses.archived')); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const resetForm = () => {
    setShowModal(false); setEditing(null); setName(''); setLocation(''); setStatus('active');
  };

  const openEdit = (w: Warehouse) => {
    setEditing(w); setName(w.name); setLocation(w.location); setStatus(w.status); setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !location) return;
    const payload = { name, location, status };
    if (editing) updateMutation.mutate({ id: editing.id, payload });
    else createMutation.mutate(payload);
  };

  if (isLoading) return <SkeletonRow count={5} />;

  const warehouses: Warehouse[] = data?.data || [];
  const total = data?.total || 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('inventory.warehouses.title')}</h1>
        <div className="flex items-center gap-3">
          <input value={search} onChange={(e: any) => { setSearch(e.target.value); setPage(1); }} placeholder={t('common.search')} className="px-3 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-bg)]" />
          <Can permission="inventory.warehouses.manage">
            <button onClick={() => { resetForm(); setShowModal(true); }} className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--radius-md)] hover:opacity-90">{t('inventory.warehouses.new')}</button>
          </Can>
        </div>
      </div>

      {showModal && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? t('inventory.warehouses.edit') : t('inventory.warehouses.new')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.warehouses.name')} *</label>
              <input value={name} onChange={(e: any) => setName(e.target.value)} required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.warehouses.location')} *</label>
              <input value={location} onChange={(e: any) => setLocation(e.target.value)} required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <Can permission="inventory.warehouses.manage">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('common.status')}</label>
                <select value={status} onChange={(e: any) => setStatus(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="active">{t('common.active')}</option>
                  <option value="inactive">{t('common.inactive')}</option>
                  <option value="archived">{t('common.archived')}</option>
                </select>
              </div>
            </Can>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--radius-md)] hover:opacity-90" disabled={createMutation.isPending || updateMutation.isPending}>
              {editing ? t('common.update') : t('common.create')}
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">{t('common.cancel')}</button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.warehouses.name')}</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.warehouses.location')}</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('common.status')}</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {warehouses.map((w: any) => (
              <tr key={w.id} className="hover:bg-[var(--color-bg)]/30">
                <td className="px-4 py-3 font-medium">{w.name}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{w.location}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 text-xs rounded-full border ${statusBadge(w.status)}`}>{w.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Can permission="inventory.warehouses.manage">
                    <button onClick={() => openEdit(w)} className="text-xs text-[var(--color-primary)] mr-3 hover:underline">{t('common.edit')}</button>
                    {w.status !== 'archived' && (
                      <button onClick={() => archiveMutation.mutate(w.id)} className="text-xs text-red-500 hover:underline">{t('common.archive')}</button>
                    )}
                  </Can>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!warehouses.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">{t('common.no_data')}</p>}
      </div>
      <div className="mt-4">
        <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      </div>
    </div>
  );
}
