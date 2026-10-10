import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import {
  sportConfigApi,
  type SportFormatRow,
  type SportRuleSetRow,
} from '../../../services/sportConfig';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { Button, Card, Modal, Spinner } from '../../../components/ui';
import { getErrorMessage } from '../../../utils/errors';
import { useTranslation } from '../../../i18n';

/**
 * Phase A — Super Admin Sport Format & Rule-Set management.
 *
 * Formats are deactivated (never hard-deleted while referenced). Rule sets are
 * APPEND-ONLY versions: editing scoring is only allowed while a version is
 * unreferenced by history; otherwise the operator must create a new version and
 * activate it. All destructive/mutating actions are gated by the sports.formats.*
 * / sports.rule-sets.* permissions.
 */

interface SportOption {
  id: number;
  name: string;
}

const FORMAT_TYPES: Array<{ value: 'singles' | 'doubles' | 'team'; label: string }> = [
  { value: 'singles', label: 'Singles' },
  { value: 'doubles', label: 'Doubles' },
  { value: 'team', label: 'Team' },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '');
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-error)] bg-[var(--color-error-bg,transparent)] p-3 text-sm text-[var(--color-error)]">
      {message}
    </div>
  );
}

export default function SportFormatsPanel() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();

  const [sportFilter, setSportFilter] = useState<string>('');

  // Format form state
  const [formatFormOpen, setFormatFormOpen] = useState(false);
  const [editingFormat, setEditingFormat] = useState<SportFormatRow | null>(null);
  const [fSportId, setFSportId] = useState<string>('');
  const [fName, setFName] = useState('');
  const [fSlug, setFSlug] = useState('');
  const [fType, setFType] = useState<'singles' | 'doubles' | 'team'>('singles');
  const [fPlayers, setFPlayers] = useState('');
  const [fRoster, setFRoster] = useState('');
  const [fDescription, setFDescription] = useState('');
  const [fIsDefault, setFIsDefault] = useState(false);
  const [fIsActive, setFIsActive] = useState(true);
  const [deleteFormatId, setDeleteFormatId] = useState<number | null>(null);

  // Rule-set management state
  const [rulesFormat, setRulesFormat] = useState<SportFormatRow | null>(null);
  const [ruleSetFormOpen, setRuleSetFormOpen] = useState(false);
  const [editingRuleSet, setEditingRuleSet] = useState<SportRuleSetRow | null>(null);
  const [rsName, setRsName] = useState('');
  const [rsRules, setRsRules] = useState('{\n  "score_structure": "sets",\n  "best_of": 3,\n  "sets_to_win": 2,\n  "first_to": 6,\n  "margin": 2,\n  "draw_allowed": false,\n  "terminations": ["retired", "walkover"]\n}');
  const [rsStandings, setRsStandings] = useState('');
  const [rsIsActive, setRsIsActive] = useState(false);
  const [rsIsDefault, setRsIsDefault] = useState(false);

  const { data: sports } = useQuery({
    queryKey: ['admin', 'sports'],
    queryFn: () => api.get('/sports/all').then((r: any) => r.data.data as SportOption[]),
  });

  const formatsQuery = useQuery({
    queryKey: ['admin', 'sport-formats'],
    queryFn: () => sportConfigApi.listFormats(),
  });

  const ruleSetsQuery = useQuery({
    queryKey: ['admin', 'sport-rule-sets', rulesFormat?.id],
    queryFn: () => sportConfigApi.listRuleSets(rulesFormat!.id),
    enabled: !!rulesFormat,
  });

  const formats = useMemo(() => {
    const rows = formatsQuery.data ?? [];
    if (!sportFilter) return rows;
    return rows.filter((f) => String(f.sportId) === sportFilter);
  }, [formatsQuery.data, sportFilter]);

  const invalidateFormats = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'sport-formats'] });
  };
  const invalidateRuleSets = (formatId: number) => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'sport-rule-sets', formatId] });
    invalidateFormats();
  };

  // ── Format mutations ──────────────────────────────────────────────────────
  const createFormatMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => sportConfigApi.createFormat(Number(fSportId), payload),
    onSuccess: () => {
      invalidateFormats();
      closeFormatForm();
      showToast(t('admin.sport_formats.created', 'Sport format created'));
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  });

  const updateFormatMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      sportConfigApi.updateFormat(id, payload),
    onSuccess: () => {
      invalidateFormats();
      closeFormatForm();
      showToast(t('admin.sport_formats.updated', 'Sport format updated'));
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  });

  const deleteFormatMutation = useMutation({
    mutationFn: (id: number) => sportConfigApi.deleteFormat(id),
    onSuccess: () => {
      invalidateFormats();
      setDeleteFormatId(null);
      showToast(t('admin.sport_formats.deleted', 'Sport format deleted'));
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  });

  const toggleFormatActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      sportConfigApi.updateFormat(id, { isActive }),
    onSuccess: (_data, { isActive }) => {
      invalidateFormats();
      showToast(
        isActive
          ? t('admin.sport_formats.activated', 'Format activated')
          : t('admin.sport_formats.deactivated', 'Format deactivated'),
      );
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  });

  // ── Rule-set mutations ────────────────────────────────────────────────────
  const createRuleSetMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => sportConfigApi.createRuleSet(rulesFormat!.id, payload),
    onSuccess: () => {
      invalidateRuleSets(rulesFormat!.id);
      closeRuleSetForm();
      showToast(t('admin.sport_rule_sets.created', 'Rule-set version created'));
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  });

  const updateRuleSetMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      sportConfigApi.updateRuleSet(id, payload),
    onSuccess: () => {
      if (rulesFormat) invalidateRuleSets(rulesFormat.id);
      closeRuleSetForm();
      showToast(t('admin.sport_rule_sets.updated', 'Rule-set version updated'));
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  });

  const activateRuleSetMutation = useMutation({
    mutationFn: (id: number) => sportConfigApi.activateRuleSet(id),
    onSuccess: () => {
      if (rulesFormat) invalidateRuleSets(rulesFormat.id);
      showToast(t('admin.sport_rule_sets.activated', 'Rule-set version activated'));
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  });

  const deactivateRuleSetMutation = useMutation({
    mutationFn: (id: number) => sportConfigApi.deactivateRuleSet(id),
    onSuccess: () => {
      if (rulesFormat) invalidateRuleSets(rulesFormat.id);
      showToast(t('admin.sport_rule_sets.deactivated', 'Rule-set version deactivated'));
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  });

  // ── Form helpers ──────────────────────────────────────────────────────────
  function closeFormatForm() {
    setFormatFormOpen(false);
    setEditingFormat(null);
    setFSportId('');
    setFName('');
    setFSlug('');
    setFType('singles');
    setFPlayers('');
    setFRoster('');
    setFDescription('');
    setFIsDefault(false);
    setFIsActive(true);
  }

  function openCreateFormat() {
    closeFormatForm();
    setFormatFormOpen(true);
  }

  function openEditFormat(format: SportFormatRow) {
    setEditingFormat(format);
    setFSportId(String(format.sportId));
    setFName(format.name);
    setFSlug(format.slug);
    setFType(format.formatType);
    setFPlayers(format.playersPerSide != null ? String(format.playersPerSide) : '');
    setFRoster(format.rosterSize != null ? String(format.rosterSize) : '');
    setFDescription(format.description ?? '');
    setFIsDefault(format.isDefault);
    setFIsActive(format.isActive);
    setFormatFormOpen(true);
  }

  function submitFormat(e: React.FormEvent) {
    e.preventDefault();
    if (!fName.trim()) return;
    const payload: Record<string, unknown> = {
      name: fName.trim(),
      formatType: fType,
      playersPerSide: fPlayers === '' ? null : Number(fPlayers),
      rosterSize: fRoster === '' ? null : Number(fRoster),
      description: fDescription.trim() === '' ? null : fDescription.trim(),
      isDefault: fIsDefault,
      isActive: fIsActive,
    };
    if (editingFormat) {
      updateFormatMutation.mutate({ id: editingFormat.id, payload });
    } else {
      if (!fSportId) {
        showToast(t('admin.sport_formats.pick_sport', 'Select a sport first'), 'error');
        return;
      }
      payload.slug = fSlug.trim() || slugify(fName);
      createFormatMutation.mutate(payload);
    }
  }

  function closeRuleSetForm() {
    setRuleSetFormOpen(false);
    setEditingRuleSet(null);
    setRsName('');
    setRsIsActive(false);
    setRsIsDefault(false);
    setRsStandings('');
  }

  function openCreateRuleSet() {
    closeRuleSetForm();
    const activeExists = (ruleSetsQuery.data ?? []).some((r) => r.isActive);
    setRsIsActive(!activeExists);
    setRuleSetFormOpen(true);
  }

  function openEditRuleSet(rs: SportRuleSetRow) {
    setEditingRuleSet(rs);
    setRsName(rs.name ?? '');
    setRsRules(JSON.stringify(rs.rules, null, 2));
    setRsStandings(rs.standingsRules ? JSON.stringify(rs.standingsRules, null, 2) : '');
    setRsIsActive(rs.isActive);
    setRsIsDefault(rs.isDefault);
    setRuleSetFormOpen(true);
  }

  function submitRuleSet(e: React.FormEvent) {
    e.preventDefault();
    let rules: unknown;
    try {
      rules = JSON.parse(rsRules);
    } catch {
      showToast(t('admin.sport_rule_sets.invalid_json', 'Rules is not valid JSON'), 'error');
      return;
    }
    let standingsRules: unknown = null;
    if (rsStandings.trim() !== '') {
      try {
        standingsRules = JSON.parse(rsStandings);
      } catch {
        showToast(t('admin.sport_rule_sets.invalid_json_standings', 'Standings rules is not valid JSON'), 'error');
        return;
      }
    }

    if (editingRuleSet) {
      const payload: Record<string, unknown> = {
        name: rsName.trim() === '' ? null : rsName.trim(),
        isActive: rsIsActive,
        isDefault: rsIsDefault,
      };
      // Scoring payload only while unreferenced (backend enforces with 409).
      if (editingRuleSet.referenceCount === 0) {
        payload.rules = rules;
        payload.standingsRules = standingsRules;
      }
      updateRuleSetMutation.mutate({ id: editingRuleSet.id, payload });
    } else {
      createRuleSetMutation.mutate({
        name: rsName.trim() === '' ? null : rsName.trim(),
        rules,
        standingsRules,
        isActive: rsIsActive,
        isDefault: rsIsDefault,
      });
    }
  }

  const isLoading = formatsQuery.isLoading;
  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={sportFilter}
          onChange={(e) => setSportFilter(e.target.value)}
          className="rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 text-sm"
        >
          <option value="">{t('admin.sport_formats.all_sports', 'All sports')}</option>
          {(sports ?? []).map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name}
            </option>
          ))}
        </select>
        <Can permission="sports.formats.manage">
          <Button onClick={openCreateFormat} className="ml-auto">
            + {t('admin.sport_formats.new', 'New Format')}
          </Button>
        </Can>
      </div>

      {formatsQuery.isError && <ErrorBanner message={getErrorMessage(formatsQuery.error)} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {formats.map((format) => (
          <Card key={format.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-[var(--color-text)]">{format.name}</h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {format.sportName} · {format.slug}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1">
                <span className="rounded-full bg-[var(--color-border)] px-2 py-0.5 text-xs">
                  {format.formatType}
                </span>
                {format.isDefault && (
                  <span className="rounded-full bg-[var(--color-primary-bg)] px-2 py-0.5 text-xs text-[var(--color-primary)]">
                    {t('admin.sport_formats.default', 'Default')}
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    format.isActive
                      ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'
                      : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                  }`}
                >
                  {format.isActive
                    ? t('common.active', 'Active')
                    : t('common.inactive', 'Inactive')}
                </span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--color-text-muted)] sm:grid-cols-4">
              <div>
                <div className="font-medium text-[var(--color-text)]">
                  {format.playersPerSide ?? '—'}
                </div>
                {t('admin.sport_formats.players_per_side', 'Players/side')}
              </div>
              <div>
                <div className="font-medium text-[var(--color-text)]">{format.rosterSize ?? '—'}</div>
                {t('admin.sport_formats.roster_size', 'Roster size')}
              </div>
              <div>
                <div className="font-medium text-[var(--color-text)]">{format.ruleSetCount}</div>
                {t('admin.sport_formats.versions', 'Versions')}
              </div>
              <div>
                <div className="font-medium text-[var(--color-text)]">{format.referenceCount}</div>
                {t('admin.sport_formats.references', 'In use')}
              </div>
            </div>

            {format.description && (
              <p className="mt-3 text-xs text-[var(--color-text-muted)]">{format.description}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Can permission="sports.rule-sets.view">
                <Button variant="ghost" onClick={() => setRulesFormat(format)}>
                  {t('admin.sport_formats.rule_sets', 'Rule Sets')}
                </Button>
              </Can>
              <Can permission="sports.formats.manage">
                <Button variant="ghost" onClick={() => openEditFormat(format)}>
                  {t('common.edit', 'Edit')}
                </Button>
              </Can>
              <Can permission="sports.formats.manage">
                <Button
                  variant="ghost"
                  onClick={() => toggleFormatActiveMutation.mutate({ id: format.id, isActive: !format.isActive })}
                >
                  {format.isActive
                    ? t('admin.sport_formats.deactivate', 'Deactivate')
                    : t('admin.sport_formats.activate', 'Activate')}
                </Button>
              </Can>
              <Can permission="sports.formats.manage">
                <Button
                  variant="ghost"
                  className="text-[var(--color-error)] disabled:opacity-40"
                  disabled={format.referenceCount > 0}
                  title={
                    format.referenceCount > 0
                      ? t('admin.sport_formats.cannot_delete', 'Referenced by history — deactivate instead')
                      : undefined
                  }
                  onClick={() => setDeleteFormatId(format.id)}
                >
                  {t('common.delete', 'Delete')}
                </Button>
              </Can>
            </div>
          </Card>
        ))}

        {!formats.length && (
          <div className="col-span-full">
            <Card>
              <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
                {t('admin.sport_formats.empty', 'No sport formats found')}
              </p>
            </Card>
          </div>
        )}
      </div>

      {/* ── Format create/edit modal ── */}
      <Modal
        open={formatFormOpen}
        onClose={closeFormatForm}
        title={
          editingFormat
            ? t('admin.sport_formats.edit_title', 'Edit Sport Format')
            : t('admin.sport_formats.new', 'New Format')
        }
      >
        <form onSubmit={submitFormat} className="space-y-3">
          {!editingFormat && (
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                {t('admin.sport_formats.sport', 'Sport')} *
              </label>
              <select
                value={fSportId}
                onChange={(e) => setFSportId(e.target.value)}
                required
                className="w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {(sports ?? []).map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
              {t('admin.sport_formats.name', 'Name')} *
            </label>
            <Can permission="sports.formats.edit.name">
              <input
                value={fName}
                onChange={(e) => {
                  setFName(e.target.value);
                  if (!editingFormat) setFSlug(slugify(e.target.value));
                }}
                required
                className="w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 text-sm"
              />
            </Can>
          </div>

          {!editingFormat && (
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                {t('admin.sport_formats.slug', 'Slug')} *
              </label>
              <input
                value={fSlug}
                onChange={(e) => setFSlug(slugify(e.target.value))}
                required
                className="w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 text-sm"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                {t('admin.sport_formats.type', 'Format type')}
              </label>
              <Can permission="sports.formats.edit.format-type">
                <select
                  value={fType}
                  onChange={(e) => setFType(e.target.value as any)}
                  className="w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 text-sm"
                >
                  {FORMAT_TYPES.map((ft) => (
                    <option key={ft.value} value={ft.value}>
                      {ft.label}
                    </option>
                  ))}
                </select>
              </Can>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                {t('admin.sport_formats.players_per_side', 'Players/side')}
              </label>
              <Can permission="sports.formats.edit.players-per-side">
                <input
                  type="number"
                  min={1}
                  value={fPlayers}
                  onChange={(e) => setFPlayers(e.target.value)}
                  className="w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 text-sm"
                />
              </Can>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                {t('admin.sport_formats.roster_size', 'Roster size')}
              </label>
              <Can permission="sports.formats.edit.roster-size">
                <input
                  type="number"
                  min={1}
                  value={fRoster}
                  onChange={(e) => setFRoster(e.target.value)}
                  className="w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 text-sm"
                />
              </Can>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
              {t('admin.sport_formats.description', 'Description')}
            </label>
            <Can permission="sports.formats.edit.description">
              <input
                value={fDescription}
                onChange={(e) => setFDescription(e.target.value)}
                maxLength={255}
                className="w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 text-sm"
              />
            </Can>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={fIsDefault} onChange={(e) => setFIsDefault(e.target.checked)} />
              {t('admin.sport_formats.default', 'Default')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={fIsActive} onChange={(e) => setFIsActive(e.target.checked)} />
              {t('common.active', 'Active')}
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={closeFormatForm}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" loading={createFormatMutation.isPending || updateFormatMutation.isPending}>
              {editingFormat ? t('common.update', 'Update') : t('common.create', 'Create')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Delete format modal ── */}
      <Modal
        open={deleteFormatId !== null}
        onClose={() => setDeleteFormatId(null)}
        title={t('admin.sport_formats.delete_title', 'Delete Sport Format')}
      >
        <p className="mb-6 text-sm text-[var(--color-text-muted)]">
          {t('admin.sport_formats.delete_confirm', 'Delete this sport format? This cannot be undone.')}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteFormatId(null)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Can permission="sports.formats.manage">
            <Button
              className="bg-[var(--color-error)] text-white"
              loading={deleteFormatMutation.isPending}
              onClick={() => deleteFormatMutation.mutate(deleteFormatId!)}
            >
              {t('common.delete', 'Delete')}
            </Button>
          </Can>
        </div>
      </Modal>

      {/* ── Rule-set versions modal ── */}
      <Modal
        open={rulesFormat !== null}
        onClose={() => setRulesFormat(null)}
        title={`${t('admin.sport_rule_sets.title', 'Rule Sets')} — ${rulesFormat?.name ?? ''}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs text-[var(--color-text-muted)]">
            {t(
              'admin.sport_rule_sets.help',
              'Rule sets are versioned. A new active version takes over live scoring; historical results keep their frozen snapshot.',
            )}
          </p>
          <Can permission="sports.rule-sets.manage">
            <Button onClick={openCreateRuleSet} className="ml-3 shrink-0">
              + {t('admin.sport_rule_sets.new_version', 'New Version')}
            </Button>
          </Can>
        </div>

        {ruleSetsQuery.isLoading && <Spinner />}
        {ruleSetsQuery.isError && <ErrorBanner message={getErrorMessage(ruleSetsQuery.error)} />}

        <div className="space-y-3">
          {(ruleSetsQuery.data ?? []).map((rs) => (
            <div
              key={rs.id}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-[var(--color-text)]">
                    v{rs.version}
                    {rs.name ? ` · ${rs.name}` : ''}
                  </span>
                  <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                    {t('admin.sport_rule_sets.references', 'in use')}: {rs.referenceCount}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {rs.isActive && (
                    <span className="rounded-full bg-[var(--color-success-bg)] px-2 py-0.5 text-xs text-[var(--color-success-text)]">
                      {t('common.active', 'Active')}
                    </span>
                  )}
                </div>
              </div>

              <pre className="mt-2 max-h-32 overflow-auto rounded bg-[var(--color-bg)] p-2 text-[11px] text-[var(--color-text-muted)]">
                {JSON.stringify(rs.rules, null, 2)}
              </pre>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Can permission="sports.rule-sets.manage">
                  <Button variant="ghost" onClick={() => openEditRuleSet(rs)}>
                    {t('common.edit', 'Edit')}
                  </Button>
                </Can>
                <Can permission="sports.rule-sets.manage">
                  {rs.isActive ? (
                    <Button
                      variant="ghost"
                      onClick={() => deactivateRuleSetMutation.mutate(rs.id)}
                      loading={deactivateRuleSetMutation.isPending}
                    >
                      {t('admin.sport_rule_sets.deactivate', 'Deactivate')}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={() => activateRuleSetMutation.mutate(rs.id)}
                      loading={activateRuleSetMutation.isPending}
                    >
                      {t('admin.sport_rule_sets.activate', 'Activate')}
                    </Button>
                  )}
                </Can>
              </div>
            </div>
          ))}
          {!ruleSetsQuery.isLoading && !(ruleSetsQuery.data ?? []).length && (
            <p className="py-4 text-center text-sm text-[var(--color-text-muted)]">
              {t('admin.sport_rule_sets.empty', 'No rule-set versions yet')}
            </p>
          )}
        </div>
      </Modal>

      {/* ── Rule-set create/edit modal ── */}
      <Modal
        open={ruleSetFormOpen}
        onClose={closeRuleSetForm}
        title={
          editingRuleSet
            ? t('admin.sport_rule_sets.edit_title', 'Edit Rule-Set Version')
            : t('admin.sport_rule_sets.new_version', 'New Version')
        }
      >
        <form onSubmit={submitRuleSet} className="space-y-3">
          {editingRuleSet && editingRuleSet.referenceCount > 0 && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-warning,var(--color-border))] p-3 text-xs text-[var(--color-text-muted)]">
              {t(
                'admin.sport_rule_sets.locked',
                'This version is referenced by history — scoring is locked. Create a new version to change rules.',
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
              {t('admin.sport_rule_sets.name', 'Name')}
            </label>
            <Can permission="sports.rule-sets.edit.name">
              <input
                value={rsName}
                onChange={(e) => setRsName(e.target.value)}
                maxLength={120}
                className="w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 text-sm"
              />
            </Can>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
              {t('admin.sport_rule_sets.rules', 'Rules (JSON)')} *
            </label>
            <Can permission="sports.rule-sets.edit.rules">
              <textarea
                value={rsRules}
                onChange={(e) => setRsRules(e.target.value)}
                rows={10}
                disabled={!!editingRuleSet && editingRuleSet.referenceCount > 0}
                className="w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 font-mono text-xs disabled:opacity-60"
              />
            </Can>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
              {t('admin.sport_rule_sets.standings_rules', 'Standings rules (JSON, optional)')}
            </label>
            <Can permission="sports.rule-sets.edit.standings-rules">
              <textarea
                value={rsStandings}
                onChange={(e) => setRsStandings(e.target.value)}
                rows={5}
                disabled={!!editingRuleSet && editingRuleSet.referenceCount > 0}
                className="w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 font-mono text-xs disabled:opacity-60"
              />
            </Can>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={rsIsActive} onChange={(e) => setRsIsActive(e.target.checked)} />
              {t('admin.sport_rule_sets.activate_on_save', 'Activate on save')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={rsIsDefault} onChange={(e) => setRsIsDefault(e.target.checked)} />
              {t('admin.sport_formats.default', 'Default')}
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={closeRuleSetForm}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" loading={createRuleSetMutation.isPending || updateRuleSetMutation.isPending}>
              {editingRuleSet ? t('common.update', 'Update') : t('common.create', 'Create')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
