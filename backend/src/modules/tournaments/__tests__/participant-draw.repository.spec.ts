import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParticipantDrawRepository } from '../infrastructure/repositories/participant-draw.repository.js';

const pool = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));

const repo = new ParticipantDrawRepository();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Group 6 — FIFO waitlist persistence', () => {
  it('getNextWaitingOrderByTournament computes MAX+1 (monotonic, unique, not array-index)', async () => {
    pool.query.mockResolvedValue([[{ next_order: 4 }]]);
    const next = await repo.getNextWaitingOrderByTournament(1);
    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).toContain('COALESCE(MAX(waiting_order), 0) + 1');
    expect(sql).toContain("status = 'waiting'");
    expect(sql).toContain('tournament_id = ?');
    expect(next).toBe(4);
  });

  it('findWaitlistHead returns the EARLIEST waiting participant (ORDER BY waiting_order ASC)', async () => {
    pool.query.mockResolvedValue([[{ id: 2, tournament_id: 1, status: 'waiting', waiting_order: 1 }]]);
    const head = await repo.findWaitlistHead(1);
    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).toContain("status = 'waiting'");
    expect(sql).toContain('ORDER BY waiting_order ASC, id ASC LIMIT 1');
    expect(head).toMatchObject({ id: 2, waiting_order: 1 });
  });

  it('listWaitingParticipants is FIFO-ordered and never renumbered on read', async () => {
    pool.query.mockResolvedValue([[{ id: 2, tournament_id: 1, status: 'waiting', waiting_order: 1 }]]);
    await repo.listWaitingParticipants(1);
    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).toContain("p.status = 'waiting'");
    expect(sql).toContain('ORDER BY p.waiting_order ASC, p.id ASC');
  });

  it('createParticipant persists waiting_order', async () => {
    pool.query.mockResolvedValue([{ insertId: 5 }]);
    await repo.createParticipant({ tournament_id: 1, registration_id: 3, participant_type: 'individual', status: 'waiting', member_user_ids: [9], waiting_order: 2 });
    const sql = pool.query.mock.calls[0][0] as string;
    const params = pool.query.mock.calls[0][1] as any[];
    expect(sql).toContain('waiting_order');
    expect(params).toContain(2);
  });

  it('updateParticipantStatus supports the withdrawn_after_start lifecycle state', async () => {
    pool.query.mockResolvedValue([{ affectedRows: 1 }]);
    await repo.updateParticipantStatus(7, 'withdrawn_after_start');
    const sql = pool.query.mock.calls[0][0] as string;
    const params = pool.query.mock.calls[0][1] as any[];
    expect(sql).toContain('UPDATE tournament_participants SET status = ?');
    expect(params).toEqual(['withdrawn_after_start', 7]);
  });
});