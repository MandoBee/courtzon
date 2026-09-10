import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

const executed = vi.hoisted(() => [] as string[]);
const results = vi.hoisted(() => ({
  insertId: 1,
  affectedRows: 1,
  rows: [] as any[],
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: async (sql: string, params: any[] = []) => {
      executed.push(sql);
      if (sql.trimStart().startsWith('INSERT')) return [{ insertId: results.insertId }, []];
      if (sql.includes('WHERE id = ? AND submission_status')) return [{ affectedRows: results.affectedRows }, []];
      if (sql.includes('SELECT COUNT')) return [[{ c: results.rows.length }], []];
      if (sql.includes('SELECT id FROM match_participants')) return [[results.rows], []];
      return [results.rows, []];
    },
    getConnection: async () => ({
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      execute: async () => [[], []],
    }),
  }),
}));

import { matchResultRepository } from '../infrastructure/match-result.repository.js';

beforeEach(() => {
  executed.length = 0;
  results.rows = [];
});

describe('C4 — final_result persisted on insert', () => {
  it('includes the final_result column in the INSERT', async () => {
    await matchResultRepository.insert({
      matchId: 1, sportId: 22, formatId: 1, ruleSetId: 1, rulesSnapshot: { score_structure: 'sets' },
      matchType: 'public', playedAt: '2026-09-01 10:00:00', branchId: null, resourceId: null, timezone: null,
      participantPayload: [], rawResult: { outcome: 'completed' }, finalResult: { winner: 'home', scoreSummary: '2-0', sideOutcomes: { home: 'win', away: 'loss' }, sideEvidence: { home: 100, away: 0 } },
      outcome: 'completed', submissionStatus: 'pending_confirmation', submittedBy: 5, submittedAt: '2026-09-01 11:00:00',
      submissionDeadlineAt: '2026-09-04 10:00:00', autoApprovalDeadlineAt: '2026-09-04 11:00:00',
    });
    expect(executed.some((sql) => sql.includes('final_result'))).toBe(true);
  });
});

describe('C6 — authoritative played_at from sessions only', () => {
  it('getMatchContext does NOT fall back to booking time', async () => {
    await matchResultRepository.getMatchContext(1);
    const sql = executed[0];
    expect(sql).toContain('FROM match_sessions');
    expect(sql).not.toContain('b.end_at_utc');
    expect(sql).not.toContain('b.start_at_utc');
  });
});

describe('C5 — no-result worker covers every eligible status', () => {
  it('matches all four eligible statuses and uses session time only', async () => {
    await matchResultRepository.findExpiredNoResultMatches('2026-09-10 00:00:00');
    const sql = executed[0];
    for (const status of ['full', 'closed', 'in_progress', 'completed']) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).toContain('FROM match_sessions');
    expect(sql).not.toContain('b.end_at_utc');
  });
});

describe('C8 — concurrency-safe approval UPDATE', () => {
  it('only transitions rows still pending_confirmation', async () => {
    const ok = await matchResultRepository.approvePending(1, { submission_status: 'approved', auto_approved: true });
    expect(ok).toBe(true);
    expect(executed[0]).toContain("submission_status = 'pending_confirmation'");
  });

  it('reports failure when zero rows are affected', async () => {
    results.affectedRows = 0;
    const ok = await matchResultRepository.approvePending(1, { submission_status: 'approved' });
    expect(ok).toBe(false);
  });
});