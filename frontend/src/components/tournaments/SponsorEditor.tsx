import { useId } from 'react';

export type SponsorSupportType = 'cash' | 'inkind';

export interface SponsorEditorRow {
  name?: string;
  support_type?: SponsorSupportType;
  amount?: number | null;
  description?: string;
  display_order?: number;
}

interface SponsorEditorProps {
  /** Existing sponsors to edit (from the API) or empty rows for creation. */
  value?: SponsorEditorRow[];
  onChange: (rows: SponsorEditorRow[]) => void;
}

/**
 * Minimal tournament-level sponsor editor. One row per sponsor:
 *  - name required
 *  - support type CASH | IN-KIND
 *  - CASH ⇒ amount field (required, > 0, financially meaningful tournament
 *    revenue — record-only in this phase, no GL)
 *  - IN-KIND ⇒ description field only (no amount input at all)
 * Multiple sponsors, deterministic order, add/remove + up/down reorder.
 */
export default function SponsorEditor({ value = [], onChange }: SponsorEditorProps) {
  const uid = useId();
  const rows = value;

  const update = (i: number, patch: Partial<SponsorEditorRow>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, { support_type: 'cash' }]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text)]">Sponsors</span>
        <button type="button" onClick={add}
          className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg)]">
          + Add Sponsor
        </button>
      </div>

      {rows.length === 0 && <p className="text-xs text-[var(--color-text-muted)]">No sponsors yet.</p>}

      {rows.map((s, i) => {
        const isCash = s.support_type !== 'inkind';
        return (
          <div key={`${uid}-${i}`} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--color-text-muted)] mb-1">Sponsor Name *</label>
                    <input
                      value={s.name ?? ''}
                      onChange={(e) => update(i, { name: e.target.value })}
                      placeholder="Sponsor name"
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--color-text-muted)] mb-1">Support Type</label>
                    <select
                      value={s.support_type ?? 'cash'}
                      onChange={(e) => update(i, { support_type: e.target.value as SponsorSupportType, amount: e.target.value === 'inkind' ? null : s.amount })}
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm">
                      <option value="cash">Cash</option>
                      <option value="inkind">In-kind</option>
                    </select>
                  </div>
                </div>

                {isCash ? (
                  <div className="max-w-[240px]">
                    <label className="block text-xs text-[var(--color-text-muted)] mb-1">Cash Amount *</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={s.amount == null ? '' : String(s.amount)}
                      onChange={(e) => update(i, { amount: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-[var(--color-text-muted)] mb-1">Description *</label>
                    <textarea
                      rows={2}
                      value={s.description ?? ''}
                      onChange={(e) => update(i, { description: e.target.value })}
                      placeholder="e.g. trophies, medals, gifts, equipment, products"
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 shrink-0">
                <button type="button" title="Move up" onClick={() => move(i, -1)} disabled={i === 0}
                  className="px-2 py-0.5 text-xs border rounded disabled:opacity-30">↑</button>
                <button type="button" title="Move down" onClick={() => move(i, 1)} disabled={i === rows.length - 1}
                  className="px-2 py-0.5 text-xs border rounded disabled:opacity-30">↓</button>
                <button type="button" title="Remove" onClick={() => remove(i)}
                  className="px-2 py-0.5 text-xs border rounded text-[var(--color-error)]">✕</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}