import { describe, it, expect } from 'vitest';
import {
  buildCompetitionSeeds,
  isSplitRequested,
  validateSplitEligibility,
  type CompetitionGenerationInput,
  type PlannedCompetition,
} from '../competitionGeneration';

const BASE: CompetitionGenerationInput = {
  ageMode: 'open',
  ageCategoryIds: [],
  genderCategories: [],
  levelIds: [],
  perGender: { male: null, female: null },
  competitionType: 'singles',
};

function seeds(overrides: Partial<CompetitionGenerationInput>): PlannedCompetition[] {
  return buildCompetitionSeeds({ ...BASE, ...overrides });
}

describe('Phase 4 Step 2 — buildCompetitionSeeds', () => {
  it('open eligibility with no genders/levels produces NO split (legacy default)', () => {
    expect(seeds({})).toEqual([]);
    // Age-only with no gender: no split — the default keeps the age restriction.
    expect(seeds({ ageMode: 'categories', ageCategoryIds: [1] })).toEqual([]);
  });

  it('gender × age category: one competition per combination, correctly scoped', () => {
    const out = seeds({
      ageMode: 'categories',
      ageCategoryIds: [1, 2], // U14, U16
      genderCategories: ['male', 'female'],
      perGender: {
        male: { pattern: 'even', ageCategoryIds: [1, 2] },
        female: { pattern: 'even', ageCategoryIds: [1] },
      },
      ageLabel: (id) => (id === 1 ? 'U14' : 'U16'),
    });
    // Keys are unique and deterministic.
    expect(out.map((o) => o.key)).toEqual(['male:age:1', 'male:age:2', 'female:age:1']);
    expect(out.map((o) => o.name)).toEqual(['Male U14', 'Male U16', 'Female U14']);
    for (const c of out) {
      expect(c.competition_type).toBe('singles');
      expect(c.gender_categories.length).toBe(1);
      expect(c.age_mode).toBe('categories');
      expect(c.age_category_ids.length).toBe(1);
      expect(c.level_ids).toEqual([]);
    }
    expect(out[0].gender_categories).toEqual(['male']);
    expect(out[2].gender_categories).toEqual(['female']);
    expect(out[2].age_category_ids).toEqual([1]);
  });

  it('Mixed stays ONE mixed-gender competition per band — never split into male/female', () => {
    const out = seeds({
      ageMode: 'categories',
      ageCategoryIds: [1, 2],
      genderCategories: ['mixed'],
    });
    expect(out.length).toBe(2);
    expect(out.every((c) => c.gender_categories.length === 1 && c.gender_categories[0] === 'mixed')).toBe(true);
    expect(out.map((c) => c.age_category_ids[0])).toEqual([1, 2]);
  });

  it('professionals: gender × selected level (open age), no levels → all-levels meaning', () => {
    const withLevels = seeds({
      ageMode: 'open',
      ageCategoryIds: [],
      genderCategories: ['female'],
      levelIds: [3, 5],
    });
    expect(withLevels.map((c) => c.key)).toEqual(['female:level:3', 'female:level:5']);
    expect(withLevels.every((c) => c.age_mode === 'open' && c.age_category_ids.length === 0)).toBe(true);
    expect(withLevels.map((c) => c.level_ids)).toEqual([[3], [5]]);
  });

  it('age + levels: age competitions carry ALL selected levels; no separate level-only competitions', () => {
    const out = seeds({
      ageMode: 'categories',
      ageCategoryIds: [1],
      genderCategories: ['male'],
      perGender: { male: { pattern: 'even', ageCategoryIds: [1] }, female: null },
      levelIds: [3],
    });
    expect(out.map((c) => c.key)).toEqual(['male:age:1']);
    expect(out[0].level_ids).toEqual([3]);
    expect(out[0].age_mode).toBe('categories');
  });

  it('per-gender blocks are authoritative for male/female; mixed uses the shared set', () => {
    const out = seeds({
      ageMode: 'categories',
      ageCategoryIds: [1, 2, 3],
      genderCategories: ['male', 'female', 'mixed'],
      perGender: {
        male: { pattern: 'odd', ageCategoryIds: [115] },
        female: { pattern: 'even', ageCategoryIds: [2] },
      },
    });
    const keys = out.map((c) => c.key);
    // male block [115] only; female block [2] only; mixed uses the shared set [1,2,3].
    expect(keys).toContain('male:age:115');
    expect(keys).not.toContain('male:age:1');
    expect(keys).toContain('female:age:2');
    expect(keys).not.toContain('female:age:1');
    expect(keys).toContain('mixed:age:1');
    expect(keys).toContain('mixed:age:2');
    expect(keys).toContain('mixed:age:3');
    // No duplicate keys.
    expect(new Set(keys).size).toBe(keys.length);
  });

  // ── Step 2A — fail-closed per-gender eligibility ──────────────────────────
  it('MISSING per-gender state NEVER falls back to the union — that gender gets NO competitions', () => {
    const out = seeds({
      ageMode: 'categories',
      ageCategoryIds: [1, 2, 3], // union includes ages from other/future genders
      genderCategories: ['male'],
      perGender: { male: null, female: { pattern: 'even', ageCategoryIds: [2] } },
    });
    // male has no explicit block → zero male competitions, even though the
    // union carries U14/U16/U18; female's own block still generates.
    expect(out).toEqual([]);
  });

  it('NULL/UNDEFINED per-gender entries are equally fail-closed', () => {
    const out = seeds({
      ageMode: 'categories',
      ageCategoryIds: [1, 2],
      genderCategories: ['male', 'female'],
      perGender: { male: undefined, female: null },
    });
    expect(out).toEqual([]);
  });

  it('EMPTY per-gender age array produces no competition for that gender only', () => {
    const out = seeds({
      ageMode: 'categories',
      ageCategoryIds: [1, 2],
      genderCategories: ['male', 'female'],
      perGender: {
        male: { pattern: 'even', ageCategoryIds: [] },
        female: { pattern: 'even', ageCategoryIds: [1] },
      },
    });
    expect(out.map((c) => c.key)).toEqual(['female:age:1']);
  });

  it('Mixed keeps the shared tournament-level age set even when per-gender blocks exist', () => {
    const out = seeds({
      ageMode: 'categories',
      ageCategoryIds: [1, 2],
      genderCategories: ['mixed'],
      perGender: { male: { pattern: 'even', ageCategoryIds: [1] }, female: null },
    });
    expect(out.map((c) => c.key)).toEqual(['mixed:age:1', 'mixed:age:2']);
  });

  // ── Step 2A — competition-type inheritance ────────────────────────────────
  it('explicit competition types pass through for Singles/Doubles/Team', () => {
    expect(seeds({ genderCategories: ['male'], ageMode: 'categories', ageCategoryIds: [1], perGender: { male: { pattern: 'even', ageCategoryIds: [1] }, female: null }, competitionType: 'singles' })[0].competition_type).toBe('singles');
    expect(seeds({ genderCategories: ['male'], ageMode: 'categories', ageCategoryIds: [1], perGender: { male: { pattern: 'even', ageCategoryIds: [1] }, female: null }, competitionType: 'doubles' })[0].competition_type).toBe('doubles');
    expect(seeds({ genderCategories: ['male'], ageMode: 'categories', ageCategoryIds: [1], perGender: { male: { pattern: 'even', ageCategoryIds: [1] }, female: null }, competitionType: 'team' })[0].competition_type).toBe('team');
  });

  it('NULL competition type is preserved (payload omits it → backend inherits its resolved default)', () => {
    const out = seeds({ genderCategories: ['mixed'], ageMode: 'categories', ageCategoryIds: [1], competitionType: null });
    expect(out.length).toBe(1);
    expect(out[0].competition_type).toBeNull();
  });
});

// ── Step 2B — requested split must never silently fall back to the legacy default ──
describe('Phase 4 Step 2B — isSplitRequested / validateSplitEligibility', () => {
  it('legacy no-split creations are NOT a split request and are valid', () => {
    expect(isSplitRequested({ ageMode: 'open', genderCategories: [], levelIds: [] })).toBe(false);
    expect(isSplitRequested({ ageMode: 'categories', ageCategoryIds: [1], genderCategories: [] })).toBe(false);
    expect(validateSplitEligibility({ ageMode: 'open', genderCategories: [] })).toEqual({ ok: true });
    expect(validateSplitEligibility({ ageMode: 'categories', genderCategories: [], perGender: { male: null, female: null } })).toEqual({ ok: true });
  });

  it('mixed-only with open age and no levels is a valid single mixed no-split', () => {
    expect(isSplitRequested({ ageMode: 'open', genderCategories: ['mixed'], levelIds: [] })).toBe(false);
    expect(validateSplitEligibility({ ageMode: 'open', genderCategories: ['mixed'] })).toEqual({ ok: true });
  });

  it('mixed-only with categories IS a split request and is valid (mixed uses the shared set)', () => {
    expect(isSplitRequested({ ageMode: 'categories', ageCategoryIds: [1, 2], genderCategories: ['mixed'] })).toBe(true);
    expect(validateSplitEligibility({ ageMode: 'categories', genderCategories: ['mixed'], perGender: { male: null, female: null } })).toEqual({ ok: true });
  });

  it('male+female with categories and per-gender blocks is requested and valid', () => {
    const value = {
      ageMode: 'categories' as const,
      ageCategoryIds: [1, 2],
      genderCategories: ['male', 'female' as const],
      perGender: {
        male: { pattern: 'even' as const, ageCategoryIds: [1] },
        female: { pattern: 'even' as const, ageCategoryIds: [2] },
      },
    };
    expect(isSplitRequested(value)).toBe(true);
    expect(validateSplitEligibility(value)).toEqual({ ok: true });
  });

  it('REQUESTED but MISSING per-gender state FAILS validation (blocks unsafe fallback)', () => {
    expect(validateSplitEligibility({
      ageMode: 'categories', genderCategories: ['male'], perGender: { male: null, female: null },
    })).toEqual({ ok: false, reason: 'gender_without_categories' });
  });

  it('REQUESTED but NULL/UNDEFINED per-gender state FAILS validation', () => {
    expect(validateSplitEligibility({
      ageMode: 'categories', genderCategories: ['male', 'female'], perGender: { male: undefined, female: null },
    })).toEqual({ ok: false, reason: 'gender_without_categories' });
  });

  it('REQUESTED but EMPTY per-gender age selection FAILS validation (one gender configured, other not)', () => {
    expect(validateSplitEligibility({
      ageMode: 'categories',
      genderCategories: ['male', 'female'],
      perGender: {
        male: { pattern: 'even', ageCategoryIds: [] },
        female: { pattern: 'even', ageCategoryIds: [1] },
      },
    })).toEqual({ ok: false, reason: 'gender_without_categories' });
  });

  it('levels-only (professional) with genders is requested and valid — per-gender blocks not required', () => {
    const value = { ageMode: 'open' as const, genderCategories: ['male', 'female' as const], levelIds: [3] };
    expect(isSplitRequested(value)).toBe(true);
    expect(validateSplitEligibility(value)).toEqual({ ok: true });
  });
});