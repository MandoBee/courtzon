import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { Pagination } from '../../../components/ui/Pagination';

interface Supplier {
  id: number;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  payment_terms: string;
  lead_time_days: number;
  status: 'active' | 'inactive';
  created_at: string;
}

export default function SuppliersPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'suppliers', page, pageSize, search],
    queryFn: () => api.get('/admin/inventory/suppliers', { params: { page, limit: pageSize, search: search || undefined } }).then((r: any) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/admin/inventory/suppliers', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] }); resetForm(); showToast(t('inventory.suppliers.created')); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: any) => api.put(`/admin/inventory/suppliers/${id}`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] }); resetForm(); showToast(t('inventory.suppliers.updated')); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const resetForm = () => {
    setShowModal(false); setEditing(null); setName(''); setContactPerson(''); setEmail(''); setPhone('');
    setPaymentTerms(''); setLeadTimeDays(''); setStatus('active');
  };

  const openEdit = (s: Supplier) => {
    setEditing(s); setName(s.name); setContactPerson(s.contact_person || ''); setEmail(s.email || '');
    setPhone(s.phone || ''); setPaymentTerms(s.payment_terms || ''); setLeadTimeDays(String(s.lead_time_days || '')); setStatus(s.status); setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    const payload = { name, contact_person: contactPerson || undefined, email: email || undefined, phone: phone || undefined, payment_terms: paymentTerms || undefined, lead_time_days: leadTimeDays ? parseInt(leadTimeDays) : undefined, status };
    if (editing) updateMutation.mutate({ id: editing.id, payload });
    else createMutation.mutate(payload);
  };

  if (isLoading) return <SkeletonRow count={5} />;

  const suppliers: Supplier[] = data?.data || [];
  const total = data?.total || 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('inventory.suppliers.title')}</h1>
        <div className="flex items-center gap-3">
          <input value={search} onChange={(e: any) => { setSearch(e.target.value); setPage(1); }} placeholder={t('common.search')} className="px-3 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-bg)]" />
          <Can permission="inventory.suppliers.manage">
            <button onClick={() => { resetForm(); setShowModal(true); }} className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--radius-md)] hover:opacity-90">{t('inventory.suppliers.new')}</button>
          </Can>
        </div>
      </div>

      {showModal && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? t('inventory.suppliers.edit') : t('inventory.suppliers.new')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.suppliers.name')} *</label>
              <input value={name} onChange={(e: any) => setName(e.target.value)} required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.suppliers.contact_person')}</label>
              <input value={contactPerson} onChange={(e: any) => setContactPerson(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.suppliers.email')}</label>
              <input type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.suppliers.phone')}</label>
              <input value={phone} onChange={(e: any) => setPhone(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.suppliers.payment_terms')}</label>
              <input value={paymentTerms} onChange={(e: any) => setPaymentTerms(e.target.value)} placeholder="e.g. Net 30" className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.suppliers.lead_time')}</label>
              <input type="number" value={leadTimeDays} onChange={(e: any) => setLeadTimeDays(e.target.value)} placeholder={t('inventory.suppliers.lead_time_days')} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('common.status')}</label>
              <select value={status} onChange={(e: any) => setStatus(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value="active">{t('common.active')}</option>
                <option value="inactive">{t('common.inactive')}</option>
              </select>
            </div>
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
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.suppliers.name')}</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.suppliers.contact_person')}</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.suppliers.email')}</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.suppliers.phone')}</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.suppliers.payment_terms')}</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.suppliers.lead_time')}</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('common.status')}</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {suppliers.map((s: any) => (
              <tr key={s.id} className="hover:bg-[var(--color-bg)]/30">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{s.contact_person || '—'}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{s.email || '—'}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{s.phone || '—'}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{s.payment_terms || '—'}</td>
                <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">{s.lead_time_days ? `${s.lead_time_days}d` : '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 text-xs rounded-full border ${s.status === 'active' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-500 border-gray-300'}`}>{s.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Can permission="inventory.suppliers.manage">
                    <button onClick={() => openEdit(s)} className="text-xs text-[var(--color-primary)] hover:underline">{t('common.edit')}</button>
                  </Can>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!suppliers.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">{t('common.no_data')}</p>}
      </div>
      <div className="mt-4">
        <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      </div>
    </div>
  );
}
