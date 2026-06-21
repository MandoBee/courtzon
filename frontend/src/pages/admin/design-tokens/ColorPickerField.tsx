const inputClass =
  'px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white dark:bg-gray-800 text-xs text-[var(--color-text)]';

function normalizeHex(value: string): string | null {
  const m = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  if (m[1].length === 3) {
    const [a, b, c] = m[1].split('');
    return `#${a}${a}${b}${b}${c}${c}`.toUpperCase();
  }
  return `#${m[1].toUpperCase()}`;
}

/** Visual hex picker + optional hex text field. */
export function ColorPickerField({
  value,
  onChange,
  allowVar = true,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Show text field for var(--…) references */
  allowVar?: boolean;
}) {
  const hex = normalizeHex(value);
  const pickerValue = hex ?? '#000000';

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <label className="relative shrink-0 cursor-pointer" title="Click to pick a color">
        <input
          type="color"
          value={pickerValue}
          onInput={(e) => onChange((e.target as HTMLInputElement).value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-md cursor-pointer border-2 border-[var(--color-border)] bg-white dark:bg-gray-700 p-0.5"
        />
      </label>
      {hex && (
        <span
          className="w-9 h-9 rounded-md border border-[var(--color-border)] shrink-0"
          style={{ backgroundColor: hex }}
          title={hex}
        />
      )}
      {allowVar || !hex ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#059669"
          className={`w-28 font-mono ${inputClass}`}
        />
      ) : (
        <span className="text-xs font-mono text-[var(--color-text-muted)] w-20">{hex}</span>
      )}
    </div>
  );
}
