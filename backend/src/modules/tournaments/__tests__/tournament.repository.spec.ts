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
    expect(params[28]).toBe('2026-10-01'); // 0-based index of start_date (after the Group 3 registration_payment_methods column)
  });

  it('serialises the Group 3 registration_payment_methods allowlist into the JSON column', async () => {
    await repo.create(minimalData({ registration_payment_methods: ['cash', 'card'] }) as any);

    const params = pool.query.mock.calls[0][1] as any[];
    expect(params[21]).toBe('["cash","card"]'); // 0-based index of registration_payment_methods (after price_type)
    expect(pool.query.mock.calls[0][0] as string).toContain('registration_payment_methods');
  });

  it('writes NULL registration_payment_methods when the allowlist is absent (backward compatible)', async () => {
    await repo.create(minimalData() as any);

    const params = pool.query.mock.calls[0][1] as any[];
    expect(params[21]).toBeNull();
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

  it('returns bracket_type_name from the authoritative bracket type relationship', async () => {
    pool.query.mockResolvedValue([[{
      id: 3, name: 'Single Elim Cup', bracket_type_id: 2, max_participants: 8,
      tournament_type: 'community', sport_name: null, organisation_name: null,
      bracket_type_name: 'Single Elimination', max_players: 8, type: 'community',
      registration_deadline: null,
    }]]);

    const row = await repo.findByIdDetailed(3);
    expect(row.bracket_type_name).toBe('Single Elimination');
  });
});

describe('TournamentRepository.list — player list contract (sport_name + bracket_type_name)', () => {
  it('SELECT includes sport_name and bracket_type_name via LEFT JOINs', async () => {
    pool.query.mockResolvedValue([[], [{ total: 0 }]]);
    await repo.list({ page: 1, limit: 10 });
    const sql = pool.query.mock.calls[1][0] as string;
    expect(sql).toContain('s.name AS sport_name');
    expect(sql).toContain('bt.name AS bracket_type_name');
    expect(sql).toContain('LEFT JOIN sports s ON s.id = t.sport_id');
    expect(sql).toContain('LEFT JOIN tournament_bracket_types bt ON bt.id = t.bracket_type_id');
    expect(sql).toContain('o.name AS organisation_name');
    expect(sql).toContain('t.max_participants AS max_players');
  });

  it('listForOrg includes the same display aliases with tenant isolation preserved', async () => {
    pool.query.mockResolvedValue([[], [{ total: 0 }]]);
    await repo.listForOrg(1001, { page: 1, limit: 10 });
    const countSql = pool.query.mock.calls[0][0] as string;
    const listSql = pool.query.mock.calls[1][0] as string;
    expect(countSql).toContain('t.organisation_id = ?');
    expect(listSql).toContain('s.name AS sport_name');
    expect(listSql).toContain('bt.name AS bracket_type_name');
    expect(listSql).toContain('t.organisation_id = ?');
  });
});

describe('TournamentRepository registrations — authoritative column usage', () => {
  it('findRegistrationsByTournament orders by seed_rank (not the non-existent seed column)', async () => {
    pool.query.mockResolvedValue([[{ id: 1, player_id: 5, seed_rank: 2 }]]);
    await repo.findRegistrationsByTournament(7);
    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY r.seed_rank');
    expect(sql).not.toContain('ORDER BY seed');
    expect(sql).toContain('u.full_name AS player_name');
  });

  it('findRegistrationsByPlayer filters on player_id (not the non-existent user_id)', async () => {
    pool.query.mockResolvedValue([[{ id: 1, player_id: 5 }]]);
    await repo.findRegistrationsByPlayer(5);
    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).toContain('WHERE r.player_id = ?');
    expect(sql).not.toContain('user_id');
  });

  it('updateRegistrationStatus never writes to a non-existent confirmed_at column', async () => {
    pool.query.mockResolvedValue([{ affectedRows: 1 }]);
    await repo.updateRegistrationStatus(1, 'confirmed');
    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).not.toContain('confirmed_at');
    expect(sql).toContain('status = ?');

    pool.query.mockClear();
    await repo.updateRegistrationStatus(1, 'withdrawn');
    const withdrawSql = pool.query.mock.calls[0][0] as string;
    expect(withdrawSql).toContain('cancelled_at = NOW()');
  });
});

describe('TournamentRepository.findMatchesDetailed — admin/org match table contract', () => {
  it('joins player/resource/referee names for display', async () => {
    pool.query.mockResolvedValue([[]]);
    await repo.findMatchesDetailed(9);
    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).toContain('p1.full_name AS player1_name');
    expect(sql).toContain('p2.full_name AS player2_name');
    expect(sql).toContain('r.name AS resource_name');
    expect(sql).toContain('refu.full_name AS referee_name');
    expect(sql).toContain('m.status AS shared_status');
  });
});

describe('TournamentRepository.getStandings — player name enrichment', () => {
  it('joins user full_name as player_name', async () => {
    pool.query.mockResolvedValue([[]]);
    await repo.getStandings(4);
    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).toContain('u.full_name AS player_name');
    expect(sql).toContain('ORDER BY s.rank_position ASC');
  });
});

describe('TournamentRepository — structured prizes (Group 2)', () => {
  it('findPrizesByTournament orders by display_order then id', async () => {
    pool.query.mockResolvedValue([[{ id: 1, tournament_id: 4, placement: 1, prize_type: 'cash', amount: 100, currency_code: 'USD', display_order: 0 }]]);
    const rows = await repo.findPrizesByTournament(4);
    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).toContain('FROM tournament_prizes');
    expect(sql).toContain('WHERE tournament_id = ?');
    expect(sql).toContain('ORDER BY display_order ASC, id ASC');
    expect(rows).toHaveLength(1);
  });

  it('replacePrizes deletes then inserts every prize in order', async () => {
    pool.query.mockResolvedValue([{ affectedRows: 0 }]);
    await repo.replacePrizes(4, [
      { placement: 1, prize_type: 'cash', amount: 1000, currency_code: 'USD', display_order: 0 },
      { placement: 2, prize_type: 'silver', description: 'Silver', display_order: 1 },
    ]);
    expect(pool.query.mock.calls[0][0]).toContain('DELETE FROM tournament_prizes WHERE tournament_id = ?');
    expect(pool.query).toHaveBeenCalledTimes(3); // 1 delete + 2 inserts
    const insertSql = pool.query.mock.calls[1][0] as string;
    expect(insertSql).toContain('INSERT INTO tournament_prizes');
    const insertParams = pool.query.mock.calls[1][1] as any[];
    expect(insertParams[0]).toBe(4);
    expect(insertParams[2]).toBe('cash');
    expect(insertParams[4]).toBe(1000);
    expect(insertParams[5]).toBe('USD');
  });

  it('replacePrizes defaults display_order to array index when omitted', async () => {
    pool.query.mockResolvedValue([{ affectedRows: 0 }]);
    await repo.replacePrizes(4, [
      { placement: 1, prize_type: 'trophy' },
      { placement: null, prize_type: 'gift', description: 'Special' },
    ]);
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect((pool.query.mock.calls[1][1] as any[])[6]).toBe(0);
    expect((pool.query.mock.calls[2][1] as any[])[6]).toBe(1);
  });
});