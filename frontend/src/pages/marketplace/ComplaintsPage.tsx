import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../components/ui/Toast';

const COMPLAINT_TYPES = [
  { value: 'defective', label: 'Defective product', ar: 'منتج معيب' },
  { value: 'damaged', label: 'Damaged on arrival', ar: 'تالف عند الاستلام' },
  { value: 'wrong_item', label: 'Wrong item received', ar: 'استلام منتج خاطئ' },
  { value: 'missing_item', label: 'Missing item/quantity', ar: 'منتج/كمية ناقصة' },
  { value: 'not_as_described', label: 'Not as described', ar: 'لا يطابق الوصف' },
  { value: 'other', label: 'Other', ar: 'أخرى' },
];

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  in_review: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  awaiting_return: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  refund_pending_approval: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  refunded: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  awaiting_confirmation: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export default function ComplaintsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ orderId: '', orderItemId: '', complaintType: 'defective', reason: '', images: [] as string[] });

  const { data, isLoading } = useQuery({
    queryKey: ['my-complaints'],
    queryFn: () => api.get('/marketplace/complaints').then((r) => r.data),
  });

  const submitComplaint = useMutation({
    mutationFn: async (payload: typeof form) => {
      // Upload images first (up to 3) then submit.
      const urls: string[] = [];
      for (const image of payload.images) {
        if (image.startsWith('data:') || image.startsWith('http')) { urls.push(image); continue; }
        const fd = new FormData();
        const blob = await fetch(image).then((r) => r.blob());
        fd.append('file', blob, `complaint-${Date.now()}.jpg`);
        const res = await api.post('/upload/complaint/0/images', fd);
        if (res.data?.url) urls.push(res.data.url);
      }
      const res = await api.post('/marketplace/complaints', {
        orderId: Number(payload.orderId),
        orderItemId: Number(payload.orderItemId),
        complaintType: payload.complaintType,
        reason: payload.reason,
        images: urls.slice(0, 3),
      });
      return res.data;
    },
    onSuccess: (complaint) => {
      showToast('Complaint submitted successfully');
      queryClient.invalidateQueries({ queryKey: ['my-complaints'] });
      queryClient.invalidateQueries({ queryKey: ['mp-orders'] });
      setShowForm(false);
      setForm({ orderId: '', orderItemId: '', complaintType: 'defective', reason: '', images: [] });
      navigate(`/marketplace/complaints/${complaint.id}`);
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to submit complaint', 'error'),
  });

  const uploads = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 3);
    const urls = files.map((f) => URL.createObjectURL(f));
    setForm((f) => ({ ...f, images: urls }));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">My Complaints</h1>
          <p className="text-xs text-[var(--color-text-muted)]">Track and manage your purchase complaints</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium">
          {showForm ? 'Cancel' : 'New Complaint'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); submitComplaint.mutate(form); }} className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-5 space-y-4">
          <h2 className="font-semibold text-[var(--color-text)]">Submit a Complaint</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm text-[var(--color-text-muted)]">
              Order ID
              <input type="number" required className="mt-1 w-full input input-bordered" value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })} placeholder="Enter order number" />
            </label>
            <label className="block text-sm text-[var(--color-text-muted)]">
              Item Number (from order)
              <input type="number" required className="mt-1 w-full input input-bordered" value={form.orderItemId} onChange={(e) => setForm({ ...form, orderItemId: e.target.value })} placeholder="Item number shown on your order" />
            </label>
          </div>
          <label className="block text-sm text-[var(--color-text-muted)]">
            Complaint Type
            <select className="mt-1 w-full input input-bordered" value={form.complaintType} onChange={(e) => setForm({ ...form, complaintType: e.target.value })}>
              {COMPLAINT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label} ({t.ar})</option>)}
            </select>
          </label>
          <label className="block text-sm text-[var(--color-text-muted)]">
            Reason (required)
            <textarea required className="mt-1 w-full input input-bordered" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Describe the issue in detail (at least 3 characters)" />
          </label>
          <div>
            <span className="text-sm text-[var(--color-text-muted)]">Photos (optional, up to 3)</span>
            <input type="file" accept="image/*" multiple className="mt-1 block w-full text-sm" onChange={uploads} />
            {form.images.length > 0 && (
              <div className="flex gap-2 mt-2">
                {form.images.map((u, i) => <img key={i} src={u} alt={`attachment ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-[var(--color-border)]" />)}
              </div>
            )}
          </div>
          <button type="submit" disabled={submitComplaint.isPending} className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50">
            {submitComplaint.isPending ? 'Submitting...' : 'Submit Complaint'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {isLoading ? <div className="text-center py-8 text-[var(--color-text-muted)]">Loading...</div> : null}
        {!isLoading && data?.data?.length === 0 && <div className="text-center py-8 text-[var(--color-text-muted)]">No complaints yet.</div>}
        {data?.data?.map((c: any) => (
          <button onClick={() => navigate(`/marketplace/complaints/${c.id}`)} key={c.id} className="w-full text-left bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--color-text)]">Complaint #{c.id} · {c.complaint_type.replace(/_/g, ' ')}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[c.status] || ''}`}>{c.status.replace(/_/g, ' ')}</span>
            </div>
            <p className="text-sm text-[var(--color-text-muted)] line-clamp-2">{c.reason}</p>
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <span>Attempt {c.attempt_number} of 2</span>
              <span>· {new Date(c.created_at).toLocaleDateString('en-GB')}</span>
              {c.refund_amount != null && <span className="text-emerald-600 dark:text-emerald-400">Refunded {c.refund_amount}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}