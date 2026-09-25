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
  participantRows: [] as any[],
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
      if (sql.includes('FROM match_result_participants p')) return [results.participantRows, []];
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
  results.participantRows = [];
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

describe('Group 4 — result read model display data (one shared composition)', () => {
  function recordRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 1, match_id: 42, sport_id: 22, format_id: 1, rule_set_id: 1,
      rules_snapshot: JSON.stringify({ score_structure: 'sets', draw_allowed: false, terminations: [] }),
      match_type: 'public', played_at: '2026-09-01 10:00:00', branch_id: 3, resource_id: 9,
      tournament_id: null, academy_id: null, timezone: 'UTC',
      participant_payload: JSON.stringify([{ userId: 5, side: 'home', teamIndex: 0 }, { userId: 6, side: 'away', teamIndex: 1 }]),
      raw_result: JSON.stringify({ outcome: 'completed' }),
      final_result: JSON.stringify({ winner: 'home', scoreSummary: '2-0', sideOutcomes: { home: 'win', away: 'loss' }, sideEvidence: { home: 100, away: 0 } }),
      outcome: 'completed', submission_status: 'approved', submitted_by: 5, submitted_at: '2026-09-01 11:00:00',
      accepted_by: 6, accepted_at: '2026-09-01 12:00:00', auto_approved: 0, disputed_by: null, disputed_at: null,
      dispute_reason: null, resolved_by: null, resolved_at: null, resolution_note: null,
      submission_deadline_at: '2026-09-04 10:00:00', auto_approval_deadline_at: '2026-09-04 11:00:00',
      evidence_counted: 1, rating_applied_at: '2026-09-01 12:00:00', created_at: '2026-09-01 11:00:00', updated_at: '2026-09-01 12:00:00',
      sport_name: 'Padel', sport_icon: '/uploads/sport/icon/padel.webp',
      format_name: 'Padel Standard', format_type: 'doubles', players_per_side: 2,
      branch_name: 'MASPIRO', organisation_id: 7, organisation_name: 'Org One', resource_name: 'Court 1',
      tournament_id_display: null, tournament_name: null, round: null, round_name: null, stage_id: null, stage_name: null,
      ...overrides,
    };
  }

  it('listForAdmin enriches records with sport/format/venue/tournament joins', async () => {
    await matchResultRepository.listForAdmin({ status: 'disputed', limit: 20, offset: 0 });
    const sql = executed[1];
    expect(sql).toContain('LEFT JOIN sports s ON s.id = r.sport_id');
    expect(sql).toContain('LEFT JOIN sport_formats sf ON sf.id = r.format_id');
    expect(sql).toContain('LEFT JOIN branches br ON br.id = r.branch_id');
    expect(sql).toContain('LEFT JOIN organisations org ON org.id = br.organisation_id');
    expect(sql).toContain('LEFT JOIN resources res ON res.id = r.resource_id');
    expect(sql).toContain('LEFT JOIN tournament_matches tm ON tm.match_id = r.match_id');
    expect(sql).toContain('LEFT JOIN tournaments t ON t.id = COALESCE(r.tournament_id, tm.tournament_id)');
    expect(sql).toContain('LEFT JOIN tournament_stages ts ON ts.id = tm.stage_id');
    expect(sql).toContain('s.name AS sport_name');
    expect(sql).toContain('s.icon AS sport_icon');
    expect(sql).toContain('sf.name AS format_name');
    expect(sql).toContain('org.name AS organisation_name');
    expect(sql).toContain('res.name AS resource_name');
    expect(sql).toContain('t.name AS tournament_name');
    expect(sql).toContain('tm.round_name');
    expect(sql).toContain('ts.name AS stage_name');
    expect(sql).toContain('r.submission_status = ?');
  });

  it('listForUser enriches records and preserves player scope + ordering', async () => {
    await matchResultRepository.listForUser(5, 20, 0);
    const sql = executed[1];
    expect(sql).toContain('LEFT JOIN sports s ON s.id = r.sport_id');
    expect(sql).toContain('r.match_id IN (SELECT match_id FROM match_result_participants WHERE user_id = ?)');
    expect(sql).toContain('ORDER BY r.played_at DESC');
  });

  it('listForOrg keeps tenant isolation AND enriches display data in one query', async () => {
    await matchResultRepository.listForOrg(28, { status: 'disputed', limit: 20, offset: 0 });
    const sql = executed[1];
    expect(sql).toContain('JOIN bookings b ON b.id = m.booking_id');
    expect(sql).toContain('b.organisation_id = ?');
    expect(sql).toContain('r.submission_status = ?');
    expect(sql).toContain('LEFT JOIN sports s ON s.id = r.sport_id');
    expect(sql).toContain('LEFT JOIN organisations org ON org.id = br.organisation_id');
    expect(sql).toContain('ORDER BY r.updated_at DESC');
  });

  it('listForAdmin maps rows into enriched list items with participants grouped', async () => {
    results.rows = [recordRow()];
    results.participantRows = [
      { id: 10, result_id: 1, match_id: 42, user_id: 5, team_index: 0, side: 'home', outcome: 'win', match_evidence: '100', evidence_counted: 1, rating_snapshot_percent: '60', rating_before: '60', rating_after: '62', full_name: 'Ahmed Ali', avatar_url: '/a.png' },
      { id: 11, result_id: 1, match_id: 42, user_id: 6, team_index: 1, side: 'away', outcome: 'loss', match_evidence: '0', evidence_counted: 1, rating_snapshot_percent: '60', rating_before: '60', rating_after: '58', full_name: 'Sara', avatar_url: null },
    ];
    const { records } = await matchResultRepository.listForAdmin({});
    expect(records).toHaveLength(1);
    const item = records[0];
    expect(item.sport).toEqual({ sportId: 22, sportName: 'Padel', sportIcon: '/uploads/sport/icon/padel.webp' });
    expect(item.format).toEqual({ formatId: 1, formatName: 'Padel Standard', formatType: 'doubles', playersPerSide: 2 });
    expect(item.venue).toEqual({ organisationId: 7, organisationName: 'Org One', branchId: 3, branchName: 'MASPIRO', resourceId: 9, resourceName: 'Court 1' });
    expect(item.tournament).toBeNull();
    expect(item.participants).toHaveLength(2);
    expect(item.participants[0].displayName).toBe('Ahmed Ali');
    expect(item.participants[0].avatarUrl).toBe('/a.png');
    // record fields remain intact on the enriched item (backward compatible)
    expect(item.id).toBe(1);
    expect(item.matchId).toBe(42);
    expect(item.submissionStatus).toBe('approved');
  });

  it('a tournament result includes tournament + round/stage context', async () => {
    results.rows = [recordRow({
      id: 2, match_id: 43, match_type: 'tournament', tournament_id: 11,
      tournament_id_display: 11, tournament_name: 'City Open',
      round: 2, round_name: 'Quarter-Final', stage_id: 5, stage_name: 'Knockout',
    })];
    results.participantRows = [];
    const view = await matchResultRepository.getResultDetailView(2);
    expect(view?.tournament).toEqual({ tournamentId: 11, tournamentName: 'City Open', round: 2, roundName: 'Quarter-Final', stageId: 5, stageName: 'Knockout' });
  });

  it('a normal public match has no fake tournament data', async () => {
    results.rows = [recordRow({ id: 3, match_id: 44 })];
    results.participantRows = [];
    const view = await matchResultRepository.getResultDetailView(3);
    expect(view?.tournament).toBeNull();
  });
});

describe('Group 4 — participant display identity', () => {
  it('loadParticipantsView returns displayName + avatarUrl from the users join', async () => {
    results.participantRows = [
      { id: 10, result_id: 1, match_id: 42, user_id: 5, team_index: 0, side: 'home', outcome: 'win', match_evidence: '100', evidence_counted: 1, rating_snapshot_percent: '60', rating_before: '60', rating_after: '62', full_name: 'Ahmed Ali', avatar_url: '/uploads/avatar/a.png' },
    ];
    const map = await matchResultRepository.loadParticipantsView([1]);
    expect(map.size).toBe(1);
    const list = map.get(1)!;
    expect(list).toHaveLength(1);
    expect(list[0].userId).toBe(5);
    expect(list[0].displayName).toBe('Ahmed Ali');
    expect(list[0].avatarUrl).toBe('/uploads/avatar/a.png');
    const sql = executed[0];
    expect(sql).toContain('FROM match_result_participants p');
    expect(sql).toContain('LEFT JOIN users u ON u.id = p.user_id');
  });

  it('missing avatar is returned safely as null', async () => {
    results.participantRows = [
      { id: 10, result_id: 1, match_id: 42, user_id: 5, team_index: 0, side: 'home', outcome: 'win', match_evidence: '100', evidence_counted: 0, rating_snapshot_percent: null, rating_before: null, rating_after: null, full_name: 'Ahmed Ali', avatar_url: null },
    ];
    const map = await matchResultRepository.loadParticipantsView([1]);
    expect(map.get(1)![0].avatarUrl).toBeNull();
    expect(map.get(1)![0].displayName).toBe('Ahmed Ali');
  });

  it('empty result ids produce an empty map with no SQL', async () => {
    const map = await matchResultRepository.loadParticipantsView([]);
    expect(map.size).toBe(0);
    expect(executed).toHaveLength(0);
  });
});