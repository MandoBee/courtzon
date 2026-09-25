import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { ageCategoryLabelKey } from '../../lib/tournamentEligibility';

interface EligibilitySummaryTournament {
  age_mode?: string | null;
  age_category_ids?: number[] | null;
  gender_categories?: string[] | null;
  level_ids?: number[] | null;
}

interface PlayerLevelOption {
  id: number;
  name: string;
}

interface Props {
  tournament: EligibilitySummaryTournament;
}

/**
 * G7-D — Read-only Tournament Eligibility summary.
 *
 * Pure presentation of the backend-configured eligibility: renders human labels
 * (never raw IDs / JSON / enums) and an "Open" label for unrestricted
 * dimensions. No eligibility computation happens here.
 */
export default function EligibilitySummary({ tournament }: Props) {
  const { t } = useTranslation();

  const { data: levels } = useQuery({
    queryKey: ['player-levels'],
    queryFn: () => api.get('/player-levels').then((r: any) => r.data.data ?? r.data ?? []),
  });
  const levelOptions: PlayerLevelOption[] = Array.isArray(levels) ? levels : [];

  const ageIds = Array.isArray(tournament.age_category_ids) ? tournament.age_category_ids : [];
  const genders = Array.isArray(tournament.gender_categories) ? tournament.gender_categories : [];
  const levelIds = Array.isArray(tournament.level_ids) ? tournament.level_ids : [];

  const ageLabel = tournament.age_mode !== 'categories'
    ? t('tournaments.eligibility.age.open')
    : ageIds.map((id) => t(ageCategoryLabelKey(Number(id)))).join(', ');
  const genderLabel = genders.length === 0
    ? t('tournaments.eligibility.gender.open')
    : genders.map((g) => t(`tournaments.eligibility.gender.${g}`)).join(', ');
  const levelLabel = levelIds.length === 0
    ? t('tournaments.eligibility.level.open')
    : levelIds
        .map((id) => levelOptions.find((lv) => lv.id === Number(id))?.name ?? t('tournaments.eligibility.level.unknown'))
        .join(', ');

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2">
      <h3 className="text-sm font-semibold text-[var(--color-text)]">{t('tournaments.eligibility.title')}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
        <div><span className="text-[var(--color-text-muted)]">{t('tournaments.eligibility.age')}: </span><span className="font-medium">{ageLabel}</span></div>
        <div><span className="text-[var(--color-text-muted)]">{t('tournaments.eligibility.gender')}: </span><span className="font-medium">{genderLabel}</span></div>
        <div><span className="text-[var(--color-text-muted)]">{t('tournaments.eligibility.level')}: </span><span className="font-medium">{levelLabel}</span></div>
      </div>
    </div>
  );
}