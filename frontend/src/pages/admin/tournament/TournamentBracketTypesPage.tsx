import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import {
  bracketTypeApi,
  type BracketTypeRow,
  type BracketTypeDetail,
  type BracketTypeRegistryEntry,
  type BracketEngineCapability,
} from '../../../services/tournament';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { Card, Badge, Button, SkeletonRow } from '../../../components/ui';
import { Modal } from '../../../components/ui/Modal';
import { getErrorMessage } from '../../../utils/errors';
import { formatISODate } from '../../../utils/formatDate';

/**
 * Group 5B-SR — Tournament Bracket Type Management (Step 2A + Step 2B-2 CRUD).
 *
 * Capability is ALWAYS read from the backend (`engine_capability`,
 * `creation_available`, `referenced_count`); the frontend never re-derives it,
 * never hard-codes a capability list, and never treats `is_active` as engine
 * executability. CRUD actions use the established backend contract:
 *   POST/GET-list/GET-by-id/PUT/DELETE /admin/bracket-types(/:id).
 * The backend remains the final authority for engine safety, dependencies,
 * canonical protection and validation.
 */

type CapabilityEntry =
  | { kind: 'db'; row: BracketTypeRow }
  | { kind: 'registry'; entry: BracketTypeRegistryEntry };

type StatusFilter = 'all' | 'active' | 'inactive' | 'ready' | 'planned' | 'unsupported';

const CAPABILITY_BADGE: Record<BracketEngineCapability, 'success' | 'warning' | 'danger'> = {
  ready: 'success',
  planned: 'warning',
  unsupported: 'danger',
};

const KEY_LABELS: Record<string, string> = {
  rounds: 'Rounds',
  seeding: 'Seeding',
  groups: 'Groups',
  advance: 'Advance',
  losers_bracket: 'Losers bracket',
  pairing: 'Pairing',
  best_of: 'Best of',
  first_to: 'First to',
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Map backend business error codes to friendly i18n keys (fallback: backend message). */
function bracketErrorMessage(err: unknown, t: (k: string, d?: string) => string): string {
  const data = (err as any)?.response?.data;
  const code = typeof data?.code === 'string' ? data.code : undefined;
  const map: Record<string, [string, string]> = {
    TOURNAMENT_BRACKET_DUPLICATE: ['tournaments.bracket_types.error.duplicate', 'A bracket type with this slug already exists.'],
    TOURNAMENT_BRACKET_IN_USE: ['tournaments.bracket_types.error.in_use', 'This format is in use and cannot be changed right now.'],
    TOURNAMENT_BRACKET_CANONICAL: ['tournaments.bracket_types.error.canonical', 'This is a canonical engine format and cannot be removed.'],
    TOURNAMENT_BRACKET_INVALID_CONFIG: ['tournaments.bracket_types.error.invalid_config', 'Config Schema must be valid JSON.'],
    TOURNAMENT_BRACKET_ENGINE_UNSUPPORTED: ['tournaments.bracket_types.error.engine_unsupported', 'This format cannot be created or activated — its engine is not available.'],
    TOURNAMENT_BRACKET_ENGINE_DEPENDENCY: ['tournaments.bracket_types.error.dependency', 'Deactivation is blocked while active or future tournaments depend on this format.'],
  };
  const entry = code ? map[code] : undefined;
  if (entry) return t(entry[0], entry[1]);
  return getErrorMessage(err);
}

function humanizeKey(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatConfigValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.map(formatConfigValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Stored schema summary — never labelled as engine behavior. */
function summarizeStoredSchema(schema: string | null): Array<{ key: string; value: string }> {
  if (!schema) return [];
  try {
    const parsed = JSON.parse(schema);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [{ key: 'Schema', value: schema }];
    }
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0) return [{ key: 'Schema', value: schema }];
    const rows = entries.slice(0, 4).map(([k, v]) => ({ key: humanizeKey(k), value: formatConfigValue(v) }));
    const extra = entries.length - rows.length;
    if (extra > 0) rows.push({ key: 'More', value: `+${extra} more` });
    return rows;
  } catch {
    return [{ key: 'Schema', value: schema }];
  }
}

function prettyJson(schema: string): string {
  try {
    return JSON.stringify(JSON.parse(schema), null, 2);
  } catch {
    return schema;
  }
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-start sm:gap-4">
      <dt className="w-full shrink-0 text-xs text-[var(--color-text-muted)] sm:w-44">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm break-words text-[var(--color-text)]">{children}</dd>
    </div>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-[var(--color-error)]" data-testid="field-error">
      {children}
    </p>
  );
}

function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" data-testid="form-error" className="rounded-[var(--radius-md)] border border-[var(--color-error)]/40 bg-[var(--color-error-bg)] px-3 py-2 text-sm text-[var(--color-error)]">
      {children}
    </div>
  );
}

function capabilityLabel(t: (k: string, d?: string) => string, cap: BracketEngineCapability): string {
  if (cap === 'ready') return t('tournaments.bracket_types.cap.ready', 'Ready');
  if (cap === 'planned') return t('tournaments.bracket_types.cap.planned', 'Planned');
  return t('tournaments.bracket_types.cap.unsupported', 'Unsupported');
}

const inputCls =
  'min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-primary)]';
const labelCls = 'mb-1 block text-xs font-medium text-[var(--color-text-muted)]';

export default function TournamentBracketTypesPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<BracketTypeRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<BracketTypeRow | null>(null);
  const [viewEntry, setViewEntry] = useState<CapabilityEntry | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<BracketTypeRow | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-bracket-types'],
    queryFn: () => bracketTypeApi.listAll(),
  });

  const rows: BracketTypeRow[] = data?.data ?? [];
  const registry: BracketTypeRegistryEntry[] = data?.registry ?? [];

  const combined = useMemo<CapabilityEntry[]>(
    () => [
      ...rows.map((row) => ({ kind: 'db' as const, row })),
      ...registry.map((entry) => ({ kind: 'registry' as const, entry })),
    ],
    [rows, registry],
  );

  const entryCapability = (e: CapabilityEntry): BracketEngineCapability =>
    e.kind === 'db' ? e.row.engine_capability : e.entry.engine_capability;
  const entryName = (e: CapabilityEntry): string => (e.kind === 'db' ? e.row.name : e.entry.name);
  const entrySlug = (e: CapabilityEntry): string => (e.kind === 'db' ? e.row.slug : e.entry.format);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return combined.filter((entry) => {
      const capability = entryCapability(entry);
      if (statusFilter === 'active' && (entry.kind !== 'db' || !entry.row.is_active)) return false;
      if (statusFilter === 'inactive' && (entry.kind !== 'db' || entry.row.is_active)) return false;
      if (statusFilter === 'ready' && capability !== 'ready') return false;
      if (statusFilter === 'planned' && capability !== 'planned') return false;
      if (statusFilter === 'unsupported' && capability !== 'unsupported') return false;
      if (q) {
        const haystack = `${entryName(entry)} ${entrySlug(entry)}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [combined, statusFilter, search]);

  const metrics = useMemo(
    () => ({
      total: combined.length,
      active: rows.filter((r) => r.is_active).length,
      ready: combined.filter((e) => entryCapability(e) === 'ready').length,
      planned: combined.filter((e) => entryCapability(e) === 'planned').length,
    }),
    [combined, rows],
  );

  const hasFilters = statusFilter !== 'all' || search.trim() !== '';
  const resetFilters = () => {
    setStatusFilter('all');
    setSearch('');
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['admin-bracket-types'] });
    qc.invalidateQueries({ queryKey: ['bracket-types'] });
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => bracketTypeApi.setActive(id, isActive),
    onSuccess: () => {
      invalidateAll();
      setConfirmTarget(null);
      showToast(t('tournaments.bracket_types.updated', 'Bracket type updated'), 'success');
    },
    onError: (err) => {
      showToast(bracketErrorMessage(err, t), 'error');
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; slug: string; config_schema?: string }) => bracketTypeApi.create(payload),
    onSuccess: () => {
      invalidateAll();
      setCreateOpen(false);
      showToast(t('tournaments.bracket_types.created', 'Bracket type created'), 'success');
    },
    onError: (err) => {
      showToast(bracketErrorMessage(err, t), 'error');
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { name?: string; config_schema?: string } }) =>
      bracketTypeApi.update(id, payload),
    onSuccess: () => {
      invalidateAll();
      setEditRow(null);
      showToast(t('tournaments.bracket_types.updated', 'Bracket type updated'), 'success');
    },
    onError: (err) => {
      showToast(bracketErrorMessage(err, t), 'error');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => bracketTypeApi.remove(id),
    onSuccess: () => {
      invalidateAll();
      setDeleteRow(null);
      showToast(t('tournaments.bracket_types.removed', 'Bracket type removed from active management'), 'success');
    },
    onError: (err) => {
      showToast(bracketErrorMessage(err, t), 'error');
    },
  });

  const activate = (row: BracketTypeRow) => toggleMutation.mutate({ id: row.id, isActive: true });
  const confirmDeactivate = () => {
    if (confirmTarget) toggleMutation.mutate({ id: confirmTarget.id, isActive: false });
  };

  // ── Detail fetch for the View modal (DB rows only; GSK is registry metadata) ──
  const { data: detail, isFetching: detailLoading, isError: detailError, refetch: refetchDetail } = useQuery({
    queryKey: ['bracket-type-detail', viewId],
    queryFn: () => bracketTypeApi.getDetail(Number(viewId)),
    enabled: viewId != null,
  });

  const openView = (entry: CapabilityEntry) => {
    setViewEntry(entry);
    setViewId(entry.kind === 'db' ? entry.row.id : null);
  };
  const closeView = () => {
    setViewEntry(null);
    setViewId(null);
  };

  const metricCards: Array<{ label: string; value: number; hint: string }> = [
    { label: t('tournaments.bracket_types.metric.total', 'Total Formats'), value: metrics.total, hint: t('tournaments.bracket_types.metric.total_hint', 'Including composite engine formats') },
    { label: t('tournaments.bracket_types.metric.active', 'Active'), value: metrics.active, hint: t('tournaments.bracket_types.metric.active_hint', 'Operationally active records (is_active)') },
    { label: t('tournaments.bracket_types.metric.ready', 'Engine Ready'), value: metrics.ready, hint: t('tournaments.bracket_types.metric.ready_hint', 'Can be created with the current engine') },
    { label: t('tournaments.bracket_types.metric.planned', 'Planned'), value: metrics.planned, hint: t('tournaments.bracket_types.metric.planned_hint', 'Engine not implemented yet') },
  ];

  const filterOptions: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: t('tournaments.bracket_types.filter.all', 'All') },
    { key: 'active', label: t('tournaments.bracket_types.filter.active', 'Active') },
    { key: 'inactive', label: t('tournaments.bracket_types.filter.inactive', 'Inactive') },
    { key: 'ready', label: t('tournaments.bracket_types.filter.ready', 'Engine Ready') },
    { key: 'planned', label: t('tournaments.bracket_types.filter.planned', 'Planned') },
    { key: 'unsupported', label: t('tournaments.bracket_types.filter.unsupported', 'Unsupported') },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header (Create is functional in Step 2B-2) ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('tournaments.bracket_types.title', 'Bracket Types')}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {t('tournaments.bracket_types.subtitle', 'Manage tournament formats and their engine availability.')}
          </p>
        </div>
        <Can permission="tournament.bracket-types.manage">
          <Button type="button" onClick={() => setCreateOpen(true)}>
            {t('tournaments.bracket_types.create', 'Create Bracket Type')}
          </Button>
        </Can>
      </div>

      {/* ── Summary metrics (computed from the API response, never hard-coded) ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="list" aria-label={t('tournaments.bracket_types.metric.total', 'Formats summary')}>
        {metricCards.map((m) => (
          <div
            key={m.label}
            role="listitem"
            className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            title={m.hint}
          >
            <p className="text-xs text-[var(--color-text-muted)]">{m.label}</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">{m.value}</p>
          </div>
        ))}
      </div>

      {/* ── Filters + search ── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('tournaments.bracket_types.filter.all', 'Filter bracket types')}>
          {filterOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setStatusFilter(opt.key)}
              aria-pressed={statusFilter === opt.key}
              className={`min-h-[44px] rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === opt.key
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs text-[var(--color-text-muted)]">{t('tournaments.bracket_types.search_label', 'Search')}</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('tournaments.bracket_types.search_placeholder', 'Name or slug…')}
            aria-label={t('tournaments.bracket_types.search_placeholder', 'Name or slug…')}
            className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-primary)] lg:w-64"
          />
        </label>
      </div>

      {/* ── Table ── */}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm" aria-label={t('tournaments.bracket_types.title', 'Bracket Types')}>
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)]">
              <th className="px-4 py-3">{t('tournaments.bracket_types.name', 'Name')}</th>
              <th className="px-4 py-3">{t('tournaments.bracket_types.slug', 'Slug')}</th>
              <th className="px-4 py-3">{t('tournaments.bracket_types.col.engine', 'Engine')}</th>
              <th className="px-4 py-3">{t('tournaments.bracket_types.status', 'Status')}</th>
              <th className="px-4 py-3">{t('tournaments.bracket_types.col.scope', 'Scope')}</th>
              <th className="px-4 py-3">{t('tournaments.bracket_types.col.used_by', 'Used By')}</th>
              <th className="px-4 py-3">{t('tournaments.bracket_types.config', 'Configuration')}</th>
              <th className="px-4 py-3 text-right">{t('tournaments.bracket_types.col.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                  <td colSpan={8} className="px-4 py-3"><SkeletonRow count={1} /></td>
                </tr>
              ))}

            {!isLoading && isError && (
              <tr className="border-0">
                <td colSpan={8} className="px-4 py-10 text-center">
                  <p className="text-sm text-[var(--color-error)]">{t('tournaments.bracket_types.error.load', 'Unable to load bracket types.')}</p>
                  <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>
                    {t('tournaments.bracket_types.error.retry', 'Retry')}
                  </Button>
                </td>
              </tr>
            )}

            {!isLoading && !isError && filtered.length === 0 && (
              <tr className="border-0">
                <td colSpan={8} className="px-4 py-10 text-center">
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {hasFilters
                      ? t('tournaments.bracket_types.empty.filtered', 'No bracket types match the current filters.')
                      : t('tournaments.bracket_types.no_results', 'No bracket types found')}
                  </p>
                  {hasFilters && (
                    <Button variant="ghost" size="sm" className="mt-3" onClick={resetFilters}>
                      {t('tournaments.bracket_types.empty.reset', 'Reset filters')}
                    </Button>
                  )}
                </td>
              </tr>
            )}

            {!isLoading && !isError && filtered.map((entry) => {
              if (entry.kind === 'registry') {
                return <RegistryRow key={`reg-${entry.entry.format}`} entry={entry.entry} onView={() => setViewEntry(entry)} />;
              }
              const row = entry.row;
              const ready = row.engine_capability === 'ready';
              const removable = !ready && row.referenced_count === 0;
              return (
                <tr key={row.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]/30">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">{row.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.slug}</td>
                  <td className="px-4 py-3">
                    <Badge variant={CAPABILITY_BADGE[row.engine_capability]}>{capabilityLabel(t, row.engine_capability)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {ready ? (
                      <Badge variant={row.is_active ? 'success' : 'default'}>
                        {row.is_active ? t('tournaments.bracket_types.active', 'Active') : t('tournaments.bracket_types.inactive', 'Inactive')}
                      </Badge>
                    ) : (
                      <span className="inline-flex flex-col gap-0.5">
                        <Badge variant="warning">{t('tournaments.bracket_types.status.unavailable', 'Unavailable')}</Badge>
                        <span className="text-[10px] text-[var(--color-text-muted)]">
                          {t('tournaments.bracket_types.engine_not_available', 'Engine not available yet.')}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{t('tournaments.bracket_types.scope.global', 'Global')}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                    {t('tournaments.bracket_types.referenced', 'Used by {count} tournament(s)', { count: row.referenced_count })}
                  </td>
                  <td className="px-4 py-3">
                    {row.config_schema ? (
                      <div className="flex flex-col gap-0.5 text-xs text-[var(--color-text-muted)]">
                        {summarizeStoredSchema(row.config_schema).map((r) => (
                          <span key={r.key}>
                            <span className="font-medium text-[var(--color-text)]">{r.key}:</span> {r.value}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openView(entry)}>
                        {t('tournaments.bracket_types.action.view', 'View')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditRow(row)}>
                        {t('tournaments.bracket_types.action.edit', 'Edit')}
                      </Button>
                      {ready && (
                        row.is_active
                          ? (
                            <Can permission="tournament.bracket-types.manage">
                              <Button size="sm" variant="secondary" onClick={() => setConfirmTarget(row)}>
                                {t('tournaments.bracket_types.deactivate', 'Deactivate')}
                              </Button>
                            </Can>
                          )
                          : (
                            <Can permission="tournament.bracket-types.manage">
                              <Button size="sm" variant="primary" onClick={() => activate(row)}>
                                {t('tournaments.bracket_types.activate', 'Activate')}
                              </Button>
                            </Can>
                          )
                      )}
                      {removable && (
                        <Can permission="tournament.bracket-types.manage">
                          <Button size="sm" variant="danger" onClick={() => setDeleteRow(row)}>
                            {t('tournaments.bracket_types.action.remove', 'Remove')}
                          </Button>
                        </Can>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* ── CREATE modal (conditionally mounted so fields reset per open) ── */}
      {createOpen && (
        <CreateBracketTypeModal
          open
          onClose={() => setCreateOpen(false)}
          pending={createMutation.isPending}
          error={createMutation.isError ? (createMutation.error as Error) : null}
          onSubmit={(payload) => createMutation.mutate(payload)}
          t={t}
        />
      )}

      {/* ── EDIT modal (slug immutable) ── */}
      {editRow && (
        <EditBracketTypeModal
          open={editRow !== null}
          onClose={() => setEditRow(null)}
          row={editRow}
          pending={editMutation.isPending}
          error={editMutation.isError ? (editMutation.error as Error) : null}
          onSubmit={(payload) => editMutation.mutate({ id: editRow.id, payload })}
          t={t}
        />
      )}

      {/* ── DELETE / REMOVE modal (safe soft-removal via backend) ── */}
      {deleteRow && (
        <Modal
          open={deleteRow !== null}
          onClose={() => setDeleteRow(null)}
          title={t('tournaments.bracket_types.delete.title', 'Delete bracket type?')}
          size="sm"
          a11yDialog
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteRow(null)}>
                {t('tournaments.bracket_types.confirm.cancel', 'Cancel')}
              </Button>
              <Button variant="danger" loading={removeMutation.isPending} onClick={() => removeMutation.mutate(deleteRow.id)}>
                {t('tournaments.bracket_types.delete.confirm', 'Remove')}
              </Button>
            </div>
          }
        >
          <div className="space-y-3 text-sm text-[var(--color-text)]">
            <p>
              {t('tournaments.bracket_types.delete.body', 'Remove "{name}" ({slug}) from active management?', {
                name: deleteRow.name,
                slug: deleteRow.slug,
              })}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {t(
                'tournaments.bracket_types.delete.warning',
                'This uses the backend safe-removal lifecycle (deactivation). The backend blocks removal while the format is in use or is a canonical engine format.',
              )}
            </p>
            <FormError>{removeMutation.isError ? bracketErrorMessage(removeMutation.error, t) : null}</FormError>
          </div>
        </Modal>
      )}

      {/* ── VIEW: details (DB rows fetch GET by id; GSK keeps registry metadata) ── */}
      <Modal
        open={viewEntry !== null}
        onClose={closeView}
        title={viewEntry ? entryName(viewEntry) : ''}
        size="md"
        a11yDialog
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={closeView}>
              {t('tournaments.bracket_types.confirm.cancel', 'Close')}
            </Button>
          </div>
        }
      >
        {viewEntry?.kind === 'registry' && <RegistryDetail entry={viewEntry.entry} t={t} />}
        {viewEntry?.kind === 'db' && (
          <div className="space-y-4">
            {detailLoading && <div className="py-6"><SkeletonRow count={5} /></div>}
            {detailError && (
              <div className="py-6 text-center">
                <p className="text-sm text-[var(--color-error)]">{t('tournaments.bracket_types.view.fetch_error', 'Unable to load bracket type details.')}</p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetchDetail()}>
                  {t('tournaments.bracket_types.error.retry', 'Retry')}
                </Button>
              </div>
            )}
            {!detailLoading && detail && <DetailView detail={detail} t={t} />}
          </div>
        )}
      </Modal>

      {/* ── Deactivate confirmation (backend remains authoritative) ── */}
      <Modal
        open={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        title={confirmTarget ? t('tournaments.bracket_types.confirm.deactivate_title', 'Deactivate {name}?', { name: confirmTarget.name }) : ''}
        size="sm"
        a11yDialog
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmTarget(null)}>
              {t('tournaments.bracket_types.confirm.cancel', 'Cancel')}
            </Button>
            <Button variant="danger" loading={toggleMutation.isPending} onClick={confirmDeactivate}>
              {t('tournaments.bracket_types.deactivate', 'Deactivate')}
            </Button>
          </div>
        }
      >
        {confirmTarget && (
          <div className="space-y-3 text-sm text-[var(--color-text)]">
            <p>
              {t(
                'tournaments.bracket_types.confirm.deactivate_body',
                'This format is used by {count} tournament(s). Deactivation is blocked by the system while active or future tournaments still depend on it.',
                { count: confirmTarget.referenced_count },
              )}
            </p>
            <p className="text-xs text-[var(--color-warning-text)]">
              {t(
                'tournaments.bracket_types.confirm.deactivate_dependency_hint',
                'If the system blocks deactivation, an active or future tournament still depends on this format.',
              )}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Registry (GSK) row + detail ──────────────────────────────────────────────

function RegistryRow({ entry, onView }: { entry: BracketTypeRegistryEntry; onView: () => void }) {
  const { t } = useTranslation();
  return (
    <tr className="border-b border-[var(--color-border)] last:border-0 bg-[var(--color-primary-bg)]/30">
      <td className="px-4 py-3">
        <span className="font-medium text-[var(--color-text)]">{entry.name}</span>
        <span className="ml-2 rounded-full border border-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-primary)]">
          {t('tournaments.bracket_types.composite', 'Composite')}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs">{entry.format}</td>
      <td className="px-4 py-3">
        <Badge variant={CAPABILITY_BADGE[entry.engine_capability]}>{capabilityLabel(t, entry.engine_capability)}</Badge>
      </td>
      <td className="px-4 py-3">
        <Badge variant="success">{t('tournaments.bracket_types.status.available', 'Available')}</Badge>
      </td>
      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{t('tournaments.bracket_types.scope.global', 'Global')}</td>
      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">—</td>
      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
        {t('tournaments.bracket_types.config.engine_contract', 'GSK Engine Contract')}
      </td>
      <td className="px-4 py-3 text-right">
        <Button size="sm" variant="ghost" onClick={onView}>
          {t('tournaments.bracket_types.action.view_config', 'View Configuration')}
        </Button>
      </td>
    </tr>
  );
}

function RegistryDetail({ entry, t }: { entry: BracketTypeRegistryEntry; t: (k: string, d?: string) => string }) {
  return (
    <dl className="divide-y divide-[var(--color-border)]">
      <DetailRow label={t('tournaments.bracket_types.name', 'Name')}>{entry.name}</DetailRow>
      <DetailRow label={t('tournaments.bracket_types.slug', 'Slug')}>
        <code className="font-mono text-xs">{entry.format}</code>
      </DetailRow>
      <DetailRow label={t('tournaments.bracket_types.view.engine_capability', 'Engine Capability')}>
        <Badge variant={CAPABILITY_BADGE[entry.engine_capability]}>{capabilityLabel(t, entry.engine_capability)}</Badge>
      </DetailRow>
      <DetailRow label={t('tournaments.bracket_types.view.type', 'Type')}>
        <Badge variant="info">{t('tournaments.bracket_types.composite', 'Composite')}</Badge>
      </DetailRow>
      <DetailRow label={t('tournaments.bracket_types.view.source_label', 'Source')}>
        {t('tournaments.bracket_types.view.source_system', 'System / Composite')}
      </DetailRow>
      <DetailRow label={t('tournaments.bracket_types.status.available', 'Availability')}>
        {t('tournaments.bracket_types.status.available', 'Available')}
      </DetailRow>
      <DetailRow label={t('tournaments.bracket_types.view.substrate', 'Engine substrate')}>
        <code className="font-mono text-xs">{entry.substrate ?? '—'}</code>
      </DetailRow>
      {entry.description && (
        <DetailRow label={t('tournaments.bracket_types.view.contract', 'Configuration')}>{entry.description}</DetailRow>
      )}
    </dl>
  );
}

// ── View detail (DB rows) ────────────────────────────────────────────────────

function DetailView({ detail, t }: { detail: BracketTypeDetail; t: (k: string, d?: string) => string }) {
  return (
    <div className="space-y-4">
      <dl className="divide-y divide-[var(--color-border)]">
        <DetailRow label={t('tournaments.bracket_types.name', 'Name')}>{detail.name}</DetailRow>
        <DetailRow label={t('tournaments.bracket_types.slug', 'Slug')}>
          <code className="font-mono text-xs">{detail.slug}</code>
        </DetailRow>
        <DetailRow label={t('tournaments.bracket_types.view.engine_capability', 'Engine Capability')}>
          <Badge variant={CAPABILITY_BADGE[detail.engine_capability]}>{capabilityLabel(t, detail.engine_capability)}</Badge>
        </DetailRow>
        <DetailRow label={t('tournaments.bracket_types.view.creation_availability', 'Creation Availability')}>
          {detail.creation_available
            ? t('tournaments.bracket_types.yes', 'Yes')
            : t('tournaments.bracket_types.no', 'No')}
        </DetailRow>
        <DetailRow label={t('tournaments.bracket_types.view.operational_status', 'Operational Status')}>
          {detail.is_active ? t('tournaments.bracket_types.active', 'Active') : t('tournaments.bracket_types.inactive', 'Inactive')}
        </DetailRow>
        <DetailRow label={t('tournaments.bracket_types.view.total_references', 'Total References')}>{detail.referenced_count}</DetailRow>
        <DetailRow label={t('tournaments.bracket_types.view.active_references', 'Active References')}>{detail.active_references}</DetailRow>
        <DetailRow label={t('tournaments.bracket_types.view.historical_references', 'Historical References')}>{detail.historical_references}</DetailRow>
        {detail.created_at && (
          <DetailRow label={t('tournaments.bracket_types.view.created_at', 'Created At')}>{formatISODate(detail.created_at)}</DetailRow>
        )}
        <DetailRow label={t('tournaments.bracket_types.config.stored_schema', 'Stored Schema')}>
          {detail.config_schema ? (
            <pre className="max-w-full overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-xs text-[var(--color-text)]">
              {prettyJson(detail.config_schema)}
            </pre>
          ) : (
            '—'
          )}
        </DetailRow>
      </dl>
      <p className="text-xs text-[var(--color-text-muted)]">
        {t(
          'tournaments.bracket_types.view.stored_hint',
          'The stored schema is a definition record. It does not change tournament engine behavior.',
        )}
      </p>
    </div>
  );
}

// ── CREATE modal ─────────────────────────────────────────────────────────────

function CreateBracketTypeModal({
  open,
  onClose,
  pending,
  error,
  onSubmit,
  t,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  error: Error | null;
  onSubmit: (payload: { name: string; slug: string; config_schema?: string }) => void;
  t: (k: string, d?: string, p?: Record<string, string | number>) => string;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [config, setConfig] = useState('');
  const [touched, setTouched] = useState(false);

  const nameErr = !name.trim() ? t('tournaments.bracket_types.validation.name_required', 'Name is required.') : name.trim().length > 100 ? t('tournaments.bracket_types.validation.name_max', 'Name must be 100 characters or fewer.') : '';
  const slugNorm = slug.trim().toLowerCase();
  const slugErr = !slugNorm
    ? t('tournaments.bracket_types.validation.slug_required', 'Slug is required.')
    : !SLUG_PATTERN.test(slugNorm)
      ? t('tournaments.bracket_types.validation.slug_format', 'Use lowercase letters, digits and hyphens (e.g. my-format).')
      : '';
  const configErr = config.trim() !== '' ? (isValidJson(config) ? '' : t('tournaments.bracket_types.validation.config_json', 'Config Schema must be valid JSON.')) : '';
  const canSubmit = !nameErr && !slugErr && !configErr && !!name.trim() && !!slugNorm;

  const submit = () => {
    setTouched(true);
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), slug: slugNorm, ...(config.trim() ? { config_schema: config } : {}) });
  };

  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('tournaments.bracket_types.create.title', 'Create Bracket Type')}
      size="md"
      a11yDialog
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>{t('tournaments.bracket_types.confirm.cancel', 'Cancel')}</Button>
          <Button loading={pending} onClick={submit}>{t('tournaments.bracket_types.create_submit', 'Create')}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError>{error ? bracketErrorMessage(error, t) : null}</FormError>
        <div>
          <label className={labelCls} htmlFor="bt-create-name">{t('tournaments.bracket_types.field.name', 'Name')} *</label>
          <input id="bt-create-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <FieldError>{touched ? nameErr : null}</FieldError>
        </div>
        <div>
          <label className={labelCls} htmlFor="bt-create-slug">{t('tournaments.bracket_types.field.slug', 'Slug')} *</label>
          <input id="bt-create-slug" className={inputCls} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="my-format" />
          <FieldError>{touched ? slugErr : null}</FieldError>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {t('tournaments.bracket_types.slug_helper', 'Stable identifier — lowercase letters, digits and hyphens. Cannot be changed after creation.')}
          </p>
        </div>
        <div>
          <label className={labelCls} htmlFor="bt-create-config">{t('tournaments.bracket_types.field.config', 'Config Schema')}</label>
          <textarea
            id="bt-create-config"
            className={`${inputCls} min-h-[96px] font-mono text-xs`}
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            placeholder='{ "rounds": "auto" }'
          />
          <FieldError>{touched ? configErr : null}</FieldError>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {t(
              'tournaments.bracket_types.config_helper',
              'Stored configuration definition (JSON). This does not, by itself, enable an engine — engine availability is controlled by the platform.',
            )}
          </p>
        </div>
      </div>
    </Modal>
  );
}

// ── EDIT modal ───────────────────────────────────────────────────────────────

function EditBracketTypeModal({
  open,
  onClose,
  row,
  pending,
  error,
  onSubmit,
  t,
}: {
  open: boolean;
  onClose: () => void;
  row: BracketTypeRow;
  pending: boolean;
  error: Error | null;
  onSubmit: (payload: { name?: string; config_schema?: string }) => void;
  t: (k: string, d?: string, p?: Record<string, string | number>) => string;
}) {
  const [name, setName] = useState(row.name);
  const [config, setConfig] = useState(row.config_schema ?? '');
  const [touched, setTouched] = useState(false);

  const nameErr = !name.trim() ? t('tournaments.bracket_types.validation.name_required', 'Name is required.') : name.trim().length > 100 ? t('tournaments.bracket_types.validation.name_max', 'Name must be 100 characters or fewer.') : '';
  const configErr = config.trim() !== '' ? (isValidJson(config) ? '' : t('tournaments.bracket_types.validation.config_json', 'Config Schema must be valid JSON.')) : '';
  const canSubmit = !nameErr && !configErr && !!name.trim();

  const submit = () => {
    setTouched(true);
    if (!canSubmit) return;
    const payload: { name?: string; config_schema?: string } = { name: name.trim() };
    const original = row.config_schema ?? '';
    if (config !== original && config.trim() !== '') payload.config_schema = config;
    onSubmit(payload);
  };

  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('tournaments.bracket_types.edit.title', 'Edit Bracket Type')}
      size="md"
      a11yDialog
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>{t('tournaments.bracket_types.confirm.cancel', 'Cancel')}</Button>
          <Button loading={pending} onClick={submit}>{t('tournaments.bracket_types.save', 'Save')}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError>{error ? bracketErrorMessage(error, t) : null}</FormError>
        <div>
          <label className={labelCls}>{t('tournaments.bracket_types.field.slug', 'Slug')} — {t('tournaments.bracket_types.edit.slug_locked', 'cannot be changed.')}</label>
          <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-mono text-xs text-[var(--color-text-muted)]">{row.slug}</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="bt-edit-name">{t('tournaments.bracket_types.field.name', 'Name')} *</label>
          <input id="bt-edit-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <FieldError>{touched ? nameErr : null}</FieldError>
        </div>
        <div>
          <label className={labelCls} htmlFor="bt-edit-config">{t('tournaments.bracket_types.field.config', 'Config Schema')}</label>
          <textarea
            id="bt-edit-config"
            className={`${inputCls} min-h-[96px] font-mono text-xs`}
            value={config}
            onChange={(e) => setConfig(e.target.value)}
          />
          <FieldError>{touched ? configErr : null}</FieldError>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {t(
              'tournaments.bracket_types.config_helper',
              'Stored configuration definition (JSON). This does not, by itself, enable an engine — engine availability is controlled by the platform.',
            )}
          </p>
        </div>
      </div>
    </Modal>
  );
}

function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}