import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { orgTournamentApi } from '../../services/tournament';
import { Button, Input, Card } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';
import { getErrorMessage } from '../../utils/errors';
import { PrizeEditor, type PrizeEditorRow } from '../../components/tournaments/PrizeEditor';
import SponsorEditor, { type SponsorEditorRow } from '../../components/tournaments/SponsorEditor';
import EligibilityFormSection, { EMPTY_ELIGIBILITY, type TournamentEligibilityFormValue } from '../../components/tournaments/EligibilityFormSection';
import MapLocationPicker, { type PickedLocation } from '../../components/map/MapLocationPicker';
import { CreateWizardStepper, type WizardStepItem } from '../../components/tournaments/wizard/CreateWizardStepper';
import { TournamentFormatSelector, type TournamentFormatCard } from '../../components/tournaments/wizard/TournamentFormatSelector';

type TournamentForm = {
  /**
   * G11 Phase 3 — the OWNING ORGANISATION. Required in BOTH contexts: the
   * CourtZon platform never creates, owns, funds, or recognises a tournament.
   * In `org` mode it is forced from the route (rendered read-only); in `admin`
   * mode the super admin picks it, and submitting without one is impossible.
   */
  organisationId: string;
  name: string;
  description?: string;
  category?: string;
  season?: string;
  bracketTypeId: string;
  sportId?: string;
  matchFormatId?: string;
  ruleSetId?: string;
  maxParticipants: string;
  minParticipants?: string;
  entryFee?: string;
  startDate: string;
  endDate?: string;
  registrationOpens?: string;
  registrationCloses?: string;
  /** Group 4 — venue branch (organisation branch). */
  branchId?: string;
  /** Group 4 — daily playing window (venue-local time). */
  dailyStartTime?: string;
  dailyEndTime?: string;
  prizeDescription?: string;
};

export type TournamentCreateContextMode = 'admin' | 'org';

interface Props {
  mode?: TournamentCreateContextMode;
  orgId?: string;
}

interface BracketTypeOption {
  id: number;
  name: string;
  slug: string;
  is_active: boolean | number;
  config_schema: string | null;
}

interface OrganisationOption {
  id: number;
  name: string;
  country_code?: string | null;
  status?: string | null;
}

interface SportFormatGroup {
  format: { id: number; name: string; formatType: string; description?: string | null };
  ruleSets: { id: number; name: string | null; version: number; humanReadable?: string | null }[];
}

/** Group 5B-SR — engine-capable bracket types (mirror of the backend constant). */

/**
 * ONE SHARED multi-step Tournament Creation Wizard. Used by the Super Admin
 * workbench (`/admin/tournament/list/new`) and the Org Admin portal
 * (`/org/:orgId/tournaments/new`). Only the owning-organisation field and the
 * post-create navigation differ per context; the form, validation and field
 * permissions stay single-source.
 *
 * Wizard steps — one coherent react-hook-form state (no independent islands):
 *   1. Basics · 2. Format · 3. Participants & Registration · 4. Schedule & Venue
 *   5. Rules & Eligibility · 6. Payments · 7. Prizes & Sponsors · 8. Review & Create
 *
 * Format guard: only engine-executable formats (single-elimination,
 * round-robin) are submitted. Double Elimination, Swiss and
 * Group Stage + Knockout are shown as "Engine preparation" — the Group Stage +
 * Knockout card additionally presents the planned future configuration journey
 * (a UX foundation; nothing is persisted for it yet).
 *
 * G11 Phase 3 (LOCKED PRODUCT RULE) — the CourtZon PLATFORM never creates,
 * owns, funds, or financially recognises a tournament. Only an ORGANISATION
 * may. Every create is submitted to `POST /org/:orgId/tournaments` in BOTH
 * contexts; `admin` mode requires the super admin to pick the owning org first;
 * `tournament_type`, `currency_code`, `commission_rate` and `organisation_id`
 * are never client-authoritative.
 */
export default function TournamentCreatePage({ mode = 'admin', orgId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // G11.18 Phase 3 — venue handling (location auto-captured by the map picker).
  const [venueMode, setVenueMode] = useState<'ORGANISATION_COURTS' | 'EXTERNAL_VENUE'>('ORGANISATION_COURTS');
  const [externalVenue, setExternalVenue] = useState<PickedLocation | null>(null);
  const [showVenuePicker, setShowVenuePicker] = useState(false);

  const isOrg = mode === 'org';

  // ── Wizard navigation state ──
  const WIZARD_STEPS: WizardStepItem[] = useMemo(
    () => [
      { id: 'basics', label: t('tournaments.wizard.step.basics', 'Basics') },
      { id: 'format', label: t('tournaments.wizard.step.format', 'Format') },
      { id: 'participants', label: t('tournaments.wizard.step.participants', 'Participants & Registration') },
      { id: 'schedule', label: t('tournaments.wizard.step.schedule', 'Schedule & Venue') },
      { id: 'rules', label: t('tournaments.wizard.step.rules', 'Rules & Eligibility') },
      { id: 'payments', label: t('tournaments.wizard.step.payments', 'Payments') },
      { id: 'prizes', label: t('tournaments.wizard.step.prizes', 'Prizes & Sponsors') },
      { id: 'review', label: t('tournaments.wizard.step.review', 'Review & Create') },
    ],
    [t],
  );
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [failedSteps, setFailedSteps] = useState<string[]>([]);
  const [plannedFormatKey, setPlannedFormatKey] = useState<string | null>(null);

  // ── One shared form state ──
  const TournamentSchema = useMemo(
    () =>
      z
        .object({
          organisationId: z.string(),
          name: z.string().min(2, t('tournaments.create.validation.name')),
          description: z.string().optional(),
          category: z.string().optional(),
          season: z.string().optional(),
          bracketTypeId: z.string().min(1, t('tournaments.create.validation.bracket_type')),
          sportId: z.string().optional(),
          matchFormatId: z.string().optional(),
          ruleSetId: z.string().optional(),
          maxParticipants: z.string().min(1, t('tournaments.create.validation.max_players')),
          minParticipants: z.string().optional(),
          entryFee: z.string().optional(),
          startDate: z.string().min(1, t('tournaments.create.validation.start_date')),
          endDate: z.string().optional(),
          registrationOpens: z.string().optional(),
          registrationCloses: z.string().optional(),
          branchId: z.string().optional(),
          dailyStartTime: z.string().optional(),
          dailyEndTime: z.string().optional(),
          prizeDescription: z.string().optional(),
        })
        .refine(
          (v) => !v.dailyStartTime || !v.dailyEndTime || v.dailyStartTime < v.dailyEndTime,
          { message: t('tournaments.create.validation.daily_window'), path: ['dailyEndTime'] },
        ),
    [t],
  );

  const {
    control,
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    trigger,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<TournamentForm>({
    resolver: zodResolver(TournamentSchema),
    defaultValues: {
      organisationId: isOrg ? (orgId ?? '') : '',
      bracketTypeId: '',
      maxParticipants: '16',
    },
  });

  const selectedOrgId = useWatch({ control, name: 'organisationId' }) ?? '';
  const effectiveOrgId = (isOrg ? (orgId ?? '') : selectedOrgId).trim();
  const hasOwningOrg = effectiveOrgId !== '';
  const endpoint = hasOwningOrg ? `/org/${effectiveOrgId}/tournaments` : null;
  const detailPath = (id: number) =>
    isOrg && orgId ? `/org/${orgId}/tournaments/${id}` : `/admin/tournament/list/${id}`;

  const selectedSport = watch('sportId');
  const selectedFormat = watch('matchFormatId');
  const selectedBracket = watch('bracketTypeId');

  // ── Reads ──
  const { data: organisationList, isLoading: orgsLoading } = useQuery({
    queryKey: ['admin-organisations', 'tournament-create'],
    queryFn: () => api.get('/organisations', { params: { limit: 200 } }).then((r) => r.data),
    enabled: !isOrg,
  });
  const orgOptions: OrganisationOption[] = useMemo(() => {
    const raw = organisationList?.data ?? organisationList ?? [];
    return Array.isArray(raw) ? (raw as OrganisationOption[]) : [];
  }, [organisationList]);

  const { data: bracketTypes } = useQuery({
    queryKey: ['bracket-types', effectiveOrgId],
    queryFn: () => orgTournamentApi.getBracketTypes(effectiveOrgId),
    enabled: hasOwningOrg,
  });
  const bracketOptions: BracketTypeOption[] = bracketTypes?.data ?? [];

  const { data: commissionConfig } = useQuery({
    queryKey: ['org-commission', effectiveOrgId],
    queryFn: () => orgTournamentApi.getCommissionConfig(effectiveOrgId),
    enabled: hasOwningOrg,
  });
  const commissionRate = commissionConfig?.commissionRate ?? 0;
  const orgCurrency = commissionConfig?.currencyCode as string | undefined;

  const { data: orgBranches } = useQuery({
    queryKey: ['org-branches', effectiveOrgId],
    queryFn: () => api.get(`/org/${effectiveOrgId}/branches`).then((r) => r.data),
    enabled: hasOwningOrg,
  });
  const branchOptions: { id: number; name: string; address_line1?: string | null; city?: string | null }[] = orgBranches?.data ?? orgBranches ?? [];

  const { data: sports } = useQuery({
    queryKey: ['sports'],
    queryFn: () => api.get('/sports').then((r) => r.data),
  });

  const { data: formatCascade } = useQuery({
    queryKey: ['sport-formats-cascade', effectiveOrgId, selectedSport, selectedBracket],
    queryFn: () => orgTournamentApi.getSportFormats(effectiveOrgId, selectedSport!, selectedBracket || undefined),
    enabled: hasOwningOrg && !!selectedSport,
  });
  const formatGroups: SportFormatGroup[] = formatCascade?.data ?? [];

  const generatedRulesPreview = (() => {
    const group = formatGroups.find((g) => String(g.format.id) === selectedFormat);
    const ruleSet = group?.ruleSets.find((rs) => String(rs.id) === watch('ruleSetId'));
    return ruleSet?.humanReadable || group?.format.description || '';
  })();

  // Reset dependent selections when sport/format changes
  useEffect(() => {
    setValue('matchFormatId', '');
    setValue('ruleSetId', '');
  }, [selectedSport, setValue]);

  useEffect(() => {
    setValue('ruleSetId', '');
  }, [selectedFormat, setValue]);

  useEffect(() => {
    if (isOrg) return;
    setValue('branchId', '');
    setValue('bracketTypeId', '');
  }, [selectedOrgId, isOrg, setValue]);

  // ── Editors (separate states joined into the single submit payload) ──
  const [prizes, setPrizes] = useState<PrizeEditorRow[]>([]);
  const [sponsors, setSponsors] = useState<SponsorEditorRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<('cash' | 'card')[]>(['cash', 'card']);
  const togglePaymentMethod = (m: 'cash' | 'card') => {
    setPaymentMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };
  const [eligibility, setEligibility] = useState<TournamentEligibilityFormValue>(EMPTY_ELIGIBILITY);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post(endpoint as string, data),
    onSuccess: (res) => {
      showToast(t('tournaments.create.success'));
      navigate(detailPath(res.data.id));
    },
    onError: (err) => {
      showToast(`${t('tournaments.create.error')}: ${getErrorMessage(err)}`, 'error');
    },
  });

  const onSubmit = (data: TournamentForm) => {
    if (!hasOwningOrg || !endpoint) {
      showToast(t('tournaments.create.validation.organisation_required'), 'error');
      return;
    }
    if (eligibility.ageMode === 'categories' && eligibility.ageCategoryIds.length === 0) {
      showToast(t('tournaments.eligibility.age.validation'), 'error');
      return;
    }
    const structuredPrizes = prizes
      .filter((p) => p.prize_type && (p.description?.trim() || (p.prize_type === 'cash' && p.amount != null)))
      .map((p) => ({
        placement: p.placement ?? null,
        prize_type: p.prize_type,
        description: p.description?.trim() || undefined,
        amount: p.prize_type === 'cash' ? p.amount ?? undefined : undefined,
        currency_code: p.prize_type === 'cash' ? undefined : undefined,
      }));
    const sponsorPayload = sponsors
      .map((s, i) => ({
        name: s.name?.trim(),
        support_type: s.support_type ?? 'cash',
        amount: s.support_type === 'cash' ? (s.amount != null ? s.amount : undefined) : undefined,
        description: s.support_type === 'inkind' ? (s.description?.trim() || undefined) : undefined,
        display_order: i,
      }))
      .filter((s) => s.name);
    createMutation.mutate({
      name: data.name,
      description: data.description || undefined,
      category: data.category?.trim() || undefined,
      season: data.season?.trim() || undefined,
      bracket_type_id: Number(data.bracketTypeId),
      sport_id: data.sportId ? Number(data.sportId) : undefined,
      match_format_id: data.matchFormatId ? Number(data.matchFormatId) : undefined,
      rule_set_id: data.ruleSetId ? Number(data.ruleSetId) : undefined,
      max_participants: Number(data.maxParticipants),
      min_participants: data.minParticipants ? Number(data.minParticipants) : 2,
      entry_fee: data.entryFee ? Number(data.entryFee) : 0,
      registration_payment_methods: paymentMethods.length ? paymentMethods : ['cash', 'card'],
      currency_code: undefined,
      price_type: data.entryFee && Number(data.entryFee) > 0 ? 'FIXED' : 'FREE',
      start_date: data.startDate,
      end_date: data.endDate || undefined,
      registration_opens: data.registrationOpens || undefined,
      registration_closes: data.registrationCloses || undefined,
      branch_id: data.branchId ? Number(data.branchId) : undefined,
      daily_start_time: data.dailyStartTime ? `${data.dailyStartTime}:00` : undefined,
      daily_end_time: data.dailyEndTime ? `${data.dailyEndTime}:00` : undefined,
      venue_type: venueMode,
      venue_name: externalVenue?.venueName ?? undefined,
      venue_address: externalVenue?.address ?? undefined,
      venue_city: externalVenue?.city ?? undefined,
      venue_country: externalVenue?.country ?? undefined,
      latitude: externalVenue?.latitude ?? undefined,
      longitude: externalVenue?.longitude ?? undefined,
      place_id: externalVenue?.placeId ?? undefined,
      age_mode: eligibility.ageMode,
      age_category_ids: eligibility.ageMode === 'categories' && eligibility.ageCategoryIds.length ? eligibility.ageCategoryIds : undefined,
      gender_categories: eligibility.genderCategories.length ? eligibility.genderCategories : undefined,
      level_ids: eligibility.levelIds.length ? eligibility.levelIds : undefined,
      prize_description: data.prizeDescription || undefined,
      prizes: structuredPrizes.length ? structuredPrizes : undefined,
      sponsors: sponsorPayload.length ? sponsorPayload : undefined,
    });
  };

  // ── Step validation (field-level zod + step-level cross checks) ──
  const STEP_FIELDS: (keyof TournamentForm)[][] = [
    ['name'],
    // Only fields with required, always-rendered inputs are field-triggered.
    // Optional/conditional inputs (sport cascade, daily window, registration
    // window) are checked via the manual cross-checks below, and the full zod
    // schema is enforced by handleSubmit on the final Create action.
    ['bracketTypeId'],
    ['maxParticipants'],
    ['startDate'],
    [],
    ['entryFee'],
    [],
    [],
  ];

  const markFailed = (idx: number, ok: boolean) => {
    const stepId = WIZARD_STEPS[idx]?.id;
    if (!stepId) return;
    setFailedSteps((prev) => (ok ? prev.filter((f) => f !== stepId) : prev.includes(stepId) ? prev : [...prev, stepId]));
  };

  async function validateStep(idx: number): Promise<boolean> {
    let ok = STEP_FIELDS[idx].length ? await trigger(STEP_FIELDS[idx] as any) : true;

    if (idx === 0 && !isOrg && !selectedOrgId.trim()) ok = false;
    if (idx === 2) {
      const v = getValues();
      const min = v.minParticipants ? Number(v.minParticipants) : Number.NaN;
      const max = Number(v.maxParticipants);
      if (!Number.isNaN(min) && Number.isFinite(max) && min > max) {
        setError('minParticipants', { type: 'manual', message: t('tournaments.wizard.validation.min_max', 'Minimum participants cannot exceed maximum participants') });
        ok = false;
      } else {
        clearErrors('minParticipants');
      }
      if (v.registrationOpens && v.registrationCloses && v.registrationOpens > v.registrationCloses) {
        setError('registrationCloses', { type: 'manual', message: t('tournaments.wizard.validation.reg_window', 'Registration closes must be after registration opens') });
        ok = false;
      } else {
        clearErrors('registrationCloses');
      }
    }
    if (idx === 3) {
      const v = getValues();
      if (v.startDate && v.endDate && v.startDate > v.endDate) {
        setError('endDate', { type: 'manual', message: t('tournaments.wizard.validation.date_order', 'End date must be after the start date') });
        ok = false;
      } else {
        clearErrors('endDate');
      }
      if (v.dailyStartTime && v.dailyEndTime && v.dailyStartTime >= v.dailyEndTime) {
        setError('dailyEndTime', { type: 'manual', message: t('tournaments.create.validation.daily_window') });
        ok = false;
      } else {
        clearErrors('dailyEndTime');
      }
    }
    if (idx === 4 && eligibility.ageMode === 'categories' && eligibility.ageCategoryIds.length === 0) {
      ok = false;
    }
    if (idx === 5) {
      const v = getValues();
      if (v.entryFee && Number(v.entryFee) > 0 && paymentMethods.length === 0) {
        setError('entryFee', { type: 'manual', message: t('tournaments.create.payment_methods_required') });
        ok = false;
      } else {
        clearErrors('entryFee');
      }
    }
    markFailed(idx, ok);
    return ok;
  }

  const goNext = async () => {
    if (!(await validateStep(step))) return;
    const next = Math.min(step + 1, WIZARD_STEPS.length - 1);
    setStep(next);
    setMaxReached((m) => Math.max(m, next));
  };
  const goBack = () => setStep((s) => Math.max(0, s - 1));
  const goTo = (idx: number) => {
    if (idx <= maxReached) {
      setStep(idx);
      setMaxReached((m) => Math.max(m, idx));
    }
  };

  // ── Completion / indicators ──
  const values = watch();
  const completed = useMemo(() => {
    const ids: string[] = [];
    if (!!values.name?.trim() && (isOrg || !!effectiveOrgId)) ids.push('basics');
    if (!!values.bracketTypeId) ids.push('format');
    if (!!values.maxParticipants) ids.push('participants');
    if (!!values.startDate) ids.push('schedule');
    if (!(eligibility.ageMode === 'categories' && eligibility.ageCategoryIds.length === 0)) ids.push('rules');
    ids.push('payments', 'prizes', 'review');
    return ids;
  }, [values, isOrg, effectiveOrgId, eligibility]);

  // ── Format cards (the five target formats; only engine-executable are submit-ready) ──
  const formatCards: TournamentFormatCard[] = useMemo(() => {
    const bySlug = (slug: string) => bracketOptions.find((b) => b.slug === slug);
    const executable = (slug: string): TournamentFormatCard => {
      const opt = bySlug(slug);
      return {
        slug,
        key: slug,
        name: slug === 'single-elimination' ? t('tournaments.formats.single', 'Single Elimination') : t('tournaments.formats.round_robin', 'Round Robin'),
        executable: true,
        dbId: opt?.id ?? null,
        unavailable: !opt,
      };
    };
    const planned = (slug: string | null, key: string, name: string): TournamentFormatCard => ({
      slug,
      key,
      name,
      executable: false,
      dbId: null,
    });
    return [
      executable('single-elimination'),
      executable('round-robin'),
      planned('double-elimination', 'double-elimination', t('tournaments.formats.double', 'Double Elimination')),
      planned('swiss', 'swiss', t('tournaments.formats.swiss', 'Swiss System')),
      planned(null, 'group-stage-knockout', t('tournaments.formats.gsk', 'Group Stage + Knockout')),
    ];
  }, [bracketOptions, t]);

  const selectedBracketName = bracketOptions.find((b) => String(b.id) === String(getValues('bracketTypeId')))?.name ?? '';
  const selectedSportName = (Array.isArray(sports) ? sports : []).find((s: any) => String(s.id) === selectedSport)?.name ?? '';
  const selectedFormatName = formatGroups.find((g) => String(g.format.id) === selectedFormat)?.format.name ?? '';
  const selectedRuleSetName = formatGroups
    .find((g) => String(g.format.id) === selectedFormat)
    ?.ruleSets.find((rs) => String(rs.id) === getValues('ruleSetId'))?.name ?? '';

  const eligibilitySummary = (() => {
    const parts: string[] = [];
    parts.push(eligibility.ageMode === 'categories'
      ? t('tournaments.eligibility.open_or_categories.age.categories', 'Age categories')
      : t('tournaments.eligibility.open_or_categories.age.open', 'All ages'));
    if (eligibility.genderCategories.length) parts.push(eligibility.genderCategories.join(', '));
    if (eligibility.levelIds.length) parts.push(t('tournaments.wizard.review.level_restricted', 'Level-restricted'));
    return parts.join(' · ');
  })();

  const isLastStep = step === WIZARD_STEPS.length - 1;

  const inputCls = 'w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-sm text-[var(--color-text)]';
  const selectCls = `${inputCls} bg-[var(--color-surface)]`;
  const subCardCls = 'space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]/30 p-4';

  return (
    <div className="mx-auto max-w-3xl pb-8">
      <h1 className="mb-4 text-2xl font-bold text-[var(--color-text)]">{t('tournaments.create.title')}</h1>

      <CreateWizardStepper
        steps={WIZARD_STEPS}
        current={step}
        completed={completed}
        failed={failedSteps}
        maxReached={maxReached}
        onSelect={goTo}
      />

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Step content — remount on change replays the subtle fade (reduced-motion aware) */}
          <div key={step} className="cz-wizard-panel space-y-4 p-1 sm:p-2">
            {/* ─────────────── STEP 1 · BASICS ─────────────── */}
            {step === 0 && (
              <>
                {isOrg ? (
                  <div>
                    <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                      {t('tournaments.create.organisation')}
                    </span>
                    <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]/30 px-4 py-2.5 text-[var(--color-text)]">
                      {t('tournaments.create.organisation_selected', { id: effectiveOrgId })}
                    </p>
                  </div>
                ) : (
                  <Can permission="tournament.create.organisation">
                    <div>
                      <label htmlFor="tournament-owning-organisation" className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                        {t('tournaments.create.organisation')}
                      </label>
                      <select
                        id="tournament-owning-organisation"
                        {...register('organisationId')}
                        className={selectCls}
                      >
                        <option value="">
                          {orgsLoading ? t('common.loading') : t('tournaments.create.organisation_placeholder')}
                        </option>
                        {orgOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}{o.country_code ? ` — ${o.country_code}` : ''}
                          </option>
                        ))}
                      </select>
                      {!hasOwningOrg && (
                        <p className="mt-1 text-xs text-[var(--color-error)]">
                          {t('tournaments.create.validation.organisation_required')}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {t('tournaments.create.organisation_hint')}
                      </p>
                    </div>
                  </Can>
                )}

                <Can permission="tournaments.create.name">
                  <Input label={t('tournaments.create.name')} {...register('name')} error={errors.name?.message} />
                </Can>
                <Can permission="tournaments.create.description">
                  <Input label={t('tournaments.create.description')} tag="textarea" rows={3} {...register('description')} />
                </Can>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Can permission="tournaments.create.type">
                    <Input label={t('tournaments.create.category', 'Category')} {...register('category')} />
                  </Can>
                  <Can permission="tournaments.create.type">
                    <Input label={t('tournaments.create.season', 'Season')} {...register('season')} />
                  </Can>
                </div>
              </>
            )}

            {/* ─────────────── STEP 2 · FORMAT ─────────────── */}
            {step === 1 && (
              <>
                <div className="space-y-2">
                  <h2 className="text-sm font-semibold text-[var(--color-text)]">
                    {t('tournaments.create.bracket_type')}
                  </h2>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {t('tournaments.wizard.format.hint', 'The tournament structure. Only formats the engine can execute can be created today; planned formats are shown for the roadmap.')}
                  </p>
                </div>
                <TournamentFormatSelector
                  cards={formatCards}
                  selectedId={values.bracketTypeId}
                  plannedKey={plannedFormatKey}
                  onSelect={(id) => setValue('bracketTypeId', id, { shouldValidate: true })}
                  onRevealPlanned={setPlannedFormatKey}
                  disabled={!hasOwningOrg}
                  disabledReason={t('tournaments.wizard.format.org_required', 'Select the owning organisation to load available formats.')}
                />
                {errors.bracketTypeId?.message && (
                  <p className="text-xs text-[var(--color-error)]" role="alert">{errors.bracketTypeId.message}</p>
                )}

                <div className={`${subCardCls} space-y-4`}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    {t('tournaments.wizard.match_format_section', 'Match format & rule set')}
                  </p>
                  <Can permission="tournaments.create.sport">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">{t('tournaments.create.sport')}</label>
                      <select {...register('sportId')} className={selectCls}>
                        <option value="">{t('tournaments.create.any_sport')}</option>
                        {(Array.isArray(sports) ? sports : []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </Can>
                  {selectedSport && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Can permission="tournaments.create.match-format">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">{t('tournaments.create.match_format')}</label>
                          <select {...register('matchFormatId')} disabled={!hasOwningOrg} className={selectCls}>
                            <option value="">{t('tournaments.create.select_format')}</option>
                            {formatGroups.map((g) => (
                              <option key={g.format.id} value={g.format.id}>{g.format.name}</option>
                            ))}
                          </select>
                        </div>
                      </Can>
                      <Can permission="tournaments.create.rule-set">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">{t('tournaments.create.rule_set')}</label>
                          <select {...register('ruleSetId')} disabled={!selectedFormat || !hasOwningOrg} className={selectCls}>
                            <option value="">{t('tournaments.create.select_rule_set')}</option>
                            {formatGroups
                              .filter((g) => String(g.format.id) === selectedFormat)
                              .flatMap((g) => g.ruleSets)
                              .map((rs) => (
                                <option key={rs.id} value={rs.id}>
                                  {rs.name || `v${rs.version}`}
                                </option>
                              ))}
                          </select>
                        </div>
                      </Can>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ─────────────── STEP 3 · PARTICIPANTS & REGISTRATION ─────────────── */}
            {step === 2 && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Can permission="tournaments.create.max-participants">
                    <Input label={t('tournaments.create.max_players')} type="number" min={2} {...register('maxParticipants')} error={errors.maxParticipants?.message} />
                  </Can>
                  <Can permission="tournaments.create.min-participants">
                    <Input label={t('tournaments.create.min_players')} type="number" min={1} {...register('minParticipants')} error={errors.minParticipants?.message} />
                  </Can>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Can permission="tournaments.create.registration-dates">
                    <Input label={t('tournaments.create.registration_opens')} type="datetime-local" {...register('registrationOpens')} />
                  </Can>
                  <Can permission="tournaments.create.registration-dates">
                    <Input label={t('tournaments.create.registration_closes')} type="datetime-local" {...register('registrationCloses')} error={errors.registrationCloses?.message} />
                  </Can>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t('tournaments.wizard.participants.hint', 'Competition categories (singles / doubles / teams) are configured after creation in the Tournament Hub. The engine-ready competition format comes from the selected match format and rule set.')}
                </p>
              </>
            )}

            {/* ─────────────── STEP 4 · SCHEDULE & VENUE ─────────────── */}
            {step === 3 && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Can permission="tournaments.create.start-date">
                    <Input label={t('tournaments.create.start_date')} type="date" {...register('startDate')} error={errors.startDate?.message} />
                  </Can>
                  <Can permission="tournaments.create.end-date">
                    <Input label={t('tournaments.create.end_date')} type="date" {...register('endDate')} error={errors.endDate?.message} />
                  </Can>
                </div>

                <div className={`${subCardCls} space-y-3`}>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">Venue / Courts</label>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <label className="flex min-h-[44px] items-center gap-2 text-[var(--color-text)]">
                        <input type="radio" name="venueMode" value="ORGANISATION_COURTS"
                          checked={venueMode === 'ORGANISATION_COURTS'} onChange={() => setVenueMode('ORGANISATION_COURTS')} />
                        Organisation Courts
                      </label>
                      <label className="flex min-h-[44px] items-center gap-2 text-[var(--color-text)]">
                        <input type="radio" name="venueMode" value="EXTERNAL_VENUE"
                          checked={venueMode === 'EXTERNAL_VENUE'} onChange={() => setVenueMode('EXTERNAL_VENUE')} />
                        External Venue
                      </label>
                    </div>
                  </div>

                  {venueMode === 'ORGANISATION_COURTS' ? (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">{t('tournaments.create.venue')}</label>
                      <select {...register('branchId')} disabled={!hasOwningOrg} className={selectCls}>
                        <option value="">{t('tournaments.create.venue_none')}</option>
                        {branchOptions.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}{b.city ? ` — ${b.city}` : ''}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button type="button" onClick={() => setShowVenuePicker(true)}
                        className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-[var(--color-primary)]">
                        Select Location on Map
                      </button>
                      {externalVenue ? (
                        <div className="space-y-0.5 text-sm text-[var(--color-text-muted)]">
                          <p className="font-medium text-[var(--color-text)]">{externalVenue.venueName ?? 'Selected location'}</p>
                          {externalVenue.address && <p>{externalVenue.address}</p>}
                          {(externalVenue.city || externalVenue.country) && <p>{[externalVenue.city, externalVenue.country].filter(Boolean).join(', ')}</p>}
                          {externalVenue.mapsUrl && (
                            <a href={externalVenue.mapsUrl} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] underline">Open in Maps</a>
                          )}
                          <button type="button" onClick={() => setExternalVenue(null)} className="block text-xs text-[var(--color-error)]">Change location</button>
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--color-text-muted)]">No external venue selected yet.</p>
                      )}
                    </div>
                  )}
                </div>

                <Can permission="tournaments.create.prize">
                  <div className={`${subCardCls} space-y-3`}>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">{t('tournaments.create.daily_start')}</label>
                        <input type="time" {...register('dailyStartTime')} className={inputCls} />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">{t('tournaments.create.daily_end')}</label>
                        <input type="time" {...register('dailyEndTime')} className={inputCls} />
                      </div>
                    </div>
                    {errors.dailyEndTime?.message && (
                      <p className="text-xs text-[var(--color-error)]">{errors.dailyEndTime.message}</p>
                    )}
                    <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.create.daily_hint')}</p>
                  </div>
                </Can>
              </>
            )}

            {/* ─────────────── STEP 5 · RULES & ELIGIBILITY ─────────────── */}
            {step === 4 && (
              <>
                <EligibilityFormSection value={eligibility} onChange={setEligibility} />
                {eligibility.ageMode === 'categories' && eligibility.ageCategoryIds.length === 0 && (
                  <p className="text-xs text-[var(--color-error)]" role="alert">{t('tournaments.eligibility.age.validation')}</p>
                )}

                <Can permission="tournaments.create.rules">
                  <div className={subCardCls}>
                    <label className="block text-sm font-medium text-[var(--color-text)]">
                      {t('tournaments.create.generated_rules')}
                    </label>
                    {generatedRulesPreview ? (
                      <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">{generatedRulesPreview}</p>
                    ) : (
                      <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.create.generated_rules_empty')}</p>
                    )}
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {t('tournaments.wizard.rules.derived', 'The tournament rules snapshot is derived server-side from the selected format, match format and rule set. It is never typed by hand.')}
                    </p>
                  </div>
                </Can>
              </>
            )}

            {/* ─────────────── STEP 6 · PAYMENTS ─────────────── */}
            {step === 5 && (
              <>
                <Can permission="tournaments.create.prize">
                  <Input label={t('tournaments.create.entry_fee')} type="number" min={0} step="0.01" {...register('entryFee')} error={errors.entryFee?.message} />
                </Can>

                {values.entryFee && Number(values.entryFee) > 0 ? (
                  <Can permission="tournaments.create.prize">
                    <div className={`${subCardCls} space-y-3`}>
                      <label className="block text-sm font-medium text-[var(--color-text)]">
                        {t('tournaments.create.payment_methods')}
                      </label>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex min-h-[44px] items-center gap-2 text-sm text-[var(--color-text)]">
                          <input
                            type="checkbox"
                            checked={paymentMethods.includes('cash')}
                            onChange={() => togglePaymentMethod('cash')}
                            className="rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                          />
                          {t('tournaments.create.payment_cash')}
                        </label>
                        <label className="flex min-h-[44px] items-center gap-2 text-sm text-[var(--color-text)]">
                          <input
                            type="checkbox"
                            checked={paymentMethods.includes('card')}
                            onChange={() => togglePaymentMethod('card')}
                            className="rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                          />
                          {t('tournaments.create.payment_card')}
                        </label>
                      </div>
                      {paymentMethods.length === 0 && (
                        <p className="text-xs text-[var(--color-error)]">{t('tournaments.create.payment_methods_required')}</p>
                      )}
                      <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.create.payment_methods_hint')}</p>
                    </div>
                  </Can>
                ) : (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {t('tournaments.wizard.payments.free_note', 'Free tournament — no payment configuration is required.')}
                  </p>
                )}

                {/* Commission + currency — always the owning organisation's (locked) */}
                <div className={subCardCls}>
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-[var(--color-text)]">{t('tournaments.create.commission_rate')}</label>
                    <span className="font-semibold text-[var(--color-primary)]">{commissionRate}%</span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.create.commission_locked')}</p>
                  {orgCurrency && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {t('tournaments.create.currency')}: <span className="font-medium text-[var(--color-text)]">{orgCurrency}</span>
                    </p>
                  )}
                </div>
              </>
            )}

            {/* ─────────────── STEP 7 · PRIZES & SPONSORS ─────────────── */}
            {step === 6 && (
              <>
                <Can permission="tournaments.create.prize">
                  <Input label={t('tournaments.create.prize')} {...register('prizeDescription')} />
                </Can>
                <Can permission="tournaments.create.prize">
                  <div className={subCardCls}>
                    <PrizeEditor currencyCode={orgCurrency} value={prizes} onChange={setPrizes} />
                  </div>
                </Can>
                <Can permission="tournaments.create.prize">
                  <div className={subCardCls}>
                    <SponsorEditor value={sponsors} onChange={setSponsors} />
                  </div>
                </Can>
              </>
            )}

            {/* ─────────────── STEP 8 · REVIEW & CREATE ─────────────── */}
            {step === 7 && (
              <div className="space-y-4" data-testid="wizard-review">
                <p className="text-sm text-[var(--color-text-muted)]">
                  {t('tournaments.wizard.review.hint', 'Review the complete configuration, then create the tournament. Nothing is created until you confirm.')}
                </p>
                {createMutation.isError && (
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-error)]/40 bg-[var(--color-error-bg)] p-4 text-sm text-[var(--color-error-text)]" role="alert" data-testid="create-error-banner">
                    {t('tournaments.create.error')}: {getErrorMessage(createMutation.error)}
                  </div>
                )}

                <ReviewSection
                  title={t('tournaments.wizard.review.basics', 'Basics')}
                  complete={completed.includes('basics')}
                  onEdit={() => goTo(0)}
                  rows={[
                    { label: t('tournaments.create.organisation'), value: isOrg ? effectiveOrgId : values.organisationId || '-' },
                    { label: t('tournaments.create.name'), value: values.name || '-' },
                    { label: t('tournaments.create.category', 'Category'), value: values.category || '-' },
                    { label: t('tournaments.create.season', 'Season'), value: values.season || '-' },
                  ]}
                />
                <ReviewSection
                  title={t('tournaments.wizard.review.format', 'Format')}
                  complete={completed.includes('format')}
                  onEdit={() => goTo(1)}
                  rows={[
                    { label: t('tournaments.create.bracket_type'), value: selectedBracketName || '-' },
                    { label: t('tournaments.create.sport'), value: selectedSportName || '-' },
                    { label: t('tournaments.create.match_format'), value: selectedFormatName || '-' },
                    { label: t('tournaments.create.rule_set'), value: selectedRuleSetName || '-' },
                  ]}
                />
                <ReviewSection
                  title={t('tournaments.wizard.review.participants', 'Participants & Registration')}
                  complete={completed.includes('participants')}
                  onEdit={() => goTo(2)}
                  rows={[
                    { label: t('tournaments.create.max_players'), value: values.maxParticipants || '-' },
                    { label: t('tournaments.create.min_players'), value: values.minParticipants || '-' },
                    { label: t('tournaments.create.registration_opens'), value: values.registrationOpens || '-' },
                    { label: t('tournaments.create.registration_closes'), value: values.registrationCloses || '-' },
                  ]}
                />
                <ReviewSection
                  title={t('tournaments.wizard.review.schedule', 'Schedule & Venue')}
                  complete={completed.includes('schedule')}
                  onEdit={() => goTo(3)}
                  rows={[
                    { label: t('tournaments.create.start_date'), value: values.startDate || '-' },
                    { label: t('tournaments.create.end_date'), value: values.endDate || '-' },
                    {
                      label: 'Venue',
                      value:
                        venueMode === 'ORGANISATION_COURTS'
                          ? branchOptions.find((b) => String(b.id) === String(values.branchId))?.name || t('tournaments.create.venue_none', 'No branch')
                          : externalVenue?.venueName || t('tournaments.wizard.review.external_venue', 'External venue'),
                    },
                    { label: t('tournaments.create.daily_hint', 'Daily window'), value: values.dailyStartTime && values.dailyEndTime ? `${values.dailyStartTime} – ${values.dailyEndTime}` : '-' },
                  ]}
                />
                <ReviewSection
                  title={t('tournaments.wizard.review.rules', 'Rules & Eligibility')}
                  complete={completed.includes('rules')}
                  onEdit={() => goTo(4)}
                  rows={[{ label: t('tournaments.wizard.review.eligibility', 'Eligibility'), value: eligibilitySummary }]}
                />
                <ReviewSection
                  title={t('tournaments.wizard.review.payments', 'Payments')}
                  complete
                  onEdit={() => goTo(5)}
                  rows={[
                    { label: t('tournaments.create.entry_fee'), value: values.entryFee && Number(values.entryFee) > 0 ? `${values.entryFee} ${orgCurrency ?? ''}`.trim() : t('tournaments.price_type.free', 'Free') },
                    { label: t('tournaments.create.payment_methods'), value: values.entryFee && Number(values.entryFee) > 0 ? paymentMethods.join(' + ') : '-' },
                    { label: t('tournaments.create.commission_rate'), value: `${commissionRate}%` },
                  ]}
                />
                <ReviewSection
                  title={t('tournaments.wizard.review.prizes', 'Prizes & Sponsors')}
                  complete
                  onEdit={() => goTo(6)}
                  rows={[
                    { label: t('tournaments.wizard.review.prizes', 'Prizes'), value: prizes.length ? `${prizes.length}` : t('tournaments.wizard.review.none', 'None') },
                    { label: t('tournaments.wizard.review.sponsors', 'Sponsors'), value: sponsors.length ? `${sponsors.length}` : t('tournaments.wizard.review.none', 'None') },
                  ]}
                />
              </div>
            )}
          </div>

          {/* ── Wizard footer navigation ── */}
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0}
              className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 text-sm font-medium text-[var(--color-text)] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            >
              {t('common.back', 'Back')}
            </button>

            {!isLastStep ? (
              <button
                type="button"
                onClick={goNext}
                className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--color-primary)] px-6 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
              >
                {t('tournaments.wizard.continue', 'Continue')} →
              </button>
            ) : (
              <Can permission="org.tournaments.create">
                <Button
                  type="submit"
                  loading={createMutation.isPending}
                  disabled={!hasOwningOrg}
                  className="min-h-[44px]"
                >
                  {t('tournaments.create.submit')}
                </Button>
              </Can>
            )}
          </div>
        </form>
      </Card>

      <MapLocationPicker
        open={showVenuePicker}
        onClose={() => setShowVenuePicker(false)}
        onConfirm={(loc) => { setExternalVenue(loc); setShowVenuePicker(false); }}
      />
    </div>
  );
}

function ReviewSection({ title, complete, onEdit, rows }: { title: string; complete: boolean; onEdit: () => void; rows: { label: string; value: string }[] }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
          {complete ? (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] text-white" aria-hidden="true">✓</span>
          ) : (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-error)] text-[10px] text-white" aria-hidden="true">!</span>
          )}
          {title}
        </h3>
        <button
          type="button"
          onClick={onEdit}
          className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          {t('tournaments.wizard.review.edit', 'Edit')}
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="min-w-0">
            <dt className="text-xs text-[var(--color-text-muted)]">{r.label}</dt>
            <dd className="truncate font-medium text-[var(--color-text)]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}