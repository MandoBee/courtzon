import type { ThemeEditScope } from '../../../theme/tokens';

export function ThemeEditScopeBar({
  scope,
  onScopeChange,
  compact = false,
}: {
  scope?: ThemeEditScope;
  onScopeChange?: (s: ThemeEditScope) => void;
  /** Info-only on Components tab — component tokens always apply to both previews. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <p className="text-[10px] text-[var(--color-text-muted)] rounded-[var(--radius-sm)] bg-[var(--color-primary)]/5 px-2 py-1.5">
        Component styles apply to <strong className="text-[var(--color-text)]">both</strong> light and dark previews.
        Use <strong className="text-[var(--color-text)]">Global tokens → Theme colors</strong> to set light and dark surfaces separately.
      </p>
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
      <p className="text-xs font-medium text-[var(--color-text)]">Edit scope (surfaces & semantic colors)</p>
      <p className="text-[10px] text-[var(--color-text-muted)]">
        Buttons, inputs, and radii always affect both previews. Surface colors (background, text, borders) can target one
        preview column. Use <strong className="text-[var(--color-text)]">Both themes</strong> before save/publish so values
        are stored; light/dark-only edits update that column in the preview first.
      </p>
      <div className="flex flex-wrap gap-1">
        {(
          [
            { id: 'both' as const, label: 'Both themes' },
            { id: 'light' as const, label: 'Light only' },
            { id: 'dark' as const, label: 'Dark only' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onScopeChange?.(opt.id)}
            className={`px-3 py-1.5 text-xs rounded-[var(--radius-sm)] transition-colors ${
              scope === opt.id
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-primary)]/10'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
