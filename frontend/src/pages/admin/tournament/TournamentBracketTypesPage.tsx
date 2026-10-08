import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import { bracketTypeApi } from '../../../services/tournament';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { Card, Badge, Button, SkeletonRow } from '../../../components/ui';
import { Modal } from '../../../components/ui/Modal';
import { getErrorMessage } from '../../../utils/errors';

/**
 * Group 5B-SR — Tournament Bracket Type Management (Step 2A).
 *
 * Consumes the Step 1 backend contract `GET /admin/bracket-types`:
 *   data[]    — DB-backed `tournament_bracket_types` rows, each enriched with
 *               `engine_capability` (ready|planned|unsupported) and
 *               `creation_available` (is_active AND engine ready).
 *   registry[]— engine-registry-level composite capabilities (GSK). NOT DB
 *               rows, NOT toggleable, no numeric id ever invented here.
 *
 * Capability is ALWAYS read from the backend. The frontend never re-derives it,
 * never hard-codes a capability list, and never treats `is_active` as
 * engine-executability.
 */

type EngineCapability = 'ready' | 'planned' | 'unsupported';

interface BracketTypeRow {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  config_schema: string | null;
  created_at?: string;
  referenced_count: number;
  engine_capability: EngineCapability;
  creation_available: boolean;
}

interface RegistryCapability {
  format: string;
  name: string;
  type: 'composite';
  source: 'engine_registry';
  engine_capability: EngineCapability;
  creation_available: boolean;
  toggleable: false;
  substrate?: string;
  description?: string;
}

type CapabilityEntry =
  | { kind: 'db'; row: BracketTypeRow }
  | { kind: 'registry'; entry: RegistryCapability };

type StatusFilter = 'all' | 'active' | 'inactive' | 'ready' | 'planned' | 'unsupported';

const CAPABILITY_BADGE: Record<EngineCapability, 'success' | 'warning' | 'danger'> = {
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

/**
 * The stored `config_schema` is a JSON-Schema/definition blob. The engine does
 * not read it (real configuration lives elsewhere, e.g. `gsk_config` / stage
 * config), so it is labelled "Stored Schema" — never "Engine Configuration".
 */
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

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-start sm:gap-4">
      <dt className="w-full shrink-0 text-xs text-[var(--color-text-muted)] sm:w-44">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm break-words text-[var(--color-text)]">{children}</dd>
    </div>
  );
}

export default function TournamentBracketTypesPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [viewEntry, setViewEntry] = useState<CapabilityEntry | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<BracketTypeRow | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-bracket-types'],
    queryFn: () => bracketTypeApi.listAll(),
  });

  const rows: BracketTypeRow[] = data?.data ?? [];
  const registry: RegistryCapability[] = data?.registry ?? [];

  const combined = useMemo<CapabilityEntry[]>(
    () => [
      ...rows.map((row) => ({ kind: 'db' as const, row })),
      ...registry.map((entry) => ({ kind: 'registry' as const, entry })),
    ],
    [rows, registry],
  );

  const entryCapability = (e: CapabilityEntry): EngineCapability =>
    e.kind === 'db' ? e.row.engine_capability : e.entry.engine_capability;
  const entryName = (e: CapabilityEntry): string =>
    e.kind === 'db' ? e.row.name : e.entry.name;
  const entrySlug = (e: CapabilityEntry): string =>
    e.kind === 'db' ? e.row.slug : e.entry.format;

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

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => bracketTypeApi.setActive(id, isActive),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-bracket-types'] });
      qc.invalidateQueries({ queryKey: ['bracket-types'] });
      setConfirmTarget(null);
      showToast(t('tournaments.bracket_types.updated', 'Bracket type updated'), 'success');
    },
    onError: (err) => {
      showToast(getErrorMessage(err), 'error');
    },
  });

  const activate = (row: BracketTypeRow) => toggleMutation.mutate({ id: row.id, isActive: true });
  const confirmDeactivate = () => {
    if (confirmTarget) toggleMutation.mutate({ id: confirmTarget.id, isActive: false });
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
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('tournaments.bracket_types.title', 'Bracket Types')}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {t('tournaments.bracket_types.subtitle', 'Manage tournament formats and their engine availability.')}
          </p>
        </div>
        <Can permission="tournament.bracket-types.manage">
          <Button
            type="button"
            disabled
            title={t('tournaments.bracket_types.create_disabled_hint', 'Create Bracket Type will be available in a future update.')}
            aria-disabled="true"
          >
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
          <span className="text-xs text-[var(--color-text-muted)]">
            {t('tournaments.bracket_types.search_label', 'Search')}
          </span>
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
              const capability = entryCapability(entry);
              if (entry.kind === 'registry') {
                return (
                  <tr key={`reg-${entry.entry.format}`} className="border-b border-[var(--color-border)] last:border-0 bg-[var(--color-primary-bg)]/30">
                    <td className="px-4 py-3">
                      <span className="font-medium text-[var(--color-text)]">{entry.entry.name}</span>
                      <span className="ml-2 rounded-full border border-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-primary)]">
                        {t('tournaments.bracket_types.composite', 'Composite')}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{entry.entry.format}</td>
                    <td className="px-4 py-3">
                      <Badge variant={CAPABILITY_BADGE[capability]}>{capabilityLabel(t, capability)}</Badge>
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
                      <Button size="sm" variant="ghost" onClick={() => setViewEntry(entry)}>
                        {t('tournaments.bracket_types.action.view_config', 'View Configuration')}
                      </Button>
                    </td>
                  </tr>
                );
              }

              const row = entry.row;
              const statusIsReady = capability === 'ready';
              return (
                <tr key={row.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]/30">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">{row.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.slug}</td>
                  <td className="px-4 py-3">
                    <Badge variant={CAPABILITY_BADGE[capability]}>{capabilityLabel(t, capability)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {statusIsReady ? (
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
                      <Button size="sm" variant="ghost" onClick={() => setViewEntry(entry)}>
                        {t('tournaments.bracket_types.action.view', 'View')}
                      </Button>
                      {statusIsReady && (
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
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* ── Read-only configuration/details modal ── */}
      <Modal
        open={viewEntry !== null}
        onClose={() => setViewEntry(null)}
        title={viewEntry ? entryName(viewEntry) : ''}
        size="md"
        a11yDialog
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setViewEntry(null)}>
              {t('tournaments.bracket_types.confirm.cancel', 'Close')}
            </Button>
          </div>
        }
      >
        {viewEntry && (
          <div className="space-y-4">
            <dl className="divide-y divide-[var(--color-border)]">
              <DetailRow label={t('tournaments.bracket_types.name', 'Name')}>{entryName(viewEntry)}</DetailRow>
              <DetailRow label={t('tournaments.bracket_types.slug', 'Slug')}>
                <code className="font-mono text-xs">{entrySlug(viewEntry)}</code>
              </DetailRow>
              <DetailRow label={t('tournaments.bracket_types.view.engine_capability', 'Engine Capability')}>
                <Badge variant={CAPABILITY_BADGE[entryCapability(viewEntry)]}>{capabilityLabel(t, entryCapability(viewEntry))}</Badge>
              </DetailRow>
              {viewEntry.kind === 'registry' && (
                <>
                  <DetailRow label={t('tournaments.bracket_types.view.type', 'Type')}>
                    <Badge variant="info">{t('tournaments.bracket_types.composite', 'Composite')}</Badge>
                  </DetailRow>
                  <DetailRow label={t('tournaments.bracket_types.status.available', 'Status')}>
                    {t('tournaments.bracket_types.status.available', 'Available')}
                  </DetailRow>
                  <DetailRow label={t('tournaments.bracket_types.view.substrate', 'Engine substrate')}>
                    <code className="font-mono text-xs">{viewEntry.entry.substrate ?? '—'}</code>
                  </DetailRow>
                  {viewEntry.entry.description && (
                    <DetailRow label={t('tournaments.bracket_types.view.contract', 'Configuration')}>
                      {viewEntry.entry.description}
                    </DetailRow>
                  )}
                </>
              )}
              {viewEntry.kind === 'db' && (
                <>
                  <DetailRow label={t('tournaments.bracket_types.view.operational_status', 'Operational Status')}>
                    {viewEntry.row.is_active
                      ? t('tournaments.bracket_types.active', 'Active')
                      : t('tournaments.bracket_types.inactive', 'Inactive')}
                  </DetailRow>
                  <DetailRow label={t('tournaments.bracket_types.col.scope', 'Scope')}>
                    {t('tournaments.bracket_types.scope.global', 'Global')}
                  </DetailRow>
                  <DetailRow label={t('tournaments.bracket_types.col.used_by', 'Used By')}>
                    {t('tournaments.bracket_types.referenced', 'Used by {count} tournament(s)', { count: viewEntry.row.referenced_count })}
                  </DetailRow>
                  <DetailRow label={t('tournaments.bracket_types.config.stored_schema', 'Stored Schema')}>
                    {viewEntry.row.config_schema ? (
                      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-xs text-[var(--color-text)]">
                        {prettyJson(viewEntry.row.config_schema)}
                      </pre>
                    ) : (
                      '—'
                    )}
                  </DetailRow>
                </>
              )}
            </dl>
            <p className="text-xs text-[var(--color-text-muted)]">
              {t(
                'tournaments.bracket_types.view.stored_hint',
                'The stored schema is a definition record. It does not change tournament engine behavior.',
              )}
            </p>
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
            {confirmTarget.slug === 'single-elimination' && (
              <p className="text-xs text-[var(--color-warning-text)]">
                {t(
                  'tournaments.bracket_types.confirm.deactivate_gsk_note',
                  'Group Stage + Knockout uses Single Elimination as its engine substrate.',
                )}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function capabilityLabel(t: (k: string, d?: string) => string, cap: EngineCapability): string {
  if (cap === 'ready') return t('tournaments.bracket_types.cap.ready', 'Ready');
  if (cap === 'planned') return t('tournaments.bracket_types.cap.planned', 'Planned');
  return t('tournaments.bracket_types.cap.unsupported', 'Unsupported');
}

function prettyJson(schema: string): string {
  try {
    return JSON.stringify(JSON.parse(schema), null, 2);
  } catch {
    return schema;
  }
}