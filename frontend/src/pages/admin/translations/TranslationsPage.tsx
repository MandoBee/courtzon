import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Card, Modal, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import LocalePackEditorModal from './LocalePackEditorModal';

interface GridRow {
  key: string;
  defaultValue: string;
  moduleSlug: string;
  elementType: string;
  elementLabel: string;
  translations: Record<string, string>;
}

interface GridResponse {
  data: GridRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  locales: string[];
  localesWithPacks: string[];
}

type CellStatus = 'idle' | 'saved' | 'error';

export default function TranslationsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('');
  const [elementType, setElementType] = useState('');
  const [cellStatus, setCellStatus] = useState<Record<string, CellStatus>>({});
  const [newLocaleOpen, setNewLocaleOpen] = useState(false);
  const [newLocale, setNewLocale] = useState('');
  const [editorLocale, setEditorLocale] = useState<string | null>(null);

  const { data: grid, isLoading } = useQuery({
    queryKey: ['admin', 'translations', 'grid', page, search, module, elementType],
    queryFn: () =>
      api
        .get('/translations/grid', {
          params: {
            page,
            limit: 50,
            search: search || undefined,
            module: module || undefined,
            elementType: elementType || undefined,
          },
        })
        .then((r) => r.data as GridResponse),
  });

  const { data: modules = [] } = useQuery({
    queryKey: ['admin', 'translations', 'modules'],
    queryFn: () => api.get('/translations/modules').then((r: any) => r.data.data as string[]),
  });

  const { data: elementTypes = [] } = useQuery({
    queryKey: ['admin', 'translations', 'element-types'],
    queryFn: () => api.get('/translations/element-types').then((r: any) => r.data.data as string[]),
  });

  const { data: languages = [] } = useQuery({
    queryKey: ['public', 'languages'],
    queryFn: () => api.get('/public/languages').then((r: any) => r.data.data as { code: string; native_name: string }[]),
  });

  const nonEnLanguages = languages.filter((l) => l.code !== 'en');
  const displayLocales = (grid?.locales || []).slice(0, 5);

  const syncMutation = useMutation({
    mutationFn: () => api.post('/translations/sync-keys'),
    onSuccess: (res) => {
      const d = res.data?.data;
      queryClient.invalidateQueries({ queryKey: ['admin', 'translations'] });
      showToast(`Synced ${d?.inserted ?? 0} new keys (${d?.skipped ?? 0} already in catalog)`);
    },
    onError: (err: any) => showToast(err.response?.data?.message || 'Sync failed', 'error'),
  });

  const localePackMutation = useMutation({
    mutationFn: (locale: string) => api.post('/translations/locale-pack', { locale }),
    onSuccess: (_res, locale) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'translations'] });
      setNewLocaleOpen(false);
      setEditorLocale(locale);
      showToast(`Created translation pack for ${locale}`);
    },
    onError: (err: any) => showToast(err.response?.data?.message || 'Failed to create locale pack', 'error'),
  });

  const upsertMutation = useMutation({
    mutationFn: (payload: { key: string; locale: string; value: string }) =>
      api.post('/translations/upsert', payload),
  });

  const cellKey = (rowKey: string, locale: string) => `${rowKey}::${locale}`;

  const saveCell = async (rowKey: string, locale: string, value: string) => {
    const id = cellKey(rowKey, locale);
    try {
      await upsertMutation.mutateAsync({ key: rowKey, locale, value });
      setCellStatus((s) => ({ ...s, [id]: 'saved' }));
      setTimeout(() => setCellStatus((s) => ({ ...s, [id]: 'idle' })), 2000);
    } catch {
      setCellStatus((s) => ({ ...s, [id]: 'error' }));
    }
  };

  const localesWithPack = grid?.localesWithPacks || [];
  const availableForNew = nonEnLanguages.filter((l) => !localesWithPack.includes(l.code));

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Translation Manager</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Can permission="translations.sync">
            <Button variant="ghost" onClick={() => syncMutation.mutate()} loading={syncMutation.isPending}>
              Sync Keys
            </Button>
          </Can>
          <Can permission="translations.create">
            <Button onClick={() => setNewLocaleOpen(true)}>+ New Translation</Button>
          </Can>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Search keys or English text..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-[200px] max-w-md px-3 py-2 text-sm rounded-[var(--radius-md)] border bg-[var(--color-bg)]"
        />
        <select
          value={module}
          onChange={(e) => { setModule(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm rounded-[var(--radius-md)] border bg-[var(--color-bg)]"
        >
          <option value="">All modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          value={elementType}
          onChange={(e) => { setElementType(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm rounded-[var(--radius-md)] border bg-[var(--color-bg)]"
        >
          <option value="">All types</option>
          {elementTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {displayLocales.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {displayLocales.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setEditorLocale(loc)}
                className="px-2.5 py-1 text-xs rounded-full border border-[var(--color-border)] hover:bg-[var(--color-primary-bg)]"
              >
                Edit {loc.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : !grid?.data.length ? (
        <Card>
          <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">
            No keys yet. Click <strong>Sync Keys</strong> to import from the code registry.
          </p>
        </Card>
      ) : (
        <>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                    <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)] min-w-[180px]">Key</th>
                    <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)] min-w-[160px]">English (default)</th>
                    {displayLocales.map((loc) => (
                      <th key={loc} className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)] min-w-[140px] uppercase text-xs">
                        {loc}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {grid.data.map((row) => (
                    <tr key={row.key} className="hover:bg-[var(--color-bg)]/30 align-top">
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs text-[var(--color-text)] truncate max-w-[200px]" title={row.key}>{row.key}</div>
                        <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{row.moduleSlug} · {row.elementType}</div>
                      </td>
                      <td className="px-3 py-2 text-[var(--color-text-muted)] text-xs">{row.defaultValue}</td>
                      {displayLocales.map((loc) => {
                        const id = cellKey(row.key, loc);
                        const status = cellStatus[id] || 'idle';
                        return (
                          <td key={loc} className="px-3 py-2">
                            <GridCellInput
                              defaultValue={row.translations[loc] || ''}
                              placeholder={row.defaultValue}
                              onSave={(value) => saveCell(row.key, loc, value)}
                            />
                            {status === 'saved' && (
                              <span className="text-[10px] text-[var(--color-success-text)]">Saved</span>
                            )}
                            {status === 'error' && (
                              <span className="text-[10px] text-[var(--color-error-text)]">Save failed</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-[var(--color-text-muted)]">
            <span>
              Page {grid.meta.page} of {grid.meta.totalPages} ({grid.meta.total} keys)
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="ghost" disabled={page >= grid.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}

      <Modal open={newLocaleOpen} onClose={() => setNewLocaleOpen(false)} title="New Translation Locale">
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          This will copy all translation keys and create empty rows for the selected locale so you can fill in translations.
        </p>
        <label className="block text-xs text-[var(--color-text-muted)] mb-1">Locale</label>
        <select
          value={newLocale}
          onChange={(e) => setNewLocale(e.target.value)}
          className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm mb-6"
        >
          <option value="">Select language...</option>
          {availableForNew.map((l) => (
            <option key={l.code} value={l.code}>{l.native_name} ({l.code})</option>
          ))}
        </select>
        {availableForNew.length === 0 && (
          <p className="text-xs text-[var(--color-warning-text)] mb-4">All active languages already have translation packs.</p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setNewLocaleOpen(false)}>Cancel</Button>
          <Button
            disabled={!newLocale}
            loading={localePackMutation.isPending}
            onClick={() => localePackMutation.mutate(newLocale)}
          >
            Create &amp; Translate
          </Button>
        </div>
      </Modal>

      {editorLocale && (
        <LocalePackEditorModal
          locale={editorLocale}
          onClose={() => setEditorLocale(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['admin', 'translations', 'grid'] })}
        />
      )}
    </div>
  );
}

function GridCellInput({
  defaultValue,
  placeholder,
  onSave,
}: {
  defaultValue: string;
  placeholder: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== defaultValue) onSave(value);
      }}
      placeholder={placeholder}
      className="w-full px-2 py-1.5 text-xs border rounded-[var(--radius-sm)] bg-[var(--color-bg)]"
    />
  );
}
