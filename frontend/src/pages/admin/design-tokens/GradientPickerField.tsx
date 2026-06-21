import { useMemo, useState } from 'react';
import { ColorPickerField } from './ColorPickerField';
import {
  buildLinearGradient,
  parseLinearGradient,
  DEFAULT_GRADIENTS,
} from '../../../theme/gradient-utils';

const inputClass =
  'px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text)] w-full font-mono';

export function GradientPickerField({
  tokenKey,
  value,
  onChange,
}: {
  tokenKey: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const parsed = useMemo(() => {
    return (
      parseLinearGradient(value) ??
      parseLinearGradient(DEFAULT_GRADIENTS[tokenKey] ?? DEFAULT_GRADIENTS['gradient-primary']) ?? {
        angle: 135,
        colors: ['#059669', '#10B981'],
      }
    );
  }, [value, tokenKey]);

  const angle = parsed.angle;
  const colors = parsed.colors;

  const updateAngle = (deg: number) => onChange(buildLinearGradient(deg, colors));
  const updateColor = (index: number, hex: string) => {
    const next = [...colors];
    next[index] = hex;
    onChange(buildLinearGradient(angle, next));
  };
  const addStop = () => {
    if (colors.length >= 4) return;
    const mid = colors.length === 2 ? colors[0] : colors[Math.floor(colors.length / 2)];
    const next = colors.length === 2 ? [colors[0], mid, colors[1]] : [...colors, colors[colors.length - 1]];
    onChange(buildLinearGradient(angle, next));
  };
  const removeStop = (index: number) => {
    if (colors.length <= 2) return;
    const next = colors.filter((_, i) => i !== index);
    onChange(buildLinearGradient(angle, next));
  };

  return (
    <div className="space-y-3 w-full max-w-md">
      <div
        className="h-12 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-inner"
        style={{ background: value }}
        title="Live gradient preview"
      />

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10px] font-medium text-[var(--color-text-muted)]">
            Direction
          </label>
          <span className="text-[10px] font-mono text-[var(--color-text)]">{Math.round(angle)}°</span>
        </div>
        <input
          type="range"
          min={0}
          max={360}
          value={angle}
          onChange={(e) => updateAngle(Number(e.target.value))}
          onInput={(e) => updateAngle(Number((e.target as HTMLInputElement).value))}
          className="w-full accent-[var(--color-primary)]"
        />
        <div className="flex justify-between text-[9px] text-[var(--color-text-muted)]">
          <span>↑ 0°</span>
          <span>→ 90°</span>
          <span>↓ 180°</span>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-medium text-[var(--color-text-muted)]">Colors</p>
        {colors.map((color, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-text-muted)] w-14 shrink-0">
              {i === 0 ? 'Start' : i === colors.length - 1 ? 'End' : `Mid ${i}`}
            </span>
            <div className="flex-1 min-w-0">
              <ColorPickerField value={color} onChange={(v) => updateColor(i, v)} allowVar={false} />
            </div>
            {colors.length > 2 && (
              <button
                type="button"
                onClick={() => removeStop(i)}
                className="text-[10px] text-[var(--color-error-text)] hover:underline shrink-0"
                title="Remove this color stop"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {colors.length < 4 && (
          <button
            type="button"
            onClick={addStop}
            className="text-[10px] text-[var(--color-primary)] hover:underline"
          >
            + Add middle color
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((s) => !s)}
        className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        {showAdvanced ? 'Hide' : 'Show'} advanced CSS
      </button>
      {showAdvanced && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
          placeholder="linear-gradient(135deg, #059669 0%, #10B981 100%)"
        />
      )}
    </div>
  );
}
