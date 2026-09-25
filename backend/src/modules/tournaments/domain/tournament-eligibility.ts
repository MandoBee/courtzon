import {
  TOURNAMENT_GENDER_CATEGORIES,
  type TournamentAgeMode,
  type TournamentEligibility,
  type TournamentGenderCategory,
} from './tournament-aggregate.js';

export { TOURNAMENT_GENDER_CATEGORIES };

/**
 * Group 7-A — Tournament Eligibility normalization + serialization helpers.
 *
 * Persisted JSON columns may arrive from mysql2 as parsed JS values or raw
 * JSON strings; these helpers normalise every representation to the structured
 * domain shape and generate deterministic (canonical, de-duplicated, ordered)
 * JSON for storage so round-trips are stable.
 */

const AGE_MODES: TournamentAgeMode[] = ['open', 'categories'];

function toNumberArray(value: unknown): number[] {
  if (value == null || value === '') return [];
  const raw = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(raw)) return [];
  const ids = (raw as unknown[])
    .map((id) => Number(id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  return [...new Set(ids)].sort((a, b) => a - b);
}

function toGenderArray(value: unknown): TournamentGenderCategory[] {
  if (value == null || value === '') return [];
  const raw = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TournamentGenderCategory[] = [];
  for (const entry of raw) {
    const g = String(entry);
    if ((TOURNAMENT_GENDER_CATEGORIES as readonly string[]).includes(g) && !seen.has(g)) {
      seen.add(g);
      out.push(g as TournamentGenderCategory);
    }
  }
  // Deterministic canonical order: male, female, mixed.
  return TOURNAMENT_GENDER_CATEGORIES.filter((g) => seen.has(g));
}

function toAgeMode(value: unknown): TournamentAgeMode | null {
  if (value == null || value === '') return null;
  const mode = String(value);
  return (AGE_MODES as string[]).includes(mode) ? (mode as TournamentAgeMode) : null;
}

/**
 * Normalize a raw legacy/read row into the structured eligibility shape.
 * Legacy rows (all fields absent) resolve to Open Age / No restriction / Open level.
 */
export function normalizeEligibility(
  raw: {
    age_mode?: unknown;
    age_category_ids?: unknown;
    gender_categories?: unknown;
    level_ids?: unknown;
  } | null | undefined,
): TournamentEligibility {
  if (!raw) return { ageMode: null, ageCategoryIds: [], genderCategories: [], levelIds: [] };
  return {
    ageMode: toAgeMode(raw.age_mode),
    ageCategoryIds: toNumberArray(raw.age_category_ids).sort((a, b) => a - b),
    genderCategories: toGenderArray(raw.gender_categories),
    levelIds: toNumberArray(raw.level_ids).sort((a, b) => a - b),
  };
}

/** Deterministic JSON string for a storage column (NULL-safe). */
export function stringifyEligibilityColumn(ids: number[] | null | undefined): string | null {
  if (ids == null) return null;
  const orderedUnique = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0).sort((a, b) => a - b);
  return JSON.stringify(orderedUnique);
}

/** Deterministic JSON string for the gender categories column. */
export function stringifyGenderCategories(categories: TournamentGenderCategory[] | null | undefined): string | null {
  if (categories == null) return null;
  const ordered = TOURNAMENT_GENDER_CATEGORIES.filter((g) => (categories as readonly string[]).includes(g));
  return JSON.stringify(ordered);
}

/** Age mode validation helper (invalid ⇒ null, preserving legacy "open"). */
export function normalizeAgeMode(value: unknown): TournamentAgeMode | null {
  return toAgeMode(value);
}

/** Number-array validation helper for reference-ID columns. */
export function normalizeReferenceIds(value: unknown): number[] {
  return toNumberArray(value);
}

/**
 * Serialize the eligibility fragment of a CREATE/UPDATE payload so the
 * repository receives only canonical arrays (or undefined when untouched).
 */
export function serializeEligibilityInput(input: {
  age_mode?: TournamentAgeMode | null;
  age_category_ids?: number[] | null;
  gender_categories?: TournamentGenderCategory[] | null;
  level_ids?: number[] | null;
}): {
  age_mode?: TournamentAgeMode | null;
  age_category_ids?: number[] | null;
  gender_categories?: TournamentGenderCategory[] | null;
  level_ids?: number[] | null;
} {
  const out: ReturnType<typeof serializeEligibilityInput> = {};
  if (input.age_mode !== undefined) out.age_mode = normalizeAgeMode(input.age_mode);
  if (input.age_category_ids !== undefined) out.age_category_ids = normalizeReferenceIds(input.age_category_ids);
  if (input.gender_categories !== undefined) out.gender_categories = toGenderArray(input.gender_categories);
  if (input.level_ids !== undefined) out.level_ids = normalizeReferenceIds(input.level_ids);
  return out;
}

/**
 * Authoritative seed definitions (mirror of migration 176 + baseline seed).
 * Reference data is treated as immutable once used by a tournament — changes
 * require NEW rows, never mutation of existing definitions.
 */
export const TOURNAMENT_AGE_CATEGORY_SEED_DEFINITIONS: ReadonlyArray<{
  id: number;
  slug: string;
  type: 'youth' | 'masters';
  min_age: number | null;
  max_age: number | null;
  label_en: string;
  label_ar: string;
}> = [
  { id: 1, slug: 'u14', type: 'youth', min_age: null, max_age: 14, label_en: 'U14', label_ar: 'تحت 14' },
  { id: 2, slug: 'u16', type: 'youth', min_age: null, max_age: 16, label_en: 'U16', label_ar: 'تحت 16' },
  { id: 3, slug: 'u18', type: 'youth', min_age: null, max_age: 18, label_en: 'U18', label_ar: 'تحت 18' },
  { id: 4, slug: '40_plus', type: 'masters', min_age: 40, max_age: null, label_en: '40+', label_ar: '40+' },
  { id: 5, slug: '45_plus', type: 'masters', min_age: 45, max_age: null, label_en: '45+', label_ar: '45+' },
  { id: 6, slug: '50_plus', type: 'masters', min_age: 50, max_age: null, label_en: '50+', label_ar: '50+' },
  { id: 7, slug: '55_plus', type: 'masters', min_age: 55, max_age: null, label_en: '55+', label_ar: '55+' },
];

export const YOUTH_AGE_CATEGORY_IDS = TOURNAMENT_AGE_CATEGORY_SEED_DEFINITIONS.filter((c) => c.type === 'youth').map((c) => c.id);
export const MASTERS_AGE_CATEGORY_IDS = TOURNAMENT_AGE_CATEGORY_SEED_DEFINITIONS.filter((c) => c.type === 'masters').map((c) => c.id);

/* ──────────────────────────────────────────────────────────────────────────
 * Group 7-C — Discovery Notification targeting.
 *
 * The discovery audience is SPORT (interests ∪ main_sport) THEN age (YEAR-only)
 * THEN gender THEN branch (when a branch is set). LEVEL is NEVER a predicate.
 * Filters are resolved to parameterized, set-based SQL conditions (no N+1,
 * no loading users into Node).
 * ────────────────────────────────────────────────────────────────────────── */

export type DiscoveryAgeFilter = { active: false } | { active: true; relation: 'ge' | 'le'; value: number };

/**
 * Collapse the selected age categories into ONE birth-year predicate.
 * Youth: eligible when age ≤ max_age ⇒ birth_year ≥ tournamentYear − max(max_age).
 * Masters: eligible when age ≥ min_age ⇒ birth_year ≤ tournamentYear − min(min_age).
 * Single-family is guaranteed by G7-B; a corrupt mixed config logs+skips (never
 * silently narrows the audience).
 */
export function resolveDiscoveryAgeFilter(
  categories: ReadonlyArray<{ type: 'youth' | 'masters'; min_age: number | null; max_age: number | null }>,
  tournamentYear: number,
): DiscoveryAgeFilter {
  if (!categories || categories.length === 0) return { active: false };
  const families = new Set(categories.map((c) => c.type));
  if (families.size > 1) return { active: false };

  if (families.has('youth')) {
    const maxMax = Math.max(...categories.map((c) => c.max_age ?? 0));
    return { active: true, relation: 'ge', value: tournamentYear - maxMax };
  }
  const minMin = Math.min(...categories.map((c) => c.min_age ?? 0));
  return { active: true, relation: 'le', value: tournamentYear - minMin };
}

export type DiscoveryGenderFilter = { active: false } | { active: true; value: 'male' | 'female' };

/**
 * Gender discovery filter: a single explicit gender restricts; otherwise
 * (male+female, mixed, empty) the individual gender is irrelevant for discovery.
 */
export function resolveDiscoveryGenderFilter(categories: ReadonlyArray<TournamentGenderCategory>): DiscoveryGenderFilter {
  const set = new Set(categories ?? []);
  if (!set.size || set.has('mixed') || (set.has('male') && set.has('female'))) return { active: false };
  return { active: true, value: set.has('male') ? 'male' : 'female' };
}

export interface DiscoveryAudienceFilters {
  sportId: number;
  age: DiscoveryAgeFilter;
  gender: DiscoveryGenderFilter;
  branchId: number | null;
}

/**
 * Set-based audience SQL: sport base (interests ∪ main_sport, DISTINCT), then
 * age/gender/branch predicates. NO player_levels predicate ever.
 */
export function buildDiscoveryAudienceSql(f: DiscoveryAudienceFilters): { sql: string; params: Array<number | string> } {
  const base = `SELECT DISTINCT u.id
    FROM (
      SELECT user_id FROM player_sport_interests WHERE sport_id = ?
      UNION
      SELECT user_id FROM player_profiles WHERE main_sport_id = ?
    ) a
    JOIN users u ON u.id = a.user_id AND u.account_status = 'active' AND u.deleted_at IS NULL`;

  const where: string[] = [];
  const params: Array<number | string> = [f.sportId, f.sportId];

  if (f.age.active) {
    where.push('u.birth_date IS NOT NULL');
    where.push(f.age.relation === 'ge' ? 'YEAR(u.birth_date) >= ?' : 'YEAR(u.birth_date) <= ?');
    params.push(f.age.value);
  }
  if (f.gender.active) {
    where.push('u.gender = ?');
    params.push(f.gender.value);
  }
  if (f.branchId != null) {
    where.push('EXISTS (SELECT 1 FROM user_branches ub2 WHERE ub2.user_id = u.id AND ub2.branch_id = ?)');
    params.push(f.branchId);
  }

  const sql = where.length ? `${base} WHERE ${where.join(' AND ')}` : base;
  return { sql, params };
}