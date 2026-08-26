import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { useCan } from '../../hooks/useCan';
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

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_review: 'Under Review',
  awaiting_return: 'Awaiting Return',
  refund_pending_approval: 'Refund Pending Approval',
  refunded: 'Refunded',
  awaiting_confirmation: 'Awaiting Confirmation',
  resolved: 'Resolved',
  rejected: 'Rejected',
};

const TYPE_LABEL: Record<string, string> = {
  defective: 'Defective product', damaged: 'Damaged on arrival', wrong_item: 'Wrong item received',
  missing_item: 'Missing item/quantity', not_as_described: 'Not as described', other: 'Other',
};

export default function ComplaintDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { can } = useCan();

  const { data: complaint, isLoading } = useQuery({
    queryKey: ['complaint', id],
    queryFn: () => api.get(`/marketplace/complaints/${id}`).then((r) => r.data),
  });

  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['complaint', id] });
    queryClient.invalidateQueries({ queryKey: ['my-complaints'] });
  };

  const review = useMutation({
    mutationFn: () => api.post(`/marketplace/seller/complaints/${id}/review`, {}),
    onSuccess: () => { showToast('Complaint moved to review'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed', 'error'),
  });

  const resolveRefund = useMutation({
    mutationFn: () =>
      api.post(`/marketplace/seller/complaints/${id}/resolve`, {
        resolutionType: 'refund', refundAmount: Number(refundAmount), refundReason: refundReason || undefined,
      }),
    onSuccess: (c: any) => {
      if (c.status === 'refund_pending_approval') showToast('Refund sent for admin approval');
      else if (c.status === 'refunded') showToast('Refund executed and credited to buyer wallet');
      invalidate();
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to process refund', 'error'),
  });

  const resolveReplace = useMutation({
    mutationFn: () => api.post(`/marketplace/seller/complaints/${id}/resolve`, { resolutionType: 'replacement' }),
    onSuccess: () => { showToast('Replacement resolution started'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed', 'error'),
  });

  const resolveReship = useMutation({
    mutationFn: () => api.post(`/marketplace/seller/complaints/${id}/resolve`, { resolutionType: 'reshipment' }),
    onSuccess: () => { showToast('Reshipment resolution started'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed', 'error'),
  });

  const rejectComplaint = useMutation({
    mutationFn: () => api.post(`/marketplace/seller/complaints/${id}/reject`, { reason: rejectionReason }),
    onSuccess: () => { showToast('Complaint rejected'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to reject', 'error'),
  });

  const collect = useMutation({
    mutationFn: (status: 'collected' | 'inspected') => api.post(`/marketplace/seller/complaints/${id}/collect`, { status }),
    onSuccess: () => { showToast('Return collection recorded'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to record collection', 'error'),
  });

  const ship = useMutation({
    mutationFn: (kind: 'replacement' | 'reshipment') => api.post(`/marketplace/seller/complaints/${id}/ship/${kind}`, {}),
    onSuccess: () => { showToast('Shipment recorded — awaiting player confirmation'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to record shipment', 'error'),
  });

  const confirmReceipt = useMutation({
    mutationFn: () => api.post(`/marketplace/complaints/${id}/confirm-receipt`),
    onSuccess: () => { showToast('Receipt confirmed — complaint resolved'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to confirm receipt', 'error'),
  });

  const approve = useMutation({
    mutationFn: () => api.post(`/admin/marketplace/complaints/${id}/approve`, {}),
    onSuccess: () => { showToast('Refund approved and executed'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to approve refund', 'error'),
  });

  const rejectApproval = useMutation({
    mutationFn: () => api.post(`/admin/marketplace/complaints/${id}/reject`, { reason: rejectionReason }),
    onSuccess: () => { showToast('Approval rejected'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to reject approval', 'error'),
  });

  if (isLoading) return <div className="text-center py-8 text-[var(--color-text-muted)]">Loading...</div>;
  if (!complaint) return <div className="text-center py-8 text-[var(--color-text-muted)]">Complaint not found</div>;

  const isBuyer = complaint.buyer_id === complaint.viewerId;

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24 md:pb-6 space-y-4">
      <button onClick={() => navigate(-1)} className="text-sm text-[var(--color-primary)]">← Back</button>

      <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">Complaint #{complaint.id}</h1>
            <p className="text-xs text-[var(--color-text-muted)]">Submitted {new Date(complaint.created_at).toLocaleString('en-GB')} · Attempt {complaint.attempt_number} of 2</p>
          </div>
          <span className={`text-sm px-3 py-1 rounded-full ${STATUS_BADGE[complaint.status] || ''}`}>{STATUS_LABEL[complaint.status] || complaint.status.replace(/_/g, ' ')}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm border-t pt-4">
          <div><span className="text-[var(--color-text-muted)]">Order:</span> <Link className="text-[var(--color-primary)]" to={`/marketplace/orders/${complaint.order_id}`}>#{complaint.order_id}</Link></div>
          <div><span className="text-[var(--color-text-muted)]">Item:</span> #{complaint.order_item_id}</div>
          <div><span className="text-[var(--color-text-muted)]">Type:</span> {TYPE_LABEL[complaint.complaint_type] || complaint.complaint_type}</div>
          <div><span className="text-[var(--color-text-muted)]">Disputed value:</span> {formatPrice(Number(complaint.disputed_value), complaint.order?.currency_code || 'EGP')}</div>
          {complaint.refund_amount != null && (
            <div><span className="text-[var(--color-text-muted)]">Refund amount:</span> <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatPrice(Number(complaint.refund_amount), complaint.order?.currency_code || 'EGP')}</span></div>
          )}
          {complaint.refund_ratio != null && (
            <div><span className="text-[var(--color-text-muted)]">Ratio vs disputed value:</span> {Number(complaint.refund_ratio).toFixed(2)}×</div>
          )}
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-medium mb-1">Reason</p>
          <p className="text-sm text-[var(--color-text)] bg-[var(--color-surface-alt)] rounded-lg p-3">{complaint.reason}</p>
        </div>

        {isBuyer && complaint.status === 'refunded' && (
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Refund Result</p>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Refunded amount</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">{formatPrice(Number(complaint.refund_amount), complaint.order?.currency_code || 'EGP')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Status</span>
                <span className="font-medium capitalize">{STATUS_LABEL[complaint.status] || complaint.status}</span>
              </div>
              {complaint.resolved_at && (
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Date</span>
                  <span className="font-medium">{new Date(complaint.resolved_at).toLocaleDateString('en-GB')}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">Paid to</span>
                <span className="font-medium">Your wallet</span>
              </div>
            </div>
          </div>
        )}

        {complaint.images?.length > 0 && (
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Attachments</p>
            <div className="flex gap-2">
              {complaint.images.map((img: string, i: number) => (
                <a key={i} href={img} target="_blank" rel="noreferrer"><img src={img} alt={`attachment ${i + 1}`} className="w-24 h-24 object-cover rounded-lg border border-[var(--color-border)]" /></a>
              ))}
            </div>
          </div>
        )}

        {complaint.collection_status !== 'not_required' && complaint.collection_status !== '' && (
          <div className="border-t pt-4 text-sm">
            <span className="text-[var(--color-text-muted)]">Return collection: </span>
            <span className="capitalize">{complaint.collection_status.replace(/_/g, ' ')}</span>
            {complaint.collection_due_at && <span className="text-xs text-[var(--color-text-muted)]"> due {new Date(complaint.collection_due_at).toLocaleDateString('en-GB')}</span>}
          </div>
        )}

        {complaint.receipt_awaited && complaint.receipt_due_at && (
          <div className="border-t pt-4 text-sm">
            <span className="text-[var(--color-text-muted)]">Receipt confirmation due by: </span>
            <span className="font-medium">{new Date(complaint.receipt_due_at).toLocaleDateString('en-GB')}</span>
          </div>
        )}

        {complaint.approval_status === 'pending' && (
          <div className="border-t pt-4 flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-muted)]">Awaiting CourtZon admin approval for refund of {formatPrice(Number(complaint.refund_amount), complaint.order?.currency_code || 'EGP')}</span>
          </div>
        )}

        {/* Actions */}
        <div className="border-t pt-4 space-y-3">
          {!isBuyer && complaint.status === 'pending' && (
            <button onClick={() => review.mutate()} disabled={review.isPending} className="w-full px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50">Review Complaint</button>
          )}

          {!isBuyer && ['pending', 'in_review'].includes(complaint.status) && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => resolveReplace.mutate()} disabled={resolveReplace.isPending} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">Replace Product</button>
                <button onClick={() => resolveReship.mutate()} disabled={resolveReship.isPending} className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium disabled:opacity-50">Reship Product</button>
              </div>
              <div className="space-y-2 border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-sm font-medium">Refund Buyer</p>
                <input type="number" min="0" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="input input-bordered w-full" placeholder="Refund amount" />
                {Number(refundAmount) > Number(complaint.disputed_value) && (
                  <input type="text" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} className="input input-bordered w-full" placeholder="Reason for refund above the original value (required)" />
                )}
                <button onClick={() => resolveRefund.mutate()} disabled={resolveRefund.isPending} className="w-full px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50">
                  {resolveRefund.isPending ? 'Processing...' : 'Execute Refund'}
                </button>
              </div>
            </div>
          )}

          {!isBuyer && complaint.status === 'awaiting_return' && complaint.resolution_type === 'refund' && (
            <div className="space-y-2 border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-sm font-medium">Return Collection</p>
              <div className="flex gap-2">
                <button onClick={() => collect.mutate('collected')} disabled={collect.isPending} className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium disabled:opacity-50">Mark Collected</button>
                <button onClick={() => collect.mutate('inspected')} disabled={collect.isPending} className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium disabled:opacity-50">Collected & Inspected</button>
              </div>
              {complaint.collection_status === 'collected' && (
                <div className="flex gap-2">
                  <input type="number" min="0" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="input input-bordered w-full" placeholder="Refund amount" />
                  {Number(refundAmount) > Number(complaint.disputed_value) && (
                    <input type="text" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} className="input input-bordered w-full" placeholder="Reason for refund above original value (required)" />
                  )}
                  <button onClick={() => resolveRefund.mutate()} disabled={resolveRefund.isPending} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50">Execute Refund</button>
                </div>
              )}
            </div>
          )}

          {!isBuyer && complaint.collection_status === 'collected' && complaint.status === 'awaiting_return' && complaint.resolution_type !== 'refund' && (
            <div className="flex gap-2">
              <button onClick={() => ship.mutate('replacement')} disabled={ship.isPending} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">Record Replacement Sent</button>
              <button onClick={() => ship.mutate('reshipment')} disabled={ship.isPending} className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium disabled:opacity-50">Record Reshipment Sent</button>
            </div>
          )}

          {isBuyer && complaint.status === 'awaiting_confirmation' && !complaint.receipt_confirmed_at && (
            <button onClick={() => confirmReceipt.mutate()} disabled={confirmReceipt.isPending} className="w-full px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50">
              Confirm Receipt of {complaint.resolution_type}
            </button>
          )}

          {!isBuyer && ['pending', 'in_review', 'awaiting_return', 'refund_pending_approval'].includes(complaint.status) && (
            <div className="flex gap-2">
              <input type="text" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className="input input-bordered w-full" placeholder="Rejection reason (required)" />
              <button onClick={() => rejectComplaint.mutate()} disabled={rejectComplaint.isPending} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50">Reject Complaint</button>
            </div>
          )}

          {can('marketplace.complaints.approve') && complaint.status === 'refund_pending_approval' && complaint.approval_status === 'pending' && (
            <div className="space-y-2 border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-sm font-medium">CourtZon Admin Approval Required</p>
              <p className="text-sm text-[var(--color-text-muted)]">Refund of {formatPrice(Number(complaint.refund_amount), complaint.order?.currency_code || 'EGP')} exceeds 125% of the disputed value ({Number(complaint.refund_ratio).toFixed(2)}×).</p>
              <input type="text" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className="input input-bordered w-full" placeholder="Approval/decision note (optional)" />
              <div className="flex gap-2">
                <button onClick={() => approve.mutate()} disabled={approve.isPending} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50">Approve Refund</button>
                <button onClick={() => rejectApproval.mutate()} disabled={rejectApproval.isPending} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50">Reject Approval</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}