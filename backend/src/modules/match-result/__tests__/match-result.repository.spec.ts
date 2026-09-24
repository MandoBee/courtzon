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
    query: async (sql: string, params: any[] = []) => {
      executed.push(sql);
      if (sql.includes('SELECT COUNT')) return [[{ c: results.rows.length }], []];
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

describe('C6 — authoritative played_at from sessions OR scheduled end', () => {
  it('getMatchContext falls back to the authoritative booking end_at_utc once the scheduled end passed', async () => {
    await matchResultRepository.getMatchContext(1);
    const sql = executed[0];
    expect(sql).toContain('FROM match_sessions');
    // The lifecycle fix: a real match that never recorded a session still gets
    // a real played_at = bookings.end_at_utc once the scheduled end is reached,
    // so result processing can proceed. Both sources are preserved.
    expect(sql).toContain('b.end_at_utc');
    expect(sql).toContain('UTC_TIMESTAMP()');
    expect(sql).toContain('COALESCE');
  });
});

describe('C5 — no-result worker covers every eligible status', () => {
  it('matches all four eligible statuses and applies the booking-end fallback', async () => {
    await matchResultRepository.findExpiredNoResultMatches('2026-09-10 00:00:00');
    const sql = executed[0];
    for (const status of ['full', 'closed', 'in_progress', 'completed']) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).toContain('FROM match_sessions');
    // The T1 race fix: the worker must use the SAME authoritative played_at as
    // getMatchContext — a no-session match cannot otherwise ever be marked
    // No Result. Assert the fallback is present (not that it is absent).
    expect(sql).toContain('b.end_at_utc');
    expect(sql).toContain('UTC_TIMESTAMP()');
    expect(sql).toContain('COALESCE');
  });

  it('respects the 3-day submission window: does not mark a recently played match No Result', async () => {
    // Regression: findExpiredNoResultMatches must NOT pick up a match whose
    // played_at is within the 72h submission window — otherwise the hourly
    // worker pre-populates `no_result` and blocks manual result entry.
    await matchResultRepository.findExpiredNoResultMatches('2026-09-17 12:00:00');
    const sql = executed[0];
    expect(sql).toContain('DATE_SUB(');
    expect(sql).toContain('INTERVAL 72 HOUR');
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

describe('Org portal result moderation — tenant isolation', () => {
  it('listForOrg always scopes a result to bookings.organisation_id', async () => {
    await matchResultRepository.listForOrg(28, { status: 'disputed', limit: 20, offset: 0 });
    // executed[0] = COUNT, executed[1] = data SELECT — both share the JOIN.
    const sql = executed[1];
    expect(sql).toContain('JOIN bookings b ON b.id = m.booking_id');
    expect(sql).toContain('b.organisation_id = ?');
    expect(sql).toContain("r.submission_status = ?");
    expect(sql).toContain('ORDER BY r.updated_at DESC');
  });

  it('listForOrg without a status filter only pins the org', async () => {
    await matchResultRepository.listForOrg(28, {});
    const sql = executed[0];
    expect(sql).toContain('b.organisation_id = ?');
    expect(sql).not.toContain('submission_status');
  });

  it('getResultOrgId resolves the tenant id of a result record', async () => {
    results.rows = [{ organisation_id: 28 }];
    const orgId = await matchResultRepository.getResultOrgId(99);
    expect(orgId).toBe(28);
    const sql = executed[0];
    expect(sql).toContain('JOIN bookings b ON b.id = m.booking_id');
    expect(sql).toContain('WHERE r.id = ?');
  });
});

describe('Group 3 — deterministic participant ordering feeds the legacy side fallback', () => {
  it('getMatchContext orders match_participants by joined_at, id', async () => {
    results.rows = [{
      match_id: 1, sport_id: 22, status: 'closed', format_id: null, format_snapshot: null,
      rule_set_id: null, rule_snapshot: null, branch_id: null, resource_id: null,
      end_at_utc: null, timezone: null, tournament_id: null, stage_id: null,
    }];
    await matchResultRepository.getMatchContext(1);
    const partSql = executed.find((s) => s.includes('FROM match_participants') && s.includes('WHERE match_id'));
    expect(partSql).toMatch(/ORDER BY\s+joined_at,\s*id/);
  });

  it('findExpiredNoResultMatches orders match_participants by joined_at, id', async () => {
    results.rows = [{
      match_id: 1, sport_id: 22, format_id: null, rule_set_id: null, rule_snapshot: null,
      branch_id: null, resource_id: null, timezone: null,
    }];
    await matchResultRepository.findExpiredNoResultMatches('2026-09-10 00:00:00');
    const partSql = executed.find((s) => s.includes('FROM match_participants') && s.includes('WHERE match_id'));
    expect(partSql).toMatch(/ORDER BY\s+joined_at,\s*id/);
  });
});