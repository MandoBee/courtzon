import { describe, it, expect } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'courtzon2026';
  process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  process.env.PORT = '3001';
});

import {
  AGE_CATEGORY_CATALOG,
  JUNIOR_PATTERNS,
  SENIOR_MIN_AGE_CATEGORIES,
  resolveAgeCategories,
} from '../domain/tournament-age-catalog.js';
import { assertSingleAgeCategoryFamily, evaluateEligibilitySync } from '../application/tournament-eligibility.service.js';

describe('Phase 1 age catalog — predefined categories (no DB rows required)', () => {
  it('defines the even junior pattern U8..U22', () => {
    const even = JUNIOR_PATTERNS.find((p) => p.pattern === 'even')!;
    const labels = even.categories.map((c) => c.slug);
    expect(labels).toEqual(['u8', 'u10', 'u12', 'u14', 'u16', 'u18', 'u20', 'u22']);
    for (const c of even.categories) {
      expect(c.type).toBe('youth');
      expect(c.max_age).not.toBeNull();
    }
  });

  it('defines the odd junior pattern U7..U21', () => {
    const odd = JUNIOR_PATTERNS.find((p) => p.pattern === 'odd')!;
    const labels = odd.categories.map((c) => c.slug);
    expect(labels).toEqual(['u7', 'u9', 'u11', 'u13', 'u15', 'u17', 'u19', 'u21']);
  });

  it('defines senior minimum-age categories +35..+75', () => {
    expect(SENIOR_MIN_AGE_CATEGORIES.map((c) => c.min_age)).toEqual([35, 40, 45, 50, 55, 60, 65, 70, 75]);
  });

  it('keeps the legacy seeded ids >=1 resolvable with identical bounds', () => {
    const legacy = resolveAgeCategories([1, 2, 3, 4, 5, 6, 7]);
    expect(legacy.map((c) => [c.id, c.max_age ?? c.min_age])).toEqual([
      [1, 14], [2, 16], [3, 18], [4, 40], [5, 45], [6, 50], [7, 55],
    ]);
  });

  it('Youth XOR Masters is still enforced across the combined catalog', () => {
    const mixed = resolveAgeCategories([100, 200]);
    expect(() => assertSingleAgeCategoryFamily(mixed)).toThrow();
  });
});

describe('Phase 1 eligibility — new junior/senior categories (YEAR-only formula preserved)', () => {
  const ctx = {
    tournamentYear: 2030,
    ageMode: 'categories' as const,
    ageCategoryIds: [],
    categories: [] as ReturnType<typeof resolveAgeCategories>,
    genderCategories: [],
    levelIds: [],
  };

  function evalAge(birthYear: number, categoryIds: number[]) {
    return evaluateEligibilitySync(
      1,
      { gender: 'male', birthYear },
      null,
      { ...ctx, ageCategoryIds: categoryIds, categories: resolveAgeCategories(categoryIds) },
    );
  }

  it('U8 accepts a player who TURNS 8 in the tournament year and rejects a 9-year-old', () => {
    // 2030 − 2022 = 8 → eligible; 2030 − 2021 = 9 → exceeds U8 max.
    expect(evalAge(2022, [100]).eligible).toBe(true);
    expect(evalAge(2021, [100]).eligible).toBe(false);
  });

  it('a younger junior may enter an older category (12-year-old in U16)', () => {
    // 2030 − 2018 = 12 → U16 (max 16) eligible, U10 (max 10) not.
    expect(evalAge(2018, [2]).eligible).toBe(true);
    expect(evalAge(2018, [101]).eligible).toBe(false);
  });

  it('senior categories are overlapping minimum ages', () => {
    // 2030 − 1975 = 55 → +45 (min 45) eligible, +60 (min 60) not.
    expect(evalAge(1975, [5]).eligible).toBe(true);
    expect(evalAge(1975, [201]).eligible).toBe(false);
    // 2030 − 1970 = 60 → +60 eligible.
    expect(evalAge(1970, [201]).eligible).toBe(true);
  });

  it('sanity-checks the +35 and +75 boundaries exactly at the minimum age', () => {
    // 2030 − 1995 = 35 → +35 eligible; 2030 − 1996 = 34 → rejected.
    expect(evalAge(1995, [200]).eligible).toBe(true);
    expect(evalAge(1996, [200]).eligible).toBe(false);
    // 2030 − 1955 = 75 → +75 eligible; 2030 − 1956 = 74 → rejected.
    expect(evalAge(1955, [204]).eligible).toBe(true);
    expect(evalAge(1956, [204]).eligible).toBe(false);
  });

  it('checks junior boundaries at the top of the range (U20/U22)', () => {
    // 2030 − 2010 = 20 → U20 eligible, U18 (max 18) NOT.
    expect(evalAge(2010, [103]).eligible).toBe(true);
    expect(evalAge(2010, [3]).eligible).toBe(false);
    // 2030 − 2008 = 22 → U22 eligible; 2030 − 2007 = 23 → U22 NOT.
    expect(evalAge(2008, [104]).eligible).toBe(true);
    expect(evalAge(2007, [104]).eligible).toBe(false);
  });

  it('odd junior categories behave identically', () => {
    // 2030 − 2019 = 11 → U11 (max 11) and U15 (max 15) both eligible.
    expect(evalAge(2019, [112]).eligible).toBe(true);
    expect(evalAge(2019, [114]).eligible).toBe(true);
    // 2030 − 2018 = 12 → U11 (max 11) NOT eligible; U15 eligible.
    expect(evalAge(2018, [112]).eligible).toBe(false);
    expect(evalAge(2018, [114]).eligible).toBe(true);
  });

  it('catalog deduplicates and ignores unknown ids (legacy parity)', () => {
    expect(resolveAgeCategories([100, 100, 9999])).toHaveLength(1);
    // 8 even + 8 odd + 9 senior = 25 predefined categories.
    expect(AGE_CATEGORY_CATALOG).toHaveLength(25);
  });
});