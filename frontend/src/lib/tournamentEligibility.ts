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
  { id: 1, slug: 'u14', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u14' },
  { id: 2, slug: 'u16', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u16' },
  { id: 3, slug: 'u18', family: 'youth', labelKey: 'tournaments.eligibility.age.categories.u18' },
  { id: 4, slug: '40_plus', family: 'masters', labelKey: 'tournaments.eligibility.age.categories.40_plus' },
  { id: 5, slug: '45_plus', family: 'masters', labelKey: 'tournaments.eligibility.age.categories.45_plus' },
  { id: 6, slug: '50_plus', family: 'masters', labelKey: 'tournaments.eligibility.age.categories.50_plus' },
  { id: 7, slug: '55_plus', family: 'masters', labelKey: 'tournaments.eligibility.age.categories.55_plus' },
] as const;

export const TOURNAMENT_AGE_YOUTH = TOURNAMENT_AGE_CATEGORIES.filter((c) => c.family === 'youth');
export const TOURNAMENT_AGE_MASTERS = TOURNAMENT_AGE_CATEGORIES.filter((c) => c.family === 'masters');

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