import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { membershipP1Api } from '../../services/membership.p1';
import { formatPrice } from '../../utils/currency';

/** Player membership list (G11.22 P1+P2) — statuses/grace/installments/overdue. */
export default function MyMembershipsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-memberships'],
    queryFn: () => membershipP1Api.listMySubscriptions(),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">My Memberships</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Your memberships, installment schedules and status (G11.22 P1+P2).</p>
      </div>
      {isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : !data?.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">You have no memberships yet.</p>
      ) : (
        <div className="space-y-3">
          {(data as any[]).map((s) => (
            <div key={s.id} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{s.planName}</p>
                <div className="flex items-center gap-2">
                  {s.eligibility?.inGrace ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]">grace</span>
                  ) : null}
                  {s.eligibility?.overdueCount ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-error-bg)] text-[var(--color-error-text)]">{s.eligibility.overdueCount} overdue</span>
                  ) : null}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.status === 'active' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : s.status === 'expired' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'}`}>{s.status}</span>
                </div>
              </div>
              <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                {s.startDate} → {s.endDate}{s.graceUntil ? ` · Grace until ${s.graceUntil}` : ''} · {s.durationTypeSnapshot}
              </div>
              <div className="mt-2 text-xs">
                {(s.components || []).map((c: any) => (
                  <div key={c.code} className="flex justify-between">
                    <span>{c.name}{!c.isRequired ? ' (optional)' : ''}</span>
                    <span>{formatPrice(Number(c.totalAmount), s.currency || 'EGP')}</span>
                  </div>
                ))}
              </div>
              {s.installments?.length ? (
                <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-2 space-y-1">
                  <p className="text-xs font-semibold">Installments ({formatPrice(Number(s.eligibility?.paidAmount ?? 0), s.currency || 'EGP')} paid / {formatPrice(Number(s.eligibility?.outstandingAmount ?? 0), s.currency || 'EGP')} outstanding)</p>
                  {(s.installments as any[]).map((i: any) => (
                    <div key={i.id} className="flex items-center justify-between text-[11px]">
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${i.status === 'paid' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : i.status === 'overdue' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' : i.status === 'voided' || i.status === 'refunded' ? 'bg-[var(--color-muted)] text-[var(--color-text-muted)]' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'}`}>{i.status}</span>
                      <span>#{i.seq} · {formatPrice(Number(i.amount), i.currency || 'EGP')}</span>
                      <span>{i.dueDate}{i.status === 'pending' && s.status === 'expired' ? ' (payable after expiry)' : ''}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 flex items-center justify-between border-t border-[var(--color-border)] pt-2 text-sm">
                <span>Total {formatPrice(Number(s.totalAmount), s.currency || 'EGP')}</span>
                <span>Payment: {s.paymentMethod} · {s.paymentStatus}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <Link to="/" className="text-sm text-[var(--color-primary)]">← Browse clubs</Link>
    </div>
  );
}