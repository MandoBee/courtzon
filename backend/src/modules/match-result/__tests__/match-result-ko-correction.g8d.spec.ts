import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

// ── Mocks ─────────────────────────────────────────────────────────────────────
const repo = vi.hoisted(() => ({
  resolveMatchId: vi.fn(),
  getMatchContext: vi.fn(),
  findActiveRuleSet: vi.fn(),
  findActiveRuleSetForFormat: vi.fn(),
  findByMatchId: vi.fn(),
  findById: vi.fn(),
  getResultDetailView: vi.fn(),
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
  setMatchEvidenceActive: vi.fn(),
  recalculate: vi.fn(),
  resolveOverallPercent: vi.fn(),
}));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));

/** The two mocks the tournament module exposes that `correctResult` consumes. */
const tournamentService = vi.hoisted(() => ({
  planKnockoutResultCorrection: vi.fn(),
  reconcileKnockoutResultCorrection: vi.fn(),
}));

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
// The tournament module is DYNAMICALLY imported inside `correctResult` (kept
// out of the historical single-writer path), so it must be mocked at the
// module path, not by spying on an instance.
vi.mock('../../tournaments/application/tournament.service.js', () => ({ tournamentService }));

import { matchResultService } from '../application/match-result.service.js';
import { ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

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

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    matchId: 42,
    sportId: 22,
    status: 'completed',
    formatId: 1,
    formatSnapshot: null,
    branchId: null,
    resourceId: null,
    playedAt: '2026-09-01 10:00:00',
    timezone: null,
    // The LIVE tournament provenance of the shared Match (the record column is
    // the legacy fallback; this is the authoritative one).
    tournamentId: 7,
    stageId: null,
    participantUserIds: [5, 6],
    participantSlots: [
      { userId: 5, side: 'home', teamIndex: 0 },
      { userId: 6, side: 'away', teamIndex: 1 },
    ],
    ...overrides,
  };
}

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    matchId: 42,
    sportId: 22,
    formatId: 1,
    ruleSetId: 1,
    rulesSnapshot: FORMAT.rules,
    matchType: 'tournament',
    playedAt: '2026-09-01 10:00:00',
    branchId: null,
    resourceId: null,
    tournamentId: null,
    academyId: null,
    timezone: null,
    participantPayload: [
      { userId: 5, side: 'home', teamIndex: 0 },
      { userId: 6, side: 'away', teamIndex: 1 },
    ],
    rawResult: { outcome: 'completed', score: { sets: [{ home: 6, away: 4 }, { home: 6, away: 3 }] } },
    finalResult: { winner: 'home', scoreSummary: '2-0 (6-4, 6-3)', sideOutcomes: { home: 'win', away: 'loss' }, sideEvidence: { home: 100, away: 0 } },
    outcome: 'completed',
    submissionStatus: 'approved',
    submittedBy: 5,
    submittedAt: '2026-09-01T11:00:00.000Z',
    acceptedBy: 999,
    acceptedAt: '2026-09-01T12:00:00.000Z',
    autoApproved: false,
    disputedBy: null,
    disputedAt: null,
    disputeReason: null,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    submissionDeadlineAt: '2026-09-03T11:00:00.000Z',
    autoApprovalDeadlineAt: '2026-09-03T11:00:00.000Z',
    evidenceCounted: true,
    ratingAppliedAt: null,
    createdAt: '2026-09-01T11:00:00.000Z',
    updatedAt: '2026-09-01T11:00:00.000Z',
    ...overrides,
  };
}

/** The corrected outcome FLIPS the winner: away (user 6) now wins. */
const AWAY_WINS_PAYLOAD = { outcome: 'completed', score: { sets: [{ home: 0, away: 6 }, { home: 0, away: 6 }] } };

const RECONCILE_CONN = { __reconcileConn: true } as any;

beforeEach(() => {
  vi.clearAllMocks();
  repo.findActiveRuleSet.mockResolvedValue(FORMAT);
  repo.getMatchContext.mockResolvedValue(makeContext());
  repo.getParticipants.mockResolvedValue([
    { id: 10, resultId: 1, matchId: 42, userId: 5, teamIndex: 0, side: 'home', outcome: 'win', matchEvidence: 100, evidenceCounted: true, ratingSnapshotPercent: 60, ratingBefore: 60, ratingAfter: 62 },
    { id: 11, resultId: 1, matchId: 42, userId: 6, teamIndex: 1, side: 'away', outcome: 'loss', matchEvidence: 0, evidenceCounted: true, ratingSnapshotPercent: 60, ratingBefore: 60, ratingAfter: 58 },
  ]);
  repo.findById.mockResolvedValue(makeRecord());
  rating.resolveOverallPercentAt.mockResolvedValue(60);
  rating.applyEvidence.mockResolvedValue({ before: 62, after: 58 });
  rating.recalculate.mockResolvedValue({ before: 60, after: 60 });
  rating.resolveOverallPercent.mockResolvedValue(60);
  rating.setMatchEvidenceActive.mockResolvedValue(undefined);

  // Default: an allowed plan (CASE C) that runs `resultWrite` on its own conn.
  tournamentService.planKnockoutResultCorrection.mockResolvedValue({
    resultId: 1, sharedMatchId: 42, tournamentId: 7, case: 'C',
    sourceSlotId: 11, targetSlotId: 21,
    winnerParticipantId: 200, winnerPrimaryUserId: 6,
  });
  tournamentService.reconcileKnockoutResultCorrection.mockImplementation(
    async (_plan: any, resultWrite: (conn?: any) => Promise<void>) => {
      await resultWrite(RECONCILE_CONN);
      return {
        case: 'C', reseatedTargetSlotId: 21,
        cancelledSharedMatchId: 902, rematerialisedSharedMatchId: 5000,
      };
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════
describe('G8-D-KO-CORRECTION · correctResult hands the correction to the tournament service', () => {
  it('1. plans with the CORRECTED participant rows (derived from the validated result, not the stale record)', async () => {
    await matchResultService.correctResult(1, 999, AWAY_WINS_PAYLOAD);

    expect(tournamentService.planKnockoutResultCorrection).toHaveBeenCalledTimes(1);
    const arg = tournamentService.planKnockoutResultCorrection.mock.calls[0][0];
    expect(arg).toMatchObject({ resultId: 1, sharedMatchId: 42, tournamentId: 7 });
    // The stale record says home won; the CORRECTED rows must say away won.
    expect(arg.resultParticipants).toEqual([
      { userId: 5, side: 'home', outcome: 'loss' },
      { userId: 6, side: 'away', outcome: 'win' },
    ]);
  });

  it('2. passes the reconciliation callback so the result write joins the SAME transaction', async () => {
    await matchResultService.correctResult(1, 999, AWAY_WINS_PAYLOAD);

    expect(tournamentService.reconcileKnockoutResultCorrection).toHaveBeenCalledTimes(1);
    const [plan, resultWrite] = tournamentService.reconcileKnockoutResultCorrection.mock.calls[0] as any[];
    expect(plan).toMatchObject({ case: 'C' });
    expect(typeof resultWrite).toBe('function');
    // Calling the callback with the reconciler's connection must thread that
    // connection into BOTH repository writes.
    await resultWrite(RECONCILE_CONN);
    expect(repo.updateResult).toHaveBeenLastCalledWith(1, expect.objectContaining({ resolution_note: 'corrected' }), RECONCILE_CONN);
    expect(repo.replaceParticipants).toHaveBeenLastCalledWith(
      1, 42,
      expect.arrayContaining([expect.objectContaining({ userId: 6, side: 'away', outcome: 'win' })]),
      RECONCILE_CONN,
    );
  });

  it('3. a BLOCKED plan aborts before ANY result write — the historical state is preserved', async () => {
    tournamentService.planKnockoutResultCorrection.mockRejectedValue(
      new ConflictError('Knockout result correction is not permitted for this match', ErrorCodes.TOURNAMENT_KNOCKOUT_CORRECTION_BLOCKED),
    );

    await expect(matchResultService.correctResult(1, 999, AWAY_WINS_PAYLOAD))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_KNOCKOUT_CORRECTION_BLOCKED });

    expect(tournamentService.reconcileKnockoutResultCorrection).not.toHaveBeenCalled();
    expect(repo.updateResult).not.toHaveBeenCalled();
    expect(repo.replaceParticipants).not.toHaveBeenCalled();
    expect(audit.recordAudit).not.toHaveBeenCalled();
    expect(bus.emit).not.toHaveBeenCalled();
    // Rating must not be touched for a correction that never happened.
    expect(rating.applyEvidence).not.toHaveBeenCalled();
    expect(rating.recalculate).not.toHaveBeenCalled();
  });

  it('4. a result with NO tournament provenance keeps the historical single-writer path untouched', async () => {
    repo.getMatchContext.mockResolvedValue(makeContext({ tournamentId: null }));

    await matchResultService.correctResult(1, 999, AWAY_WINS_PAYLOAD);

    // The tournament module is never consulted (and never even loaded).
    expect(tournamentService.planKnockoutResultCorrection).not.toHaveBeenCalled();
    expect(tournamentService.reconcileKnockoutResultCorrection).not.toHaveBeenCalled();
    // Two-arg repository overloads: no connection is threaded in.
    expect(repo.updateResult).toHaveBeenCalledWith(1, expect.objectContaining({ resolution_note: 'corrected' }));
    expect(repo.replaceParticipants).toHaveBeenCalledWith(
      1, 42,
      expect.arrayContaining([expect.objectContaining({ userId: 6, side: 'away', outcome: 'win' })]),
    );
    expect(audit.recordAudit).toHaveBeenCalledTimes(1);
  });

  it('5. falls back to the record.tournamentId when the live match context carries none', async () => {
    repo.getMatchContext.mockResolvedValue(makeContext({ tournamentId: null }));
    repo.findById.mockResolvedValue(makeRecord({ tournamentId: 7 }));

    await matchResultService.correctResult(1, 999, AWAY_WINS_PAYLOAD);

    expect(tournamentService.planKnockoutResultCorrection).toHaveBeenCalledWith(expect.objectContaining({ tournamentId: 7 }));
  });

  it('6. records the reconciliation on the EXISTING match.result.corrected audit — no new action, no new table', async () => {
    await matchResultService.correctResult(1, 999, AWAY_WINS_PAYLOAD);

    expect(audit.recordAudit).toHaveBeenCalledTimes(1);
    const entry = audit.recordAudit.mock.calls[0][0] as any;
    expect(entry.action).toBe('match.result.corrected');
    expect(entry.entityType).toBe('match_result_records');
    expect(entry.entityId).toBe(1);
    // The audit still carries the pre-correction state.
    expect(entry.beforeState).toMatchObject({ outcome: 'completed' });
    // …and now also the bracket reconciliation outcome, with no internal details.
    expect(entry.afterState).toMatchObject({
      winner: 'away',
      knockout_reconciliation: {
        case: 'C',
        targetSlotId: 21,
        cancelledSharedMatchId: 902,
        rematerialisedSharedMatchId: 5000,
      },
    });
    expect(entry.afterState.knockout_reconciliation).not.toHaveProperty('blockReason');
  });

  it('7. a non-tournament correction audits WITHOUT any knockout_reconciliation key', async () => {
    repo.getMatchContext.mockResolvedValue(makeContext({ tournamentId: null }));

    await matchResultService.correctResult(1, 999, AWAY_WINS_PAYLOAD);

    const entry = audit.recordAudit.mock.calls[0][0] as any;
    expect(entry.action).toBe('match.result.corrected');
    expect(entry.afterState).not.toHaveProperty('knockout_reconciliation');
  });

  it('8. CASE A reconciles the mirror only — the audit records the case with no downstream ids', async () => {
    tournamentService.planKnockoutResultCorrection.mockResolvedValue({
      resultId: 1, sharedMatchId: 42, tournamentId: 7, case: 'A',
      sourceSlotId: 11, targetSlotId: null,
      winnerParticipantId: 200, winnerPrimaryUserId: 6,
    });
    tournamentService.reconcileKnockoutResultCorrection.mockImplementation(
      async (_plan: any, resultWrite: (conn?: any) => Promise<void>) => {
        await resultWrite(RECONCILE_CONN);
        return {
          case: 'A', reseatedTargetSlotId: null,
          cancelledSharedMatchId: null, rematerialisedSharedMatchId: null,
        };
      },
    );

    await matchResultService.correctResult(1, 999, AWAY_WINS_PAYLOAD);

    const entry = audit.recordAudit.mock.calls[0][0] as any;
    expect(entry.afterState.knockout_reconciliation).toEqual({
      case: 'A', targetSlotId: null, cancelledSharedMatchId: null, rematerialisedSharedMatchId: null,
    });
  });

  it('9. a failed reconciler propagates and writes NO audit, NO event, NO rating', async () => {
    tournamentService.reconcileKnockoutResultCorrection.mockRejectedValue(new Error('lock timeout'));

    await expect(matchResultService.correctResult(1, 999, AWAY_WINS_PAYLOAD)).rejects.toThrow('lock timeout');

    expect(repo.updateResult).not.toHaveBeenCalled();
    expect(repo.replaceParticipants).not.toHaveBeenCalled();
    expect(audit.recordAudit).not.toHaveBeenCalled();
    expect(bus.emit).not.toHaveBeenCalled();
    expect(rating.applyEvidence).not.toHaveBeenCalled();
  });

  it('10. rating runs AFTER the reconciler, so a rolled-back correction leaves no evidence', async () => {
    const order: string[] = [];
    tournamentService.reconcileKnockoutResultCorrection.mockImplementation(async (_plan: any, resultWrite: any) => {
      order.push('reconcile');
      await resultWrite(RECONCILE_CONN);
      order.push('reconciled');
      return { case: 'C', reseatedTargetSlotId: 21, cancelledSharedMatchId: 902, rematerialisedSharedMatchId: 5000 };
    });
    rating.applyEvidence.mockImplementation(async () => { order.push('rating'); return { before: 60, after: 60 }; });

    await matchResultService.correctResult(1, 999, AWAY_WINS_PAYLOAD);

    expect(order.slice(0, 2)).toEqual(['reconcile', 'reconciled']);
    // Every rating touch happens only after the reconciler has returned.
    expect(order.slice(2).every((x) => x === 'rating')).toBe(true);
    expect(order).toHaveLength(4); // reconcile + reconciled + one per participant
  });
});
