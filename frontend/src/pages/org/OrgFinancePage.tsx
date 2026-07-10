import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';

const SETTLEMENT_STATUS_COLORS: Record<string, string> = {
  requested: 'bg-gray-100 text-gray-600',
  calculating: 'bg-blue-100 text-blue-700',
  pending_approval: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-indigo-100 text-indigo-700',
  paid: 'bg-green-100 text-green-700',
  completed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const DIRECTION_LABELS: Record<string, string> = {
  courtzon_to_org: 'CourtZon → Org',
  org_to_courtzon: 'Org → CourtZon',
};

function RequestSettlementModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const requestMutation = useMutation({
    mutationFn: () => api.post('/settlements/request', { organisationId: Number(orgId) }),
    onSuccess: (res: any) => {
      showToast(`Settlement #${res.data?.id || ''} requested successfully`);
      queryClient.invalidateQueries({ queryKey: ['org-settlements', orgId] });
      onClose();
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || err?.message || 'Failed to request settlement', 'error');
    },
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-bold text-[var(--color-text)]">Request Settlement</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            This will create a settlement for all delivered, unsettled orders belonging to this organisation.
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            <strong>COD orders</strong> (cash on delivery) are included immediately. <strong>Online payment orders</strong> require payment confirmation from the gateway before inclusion.
          </p>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-[var(--color-border)]">
          <button onClick={onClose} className="px-4 py-2 rounded-[var(--radius-md)] border text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            Cancel
          </button>
          <button
            onClick={() => requestMutation.mutate()}
            disabled={requestMutation.isPending}
            className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white text-sm disabled:opacity-50"
          >
            {requestMutation.isPending ? 'Requesting...' : 'Request Settlement'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettlementDetailModal({ settlement, onClose }: { settlement: any; onClose: () => void }) {
  const items = settlement?.items || [];
  const sumProductsPrice = items.reduce((s: number, i: any) => s + Number(i.products_price || 0), 0);
  const sumShippingPrice = items.reduce((s: number, i: any) => s + Number(i.shipping_price || 0), 0);
  const sumGross = items.reduce((s: number, i: any) => s + Number(i.gross_amount || 0), 0);
  const sumCourtZon = items.reduce((s: number, i: any) => s + Number(i.courtzon_fee || 0), 0);
  const orgName = settlement?.organisation_name || '-';
  const sumOrgNet = items.reduce((s: number, i: any) => s + Number(i.organization_net || 0), 0);

  const direction = settlement?.settlement_direction ? DIRECTION_LABELS[settlement.settlement_direction] || settlement.settlement_direction : '-';
  const finalAmount = Number(settlement?.final_amount || 0);

  const settlementId = settlement?.id;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] w-full max-w-5xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-bold text-[var(--color-text)]">Settlement #{settlementId} Details</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none">&times;</button>
        </div>

        {settlement && (
          <div className="grid grid-cols-3 gap-3 p-4 border-b border-[var(--color-border)]">
            <div className="text-sm"><span className="text-[var(--color-text-muted)]">Status:</span> <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SETTLEMENT_STATUS_COLORS[settlement.settlement_status] || ''}`}>{settlement.settlement_status?.replace(/_/g, ' ')}</span></div>
            <div className="text-sm"><span className="text-[var(--color-text-muted)]">Direction:</span> <span className="font-medium">{direction}</span></div>
            <div className="text-sm"><span className="text-[var(--color-text-muted)]">Final Transfer:</span> <span className="font-medium text-[var(--color-primary)]">{finalAmount.toFixed(2)}</span></div>
            <div className="text-sm"><span className="text-[var(--color-text-muted)]">Shipping:</span> <span>{Number(settlement.shipping_amount || 0).toFixed(2)}</span></div>
            <div className="text-sm"><span className="text-[var(--color-text-muted)]">COD Fees:</span> <span>{Number(settlement.cod_fee_total || 0).toFixed(2)}</span></div>
            <div className="text-sm"><span className="text-[var(--color-text-muted)]">Online Nets:</span> <span>{Number(settlement.online_net_total || 0).toFixed(2)}</span></div>
          </div>
        )}

        {!items.length ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)]">No order items in this settlement.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Order ID</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Products Price</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Shipping Price</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Gross</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">CourtZon</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Payment</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">{orgName}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => {
                  const productsPrice = Number(item.products_price || 0);
                  const shippingPrice = Number(item.shipping_price || 0);
                  const gross = Number(item.gross_amount || 0);
                  const courtzon = Number(item.courtzon_fee || 0);
                  const orgNet = Number(item.organization_net || 0);
                  const payment = item.payment_method === 'cash' ? 'COD' : (item.payment_method || '-');
                  return (
                    <tr key={item.id} className="border-b border-[var(--color-border)]">
                      <td className="px-4 py-3 text-[var(--color-text)]">#{item.order_id}</td>
                      <td className="px-4 py-3 text-right">{productsPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{shippingPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-medium">{gross.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-muted)]">{courtzon.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-muted)] capitalize">{payment}</td>
                      <td className="px-4 py-3 text-right font-medium text-[var(--color-success)]">{orgNet.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)] font-semibold">
                  <td className="px-4 py-3 text-[var(--color-text)]">Sum</td>
                  <td className="px-4 py-3 text-right">{sumProductsPrice.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">{sumShippingPrice.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">{sumGross.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-[var(--color-text-muted)]">{sumCourtZon.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">-</td>
                  <td className="px-4 py-3 text-right text-[var(--color-success)]">{sumOrgNet.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="p-4 border-t border-[var(--color-border)] text-right">
          <button onClick={onClose} className="px-4 py-2 rounded-[var(--radius-md)] border text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Close</button>
        </div>
      </div>
    </div>
  );
}

function SettlementActions({ orgId, settlement, onUpdated }: { orgId: string; settlement: any; onUpdated: () => void }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const status = settlement.settlement_status;

  const approveMut = useMutation({
    mutationFn: () => api.post(`/settlements/${settlement.id}/approve`),
    onSuccess: () => { showToast('Settlement approved'); queryClient.invalidateQueries({ queryKey: ['org-settlements', orgId] }); onUpdated(); },
    onError: (err: any) => showToast(err?.response?.data?.message || err?.message, 'error'),
  });

  const payMut = useMutation({
    mutationFn: () => api.post(`/settlements/${settlement.id}/pay`),
    onSuccess: () => { showToast('Settlement marked as paid'); queryClient.invalidateQueries({ queryKey: ['org-settlements', orgId] }); onUpdated(); },
    onError: (err: any) => showToast(err?.response?.data?.message || err?.message, 'error'),
  });

  const completeMut = useMutation({
    mutationFn: () => api.post(`/settlements/${settlement.id}/complete`),
    onSuccess: () => { showToast('Settlement completed'); queryClient.invalidateQueries({ queryKey: ['org-settlements', orgId] }); onUpdated(); },
    onError: (err: any) => showToast(err?.response?.data?.message || err?.message, 'error'),
  });

  const rejectMut = useMutation({
    mutationFn: () => {
      const reason = prompt('Rejection reason:');
      if (!reason) return Promise.reject();
      return api.post(`/settlements/${settlement.id}/reject`, { reason });
    },
    onSuccess: () => { showToast('Settlement rejected', 'warning'); queryClient.invalidateQueries({ queryKey: ['org-settlements', orgId] }); onUpdated(); },
    onError: (err: any) => { if (err) showToast(err?.response?.data?.message || err?.message, 'error'); },
  });

  const cancelMut = useMutation({
    mutationFn: () => {
      const reason = prompt('Cancel reason (optional):');
      return api.post(`/settlements/${settlement.id}/cancel`, { reason: reason || undefined });
    },
    onSuccess: () => { showToast('Settlement cancelled', 'warning'); queryClient.invalidateQueries({ queryKey: ['org-settlements', orgId] }); onUpdated(); },
    onError: (err: any) => showToast(err?.response?.data?.message || err?.message, 'error'),
  });

  const btnClass = 'px-2 py-1 text-xs rounded-[var(--radius-md)] border hover:opacity-80 disabled:opacity-40';

  const buttons: React.ReactNode[] = [];

  if (status === 'pending_approval') {
    buttons.push(
      <Can key="approve" permission="settlements.approve">
        <button onClick={() => approveMut.mutate()} disabled={approveMut.isPending} className={`${btnClass} border-green-300 bg-green-50 text-green-700`}>Approve</button>
      </Can>
    );
    buttons.push(
      <Can key="reject" permission="settlements.reject">
        <button onClick={() => rejectMut.mutate()} disabled={rejectMut.isPending} className={`${btnClass} border-red-300 bg-red-50 text-red-700`}>Reject</button>
      </Can>
    );
    buttons.push(
      <Can key="cancel" permission="settlements.cancel">
        <button onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending} className={`${btnClass} border-gray-300 bg-gray-50 text-gray-600`}>Cancel</button>
      </Can>
    );
  } else if (status === 'approved') {
    buttons.push(
      <Can key="pay" permission="settlements.pay">
        <button onClick={() => payMut.mutate()} disabled={payMut.isPending} className={`${btnClass} border-blue-300 bg-blue-50 text-blue-700`}>Mark Paid</button>
      </Can>
    );
    buttons.push(
      <Can key="cancel2" permission="settlements.cancel">
        <button onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending} className={`${btnClass} border-gray-300 bg-gray-50 text-gray-600`}>Cancel</button>
      </Can>
    );
  } else if (status === 'paid') {
    buttons.push(
      <Can key="complete" permission="settlements.complete">
        <button onClick={() => completeMut.mutate()} disabled={completeMut.isPending} className={`${btnClass} border-emerald-300 bg-emerald-50 text-emerald-700`}>Complete</button>
      </Can>
    );
  } else if (status === 'requested' || status === 'calculating') {
    buttons.push(
      <Can key="cancel3" permission="settlements.cancel">
        <button onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending} className={`${btnClass} border-gray-300 bg-gray-50 text-gray-600`}>Cancel</button>
      </Can>
    );
  }

  return buttons.length ? <div className="flex gap-1 flex-wrap">{buttons}</div> : null;
}

const TXN_TYPE_LABELS: Record<string, string> = {
  booking_payment: 'Booking Payment',
  wallet_topup: 'Wallet Top-up',
  refund: 'Refund',
  payout: 'Payout',
  marketplace_order: 'Marketplace Order',
  settlement_payout: 'Settlement Payout',
  withdrawal: 'Withdrawal',
};

export default function OrgFinancePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [tab, setTab] = useState<'transactions' | 'settlements'>('transactions');
  const [txPage, setTxPage] = useState(1);
  const [stPage, setStPage] = useState(1);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<any | null>(null);

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['org-transactions', orgId, txPage],
    queryFn: () => api.get(`/org/${orgId}/transactions`, { params: { page: txPage, limit: 20 } }).then((r) => r.data),
    enabled: !!orgId && tab === 'transactions',
  });

  const { data: stData, isLoading: stLoading } = useQuery({
    queryKey: ['org-settlements', orgId, stPage],
    queryFn: () => api.get(`/org/${orgId}/settlements`, { params: { page: stPage, limit: 20 } }).then((r) => r.data),
    enabled: !!orgId && tab === 'settlements',
  });

  // Fetch full detail when a settlement row is clicked
  const { data: settlementDetail } = useQuery({
    queryKey: ['org-settlement-detail', orgId, selectedSettlement?.id],
    queryFn: () => api.get(`/org/${orgId}/settlements/${selectedSettlement.id}`).then((r) => r.data),
    enabled: !!orgId && !!selectedSettlement?.id,
  });

  const handleRowClick = (s: any) => {
    if (selectedSettlement?.id === s.id) {
      setSelectedSettlement(null);
    } else {
      setSelectedSettlement(s);
    }
  };

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid org</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Finance</h1>
          <p className="text-sm text-[var(--color-text-muted)]">View transactions and settlements</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-[var(--color-border)]">
        <button onClick={() => { setTab('transactions'); setTxPage(1); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'transactions'
              ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}>
          Transactions
        </button>
        <button onClick={() => { setTab('settlements'); setStPage(1); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'settlements'
              ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}>
          Settlements
        </button>
      </div>

      {tab === 'transactions' && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
          {txLoading ? (
            <p className="p-6 text-sm text-[var(--color-text-muted)]">Loading transactions...</p>
          ) : !txData?.data?.length ? (
            <p className="p-6 text-sm text-[var(--color-text-muted)]">No transactions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Description</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Branch</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Payment</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Debit</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {txData.data.map((tx: any) => (
                    <tr key={tx.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                      <td className="px-4 py-3 text-[var(--color-text-muted)] whitespace-nowrap">
                        {new Date(tx.created_at || tx.txn_created_at).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="capitalize">{TXN_TYPE_LABELS[tx.txn_type] || tx.txn_type}</span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text)]">{tx.description || '-'}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{tx.branch_name || '-'}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)] capitalize">{tx.payment_method === 'cash' ? 'COD' : (tx.payment_method || '-')}</td>
                      <td className="px-4 py-3 text-right text-[var(--color-error)]">
                        {tx.side === 'debit' ? Number(tx.amount).toFixed(2) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-success)]">
                        {tx.side === 'credit' ? Number(tx.amount).toFixed(2) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {txData && txData.total > 20 && (
            <div className="flex items-center justify-center gap-2 p-4 border-t border-[var(--color-border)]">
              <button disabled={txPage <= 1} onClick={() => setTxPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-[var(--radius-md)] border text-sm disabled:opacity-40">Previous</button>
              <span className="text-sm text-[var(--color-text-muted)]">Page {txPage} of {Math.ceil(txData.total / 20)}</span>
              <button disabled={txPage >= Math.ceil(txData.total / 20)} onClick={() => setTxPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-[var(--radius-md)] border text-sm disabled:opacity-40">Next</button>
            </div>
          )}
        </div>
      )}

      {tab === 'settlements' && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
            <h3 className="text-sm font-medium text-[var(--color-text)]">Settlement History</h3>
            <Can permission="settlements.request">
              <button
                onClick={() => setShowRequestModal(true)}
                className="px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white text-sm hover:opacity-90"
              >
                + Request Settlement
              </button>
            </Can>
          </div>

          {stLoading ? (
            <p className="p-6 text-sm text-[var(--color-text-muted)]">Loading settlements...</p>
          ) : !stData?.data?.length ? (
            <p className="p-6 text-sm text-[var(--color-text-muted)]">No settlements yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">#</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Gross</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">CourtZon Fee</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Org Net</th>
                    <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Direction</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Final</th>
                    <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Orders</th>
                    <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stData.data.map((s: any) => (
                    <tr key={s.id} onClick={() => handleRowClick(s)}
                      className={`border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] cursor-pointer ${selectedSettlement?.id === s.id ? 'bg-[var(--color-bg)]' : ''}`}>
                      <td className="px-4 py-3 text-[var(--color-text)]">#{s.id}</td>
                      <td className="px-4 py-3 text-right">{Number(s.gross_amount || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-muted)]">{Number(s.courtzon_fee || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-medium">{Number(s.organization_net || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center text-xs">
                        {s.settlement_direction ? DIRECTION_LABELS[s.settlement_direction] || s.settlement_direction : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-[var(--color-primary)]">{Number(s.final_amount || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SETTLEMENT_STATUS_COLORS[s.settlement_status] || ''}`}>
                          {s.settlement_status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-muted)]">{s.order_count || s.item_count || 0}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <SettlementActions orgId={orgId} settlement={s} onUpdated={() => setSelectedSettlement(null)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {stData && stData.total > 20 && (
            <div className="flex items-center justify-center gap-2 p-4 border-t border-[var(--color-border)]">
              <button disabled={stPage <= 1} onClick={() => setStPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-[var(--radius-md)] border text-sm disabled:opacity-40">Previous</button>
              <span className="text-sm text-[var(--color-text-muted)]">Page {stPage} of {Math.ceil(stData.total / 20)}</span>
              <button disabled={stPage >= Math.ceil(stData.total / 20)} onClick={() => setStPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-[var(--radius-md)] border text-sm disabled:opacity-40">Next</button>
            </div>
          )}
        </div>
      )}

      {/* Settlement Detail Modal (fetches full detail on click) */}
      {selectedSettlement && settlementDetail && (
        <SettlementDetailModal
          settlement={settlementDetail}
          onClose={() => setSelectedSettlement(null)}
        />
      )}

      {/* Request Settlement Modal */}
      {showRequestModal && (
        <RequestSettlementModal
          orgId={orgId}
          onClose={() => setShowRequestModal(false)}
        />
      )}
    </div>
  );
}
