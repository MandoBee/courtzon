import type { ReactNode } from 'react';

interface GeneratedRulesProps {
  /** Server-generated human-readable Tournament Rules snapshot (tournaments.rules). */
  rules?: string | null;
  /** Optional title label (already translated by the caller). */
  title?: string;
  /** Optional empty-state node shown when there is no rules value. */
  empty?: ReactNode;
}

/**
 * Read-only display of the server-generated Tournament Rules snapshot.
 * The value is persisted on the tournament (`tournaments.rules`) and rendered
 * verbatim — this component never computes or re-interprets scoring rules.
 */
export function GeneratedRules({ rules, title, empty }: GeneratedRulesProps) {
  if (!rules || !rules.trim()) {
    return empty ? <>{empty}</> : null;
  }
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 bg-[var(--color-bg)]/30">
      {title && <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">{title}</p>}
      <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap">{rules}</p>
    </div>
  );
}