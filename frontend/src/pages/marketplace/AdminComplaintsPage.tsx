import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { Can } from '../../permissions/Can';

export default function AdminComplaintsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-complaint-approvals'],
    queryFn: () => api.get('/admin/marketplace/complaints').then((r) => r.data),
  });

  return (
    <Can permission="marketplace.complaints.approve">
      <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text)]">Refund Approvals</h1>
        <p className="text-xs text-[var(--color-text-muted)]">Refunds exceeding 125% of the disputed value require approval</p>
      </div>

      <div className="space-y-3">
        {isLoading && <div className="text-center py-8 text-[var(--color-text-muted)]">Loading...</div>}
        {!isLoading && data?.data?.length === 0 && <div className="text-center py-8 text-[var(--color-text-muted)]">No pending approvals.</div>}
        {data?.data?.map((c: any) => (
          <button onClick={() => navigate(`/marketplace/complaints/${c.id}`)} key={c.id} className="w-full text-left bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--color-text)]">Complaint #{c.id} · {c.complaint_type.replace(/_/g, ' ')}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">Pending Approval</span>
            </div>
            <p className="text-sm text-[var(--color-text-muted)] line-clamp-2">{c.reason}</p>
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <span>Order #{c.order_id} · Item #{c.order_item_id} · {new Date(c.created_at).toLocaleDateString('en-GB')}</span>
            </div>
            <div className="text-sm">
              <span className="text-[var(--color-text-muted)]">Refund: </span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatPrice(Number(c.refund_amount), c.order?.currency_code || 'EGP')}</span>
              <span className="text-[var(--color-text-muted)]"> vs disputed value </span>
              <span className="font-medium">{formatPrice(Number(c.disputed_value), c.order?.currency_code || 'EGP')}</span>
              <span className="text-[var(--color-text-muted)]"> ({Number(c.refund_ratio).toFixed(2)}×)</span>
            </div>
          </button>
        ))}
      </div>
      </div>
    </Can>
  );
}