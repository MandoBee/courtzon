import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
  process.env.DB_HOST = 'localhost';
  process.env.DB_PORT = '3306';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = '';
  process.env.DB_NAME = 'courtzon_test';
});

const busEmit = vi.hoisted(() => vi.fn());
const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  updateStatus: vi.fn(),
  findEligibleDiscoveryAudience: vi.fn(),
}));
const pool = vi.hoisted(() => ({
  execute: vi.fn(async () => [[]]),
  query: vi.fn(async () => [[]]),
  getConnection: vi.fn(async () => pool),
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(),
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit: busEmit } }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));

import {
  resolveDiscoveryAgeFilter,
  resolveDiscoveryGenderFilter,
  buildDiscoveryAudienceSql,
  type DiscoveryAgeFilter,
} from '../domain/tournament-eligibility.js';
import { tournamentService } from '../application/tournament.service.js';

const YOUTH = (maxAge: number[]): Array<{ type: 'youth'; min_age: null; max_age: number }> =>
  maxAge.map((m) => ({ type: 'youth' as const, min_age: null, max_age: m }));
const MASTERS = (minAge: number[]): Array<{ type: 'masters'; min_age: number; max_age: null }> =>
  minAge.map((m) => ({ type: 'masters' as const, min_age: m, max_age: null }));

describe('G7-C AGE discovery filter (YEAR-only)', () => {
  it('5. open age → no age filter', () => {
    expect(resolveDiscoveryAgeFilter([], 2026)).toEqual({ active: false });
    expect(resolveDiscoveryAgeFilter(YOUTH([]), 2026)).toEqual({ active: false });
  });

  it('6. U14 boundary → birth_year >= 2012', () => {
    const f = resolveDiscoveryAgeFilter(YOUTH([14]), 2026);
    expect(f).toEqual({ active: true, relation: 'ge', value: 2012 });
  });

  it('7. U14 mismatch (birth 2011) is excluded by the bound', () => {
    const { sql, params } = buildDiscoveryAudienceSql({ sportId: 1, age: resolveDiscoveryAgeFilter(YOUTH([14]), 2026) as DiscoveryAgeFilter, gender: { active: false }, branchId: null });
    expect(sql).toContain('YEAR(u.birth_date) >= ?');
    expect(params).toContain(2012);
    // 2011 < 2012 → excluded; predicate is set-level, no per-user filtering.
  });

  it('8. U16/U18 multiple categories → OR (highest max wins — still a single bound)', () => {
    const f = resolveDiscoveryAgeFilter(YOUTH([16, 18]), 2026);
    expect(f).toEqual({ active: true, relation: 'ge', value: 2008 });
  });

  it('9. Masters 40/45/50 → OR (lowest min wins)', () => {
    const f = resolveDiscoveryAgeFilter(MASTERS([40, 45, 50]), 2026);
    expect(f).toEqual({ active: true, relation: 'le', value: 1986 });
  });

  it('10. missing birth date is excluded for restricted age (predicate requires birth_date)', () => {
    const { sql } = buildDiscoveryAudienceSql({ sportId: 1, age: { active: true, relation: 'ge', value: 2012 }, gender: { active: false }, branchId: null });
    expect(sql).toContain('u.birth_date IS NOT NULL');
  });

  it('11/12. tournament-year calculation + month/day independence (uses YEAR only)', () => {
    // A different year shifts the bound by exactly the tournament year.
    const f2026 = resolveDiscoveryAgeFilter(YOUTH([14]), 2026);
    const f2040 = resolveDiscoveryAgeFilter(YOUTH([14]), 2040);
    expect(f2026).toEqual({ active: true, relation: 'ge', value: 2012 });
    expect(f2040).toEqual({ active: true, relation: 'ge', value: 2026 });
    const { sql } = buildDiscoveryAudienceSql({ sportId: 1, age: f2026, gender: { active: false }, branchId: null });
    expect(sql).toContain('YEAR(u.birth_date)'); // never month/day
  });
});

describe('G7-C GENDER discovery filter', () => {
  it('13. male only → female excluded', () => {
    expect(resolveDiscoveryGenderFilter(['male'])).toEqual({ active: true, value: 'male' });
  });
  it('14. female only → male excluded', () => {
    expect(resolveDiscoveryGenderFilter(['female'])).toEqual({ active: true, value: 'female' });
  });
  it('15. mixed → both male and female', () => {
    expect(resolveDiscoveryGenderFilter(['mixed'])).toEqual({ active: false });
  });
  it('16. multi-selection male+female (or with mixed) → no gender filter', () => {
    expect(resolveDiscoveryGenderFilter(['male', 'female'])).toEqual({ active: false });
    expect(resolveDiscoveryGenderFilter(['female', 'mixed'])).toEqual({ active: false });
  });
  it('18. unrestricted (empty) → no gender filter', () => {
    expect(resolveDiscoveryGenderFilter([])).toEqual({ active: false });
  });
});

describe('G7-C BRANCH discovery filter', () => {
  it('19. matching branch → EXISTS predicate on user_branches', () => {
    const { sql, params } = buildDiscoveryAudienceSql({ sportId: 1, age: { active: false }, gender: { active: false }, branchId: 5 });
    expect(sql).toContain('EXISTS (SELECT 1 FROM user_branches ub2 WHERE ub2.user_id = u.id AND ub2.branch_id = ?)');
    expect(params).toContain(5);
  });
  it('20/21. no branch / platform-wide → no branch filter', () => {
    const { sql } = buildDiscoveryAudienceSql({ sportId: 1, age: { active: false }, gender: { active: false }, branchId: null });
    expect(sql).not.toContain('user_branches');
  });
});

describe('G7-C LEVEL exclusion (mandatory regression)', () => {
  it('22. player LEVEL is NEVER a discovery predicate (Advanced-only tournament reaches Intermediate player)', () => {
    const { sql } = buildDiscoveryAudienceSql({
      sportId: 1,
      age: { active: false },
      gender: { active: false },
      branchId: null,
    });
    expect(sql).not.toMatch(/player_levels|main_level_id/);
  });
});

describe('G7-C SPORT base + combinations + legacy SQL shape', () => {
  it('1/2/4/32. sport base uses interests ∪ main_sport with DISTINCT (no duplicates)', () => {
    const { sql } = buildDiscoveryAudienceSql({ sportId: 9, age: { active: false }, gender: { active: false }, branchId: null });
    expect(sql).toContain('SELECT DISTINCT u.id');
    expect(sql).toContain('player_sport_interests WHERE sport_id = ?');
    expect(sql).toContain('player_profiles WHERE main_sport_id = ?');
  });

  it('23-27. combined age+gender+branch builds all three predicates', () => {
    const { sql } = buildDiscoveryAudienceSql({
      sportId: 1,
      age: { active: true, relation: 'ge', value: 2012 },
      gender: { active: true, value: 'male' },
      branchId: 3,
    });
    expect(sql).toContain('YEAR(u.birth_date) >= ?');
    expect(sql).toContain('u.gender = ?');
    expect(sql).toContain('user_branches');
    expect(sql).toContain(' AND ');
  });

  it('29. legacy NULL eligibility → open age + unrestricted gender (same audience as before)', () => {
    const { sql } = buildDiscoveryAudienceSql({ sportId: 1, age: { active: false }, gender: { active: false }, branchId: null });
    expect(sql).not.toContain('birth_date');
    expect(sql).not.toContain('gender');
    expect(sql).not.toContain('user_branches');
    expect(sql).not.toMatch(/player_levels|main_level_id/);
  });
});

describe('G7-C service discovery behavior (visibility + audience usage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findById.mockResolvedValue({
      id: 1, start_date: '2026-06-01', status: 'published', sport_id: 9, is_public: 1,
      max_participants: 16, min_participants: 2, entry_fee: 0, currency_code: 'USD',
      registration_payment_methods: null,
    });
    repo.updateStatus.mockResolvedValue(undefined);
    repo.findEligibleDiscoveryAudience.mockResolvedValue([11, 22]);
  });

  it('30. private/unlisted tournament does not send discovery notifications', async () => {
    repo.findById.mockResolvedValue({ id: 1, start_date: '2026-06-01', status: 'published', sport_id: 9, is_public: 0, max_participants: 16, min_participants: 2, entry_fee: 0, currency_code: 'USD', registration_payment_methods: null });
    await tournamentService.publish(1);
    expect(repo.findEligibleDiscoveryAudience).not.toHaveBeenCalled();
    expect(busEmit).not.toHaveBeenCalledWith('tournament:registration-open', expect.anything(), expect.anything());
  });

  it('33/34 public tournament reaches the audience through the SAME event (preferences stay in NotificationEngine)', async () => {
    await tournamentService.publish(1);
    expect(repo.findEligibleDiscoveryAudience).toHaveBeenCalledWith(expect.objectContaining({ sport_id: 9 }));
    expect(busEmit).toHaveBeenCalledWith('tournament:registration-open', expect.objectContaining({ tournamentId: 1, userId: 11 }), expect.anything());
    expect(busEmit).toHaveBeenCalledWith('tournament:registration-open', expect.objectContaining({ tournamentId: 1, userId: 22 }), expect.anything());
  });

  it('additive eligibility context is carried on the event without sensitive data', async () => {
    repo.findById.mockResolvedValue({ id: 1, start_date: '2026-06-01', status: 'published', sport_id: 9, is_public: 1, age_mode: 'categories', age_category_ids: [1], gender_categories: ['male'], level_ids: [3], branch_id: 5, max_participants: 16, min_participants: 2, entry_fee: 0, currency_code: 'USD', registration_payment_methods: null });
    await tournamentService.publish(1);
    expect(busEmit).toHaveBeenCalledWith('tournament:registration-open', expect.objectContaining({ ageMode: 'categories', ageCategoryIds: [1], genderCategories: ['male'], branchId: 5 }), expect.anything());
  });
});