import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import {
  TOURNAMENT_AGE_YOUTH,
  TOURNAMENT_AGE_MASTERS,
  TOURNAMENT_JUNIOR_EVEN,
  TOURNAMENT_JUNIOR_ODD,
  TOURNAMENT_SENIOR_MIN_AGES,
  TOURNAMENT_GENDER_OPTIONS,
  normalizeGenderSelection,
  sortAgeIds,
  type GenderAgeSelection,
  type GenderAgeSelectionMap,
  type GenderJuniorPattern,
  type TournamentAgeFamily,
} from '../../lib/tournamentEligibility';

export interface TournamentEligibilityFormValue {
  ageMode: 'open' | 'categories';
  /** Global/mixed age selection — used when no gender-specific block is active. */
  ageCategoryIds: number[];
  /** Persisted junior Even/Odd pattern for the global/mixed block. */
  globalPattern: GenderJuniorPattern;
  genderCategories: ('male' | 'female' | 'mixed')[];
  levelIds: number[];
  /** Phase 4 Step 1 — independent per-gender age selections (male/female). */
  perGender: GenderAgeSelectionMap;
}

export const EMPTY_ELIGIBILITY: TournamentEligibilityFormValue = {
  ageMode: 'open',
  ageCategoryIds: [],
  globalPattern: 'even',
  genderCategories: [],
  levelIds: [],
  perGender: { male: null, female: null },
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

/** Selected ids (of one age family) inside a single age block's selection. */
function blockFamilyIds(selection: GenderAgeSelection | null | undefined, family: TournamentAgeFamily): number[] {
  return (selection?.ageCategoryIds ?? []).filter((id) =>
    (family === 'youth' ? TOURNAMENT_AGE_YOUTH : TOURNAMENT_AGE_MASTERS).some((c) => c.id === id),
  );
}

/**
 * G7-D — Tournament Eligibility editor (create/edit forms).
 *
 * Presentation-only. Enforces the youth XOR masters family locally so impossible
 * combinations cannot be submitted; every persisted decision is re-validated by
 * the backend. Level options come from the live `/player-levels` API (no
 * hardcoded level IDs); age categories use the immutable reference labels.
 *
 * Phase 4 Step 1 — per-gender age independence: when Male and/or Female are
 * selected, each gender gets its OWN age block with an independent junior
 * Even/Odd pattern and its own multi-select age categories (pattern-scoped
 * youth + shared seniors). Selections persist in `value.perGender` across wizard
 * steps. When only Mixed (or no gender) is selected, the single legacy block
 * applies to every gender — preserved for backward compatibility.
 */
export default function EligibilityFormSection({ value, onChange, locked }: Props) {
  const { t } = useTranslation();

  const { data: levels } = useQuery({
    queryKey: ['player-levels'],
    queryFn: () => api.get('/player-levels').then((r: { data?: { data?: unknown } }) => r.data?.data ?? r.data ?? []),
  });
  const levelOptions: PlayerLevelOption[] = Array.isArray(levels) ? levels : [];

  const disabled = Boolean(locked);

  const [juniorPattern, setJuniorPattern] = useState<GenderJuniorPattern>(value.globalPattern ?? 'even');

  const showMaleBlock = value.genderCategories.includes('male');
  const showFemaleBlock = value.genderCategories.includes('female');
  const showGenderBlocks = showMaleBlock || showFemaleBlock;
  const showGlobalBlock = !showGenderBlocks;

  const toggleGender = (g: 'male' | 'female' | 'mixed') => {
    if (disabled) return;
    const next = value.genderCategories.includes(g)
      ? value.genderCategories.filter((x) => x !== g)
      : [...value.genderCategories, g];
    const perGender: GenderAgeSelectionMap = { ...value.perGender };
    // Seed a gender's age block from the current global selection the first time
    // that gender is enabled; disabling never destroys a stored selection.
    if ((g === 'male' || g === 'female') && next.includes(g) && !perGender[g]) {
      perGender[g] = normalizeGenderSelection('even', value.ageCategoryIds ?? []);
    }
    onChange({ ...value, genderCategories: next, perGender });
  };

  const toggleLevel = (id: number) => {
    if (disabled) return;
    const next = value.levelIds.includes(id)
      ? value.levelIds.filter((x) => x !== id)
      : [...value.levelIds, id];
    onChange({ ...value, levelIds: next });
  };

  const renderAgeBlock = (opts: {
    groupKey: string;
    label: string;
    selection: GenderAgeSelection;
    onSelectionChange: (next: GenderAgeSelection) => void;
  }) => {
    const { groupKey, label, selection, onSelectionChange } = opts;
    const juniorList = selection.pattern === 'even' ? TOURNAMENT_JUNIOR_EVEN : TOURNAMENT_JUNIOR_ODD;

    const switchPattern = (pattern: GenderJuniorPattern) => {
      if (disabled) return;
      onSelectionChange(normalizeGenderSelection(pattern, selection.ageCategoryIds));
    };

    const toggleBlockAge = (family: TournamentAgeFamily, id: number) => {
      if (disabled) return;
      // Youth XOR Masters within THIS block: toggling a family implicitly drops
      // the opposite family (the same discipline as the legacy single block).
      const ownedForFamily = blockFamilyIds(selection, family);
      const next = ownedForFamily.includes(id)
        ? ownedForFamily.filter((x) => x !== id)
        : [...ownedForFamily, id];
      onSelectionChange({ ...selection, ageCategoryIds: sortAgeIds(next) });
    };

    return (
      <div role="group" aria-label={label} className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
        <h4 className="text-xs font-semibold text-[var(--color-text)]">{label}</h4>
        <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
          <span className="text-xs text-[var(--color-text-muted)]">{t('tournaments.eligibility.age.pattern')}:</span>
          <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input
              type="radio"
              name={`junior-age-pattern-${groupKey}`}
              checked={selection.pattern === 'even'}
              onChange={() => switchPattern('even')}
              disabled={disabled}
            />
            {t('tournaments.eligibility.age.pattern.even')}
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input
              type="radio"
              name={`junior-age-pattern-${groupKey}`}
              checked={selection.pattern === 'odd'}
              onChange={() => switchPattern('odd')}
              disabled={disabled}
            />
            {t('tournaments.eligibility.age.pattern.odd')}
          </label>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-[var(--color-text-muted)] w-full sm:w-auto">{t('tournaments.eligibility.age.youth')}:</span>
          {juniorList.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={blockFamilyIds(selection, 'youth').includes(c.id)}
                onChange={() => toggleBlockAge('youth', c.id)}
                disabled={disabled}
              />
              {t(c.labelKey)}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-[var(--color-text-muted)] w-full sm:w-auto">{t('tournaments.eligibility.age.masters')}:</span>
          {TOURNAMENT_SENIOR_MIN_AGES.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={blockFamilyIds(selection, 'masters').includes(c.id)}
                onChange={() => toggleBlockAge('masters', c.id)}
                disabled={disabled}
              />
              {t(c.labelKey)}
            </label>
          ))}
        </div>
      </div>
    );
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
                {showGenderBlocks && (
                  <>
                    <h4 className="text-sm font-semibold text-[var(--color-text)]">{t('tournaments.eligibility.age.per_gender')}</h4>
                    <p className="text-[11px] text-[var(--color-text-muted)]">{t('tournaments.eligibility.age.pattern_note')}</p>
                  </>
                )}

                {showGlobalBlock && (
                  renderAgeBlock({
                    groupKey: 'global',
                    label: t('tournaments.eligibility.age.categories.title'),
                    selection: {
                      pattern: juniorPattern,
                      ageCategoryIds: value.ageCategoryIds ?? [],
                    },
                    onSelectionChange: (next) => {
                      setJuniorPattern(next.pattern);
                      onChange({ ...value, ageCategoryIds: next.ageCategoryIds, globalPattern: next.pattern });
                    },
                  })
                )}

                {showMaleBlock && (
                  renderAgeBlock({
                    groupKey: 'male',
                    label: t('tournaments.eligibility.age.gender_block', {
                      gender: t('tournaments.eligibility.gender.male'),
                    }),
                    selection: value.perGender.male ?? { pattern: 'even', ageCategoryIds: [] },
                    onSelectionChange: (next) => onChange({ ...value, perGender: { ...value.perGender, male: next } }),
                  })
                )}

                {showFemaleBlock && (
                  renderAgeBlock({
                    groupKey: 'female',
                    label: t('tournaments.eligibility.age.gender_block', {
                      gender: t('tournaments.eligibility.gender.female'),
                    }),
                    selection: value.perGender.female ?? { pattern: 'even', ageCategoryIds: [] },
                    onSelectionChange: (next) => onChange({ ...value, perGender: { ...value.perGender, female: next } }),
                  })
                )}
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