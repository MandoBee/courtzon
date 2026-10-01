import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentRepository } from '../infrastructure/repositories/tournament.repository.js';

/**
 * G11.14 — repository-level optimistic concurrency + enum-safe match status
 * (unit level; the REAL schema acceptance is covered by the integration spec).
 */

const pool = vi.hoisted(() => ({ execute: vi.fn(async () => [[]]), query: vi.fn(async () => [[]]) }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));

describe('G11.14 tournament repository outcome hardening', () => {
  let tr: TournamentRepository;
  beforeEach(() => { vi.clearAllMocks(); tr = new TournamentRepository(); });

  it('guarded updateStatus: changed concurrently (0 rows) → TOURNAMENT_STATUS_CONFLICT, never unconditional', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    await expect(tr.updateStatus(7, 'completed', undefined, 'running')).rejects.toMatchObject({
      code: ErrorCodes.TOURNAMENT_STATUS_CONFLICT,
    });
    const sql = String((pool.query.mock.calls[0] as any)[0]);
    expect(sql).toContain('WHERE id = ? AND status = ?');
    expect(sql).not.toContain('WHERE id = ?\n');
  });

  it('guarded updateStatus: matching current status → single-row write succeeds', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await tr.updateStatus(7, 'completed', undefined, 'running');
    expect((pool.query.mock.calls[0] as any)[1]).toEqual(['completed', 7, 'running']);
  });

  it('updateMatchStatus: rejects a status outside the DB ENUM with 409', async () => {
    await expect(tr.updateMatchStatus(1, 'disqualified')).rejects.toMatchObject({
      errorCode: 'CONFLICT', code: ErrorCodes.TOURNAMENT_INVALID_STATUS,
    });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('updateMatchStatus: accepts every DB-ENUM value and threads outcome columns', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await tr.updateMatchStatus(1, 'forfeit', 42, 400, 401, 1);
    const [sql, params] = (pool.query.mock.calls[0] as any);
    expect(sql).toContain('winner_id = ?');
    expect(sql).toContain('winner_participant_id = ?');
    expect(params).toEqual(['forfeit', 42, 400, 401, 1, 'forfeit', 1]);
  });
});