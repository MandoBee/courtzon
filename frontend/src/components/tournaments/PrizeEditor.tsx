import { useState } from 'react';

export type PrizeType = 'cash' | 'gold' | 'silver' | 'bronze' | 'trophy' | 'gift' | 'other';

export interface PrizeEditorRow {
  placement?: number | null;
  prize_type: PrizeType;
  description?: string;
  amount?: number | null;
  currency_code?: string | null;
}

interface PrizeEditorProps {
  /** Authoritative Tournament currency (server-resolved) — never hardcoded. */
  currencyCode?: string | null;
  /** Existing prizes to edit (from the API). */
  value?: PrizeEditorRow[];
  onChange: (rows: PrizeEditorRow[]) => void;
}

const PRIZE_TYPES: { value: PrizeType; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'gold', label: 'Gold Medal' },
  { value: 'silver', label: 'Silver Medal' },
  { value: 'bronze', label: 'Bronze Medal' },
  { value: 'trophy', label: 'Trophy' },
  { value: 'gift', label: 'Gift' },
  { value: 'other', label: 'Other' },
];

const PLACEMENT_LABELS: Record<string, string> = {
  '1': '1st Place',
  '2': '2nd Place',
  '3': '3rd Place',
};

/**
 * Structured Tournament prize editor. Supports MULTIPLE prizes per placement.
 * Amount + currency are shown ONLY for cash prizes; non-cash rows show
 * description only. Currency is always the authoritative tournament currency —
 * the user never enters it manually.
 */
export function PrizeEditor({ currencyCode, value = [], onChange }: PrizeEditorProps) {
  const [rows, setRows] = useState<PrizeEditorRow[]>(value.length ? value : [{ prize_type: 'cash' }]);

  const updateRow = (index: number, patch: Partial<PrizeEditorRow>) => {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    setRows(next);
    onChange(next);
  };

  const addRow = () => {
    const newRow: PrizeEditorRow = { prize_type: 'cash' };
    const next = [...rows, newRow];
    setRows(next);
    onChange(next);
  };

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--color-text)]">Prizes</p>
        <button type="button" onClick={addRow}
          className="text-xs px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
          + Add Prize
        </button>
      </div>

      {rows.length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">No prizes configured.</p>
      )}

      {rows.map((row, i) => (
        <div key={i} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 space-y-2 bg-[var(--color-bg)]/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Prize #{i + 1}</span>
            <button type="button" onClick={() => removeRow(i)}
              className="text-xs text-[var(--color-danger)] hover:underline">
              Remove
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Placement</label>
              <select
                value={row.placement == null ? '' : String(row.placement)}
                onChange={(e) => updateRow(i, { placement: e.target.value ? Number(e.target.value) : null })}
                className="w-full px-2 py-1.5 rounded border border-[var(--color-border)] text-sm bg-[var(--color-surface)]">
                <option value="">Special Prize</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                  <option key={p} value={p}>{PLACEMENT_LABELS[String(p)] || `${p}th Place`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Prize Type</label>
              <select
                value={row.prize_type}
                onChange={(e) => updateRow(i, { prize_type: e.target.value as PrizeType })}
                className="w-full px-2 py-1.5 rounded border border-[var(--color-border)] text-sm bg-[var(--color-surface)]">
                {PRIZE_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>{pt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Description</label>
            <input
              value={row.description ?? ''}
              onChange={(e) => updateRow(i, { description: e.target.value })}
              placeholder={row.prize_type === 'cash' ? 'e.g. 1st place prize' : 'e.g. Gold medal'}
              className="w-full px-2 py-1.5 rounded border border-[var(--color-border)] text-sm bg-[var(--color-surface)]"
            />
          </div>

          {row.prize_type === 'cash' ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Amount</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.amount ?? ''}
                  onChange={(e) => updateRow(i, { amount: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-2 py-1.5 rounded border border-[var(--color-border)] text-sm bg-[var(--color-surface)]"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Currency</label>
                <div className="px-2 py-1.5 rounded border border-[var(--color-border)] text-sm bg-[var(--color-bg)] text-[var(--color-text-muted)]">
                  {currencyCode || '—'}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-[var(--color-text-muted)]">Non-cash prize — no amount or currency.</p>
          )}
        </div>
      ))}
    </div>
  );
}