import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  sportConfigApi,
  type SportFormatDetail,
  type SportRuleSetRow,
  type SportFormatType,
} from '../../../services/sportConfig';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { Button, Modal, Spinner } from '../../../components/ui';
import { getErrorMessage } from '../../../utils/errors';
import { useTranslation } from '../../../i18n';
import RuleSetVisualEditor from './RuleSetVisualEditor';

/**
 * Phase 1 — nested Formats & Rule Sets sections inside each Sport card.
 * Expands to the sport's formats; each format expands to its rule-set versions.
 * Rule sets are edited with the VISUAL editor (same JSON contracts as the
 * Phase A API — the backend remains authoritative for validation, versioning
 * and snapshot preservation).
 */

interface Props {
  sportId: number;
}

type ModalState =
  | { mode: 'create'; formatId: number }
  | { mode: 'edit'; ruleSet: SportRuleSetRow }
  | null;

interface EditorPayload {
  rules: Record<string, unknown>;
  standingsRules: Record<string, unknown> | null;
}

/** Deterministic slug used when a format is created without an explicit slug. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '');
}

export default function SportFormatsSection({ sportId }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();

  const [expandedFormatId, setExpandedFormatId] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [editor, setEditor] = useState<EditorPayload>({ rules: {}, standingsRules: null });

  const formatsQuery = useQuery({
    queryKey: ['admin', 'sport-formats', sportId],
    queryFn: () => sportConfigApi.listFormats(sportId),
  });

  const detailQuery = useQuery({
    queryKey: ['admin', 'sport-format-detail', expandedFormatId],
    queryFn: () => sportConfigApi.getFormat(expandedFormatId!),
    enabled: expandedFormatId != null,
  });

  const invalidate = (formatId: number) => {
    qc.invalidateQueries({ queryKey: ['admin', 'sport-formats', sportId] });
    qc.invalidateQueries({ queryKey: ['admin', 'sport-format-detail', formatId] });
  };

  // ── First-format creation (Phase 1) ──────────────────────────────────────
  // A sport with zero formats has no legacy `+ New Version` path; this lets the
  // operator create the first format through the EXISTING create-format API
  // (POST /admin/sports/:sportId/formats, gated by sports.formats.manage).
  const [createFirstOpen, setCreateFirstOpen] = useState(false);
  const [cfName, setCfName] = useState('');
  const [cfType, setCfType] = useState<SportFormatType>('singles');
  const [cfDescription, setCfDescription] = useState('');

  const createFirstFormatMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => sportConfigApi.createFormat(sportId, payload),
    onSuccess: (created) => {
      invalidate(created.id);
      setCreateFirstOpen(false);
      resetFirstFormat();
      showToast(t('admin.sport_formats.created', 'Sport format created'));
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  });

  function resetFirstFormat() {
    setCfName('');
    setCfType('singles');
    setCfDescription('');
  }

  function submitFirstFormat(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = cfName.trim();
    if (!name) return;
    const payload: Record<string, unknown> = {
      name,
      slug: slugify(name),
      formatType: cfType,
      playersPerSide: null,
      rosterSize: null,
      description: cfDescription.trim() === '' ? null : cfDescription.trim(),
      isDefault: false,
      isActive: true,
    };
    createFirstFormatMutation.mutate(payload);
  }

  const createMutation = useMutation({
    mutationFn: ({ formatId, payload }: { formatId: number; payload: Record<string, unknown> }) =>
      sportConfigApi.createRuleSet(formatId, payload),
    onSuccess: () => {
      if (modal?.mode === 'create') invalidate(modal.formatId);
      closeModal();
      showToast(t('admin.sport_rule_sets.created', 'Rule-set version created'));
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ ruleSetId, payload }: { ruleSetId: number; payload: Record<string, unknown> }) =>
      sportConfigApi.updateRuleSet(ruleSetId, payload),
    onSuccess: () => {
      if (modal?.mode === 'edit') invalidate(modal.ruleSet.formatId);
      closeModal();
      showToast(t('admin.sport_rule_sets.updated', 'Rule-set version updated'));
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  });

  const activateMutation = useMutation({
    mutationFn: (id: number) => sportConfigApi.activateRuleSet(id),
    onSuccess: () => { if (expandedFormatId) invalidate(expandedFormatId); showToast(t('admin.sport_rule_sets.activated', 'Rule-set version activated')); },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => sportConfigApi.deactivateRuleSet(id),
    onSuccess: () => { if (expandedFormatId) invalidate(expandedFormatId); showToast(t('admin.sport_rule_sets.deactivated', 'Rule-set version deactivated')); },
    onError: (err: unknown) => showToast(getErrorMessage(err), 'error'),
  });

  function openCreate(format: { id: number; ruleSets: SportRuleSetRow[] }) {
    const activeExists = ruleSetsOf(format).some((r) => r.isActive);
    setName('');
    setIsActive(!activeExists);
    setIsDefault(false);
    setEditor({ rules: {}, standingsRules: null });
    setModal({ mode: 'create', formatId: format.id });
  }

  function openEdit(ruleSet: SportRuleSetRow) {
    setName(ruleSet.name ?? '');
    setIsActive(ruleSet.isActive);
    setIsDefault(ruleSet.isDefault);
    setEditor({ rules: ruleSet.rules as Record<string, unknown>, standingsRules: ruleSet.standingsRules });
    setModal({ mode: 'edit', ruleSet });
  }

  function closeModal() {
    setModal(null);
    setName('');
    setEditor({ rules: {}, standingsRules: null });
  }

  function submit() {
    if (!modal) return;
    const base: Record<string, unknown> = {
      name: name.trim() === '' ? null : name.trim(),
      isActive,
      isDefault,
    };
    if (modal.mode === 'create') {
      createMutation.mutate({ formatId: modal.formatId, payload: { ...base, rules: editor.rules, standingsRules: editor.standingsRules } });
    } else {
      const payload: Record<string, unknown> = base;
      // Scoring payload only while the version is unreferenced (backend enforces 409 otherwise).
      if (modal.ruleSet.referenceCount === 0) {
        payload.rules = editor.rules;
        payload.standingsRules = editor.standingsRules;
      }
      updateMutation.mutate({ ruleSetId: modal.ruleSet.id, payload });
    }
  }

  const ruleSetsOf = (format: unknown): SportRuleSetRow[] => ((format as { ruleSets?: SportRuleSetRow[] })?.ruleSets) ?? [];
  const detail: SportFormatDetail | null = detailQuery.data ?? null;
  const formats = formatsQuery.data ?? [];

  if (formatsQuery.isLoading) return <Spinner />;

  return (
    <div className="mt-3 border-t border-[var(--color-border)] pt-3">
      {formats.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--color-text-muted)]">
            {t('admin.sport_formats.empty', 'No sport formats configured yet.')}
          </p>
          {/* Phase 1 — existing formats already expose `+ New Version` inside the
              expanded row; a sport with ZERO formats gets its first-format creation
              action here, channelled through the same sports.formats.manage gate. */}
          <Can permission="sports.formats.manage">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreateFirstOpen(true)}
              data-testid="create-first-format"
            >
              + {t('admin.sport_formats.new', 'New Format')}
            </Button>
          </Can>
        </div>
      )}
      <div className="space-y-2">
        {formats.map((format) => {
          const expanded = expandedFormatId === format.id;
          return (
            <div key={format.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setExpandedFormatId(expanded ? null : format.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[var(--color-text)]">{format.name}</span>
                  <span className="rounded-full bg-[var(--color-border)] px-2 py-0.5 text-xs">{format.formatType}</span>
                  {format.isDefault && (
                    <span className="rounded-full bg-[var(--color-primary-bg)] px-2 py-0.5 text-xs text-[var(--color-primary)]">
                      {t('admin.sport_formats.default', 'Default')}
                    </span>
                  )}
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {t('admin.sport_formats.versions', 'Versions')}: {format.ruleSetCount}
                  </span>
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">{expanded ? '▲' : '▼'}</span>
              </button>

              {expanded && (
                <div className="border-t border-[var(--color-border)] p-3">
                  <Can permission="sports.rule-sets.manage">
                    <Button
                      variant="ghost"
                      className="mb-2"
                      onClick={() => openCreate({ id: format.id, ruleSets: ruleSetsOf(detail ?? format) })}
                    >
                      + {t('admin.sport_rule_sets.new_version', 'New Version')}
                    </Button>
                  </Can>
                  {detailQuery.isLoading && expanded && <Spinner />}
                  {detailQuery.isError && (
                    <p className="text-xs text-[var(--color-error)]">{getErrorMessage(detailQuery.error)}</p>
                  )}
                  {detail && ruleSetsOf(detail).map((rs) => (
                    <div key={rs.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-2 my-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-[var(--color-text)]">
                          v{rs.version}{rs.name ? ` · ${rs.name}` : ''}
                        </span>
                        <span className="flex flex-wrap items-center gap-1">
                          {rs.isActive && (
                            <span className="rounded-full bg-[var(--color-success-bg)] px-2 py-0.5 text-xs text-[var(--color-success-text)]">
                              {t('common.active', 'Active')}
                            </span>
                          )}
                          <span className="text-xs text-[var(--color-text-muted)]">
                            {t('admin.sport_rule_sets.references', 'in use')}: {rs.referenceCount}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Can permission="sports.rule-sets.manage">
                          <Button variant="ghost" onClick={() => openEdit(rs)}>
                            {t('common.edit', 'Edit')}
                          </Button>
                          {rs.isActive ? (
                            <Button variant="ghost" onClick={() => deactivateMutation.mutate(rs.id)}>
                              {t('admin.sport_rule_sets.deactivate', 'Deactivate')}
                            </Button>
                          ) : (
                            <Button variant="ghost" onClick={() => activateMutation.mutate(rs.id)}>
                              {t('admin.sport_rule_sets.activate', 'Activate')}
                            </Button>
                          )}
                        </Can>
                      </div>
                    </div>
                  ))}
                  {detail && ruleSetsOf(detail).length === 0 && !detailQuery.isLoading && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {t('admin.sport_rule_sets.empty', 'No rule-set versions yet')}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Visual rule-set create/edit modal ── */}
      <Modal
        open={modal != null}
        onClose={closeModal}
        title={
          modal?.mode === 'edit'
            ? t('admin.sport_rule_sets.edit_title', 'Edit Rule-Set Version')
            : t('admin.sport_rule_sets.new_version', 'New Version')
        }
      >
        {modal && (
          <div className="space-y-4">
            {modal.mode === 'edit' && modal.ruleSet.referenceCount > 0 && (
              <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-xs text-[var(--color-text-muted)]">
                {t('admin.sport_rule_sets.locked', 'This version is referenced by history — scoring is locked. Create a new version to change rules.')}
              </p>
            )}
            <div>
              <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                {t('admin.sport_rule_sets.name', 'Name')}
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className="w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 text-sm"
              />
            </div>
            <RuleSetVisualEditor
              key={modal.mode === 'edit' ? `edit-${modal.ruleSet.id}` : `create-${modal.formatId}`}
              rules={editor.rules as Record<string, unknown>}
              standingsRules={editor.standingsRules}
              onChange={(r, s) => setEditor({ rules: r, standingsRules: s })}
              disabled={modal.mode === 'edit' && modal.ruleSet.referenceCount > 0}
            />
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                {t('admin.sport_rule_sets.activate_on_save', 'Activate on save')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
                {t('admin.sport_formats.default', 'Default')}
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={closeModal}>{t('common.cancel', 'Cancel')}</Button>
              <Button type="button" loading={createMutation.isPending || updateMutation.isPending} onClick={submit}>
                {modal.mode === 'edit' ? t('common.update', 'Update') : t('common.create', 'Create')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── First-format creation modal (empty-state path — Phase 1) ── */}
      <Modal
        open={createFirstOpen}
        onClose={() => {
          if (!createFirstFormatMutation.isPending) setCreateFirstOpen(false);
        }}
        title={t('admin.sport_formats.new', 'New Format')}
      >
        <form onSubmit={submitFirstFormat} className="space-y-4">
          <div>
            <label htmlFor="ff-name" className="mb-1 block text-xs text-[var(--color-text-muted)]">
              {t('admin.sport_formats.name', 'Name')}
            </label>
            <input
              id="ff-name"
              data-testid="format-name-input"
              value={cfName}
              onChange={(e) => setCfName(e.target.value)}
              maxLength={120}
              className="w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="ff-type" className="mb-1 block text-xs text-[var(--color-text-muted)]">
              {t('admin.sport_formats.type', 'Format type')}
            </label>
            <select
              id="ff-type"
              data-testid="format-type-select"
              value={cfType}
              onChange={(e) => setCfType(e.target.value as SportFormatType)}
              className="w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 text-sm"
            >
              <option value="singles">Singles</option>
              <option value="doubles">Doubles</option>
              <option value="team">Team</option>
            </select>
          </div>
          <div>
            <label htmlFor="ff-desc" className="mb-1 block text-xs text-[var(--color-text-muted)]">
              {t('admin.sport_formats.description', 'Description')}
            </label>
            <input
              id="ff-desc"
              data-testid="format-description-input"
              value={cfDescription}
              onChange={(e) => setCfDescription(e.target.value)}
              maxLength={255}
              className="w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setCreateFirstOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="submit"
              loading={createFirstFormatMutation.isPending}
              disabled={createFirstFormatMutation.isPending}
              data-testid="create-first-format-submit"
            >
              {t('common.create', 'Create')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}