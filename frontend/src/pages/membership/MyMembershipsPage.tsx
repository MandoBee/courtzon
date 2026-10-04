import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { membershipP1Api } from '../../services/membership.p1';
import { formatPrice } from '../../utils/currency';

export default function MyMembershipsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-memberships'],
    queryFn: () => membershipP1Api.listMySubscriptions(),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">My Memberships</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Your purchased memberships (G11.22 P1).</p>
      </div>
      {isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : !data?.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">You have no memberships yet.</p>
      ) : (
        <div className="space-y-3">
          {(data as any[]).map((s) => (
            <div key={s.id} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{s.planName}</p>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.status === 'active' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'}`}>{s.status}</span>
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