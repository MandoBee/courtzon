import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TournamentRepository } from '../infrastructure/repositories/tournament.repository.js';

const pool = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));

const repo = new TournamentRepository();

beforeEach(() => {
  vi.clearAllMocks();
  pool.query.mockResolvedValue([{ insertId: 1 }]);
});

function minimalData(overrides: Record<string, unknown> = {}) {
  return {
    creator_id: 1,
    organisation_id: undefined,
    branch_id: undefined,
    bracket_type_id: 1,
    format: 'knockout',
    category: undefined,
    season: undefined,
    sport_id: 22,
    match_format_id: 1,
    rule_set_id: 1,
    name: 'UAT Padel',
    code: undefined,
    description: undefined,
    tournament_type: 'platform',
    max_participants: 16,
    max_teams: undefined,
    min_participants: 2,
    entry_fee: 800,
    registration_fee: undefined,
    currency_code: 'AED',
    price_type: 'FIXED',
    commission_rate: 0,
    prize_description: undefined,
    status: 'draft',
    is_public: true,
    registration_opens: undefined,
    registration_closes: undefined,
    start_date: '2026-10-01',
    end_date: '2026-10-05',
    rules: undefined,
    is_featured: false,
    image_url: undefined,
    ...overrides,
  };
}

describe('TournamentRepository.create — NOT NULL contract (UAT blocker regression)', () => {
  it('coalesces an omitted registration_fee to 0 (never NULL against a NOT NULL column)', async () => {
    await repo.create(minimalData() as any);

    const params = pool.query.mock.calls[0][1] as any[];
    expect(params[18]).toBe(0); // 0-based index of registration_fee in the INSERT
  });

  it('passes a supplied registration_fee through unchanged', async () => {
    await repo.create(minimalData({ registration_fee: 25 }) as any);

    const params = pool.query.mock.calls[0][1] as any[];
    expect(params[18]).toBe(25);
  });

  it('binds a valid start_date (NOT NULL) and never NULL for it', async () => {
    await repo.create(minimalData() as any);

    const params = pool.query.mock.calls[0][1] as any[];
    expect(params[27]).toBe('2026-10-01'); // 0-based index of start_date
  });
});

describe('TournamentRepository.findByIdDetailed — management detail shape', () => {
  it('returns the raw row enriched with sport_name / organisation_name / max_players / type', async () => {
    pool.query.mockResolvedValue([[{
      id: 1, name: 'Padel Test Tournament', sport_id: 22, max_participants: 16,
      tournament_type: 'platform', sport_name: 'Padel', organisation_name: null,
      max_players: 16, type: 'platform', registration_deadline: null,
    }]]);

    const row = await repo.findByIdDetailed(1);
    expect(row.sport_name).toBe('Padel');
    expect(row.max_players).toBe(16);
    expect(row.type).toBe('platform');
    expect(row.max_participants).toBe(16);
  });

  it('resolves organisation_name for org-owned tournaments', async () => {
    pool.query.mockResolvedValue([[{
      id: 2, name: 'Org Cup', organisation_id: 1001, sport_id: null,
      tournament_type: 'platform', sport_name: null, organisation_name: 'Padel Edge',
      max_players: 16, type: 'platform', registration_deadline: null,
    }]]);

    const row = await repo.findByIdDetailed(2);
    expect(row.organisation_name).toBe('Padel Edge');
  });
});