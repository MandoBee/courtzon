import type { TournamentAgeCategory } from './tournament-aggregate.js';

/**
 * Phase 1 — predefined age-category catalog (application logic; no new table).
 *
 * Combines the existing authoritative seed rows (ids 1–7, mirrored in
 * `tournament-eligibility.ts` TOURNAMENT_AGE_CATEGORY_SEED_DEFINITIONS and the
 * production `tournament_age_categories` table) with the additional predefined
 * junior and senior categories the sport config requires. New ids have NO
 * database row — age categories are selected by id into the existing
 * `age_category_ids` JSON columns (no FK on the JSON), and the eligibility and
 * discovery engines resolve min/max/type from THIS catalog, so behaviour is
 * identical whether or not a row exists. Phase 2 (if ever needed) may seed the
 * same ids into the table for admin listing parity.
 *
 * PROTECTED AGE FORMULA (unchanged): Tournament Age = YEAR(start_date) −
 * YEAR(birth_date); youth = max_age ceiling (unbounded below — a younger player
 * may enter an older category), masters = min_age floor (unbounded above —
 * overlapping minimum-age categories).
 */

const LEGACY_YOUTH: ReadonlyArray<Omit<TournamentAgeCategory, 'is_active'>> = [
  { id: 1, slug: 'u14', type: 'youth', min_age: null, max_age: 14, label_en: 'U14', label_ar: 'تحت 14' },
  { id: 2, slug: 'u16', type: 'youth', min_age: null, max_age: 16, label_en: 'U16', label_ar: 'تحت 16' },
  { id: 3, slug: 'u18', type: 'youth', min_age: null, max_age: 18, label_en: 'U18', label_ar: 'تحت 18' },
];

const LEGACY_MASTERS: ReadonlyArray<Omit<TournamentAgeCategory, 'is_active'>> = [
  { id: 4, slug: '40_plus', type: 'masters', min_age: 40, max_age: null, label_en: '40+', label_ar: '40+' },
  { id: 5, slug: '45_plus', type: 'masters', min_age: 45, max_age: null, label_en: '45+', label_ar: '45+' },
  { id: 6, slug: '50_plus', type: 'masters', min_age: 50, max_age: null, label_en: '50+', label_ar: '50+' },
  { id: 7, slug: '55_plus', type: 'masters', min_age: 55, max_age: null, label_en: '55+', label_ar: '55+' },
];

/**
 * Junior EVEN pattern: U8, U10, U12, U14, U16, U18, U20, U22.
 * U14/U16/U18 reuse the legacy seed ids (1/2/3) so existing selections stay valid.
 */
const JUNIOR_EVEN: ReadonlyArray<Omit<TournamentAgeCategory, 'is_active'>> = [
  ...LEGACY_YOUTH,
  { id: 100, slug: 'u8', type: 'youth', min_age: null, max_age: 8, label_en: 'U8', label_ar: 'تحت 8' },
  { id: 101, slug: 'u10', type: 'youth', min_age: null, max_age: 10, label_en: 'U10', label_ar: 'تحت 10' },
  { id: 102, slug: 'u12', type: 'youth', min_age: null, max_age: 12, label_en: 'U12', label_ar: 'تحت 12' },
  { id: 103, slug: 'u20', type: 'youth', min_age: null, max_age: 20, label_en: 'U20', label_ar: 'تحت 20' },
  { id: 104, slug: 'u22', type: 'youth', min_age: null, max_age: 22, label_en: 'U22', label_ar: 'تحت 22' },
];

/** Junior ODD pattern: U7, U9, U11, U13, U15, U17, U19, U21. */
const JUNIOR_ODD: ReadonlyArray<Omit<TournamentAgeCategory, 'is_active'>> = [
  { id: 110, slug: 'u7', type: 'youth', min_age: null, max_age: 7, label_en: 'U7', label_ar: 'تحت 7' },
  { id: 111, slug: 'u9', type: 'youth', min_age: null, max_age: 9, label_en: 'U9', label_ar: 'تحت 9' },
  { id: 112, slug: 'u11', type: 'youth', min_age: null, max_age: 11, label_en: 'U11', label_ar: 'تحت 11' },
  { id: 113, slug: 'u13', type: 'youth', min_age: null, max_age: 13, label_en: 'U13', label_ar: 'تحت 13' },
  { id: 114, slug: 'u15', type: 'youth', min_age: null, max_age: 15, label_en: 'U15', label_ar: 'تحت 15' },
  { id: 115, slug: 'u17', type: 'youth', min_age: null, max_age: 17, label_en: 'U17', label_ar: 'تحت 17' },
  { id: 116, slug: 'u19', type: 'youth', min_age: null, max_age: 19, label_en: 'U19', label_ar: 'تحت 19' },
  { id: 117, slug: 'u21', type: 'youth', min_age: null, max_age: 21, label_en: 'U21', label_ar: 'تحت 21' },
];

/** Senior minimum-age categories: +35, +40, +45, +50, +55, +60, +65, +70, +75. */
const SENIOR_MIN_AGES: ReadonlyArray<Omit<TournamentAgeCategory, 'is_active'>> = [
  ...LEGACY_MASTERS,
  { id: 200, slug: '35_plus', type: 'masters', min_age: 35, max_age: null, label_en: '35+', label_ar: '35+' },
  { id: 201, slug: '60_plus', type: 'masters', min_age: 60, max_age: null, label_en: '60+', label_ar: '60+' },
  { id: 202, slug: '65_plus', type: 'masters', min_age: 65, max_age: null, label_en: '65+', label_ar: '65+' },
  { id: 203, slug: '70_plus', type: 'masters', min_age: 70, max_age: null, label_en: '70+', label_ar: '70+' },
  { id: 204, slug: '75_plus', type: 'masters', min_age: 75, max_age: null, label_en: '75+', label_ar: '75+' },
];

function toCategory(c: Omit<TournamentAgeCategory, 'is_active'>): TournamentAgeCategory {
  return { ...c, is_active: 1 };
}

export const AGE_CATEGORY_CATALOG: ReadonlyArray<TournamentAgeCategory> = orderUnique([
  ...JUNIOR_EVEN,
  ...JUNIOR_ODD,
  ...SENIOR_MIN_AGES,
].map(toCategory));

function orderUnique(categories: ReadonlyArray<TournamentAgeCategory>): TournamentAgeCategory[] {
  const seen = new Set<number>();
  const out: TournamentAgeCategory[] = [];
  for (const c of categories) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out.sort((a, b) => a.id - b.id);
}

const AGE_CATEGORY_MAP = new Map<number, TournamentAgeCategory>(
  AGE_CATEGORY_CATALOG.map((c) => [c.id, c]),
);

/** Junior category definitions, grouped by sport-selectable pattern (ascending by max age). */
export const JUNIOR_PATTERNS: ReadonlyArray<{ pattern: 'even' | 'odd'; label: string; categories: ReadonlyArray<TournamentAgeCategory> }> = [
  { pattern: 'even', label: 'Even (U8, U10, …, U22)', categories: JUNIOR_EVEN.map(toCategory).sort((a, b) => (a.max_age ?? 0) - (b.max_age ?? 0)) },
  { pattern: 'odd', label: 'Odd (U7, U9, …, U21)', categories: JUNIOR_ODD.map(toCategory).sort((a, b) => (a.max_age ?? 0) - (b.max_age ?? 0)) },
];

export const SENIOR_MIN_AGE_CATEGORIES: ReadonlyArray<TournamentAgeCategory> = [...new Map(SENIOR_MIN_AGES.map((c) => [c.id, c])).values()]
  .map(toCategory)
  .sort((a, b) => (a.min_age ?? 0) - (b.min_age ?? 0));

/**
 * Resolve age categories for the provided ids. The catalog is the single
 * source of truth (existing seed ids mirror the database rows exactly); unknown
 * ids are ignored, mirroring legacy DB-join behaviour.
 */
export function resolveAgeCategories(ids: ReadonlyArray<number>): TournamentAgeCategory[] {
  const seen = new Set<number>();
  const out: TournamentAgeCategory[] = [];
  for (const id of ids) {
    const idNum = Number(id);
    if (!Number.isSafeInteger(idNum) || idNum <= 0 || seen.has(idNum)) continue;
    const category = AGE_CATEGORY_MAP.get(idNum);
    if (!category) continue;
    seen.add(idNum);
    out.push(category);
  }
  return out.sort((a, b) => a.id - b.id);
}