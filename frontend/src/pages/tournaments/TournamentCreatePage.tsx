import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { orgTournamentApi, bracketTypeApi } from '../../services/tournament';
import { Button, Input, Card } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';
import { PrizeEditor, type PrizeEditorRow } from '../../components/tournaments/PrizeEditor';
import EligibilityFormSection, { EMPTY_ELIGIBILITY, type TournamentEligibilityFormValue } from '../../components/tournaments/EligibilityFormSection';

type TournamentForm = {
  name: string;
  description?: string;
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

interface SportFormatGroup {
  format: { id: number; name: string; formatType: string; description?: string | null };
  ruleSets: { id: number; name: string | null; version: number; humanReadable?: string | null }[];
}

/**
 * ONE SHARED create-tournament screen. Used by the Super Admin workbench
 * (`/admin/tournament/list/new`) and the Org Admin portal
 * (`/org/:orgId/tournaments/new`). Only the API endpoint and post-create
 * navigation differ per context; the form, validation and field permissions
 * stay single-source.
 *
 * Group 5B-SR: bracket types are loaded from the DB (single source of truth),
 * commission is locked (subscription-derived, server-authoritative), and the
 * Sport → Match Format → Rule Set cascade reuses the authoritative match
 * configuration.
 */
export default function TournamentCreatePage({ mode = 'admin', orgId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const isOrg = mode === 'org';
  const endpoint = isOrg && orgId ? `/org/${orgId}/tournaments` : `/admin/tournaments`;
  const detailPath = (id: number) =>
    isOrg && orgId ? `/org/${orgId}/tournaments/${id}` : `/admin/tournament/list/${id}`;

  const TournamentSchema = useMemo(
    () =>
      z
        .object({
          name: z.string().min(2, t('tournaments.create.validation.name')),
          description: z.string().optional(),
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
          // Group 4 — venue + daily playing window (server re-validates; the
          // form enforces the obvious start < end locally).
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
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TournamentForm>({
    resolver: zodResolver(TournamentSchema),
    defaultValues: { bracketTypeId: '', maxParticipants: '16' },
  });

  const selectedSport = watch('sportId');
  const selectedFormat = watch('matchFormatId');
  const selectedBracket = watch('bracketTypeId');

  // ── Group 5B-SR — bracket types from the authoritative DB table ──
  const { data: bracketTypes } = useQuery({
    queryKey: ['bracket-types'],
    queryFn: isOrg && orgId ? () => orgTournamentApi.getBracketTypes(orgId) : bracketTypeApi.listActive,
    enabled: !isOrg || !!orgId,
  });

  // ── Commission is locked + subscription-derived (read-only display) ──
  // Group 1A — the same org config read exposes the authoritative currency so
  // the screen can display it (single server-side source of truth).
  const { data: commissionConfig } = useQuery({
    queryKey: ['org-commission', orgId],
    queryFn: () => orgTournamentApi.getCommissionConfig(orgId!),
    enabled: isOrg && !!orgId,
  });
  const commissionRate = commissionConfig?.commissionRate ?? 0;
  const orgCurrency = isOrg ? commissionConfig?.currencyCode : undefined;

  // ── Group 4 — venue: the organisation's branches (reuses the existing
  // org/branch architecture; no free-text location system). ──
  const { data: orgBranches } = useQuery({
    queryKey: ['org-branches', orgId],
    queryFn: () => api.get(`/org/${orgId}/branches`).then((r) => r.data),
    enabled: isOrg && !!orgId,
  });
  const branchOptions: { id: number; name: string; address_line1?: string | null; city?: string | null }[] = orgBranches?.data ?? orgBranches ?? [];

  const { data: sports } = useQuery({
    queryKey: ['sports'],
    queryFn: () => api.get('/sports').then((r) => r.data),
  });

  // ── Sport → Match Format → Rule Set cascade ──
  // Group 1A — the selected bracket is passed so the server-derived
  // humanReadable includes it (the preview matches the persisted snapshot).
  const { data: formatCascade } = useQuery({
    queryKey: ['sport-formats-cascade', selectedSport, selectedBracket],
    queryFn: () =>
      isOrg && orgId
        ? orgTournamentApi.getSportFormats(orgId, selectedSport!, selectedBracket || undefined)
        : bracketTypeApi.getSportFormats(selectedSport!, selectedBracket || undefined),
    enabled: !!selectedSport,
  });
  const formatGroups: SportFormatGroup[] = formatCascade?.data ?? [];

  // Group 1 — read-only Tournament Rules preview. The server-derived
  // `humanReadable` value from the selected Rule Set is displayed; the UI never
  // re-interprets the rules JSON (single source of truth on the backend).
  const selectedFormatGroup = formatGroups.find((g) => String(g.format.id) === selectedFormat);
  const selectedRuleSet = selectedFormatGroup?.ruleSets.find((rs) => String(rs.id) === watch('ruleSetId'));
  const generatedRulesPreview = selectedRuleSet?.humanReadable || selectedFormatGroup?.format.description || '';

  // Reset dependent selections when sport/format changes
  useEffect(() => {
    setValue('matchFormatId', '');
    setValue('ruleSetId', '');
  }, [selectedSport, setValue]);

  useEffect(() => {
    setValue('ruleSetId', '');
  }, [selectedFormat, setValue]);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post(endpoint, data),
    onSuccess: (res) => {
      showToast(t('tournaments.create.success'));
      navigate(detailPath(res.data.id));
    },
    onError: (err) => {
      showToast(`${t('tournaments.create.error')}: ${(err as any).message}`, 'error');
    },
  });

  // Group 2 — structured prizes (multi-row editor).
  const [prizes, setPrizes] = useState<PrizeEditorRow[]>([]);

  // Group 3 — allowed registration payment methods (Cash / Card / Both). The
  // backend re-validates; the UI never offers Wallet (globally disabled as a
  // payment method).
  const [paymentMethods, setPaymentMethods] = useState<('cash' | 'card')[]>(['cash', 'card']);
  const togglePaymentMethod = (m: 'cash' | 'card') => {
    setPaymentMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  // G7-D — Tournament Eligibility (presentation only; backend is authoritative).
  const [eligibility, setEligibility] = useState<TournamentEligibilityFormValue>(EMPTY_ELIGIBILITY);

  const onSubmit = (data: TournamentForm) => {
    // G7-D — the backend rejects category-mode with no selected category.
    if (eligibility.ageMode === 'categories' && eligibility.ageCategoryIds.length === 0) {
      showToast(t('tournaments.eligibility.age.validation'), 'error');
      return;
    }
    // Group 2 — only send prizes that are meaningfully configured (skip rows
    // with no type/description/amount). The backend re-validates everything.
    const structuredPrizes = prizes
      .filter((p) => p.prize_type && (p.description?.trim() || (p.prize_type === 'cash' && p.amount != null)))
      .map((p) => ({
        placement: p.placement ?? null,
        prize_type: p.prize_type,
        description: p.description?.trim() || undefined,
        amount: p.prize_type === 'cash' ? p.amount ?? undefined : undefined,
        currency_code: p.prize_type === 'cash' ? undefined : undefined,
      }));
    createMutation.mutate({
      name: data.name,
      description: data.description || undefined,
      bracket_type_id: Number(data.bracketTypeId),
      sport_id: data.sportId ? Number(data.sportId) : undefined,
      match_format_id: data.matchFormatId ? Number(data.matchFormatId) : undefined,
      rule_set_id: data.ruleSetId ? Number(data.ruleSetId) : undefined,
      max_participants: Number(data.maxParticipants),
      min_participants: data.minParticipants ? Number(data.minParticipants) : 2,
      entry_fee: data.entryFee ? Number(data.entryFee) : 0,
      // Group 3 — the allowed registration payment methods. Normalised
      // server-side (dedupe + deterministic order); empty selection is rejected
      // by the backend (a Tournament can never be unpayable). Wallet never sent.
      registration_payment_methods: paymentMethods.length ? paymentMethods : ['cash', 'card'],
      // Group 1A — currency is NEVER hardcoded and NEVER client-authoritative
      // for organisation tournaments: the backend resolves it server-side
      // (branch → organisation country default) and overrides. Only the
      // platform (admin) path still sends an explicit currency.
      currency_code: isOrg ? undefined : 'AED',
      price_type: data.entryFee && Number(data.entryFee) > 0 ? 'FIXED' : 'FREE',
      start_date: data.startDate,
      end_date: data.endDate || undefined,
      registration_opens: data.registrationOpens || undefined,
      registration_closes: data.registrationCloses || undefined,
      // Group 4 — venue branch + daily playing window. The backend validates
      // deadline-before-start, daily window start < end, and branch operating
      // hours server-side (the authoritative source of truth).
      branch_id: data.branchId ? Number(data.branchId) : undefined,
      daily_start_time: data.dailyStartTime ? `${data.dailyStartTime}:00` : undefined,
      daily_end_time: data.dailyEndTime ? `${data.dailyEndTime}:00` : undefined,
      // G7-D — structured eligibility (age mode/categories, gender, level). The
      // backend re-validates every value; open selections are sent as open.
      age_mode: eligibility.ageMode,
      age_category_ids: eligibility.ageMode === 'categories' && eligibility.ageCategoryIds.length ? eligibility.ageCategoryIds : undefined,
      gender_categories: eligibility.genderCategories.length ? eligibility.genderCategories : undefined,
      level_ids: eligibility.levelIds.length ? eligibility.levelIds : undefined,
      prize_description: data.prizeDescription || undefined,
      prizes: structuredPrizes.length ? structuredPrizes : undefined,
      organisation_id: isOrg && orgId ? Number(orgId) : undefined,
      // NOTE: `rules` is intentionally NOT sent — the backend derives the
      // Tournament Rules snapshot server-side from the selected Bracket Type +
      // Match Format + Rule Set (Group 1/1A). Client-supplied rules are never
      // authoritative. commission_rate is intentionally NOT sent — the backend
      // derives it from the organisation's active subscription (Group 5B-SR).
    });
  };

  const bracketOptions: BracketTypeOption[] = bracketTypes?.data ?? [];
  const hasDeferredTypes = bracketOptions.some((b) => !isEngineSupported(b.slug));

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">{t('tournaments.create.title')}</h1>
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Can permission="tournaments.create.name">
            <Input label={t('tournaments.create.name')} {...register('name')} error={errors.name?.message} />
          </Can>
          <Can permission="tournaments.create.description">
            <Input label={t('tournaments.create.description')} tag="textarea" rows={3} {...register('description')} />
          </Can>

          <div className="grid grid-cols-2 gap-4">
            <Can permission="tournaments.create.type">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">{t('tournaments.create.bracket_type')}</label>
                <select {...register('bracketTypeId')}
                  className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">
                  <option value="">{t('tournaments.create.select_bracket_type')}</option>
                  {bracketOptions.map((b) => (
                    <option key={b.id} value={b.id} disabled={!isEngineSupported(b.slug)}>
                      {b.name}{!isEngineSupported(b.slug) ? ` — ${t('tournaments.create.deferred')}` : ''}
                    </option>
                  ))}
                </select>
                {hasDeferredTypes && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">{t('tournaments.create.deferred_hint')}</p>
                )}
              </div>
            </Can>
            <Can permission="tournaments.create.sport">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">{t('tournaments.create.sport')}</label>
                <select {...register('sportId')} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">
                  <option value="">{t('tournaments.create.any_sport')}</option>
                  {sports?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </Can>
          </div>

          {selectedSport && (
            <div className="grid grid-cols-2 gap-4">
              <Can permission="tournaments.create.match-format">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-2">{t('tournaments.create.match_format')}</label>
                  <select {...register('matchFormatId')}
                    className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">
                    <option value="">{t('tournaments.create.select_format')}</option>
                    {formatGroups.map((g) => (
                      <option key={g.format.id} value={g.format.id}>{g.format.name}</option>
                    ))}
                  </select>
                </div>
              </Can>
              <Can permission="tournaments.create.rule-set">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-2">{t('tournaments.create.rule_set')}</label>
                  <select {...register('ruleSetId')}
                    className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]"
                    disabled={!selectedFormat}>
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

          <div className="grid grid-cols-3 gap-4">
            <Can permission="tournaments.create.max-participants">
              <Input label={t('tournaments.create.max_players')} type="number" min={2} {...register('maxParticipants')} error={errors.maxParticipants?.message} />
            </Can>
            <Can permission="tournaments.create.min-participants">
              <Input label={t('tournaments.create.min_players')} type="number" min={1} {...register('minParticipants')} />
            </Can>
            <Can permission="tournaments.create.prize">
              <Input label={t('tournaments.create.entry_fee')} type="number" min={0} step="0.01" {...register('entryFee')} />
            </Can>
          </div>

          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 bg-[var(--color-bg)]/30">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-[var(--color-text)]">{t('tournaments.create.commission_rate')}</label>
              <span className="font-semibold text-[var(--color-primary)]">{commissionRate}%</span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {isOrg ? t('tournaments.create.commission_locked') : t('tournaments.create.commission_platform')}
            </p>
            {isOrg && orgCurrency && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                {t('tournaments.create.currency')}: <span className="font-medium text-[var(--color-text)]">{orgCurrency}</span>
              </p>
            )}
          </div>

          {/* Group 3 — allowed registration payment methods (Cash / Card / Both). */}
          <Can permission="tournaments.create.prize">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 bg-[var(--color-bg)]/30">
              <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                {t('tournaments.create.payment_methods')}
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                  <input
                    type="checkbox"
                    checked={paymentMethods.includes('cash')}
                    onChange={() => togglePaymentMethod('cash')}
                    className="rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                  />
                  {t('tournaments.create.payment_cash')}
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
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
                <p className="text-xs text-[var(--color-error)] mt-1">{t('tournaments.create.payment_methods_required')}</p>
              )}
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{t('tournaments.create.payment_methods_hint')}</p>
            </div>
          </Can>

          <div className="grid grid-cols-2 gap-4">
            <Can permission="tournaments.create.start-date">
              <Input label={t('tournaments.create.start_date')} type="date" {...register('startDate')} error={errors.startDate?.message} />
            </Can>
            <Can permission="tournaments.create.end-date">
              <Input label={t('tournaments.create.end_date')} type="date" {...register('endDate')} />
            </Can>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Can permission="tournaments.create.registration-dates">
              <Input label={t('tournaments.create.registration_opens')} type="datetime-local" {...register('registrationOpens')} />
            </Can>
            <Can permission="tournaments.create.registration-dates">
              <Input label={t('tournaments.create.registration_closes')} type="datetime-local" {...register('registrationCloses')} />
            </Can>
          </div>

          {/* Group 4 — venue (organisation branch) + daily playing window. */}
          <Can permission="tournaments.create.prize">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 bg-[var(--color-bg)]/30 space-y-3">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">{t('tournaments.create.venue')}</label>
                {isOrg ? (
                  <select {...register('branchId')} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">
                    <option value="">{t('tournaments.create.venue_none')}</option>
                    {branchOptions.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}{b.city ? ` — ${b.city}` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.create.venue_platform')}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-2">{t('tournaments.create.daily_start')}</label>
                  <input type="time" {...register('dailyStartTime')} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-2">{t('tournaments.create.daily_end')}</label>
                  <input type="time" {...register('dailyEndTime')} className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]" />
                </div>
              </div>
              {errors.dailyEndTime?.message && (
                <p className="text-xs text-[var(--color-error)]">{errors.dailyEndTime.message}</p>
              )}
              <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.create.daily_hint')}</p>
            </div>
          </Can>

          <Can permission="tournaments.create.prize">
            <Input label={t('tournaments.create.prize')} {...register('prizeDescription')} />
          </Can>

          <Can permission="tournaments.create.prize">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 bg-[var(--color-bg)]/30">
              <PrizeEditor
                currencyCode={isOrg ? orgCurrency : 'AED'}
                value={prizes}
                onChange={setPrizes}
              />
            </div>
          </Can>

          <EligibilityFormSection value={eligibility} onChange={setEligibility} />

          <Can permission="tournaments.create.rules">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 bg-[var(--color-bg)]/30">
              <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                {t('tournaments.create.generated_rules')}
              </label>
              {generatedRulesPreview ? (
                <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap">{generatedRulesPreview}</p>
              ) : (
                <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.create.generated_rules_empty')}</p>
              )}
            </div>
          </Can>

          <Button type="submit" loading={createMutation.isPending} className="w-full">
            {t('tournaments.create.submit')}
          </Button>

          {createMutation.isError && (
            <p className="text-sm text-[var(--color-error)]">{t('tournaments.create.error')}</p>
          )}
        </form>
      </Card>
    </div>
  );
}

/** Group 5B-SR — engine-capable bracket types (mirror of the backend constant). */
function isEngineSupported(slug: string): boolean {
  return slug === 'single-elimination' || slug === 'round-robin';
}