import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import {
  TOURNAMENT_AGE_YOUTH,
  TOURNAMENT_AGE_MASTERS,
  TOURNAMENT_GENDER_OPTIONS,
  type TournamentAgeFamily,
} from '../../lib/tournamentEligibility';

export interface TournamentEligibilityFormValue {
  ageMode: 'open' | 'categories';
  ageCategoryIds: number[];
  genderCategories: ('male' | 'female' | 'mixed')[];
  levelIds: number[];
}

export const EMPTY_ELIGIBILITY: TournamentEligibilityFormValue = {
  ageMode: 'open',
  ageCategoryIds: [],
  genderCategories: [],
  levelIds: [],
};

interface PlayerLevelOption {
  id: number;
  name: string;
}

interface Props {
  value: TournamentEligibilityFormValue;
  onChange: (next: TournamentEligibilityFormValue) => void;
  /** G7-B lock — when true the section is read-only (backend is authoritative). */
  locked?: boolean;
}

/**
 * G7-D — Tournament Eligibility editor (create/edit forms).
 *
 * Presentation-only. Enforces the youth XOR masters family locally so impossible
 * combinations cannot be submitted; every persisted decision is re-validated by
 * the backend. Level options come from the live `/player-levels` API (no
 * hardcoded level IDs); age categories use the immutable reference labels.
 */
export default function EligibilityFormSection({ value, onChange, locked }: Props) {
  const { t } = useTranslation();

  const { data: levels } = useQuery({
    queryKey: ['player-levels'],
    queryFn: () => api.get('/player-levels').then((r: any) => r.data.data ?? r.data ?? []),
  });
  const levelOptions: PlayerLevelOption[] = Array.isArray(levels) ? levels : [];

  const disabled = Boolean(locked);

  const toggleAge = (id: number, family: TournamentAgeFamily) => {
    if (disabled) return;
    const owned = TOURNAMENT_AGE_CATEGORIES_SELECTED(value, family);
    const next = owned.includes(id)
      ? owned.filter((x) => x !== id)
      : [...owned, id];
    // Youth XOR Masters — each list is derived from its own family only, so
    // selecting any category implicitly drops the opposite family.
    onChange({ ...value, ageCategoryIds: next });
  };

  const toggleGender = (g: 'male' | 'female' | 'mixed') => {
    if (disabled) return;
    const next = value.genderCategories.includes(g)
      ? value.genderCategories.filter((x) => x !== g)
      : [...value.genderCategories, g];
    onChange({ ...value, genderCategories: next });
  };

  const toggleLevel = (id: number) => {
    if (disabled) return;
    const next = value.levelIds.includes(id)
      ? value.levelIds.filter((x) => x !== id)
      : [...value.levelIds, id];
    onChange({ ...value, levelIds: next });
  };

  return (
    <div className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 bg-[var(--color-surface)]">
      <h3 className="text-sm font-semibold text-[var(--color-text)]">{t('tournaments.eligibility.title')}</h3>
      {disabled && (
        <p className="text-xs text-amber-600">{t('tournaments.eligibility.locked')}</p>
      )}

      {/* ── Age ─────────────────────────────────────────────────────────── */}
      <fieldset disabled={disabled}>
        <legend className="text-xs font-medium text-[var(--color-text-muted)] mb-2">{t('tournaments.eligibility.age')}</legend>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input
              type="radio"
              name="age-mode"
              checked={value.ageMode === 'open'}
              onChange={() => onChange({ ...value, ageMode: 'open', ageCategoryIds: [] })}
            />
            {t('tournaments.eligibility.age.open')}
          </label>

          <div className="pl-5 space-y-3">
            <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
              <input
                type="radio"
                name="age-mode"
                checked={value.ageMode === 'categories'}
                onChange={() => onChange({ ...value, ageMode: 'categories' })}
              />
              {t('tournaments.eligibility.age.categories.title')}
            </label>

            {value.ageMode === 'categories' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-[var(--color-text-muted)] w-full sm:w-auto">{t('tournaments.eligibility.age.youth')}:</span>
                  {TOURNAMENT_AGE_YOUTH.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleAge(c.id, 'youth')}
                      className={`px-3 py-1 text-xs rounded-full border ${TOURNAMENT_AGE_CATEGORIES_SELECTED(value, 'youth').includes(c.id) ? 'bg-[var(--color-primary)] text-white border-transparent' : 'text-[var(--color-text-muted)]'}`}
                    >
                      {t(c.labelKey)}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-[var(--color-text-muted)] w-full sm:w-auto">{t('tournaments.eligibility.age.masters')}:</span>
                  {TOURNAMENT_AGE_MASTERS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleAge(c.id, 'masters')}
                      className={`px-3 py-1 text-xs rounded-full border ${TOURNAMENT_AGE_CATEGORIES_SELECTED(value, 'masters').includes(c.id) ? 'bg-[var(--color-primary)] text-white border-transparent' : 'text-[var(--color-text-muted)]'}`}
                    >
                      {t(c.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </fieldset>

      {/* ── Gender ──────────────────────────────────────────────────────── */}
      <fieldset disabled={disabled}>
        <legend className="text-xs font-medium text-[var(--color-text-muted)] mb-2">{t('tournaments.eligibility.gender')}</legend>
        <div className="flex flex-wrap gap-3">
          {TOURNAMENT_GENDER_OPTIONS.map((g) => (
            <label key={g.value} className="flex items-center gap-2 text-sm text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={value.genderCategories.includes(g.value)}
                onChange={() => toggleGender(g.value)}
              />
              {t(g.labelKey)}
            </label>
          ))}
        </div>
      </fieldset>

      {/* ── Level ───────────────────────────────────────────────────────── */}
      <fieldset disabled={disabled}>
        <legend className="text-xs font-medium text-[var(--color-text-muted)] mb-2">{t('tournaments.eligibility.level')}</legend>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={value.levelIds.length === 0}
              onChange={(e) => onChange({ ...value, levelIds: e.target.checked ? [] : value.levelIds })}
            />
            {t('tournaments.eligibility.level.open')}
          </label>
          {levelOptions.map((lv) => (
            <label key={lv.id} className="flex items-center gap-2 text-sm text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={value.levelIds.includes(lv.id)}
                onChange={() => toggleLevel(lv.id)}
              />
              {lv.name}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** Selected ids of the given age family in the current value. */
function TOURNAMENT_AGE_CATEGORIES_SELECTED(value: TournamentEligibilityFormValue, family: TournamentAgeFamily): number[] {
  return value.ageCategoryIds.filter((id) =>
    (family === 'youth' ? TOURNAMENT_AGE_YOUTH : TOURNAMENT_AGE_MASTERS).some((c) => c.id === id),
  );
}