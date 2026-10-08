import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TournamentRepository } from '../infrastructure/repositories/tournament.repository.js';

const pool = vi.hoisted(() => ({ query: vi.fn(async () => [[]]) }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));

const repo = new TournamentRepository();

const ROW = {
  id: 101,
  tournament_id: 1,
  match_id: 900,
  stage_id: 2,
  group_id: 3,
  round: 1,
  round_name: 'Round 1',
  match_number: 4,
  bracket_position: 0,
  player1_id: 10,
  player2_id: 20,
  participant1_id: 100,
  participant2_id: 200,
  status: 'scheduled',
  progression_state: 'pending',
  progression_meta: { is_bracket: true },
  start_time: '2026-10-10T09:00:00.000Z',
  end_time: '2026-10-10T10:15:00.000Z',
  score_summary: null,
  shared_status: 'open',
  format_snapshot: { formatType: 'singles' },
  rule_snapshot: { score_structure: 'sets' },
  booking_id: 77,
  player1_name: 'Ali',
  player2_name: 'Sara',
  participant1_name: null,
  participant2_name: null,
  resource_name: 'Court A',
  referee_name: 'Ref 1',
  stage_name: 'Knockout',
  stage_order: 2,
  stage_progression_format: 'knockout',
  group_name: 'B',
  result_id: 55,
  result_status: 'pending_confirmation',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findMatchesDetailed — canonical match contract (repository)', () => {
  it('preserves the single-query shape (no N+1, no in-memory filtering, no pagination)', async () => {
    pool.query.mockResolvedValue([[]]);
    await repo.findMatchesDetailed(7);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(params).toEqual([7]);
    expect(sql).toContain('WHERE tm.tournament_id = ?');
    // No top-level pagination — the query ends with the canonical sort (LIMIT only appears inside the scalar result subqueries).
    expect(/ORDER BY tm\.round, tm\.bracket_position\s*$/.test(sql.trim())).toBe(true);
  });

  it('keeps existing joins + adds stage/group context and result state (additive only)', async () => {
    pool.query.mockResolvedValue([[]]);
    await repo.findMatchesDetailed(7);
    const sql = String(pool.query.mock.calls[0][0]);
    // existing joins preserved
    expect(sql).toContain('m.status AS shared_status');
    expect(sql).toContain('r.name AS resource_name');
    expect(sql).toContain('refu.full_name AS referee_name');
    // additive stage/group joins
    expect(sql).toContain('LEFT JOIN tournament_stages st ON st.id = tm.stage_id');
    expect(sql).toContain('LEFT JOIN tournament_groups g ON g.id = tm.group_id');
    // additive result state (scalar subqueries — cannot multiply rows)
    expect(sql).toContain('(SELECT r1.id FROM match_result_records r1 WHERE r1.match_id = tm.match_id ORDER BY r1.id DESC LIMIT 1) AS result_id');
    expect(sql).toContain('(SELECT r2.submission_status FROM match_result_records r2 WHERE r2.match_id = tm.match_id ORDER BY r2.id DESC LIMIT 1) AS result_status');
  });

  it('round-trips existing fields unchanged plus the new canonical fields', async () => {
    pool.query.mockResolvedValue([[ROW]]);
    const rows = await repo.findMatchesDetailed(1);
    expect(rows).toHaveLength(1);
    const m = rows[0];
    // existing contract preserved
    expect(m).toMatchObject({
      id: 101, tournament_id: 1, match_id: 900, round: 1, match_number: 4,
      status: 'scheduled', progression_state: 'pending',
      player1_id: 10, player2_id: 20, participant1_id: 100, participant2_id: 200,
      shared_status: 'open', booking_id: 77,
      player1_name: 'Ali', player2_name: 'Sara', resource_name: 'Court A', referee_name: 'Ref 1',
      score_summary: null, start_time: '2026-10-10T09:00:00.000Z', end_time: '2026-10-10T10:15:00.000Z',
    });
    // new canonical fields
    expect(m).toMatchObject({
      stage_id: 2, group_id: 3, stage_name: 'Knockout', stage_order: 2,
      stage_progression_format: 'knockout', group_name: 'B',
      result_id: 55, result_status: 'pending_confirmation',
    });
  });
});