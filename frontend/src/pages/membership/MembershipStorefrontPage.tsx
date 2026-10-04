import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { membershipP1Api } from '../../services/membership.p1';
import { useToast } from '../../components/ui/Toast';
import { formatPrice } from '../../utils/currency';

export default function MembershipStorefrontPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const oid = Number(orgId);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [method, setMethod] = useState<'cash' | 'card'>('cash');

  const { data: plans, isLoading } = useQuery({
    queryKey: ['membership-storefront', oid],
    queryFn: () => membershipP1Api.listActiveVersions(oid),
    enabled: !!oid,
  });

  const purchase = useMutation({
    mutationFn: (planVersionId: number) => membershipP1Api.purchase(oid, { planVersionId, paymentMethod: method }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-memberships'] });
      showToast('Membership purchased — awaiting payment confirmation');
      navigate('/my/membership/subscriptions');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Purchase failed', 'error'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Memberships</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Choose a membership plan — full payment or installments (first installment activates).</p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-[var(--color-text-muted)]">Payment method:</span>
        {(['cash', 'card'] as const).map((m) => (
          <button key={m} onClick={() => setMethod(m)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${method === m ? 'bg-[var(--color-primary)] text-white border-transparent' : 'border-[var(--color-border)]'}`}>{m}</button>
        ))}
      </div>

      {isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : !plans?.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">No membership plans available yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(plans as any[]).map((item) => {
            const total = (item.components || []).reduce((s: number, c: any) => s + Number(c.amount) * Number(c.quantity), 0);
            const v = item.version;
            return (
              <div key={v.id} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 space-y-2">
                <p className="font-semibold">{item.plan.name}</p>
                {item.plan.description && <p className="text-xs text-[var(--color-text-muted)]">{item.plan.description}</p>}
                <div className="text-xs space-y-0.5">
                  <p className="text-[var(--color-text-muted)]">{v.durationType} · renews {v.renewalModel === 'fixed_date' ? `on ${String(v.fixedRenewalMonth).padStart(2, '0')}/${String(v.fixedRenewalDay).padStart(2, '0')}` : `${v.durationPeriods}× ${v.durationType}`} · grace {v.graceDays}d</p>
                  <p className="text-[var(--color-text-muted)]">Branch scope: {v.branchScope === 'ALL' ? 'all branches' : `${(v.branchIds || []).length} selected branch(es)`}</p>
                </div>
                <div className="border-t border-[var(--color-border)] pt-2 text-xs space-y-0.5">
                  {(item.components || []).map((c: any) => (
                    <div key={c.code} className="flex justify-between">
                      <span>{c.name}</span>
                      <span>{formatPrice(Number(c.amount) * Number(c.quantity), v.currency || 'EGP')}</span>
                    </div>
                  ))}
                </div>
                {item.installments?.length ? (
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-2 text-[11px]">
                    <p className="font-semibold mb-1">Installment schedule (first installment activates)</p>
                    {(item.installments as any[]).map((t: any) => (
                      <div key={t.id} className="flex justify-between">
                        <span>#{t.seq}</span>
                        <span>{formatPrice(Number(t.amount), v.currency || 'EGP')}</span>
                        <span className="text-[var(--color-text-muted)]">{t.due_offset_days ? `due +${t.due_offset_days}d` : 'on purchase'}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Total {formatPrice(total, v.currency || 'EGP')}</span>
                  <button onClick={() => purchase.mutate(Number(v.id))} disabled={purchase.isPending}
                    className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
                    {purchase.isPending ? 'Purchasing…' : 'Purchase'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}