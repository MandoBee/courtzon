/** Reset a single token row to published/default values. */
export function ResetTokenButton({ onClick, title = 'Reset to published value' }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="text-[10px] font-medium px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] whitespace-nowrap"
    >
      Reset
    </button>
  );
}
