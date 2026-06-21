import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner } from '../../../components/ui';

interface LocalePackRow {
  key: string;
  default_value: string;
  module_slug: string;
  element_type: string;
  element_label: string;
  translated_value: string | null;
}

type RowStatus = 'idle' | 'saved' | 'error';

interface LocalePackEditorModalProps {
  locale: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function LocalePackEditorModal({ locale, onClose, onSaved }: LocalePackEditorModalProps) {
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, RowStatus>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin', 'translations', 'locale-pack', locale],
    queryFn: () => api.get(`/translations/locale-pack/${locale}`).then((r) => r.data.data as LocalePackRow[]),
  });

  const upsertMutation = useMutation({
    mutationFn: (payload: { key: string; locale: string; value: string }) =>
      api.post('/translations/upsert', payload),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.key.toLowerCase().includes(q) ||
        r.default_value.toLowerCase().includes(q) ||
        (r.translated_value || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const getValue = (row: LocalePackRow) =>
    draft[row.key] !== undefined ? draft[row.key] : (row.translated_value ?? '');

  const saveRow = async (row: LocalePackRow) => {
    const value = getValue(row);
    const previous = row.translated_value ?? '';
    if (value === previous) return;
    try {
      await upsertMutation.mutateAsync({ key: row.key, locale, value });
      setStatus((s) => ({ ...s, [row.key]: 'saved' }));
      onSaved();
      setTimeout(() => setStatus((s) => ({ ...s, [row.key]: 'idle' })), 2000);
    } catch {
      setStatus((s) => ({ ...s, [row.key]: 'error' }));
    }
  };

  return (
    <Modal open onClose={onClose} title={`Translate — ${locale.toUpperCase()}`}>
      <p className="text-sm text-[var(--color-text-muted)] mb-4">
        English defaults are shown for reference. Translations save automatically when you leave each field.
      </p>
      <input
        type="text"
        placeholder="Filter keys..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 text-sm border rounded-[var(--radius-md)] bg-[var(--color-bg)] mb-4"
      />

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
          {filtered.map((row) => (
            <div key={row.key} className="border border-[var(--color-border)] rounded-[var(--radius-md)] p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <code className="text-xs text-[var(--color-text)] break-all">{row.key}</code>
                {status[row.key] === 'saved' && (
                  <span className="text-[10px] text-[var(--color-success-text)] shrink-0">Saved</span>
                )}
                {status[row.key] === 'error' && (
                  <span className="text-[10px] text-[var(--color-error-text)] shrink-0">Save failed</span>
                )}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mb-2">{row.default_value}</p>
              <input
                value={getValue(row)}
                onChange={(e) => setDraft((d) => ({ ...d, [row.key]: e.target.value }))}
                onBlur={() => saveRow(row)}
                placeholder="Translation..."
                className="w-full px-3 py-2 text-sm border rounded-[var(--radius-md)] bg-[var(--color-bg)]"
              />
            </div>
          ))}
          {!filtered.length && (
            <p className="text-center text-sm text-[var(--color-text-muted)] py-6">No keys match your filter.</p>
          )}
        </div>
      )}

      <div className="flex justify-end mt-4">
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}
