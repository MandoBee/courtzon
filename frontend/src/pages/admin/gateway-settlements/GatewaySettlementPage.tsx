import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useCan } from '../../../hooks/useCan';
import { useToast } from '../../../components/ui/Toast';
import { formatPrice, getDefaultCurrency } from '../../../utils/currency';
import { formatISODate } from '../../../utils/formatDate';

interface EligibleRow {
  paymentTransactionId: number;
  referenceType: string | null;
  referenceId: number | null;
  orderId: number | null;
  bookingId: number | null;
  gatewayReference: string | null;
  gatewayProvider: string | null;
  paymentMethod: string;
  paidAt: string | null;
  currency: string;
  grossAmount: number;
  feeConfigStatus: 'ok' | 'missing';
  feeConfigError: string | null;
  gatewayFeePct: number | null;
  gatewayFeeFixed: number | null;
  gatewayFeeAmount: number | null;
  netAmount: number | null;
}

interface SettledSettlement {
  id: number;
  batch_code: string | null;
  settlement_status: 'completed' | 'reversed';
  gross_amount: number;
  gateway_fee_amount: number;
  net_amount: number;
  currency: string;
  transaction_count: number;
  settled_by: number | null;
  settled_at: string | null;
  settled_by_name: string | null;
  reversed_at: string | null;
  reversed_by: number | null;
  reversed_by_name: string | null;
  reversal_reason: string | null;
  reversal_reference: string | null;
  notes: string | null;
  created_at: string;
}

interface SettledTransaction {
  id: number;
  payment_transaction_id: number;
  payment_method_id: number | null;
  payment_method_name: string | null;
  gross_amount: number;
  gateway_fee_pct: number;
  gateway_fee_fixed: number;
  gateway_fee_amount: number;
  net_amount: number;
  currency: string;
  order_id: number | null;
  booking_id: number | null;
  gateway_reference: string | null;
  gateway_provider: string | null;
  paid_at: string | null;
}

type SettledStatusFilter = 'all' | 'completed' | 'reversed';

const fmtDate = (v: string | null | undefined): string => (v ? formatISODate(String(v).slice(0, 10)) : '—');

const STATUS_BADGE = {
  completed: 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/40',
  reversed: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/40',
} as const;

export default function GatewaySettlementPage() {
  const { can } = useCan();
  const [tab, setTab] = useState<'pending' | 'settled'>('pending');

  if (!can('financial.gateway-settlement.view')) return null;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text)]">
          {tab === 'pending' ? 'Receive Gateway Settlement' : 'Settled Gateway Payments'}
        </h1>
        <p className="text-xs text-[var(--color-text-muted)]">
          Track gateway receipts (clearing → bank), reverse settlements made in error, and pay organisations
          from settled CourtZon funds.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-[var(--color-border)]">
        <button
          onClick={() => setTab('pending')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'pending'
              ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
              : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text)]'
          }`}
        >
          Pending Gateway Settlements
        </button>
        <button
          onClick={() => setTab('settled')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'settled'
              ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
              : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text)]'
          }`}
        >
          Settled Gateway Payments
        </button>
      </div>

      {tab === 'pending' ? <PendingTab /> : <SettledTab />}
    </div>
  );
}

// ─── Tab 1: Pending Gateway Settlements (unchanged behaviour) ───────────────

function PendingTab() {
  const { can } = useCan();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notes, setNotes] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery<{ data: EligibleRow[] }>({
    queryKey: ['gateway-settlements', 'eligible'],
    queryFn: () => api.get('/admin/gateway-settlements/eligible').then((r) => r.data),
    // Always fetch the current eligible transactions + fee configuration on
    // open/refresh — never serve a stale zero-fee response from the cache.
    staleTime: 0,
  });

  const createMut = useMutation({
    mutationFn: (paymentTransactionIds: number[]) =>
      api.post('/admin/gateway-settlements', { paymentTransactionIds, notes: notes || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway-settlements'] });
      setConfirmOpen(false);
      setSelected(new Set());
      setNotes('');
      showToast('Gateway settlement recorded successfully!');
      refetch();
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to record gateway settlement', 'error'),
  });

  const rows: EligibleRow[] = data?.data || [];

  const settleableRows = rows.filter((r) => r.feeConfigStatus === 'ok');
  const misconfiguredCount = rows.length - settleableRows.length;
  const allSelected = settleableRows.length > 0 && selected.size === settleableRows.length;

  const totals = useMemo(() => {
    const chosen = rows.filter((r) => selected.has(r.paymentTransactionId) && r.feeConfigStatus === 'ok');
    const gross = chosen.reduce((s, r) => s + Number(r.grossAmount || 0), 0);
    const fee = chosen.reduce((s, r) => s + Number(r.gatewayFeeAmount || 0), 0);
    return { gross, fee, net: gross - fee };
  }, [rows, selected]);

  const toggle = (id: number) => {
    const row = rows.find((r) => r.paymentTransactionId === id);
    // Misconfigured transactions (missing fee configuration) are never
    // selectable for settlement.
    if (row && row.feeConfigStatus !== 'ok') return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const settleable = rows.filter((r) => r.feeConfigStatus === 'ok').map((r) => r.paymentTransactionId);
    setSelected((prev) => prev.size === settleable.length ? new Set() : new Set(settleable));
  };

  return (
    <div className="space-y-4">
      {can('financial.gateway-settlement.create') && (
        <div className="flex justify-end">
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={selected.size === 0 || createMut.isPending}
            className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50"
          >
            Confirm Gateway Settlement ({selected.size})
          </button>
        </div>
      )}

      {isError && (
        <div className="p-4 rounded-xl border border-[var(--color-error)] text-sm text-[var(--color-error)]">
          Failed to load eligible transactions: {(error as any)?.message || 'Unknown error'}
        </div>
      )}

      {!isError && misconfiguredCount > 0 && (
        <div className="p-3 rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning)]/10 text-sm text-[var(--color-warning)]">
          {misconfiguredCount} payment transaction(s) are missing gateway fee configuration and cannot be settled. Supported methods are identified below; settleable transactions are unaffected.
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
            <tr>
              <th className="p-3 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              <th className="p-3">Reference</th>
              <th className="p-3">Transaction Ref</th>
              <th className="p-3">Payment Date</th>
              <th className="p-3">Method</th>
              <th className="p-3 text-right">Gross</th>
              <th className="p-3 text-right">Fee %</th>
              <th className="p-3 text-right">Fixed Fee</th>
              <th className="p-3 text-right">Gateway Fee</th>
              <th className="p-3 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={10} className="p-4 text-center text-[var(--color-text-muted)]">Loading eligible transactions...</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={10} className="p-4 text-center text-[var(--color-text-muted)]">
                No eligible gateway payments awaiting settlement. Paid card/online customer payments that have not yet been settled to CourtZon appear here.
              </td></tr>
            )}
            {rows.map((r) => {
              const misconfigured = r.feeConfigStatus === 'missing';
              return (
              <tr key={r.paymentTransactionId} className={`border-b border-[var(--color-border)] hover:bg-[var(--color-surface-alt)] ${misconfigured ? 'opacity-75' : ''}`}>
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(r.paymentTransactionId)}
                    onChange={() => toggle(r.paymentTransactionId)}
                    disabled={misconfigured}
                    title={misconfigured ? (r.feeConfigError || 'Fee configuration missing — not settleable') : undefined}
                  />
                </td>
                <td className="p-3 font-medium">
                  {r.referenceType ? `${r.referenceType} #${r.referenceId ?? r.orderId ?? r.bookingId ?? ''}` : `Payment #${r.paymentTransactionId}`}
                </td>
                <td className="p-3 text-xs text-[var(--color-text-muted)]">{r.gatewayReference || `txn-${r.paymentTransactionId}`}</td>
                <td className="p-3">{r.paidAt ? formatISODate(r.paidAt.slice(0, 10)) : '—'}</td>
                <td className="p-3 capitalize">{r.paymentMethod}</td>
                {misconfigured ? (
                  <td colSpan={5} className="p-3">
                    <span
                      className="inline-block text-xs px-2 py-1 rounded-full border border-[var(--color-error)] text-[var(--color-error)]"
                      title={r.feeConfigError || ''}
                    >
                      Fee configuration missing — cannot compute gateway fees. Fix the payment method configuration before settlement.
                    </span>
                  </td>
                ) : (
                  <>
                    <td className="p-3 text-right font-medium">{formatPrice(Number(r.grossAmount), getDefaultCurrency())}</td>
                    <td className="p-3 text-right text-[var(--color-text-muted)]">{Number(r.gatewayFeePct || 0)}%</td>
                    <td className="p-3 text-right text-[var(--color-text-muted)]">{formatPrice(Number(r.gatewayFeeFixed || 0), getDefaultCurrency())}</td>
                    <td className="p-3 text-right text-[var(--color-text-muted)]">{formatPrice(Number(r.gatewayFeeAmount || 0), getDefaultCurrency())}</td>
                    <td className="p-3 text-right font-semibold">{formatPrice(Number(r.netAmount || 0), getDefaultCurrency())}</td>
                  </>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] border border-[var(--color-border)] p-4 flex flex-wrap gap-6 text-sm">
          <div><span className="text-xs text-[var(--color-text-muted)]">Total Gross</span>
            <p className="font-bold">{formatPrice(totals.gross, getDefaultCurrency())}</p></div>
          <div><span className="text-xs text-[var(--color-text-muted)]">Total Gateway Fees</span>
            <p className="font-bold text-[var(--color-text-muted)]">{formatPrice(totals.fee, getDefaultCurrency())}</p></div>
          <div><span className="text-xs text-[var(--color-text-muted)]">Total Net Received</span>
            <p className="font-bold text-[var(--color-primary)]">{formatPrice(totals.net, getDefaultCurrency())}</p></div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] rounded-2xl shadow-xl max-w-md w-full p-5">
            <h3 className="font-semibold text-[var(--color-text)] mb-2">Confirm Gateway Settlement</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              Record receipt of <strong>{selected.size}</strong> payment transaction(s) totalling{' '}
              <strong>{formatPrice(totals.gross, getDefaultCurrency())}</strong> gross,{' '}
              <strong>{formatPrice(totals.net, getDefaultCurrency())}</strong> net after{' '}
              <strong>{formatPrice(totals.fee, getDefaultCurrency())}</strong> in gateway fees.
              This will create the accounting entry (Bank / Gateway Fees / Payment Clearing) and is irreversible.
            </p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)"
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmOpen(false)} disabled={createMut.isPending}
                className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={() => createMut.mutate([...selected])} disabled={createMut.isPending}
                className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50">
                {createMut.isPending ? 'Recording...' : 'Confirm & Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Settled Gateway Payments ────────────────────────────────────────

function SettledTab() {
  const { can } = useCan();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<SettledStatusFilter>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reverseId, setReverseId] = useState<number | null>(null);
  const [reverseRow, setReverseRow] = useState<SettledSettlement | null>(null);
  const [reason, setReason] = useState('');

  const { data, isLoading, isError, refetch } = useQuery<{ data: SettledSettlement[]; total: number }>({
    queryKey: ['gateway-settlements', 'list', page, statusFilter],
    queryFn: () =>
      api.get('/admin/gateway-settlements', {
        params: { page, limit: 20, status: statusFilter === 'all' ? undefined : statusFilter },
      }).then((r) => r.data),
  });

  const reverseMut = useMutation({
    mutationFn: ({ id, reasonText }: { id: number; reasonText: string }) =>
      api.post(`/admin/gateway-settlements/${id}/reverse`, { reason: reasonText }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway-settlements'] });
      setReverseId(null);
      setReverseRow(null);
      setReason('');
      setExpandedId(null);
      showToast('Gateway settlement reversed successfully. Payments are eligible again.');
      refetch();
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to reverse gateway settlement', 'error'),
  });

  const rows: SettledSettlement[] = data?.data || [];
  const total = Number(data?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const cur = getDefaultCurrency();

  const openReverse = (row: SettledSettlement) => {
    setReverseRow(row);
    setReverseId(row.id);
    setReason('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          {(['all', 'completed', 'reversed'] as SettledStatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {s === 'all' ? 'All' : s === 'completed' ? 'Completed / Received' : 'Reversed / Cancelled'}
            </button>
          ))}
        </div>
        {can('financial.gateway-settlement.settle-orgs') && (
          <button
            onClick={() => navigate('/admin/unified-settlements/new')}
            className="px-4 py-2 rounded-lg border border-[var(--color-primary)] text-[var(--color-primary)] text-sm font-medium hover:bg-[var(--color-primary)]/10"
          >
            Settle Organisations
          </button>
        )}
      </div>

      {isError && (
        <div className="p-4 rounded-xl border border-[var(--color-error)] text-sm text-[var(--color-error)]">
          Failed to load settled gateway payments.
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
            <tr>
              <th className="p-3 w-8"></th>
              <th className="p-3">Batch</th>
              <th className="p-3">Date</th>
              <th className="p-3 text-right">Transactions</th>
              <th className="p-3 text-right">Gross</th>
              <th className="p-3 text-right">Gateway Fees</th>
              <th className="p-3 text-right">Net</th>
              <th className="p-3">Status</th>
              <th className="p-3">Settled By</th>
              <th className="p-3">Reversed By</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={11} className="p-4 text-center text-[var(--color-text-muted)]">Loading settled gateway payments...</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={11} className="p-4 text-center text-[var(--color-text-muted)]">
                No settled gateway payments found.
              </td></tr>
            )}
            {rows.map((s) =>
              <SettledSettlementRow
                  key={s.id}
                  settlement={s}
                  expanded={expandedId === s.id}
                  onToggleExpand={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  onReverse={openReverse}
                  currency={cur}
                />
              )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-xs text-[var(--color-text-muted)]">{total} settlement(s)</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border rounded-lg text-xs disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 border rounded-lg text-xs disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {reverseId != null && reverseRow && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] rounded-2xl shadow-xl max-w-md w-full p-5">
            <h3 className="font-semibold text-[var(--color-text)] mb-2">Reverse Gateway Settlement {reverseRow.batch_code || `#${reverseRow.id}`}</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              This will reverse <strong>{reverseRow.transaction_count}</strong> payment transaction(s) totalling{' '}
              <strong>{formatPrice(Number(reverseRow.gross_amount), getDefaultCurrency())}</strong> gross,{' '}
              <strong>{formatPrice(Number(reverseRow.net_amount), getDefaultCurrency())}</strong> net.
              A reversal accounting entry (Payment Clearing / Bank / Gateway Fees) will be created while the original
              journal is preserved as immutable history. The linked payments become eligible for gateway settlement again.
              <strong> This action cannot be undone.</strong>
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reversal reason (required)"
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setReverseId(null); setReverseRow(null); setReason(''); }} disabled={reverseMut.isPending}
                className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button
                onClick={() => reverseMut.mutate({ id: reverseId, reasonText: reason })}
                disabled={reverseMut.isPending || !reason.trim()}
                className="px-4 py-2 rounded-lg bg-[var(--color-error)] text-white text-sm font-medium disabled:opacity-50"
              >
                {reverseMut.isPending ? 'Reversing...' : 'Reverse Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettledSettlementRow({ settlement, expanded, onToggleExpand, onReverse, currency }: {
  settlement: SettledSettlement;
  expanded: boolean;
  onToggleExpand: () => void;
  onReverse: (row: SettledSettlement) => void;
  currency: string;
}) {
  const { can } = useCan();
  const reversed = settlement.settlement_status === 'reversed';

  const { data: detail, isLoading: detailLoading } = useQuery<{ settlement?: any; transactions?: SettledTransaction[] }>({
    queryKey: ['gateway-settlements', 'detail', settlement.id],
    queryFn: () => api.get(`/admin/gateway-settlements/${settlement.id}`).then((r) => r.data),
    enabled: expanded,
    staleTime: 0,
  });

  const transactions: SettledTransaction[] = detail?.transactions || [];

  return (
    <>
      <tr className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]">
        <td className="p-3">
          <button
            onClick={onToggleExpand}
            className="text-xs text-[var(--color-primary)] font-medium"
            title={expanded ? 'Hide transactions' : 'View transactions'}
          >
            {expanded ? '▾' : '▸'}
          </button>
        </td>
        <td className="p-3 font-medium">{settlement.batch_code || `#${settlement.id}`}</td>
        <td className="p-3">{fmtDate(settlement.created_at)}</td>
        <td className="p-3 text-right">{settlement.transaction_count}</td>
        <td className="p-3 text-right font-medium">{formatPrice(Number(settlement.gross_amount), currency)}</td>
        <td className="p-3 text-right text-[var(--color-text-muted)]">{formatPrice(Number(settlement.gateway_fee_amount), currency)}</td>
        <td className="p-3 text-right font-semibold">{formatPrice(Number(settlement.net_amount), currency)}</td>
        <td className="p-3">
          <span className={`inline-block text-xs px-2 py-1 rounded-full border ${STATUS_BADGE[settlement.settlement_status] || ''}`}>
            {reversed ? 'Reversed / Cancelled' : 'Completed / Received'}
          </span>
        </td>
        <td className="p-3 text-xs text-[var(--color-text-muted)]">{settlement.settled_by_name || `#${settlement.settled_by ?? '—'}`}</td>
        <td className="p-3 text-xs text-[var(--color-text-muted)]">
          {reversed ? (settlement.reversed_by_name || `#${settlement.reversed_by ?? ''}`) : '—'}
        </td>
        <td className="p-3">
          {!reversed && can('financial.gateway-settlement.reverse') ? (
            <button
              onClick={() => onReverse(settlement)}
              className="px-2.5 py-1 rounded-lg border border-[var(--color-error)] text-[var(--color-error)] text-xs font-medium hover:bg-[var(--color-error)]/10"
            >
              Reverse
            </button>
          ) : (
            <span className="text-xs text-[var(--color-text-muted)]">—</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-alt)]/60">
          <td colSpan={11} className="p-3">
            <div className="rounded-lg border border-[var(--color-border)] overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                  <tr>
                    <th className="p-2">Payment Txn</th>
                    <th className="p-2">Reference</th>
                    <th className="p-2">Method</th>
                    <th className="p-2">Paid At</th>
                    <th className="p-2 text-right">Gross</th>
                    <th className="p-2 text-right">Fee</th>
                    <th className="p-2 text-right">Net</th>
                    {reversed && <th className="p-2">Reversal</th>}
                  </tr>
                </thead>
                <tbody>
                  {detailLoading && <tr><td colSpan={reversed ? 8 : 7} className="p-2 text-center text-[var(--color-text-muted)]">Loading...</td></tr>}
                  {!detailLoading && transactions.length === 0 && (
                    <tr><td colSpan={reversed ? 8 : 7} className="p-2 text-center text-[var(--color-text-muted)]">No transactions.</td></tr>
                  )}
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-b border-[var(--color-border)]">
                      <td className="p-2">{t.payment_transaction_id}</td>
                      <td className="p-2">
                        {t.order_id ? `order #${t.order_id}` : t.booking_id ? `booking #${t.booking_id}` : t.gateway_reference || '—'}
                      </td>
                      <td className="p-2 capitalize">{t.payment_method_name || '—'}</td>
                      <td className="p-2">{fmtDate(t.paid_at)}</td>
                      <td className="p-2 text-right">{formatPrice(Number(t.gross_amount), currency)}</td>
                      <td className="p-2 text-right">{formatPrice(Number(t.gateway_fee_amount), currency)}</td>
                      <td className="p-2 text-right font-medium">{formatPrice(Number(t.net_amount), currency)}</td>
                      {reversed && (
                        <td className="p-2 text-[var(--color-text-muted)]">
                          {reversalReferenceLabel(settlement)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reversed && settlement.reversal_reason && (
              <div className="mt-2 text-xs text-[var(--color-text-muted)]">
                <span className="font-medium text-[var(--color-text)]">Reversal reason:</span> {settlement.reversal_reason}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function reversalReferenceLabel(settlement: SettledSettlement): string {
  return settlement.reversal_reference || '—';
}