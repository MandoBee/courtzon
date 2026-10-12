import { describe, it, expect } from 'vitest';
import { CreateTournamentSchema, CompetitionSeedSchema } from '../presentation/tournament.dto.js';

const VALID_SEED = {
  competition_type: 'singles',
  name: 'Male U14',
  age_mode: 'categories',
  age_category_ids: [1],
  gender_categories: ['male'],
  level_ids: [],
};

describe('Phase 4 Step 2 — CompetitionSeedSchema', () => {
  it('accepts a single-gender grouped competition', () => {
    expect(CompetitionSeedSchema.parse(VALID_SEED)).toMatchObject({
      competition_type: 'singles',
      gender_categories: ['male'],
      age_category_ids: [1],
    });
  });

  it('mixed is ONE gender category — never split, never combined with male/female', () => {
    expect(CompetitionSeedSchema.parse({ ...VALID_SEED, gender_categories: ['mixed'] }).gender_categories).toEqual(['mixed']);
    // A broad multi-gender seed is rejected — no competition may merge groups.
    expect(() => CompetitionSeedSchema.parse({ ...VALID_SEED, gender_categories: ['male', 'female'] })).toThrow();
    expect(() => CompetitionSeedSchema.parse({ ...VALID_SEED, gender_categories: [] })).toThrow();
  });

  it('rejects invalid competition types and injected strings', () => {
    expect(() => CompetitionSeedSchema.parse({ ...VALID_SEED, competition_type: 'mixed' })).toThrow();
    expect(() => CompetitionSeedSchema.parse({ ...VALID_SEED, gender_categories: ['coed'] })).toThrow();
  });

  it('level-only (professional) seeds are valid with open age', () => {
    expect(CompetitionSeedSchema.parse({
      competition_type: 'singles',
      name: 'Male Level 2',
      age_mode: 'open',
      age_category_ids: [],
      gender_categories: ['male'],
      level_ids: [2],
    }).level_ids).toEqual([2]);
  });

  it('Step 2A — competition_type is OPTIONAL (omitted → backend inherits its resolved default format)', () => {
    const seed = CompetitionSeedSchema.parse({
      name: 'Male U14',
      age_mode: 'categories',
      age_category_ids: [1],
      gender_categories: ['male'],
      level_ids: [],
    });
    expect(seed.competition_type).toBeUndefined();
  });

  it('CreateTournamentSchema accepts a bounded competitions list', () => {
    const parsed = CreateTournamentSchema.parse({
      bracket_type_id: 1,
      format: 'knockout',
      name: 'T',
      max_participants: 8,
      start_date: '2026-06-01',
      competitions: [VALID_SEED, { ...VALID_SEED, name: 'Female U14', gender_categories: ['female'] }],
    });
    expect(parsed.competitions?.length).toBe(2);
  });

  it('Step 2B — generate_competitions is an optional boolean (explicit split request)', () => {
    expect(CreateTournamentSchema.parse({
      bracket_type_id: 1,
      format: 'knockout',
      name: 'T',
      max_participants: 8,
      start_date: '2026-06-01',
      generate_competitions: true,
    }).generate_competitions).toBe(true);
    // Legacy clients omit it entirely.
    expect(CreateTournamentSchema.parse({
      bracket_type_id: 1,
      format: 'knockout',
      name: 'T2',
      max_participants: 8,
      start_date: '2026-06-01',
    }).generate_competitions).toBeUndefined();
  });

  it('CreateTournamentSchema rejects an oversized competitions list', () => {
    const many = Array.from({ length: 61 }, (_, i) => ({ ...VALID_SEED, name: `C${i}` }));
    expect(() => CreateTournamentSchema.parse({
      bracket_type_id: 1,
      format: 'knockout',
      name: 'T',
      max_participants: 8,
      start_date: '2026-06-01',
      competitions: many,
    })).toThrow();
  });
});