import { formatPrice } from '../../utils/currency';

export type PrizeRow = {
  id?: number;
  placement?: number | null;
  prize_type: string;
  description?: string | null;
  amount?: number | null;
  currency_code?: string | null;
};

interface PrizeListProps {
  /** Structured prizes (authoritative when present). */
  prizes?: PrizeRow[];
  /** Legacy free-text fallback shown ONLY when no structured prizes exist. */
  legacyDescription?: string | null;
}

const PRIZE_TYPE_LABELS: Record<string, string> = {
  cash: 'Cash',
  gold: 'Gold Medal',
  silver: 'Silver Medal',
  bronze: 'Bronze Medal',
  trophy: 'Trophy',
  gift: 'Gift',
  other: 'Other',
};

function placementLabel(placement: number | null | undefined): string {
  if (placement == null) return 'Special Prize';
  const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
  const suffix = suffixes[placement] || 'th';
  return `${placement}${suffix} Place`;
}

/**
 * Structured Tournament prize display. When structured prizes exist they are the
 * primary prize presentation; the legacy `prize_description` is only shown as a
 * fallback when the structured list is empty.
 */
export function PrizeList({ prizes, legacyDescription }: PrizeListProps) {
  const structured = Array.isArray(prizes) && prizes.length > 0 ? prizes : null;

  if (!structured) {
    if (!legacyDescription) return null;
    return (
      <p className="text-sm font-medium text-yellow-600">🏆 {legacyDescription}</p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-[var(--color-text-muted)]">🏆 Prizes</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {structured.map((p, i) => (
          <div key={p.id ?? i} className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-[var(--color-text)]">{placementLabel(p.placement)}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-primary-bg)] text-[var(--color-primary)]">
                {PRIZE_TYPE_LABELS[p.prize_type] || p.prize_type}
              </span>
            </div>
            {p.prize_type === 'cash' && p.amount != null ? (
              <p className="mt-1 font-semibold text-yellow-600">
                {formatPrice(Number(p.amount), p.currency_code || undefined)}
              </p>
            ) : (
              p.description && <p className="mt-1 text-[var(--color-text-muted)]">{p.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}