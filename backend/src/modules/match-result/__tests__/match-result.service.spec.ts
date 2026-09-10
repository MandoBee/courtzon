import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

// ── Mock infra: repository, rating service, audit, event bus, db pool ─────
const repo = vi.hoisted(() => ({
  resolveMatchId: vi.fn(),
  getMatchContext: vi.fn(),
  findActiveRuleSet: vi.fn(),
  findByMatchId: vi.fn(),
  findById: vi.fn(),
  insert: vi.fn(),
  replaceParticipants: vi.fn(),
  updateResult: vi.fn(),
  approvePending: vi.fn(),
  getParticipants: vi.fn(),
  findAutoApprovable: vi.fn(),
  findExpiredNoResultMatches: vi.fn(),
}));

const rating = vi.hoisted(() => ({
  resolveOverallPercentAt: vi.fn(),
  applyEvidence: vi.fn(),
  adjustMatchStat: vi.fn(),
  recordMatchStat: vi.fn(),
}));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));

const fakeConn = vi.hoisted(() => ({
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  execute: vi.fn(async (sql: string) => {
    if (sql.includes('FROM match_result_records')) {
      return [[{ id: 1, match_id: 42, sport_id: 22, evidence_counted: 0, rating_applied_at: null, outcome: 'completed', played_at: '2026-09-01 10:00:00' }]];
    }
    if (sql.includes('FROM match_result_participants')) {
      return [[{ id: 10, user_id: 5, match_evidence: '100', outcome: 'win' }, { id: 11, user_id: 6, match_evidence: '0', outcome: 'loss' }]];
    }
    return [[], []];
  }),
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ getConnection: async () => fakeConn }),
}));

vi.mock('../infrastructure/match-result.repository.js', () => ({ matchResultRepository: repo }));
vi.mock('../application/rating/rating.service.js', () => ({ ratingService: rating }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: bus }));

import { matchResultService } from '../application/match-result.service.js';
import { RulesValidationError } from '../application/rules/rules-engine.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';

const FORMAT = {
  formatId: 1,
  ruleSetId: 1,
  version: 1,
  rules: {
    score_structure: 'sets',
    best_of: 3,
    sets_to_win: 2,
    first_to: 6,
    margin: 2,
    tiebreak_at: 6,
    tiebreak_first_to: 7,
    draw_allowed: false,
    terminations: ['retired', 'walkover', 'forfeit', 'abandoned'],
  },
  standingsRules: null,
};

const CONTEXT = {
  matchId: 42,
  sportId: 22,
  status: 'in_progress',
  branchId: null,
  resourceId: null,
  playedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
  timezone: null,
  participantUserIds: [5, 6],
};

const VALID_PAYLOAD = {
  outcome: 'completed',
  score: { sets: [{ home: 6, away: 4 }, { home: 6, away: 3 }] },
};

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    matchId: 42,
    sportId: 22,
    formatId: 1,
    ruleSetId: 1,
    rulesSnapshot: FORMAT.rules,
    matchType: 'public',
    playedAt: CONTEXT.playedAt,
    branchId: null,
    resourceId: null,
    tournamentId: null,
    academyId: null,
    timezone: null,
    participantPayload: [{ userId: 5, side: 'home', teamIndex: 0 }, { userId: 6, side: 'away', teamIndex: 1 }],
    rawResult: VALID_PAYLOAD,
    finalResult: { winner: 'home', scoreSummary: '2-0 (6-4, 6-3)', sideOutcomes: { home: 'win', away: 'loss' }, sideEvidence: { home: 100, away: 0 } },
    outcome: 'completed',
    submissionStatus: 'pending_confirmation',
    submittedBy: 5,
    submittedAt: new Date().toISOString(),
    acceptedBy: null,
    acceptedAt: null,
    autoApproved: false,
    disputedBy: null,
    disputedAt: null,
    disputeReason: null,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    submissionDeadlineAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    autoApprovalDeadlineAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    evidenceCounted: false,
    ratingAppliedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.resolveMatchId.mockResolvedValue(42);
  repo.getMatchContext.mockResolvedValue(CONTEXT);
  repo.findActiveRuleSet.mockResolvedValue(FORMAT);
  repo.findById.mockResolvedValue(makeRecord());
});

describe('C3 — withdrawResult', () => {
  it('submitter can withdraw a pending result within the window', async () => {
    repo.findByMatchId.mockResolvedValue(makeRecord());
    const rec = await matchResultService.withdrawResult(42, 5);
    expect(rec.submissionStatus).toBe('pending_confirmation');
    expect(repo.updateResult).toHaveBeenCalledWith(1, expect.objectContaining({ submission_status: 'withdrawn' }));
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'match.result.withdrawn', actorId: 5 }));
    expect(bus.emit).toHaveBeenCalledWith('match:result-withdrawn', expect.objectContaining({ matchId: 42 }), expect.anything());
  });

  it('non-submitter cannot withdraw', async () => {
    repo.findByMatchId.mockResolvedValue(makeRecord());
    await expect(matchResultService.withdrawResult(42, 6)).rejects.toThrow(ForbiddenError);
  });

  it('cannot withdraw an approved result', async () => {
    repo.findByMatchId.mockResolvedValue(makeRecord({ submissionStatus: 'approved', submittedBy: 5 }));
    await expect(matchResultService.withdrawResult(42, 5)).rejects.toThrow(RulesValidationError);
  });

  it('cannot withdraw a disputed result', async () => {
    repo.findByMatchId.mockResolvedValue(makeRecord({ submissionStatus: 'disputed', submittedBy: 5 }));
    await expect(matchResultService.withdrawResult(42, 5)).rejects.toThrow(RulesValidationError);
  });

  it('cannot withdraw after the 3-day submission window', async () => {
    repo.findByMatchId.mockResolvedValue(makeRecord({ playedAt: new Date(Date.now() - 200 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ') }));
    await expect(matchResultService.withdrawResult(42, 5)).rejects.toThrow(RulesValidationError);
  });
});

describe('C3 — submit after withdrawal reuses the row (no second record)', () => {
  it('reuses the withdrawn row via updateResult and persists final_result', async () => {
    repo.findByMatchId.mockResolvedValue(makeRecord({ submissionStatus: 'withdrawn', submittedBy: 5 }));
    repo.findById.mockResolvedValue(makeRecord({ submissionStatus: 'pending_confirmation' }));
    const rec = await matchResultService.submitMatchResult(42, 5, VALID_PAYLOAD);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(repo.updateResult).toHaveBeenCalledWith(1, expect.objectContaining({ submissionStatus: 'pending_confirmation', finalResult: expect.any(Object) }));
    expect(repo.replaceParticipants).toHaveBeenCalled();
    expect(rec.submissionStatus).toBe('pending_confirmation');
  });

  it('blocks a fresh submit when an active (non-withdrawn) result exists', async () => {
    repo.findByMatchId.mockResolvedValue(makeRecord({ submissionStatus: 'approved' }));
    await expect(matchResultService.submitMatchResult(42, 5, VALID_PAYLOAD)).rejects.toThrow(RulesValidationError);
  });
});

describe('C4/C6 — submitMatchResult', () => {
  it('inserts a result with a persisted final_result', async () => {
    repo.findByMatchId.mockResolvedValue(null);
    repo.insert.mockResolvedValue(99);
    repo.findById.mockResolvedValue(makeRecord({ id: 99 }));
    await matchResultService.submitMatchResult(42, 5, VALID_PAYLOAD);
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ finalResult: expect.any(Object), outcome: 'completed' }));
  });

  it('rejects submission when the match has no authoritative played_at (no session)', async () => {
    repo.getMatchContext.mockResolvedValue({ ...CONTEXT, playedAt: null });
    await expect(matchResultService.submitMatchResult(42, 5, VALID_PAYLOAD)).rejects.toThrow(RulesValidationError);
  });
});

describe('C8 — autoApproveDueResults race safety', () => {
  it('skips when approvePending affects zero rows (disputed meanwhile)', async () => {
    repo.findAutoApprovable.mockResolvedValue([makeRecord()]);
    repo.approvePending.mockResolvedValue(false);
    const approved = await matchResultService.autoApproveDueResults();
    expect(approved).toBe(0);
    expect(rating.applyEvidence).not.toHaveBeenCalled();
    expect(audit.recordAudit).not.toHaveBeenCalled();
    expect(bus.emit).not.toHaveBeenCalled();
  });

  it('applies rating only after a successful concurrency-safe approval', async () => {
    repo.findAutoApprovable.mockResolvedValue([makeRecord()]);
    repo.approvePending.mockResolvedValue(true);
    rating.resolveOverallPercentAt.mockResolvedValue(60);
    rating.applyEvidence.mockResolvedValue({ before: 60, after: 62 });
    const approved = await matchResultService.autoApproveDueResults();
    expect(approved).toBe(1);
    expect(rating.applyEvidence).toHaveBeenCalledTimes(2);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'match.result.auto_approved' }));
  });
});

describe('C1/C9 — correctResult recalculates rating', () => {
  it('re-applies evidence idempotently via the same source and records beforeState', async () => {
    repo.findByMatchId.mockResolvedValue(null);
    repo.findActiveRuleSet.mockResolvedValue(FORMAT);
    repo.getParticipants.mockResolvedValue([
      { id: 10, resultId: 1, matchId: 42, userId: 5, teamIndex: 0, side: 'home', outcome: 'win', matchEvidence: 100, evidenceCounted: true, ratingSnapshotPercent: 60, ratingBefore: 60, ratingAfter: 62 },
      { id: 11, resultId: 1, matchId: 42, userId: 6, teamIndex: 1, side: 'away', outcome: 'loss', matchEvidence: 0, evidenceCounted: true, ratingSnapshotPercent: 60, ratingBefore: 60, ratingAfter: 58 },
    ]);
    repo.findById.mockResolvedValue(makeRecord({ submissionStatus: 'approved', outcome: 'completed' }));
    rating.resolveOverallPercentAt.mockResolvedValue(60);
    rating.applyEvidence.mockResolvedValue({ before: 62, after: 58 });

    await matchResultService.correctResult(1, 999, { outcome: 'completed', score: { sets: [{ home: 0, away: 6 }, { home: 0, away: 6 }] } });

    // C4 — corrected final_result persisted
    expect(repo.updateResult).toHaveBeenCalledWith(1, expect.objectContaining({ finalResult: expect.any(Object), outcome: 'completed' }));
    // C1 — evidence re-applied (force path) via the match_result source
    expect(rating.applyEvidence).toHaveBeenCalledWith(expect.objectContaining({ source: 'match_result', sourceRefId: 1, valuePercent: 0 }));
    expect(rating.adjustMatchStat).toHaveBeenCalled();
    // C9 — audit contains both beforeState and afterState
    const auditCall = audit.recordAudit.mock.calls.find((c) => c[0].action === 'match.result.corrected');
    expect(auditCall).toBeDefined();
    expect(auditCall![0].beforeState).toEqual(expect.objectContaining({ raw_result: expect.any(Object), final_result: expect.any(Object), outcome: 'completed' }));
    expect(auditCall![0].afterState).toEqual(expect.objectContaining({ winner: 'away' }));
  });

  it('blocks correction of a non-approved result', async () => {
    repo.findByMatchId.mockResolvedValue(null);
    repo.findById.mockResolvedValue(makeRecord({ submissionStatus: 'disputed' }));
    await expect(matchResultService.correctResult(1, 999, VALID_PAYLOAD)).rejects.toThrow(RulesValidationError);
  });
});