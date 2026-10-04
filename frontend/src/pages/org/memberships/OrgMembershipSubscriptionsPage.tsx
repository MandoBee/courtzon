import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { membershipP1Api } from '../../../services/membership.p1';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

/**
 * Org membership subscription administration (G11.22 P1+P2).
 * P2: per-installment payment (first installment activates), overdue visibility,
 * renewal (allowed with overdue / in grace), cancellation (voids future unpaid
 * per policy) and refund (separate, policy-gated).
 */
export default function OrgMembershipSubscriptionsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const oid = Number(orgId);
  const { showToast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['org-membership-subscriptions', oid],
    queryFn: () => membershipP1Api.listOrgSubscriptions(oid),
    enabled: !!oid,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['org-membership-subscriptions', oid] });

  const confirmCash = useMutation({
    mutationFn: (id: number) => membershipP1Api.confirmCash(oid, id),
    onSuccess: () => { invalidate(); showToast('Cash payment confirmed — membership activated'); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to confirm', 'error'),
  });
  const completeCard = useMutation({
    mutationFn: (id: number) => membershipP1Api.completeCard(oid, id),
    onSuccess: () => { invalidate(); showToast('Card payment confirmed — membership activated'); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to confirm', 'error'),
  });

  const confirmInstallmentCash = useMutation({
    mutationFn: ({ id, seq }: { id: number; seq: number }) => membershipP1Api.confirmInstallmentCash(oid, id, seq),
    onSuccess: (_d, v) => { invalidate(); showToast(`Installment #${v.seq} paid — ${v.seq === 1 ? 'membership activated' : 'recorded'}`); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to confirm installment', 'error'),
  });
  const completeInstallmentCard = useMutation({
    mutationFn: ({ id, seq }: { id: number; seq: number }) => membershipP1Api.completeInstallmentCard(oid, id, seq),
    onSuccess: (_d, v) => { invalidate(); showToast(`Installment #${v.seq} paid`); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to complete installment', 'error'),
  });

  const renew = useMutation({
    mutationFn: (id: number) => membershipP1Api.renew(oid, id),
    onSuccess: (r) => { invalidate(); showToast(`Renewal created (#${r.subscriptionId}) — awaiting first payment`); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Renewal failed', 'error'),
  });
  const cancel = useMutation({
    mutationFn: (id: number) => membershipP1Api.cancel(oid, id),
    onSuccess: () => { invalidate(); showToast('Membership cancelled (no automatic refund)', 'warning'); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Cancel failed', 'error'),
  });
  const refund = useMutation({
    mutationFn: ({ id, ids }: { id: number; ids: number[] }) => membershipP1Api.refund(oid, id, ids, 'org request'),
    onSuccess: (r) => { invalidate(); showToast(`Refunded ${r.refunded} installment(s)`); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Refund failed', 'error'),
  });

  const paidInstallmentIds = (s: any) => (s.installments || []).filter((i: any) => i.status === 'paid').map((i: any) => Number(i.id));
  const canRenew = (s: any) => s.status === 'active' || s.status === 'expired';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Membership Subscriptions</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Purchased memberships with immutable snapshots — full payment or installments (G11.22 P1+P2).</p>
      </div>
      {isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : !data?.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">No subscriptions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-[var(--color-text-muted)] border-b">
              <th className="px-2 py-2">Member</th><th className="px-2 py-2">Plan</th><th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Period</th><th className="px-2 py-2">Total</th><th className="px-2 py-2">Commission</th>
              <th className="px-2 py-2">Payment</th><th className="px-2 py-2">Installments</th><th className="px-2 py-2">Actions</th>
            </tr></thead>
            <tbody>
              {(data as any[]).map((s) => (
                <tr key={s.id} className="border-b align-top">
                  <td className="px-2 py-2">{s.memberName || `#${s.userId}`}</td>
                  <td className="px-2 py-2">{s.planName} <span className="text-xs text-[var(--color-text-muted)]">v{s.planVersionId}</span></td>
                  <td className="px-2 py-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.status === 'active' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'}`}>{s.status}</span></td>
                  <td className="px-2 py-2 text-xs">{s.startDate} → {s.endDate}{s.graceUntil ? ` (grace ${s.graceUntil})` : ''}</td>
                  <td className="px-2 py-2">{Number(s.totalAmount).toFixed(2)} {s.currency}</td>
                  <td className="px-2 py-2">{Number(s.commissionAmount).toFixed(2)}</td>
                  <td className="px-2 py-2">{s.paymentMethod} · {s.paymentStatus}</td>
                  <td className="px-2 py-2">
                    {s.eligibility?.overdueCount ? <div className="text-xs text-[var(--color-error-text)] font-semibold">Overdue: {s.eligibility.overdueCount}</div> : null}
                    {s.installments?.length ? (
                      <div className="space-y-1">
                        {(s.installments as any[]).map((i: any) => (
                          <div key={i.id} className="text-[11px] flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${i.status === 'paid' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : i.status === 'overdue' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' : i.status === 'voided' || i.status === 'refunded' ? 'bg-[var(--color-muted)] text-[var(--color-text-muted)]' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'}`}>{i.status}</span>
                            <span># {i.seq} · {Number(i.amount).toFixed(2)} · due {i.dueDate}</span>
                            {(i.status === 'pending' || i.status === 'overdue') && (
                              <Can permission="membership.manage">
                                <button onClick={() => confirmInstallmentCash.mutate({ id: Number(s.id), seq: i.seq })} disabled={confirmInstallmentCash.isPending} className="text-[10px] text-[var(--color-success-text)] underline">cash</button>
                                <button onClick={() => completeInstallmentCard.mutate({ id: Number(s.id), seq: i.seq })} disabled={completeInstallmentCard.isPending} className="text-[10px] text-[var(--color-primary)] underline">card</button>
                              </Can>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <Can permission="membership.manage">
                      <div className="flex flex-col gap-1">
                        {s.status === 'pending' && !(s.installments?.length) && (
                          <div className="flex gap-2">
                            {s.paymentMethod === 'cash' && (
                              <button onClick={() => confirmCash.mutate(Number(s.id))} disabled={confirmCash.isPending} className="text-xs text-[var(--color-success-text)]">Confirm cash</button>
                            )}
                            {s.paymentMethod === 'card' && (
                              <button onClick={() => completeCard.mutate(Number(s.id))} disabled={completeCard.isPending} className="text-xs text-[var(--color-primary)]">Confirm card</button>
                            )}
                          </div>
                        )}
                        {canRenew(s) && (
                          <button onClick={() => renew.mutate(Number(s.id))} disabled={renew.isPending} className="text-xs text-[var(--color-primary)] underline text-left">Renew</button>
                        )}
                        {(s.status === 'pending' || s.status === 'active') && (
                          <button onClick={() => cancel.mutate(Number(s.id))} disabled={cancel.isPending} className="text-xs text-[var(--color-error-text)] underline text-left">Cancel</button>
                        )}
                        {paidInstallmentIds(s).length > 0 && (s.status === 'cancelled' || s.status === 'active') && (
                          <button onClick={() => refund.mutate({ id: Number(s.id), ids: paidInstallmentIds(s) })} disabled={refund.isPending} className="text-xs text-[var(--color-warning-text)] underline text-left">Refund paid</button>
                        )}
                      </div>
                    </Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}