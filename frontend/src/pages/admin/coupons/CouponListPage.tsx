import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { formatPrice } from '../../../utils/currency';
import { getErrorMessage } from '../../../utils/errors';
import type { PaginatedResult } from '../../../types/api';

const emptyForm = {
  code: '',
  discount_type: 'percentage' as 'percentage' | 'fixed',
  discount_value: '',
  activity_type: '',
  sport_id: '',
  min_order_amount: '',
  max_uses: '',
  max_uses_per_user: '1',
  starts_at: '',
  expires_at: '',
  is_active: true,
};

type CouponForm = typeof emptyForm;

interface CouponRow {
  id: number;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number | string;
  activity_type?: string | null;
  sport_id?: number | null;
  min_order_amount?: number | string | null;
  max_uses?: number | null;
  max_uses_per_user?: number | null;
  usage_count?: number;
  starts_at?: string | null;
  expires_at?: string | null;
  is_active: boolean;
}

type CouponPayload = {
  code: string;
  discount_type: string;
  discount_value: number;
  is_active: boolean;
  activity_type?: string;
  sport_id?: number;
  min_order_amount?: number;
  max_uses?: number;
  max_uses_per_user?: number;
  starts_at?: string;
  expires_at?: string;
};

export default function CouponListPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CouponForm>({ ...emptyForm });

  const { data, isLoading } = useQuery({
    queryKey: ['coupons', page],
    queryFn: () =>
      api
        .get<PaginatedResult<CouponRow>>(`/admin/coupons?page=${page}&limit=20`)
        .then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (d: CouponPayload) => api.post('/admin/coupons', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['coupons'] }); resetForm(); showToast('Coupon created!'); },
    onError: (err) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: CouponPayload & { id: number }) => api.put(`/admin/coupons/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['coupons'] }); resetForm(); showToast('Coupon updated!'); },
    onError: (err) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/coupons/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['coupons'] }); showToast('Coupon deleted!'); },
    onError: (err) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  const publishMutation = useMutation({
    mutationFn: (id: number) => api.post(`/admin/coupons/${id}/publish`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['coupons'] }); showToast('Coupon published, notifications sent!'); },
    onError: (err) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm({ ...emptyForm }); };

  const handleSubmit = () => {
    const payload: CouponPayload = {
      code: form.code,
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value),
      is_active: form.is_active,
    };
    if (form.activity_type) payload.activity_type = form.activity_type;
    if (form.sport_id) payload.sport_id = parseInt(form.sport_id, 10);
    if (form.min_order_amount) payload.min_order_amount = parseFloat(form.min_order_amount);
    if (form.max_uses) payload.max_uses = parseInt(form.max_uses, 10);
    if (form.max_uses_per_user) payload.max_uses_per_user = parseInt(form.max_uses_per_user, 10);
    if (form.starts_at) payload.starts_at = form.starts_at;
    if (form.expires_at) payload.expires_at = form.expires_at;
    if (editingId) updateMutation.mutate({ id: editingId, ...payload });
    else createMutation.mutate(payload);
  };

  const startEdit = (r: CouponRow) => {
    setEditingId(r.id); setShowForm(true);
    setForm({
      code: r.code, discount_type: r.discount_type, discount_value: String(r.discount_value),
      activity_type: r.activity_type || '', sport_id: r.sport_id ? String(r.sport_id) : '',
      min_order_amount: r.min_order_amount ? String(r.min_order_amount) : '',
      max_uses: r.max_uses ? String(r.max_uses) : '', max_uses_per_user: String(r.max_uses_per_user ?? 1),
      starts_at: r.starts_at ? r.starts_at.slice(0, 16) : '',
      expires_at: r.expires_at ? r.expires_at.slice(0, 16) : '',
      is_active: !!r.is_active,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[var(--color-text)]">Coupons</h1>
        <Can permission="coupons.create">
          <button onClick={() => { resetForm(); setShowForm(true); }} className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">+ New Coupon</button>
        </Can>
      </div>

      {showForm && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Code *</label>
              <input value={form.code} onChange={e => setForm((f) => ({ ...f, code: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Type</label>
              <select value={form.discount_type} onChange={e => setForm((f) => ({ ...f, discount_type: e.target.value as CouponForm['discount_type'] }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]">
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Value *</label>
              <input type="number" step="0.01" value={form.discount_value} onChange={e => setForm((f) => ({ ...f, discount_value: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Activity Type</label>
              <select value={form.activity_type} onChange={e => setForm((f) => ({ ...f, activity_type: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]">
                <option value="">All</option>
                <option value="booking">Booking</option>
                <option value="marketplace">Marketplace</option>
                <option value="tournament">Tournament</option>
                <option value="academy">Academy</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Sport ID</label>
              <input type="number" value={form.sport_id} onChange={e => setForm((f) => ({ ...f, sport_id: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Min Order</label>
              <input type="number" step="0.01" value={form.min_order_amount} onChange={e => setForm((f) => ({ ...f, min_order_amount: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Max Uses</label>
              <input type="number" value={form.max_uses} onChange={e => setForm((f) => ({ ...f, max_uses: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Max/User</label>
              <input type="number" value={form.max_uses_per_user} onChange={e => setForm((f) => ({ ...f, max_uses_per_user: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Starts At</label>
              <input type="datetime-local" value={form.starts_at} onChange={e => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Expires At</label>
              <input type="datetime-local" value={form.expires_at} onChange={e => setForm((f) => ({ ...f, expires_at: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer text-[var(--color-text)]">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm((f) => ({ ...f, is_active: e.target.checked }))} /> Active
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">
              {editingId ? 'Update' : 'Create'}
            </button>
            <button onClick={resetForm} className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs text-[var(--color-text-muted)]">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]">
              <th className="text-left px-3 py-2 font-medium">Code</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-right px-3 py-2 font-medium">Value</th>
              <th className="text-left px-3 py-2 font-medium">Activity</th>
              <th className="text-right px-3 py-2 font-medium">Uses</th>
              <th className="text-left px-3 py-2 font-medium">Expires</th>
              <th className="text-center px-3 py-2 font-medium">Active</th>
              <th className="text-right px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="text-center py-4 text-xs text-[var(--color-text-muted)]">Loading...</td></tr>}
            {data?.data?.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]/30 text-[var(--color-text)]">
                <td className="px-3 py-2 font-mono text-xs font-semibold">{r.code}</td>
                <td className="px-3 py-2"><span className={`text-[10px] px-1.5 py-0.5 rounded ${r.discount_type === 'percentage' ? 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]' : 'bg-purple-100 text-purple-700'}`}>{r.discount_type}</span></td>
                <td className="px-3 py-2 text-right font-mono">{r.discount_type === 'percentage' ? `${r.discount_value}%` : formatPrice(Number(r.discount_value))}</td>
                <td className="px-3 py-2 text-xs">{r.activity_type || '-'}</td>
                <td className="px-3 py-2 text-right text-xs">{r.usage_count ?? 0}{r.max_uses ? `/${r.max_uses}` : ''}</td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{r.expires_at ? r.expires_at.slice(0, 10) : '-'}</td>
                <td className="px-3 py-2 text-center"><span className={`inline-block w-2 h-2 rounded-full ${r.is_active ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'}`} /></td>
                <td className="px-3 py-2 text-right">
                  <Can permission="coupons.publish">
                    <button onClick={() => { if (confirm('Publish this coupon? Notifications will be sent to org admins.')) publishMutation.mutate(r.id); }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-success-bg)] text-[var(--color-success-text)] hover:opacity-80 mr-1">Publish</button>
                  </Can>
                  <Can permission="coupons.edit">
                    <button onClick={() => startEdit(r)} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-border)] mr-1">Edit</button>
                  </Can>
                  <Can permission="coupons.delete">
                    <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(r.id); }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)] hover:opacity-80">Delete</button>
                  </Can>
                </td>
              </tr>
            ))}
            {data?.data?.length === 0 && <tr><td colSpan={8} className="text-center py-4 text-xs text-[var(--color-text-muted)]">No coupons.</td></tr>}
          </tbody>
        </table>
      </div>

      {data && data.total > data.limit && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-xs border rounded-[var(--radius-md)] disabled:opacity-40">Prev</button>
          <span className="px-2 py-1 text-xs text-[var(--color-text-muted)]">Page {data.page} of {Math.ceil(data.total / data.limit)}</span>
          <button disabled={page >= Math.ceil(data.total / data.limit)} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs border rounded-[var(--radius-md)] disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
