import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';

const TXN_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'booking_payment', label: 'Booking Payment' },
  { value: 'marketplace_order', label: 'Marketplace Order' },
  { value: 'settlement_payout', label: 'Settlement Payout' },
  { value: 'wallet_topup', label: 'Wallet Top-up' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'refund', label: 'Refund' },
  { value: 'payout', label: 'Payout' },
];

const SETTLEMENT_STATUS_FILTERS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

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

const TXN_TYPE_LABELS: Record<string, string> = {
  booking_payment: 'Booking Payment',
  wallet_topup: 'Wallet Top-up',
  refund: 'Refund',
  payout: 'Payout',
  marketplace_order: 'Marketplace Order',
  settlement_payout: 'Settlement Payout',
  withdrawal: 'Withdrawal',
};

const DIRECTION_LABELS: Record<string, string> = {
  courtzon_to_org: 'CourtZon \u2192 Org',
  org_to_courtzon: 'Org \u2192 CourtZon',
};

function formatPrice(v: any) {
  return Number(v || 0).toFixed(2);
}

// ── Settlement Detail Modal ──
function SettlementDetailModal({ settlementId, onClose }: { settlementId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['settlement-detail', settlementId],
    queryFn: () => api.get(`/settlements/${settlementId}`).then(r => r.data),
  });

  const items = data?.orders || [];
  const sumProducts = items.reduce((s: number, i: any) => s + Number(i.products_price || 0), 0);
  const sumShipping = items.reduce((s: number, i: any) => s + Number(i.shipping_price || 0), 0);
  const sumGross = items.reduce((s: number, i: any) => s + Number(i.gross_amount || 0), 0);
  const sumFee = items.reduce((s: number, i: any) => s + Number(i.courtzon_fee || 0), 0);
  const sumNet = items.reduce((s: number, i: any) => s + Number(i.organization_net || 0), 0);
  const orgName = data?.organisation_name || '-';
  const direction = data?.settlement_direction ? DIRECTION_LABELS[data.settlement_direction] || data.settlement_direction : '-';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] w-full max-w-5xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-bold text-[var(--color-text)]">Settlement #{settlementId} &mdash; {orgName}</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none">&times;</button>
        </div>

        {data && (
          <div className="grid grid-cols-4 gap-3 p-4 border-b border-[var(--color-border)]">
            <div className="text-sm"><span className="text-[var(--color-text-muted)]">Status:</span> <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SETTLEMENT_STATUS_COLORS[data.settlement_status] || ''}`}>{data.settlement_status?.replace(/_/g, ' ')}</span></div>
            <div className="text-sm"><span className="text-[var(--color-text-muted)]">Direction:</span> <span className="font-medium">{direction}</span></div>
            <div className="text-sm"><span className="text-[var(--color-text-muted)]">Final Transfer:</span> <span className="font-medium text-[var(--color-primary)]">{formatPrice(data.final_amount)}</span></div>
            <div className="text-sm"><span className="text-[var(--color-text-muted)]">Gross:</span> <span>{formatPrice(data.gross_amount)}</span></div>
            <div className="text-sm"><span className="text-[var(--color-text-muted)]">Shipping:</span> <span>{formatPrice(data.shipping_amount)}</span></div>
            <div className="text-sm"><span className="text-[var(--color-text-muted)]">CourtZon Fee:</span> <span>{formatPrice(data.courtzon_fee)}</span></div>
            <div className="text-sm"><span className="text-[var(--color-text-muted)]">COD Fees:</span> <span>{formatPrice(data.cod_fee_total)}</span></div>
            <div className="text-sm"><span className="text-[var(--color-text-muted)]">Online Nets:</span> <span>{formatPrice(data.online_net_total)}</span></div>
          </div>
        )}

        {isLoading ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)]">Loading...</p>
        ) : !items.length ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)]">No order items.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Order ID</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Products</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Shipping</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Gross</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">CourtZon</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Payment</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">{orgName}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => {
                  const p = formatPrice(item.products_price);
                  const sh = formatPrice(item.shipping_price);
                  const g = formatPrice(item.gross_amount);
                  const cz = formatPrice(item.courtzon_fee);
                  const on = formatPrice(item.organization_net);
                  return (
                    <tr key={item.id} className="border-b border-[var(--color-border)]">
                      <td className="px-4 py-3 text-[var(--color-text)]">#{item.order_id}</td>
                      <td className="px-4 py-3 text-right">{p}</td>
                      <td className="px-4 py-3 text-right">{sh}</td>
                      <td className="px-4 py-3 text-right font-medium">{g}</td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-muted)]">{cz}</td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-muted)] capitalize">{item.payment_method === 'cash' ? 'COD' : (item.payment_method || '-')}</td>
                      <td className="px-4 py-3 text-right font-medium text-[var(--color-success)]">{on}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)] font-semibold">
                  <td className="px-4 py-3">Sum</td>
                  <td className="px-4 py-3 text-right">{formatPrice(sumProducts)}</td>
                  <td className="px-4 py-3 text-right">{formatPrice(sumShipping)}</td>
                  <td className="px-4 py-3 text-right">{formatPrice(sumGross)}</td>
                  <td className="px-4 py-3 text-right">{formatPrice(sumFee)}</td>
                  <td className="px-4 py-3 text-right">-</td>
                  <td className="px-4 py-3 text-right text-[var(--color-success)]">{formatPrice(sumNet)}</td>
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

// ── Settlement Actions ──
function SettlementActions({ settlement, onUpdated }: { settlement: any; onUpdated: () => void }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const status = settlement.settlement_status;
  const id = settlement.id;

  const mkMut = (endpoint: string, okMsg: string, okType?: 'success' | 'warning') =>
    useMutation({
      mutationFn: (body?: any) => api.post(`/settlements/${id}/${endpoint}`, body || {}),
      onSuccess: () => { showToast(okMsg, okType); queryClient.invalidateQueries({ queryKey: ['admin-settlements'] }); onUpdated(); },
      onError: (err: any) => showToast(err?.response?.data?.message || err?.message, 'error'),
    });

  const approveMut = mkMut('approve', 'Settlement approved');
  const payMut = mkMut('pay', 'Settlement marked as paid');
  const completeMut = mkMut('complete', 'Settlement completed');
  const rejectMut = mkMut('reject', 'Settlement rejected', 'warning');
  const cancelMut = mkMut('cancel', 'Settlement cancelled', 'warning');

  const btn = (label: string, mut: any, color: string) => (
    <button key={label} onClick={() => {
      if (label === 'Reject') { const r = prompt('Rejection reason:'); if (!r) return; mut.mutate({ reason: r }); return; }
      if (label === 'Cancel') { const r = prompt('Cancel reason (optional):'); mut.mutate({ reason: r || undefined }); return; }
      mut.mutate();
    }} disabled={mut.isPending}
    className={`px-2 py-1 text-xs rounded-[var(--radius-md)] border hover:opacity-80 disabled:opacity-40 ${color}`}>
      {label}
    </button>
  );

  const buttons: React.ReactNode[] = [];
  if (status === 'pending_approval') {
    buttons.push(<Can key="a" permission="settlements.approve">{btn('Approve', approveMut, 'border-green-300 bg-green-50 text-green-700')}</Can>);
    buttons.push(<Can key="r" permission="settlements.reject">{btn('Reject', rejectMut, 'border-red-300 bg-red-50 text-red-700')}</Can>);
    buttons.push(<Can key="c" permission="settlements.cancel">{btn('Cancel', cancelMut, 'border-gray-300 bg-gray-50 text-gray-600')}</Can>);
  } else if (status === 'approved') {
    buttons.push(<Can key="p" permission="settlements.pay">{btn('Mark Paid', payMut, 'border-blue-300 bg-blue-50 text-blue-700')}</Can>);
    buttons.push(<Can key="c2" permission="settlements.cancel">{btn('Cancel', cancelMut, 'border-gray-300 bg-gray-50 text-gray-600')}</Can>);
  } else if (status === 'paid') {
    buttons.push(<Can key="co" permission="settlements.complete">{btn('Complete', completeMut, 'border-emerald-300 bg-emerald-50 text-emerald-700')}</Can>);
  } else if (status === 'requested' || status === 'calculating') {
    buttons.push(<Can key="c3" permission="settlements.cancel">{btn('Cancel', cancelMut, 'border-gray-300 bg-gray-50 text-gray-600')}</Can>);
  }
  return buttons.length ? <div className="flex gap-1 flex-wrap">{buttons}</div> : null;
}

// ── Shared Org Dropdown ──
function OrgDropdown({ orgId, onChange }: { orgId: string; onChange: (id: string) => void }) {
  const { data } = useQuery({
    queryKey: ['admin-organisations'],
    queryFn: () => api.get('/admin/organisations').then(r => r.data || []),
    staleTime: 60000,
  });
  const orgs = data || [];
  return (
    <select value={orgId} onChange={e => onChange(e.target.value)}
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text)] min-w-[180px]">
      <option value="">All Organisations</option>
      {orgs.map((o: any) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
    </select>
  );
}

// ── Shared Branch Dropdown (depends on org) ──
function BranchDropdown({ orgId, branchId, onChange }: { orgId: string; branchId: string; onChange: (id: string) => void }) {
  const { data } = useQuery({
    queryKey: ['org-branches', orgId],
    queryFn: () => api.get(`/organisations/${orgId}/branches`).then(r => r.data?.data || r.data || []),
    enabled: !!orgId,
  });
  const branches = Array.isArray(data) ? data : [];
  if (!orgId) return null;
  return (
    <select value={branchId} onChange={e => onChange(e.target.value)}
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text)] min-w-[160px]">
      <option value="">All Branches</option>
      {branches.map((b: any) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
    </select>
  );
}

// ── Transactions Tab ──
function TransactionsTab() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [orgId, setOrgId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [settlementFilter, setSettlementFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');

  const params: Record<string, any> = { page, limit: 20 };
  if (typeFilter) params.type = typeFilter;
  if (orgId) params.orgId = orgId;
  if (branchId) params.branchId = branchId;
  if (settlementFilter) params.settlementStatus = settlementFilter;
  if (fromFilter) params.from = fromFilter;
  if (toFilter) params.to = toFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-transactions', params],
    queryFn: () => api.get('/admin/transactions', { params }).then(r => r.data),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-xs"><span className="text-[var(--color-text-muted)]">Type</span>
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
            className="ml-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text)]">
            {TXN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="text-xs"><span className="text-[var(--color-text-muted)]">Organisation</span>
          <OrgDropdown orgId={orgId} onChange={v => { setOrgId(v); setBranchId(''); setPage(1); }} />
        </label>
        {orgId && (
          <label className="text-xs"><span className="text-[var(--color-text-muted)]">Branch</span>
            <BranchDropdown orgId={orgId} branchId={branchId} onChange={v => { setBranchId(v); setPage(1); }} />
          </label>
        )}
        <label className="text-xs"><span className="text-[var(--color-text-muted)]">Settlement</span>
          <select value={settlementFilter} onChange={e => { setSettlementFilter(e.target.value); setPage(1); }}
            className="ml-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text)]">
            <option value="">All</option>
            <option value="settled">Settled</option>
            <option value="unsettled">Unsettled</option>
          </select>
        </label>
        <label className="text-xs"><span className="text-[var(--color-text-muted)]">From</span>
          <input type="date" value={fromFilter} onChange={e => { setFromFilter(e.target.value); setPage(1); }}
            className="ml-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text)]" />
        </label>
        <label className="text-xs"><span className="text-[var(--color-text-muted)]">To</span>
          <input type="date" value={toFilter} onChange={e => { setToFilter(e.target.value); setPage(1); }}
            className="ml-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text)]" />
        </label>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)]">Loading transactions...</p>
        ) : !data?.data?.length ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)]">No transactions found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Txn #</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Org</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Account</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Payment</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Debit</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Credit</th>
                  <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((tx: any) => (
                  <tr key={tx.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                    <td className="px-4 py-3 text-[var(--color-text)] font-mono text-xs">#{tx.transaction_id}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] whitespace-nowrap">{new Date(tx.txn_created_at).toLocaleDateString('en-GB')}</td>
                    <td className="px-4 py-3"><span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-text)]">{TXN_TYPE_LABELS[tx.txn_type] || tx.txn_type}</span></td>
                    <td className="px-4 py-3 text-[var(--color-text)]">{tx.org_name || '-'}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] capitalize">{tx.entity_type?.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-[var(--color-text)] max-w-[240px] truncate">{tx.description || '-'}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] capitalize">{tx.payment_method === 'cash' ? 'COD' : (tx.payment_method || '-')}</td>
                    <td className="px-4 py-3 text-right text-[var(--color-error)] font-medium">{tx.side === 'debit' ? formatPrice(tx.amount) : '-'}</td>
                    <td className="px-4 py-3 text-right text-[var(--color-success)] font-medium">{tx.side === 'credit' ? formatPrice(tx.amount) : '-'}</td>
                    <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tx.txn_status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{tx.txn_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 20 && (
          <div className="flex items-center justify-center gap-3 p-4 border-t border-[var(--color-border)]">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-[var(--radius-md)] border text-sm disabled:opacity-40">Previous</button>
            <span className="text-sm text-[var(--color-text-muted)]">Page {page} of {Math.ceil(data.total / 20)}</span>
            <button disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-[var(--radius-md)] border text-sm disabled:opacity-40">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Settlements Tab ──
function SettlementsTab() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [orgId, setOrgId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [detailId, setDetailId] = useState<number | null>(null);

  const params: Record<string, any> = { page, limit: 20 };
  if (statusFilter) params.status = statusFilter;
  if (orgId) params.orgId = orgId;
  if (branchId) params.branchId = branchId;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-settlements', params],
    queryFn: () => api.get('/settlements', { params }).then(r => r.data),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-xs"><span className="text-[var(--color-text-muted)]">Status</span>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="ml-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 py-1.5 text-sm bg-[var(--color-surface)] text-[var(--color-text)]">
            {SETTLEMENT_STATUS_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="text-xs"><span className="text-[var(--color-text-muted)]">Organisation</span>
          <OrgDropdown orgId={orgId} onChange={v => { setOrgId(v); setBranchId(''); setPage(1); }} />
        </label>
        {orgId && (
          <label className="text-xs"><span className="text-[var(--color-text-muted)]">Branch</span>
            <BranchDropdown orgId={orgId} branchId={branchId} onChange={v => { setBranchId(v); setPage(1); }} />
          </label>
        )}
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)]">Loading settlements...</p>
        ) : !data?.data?.length ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)]">No settlements found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">#</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Org</th>
                  <th className="text-right px-3 py-3 font-medium text-[var(--color-text-muted)]">Gross</th>
                  <th className="text-right px-3 py-3 font-medium text-[var(--color-text-muted)]">Fee</th>
                  <th className="text-right px-3 py-3 font-medium text-[var(--color-text-muted)]">Org Net</th>
                  <th className="text-center px-3 py-3 font-medium text-[var(--color-text-muted)]">Direction</th>
                  <th className="text-right px-3 py-3 font-medium text-[var(--color-text-muted)]">Final</th>
                  <th className="text-center px-3 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
                  <th className="text-right px-3 py-3 font-medium text-[var(--color-text-muted)]">Orders</th>
                  <th className="text-center px-3 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((s: any) => {
                  const isSelected = detailId === s.id;
                  return (
                    <tr key={s.id} onClick={() => setDetailId(isSelected ? null : s.id)}
                      className={`border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] cursor-pointer ${isSelected ? 'bg-[var(--color-bg)]' : ''}`}>
                      <td className="px-3 py-3 text-[var(--color-text)] font-mono text-xs">#{s.id}</td>
                      <td className="px-3 py-3 text-[var(--color-text)]">{s.organisation_name || '-'}</td>
                      <td className="px-3 py-3 text-right">{formatPrice(s.gross_amount)}</td>
                      <td className="px-3 py-3 text-right text-[var(--color-text-muted)]">{formatPrice(s.courtzon_fee)}</td>
                      <td className="px-3 py-3 text-right font-medium">{formatPrice(s.organization_net)}</td>
                      <td className="px-3 py-3 text-center text-xs">{s.settlement_direction ? DIRECTION_LABELS[s.settlement_direction] || s.settlement_direction : '-'}</td>
                      <td className="px-3 py-3 text-right font-medium text-[var(--color-primary)]">{formatPrice(s.final_amount)}</td>
                      <td className="px-3 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SETTLEMENT_STATUS_COLORS[s.settlement_status] || ''}`}>{s.settlement_status?.replace(/_/g, ' ')}</span></td>
                      <td className="px-3 py-3 text-right text-[var(--color-text-muted)]">{s.order_count || 0}</td>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <SettlementActions settlement={s} onUpdated={() => setDetailId(null)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 20 && (
          <div className="flex items-center justify-center gap-3 p-4 border-t border-[var(--color-border)]">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-[var(--radius-md)] border text-sm disabled:opacity-40">Previous</button>
            <span className="text-sm text-[var(--color-text-muted)]">Page {page} of {Math.ceil(data.total / 20)}</span>
            <button disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-[var(--radius-md)] border text-sm disabled:opacity-40">Next</button>
          </div>
        )}
      </div>

      {detailId && <SettlementDetailModal settlementId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

// ── Main Page ──
export default function AdminFinancePage() {
  const [tab, setTab] = useState<'transactions' | 'settlements'>('transactions');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Finance</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Platform-wide transactions and settlements</p>
      </div>

      <div className="flex gap-1 border-b border-[var(--color-border)]">
        <button onClick={() => setTab('transactions')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'transactions' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}>
          Transactions
        </button>
        <button onClick={() => setTab('settlements')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'settlements' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}>
          Settlements
        </button>
      </div>

      {tab === 'transactions' ? <TransactionsTab /> : <SettlementsTab />}
    </div>
  );
}
