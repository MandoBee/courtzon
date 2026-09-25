import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TOURNAMENT_GENDER_CATEGORIES,
  TOURNAMENT_AGE_CATEGORY_SEED_DEFINITIONS,
  YOUTH_AGE_CATEGORY_IDS,
  MASTERS_AGE_CATEGORY_IDS,
  normalizeEligibility,
  normalizeAgeMode,
  normalizeReferenceIds,
  serializeEligibilityInput,
  stringifyEligibilityColumn,
  stringifyGenderCategories,
} from '../domain/tournament-eligibility.js';
import {
  CreateTournamentSchema,
  UpdateTournamentSchema,
} from '../presentation/tournament.dto.js';

const MIGRATION_PATH = resolve(process.cwd(), '../database/migrations/176_tournament_eligibility.sql');
const migrationSql = (): string => readFileSync(MIGRATION_PATH, 'utf8');

describe('G7-A Tournament Eligibility — existing default / legacy behaviour', () => {
  it('legacy tournament rows resolve to Open Age / no gender restriction / Open level', () => {
    const legacy = normalizeEligibility(null);
    expect(legacy.ageMode).toBeNull();
    expect(legacy.ageCategoryIds).toEqual([]);
    expect(legacy.genderCategories).toEqual([]);
    expect(legacy.levelIds).toEqual([]);

    const legacyRow = normalizeEligibility({
      age_mode: null, age_category_ids: null, gender_categories: null, level_ids: null,
    });
    expect(legacyRow).toEqual({ ageMode: null, ageCategoryIds: [], genderCategories: [], levelIds: [] });
  });

  it('legacy registration rows allow a NULL eligibility snapshot (schema/domain)', () => {
    const sql = migrationSql();
    expect(sql).toContain('ADD COLUMN `eligibility_snapshot` json DEFAULT NULL');
  });
});

describe('G7-A Tournament Eligibility — age mode + categories', () => {
  it('age mode serializes and deserializes correctly', () => {
    expect(normalizeAgeMode('open')).toBe('open');
    expect(normalizeAgeMode('categories')).toBe('categories');
    expect(normalizeAgeMode('OPEN')).toBeNull();
    expect(normalizeAgeMode(undefined)).toBeNull();

    const roundTrip = serializeEligibilityInput({
      age_mode: 'categories', age_category_ids: [3, 1, 2],
    });
    expect(roundTrip.age_mode).toBe('categories');
    expect(roundTrip.age_category_ids).toEqual([1, 2, 3]);
  });

  it('valid age category ids are accepted by the create/update contracts', () => {
    const parsed = CreateTournamentSchema.parse({
      name: 'T',
      bracket_type_id: 1,
      max_participants: 8,
      start_date: '2026-06-01',
      age_mode: 'categories',
      age_category_ids: [1, 2, 3],
    });
    expect(parsed.age_category_ids).toEqual([1, 2, 3]);
    expect(UpdateTournamentSchema.parse({ age_mode: 'categories', age_category_ids: [4] }).age_category_ids).toEqual([4]);
  });

  it('invalid age category ids are rejected (zero/negative)', () => {
    expect(() => CreateTournamentSchema.parse({ name: 'T', bracket_type_id: 1, max_participants: 8, start_date: '2026-06-01', age_category_ids: [0] })).toThrow();
    expect(() => CreateTournamentSchema.parse({ name: 'T', bracket_type_id: 1, max_participants: 8, start_date: '2026-06-01', age_category_ids: [-1] })).toThrow();
  });

  it('youth categories are represented with only a max age (unbounded below)', () => {
    const youth = TOURNAMENT_AGE_CATEGORY_SEED_DEFINITIONS.filter((c) => c.type === 'youth');
    expect(youth.map((c) => c.slug)).toEqual(['u14', 'u16', 'u18']);
    for (const c of youth) {
      expect(c.min_age).toBeNull();
      expect(c.max_age).toBeGreaterThan(0);
    }
    expect(YOUTH_AGE_CATEGORY_IDS).toEqual([1, 2, 3]);
  });

  it('masters categories are represented with only a min age (unbounded above)', () => {
    const masters = TOURNAMENT_AGE_CATEGORY_SEED_DEFINITIONS.filter((c) => c.type === 'masters');
    expect(masters.map((c) => c.slug)).toEqual(['40_plus', '45_plus', '50_plus', '55_plus']);
    for (const c of masters) {
      expect(c.min_age).toBeGreaterThan(0);
      expect(c.max_age).toBeNull();
    }
    expect(MASTERS_AGE_CATEGORY_IDS).toEqual([4, 5, 6, 7]);
  });
});

describe('G7-A Tournament Eligibility — gender', () => {
  it('gender values are limited to male | female | mixed', () => {
    expect([...TOURNAMENT_GENDER_CATEGORIES]).toEqual(['male', 'female', 'mixed']);
  });

  it('invalid gender values are rejected by the contract', () => {
    expect(() => CreateTournamentSchema.parse({ name: 'T', bracket_type_id: 1, max_participants: 8, start_date: '2026-06-01', gender_categories: ['coed'] })).toThrow();
    expect(() => CreateTournamentSchema.parse({ name: 'T', bracket_type_id: 1, max_participants: 8, start_date: '2026-06-01', gender_categories: ['male', 'unknown'] })).toThrow();
  });

  it('accepts any subset incl. all three', () => {
    expect(CreateTournamentSchema.parse({ name: 'T', bracket_type_id: 1, max_participants: 8, start_date: '2026-06-01', gender_categories: ['male', 'female', 'mixed'] }).gender_categories).toEqual(['male', 'female', 'mixed']);
  });
});

describe('G7-A Tournament Eligibility — level', () => {
  it('references the authoritative seeded player_levels ids (1..5)', () => {
    expect(normalizeReferenceIds([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
    expect(CreateTournamentSchema.parse({ name: 'T', bracket_type_id: 1, max_participants: 8, start_date: '2026-06-01', level_ids: [2, 3] }).level_ids).toEqual([2, 3]);
  });

  it('rejects non-positive level ids and empty level list = open', () => {
    expect(() => CreateTournamentSchema.parse({ name: 'T', bracket_type_id: 1, max_participants: 8, start_date: '2026-06-01', level_ids: [0] })).toThrow();
    const open = CreateTournamentSchema.parse({ name: 'T', bracket_type_id: 1, max_participants: 8, start_date: '2026-06-01' });
    expect(open.level_ids).toBeUndefined();
  });
});

describe('G7-A Tournament Eligibility — deterministic JSON round-trip', () => {
  it('serializes canonically and normalizes back identically', () => {
    const input = { age_mode: 'categories', age_category_ids: [3, 1, 3, 2], gender_categories: ['female', 'male', 'mixed'], level_ids: [5, 3, 5] } as const;
    const stored = {
      age_mode: input.age_mode,
      age_category_ids: stringifyEligibilityColumn(input.age_category_ids),
      gender_categories: stringifyGenderCategories(input.gender_categories),
      level_ids: stringifyEligibilityColumn(input.level_ids),
    };

    expect(stored.age_category_ids).toBe('[1,2,3]');
    expect(stored.level_ids).toBe('[3,5]');
    expect(stored.gender_categories).toBe('["male","female","mixed"]');

    const roundTrip = normalizeEligibility({
      age_mode: stored.age_mode, age_category_ids: stored.age_category_ids,
      gender_categories: stored.gender_categories, level_ids: stored.level_ids,
    });
    expect(roundTrip.ageMode).toBe('categories');
    expect(roundTrip.ageCategoryIds).toEqual([1, 2, 3]);
    expect(roundTrip.genderCategories).toEqual(['male', 'female', 'mixed']);
    expect(roundTrip.levelIds).toEqual([3, 5]);
  });

  it('round-trip is stable across repeated serialization', () => {
    const first = stringifyEligibilityColumn([2, 1, 1]);
    const second = stringifyEligibilityColumn([1, 2]);
    expect(first).toBe(second);
    expect(first).toBe('[1,2]');
  });
});

describe('G7-A migration hygiene', () => {
  it('seed is idempotent (INSERT IGNORE)', () => {
    const sql = migrationSql();
    expect(sql).toContain('INSERT IGNORE INTO `tournament_age_categories`');
  });

  it('migration carries the production-safe marker (guard convention)', () => {
    expect(migrationSql()).toContain('COURTZON_MIGRATION_ENV: PRODUCTION_SAFE');
  });

  it('touches only tournament_* tables (no unrelated schema changes)', () => {
    const sql = migrationSql();
    const tableTouches = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS `([^`]+)`|ALTER TABLE `([^`]+)`/g)].map((m) => m[1] ?? m[2]);
    expect(tableTouches).toEqual(['tournament_age_categories', 'tournaments', 'tournament_registrations']);
  });
});