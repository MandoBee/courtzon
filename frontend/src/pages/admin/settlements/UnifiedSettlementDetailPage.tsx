import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';
import { useCan } from '../../../hooks/useCan';
import { formatPrice } from '../../../utils/currency';

const TYPE_LABEL: Record<string, string> = {
  ORGANIZATION_EARNING: 'Organization Earning',
  COURTZON_COMMISSION: 'CourtZon Commission',
  ORGANIZATION_ADJUSTMENT: 'Organization Adjustment',
  COURTZON_ADJUSTMENT: 'CourtZon Adjustment',
};

const SOURCE_LABEL: Record<string, string> = {
  marketplace: 'Marketplace',
  booking: 'Booking',
  academy: 'Academy',
  tournament: 'Tournament',
  coach_session: 'Coach Session',
  manual: 'Manual',
};

const STATUS_BADGE: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const ENT_STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  AVAILABLE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  ON_HOLD: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  SETTLED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const COLLECTOR_LABEL: Record<string, string> = {
  courtzon: 'Collected by CourtZon',
  org: 'Collected by Organization',
};

const DIRECTION_LABEL: Record<string, string> = {
  COURTZON_TO_ORGANIZATION: 'CourtZon pays Organization',
  ORGANIZATION_TO_COURTZON: 'Organization pays CourtZon',
  ZERO_BALANCE: 'Zero balance — no payment required',
};

export default function UnifiedSettlementDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { can } = useCan();
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['unified-settlement', id],
    queryFn: () => api.get(`/unified-settlements/${id}`).then((r) => r.data),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['unified-settlement', id] });
    queryClient.invalidateQueries({ queryKey: ['unified-settlements'] });
  };

  const pay = useMutation({
    mutationFn: () =>
      api.post(`/unified-settlements/${id}/pay`, { paymentMethod: paymentMethod || undefined, paymentReference: paymentReference || undefined }),
    onSuccess: () => { showToast('Settlement finalized as paid'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to record payment', 'error'),
  });

  const cancel = useMutation({
    mutationFn: () => api.post(`/unified-settlements/${id}/cancel`, { reason: 'Cancelled by admin' }),
    onSuccess: () => { showToast('Settlement cancelled — entitlements released'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to cancel settlement', 'error'),
  });

  if (isLoading) return <div className="text-center py-8 text-[var(--color-text-muted)]">Loading...</div>;
  if (!data?.settlement) return <div className="text-center py-8 text-[var(--color-text-muted)]">Settlement not found</div>;

  const s = data.settlement;
  const f = data.financials;
  const ents: any[] = data.entitlements || [];
  const isFinal = ['completed', 'paid', 'cancelled', 'rejected'].includes(s.settlement_status);

  // Group entitlements by canonical source (source_type + source_id) so each
  // order/booking appears once with its earning + commission + adjustments.
  const groups = new Map<string, { sourceType: string; sourceId: string; orderId?: number; bookingId?: number; items: any[] }>();
  for (const ent of ents) {
    const key = `${ent.source_type}:${ent.source_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        sourceType: ent.source_type,
        sourceId: ent.source_id,
        orderId: ent.metadata?.orderId ?? ent.metadata?.order_id,
        bookingId: ent.metadata?.bookingId ?? ent.metadata?.booking_id,
        items: [],
      });
    }
    groups.get(key)!.items.push(ent);
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <Link to="/admin/unified-settlements" className="text-sm text-[var(--color-primary)]">← Back</Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Settlement #{s.id} · {s.organisation_name}</h1>
          <p className="text-xs text-[var(--color-text-muted)]">Batch: {s.batch_code || '—'} · Created {new Date(s.created_at).toLocaleString('en-GB')}</p>
        </div>
        <span className={`text-sm px-3 py-1 rounded-full ${STATUS_BADGE[s.settlement_status] || ''}`}>{s.settlement_status.replace(/_/g, ' ')}</span>
      </div>

      {/* Settlement info */}
      <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-[var(--color-text-muted)] text-xs">Settlement ID</p>
          <p className="font-medium">#{s.id}</p>
        </div>
        <div>
          <p className="text-[var(--color-text-muted)] text-xs">Organisation</p>
          <p className="font-medium">{s.organisation_name || '—'}</p>
        </div>
        <div>
          <p className="text-[var(--color-text-muted)] text-xs">Status</p>
          <p className="font-medium capitalize">{s.settlement_status.replace(/_/g, ' ')}</p>
        </div>
        <div>
          <p className="text-[var(--color-text-muted)] text-xs">Final Amount</p>
          <p className="font-medium">{formatPrice(Number(s.final_amount ?? f?.finalAmount ?? 0), 'EGP')}</p>
        </div>
        <div>
          <p className="text-[var(--color-text-muted)] text-xs">Created</p>
          <p className="font-medium">{new Date(s.created_at).toLocaleString('en-GB')}</p>
        </div>
        <div>
          <p className="text-[var(--color-text-muted)] text-xs">Paid</p>
          <p className="font-medium">{s.paid_at ? new Date(s.paid_at).toLocaleString('en-GB') : '—'}</p>
        </div>
      </div>

      {/* Netting summary */}
      <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-[var(--color-text-muted)]">CourtZon owes Organization</p>
          <p className="text-lg font-bold">{formatPrice(f?.courtzonOwedToOrg ?? 0, 'EGP')}</p>
        </div>
        <div>
          <p className="text-[var(--color-text-muted)]">Organization owes CourtZon</p>
          <p className="text-lg font-bold">{formatPrice(f?.orgOwedToCourtZon ?? 0, 'EGP')}</p>
        </div>
        <div>
          <p className="text-[var(--color-text-muted)]">Net result</p>
          <p className="text-lg font-bold">{formatPrice(f?.finalAmount ?? 0, 'EGP')}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{DIRECTION_LABEL[f?.direction] || ''}</p>
        </div>
      </div>

      {/* Totals breakdown — canonical values from backend financials */}
      <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4 text-sm">
        <p className="text-sm font-medium mb-2">Settlement Composition</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <p className="text-[var(--color-text-muted)] text-xs">Org Earnings</p>
            <p className="font-semibold text-emerald-600 dark:text-emerald-400">{formatPrice(Number(f?.totalOrgEarnings ?? 0), 'EGP')}</p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)] text-xs">CourtZon Commission</p>
            <p className="font-semibold">{formatPrice(Number(f?.totalCommission ?? 0), 'EGP')}</p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)] text-xs">Org Adjustments</p>
            <p className={`font-semibold ${Number(f?.totalOrgAdjustments ?? 0) < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {formatPrice(Number(f?.totalOrgAdjustments ?? 0), 'EGP')}
            </p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)] text-xs">CourtZon Adjustments</p>
            <p className={`font-semibold ${Number(f?.totalCourtZonAdjustments ?? 0) < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {formatPrice(Number(f?.totalCourtZonAdjustments ?? 0), 'EGP')}
            </p>
          </div>
          <div className="col-span-2 md:col-span-4 pt-2 border-t border-[var(--color-border)] flex items-center justify-between">
            <span className="text-[var(--color-text-muted)]">Final Settlement Amount</span>
            <span className="font-bold text-[var(--color-text)]">{formatPrice(Number(s.final_amount ?? f?.finalAmount ?? 0), 'EGP')}</span>
          </div>
        </div>
      </div>

      {/* Source Details */}
      <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4">
        <p className="text-sm font-medium mb-2">Source Details ({groups.size})</p>
        {groups.size === 0 && <p className="text-sm text-[var(--color-text-muted)]">None.</p>}
        <div className="space-y-3">
          {Array.from(groups.values()).map((g) => (
            <div key={`${g.sourceType}:${g.sourceId}`} className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-[var(--color-text)]">{SOURCE_LABEL[g.sourceType] || g.sourceType}</span>
                  <span className="text-[var(--color-text-muted)]">#{g.sourceId}</span>
                  {g.sourceType === 'marketplace' && g.orderId && (
                    <Link
                      to={`/org/${s.organisation_id}/orders/${g.orderId}`}
                      className="text-xs text-[var(--color-primary)] hover:underline"
                    >
                      View Order #{g.orderId} →
                    </Link>
                  )}
                  {g.sourceType === 'booking' && g.bookingId && (
                    <span className="text-xs text-[var(--color-text-muted)]">Booking #{g.bookingId}</span>
                  )}
                </div>
                <span className="text-xs text-[var(--color-text-muted)]">{g.items.length} entitlement(s)</span>
              </div>

              <div className="space-y-1">
                {g.items.map((ent: any) => (
                  <div key={ent.id} className="flex flex-wrap items-center justify-between gap-2 text-sm border-t border-[var(--color-border)] pt-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{TYPE_LABEL[ent.entitlement_type] || ent.entitlement_type}</span>
                      <span className="text-xs text-[var(--color-text-muted)]">{COLLECTOR_LABEL[ent.collector] || '—'}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${ENT_STATUS_BADGE[ent.status] || ''}`}>
                        {ent.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span className={`font-medium ${Number(ent.amount) < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {formatPrice(Number(ent.amount), 'EGP')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {s.paid_at && (
        <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4 text-sm grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><span className="text-[var(--color-text-muted)]">Paid amount:</span> <span className="font-medium">{formatPrice(Number(s.paid_amount), 'EGP')}</span></div>
          <div><span className="text-[var(--color-text-muted)]">Method:</span> {s.payment_method || '—'}</div>
          <div><span className="text-[var(--color-text-muted)]">Reference:</span> {s.payment_reference || '—'}</div>
          <div><span className="text-[var(--color-text-muted)]">Paid at:</span> {s.paid_at ? new Date(s.paid_at).toLocaleString('en-GB') : '—'}</div>
          <div><span className="text-[var(--color-text-muted)]">Direction:</span> {s.settlement_direction?.replace(/_/g, ' ') || 'zero balance'}</div>
        </div>
      )}

      {!isFinal && can('settlements.pay') && (
        <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4 space-y-2">
          <p className="text-sm font-medium">Record Payment</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input type="text" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="input input-bordered text-sm" placeholder="Payment method (e.g. bank_transfer)" />
            <input type="text" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="input input-bordered text-sm" placeholder="Payment reference" />
          </div>
          <button onClick={() => pay.mutate()} disabled={pay.isPending} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50">
            {pay.isPending ? 'Finalizing...' : (f?.direction === 'ZERO_BALANCE' ? 'Finalize (zero balance)' : 'Record Payment & Finalize')}
          </button>
        </div>
      )}

      {!isFinal && can('settlements.cancel') && (
        <button onClick={() => cancel.mutate()} disabled={cancel.isPending} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50">
          Cancel Settlement
        </button>
      )}
    </div>
  );
}