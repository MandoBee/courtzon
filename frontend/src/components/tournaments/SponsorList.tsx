export interface SponsorRow {
  id?: number;
  name: string;
  support_type: 'cash' | 'inkind';
  amount?: number | null;
  description?: string | null;
  display_order?: number;
}

interface SponsorListProps {
  sponsors?: SponsorRow[] | null;
  /** Public/player surfaces hide the CASH amount by default; the owner
   * (admin/org) management surface may opt in. */
  showAmount?: boolean;
}

/**
 * Read-only tournament sponsor display, consistent with the existing Prize
 * display language. CASH ⇒ name + type (amount optional per surface).
 * IN-KIND ⇒ name + type (description shown; no monetary value anywhere).
 */
export default function SponsorList({ sponsors, showAmount = false }: SponsorListProps) {
  if (!sponsors || sponsors.length === 0) return null;

  const ordered = [...sponsors].sort(
    (a, b) => (Number(a.display_order ?? 0) - Number(b.display_order ?? 0)) || (Number(a.id ?? 0) - Number(b.id ?? 0)),
  );

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-[var(--color-text)]">Sponsors</h4>
      <div className="flex flex-wrap gap-2">
        {ordered.map((s) => (
          <div key={s.id ?? `${s.name}-${s.support_type}`} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs">
            <p className="font-medium text-[var(--color-text)]">{s.name}</p>
            <p className="text-[var(--color-text-muted)] capitalize">{s.support_type === 'cash' ? 'Cash' : 'In-kind'}</p>
            {s.support_type === 'cash' && showAmount && s.amount != null && (
              <p className="text-[var(--color-text-muted)]">Amount: {Number(s.amount).toFixed(2)}</p>
            )}
            {s.support_type === 'inkind' && s.description && (
              <p className="text-[var(--color-text-muted)]">{s.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}