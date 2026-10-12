import {
  type GenderAgeSelectionMap,
} from './tournamentEligibility';

/**
 * Phase 4 Step 2 — generation of ONE competition per eligible group.
 *
 * Pure + deterministic (no data access, no randomness):
 *   * age-based tournaments (juniors/seniors): gender × age category;
 *   * professional tournaments (levels): gender × selected player level;
 *   * Mixed remains ONE mixed-gender competition per band — `['mixed']` is a
 *     single gender category and is NEVER split into male-only/female-only;
 *   * per-gender age selections from the wizard (Step 1) are honoured: male
 *     competitions use the male block's categories, female use the female
 *     block's, and the Mixed/global block feeds the mixed band. MISSING, null
 *     or empty per-gender state NEVER falls back to the union of every gender's
 *     age categories (fail-closed — that gender simply gets no competition, and
 *     the wizard falls back to the legacy default when nothing is generated);
 *   * `competitionType` is `null` when the sport format type is not known —
 *     the payload then OMITS it and the backend inherits the resolved default
 *     format (never a silent 'singles');
 *   * when BOTH age categories and levels are selected, age competitions carry
 *     the selected levels too (the current combined-eligibility meaning) and no
 *     separate level-only competitions are generated — documented precedence;
 *   * no genders selected → no split (the legacy default competition carries the
 *     tournament-level eligibility unchanged).
 *
 * The `key` is a stable client-side addressing signature that IS sent to the API
 * (Phase 4 Step 4A) on each `competitions[]` seed and is REQUIRED by the backend
 * to link each generated competition to its seed; the backend never persists the
 * key itself. Phase 4 Step 4B — the CREATION wizard no longer uses the key to
 * target prizes (competition-scoped prizes are assigned after creation from the
 * tournament management page), so the wizard sends no `competition_key`. The key
 * is still emitted on every seed and must not be removed.
 * The returned payload fields map directly onto `CompetitionSeedSchema`.
 */

export type CompetitionGender = 'male' | 'female' | 'mixed';

export interface PlannedCompetition {
  /** Stable dedupe/review signature: `${gender}:${kind}:${bandId}`. */
  key: string;
  /** Explicit competition type, or null → INHERIT the backend's resolved default format (never a silent 'singles'). */
  competition_type: 'singles' | 'doubles' | 'team' | null;
  name: string;
  age_mode: 'open' | 'categories' | null;
  age_category_ids: number[];
  gender_categories: CompetitionGender[];
  level_ids: number[];
}

export interface CompetitionGenerationInput {
  ageMode: 'open' | 'categories' | null | undefined;
  /** Union of age-category ids the tournament payload carries. */
  ageCategoryIds: number[];
  genderCategories: ReadonlyArray<string>;
  levelIds: number[];
  perGender?: Partial<GenderAgeSelectionMap> | null;
  /** Explicit competition type, or null to inherit the backend's resolved default. */
  competitionType: 'singles' | 'doubles' | 'team' | null;
  ageLabel?: (id: number) => string;
  levelLabel?: (id: number) => string;
}

const GENDER_LABEL: Record<CompetitionGender, string> = {
  male: 'Male',
  female: 'Female',
  mixed: 'Mixed',
};

export function buildCompetitionSeeds(input: CompetitionGenerationInput): PlannedCompetition[] {
  const {
    ageMode,
    ageCategoryIds,
    genderCategories,
    levelIds,
    perGender,
    competitionType,
    ageLabel,
    levelLabel,
  } = input;

  const genders = genderCategories.filter(
    (g): g is CompetitionGender => g === 'male' || g === 'female' || g === 'mixed',
  );
  if (genders.length === 0) return [];

  const includeAge = ageMode === 'categories' && ageCategoryIds.length > 0;
  // Level-only (Professional) bands only when the tournament is NOT age-scoped:
  // with ages, the age competitions carry the selected levels themselves.
  const includeLevels = ageMode !== 'categories' && levelIds.length > 0;
  if (!includeAge && !includeLevels) return [];

  const seeds: PlannedCompetition[] = [];
  for (const gender of genders) {
    // ONLY the gender's own explicitly configured age selection is used for
    // male/female groups — missing/null/empty per-gender state yields NO
    // competitions for that gender (never the union of every gender's ages,
    // which would broaden eligibility). Mixed uses the shared tournament-level
    // age set (the wizard's global/mixed block).
    const genderedAgeIds =
      gender === 'male' || gender === 'female'
        ? (perGender?.[gender]?.ageCategoryIds ?? [])
        : ageCategoryIds;
    const bands = includeAge
      ? genderedAgeIds.map((ageId) => ({
          kind: 'age',
          id: Number(ageId),
          age_mode: 'categories' as const,
          ageIds: [Number(ageId)],
          // Age groups keep the tournament's level restriction (combined
          // eligibility semantics); empty = all levels.
          levelIds,
        }))
      : includeLevels
        ? levelIds.map((lvId) => ({
            kind: 'level',
            id: Number(lvId),
            age_mode: 'open' as const,
            ageIds: [] as number[],
            levelIds: [Number(lvId)],
          }))
        : [];

    for (const band of bands) {
      const bandLabel =
        band.kind === 'age'
          ? (ageLabel?.(band.id) ?? `#${band.id}`)
          : (levelLabel?.(band.id) ?? `Level ${band.id}`);
      seeds.push({
        key: `${gender}:${band.kind}:${band.id}`,
        competition_type: competitionType,
        name: `${GENDER_LABEL[gender]} ${bandLabel}`.trim(),
        age_mode: band.age_mode,
        age_category_ids: band.ageIds,
        gender_categories: [gender],
        level_ids: band.levelIds,
      });
    }
  }
  return seeds;
}

/**
 * Phase 4 Step 2B — did the organizer REQUEST gender/age/level competition
 * splitting? Distinct from whether seeds could actually be generated: a split
 * request with an empty seed list must FAIL, never silently fall back to the
 * legacy default (which would merge groups and broaden eligibility).
 *
 * Split is requested when a specific gender (male/female/mixed) is selected AND
 * there is at least one eligible band dimension (age categories or levels).
 * Legacy creations (no genders, or a single mixed group with open age/levels)
 * are NO-split by design and keep the legacy default behavior.
 */
export function isSplitRequested(value: {
  ageMode?: 'open' | 'categories' | null | undefined;
  ageCategoryIds?: ReadonlyArray<number>;
  genderCategories: ReadonlyArray<string>;
  levelIds?: ReadonlyArray<number>;
}): boolean {
  const hasGendered = value.genderCategories.some((g) => g === 'male' || g === 'female' || g === 'mixed');
  if (!hasGendered) return false;
  const hasBands = (value.ageMode === 'categories' && (value.ageCategoryIds?.length ?? 0) > 0)
    || (value.levelIds?.length ?? 0) > 0;
  return hasBands;
}

export type SplitEligibilityIssueReason = 'gender_without_categories';

export type SplitEligibilityIssue =
  | { ok: true }
  | { ok: false; reason: SplitEligibilityIssueReason };

/**
 * Validate that requested split generation is fully configured. When `ageMode
 * === 'categories'`, EVERY selected male/female gender must have its own
 * non-empty per-gender age selection — a missing/null/empty block would drop
 * that gender's competitions and, worse, allow the (unsafe) legacy-default
 * fallback. Level-only (professional) and mixed-only splits are self-sufficient
 * and are never rejected here.
 */
export function validateSplitEligibility(value: {
  ageMode?: 'open' | 'categories' | null | undefined;
  genderCategories: ReadonlyArray<string>;
  perGender?: Partial<GenderAgeSelectionMap> | null;
}): SplitEligibilityIssue {
  if (value.ageMode !== 'categories') return { ok: true };
  for (const gender of ['male', 'female'] as const) {
    if (!value.genderCategories.includes(gender)) continue;
    const selection = value.perGender?.[gender];
    if (!selection || selection.ageCategoryIds.length === 0) {
      return { ok: false, reason: 'gender_without_categories' };
    }
  }
  return { ok: true };
}