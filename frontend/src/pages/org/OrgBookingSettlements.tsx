import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';
import { getErrorMessage } from '../../utils/errors';

interface EligibleBooking {
  bookingId: number;
  organisationId: number | null;
  bookingStatus: string;
  paymentStatus: string;
  bookingDate: string;
  startTime: string;
  coachAmount: number;
  orgAmount: number;
  refundedAmount: number;
  coachSettleable: number;
  orgSettleable: number;
  coachOutstandingRecovery: number;
  orgOutstandingRecovery: number;
  eligibility: string;
  eligibilityReason: string;
}

const fmt = (n: number) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OrgBookingSettlements({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [settleTarget, setSettleTarget] = useState<EligibleBooking | null>(null);
  const [settleCoach, setSettleCoach] = useState(0);
  const [settleOrg, setSettleOrg] = useState(0);
  const [recoverTarget, setRecoverTarget] = useState<{ bookingId: number; party: 'coach' | 'org'; outstanding: number } | null>(null);
  const [recoverAmount, setRecoverAmount] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['org', 'booking-settlements', orgId],
    queryFn: () => api.get('/settlements/bookings/eligible', { params: { organisationId: Number(orgId), page: 1, limit: 100 } }).then((r: any) => r.data || r),
    enabled: !!orgId,
  });

  const bookings: EligibleBooking[] = data?.data || [];

  const settleMutation = useMutation({
    mutationFn: ({ bookingId, coachAmount, orgAmount }: { bookingId: number; coachAmount: number; orgAmount: number }) =>
      api.post(`/settlements/bookings/${bookingId}/settle`, { coachAmount, orgAmount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', 'booking-settlements', orgId] });
      setSettleTarget(null);
      showToast('Booking settled');
    },
    onError: (err: any) => showToast(getErrorMessage(err, 'Settlement failed'), 'error'),
  });

  const recoverMutation = useMutation({
    mutationFn: ({ bookingId, party, amount }: { bookingId: number; party: 'coach' | 'org'; amount: number }) =>
      api.post(`/settlements/bookings/${bookingId}/recovery/collect`, { party, amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org', 'booking-settlements', orgId] });
      setRecoverTarget(null);
      showToast('Recovery collected');
    },
    onError: (err: any) => showToast(getErrorMessage(err, 'Recovery failed'), 'error'),
  });

  const openSettle = (b: EligibleBooking) => {
    setSettleTarget(b);
    setSettleCoach(Number(b.coachSettleable) || 0);
    setSettleOrg(Number(b.orgSettleable) || 0);
  };

  const openRecover = (b: EligibleBooking, party: 'coach' | 'org') => {
    const outstanding = party === 'coach' ? Number(b.coachOutstandingRecovery) : Number(b.orgOutstandingRecovery);
    setRecoverTarget({ bookingId: b.bookingId, party, outstanding });
    setRecoverAmount(outstanding);
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-3 text-xs text-[var(--color-text-muted)] leading-relaxed">
        <p>
          <strong className="text-[var(--color-text)]">Booking Settlement</strong> settles coach and organisation economics per booking.
          The <strong className="text-[var(--color-text)]">Org (settleable)</strong> and <strong className="text-[var(--color-text)]">Org recovery</strong> figures
          below are operational per-booking projections. Your <strong className="text-[var(--color-text)]">authoritative organisation position</strong> is tracked by
          financial entitlements and shown on the{' '}
          <Link to={`/org/${orgId}/finance/position`} className="text-[var(--color-primary)] underline">Financial Position</Link> page.
          Coach settlement and recovery are separate provider economics (coaches are not organisations).
        </p>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)]">Loading eligible bookings...</p>
        ) : !bookings.length ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)]">No eligible bookings for settlement.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Booking</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Date</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]" title="Coach economics — coaches are providers and are settled separately from organisation entitlements.">Coach (settleable)</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]" title="Operational per-booking projection — the authoritative org position is on the Financial Position page (financial entitlements).">Org (settleable)</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]" title="Coach recovery receivable — recovery tracking is preserved independently of organisation entitlements.">Coach recovery</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]" title="Organisation recovery receivable — recovery tracking is a separate structure from the entitlement position.">Org recovery</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {bookings.map((b) => (
                  <tr key={b.bookingId} className="hover:bg-[var(--color-bg)]">
                    <td className="px-4 py-3 text-[var(--color-text)]">#{b.bookingId}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] whitespace-nowrap">{b.bookingDate ? new Date(b.bookingDate).toLocaleDateString('en-GB') : '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{fmt(b.coachSettleable)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{fmt(b.orgSettleable)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--color-text-muted)]">{fmt(b.coachOutstandingRecovery)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--color-text-muted)]">{fmt(b.orgOutstandingRecovery)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(Number(b.coachSettleable) > 0 || Number(b.orgSettleable) > 0) && (
                          <Can permission="settlements.request">
                            <button onClick={() => openSettle(b)} className="text-xs text-[var(--color-primary)] hover:underline">Settle</button>
                          </Can>
                        )}
                        {Number(b.coachOutstandingRecovery) > 0 && (
                          <Can permission="settlements.request">
                            <button onClick={() => openRecover(b, 'coach')} className="text-xs text-amber-600 hover:underline">Collect Coach</button>
                          </Can>
                        )}
                        {Number(b.orgOutstandingRecovery) > 0 && (
                          <Can permission="settlements.request">
                            <button onClick={() => openRecover(b, 'org')} className="text-xs text-amber-600 hover:underline">Collect Org</button>
                          </Can>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {settleTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setSettleTarget(null)}>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <h2 className="text-lg font-bold text-[var(--color-text)]">Settle Booking #{settleTarget.bookingId}</h2>
              <button onClick={() => setSettleTarget(null)} className="text-[var(--color-text-muted)] text-xl leading-none">&times;</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Coach Amount</label>
                <input type="number" min="0" value={settleCoach} onChange={(e) => setSettleCoach(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Organisation Amount</label>
                <input type="number" min="0" value={settleOrg} onChange={(e) => setSettleOrg(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-[var(--color-border)]">
              <button onClick={() => setSettleTarget(null)} className="px-4 py-2 rounded-[var(--radius-md)] border text-sm">Cancel</button>
              <button onClick={() => settleMutation.mutate({ bookingId: settleTarget.bookingId, coachAmount: settleCoach, orgAmount: settleOrg })}
                disabled={settleMutation.isPending}
                className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white text-sm disabled:opacity-50">
                {settleMutation.isPending ? 'Settling...' : 'Settle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {recoverTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setRecoverTarget(null)}>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <h2 className="text-lg font-bold text-[var(--color-text)]">Collect {recoverTarget.party === 'coach' ? 'Coach' : 'Organisation'} Recovery</h2>
              <button onClick={() => setRecoverTarget(null)} className="text-[var(--color-text-muted)] text-xl leading-none">&times;</button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-[var(--color-text-muted)]">
                Outstanding recovery for booking #{recoverTarget.bookingId}: <strong className="text-[var(--color-text)]">{fmt(recoverTarget.outstanding)}</strong>
              </p>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Amount</label>
                <input type="number" min="0" max={recoverTarget.outstanding} value={recoverAmount} onChange={(e) => setRecoverAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-[var(--color-border)]">
              <button onClick={() => setRecoverTarget(null)} className="px-4 py-2 rounded-[var(--radius-md)] border text-sm">Cancel</button>
              <button onClick={() => recoverMutation.mutate({ bookingId: recoverTarget.bookingId, party: recoverTarget.party, amount: recoverAmount })}
                disabled={recoverMutation.isPending || recoverAmount <= 0}
                className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white text-sm disabled:opacity-50">
                {recoverMutation.isPending ? 'Collecting...' : 'Collect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
