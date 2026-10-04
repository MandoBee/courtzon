import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { membershipP1Api } from '../../../services/membership.p1';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

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

  const confirmCash = useMutation({
    mutationFn: (id: number) => membershipP1Api.confirmCash(oid, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-membership-subscriptions', oid] }); showToast('Cash payment confirmed — membership activated'); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to confirm', 'error'),
  });
  const completeCard = useMutation({
    mutationFn: (id: number) => membershipP1Api.completeCard(oid, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-membership-subscriptions', oid] }); showToast('Card payment confirmed — membership activated'); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to confirm', 'error'),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Membership Subscriptions</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Purchased memberships with immutable snapshots (G11.22 P1 — full payment).</p>
      </div>
      {isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : !data?.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">No subscriptions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-[var(--color-text-muted)] border-b">
              <th className="px-2 py-2">Member</th><th className="px-2 py-2">Plan</th><th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Period</th><th className="px-2 py-2">Total</th><th className="px-2 py-2">Commission</th><th className="px-2 py-2">Payment</th><th className="px-2 py-2"></th>
            </tr></thead>
            <tbody>
              {(data as any[]).map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="px-2 py-2">{s.memberName || `#${s.userId}`}</td>
                  <td className="px-2 py-2">{s.planName} <span className="text-xs text-[var(--color-text-muted)]">v{s.planVersionId}</span></td>
                  <td className="px-2 py-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.status === 'active' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'}`}>{s.status}</span></td>
                  <td className="px-2 py-2 text-xs">{s.startDate} → {s.endDate}{s.graceUntil ? ` (grace ${s.graceUntil})` : ''}</td>
                  <td className="px-2 py-2">{Number(s.totalAmount).toFixed(2)} {s.currency}</td>
                  <td className="px-2 py-2">{Number(s.commissionAmount).toFixed(2)}</td>
                  <td className="px-2 py-2">{s.paymentMethod} · {s.paymentStatus}</td>
                  <td className="px-2 py-2">
                    {s.status === 'pending' && (
                      <Can permission="membership.manage">
                        <div className="flex gap-2">
                          {s.paymentMethod === 'cash' && (
                            <button onClick={() => confirmCash.mutate(Number(s.id))} disabled={confirmCash.isPending} className="text-xs text-[var(--color-success-text)]">Confirm cash</button>
                          )}
                          {s.paymentMethod === 'card' && (
                            <button onClick={() => completeCard.mutate(Number(s.id))} disabled={completeCard.isPending} className="text-xs text-[var(--color-primary)]">Confirm card</button>
                          )}
                        </div>
                      </Can>
                    )}
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