import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';

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

export default function SellerComplaintsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['seller-complaints'],
    queryFn: () => api.get('/marketplace/seller/complaints').then((r) => r.data),
  });

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text)]">Shop Complaints</h1>
        <p className="text-xs text-[var(--color-text-muted)]">Review and resolve purchase complaints</p>
      </div>

      <div className="space-y-3">
        {isLoading && <div className="text-center py-8 text-[var(--color-text-muted)]">Loading...</div>}
        {!isLoading && data?.data?.length === 0 && <div className="text-center py-8 text-[var(--color-text-muted)]">No complaints.</div>}
        {data?.data?.map((c: any) => (
          <button onClick={() => navigate(`/marketplace/complaints/${c.id}`)} key={c.id} className="w-full text-left bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--color-text)]">Complaint #{c.id} · {c.complaint_type.replace(/_/g, ' ')}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[c.status] || ''}`}>{c.status.replace(/_/g, ' ')}</span>
            </div>
            <p className="text-sm text-[var(--color-text-muted)] line-clamp-2">{c.reason}</p>
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <span>Order #{c.order_id} · Item #{c.order_item_id}</span>
              <span>· {new Date(c.created_at).toLocaleDateString('en-GB')}</span>
              {c.refund_amount != null && <span className="text-emerald-600 dark:text-emerald-400">{formatPrice(Number(c.refund_amount), c.order?.currency_code || 'EGP')} refunded</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}