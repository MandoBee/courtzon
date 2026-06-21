import { GOOGLE_FONTS } from '../../../theme/tokens';
import type { ComponentStyleProperty } from '../../../theme/component-styles';
import { ColorPickerField } from './ColorPickerField';

const inputClass =
  'px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white dark:bg-gray-800 text-xs text-[var(--color-text)]';

const FONT_WEIGHT_OPTIONS = [
  { value: '400', label: 'Regular (400)' },
  { value: '500', label: 'Medium (500)' },
  { value: '600', label: 'Semibold (600)' },
  { value: '700', label: 'Bold (700)' },
];

const SHADOW_PRESETS = [
  { value: 'var(--shadow-sm)', label: 'Small' },
  { value: 'var(--shadow-md)', label: 'Medium' },
  { value: 'var(--shadow-lg)', label: 'Large' },
  { value: 'var(--shadow-xl)', label: 'Extra large' },
  { value: 'none', label: 'None' },
];

export function VisualStyleControl({
  meta,
  value,
  onChange,
}: {
  meta: ComponentStyleProperty;
  value: string;
  onChange: (value: string) => void;
}) {
  if (meta.control === 'color') {
    return (
      <ColorPickerField
        value={value}
        onChange={onChange}
        allowVar
      />
    );
  }

  if (meta.control === 'radius' || meta.control === 'size' || meta.control === 'font-size') {
    const unit = meta.unit ?? (meta.control === 'font-size' ? 'px' : meta.tokenKey.includes('line-height') ? '' : 'px');
    const num = unit ? parseFloat(value) : parseFloat(value);
    const min = meta.min ?? 0;
    const max = meta.max ?? (meta.control === 'radius' ? 48 : 48);
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="range"
          min={min}
          max={max}
          step={unit === '' ? 0.1 : 1}
          value={Number.isNaN(num) ? min : num}
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            onChange(unit ? `${v}${unit}` : v);
          }}
          onChange={(e) => {
            const v = e.target.value;
            onChange(unit ? `${v}${unit}` : v);
          }}
          className="w-24 accent-[var(--color-primary)]"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-20 font-mono ${inputClass}`}
        />
      </div>
    );
  }

  if (meta.control === 'font-family') {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`w-44 ${inputClass}`}>
        <option value="var(--font-body)">Body font</option>
        <option value="var(--font-heading)">Heading font</option>
        <option value="inherit">Inherit</option>
        {GOOGLE_FONTS.map((f) => (
          <option key={f} value={`'${f}', system-ui, sans-serif`}>
            {f}
          </option>
        ))}
      </select>
    );
  }

  if (meta.control === 'weight') {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`w-36 ${inputClass}`}>
        {FONT_WEIGHT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (meta.control === 'shadow') {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`w-36 ${inputClass}`}>
        {SHADOW_PRESETS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        <option value={value}>Custom…</option>
      </select>
    );
  }

  if (meta.control === 'select' && meta.options) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`w-40 ${inputClass}`}>
        {meta.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (meta.control === 'toggle') {
    const on = value === 'true' || value === '1';
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(on ? 'false' : 'true')}
        className={`relative w-10 h-5 rounded-full transition-colors ${on ? 'bg-[var(--color-primary)]' : 'bg-gray-300 dark:bg-gray-600'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`}
        />
      </button>
    );
  }

  if (meta.tokenKey === 'modal-overlay-opacity') {
    const pct = Math.round(parseFloat(value) * 100) || 50;
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="range"
          min={0}
          max={90}
          value={pct}
          onInput={(e) => onChange(String(Number((e.target as HTMLInputElement).value) / 100))}
          onChange={(e) => onChange(String(Number(e.target.value) / 100))}
          className="w-24 accent-[var(--color-primary)]"
        />
        <span className="text-xs text-[var(--color-text-muted)] w-8">{pct}%</span>
      </div>
    );
  }

  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} className={`w-48 font-mono ${inputClass}`} />
  );
}
