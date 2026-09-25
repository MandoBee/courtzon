import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn() }));

import {
  evaluateEligibilitySync,
  assertSingleAgeCategoryFamily,
  buildRegistrationSnapshot,
  type EligibilityContext,
  type TournamentAgeCategory,
  type MemberEligibilityResult,
} from '../application/tournament-eligibility.service.js';

const YEAR = 2026;

const YOUTH: TournamentAgeCategory[] = [
  { id: 1, slug: 'u14', type: 'youth', min_age: null, max_age: 14, label_en: 'U14', label_ar: 'تحت 14', is_active: 1 },
  { id: 2, slug: 'u16', type: 'youth', min_age: null, max_age: 16, label_en: 'U16', label_ar: 'تحت 16', is_active: 1 },
  { id: 3, slug: 'u18', type: 'youth', min_age: null, max_age: 18, label_en: 'U18', label_ar: 'تحت 18', is_active: 1 },
];

const MASTERS: TournamentAgeCategory[] = [
  { id: 4, slug: '40_plus', type: 'masters', min_age: 40, max_age: null, label_en: '40+', label_ar: '40+', is_active: 1 },
  { id: 5, slug: '45_plus', type: 'masters', min_age: 45, max_age: null, label_en: '45+', label_ar: '45+', is_active: 1 },
  { id: 6, slug: '50_plus', type: 'masters', min_age: 50, max_age: null, label_en: '50+', label_ar: '50+', is_active: 1 },
  { id: 7, slug: '55_plus', type: 'masters', min_age: 55, max_age: null, label_en: '55+', label_ar: '55+', is_active: 1 },
];

function ctx(overrides: Partial<EligibilityContext> = {}): EligibilityContext {
  return {
    tournamentYear: YEAR,
    ageMode: null,
    ageCategoryIds: [],
    categories: [],
    genderCategories: [],
    levelIds: [],
    ...overrides,
  };
}

function youthCtx(ids: number[]): EligibilityContext {
  const selected = YOUTH.filter((c) => ids.includes(c.id));
  return ctx({ ageMode: 'categories', ageCategoryIds: ids, categories: selected });
}

function mastersCtx(ids: number[]): EligibilityContext {
  const selected = MASTERS.filter((c) => ids.includes(c.id));
  return ctx({ ageMode: 'categories', ageCategoryIds: ids, categories: selected });
}

function evaluate(userId: number, birthYear: number | null, gender: string | null, levelId: number | null, c: EligibilityContext): MemberEligibilityResult {
  return evaluateEligibilitySync(userId, { birthYear, gender }, levelId, c);
}

describe('G7-B AGE (year-only, boundary-sensitive)', () => {
  it('1. Open age accepts any birth year', () => {
    const r = evaluate(1, 1990, 'male', 3, ctx({ ageMode: 'open' }));
    expect(r.eligible).toBe(true);
    const legacy = evaluate(1, 1990, 'male', 3, ctx({ ageMode: null }));
    expect(legacy.eligible).toBe(true);
  });

  it('2. U14 accepts boundary birth year (2012 → age 14)', () => {
    expect(evaluate(1, 2012, 'male', 3, youthCtx([1])).eligible).toBe(true);
  });

  it('3. U14 rejects one year too old (2011 → age 15)', () => {
    const r = evaluate(1, 2011, 'male', 3, youthCtx([1]));
    expect(r.eligible).toBe(false);
    expect(r.reasons.some((x) => x.code === 'AGE_NOT_ELIGIBLE')).toBe(true);
  });

  it('4. U16 boundary (2010 eligible, 2009 not)', () => {
    expect(evaluate(1, 2010, 'male', 3, youthCtx([2])).eligible).toBe(true);
    expect(evaluate(1, 2009, 'male', 3, youthCtx([2])).eligible).toBe(false);
  });

  it('5. U18 boundary (2008 eligible, 2007 not)', () => {
    expect(evaluate(1, 2008, 'male', 3, youthCtx([3])).eligible).toBe(true);
    expect(evaluate(1, 2007, 'male', 3, youthCtx([3])).eligible).toBe(false);
  });

  it('6. 40+ boundary (1986 eligible, 1987 not)', () => {
    expect(evaluate(1, 1986, 'male', 3, mastersCtx([4])).eligible).toBe(true);
    expect(evaluate(1, 1987, 'male', 3, mastersCtx([4])).eligible).toBe(false);
  });

  it('7. 45+ boundary (1981 eligible, 1982 not)', () => {
    expect(evaluate(1, 1981, 'male', 3, mastersCtx([5])).eligible).toBe(true);
    expect(evaluate(1, 1982, 'male', 3, mastersCtx([5])).eligible).toBe(false);
  });

  it('8. 50+ boundary (1976 eligible, 1977 not)', () => {
    expect(evaluate(1, 1976, 'male', 3, mastersCtx([6])).eligible).toBe(true);
    expect(evaluate(1, 1977, 'male', 3, mastersCtx([6])).eligible).toBe(false);
  });

  it('9. 55+ boundary (1971 eligible, 1972 not)', () => {
    expect(evaluate(1, 1971, 'male', 3, mastersCtx([7])).eligible).toBe(true);
    expect(evaluate(1, 1972, 'male', 3, mastersCtx([7])).eligible).toBe(false);
  });

  it('10. Multiple same-family categories use OR logic', () => {
    // age 15 (2011) fails u14 but passes u16 → eligible
    expect(evaluate(1, 2011, 'male', 3, youthCtx([1, 2])).eligible).toBe(true);
  });

  it('11. Youth + masters combination is rejected', () => {
    expect(() => assertSingleAgeCategoryFamily([YOUTH[0], MASTERS[0]])).toThrowError();
    try {
      assertSingleAgeCategoryFamily([YOUTH[0], MASTERS[0]]);
    } catch (e: any) {
      expect(e.errorCode).toBe('INVALID_AGE_CATEGORIES');
      expect(e.statusCode).toBe(422);
    }
  });

  it('12. Missing birth date rejected for restricted age, allowed for open', () => {
    expect(evaluate(1, null, 'male', 3, youthCtx([1])).reasons.some((x) => x.code === 'MISSING_BIRTH_DATE')).toBe(true);
    expect(evaluate(1, null, 'male', 3, ctx({ ageMode: 'open' })).eligible).toBe(true);
  });

  it('13. Tournament year is authoritative, not current/today', () => {
    // year 2040 → 2030 birth = age 10 (would be wrong with any "today" logic)
    const c = ctx({ ageMode: 'categories', ageCategoryIds: [1], categories: YOUTH, tournamentYear: 2040 });
    expect(evaluate(1, 2030, 'male', 3, c).eligible).toBe(true);
  });

  it('14. Month/day differences do not affect eligibility (year only)', () => {
    // Same birthYear regardless of month/day
    expect(evaluate(1, 2000, 'male', 3, youthCtx([3])).snapshot.calculatedAge).toBe(26);
  });
});

describe('G7-B GENDER', () => {
  it('15. Male tournament accepts male', () => {
    expect(evaluate(1, 2000, 'male', 3, ctx({ genderCategories: ['male'] })).eligible).toBe(true);
  });

  it('16. Male tournament rejects female', () => {
    expect(evaluate(1, 2000, 'female', 3, ctx({ genderCategories: ['male'] })).reasons.some((x) => x.code === 'GENDER_NOT_ELIGIBLE')).toBe(true);
  });

  it('17. Female tournament accepts female', () => {
    expect(evaluate(1, 2000, 'female', 3, ctx({ genderCategories: ['female'] })).eligible).toBe(true);
  });

  it('18. Female tournament rejects male', () => {
    expect(evaluate(1, 2000, 'male', 3, ctx({ genderCategories: ['female'] })).eligible).toBe(false);
  });

  it('19. Mixed accepts both male and female', () => {
    expect(evaluate(1, 2000, 'male', 3, ctx({ genderCategories: ['mixed'] })).eligible).toBe(true);
    expect(evaluate(1, 2000, 'female', 3, ctx({ genderCategories: ['mixed'] })).eligible).toBe(true);
  });

  it('20. Multiple categories behave correctly', () => {
    expect(evaluate(1, 2000, 'male', 3, ctx({ genderCategories: ['male', 'mixed'] })).eligible).toBe(true);
    expect(evaluate(1, 2000, 'female', 3, ctx({ genderCategories: ['male', 'female'] })).eligible).toBe(true);
    expect(evaluate(1, 2000, 'male', 3, ctx({ genderCategories: ['female', 'mixed'] })).eligible).toBe(true);
  });

  it('21. NULL gender rejected when gender restriction exists', () => {
    expect(evaluate(1, 2000, null, 3, ctx({ genderCategories: ['male'] })).eligible).toBe(false);
  });

  it('22. Empty gender restriction is open', () => {
    expect(evaluate(1, 2000, null, 3, ctx({ genderCategories: [] })).eligible).toBe(true);
  });
});

describe('G7-B LEVEL', () => {
  it('23. Open level accepts any player', () => {
    expect(evaluate(1, 2000, 'male', null, ctx({ levelIds: [] })).eligible).toBe(true);
  });

  it('24. Selected level accepts matching player', () => {
    expect(evaluate(1, 2000, 'male', 2, ctx({ levelIds: [2] })).eligible).toBe(true);
  });

  it('25. Selected level rejects non-matching player', () => {
    const r = evaluate(1, 2000, 'male', 5, ctx({ levelIds: [2] }));
    expect(r.eligible).toBe(false);
    expect(r.reasons.some((x) => x.code === 'LEVEL_NOT_ELIGIBLE')).toBe(true);
  });

  it('26. Missing profile/level rejects restricted tournament', () => {
    const r = evaluate(1, 2000, 'male', null, ctx({ levelIds: [2] }));
    expect(r.eligible).toBe(false);
    expect(r.reasons.some((x) => x.code === 'MISSING_PLAYER_LEVEL')).toBe(true);
  });

  it('27. Multiple selected levels use OR logic', () => {
    expect(evaluate(1, 2000, 'male', 4, ctx({ levelIds: [2, 4] })).eligible).toBe(true);
    expect(evaluate(1, 2000, 'male', 5, ctx({ levelIds: [2, 4] })).eligible).toBe(false);
  });
});

describe('G7-B individual + multi-reason', () => {
  it('28. All dimensions pass → eligible', () => {
    const r = evaluate(1, 2012, 'male', 3, { tournamentYear: YEAR, ageMode: 'categories', ageCategoryIds: [1], categories: YOUTH.filter((c) => c.id === 1), genderCategories: ['male'], levelIds: [3] });
    expect(r.eligible).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('29-31. Each failing dimension maps to the structured 422 code', () => {
    expect(evaluate(1, 2011, 'male', 3, youthCtx([1])).reasons[0]?.code).toBe('AGE_NOT_ELIGIBLE');
    expect(evaluate(1, 2000, 'female', 3, ctx({ genderCategories: ['male'] })).reasons[0]?.code).toBe('GENDER_NOT_ELIGIBLE');
    expect(evaluate(1, 2000, 'male', 9, ctx({ levelIds: [3] })).reasons[0]?.code).toBe('LEVEL_NOT_ELIGIBLE');
  });

  it('32. Multiple failures preserve structured reasons (all dimensions)', () => {
    const r = evaluate(1, 2000, 'male', 9, { tournamentYear: YEAR, ageMode: 'categories', ageCategoryIds: [1, 2], categories: YOUTH.filter((c) => c.id === 1 || c.id === 2), genderCategories: ['female'], levelIds: [3] });
    const codes = r.reasons.map((x) => x.code);
    expect(codes).toContain('AGE_NOT_ELIGIBLE');
    expect(codes).toContain('GENDER_NOT_ELIGIBLE');
    expect(codes).toContain('LEVEL_NOT_ELIGIBLE');
    expect(r.eligible).toBe(false);
  });
});

describe('G7-B snapshot structure', () => {
  it('41/42. Team snapshot contains EVERY member with full per-member fields', () => {
    const evalA = {
      eligible: true,
      members: [
        evaluate(1, 2013, 'male', 2, youthCtx([1])),
        evaluate(2, 2014, 'female', 2, youthCtx([1])),
      ],
    };
    const snapshot = buildRegistrationSnapshot(evalA);
    expect(snapshot.members).toHaveLength(2);
    expect(snapshot.members[0].userId).toBe(1);
    expect(snapshot.members[0].tournamentYear).toBe(YEAR);
    expect(snapshot.members[0].birthYear).toBe(2013);
    expect(snapshot.members[0].matchedAgeCategoryIds).toEqual([1]);
    expect(snapshot.members[1].playerLevelId).toBe(2);
    expect(snapshot.members[1].playerGender).toBe('female');
    expect(snapshot.members.every((m) => m.eligible)).toBe(true);
  });

  it('bypass is recorded in the snapshot when operator-registered', () => {
    const evalA = { eligible: false, members: [evaluate(1, 2011, 'male', 3, youthCtx([1]))] };
    const snapshot = buildRegistrationSnapshot(evalA, { bypassed: true, bypassReason: 'operator registration' });
    expect(snapshot.eligible).toBe(false);
    expect(snapshot.bypassed).toBe(true);
    expect(snapshot.bypassReason).toBe('operator registration');
  });
});