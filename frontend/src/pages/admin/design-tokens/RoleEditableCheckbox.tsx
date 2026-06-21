export function RoleEditableCheckbox({
  checked,
  onChange,
  title = 'Role users can customize this',
  compact = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
  /** Column layout: checkbox only (label in table header). */
  compact?: boolean;
}) {
  return (
    <label
      className={`flex items-center shrink-0 cursor-pointer ${compact ? 'justify-center' : 'gap-1'}`}
      title={title}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
      />
      {!compact && <span className="text-[9px] text-[var(--color-text-muted)] whitespace-nowrap">Role</span>}
    </label>
  );
}
