import { useMemo, useState } from 'react';
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
  gatewayFeePct: number;
  gatewayFeeFixed: number;
  gatewayFeeAmount: number;
  netAmount: number;
}

export default function GatewaySettlementPage() {
  const { can } = useCan();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notes, setNotes] = useState('');

  if (!can('financial.gateway-settlement.view')) return null;

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

  const totals = useMemo(() => {
    const chosen = rows.filter((r) => selected.has(r.paymentTransactionId));
    const gross = chosen.reduce((s, r) => s + Number(r.grossAmount || 0), 0);
    const fee = chosen.reduce((s, r) => s + Number(r.gatewayFeeAmount || 0), 0);
    return { gross, fee, net: gross - fee };
  }, [rows, selected]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.paymentTransactionId)));
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Receive Gateway Settlement</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            Record that CourtZon has actually received funds from the payment gateway for previously-paid card/online customer payments.
          </p>
        </div>
        {can('financial.gateway-settlement.create') && (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={selected.size === 0 || createMut.isPending}
            className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50"
          >
            Confirm Gateway Settlement ({selected.size})
          </button>
        )}
      </div>

      {isError && (
        <div className="p-4 rounded-xl border border-[var(--color-error)] text-sm text-[var(--color-error)]">
          Failed to load eligible transactions: {(error as any)?.message || 'Unknown error'}
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
            <tr>
              <th className="p-3 w-8">
                <input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleAll} />
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
            {rows.map((r) => (
              <tr key={r.paymentTransactionId} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]">
                <td className="p-3">
                  <input type="checkbox" checked={selected.has(r.paymentTransactionId)} onChange={() => toggle(r.paymentTransactionId)} />
                </td>
                <td className="p-3 font-medium">
                  {r.referenceType ? `${r.referenceType} #${r.referenceId ?? r.orderId ?? r.bookingId ?? ''}` : `Payment #${r.paymentTransactionId}`}
                </td>
                <td className="p-3 text-xs text-[var(--color-text-muted)]">{r.gatewayReference || `txn-${r.paymentTransactionId}`}</td>
                <td className="p-3">{r.paidAt ? formatISODate(r.paidAt.slice(0, 10)) : '—'}</td>
                <td className="p-3 capitalize">{r.paymentMethod}</td>
                <td className="p-3 text-right font-medium">{formatPrice(Number(r.grossAmount), getDefaultCurrency())}</td>
                <td className="p-3 text-right text-[var(--color-text-muted)]">{Number(r.gatewayFeePct || 0)}%</td>
                <td className="p-3 text-right text-[var(--color-text-muted)]">{formatPrice(Number(r.gatewayFeeFixed || 0), getDefaultCurrency())}</td>
                <td className="p-3 text-right text-[var(--color-text-muted)]">{formatPrice(Number(r.gatewayFeeAmount || 0), getDefaultCurrency())}</td>
                <td className="p-3 text-right font-semibold">{formatPrice(Number(r.netAmount || 0), getDefaultCurrency())}</td>
              </tr>
            ))}
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