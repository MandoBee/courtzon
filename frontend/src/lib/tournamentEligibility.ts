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