/**
 * G7-D — Tournament Eligibility PRESENTATION helpers (frontend-only).
 *
 * Purely presentational: NEVER computes final eligibility, NEVER applies age
 * math with month/day, NEVER decides operator bypass. The backend remains the
 * single source of truth for eligibility decisions.
 *
 * Age categories mirror the authoritative backend seed
 * (`tournament_age_categories`) so the UI can label a configured selection
 * with human-readable text instead of raw IDs. IDs are constant because the
 * reference rows are immutable seed data (migration 176).
 */
type TranslateFn = (key: string, defaultValueOrParams?: string | Record<string, string | number>, params?: Record<string, string | number>) => string;

export type TournamentAgeFamily = 'youth' | 'masters';

export const TOURNAMENT_AGE_CATEGORIES: ReadonlyArray<{
  id: number;
  slug: string;
  family: TournamentAgeFamily;
  labelKey: string;
}> = [
  // Junior EVEN pattern (U8–U22); U14/U16/U18 reuse the legacy seed ids.
  { id: 1, slug: 'u14', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u14' },
  { id: 2, slug: 'u16', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u16' },
  { id: 3, slug: 'u18', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u18' },
  { id: 100, slug: 'u8', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u8' },
  { id: 101, slug: 'u10', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u10' },
  { id: 102, slug: 'u12', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u12' },
  { id: 103, slug: 'u20', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u20' },
  { id: 104, slug: 'u22', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u22' },
  // Junior ODD pattern (U7–U21).
  { id: 110, slug: 'u7', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u7' },
  { id: 111, slug: 'u9', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u9' },
  { id: 112, slug: 'u11', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u11' },
  { id: 113, slug: 'u13', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u13' },
  { id: 114, slug: 'u15', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u15' },
  { id: 115, slug: 'u17', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u17' },
  { id: 116, slug: 'u19', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u19' },
  { id: 117, slug: 'u21', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u21' },
  // Senior minimum-age categories (+35 … +75); +40/45/50/55 reuse legacy ids.
  { id: 4, slug: '40_plus', family: 'masters', labelKey: 'tournaments.eligibility.age.categories.40_plus' },
  { id: 5, slug: '45_plus', family: 'masters', labelKey: 'tournaments.eligibility.age.categories.45_plus' },
  { id: 6, slug: '50_plus', family: 'masters', labelKey: 'tournaments.eligibility.age.categories.50_plus' },
  { id: 7, slug: '55_plus', family: 'masters', labelKey: 'tournaments.eligibility.age.categories.55_plus' },
  { id: 200, slug: '35_plus', family: 'masters', labelKey: 'tournaments.eligibility.age.categories.35_plus' },
  { id: 201, slug: '60_plus', family: 'masters', labelKey: 'tournaments.eligibility.age.categories.60_plus' },
  { id: 202, slug: '65_plus', family: 'masters', labelKey: 'tournaments.eligibility.age.categories.65_plus' },
  { id: 203, slug: '70_plus', family: 'masters', labelKey: 'tournaments.eligibility.age.categories.70_plus' },
  { id: 204, slug: '75_plus', family: 'masters', labelKey: 'tournaments.eligibility.age.categories.75_plus' },
] as const;

export const TOURNAMENT_AGE_YOUTH = TOURNAMENT_AGE_CATEGORIES.filter((c) => c.family === 'youth');
export const TOURNAMENT_AGE_MASTERS = TOURNAMENT_AGE_CATEGORIES.filter((c) => c.family === 'masters');

/** Junior EVEN pattern (U8, U10, U12, U14, U16, U18, U20, U22). */
export const TOURNAMENT_JUNIOR_EVEN = [
  8, 10, 12, 14, 16, 18, 20, 22,
].map((age) => ({
  age,
  id: TOURNAMENT_AGE_CATEGORIES.find((c) => c.slug === `u${age}`)?.id as number,
  labelKey: TOURNAMENT_AGE_CATEGORIES.find((c) => c.slug === `u${age}`)?.labelKey as string,
}));

/** Junior ODD pattern (U7, U9, U11, U13, U15, U17, U19, U21). */
export const TOURNAMENT_JUNIOR_ODD = [
  7, 9, 11, 13, 15, 17, 19, 21,
].map((age) => ({
  age,
  id: TOURNAMENT_AGE_CATEGORIES.find((c) => c.slug === `u${age}`)?.id as number,
  labelKey: TOURNAMENT_AGE_CATEGORIES.find((c) => c.slug === `u${age}`)?.labelKey as string,
}));

/** Senior minimum-age categories (+35 … +75, overlapping, ascending). */
export const TOURNAMENT_SENIOR_MIN_AGES = [
  '35_plus', '40_plus', '45_plus', '50_plus', '55_plus', '60_plus', '65_plus', '70_plus', '75_plus',
].map((slug) => ({
  id: TOURNAMENT_AGE_CATEGORIES.find((c) => c.slug === slug)?.id as number,
  slug,
  labelKey: TOURNAMENT_AGE_CATEGORIES.find((c) => c.slug === slug)?.labelKey as string,
}));

export const TOURNAMENT_GENDER_OPTIONS: ReadonlyArray<{ value: 'male' | 'female' | 'mixed'; labelKey: string }> = [
  { value: 'male', labelKey: 'tournaments.eligibility.gender.male' },
  { value: 'female', labelKey: 'tournaments.eligibility.gender.female' },
  { value: 'mixed', labelKey: 'tournaments.eligibility.gender.mixed' },
] as const;

/**
 * Phase 4 Step 1 — independent gender-specific age selections (frontend-only).
 *
 * Male and female selections each carry their OWN junior Even/Odd pattern and their
 * OWN set of age-category ids (youth of that pattern + seniors). These selections
 * live in the tournament-eligibility FORM VALUE only (persisted across wizard
 * steps); the backend payload still receives the UNION through
 * `eligibilityAgeCategoryIds`, preserving today's global-array contract until the
 * per-gender competition split lands in a later step.
 */

export type GenderJuniorPattern = 'even' | 'odd';

/** One gender's independent age selection. */
export interface GenderAgeSelection {
  /** Junior Even/Odd pattern for THIS gender (seniors are pattern-independent). */
  pattern: GenderJuniorPattern;
  /** Full age-category selection: juniors of `pattern` + any senior ids. */
  ageCategoryIds: number[];
}

/** Male/female independent selections; null = not configured (yet). */
export type GenderAgeSelectionMap = {
  male: GenderAgeSelection | null;
  female: GenderAgeSelection | null;
};

const JUNIOR_PATTERN_ID_SET: Record<GenderJuniorPattern, ReadonlySet<number>> = {
  even: new Set(TOURNAMENT_JUNIOR_EVEN.map((c) => c.id)),
  odd: new Set(TOURNAMENT_JUNIOR_ODD.map((c) => c.id)),
};

const SENIOR_AGE_CATEGORY_IDS = new Set(TOURNAMENT_SENIOR_MIN_AGES.map((c) => c.id));

/** True when `id` is a junior category that belongs to the given pattern. */
export function isJuniorInPattern(id: number, pattern: GenderJuniorPattern): boolean {
  return JUNIOR_PATTERN_ID_SET[pattern].has(id);
}

/** True when `id` is a senior (masters) minimum-age category. */
export function isSeniorAgeCategory(id: number): boolean {
  return SENIOR_AGE_CATEGORY_IDS.has(id);
}

/** Deterministic, de-duplicated, ascending age-category id array. */
export function sortAgeIds(ids: ReadonlyArray<number>): number[] {
  return [...new Set(ids.map(Number).filter(Number.isSafeInteger))].sort((a, b) => a - b);
}

/**
 * Normalize a gender age selection for a given pattern: keeps only junior ids
 * that exist in that pattern plus every senior id (seniors are shared), dropping
 * any other/family-mixed juniors. Mirrors the legacy `switchPattern` semantics.
 */
export function normalizeGenderSelection(
  pattern: GenderJuniorPattern,
  ids: ReadonlyArray<number>,
): GenderAgeSelection {
  return {
    pattern,
    ageCategoryIds: sortAgeIds(ids.filter((id) => isJuniorInPattern(id, pattern) || isSeniorAgeCategory(id))),
  };
}

/**
 * The age-category ids the BACKEND payload should carry: the union of the
 * global/mixed block and every active gender-specific block. Empty (or
 * non-categories mode) keeps the legacy "open age" meaning.
 */
export function eligibilityAgeCategoryIds(value: {
  ageMode?: string | null;
  ageCategoryIds?: ReadonlyArray<number> | null;
  perGender?: Partial<GenderAgeSelectionMap> | null;
}): number[] {
  if (value.ageMode !== 'categories') return [];
  const sets = [...(value.ageCategoryIds ?? [])];
  for (const key of ['male', 'female'] as const) {
    const sel = value.perGender?.[key];
    if (sel) sets.push(...sel.ageCategoryIds);
  }
  return sortAgeIds(sets);
}

/** True when at least one gender-specific age block is active (male or female). */
export function hasGenderSpecificAge(value: { genderCategories?: ReadonlyArray<string> }): boolean {
  const set = new Set(value.genderCategories ?? []);
  return set.has('male') || set.has('female');
}

export function ageCategoryLabelKey(id: number): string {
  return TOURNAMENT_AGE_CATEGORIES.find((c) => c.id === Number(id))?.labelKey ?? 'tournaments.eligibility.age.categories.unknown';
}

/** Backend eligibility error code → translation key (never shown raw to users). */
export const ELIGIBILITY_ERROR_KEYS: Record<string, string> = {
  AGE_NOT_ELIGIBLE: 'tournaments.errors.ageNotEligible',
  GENDER_NOT_ELIGIBLE: 'tournaments.errors.genderNotEligible',
  LEVEL_NOT_ELIGIBLE: 'tournaments.errors.levelNotEligible',
  MISSING_BIRTH_DATE: 'tournaments.errors.missingBirthDate',
  MISSING_PLAYER_LEVEL: 'tournaments.errors.missingPlayerLevel',
  INVALID_AGE_CATEGORIES: 'tournaments.errors.invalidAgeCategories',
  ELIGIBILITY_LOCKED: 'tournaments.errors.eligibilityLocked',
};

/** Extract the authoritative eligibility error code from an API error. */
export function tournamentEligibilityErrorCode(err: unknown): string | undefined {
  const anyErr = err as { response?: { data?: { errorCode?: string } }; errorCode?: string; code?: string } | undefined;
  return anyErr?.response?.data?.errorCode ?? anyErr?.errorCode ?? anyErr?.code;
}

/**
 * Map a backend eligibility error to a friendly, translated message.
 * Falls back to the caller-provided generic message so users never see raw
 * internal codes.
 */
export function translateEligibilityError(tTranslate: TranslateFn, err: unknown, fallback: string): string {
  const code = tournamentEligibilityErrorCode(err);
  if (code && ELIGIBILITY_ERROR_KEYS[code]) return tTranslate(ELIGIBILITY_ERROR_KEYS[code]);
  return fallback;
}