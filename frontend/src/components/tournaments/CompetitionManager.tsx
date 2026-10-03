import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Can } from '../../permissions/Can';
import { useToast } from '../ui/Toast';
import { useTranslation } from '../../i18n';
import { orgTournamentApi } from '../../services/tournament';

interface Props {
  orgId: string;
  tournamentId: number;
}

/** Shape returned by `describeForManagement` (backend adds the derived counters). */
interface ManagedCompetition {
  id: number;
  name: string;
  competition_type: 'singles' | 'doubles' | 'team';
  entry_fee: number;
  registration_fee: number;
  currency_code: string;
  price_type: 'FREE' | 'FIXED' | 'MEMBERS_ONLY';
  max_participants: number | null;
  min_participants: number;
  waitlist_enabled: number | boolean;
  is_default: boolean;
  active_participants: number;
  waiting_participants: number;
  can_deactivate: boolean;
  deactivation_blockers: string[];
}

const TYPES: Array<{ value: ManagedCompetition['competition_type']; label: string }> = [
  { value: 'singles', label: 'Singles' },
  { value: 'doubles', label: 'Doubles' },
  { value: 'team', label: 'Team' },
];

const PRICE_TYPES: Array<ManagedCompetition['price_type']> = ['FREE', 'FIXED', 'MEMBERS_ONLY'];

const EMPTY_FORM = {
  competition_type: 'singles' as ManagedCompetition['competition_type'],
  name: '',
  entry_fee: 0,
  registration_fee: 0,
  currency_code: 'EGP',
  price_type: 'FIXED' as ManagedCompetition['price_type'],
  max_participants: '' as string | number,
  min_participants: 2,
  waitlist_enabled: false,
};

type CompetitionFormState = typeof EMPTY_FORM;

/**
 * G11.21.1 — the parent-tournament fields a NEW category inherits.
 * G11.21.2 adds `currency_code` (same defect class, same fix).
 * Subset of the tournament detail row (`orgTournamentApi.getTournament`), kept
 * structural so the component never has to know more than it consumes.
 */
export interface TournamentInheritanceDefaults {
  entry_fee?: number | null;
  registration_fee?: number | null;
  waitlist_enabled?: number | boolean | null;
  currency_code?: string | null;
}

/**
 * G11.21.1 / G11.21.2 — build the CREATE form from the parent tournament's configuration.
 *
 * Why this exists: the backend only inherits a fee/waitlist/currency when the
 * request OMITS it. `openCreate` used to seed `entry_fee: 0` /
 * `waitlist_enabled: false` / `currency_code: 'EGP'` and `save()` always
 * submitted them, so the UI turned every inherited value into an explicit
 * override — the tournament's configured fee was silently dropped (100% revenue
 * loss), its waitlist silently disabled, and a non-EGP tournament produced
 * EGP categories (players charged in the wrong currency). Seeding from the
 * tournament makes the stored value correct AND shows the operator exactly what
 * will be charged.
 *
 * Normalisation (deliberately NOT `||`):
 *   • `??` for the fees, so a legitimate `0` is never mistaken for "unset";
 *   • `registration_fee` mirrors the backend chain — an absent tournament
 *     registration fee falls back to the tournament entry fee;
 *   • `Boolean(Number(...))` for the waitlist, because MySQL returns a tinyint
 *     `0`/`1` and `||` would coerce an inherited `0` into `false` while leaking
 *     a NUMBER `1` into a boolean field. An explicit `false` stays `false`.
 *
 * G11.21.2 — currency: `trim().toUpperCase()` so a lowercase/whitespace-padded
 * tournament code (`'sar'`, `' SAR '`) normalises to `'SAR'`. Here `||` IS the
 * right operator (unlike above): it is only reached for an empty/blank string,
 * and a currency code is never a falsy-but-valid value, so `'EGP'` is the only
 * correct fallback — matching the backend's own `'EGP'` fallback.
 *
 * `tournament` may be null/undefined (query still loading or failed); the form
 * then falls back to the previous defaults rather than throwing.
 */
export function buildCreateForm(
  tournament: TournamentInheritanceDefaults | null | undefined,
): CompetitionFormState {
  const inheritedCurrency = String(tournament?.currency_code ?? '').trim().toUpperCase();
  return {
    ...EMPTY_FORM,
    entry_fee: Number(tournament?.entry_fee ?? 0),
    registration_fee: Number(tournament?.registration_fee ?? tournament?.entry_fee ?? 0),
    waitlist_enabled: Boolean(Number(tournament?.waitlist_enabled ?? 0)),
    currency_code: inheritedCurrency || 'EGP',
  };
}

const inputCls =
  'w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';
const labelCls = 'block text-xs font-medium text-[var(--color-text-muted)] mb-1';
const btnPrimary =
  'px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white disabled:opacity-50';
const btnGhost =
  'px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)] disabled:opacity-50';

/** Backend Zod messages are authoritative; only fall back for transport failures. */
function errorMessage(err: unknown, fallback: string): string {
  const anyErr = err as any;
  return anyErr?.response?.data?.message || anyErr?.message || fallback;
}

/**
 * G11.20 — Competition Category Management.
 *
 * A tournament hosts one or more categories (Singles / Doubles / Teams) and every
 * category owns its own fee, currency, capacity, waitlist and eligibility config.
 * Until G11.20 a tournament could only ever hold the single auto-created default
 * category, which made every competition-scoped feature (registration, seeds,
 * prizes, match generation) unreachable — this screen is what makes the
 * multi-competition state reachable through the product.
 *
 * Safety rules surfaced in the UI (all also enforced server-side, which is
 * authoritative):
 *   • the DEFAULT category can never be deactivated and is created automatically
 *     at tournament creation — it is what preserves legacy single-competition
 *     behavior and the "exactly one default" invariant;
 *   • a category holding registrations/participants/seeds/matches cannot be
 *     deactivated (removal would cascade-delete real tournament history);
 *   • the last remaining category cannot be deactivated.
 */
export default function CompetitionManager({ orgId, tournamentId }: Props) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CompetitionFormState>(EMPTY_FORM);

  // G11.21.1 — the parent tournament's revenue/waitlist configuration, used to
  // seed the Create form. The query key is deliberately IDENTICAL to the one
  // `TournamentDetailPage` already uses (`['org-${orgId}-tournament',
  // tournamentId]`), so React Query serves this from the parent's warm cache and
  // NO extra HTTP request is issued. Uses the existing
  // `orgTournamentApi.getTournament` — no new endpoint.
  const { data: tournament, isLoading: loadingTournament } = useQuery({
    queryKey: [`org-${orgId}-tournament`, tournamentId],
    queryFn: () => orgTournamentApi.getTournament(orgId, tournamentId),
  });

  const queryKey = ['org-tournament-competitions', orgId, tournamentId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => orgTournamentApi.listCompetitions(orgId, tournamentId),
  });
  const competitions: ManagedCompetition[] = Array.isArray(data) ? data : [];

  function openCreate() {
    setEditingId(null);
    // Inherit the tournament's fee/waitlist config instead of forcing 0/false.
    setForm(buildCreateForm(tournament));
    setOpen(true);
  }

  function openEdit(c: ManagedCompetition) {
    setEditingId(c.id);
    setForm({
      competition_type: c.competition_type,
      name: c.name,
      entry_fee: Number(c.entry_fee ?? 0),
      registration_fee: Number(c.registration_fee ?? 0),
      currency_code: c.currency_code ?? 'EGP',
      price_type: c.price_type ?? 'FIXED',
      max_participants: c.max_participants ?? '',
      min_participants: Number(c.min_participants ?? 2),
      waitlist_enabled: Boolean(c.waitlist_enabled),
    });
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setEditingId(null);
  }

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        competition_type: form.competition_type,
        name: form.name.trim(),
        entry_fee: Number(form.entry_fee) || 0,
        registration_fee: Number(form.registration_fee) || 0,
        currency_code: String(form.currency_code || 'EGP').toUpperCase(),
        price_type: form.price_type,
        min_participants: Number(form.min_participants) || 2,
        waitlist_enabled: form.waitlist_enabled,
        // Blank capacity means "unlimited" (NULL in the DB), which is what the
        // tournament itself uses — never coerce it to 0 (which means "none").
        max_participants: form.max_participants === '' ? null : Number(form.max_participants),
      };
      return editingId != null
        ? orgTournamentApi.updateCompetition(orgId, tournamentId, editingId, payload)
        : orgTournamentApi.createCompetition(orgId, tournamentId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      close();
      showToast(editingId != null
        ? t('tournaments.competition.updated', 'Competition category updated')
        : t('tournaments.competition.created', 'Competition category created'), 'success');
    },
    onError: (err) => showToast(errorMessage(err, t('tournaments.competition.save_failed', 'Could not save the competition category')), 'error'),
  });

  const deactivate = useMutation({
    mutationFn: (competitionId: number) => orgTournamentApi.deactivateCompetition(orgId, tournamentId, competitionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      showToast(t('tournaments.competition.deactivated', 'Competition category deactivated'), 'success');
    },
    onError: (err) => showToast(errorMessage(err, t('tournaments.competition.deactivate_failed', 'Could not deactivate the competition category')), 'error'),
  });

  // Client-side pre-check mirroring the server guards, so an operator gets an
  // explanation instead of a request that is guaranteed to be rejected.
  const nameError = form.name.trim().length === 0 ? t('tournaments.competition.name_required', 'Name is required') : null;
  const min = Number(form.min_participants) || 2;
  const max = form.max_participants === '' ? null : Number(form.max_participants);
  const rangeError = max != null && min > max
    ? t('tournaments.competition.invalid_range', 'Minimum participants cannot exceed maximum participants')
    : null;
  const canSubmit = !nameError && !rangeError && !save.isPending;

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            {t('tournaments.competition.title', 'Competition Categories')}
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            {t('tournaments.competition.hint', 'Each category has its own entry fee, capacity, waitlist and eligibility.')}
          </p>
        </div>
        <Can permission="tournament.competition.create">
          {/* G11.21.1 — blocked while the parent tournament config is still loading,
              so a new category can never be seeded with the free fallback defaults. */}
          <button type="button" onClick={openCreate} disabled={loadingTournament} className={btnPrimary} data-testid="competition-create">
            {t('tournaments.competition.create', 'Add category')}
          </button>
        </Can>
      </div>

      {isLoading ? (
        <p className="text-xs text-[var(--color-text-muted)]">{t('common.loading', 'Loading…')}</p>
      ) : competitions.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          {t('tournaments.competition.empty', 'No competition categories yet.')}
        </p>
      ) : (
        <ul className="space-y-2" data-testid="competition-list">
          {competitions.map((c) => {
            const cap = c.max_participants;
            const capacityLabel = cap == null || Number(cap) === 0
              ? t('tournaments.competition.unlimited', 'Unlimited')
              : `${c.active_participants}/${cap}`;
            const blocker = c.is_default
              ? t('tournaments.competition.blocked_default', 'The default category cannot be deactivated')
              : c.deactivation_blockers.length > 0
                ? t('tournaments.competition.blocked_data', 'This category still has tournament data')
                : null;
            return (
              <li key={c.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--color-text)]">{c.name}</span>
                      {c.is_default && (
                        <span className="rounded bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--color-primary)]">
                          {t('tournaments.competition.default_badge', 'Default')}
                        </span>
                      )}
                      <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--color-text-muted)]">
                        {c.competition_type}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]" data-testid={`competition-meta-${c.id}`}>
                      {Number(c.entry_fee ?? 0) > 0
                        ? `${Number(c.entry_fee)} ${c.currency_code}`
                        : t('tournaments.competition.free', 'Free')}
                      {' · '}
                      {/* G11.21.3 — informational only: registration_fee is never used for charging. */}
                      {t('tournaments.competition.registration', 'Registration')}:{' '}
                      {Number(c.registration_fee ?? 0) > 0
                        ? `${Number(c.registration_fee)} ${c.currency_code}`
                        : t('tournaments.competition.free', 'Free')}
                      {' · '}
                      {t('tournaments.competition.capacity', 'Capacity')}: {capacityLabel}
                      {' · '}
                      {t('tournaments.competition.waiting', 'Waiting')}: {c.waiting_participants}
                      {Number(c.waitlist_enabled) === 1 ? '' : ` · ${t('tournaments.competition.waitlist_off', 'Waitlist off')}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Can permission="tournament.competition.update">
                      <button type="button" onClick={() => openEdit(c)} className={btnGhost}>
                        {t('tournaments.competition.edit', 'Edit')}
                      </button>
                    </Can>
                    <Can permission="tournament.competition.deactivate">
                      <button
                        type="button"
                        onClick={() => deactivate.mutate(c.id)}
                        disabled={!c.can_deactivate || deactivate.isPending}
                        title={blocker ?? undefined}
                        className={btnGhost}
                      >
                        {t('tournaments.competition.deactivate', 'Deactivate')}
                      </button>
                    </Can>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {blockerNote(competitions)}

      {open && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2,var(--color-surface))] p-3 space-y-3">
          <h3 className="text-xs font-semibold text-[var(--color-text)]">
            {editingId != null
              ? t('tournaments.competition.edit_title', 'Edit competition category')
              : t('tournaments.competition.create_title', 'New competition category')}
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="cmp-type">{t('tournaments.competition.type', 'Category')}</label>
              <select
                id="cmp-type"
                className={inputCls}
                value={form.competition_type}
                onChange={(e) => setForm({ ...form, competition_type: e.target.value as ManagedCompetition['competition_type'] })}
              >
                {TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="cmp-name">{t('tournaments.competition.name', 'Name')}</label>
              <input
                id="cmp-name"
                className={inputCls}
                value={form.name}
                maxLength={200}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {nameError && <p className="mt-1 text-xs text-[var(--color-danger,#dc2626)]">{nameError}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="cmp-entry">{t('tournaments.competition.entry_fee', 'Entry fee')}</label>
              <input
                id="cmp-entry"
                type="number"
                min={0}
                step="0.01"
                className={inputCls}
                value={form.entry_fee}
                onChange={(e) => setForm({ ...form, entry_fee: Number(e.target.value) })}
              />
            </div>
            <div>
              <span className={labelCls}>
                {t('tournaments.competition.registration_fee', 'Registration fee')}
              </span>
              {/* G11.21.3 — READ-ONLY. The accounting/payment layer never uses
                  registration_fee for charging; it is shown for reference and
                  preserved unchanged whenever the category is edited. */}
              <p className={`${inputCls} text-[var(--color-text-muted)]`} data-testid="registration-fee-readonly">
                {Number(form.registration_fee ?? 0) > 0
                  ? `${Number(form.registration_fee)} ${form.currency_code}`
                  : t('tournaments.competition.free', 'Free')}
              </p>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                {t('tournaments.competition.registration_fee_hint', 'Informational — not used for charging.')}
              </p>
            </div>
            <div>
              <label className={labelCls} htmlFor="cmp-currency">{t('tournaments.competition.currency', 'Currency')}</label>
              <input
                id="cmp-currency"
                className={inputCls}
                maxLength={3}
                value={form.currency_code}
                onChange={(e) => setForm({ ...form, currency_code: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="cmp-price">{t('tournaments.competition.price_type', 'Price type')}</label>
              <select
                id="cmp-price"
                className={inputCls}
                value={form.price_type}
                onChange={(e) => setForm({ ...form, price_type: e.target.value as ManagedCompetition['price_type'] })}
              >
                {PRICE_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="cmp-max">
                {t('tournaments.competition.max_participants', 'Max participants (blank = unlimited)')}
              </label>
              <input
                id="cmp-max"
                type="number"
                min={0}
                className={inputCls}
                value={form.max_participants}
                placeholder={t('tournaments.competition.unlimited', 'Unlimited')}
                onChange={(e) => setForm({ ...form, max_participants: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="cmp-min">{t('tournaments.competition.min_participants', 'Min participants')}</label>
              <input
                id="cmp-min"
                type="number"
                min={2}
                className={inputCls}
                value={form.min_participants}
                onChange={(e) => setForm({ ...form, min_participants: Number(e.target.value) })}
              />
              {rangeError && <p className="mt-1 text-xs text-[var(--color-danger,#dc2626)]">{rangeError}</p>}
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-xs text-[var(--color-text)]">
                <input
                  type="checkbox"
                  checked={form.waitlist_enabled}
                  onChange={(e) => setForm({ ...form, waitlist_enabled: e.target.checked })}
                />
                {t('tournaments.competition.waitlist_enabled', 'Enable waitlist')}
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => save.mutate()} disabled={!canSubmit} className={btnPrimary}>
              {t('common.save', 'Save')}
            </button>
            <button type="button" onClick={close} className={btnGhost}>
              {t('common.cancel', 'Cancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Inline reminder of the immutable default category. */
function blockerNote(competitions: ManagedCompetition[]) {
  if (competitions.length === 0) return null;
  return (
    <p className="text-[11px] text-[var(--color-text-muted)]">
      {competitions.filter((c) => c.is_default).length === 1
        ? 'The default category is created automatically and preserves legacy behavior for players who do not pick a category.'
        : null}
    </p>
  );
}