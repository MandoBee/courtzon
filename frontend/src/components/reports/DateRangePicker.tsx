import { useState } from 'react';
import { apiDateRange, localToday } from '../../utils/dateRange';

interface DateRangePickerProps {
  onChange: (from: string, to: string) => void;
}

const presets: { label: string; getValue: () => { from: string; to: string } }[] = [
  { label: 'Today', getValue: () => ({ from: localToday(), to: localToday() }) },
  { label: 'Last 7 Days', getValue: () => {
    const r = apiDateRange(7); return r;
  }},
  { label: 'Last 30 Days', getValue: () => {
    const r = apiDateRange(30); return r;
  }},
  { label: 'Last 90 Days', getValue: () => {
    const r = apiDateRange(90); return r;
  }},
  { label: 'YTD', getValue: () => {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    return { from: fmt(from), to: fmt(to) };
  }},
  { label: 'All Time', getValue: () => ({ from: '', to: '' }) },
];

export default function DateRangePicker({ onChange }: DateRangePickerProps) {
  const [selected, setSelected] = useState('Last 30 Days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const apply = (preset: typeof presets[0]) => {
    setSelected(preset.label);
    if (preset.label === 'Custom') {
      onChange(customFrom, customTo);
    } else {
      setCustomFrom('');
      setCustomTo('');
      const v = preset.getValue();
      onChange(v.from, v.to);
    }
  };

  const handleCustom = () => {
    setSelected('Custom');
    onChange(customFrom, customTo);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {presets.map((p) => (
        <button key={p.label} onClick={() => apply(p)}
          className={`px-3 py-1.5 text-xs rounded-[var(--radius-md)] border transition-colors ${
            selected === p.label ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] hover:bg-[var(--color-bg)]'
          }`}>
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1">
        <input type="date" value={customFrom}
          onChange={(e) => { setCustomFrom(e.target.value); setSelected('Custom'); }}
          className="px-2 py-1.5 text-xs border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-[var(--color-text)] w-32" />
        <span className="text-xs text-[var(--color-text-muted)]">to</span>
        <input type="date" value={customTo}
          onChange={(e) => { setCustomTo(e.target.value); setSelected('Custom'); }}
          className="px-2 py-1.5 text-xs border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-[var(--color-text)] w-32" />
        <button onClick={handleCustom}
          className="px-3 py-1.5 text-xs rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white">
          Go
        </button>
      </div>
    </div>
  );
}
