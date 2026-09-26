import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
import {
  evaluateKnockoutCorrectionBlockReason,
  throwKnockoutCorrectionBlocked,
  KNOCKOUT_CORRECTION_BLOCKED_MESSAGE,
  KNOCKOUT_CORRECTION_BLOCKED_MATCH_STATUSES,
  KNOCKOUT_CORRECTION_BLOCKED_RESULT_STATUSES,
} from '../domain/knockout-correction.js';
import type { Tournament, TournamentMatch } from '../domain/tournament-aggregate.js';

/**
 * G8-D-KO-CORRECTION — pre-start knockout result-correction guard + downstream
 * bracket reconciliation.
 *
 * The bracket is modelled as a small in-memory state so the assertions are about
 * OBSERVABLE outcomes (which slot holds which participant, whether a shared
 * Match exists, whether the court was released) rather than call shapes.
 */

// ── Mock infrastructure ────────────────────────────────────────────────────────
const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  findMatchBySharedMatchId: vi.fn(),
  findBracketSlot: vi.fn(),
  lockMatchById: vi.fn(),
  updateMatch: vi.fn(),
  updateStatus: vi.fn(),
  findStages: vi.fn(),
  findMatches: vi.fn(),
  recalculateStandings: vi.fn(),
  countIncompleteStageMatches: vi.fn(),
}));

const mrRepo = vi.hoisted(() => ({
  resolveDefaultFormatForSport: vi.fn(),
  findActiveRuleSetForFormat: vi.fn(),
  findFormatById: vi.fn(),
  findRuleSetById: vi.fn(),
  getParticipants: vi.fn(),
}));

const pdr = vi.hoisted(() => ({ findParticipantById: vi.fn() }));
const pmr = vi.hoisted(() => ({ findActiveMembersByUserIds: vi.fn(), listMembersByParticipant: vi.fn() }));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));

const matchServiceMock = vi.hoisted(() => ({
  createForTournament: vi.fn(),
  cancelTournamentMatch: vi.fn(),
  inspectPreStartState: vi.fn(),
}));
const courtReservationMock = vi.hoisted(() => ({ releaseCourt: vi.fn() }));

const fakeConn = vi.hoisted(() => ({
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(() => undefined),
  query: vi.fn(async () => [[]]),
  execute: vi.fn(async () => [[]]),
}));

const pool = vi.hoisted(() => ({
  execute: vi.fn(async () => [[]]),
  query: vi.fn(async () => [[]]),
  getConnection: vi.fn(async () => fakeConn),
}));
const acquireConn = vi.hoisted(() => ({ fn: async () => fakeConn as any }));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: pdr }));
vi.mock('../infrastructure/repositories/participant-member.repository.js', () => ({ participantMemberRepository: pmr }));
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => pool,
  acquireConnection: (...args: any[]) => acquireConn.fn(...args),
}));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mrRepo }));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: matchServiceMock }));
vi.mock('../../booking/application/court-reservation.service.js', () => ({ courtReservationService: courtReservationMock }));

// ── Bracket state model ────────────────────────────────────────────────────────
/** Live bracket rows keyed by tournament_matches.id. */
const state = vi.hoisted(() => ({
  slots: new Map<number, any>(),
  tournaments: new Map<number, any>(),
  commits: 0,
  rollbacks: 0,
  audit: [] as any[],
  events: [] as Array<{ type: string; payload: any }>,
  participants: new Map<number, any>(),
  members: new Map<number, any[]>(),
  createdMatchIds: [] as number[],
  nextMatchId: 5000,
}));

const SOURCE_SLOT = 11;
const TARGET_SLOT = 21;
const SOURCE_SHARED_MATCH = 901;
const TARGET_SHARED_MATCH = 902;

function installSlot(id: number, overrides: Record<string, any> = {}): void {
  state.slots.set(id, {
    id, tournament_id: 1, round: 1, bracket_position: 0, group_id: null, stage_id: null,
    match_id: null, participant1_id: null, participant2_id: null,
    player1_id: null, player2_id: null, winner_id: null, score_summary: null,
    status: 'scheduled', progression_state: 'pending', resource_id: null, start_time: null, end_time: null,
    progression_meta: null, mode: 'knockout',
    ...overrides,
  });
}

function slot(id: number): any {
  return state.slots.get(id);
}

function installTournament(overrides: Record<string, any> = {}): void {
  state.tournaments.set(1, {
    id: 1, creator_id: 1, bracket_type_id: 1, format: 'knockout', name: 'KO Cup',
    max_participants: 8, min_participants: 2, entry_fee: 0, currency_code: 'USD',
    price_type: 'FREE', status: 'running', sport_id: 22, match_format_id: 1, rule_set_id: 1, draw_seed: 42,
    organisation_id: null, branch_id: null,
    ...overrides,
  });
}

/** G9-B fixtures: individuals 100→[10] 200→[20]; pairs 101→[10,11] 201→[20,21]; teams 102→[10,11,12] 202→[20,21,22]. */
function installParticipants(entries: Array<{ id: number; type?: string; users: number[]; status?: string }>): void {
  state.participants.clear();
  state.members.clear();
  for (const p of entries) {
    state.participants.set(p.id, {
      id: p.id, tournament_id: 1, registration_id: null,
      participant_type: p.type ?? 'individual', status: p.status ?? 'active', member_user_ids: p.users,
    });
    state.members.set(p.id, p.users.map((u, i) => ({
      id: p.id * 1000 + i, tournament_id: 1, participant_id: p.id, user_id: u,
      member_order: i, status: 'active', joined_at: '2026-01-01 00:00:00', left_at: null, replaced_by_member_id: null,
    })));
  }
}

/**
 * Standard 4-player KO: R1 slot 11 (100 v 200) feeds R2 slot 21 on side
 * `player1`. The target's OTHER side (participant 300) is already seated by the
 * sibling quarter, so the target is a complete two-sided slot — exactly the state
 * in which a shared Match can legitimately be materialised.
 */
function installStandardBracket(targetOverrides: Record<string, any> = {}): void {
  installSlot(SOURCE_SLOT, {
    round: 1, bracket_position: 0, match_id: SOURCE_SHARED_MATCH,
    participant1_id: 100, participant2_id: 200, player1_id: 10, player2_id: 20,
    status: 'completed', progression_state: 'completed', winner_id: 10,
    progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' },
  });
  installSlot(TARGET_SLOT, {
    round: 2, bracket_position: 0,
    participant2_id: 300, player2_id: 30,
    ...targetOverrides,
  });
}

/** The same wiring for doubles/team sources (participant ids on both sides). */
function installPairBracket(sourceOverrides: Record<string, any>, targetOverrides: Record<string, any> = {}): void {
  installStandardBracket(targetOverrides);
  installSlot(SOURCE_SLOT, {
    round: 1, bracket_position: 0, match_id: SOURCE_SHARED_MATCH,
    status: 'completed', progression_state: 'completed', winner_id: 10,
    progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' },
    ...sourceOverrides,
  });
}

/** Downstream shared-Match state as observed by the guard. */
function installDownstreamMatch(stateName: string | null, resultSubmissionStatus: string | null = null): void {
  matchServiceMock.inspectPreStartState.mockImplementation(async (matchId: number) => {
    if (matchId !== TARGET_SHARED_MATCH) return null;
    if (stateName === null) return null;
    return {
      status: stateName,
      result: resultSubmissionStatus ? { id: 77, submissionStatus: resultSubmissionStatus, outcome: 'completed' } : null,
    };
  });
}

const svc = new TournamentService();

/** The corrected result says participant 200 (users 20) beat participant 100. */
const AWAY_WINS = [
  { userId: 10, side: 'home' as const, outcome: 'loss' },
  { userId: 20, side: 'away' as const, outcome: 'win' },
];

/** The corrected result has no winning side (draw / no_result / abandoned). */
const NO_WINNER = [
  { userId: 10, side: 'home' as const, outcome: 'draw' },
  { userId: 20, side: 'away' as const, outcome: 'draw' },
];

async function plan(resultParticipants = AWAY_WINS, resultId = 5) {
  return svc.planKnockoutResultCorrection({
    resultId, sharedMatchId: SOURCE_SHARED_MATCH, tournamentId: 1, resultParticipants,
  });
}

/** Run the full correction: plan + reconcile, recording whether the write ran. */
async function correct(resultParticipants = AWAY_WINS) {
  const p = await plan(resultParticipants);
  const write = vi.fn(async () => undefined);
  const outcome = await svc.reconcileKnockoutResultCorrection(p, write as any);
  return { plan: p, outcome, write };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.slots.clear();
  state.tournaments.clear();
  state.participants.clear();
  state.members.clear();
  state.createdMatchIds.length = 0;
  state.commits = 0;
  state.rollbacks = 0;
  state.nextMatchId = 5000;
  state.audit.length = 0;
  state.events.length = 0;

  installTournament();
  installParticipants([
    { id: 100, users: [10] },
    { id: 200, users: [20] },
    { id: 300, users: [30] },
    { id: 101, type: 'pair', users: [10, 11] },
    { id: 201, type: 'pair', users: [20, 21] },
    { id: 102, type: 'team', users: [10, 11, 12] },
    { id: 202, type: 'team', users: [20, 21, 22] },
    { id: 400, users: [40], status: 'withdrawn_after_start' },
  ]);
  installStandardBracket({ participant1_id: 100, player1_id: 10 });

  repo.findById.mockImplementation(async (id: number) => state.tournaments.get(Number(id)) ?? null);
  repo.findMatchBySharedMatchId.mockImplementation(async (matchId: number) =>
    matchId === SOURCE_SHARED_MATCH ? slot(SOURCE_SLOT) : null);
  repo.findBracketSlot.mockImplementation(async (_tid: number, _round: number, pos: number) =>
    pos === 0 ? slot(TARGET_SLOT) : null);
  repo.findStages.mockResolvedValue([]);
  repo.updateMatch.mockImplementation(async (id: number, patch: Record<string, any>) => {
    const row = state.slots.get(Number(id));
    if (row) Object.assign(row, patch);
  });
  repo.lockMatchById.mockImplementation(async (id: number) => {
    // G9-C — the real implementation is `SELECT ... FOR UPDATE`, i.e. the row is
    // re-read under the lock, so the mock returns the CURRENT state.
    const row = state.slots.get(Number(id));
    return row ? { ...row } : null;
  });
  pdr.findParticipantById.mockImplementation(async (id: number) => state.participants.get(Number(id)) ?? null);
  pmr.listMembersByParticipant.mockImplementation(async (id: number) => state.members.get(Number(id)) ?? []);
  pmr.findActiveMembersByUserIds.mockImplementation(async (_tid: number, userIds: number[]) => {
    const rows: Array<{ participant_id: number; user_id: number }> = [];
    for (const [pid, members] of state.members) {
      for (const m of members) if (m.status === 'active' && userIds.includes(Number(m.user_id))) rows.push({ participant_id: pid, user_id: Number(m.user_id) });
    }
    return rows;
  });
  // CASE C re-materialises the shared Match through the EXISTING
  // `attachSharedMatchToTarget`, which calls `resolveMatchFormatContext`. The
  // fixture tournament configures `match_format_id` + `rule_set_id`, so that
  // branch (not the sport-default fallback) is the one under test.
  mrRepo.findFormatById.mockResolvedValue({ formatId: 1, formatType: 'singles', playersPerSide: 1, name: 'Singles' });
  mrRepo.findRuleSetById.mockResolvedValue({ ruleSetId: 1, formatId: 1, rules: { best_of: 3 } });
  mrRepo.resolveDefaultFormatForSport.mockResolvedValue({ formatId: 1, formatType: 'singles', playersPerSide: 1, name: 'Singles' });
  mrRepo.findActiveRuleSetForFormat.mockResolvedValue({ ruleSetId: 1, rules: { best_of: 3 } });
  matchServiceMock.createForTournament.mockImplementation(async () => {
    const id = state.nextMatchId++;
    state.createdMatchIds.push(id);
    return { id };
  });
  matchServiceMock.cancelTournamentMatch.mockResolvedValue(undefined);
  courtReservationMock.releaseCourt.mockResolvedValue({ released: true });
  matchServiceMock.inspectPreStartState.mockImplementation(async (matchId: number) =>
    matchId === TARGET_SHARED_MATCH
      ? { status: 'closed', result: null }
      : null);
  audit.recordAudit.mockImplementation(async (entry: any) => { state.audit.push(entry); });
  bus.emit.mockImplementation((type: string, payload: any) => { state.events.push({ type, payload }); });

  // Count real commits/rollbacks so tests can prove nothing was emitted pre-commit.
  fakeConn.beginTransaction.mockImplementation(async () => { state.commits += 0; });
  fakeConn.commit.mockImplementation(async () => { state.commits += 1; });
  fakeConn.rollback.mockImplementation(async () => { state.rollbacks += 1; });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1–9 · CASE A / B / C reconciliation shapes
// ═══════════════════════════════════════════════════════════════════════════

describe('G8-D-KO-CORRECTION · CASE A — no downstream bracket target', () => {
  it('1. final-round source: updates the source result + projection and NEVER pre-creates the downstream Match', async () => {
    // Final round → progression_meta carries no target.
    installSlot(SOURCE_SLOT, {
      match_id: SOURCE_SHARED_MATCH, participant1_id: 100, participant2_id: 200,
      player1_id: 10, player2_id: 20, status: 'completed', progression_state: 'completed', winner_id: 10,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    });

    const { plan: p, outcome, write } = await correct();

    expect(p.case).toBe('A');
    expect(outcome.case).toBe('A');
    expect(write).toHaveBeenCalledTimes(1);
    // The corrected winner replaces the stale source projection.
    expect(slot(SOURCE_SLOT).winner_id).toBe(20);
    // NEVER pre-created: no shared Match was materialised for a downstream slot.
    expect(state.createdMatchIds).toEqual([]);
    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
    // No downstream slot was touched.
    expect(outcome.reseatedTargetSlotId).toBeNull();
    expect(repo.updateMatch).not.toHaveBeenCalledWith(TARGET_SLOT, expect.anything(), expect.anything());
  });

  it('2. a non-bracket (round-robin) slot is CASE A: mirror only, no bracket reconciliation', async () => {
    installSlot(SOURCE_SLOT, {
      match_id: SOURCE_SHARED_MATCH, participant1_id: 100, participant2_id: 200,
      player1_id: 10, player2_id: 20, status: 'completed', progression_state: 'completed', winner_id: 10,
      group_id: 5, progression_meta: { is_bracket: false },
    });

    const { plan: p, outcome, write } = await correct();

    expect(p.case).toBe('A');
    expect(outcome.case).toBe('A');
    expect(write).toHaveBeenCalledTimes(1);
    expect(slot(SOURCE_SLOT).winner_id).toBe(20);
    expect(state.createdMatchIds).toEqual([]);
    expect(bus.emit.mock.calls.map((c) => c[0])).not.toContain('tournament:match-progressed');
  });
});

describe('G8-D-KO-CORRECTION · CASE B — target slot exists, no shared Match', () => {
  it('3. reseats the corrected winner on the target side, preserving bracket topology and materialising NO Match', async () => {
    installStandardBracket({ match_id: null, participant1_id: 100, player1_id: 10 });

    const { plan: p, outcome, write } = await correct();

    expect(p.case).toBe('B');
    expect(p.targetSide).toBe('player1');
    expect(write).toHaveBeenCalledTimes(1);
    // Reseated: the stale winner is gone, the corrected winner is seated with BOTH
    // the authoritative participant id and the legacy primary-member user id.
    expect(slot(TARGET_SLOT).participant1_id).toBe(200);
    expect(slot(TARGET_SLOT).player1_id).toBe(20);
    // Topology preserved: round/position/group/stage untouched, no linkage added.
    expect(slot(TARGET_SLOT).round).toBe(2);
    expect(slot(TARGET_SLOT).bracket_position).toBe(0);
    expect(slot(TARGET_SLOT).match_id).toBeNull();
    expect(slot(TARGET_SLOT).progression_state).toBe('pending');
    // No premature Match — attach is not even reachable in CASE B.
    expect(state.createdMatchIds).toEqual([]);
    expect(matchServiceMock.createForTournament).not.toHaveBeenCalled();
    expect(outcome.rematerialisedSharedMatchId).toBeNull();
    expect(outcome.cancelledSharedMatchId).toBeNull();
  });

  it('4. writes the corrected result and the reseat in ONE transaction on the SAME connection', async () => {
    installStandardBracket({ match_id: null, participant1_id: 100, player1_id: 10 });

    const { write } = await correct();

    expect(write).toHaveBeenCalledTimes(1);
    // The result write receives the reconciling transaction's connection — this is
    // what makes `source = NEW WINNER` + `downstream = OLD WINNER` unreachable.
    expect(write.mock.calls[0][0]).toBe(fakeConn);
    expect(state.commits).toBe(1);
    expect(state.rollbacks).toBe(0);
    // Source + target projections are written inside that same transaction.
    const updateCalls = repo.updateMatch.mock.calls;
    expect(updateCalls.every((c) => c[2] === fakeConn)).toBe(true);
    expect(updateCalls.map((c) => c[0]).sort()).toEqual([SOURCE_SLOT, TARGET_SLOT]);
  });

  it('5. a corrected result with no winning side CLEARS the stale downstream seat instead of replacing it', async () => {
    installStandardBracket({ match_id: null, participant1_id: 100, player1_id: 10 });

    const { plan: p, outcome } = await correct(NO_WINNER);

    expect(p.winnerParticipantId).toBeNull();
    expect(p.winnerPrimaryUserId).toBeNull();
    expect(outcome.reseatedTargetSlotId).toBe(TARGET_SLOT);
    // Never left pointing at the OLD winner.
    expect(slot(TARGET_SLOT).participant1_id).toBeNull();
    expect(slot(TARGET_SLOT).player1_id).toBeNull();
    // ...and the source no longer claims a winner either.
    expect(slot(SOURCE_SLOT).winner_id).toBeNull();
    expect(state.createdMatchIds).toEqual([]);
  });

  it('6. a non-progression-eligible corrected winner (withdrawn_after_start) is never seated', async () => {
    installParticipants([{ id: 100, users: [10] }, { id: 300, users: [30] }, { id: 400, users: [40], status: 'withdrawn_after_start' }]);
    installStandardBracket({ match_id: null, participant1_id: 100, player1_id: 10 });
    // Overwrite only the SOURCE half: the corrected winner is participant 400.
    installSlot(SOURCE_SLOT, {
      round: 1, bracket_position: 0, match_id: SOURCE_SHARED_MATCH,
      participant1_id: 100, participant2_id: 400, player1_id: 10, player2_id: 40,
      status: 'completed', progression_state: 'completed', winner_id: 10,
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' },
    });

    const p = await plan([
      { userId: 10, side: 'home', outcome: 'loss' },
      { userId: 40, side: 'away', outcome: 'win' },
    ]);

    expect(p.winnerParticipantId).toBeNull();
    expect(p.winnerPrimaryUserId).toBeNull();

    // Executing it leaves the stale seat cleared rather than seated with an
    // ineligible participant — exactly as forward progression behaves.
    await svc.reconcileKnockoutResultCorrection(p, vi.fn(async () => undefined) as any);
    expect(slot(TARGET_SLOT).participant1_id).toBeNull();
    expect(slot(TARGET_SLOT).player1_id).toBeNull();
    // A lone target can never materialise a shared Match.
    expect(state.createdMatchIds).toEqual([]);
  });
});

describe('G8-D-KO-CORRECTION · CASE C — downstream shared Match exists, not started', () => {
  function installCaseC(): void {
    installStandardBracket({
      match_id: TARGET_SHARED_MATCH, participant1_id: 100, player1_id: 10, progression_state: 'ready',
    });
    installDownstreamMatch('closed');
  }

  it('7. releases the court, cancels the stale Match, clears the linkage, replaces the participant and re-materialises', async () => {
    installCaseC();

    const { plan: p, outcome, write } = await correct();

    expect(p.case).toBe('C');
    expect(write).toHaveBeenCalledTimes(1);
    // (a) court released — the EXISTING idempotent, tournament-only release path.
    expect(courtReservationMock.releaseCourt).toHaveBeenCalledWith(TARGET_SHARED_MATCH);
    // (b) cancelled through the EXISTING tournament-aware, non-destructive path.
    expect(matchServiceMock.cancelTournamentMatch).toHaveBeenCalledWith(TARGET_SHARED_MATCH, expect.any(String));
    // (c) linkage cleared + (d) participant replaced, in the atomic transaction.
    expect(slot(TARGET_SLOT).match_id).not.toBe(TARGET_SHARED_MATCH);
    expect(slot(TARGET_SLOT).participant1_id).toBe(200);
    expect(slot(TARGET_SLOT).player1_id).toBe(20);
    // (e) re-materialised through the EXISTING attach path.
    expect(state.createdMatchIds).toHaveLength(1);
    expect(matchServiceMock.createForTournament).toHaveBeenCalledTimes(1);
    expect(outcome.rematerialisedSharedMatchId).toBe(state.createdMatchIds[0]);
    expect(slot(TARGET_SLOT).match_id).toBe(state.createdMatchIds[0]);
    expect(slot(TARGET_SLOT).progression_state).toBe('ready');
  });

  it('8. never produces a duplicate downstream shared Match for the same target', async () => {
    installCaseC();

    const { outcome } = await correct();
    expect(state.createdMatchIds).toHaveLength(1);

    // A second correction of the same target re-cancels/re-materialises exactly
    // once more, and still only ONE shared Match is ever attached to the slot.
    const second = await correct();
    expect(second.outcome.rematerialisedSharedMatchId).toBe(state.createdMatchIds[1]);
    expect(slot(TARGET_SLOT).match_id).toBe(state.createdMatchIds[1]);
    // The attach path itself is the idempotency guarantee: a target that already
    // carries a match_id is returned as `created: false` and creates nothing.
    expect(state.createdMatchIds).toHaveLength(2);
    expect(matchServiceMock.cancelTournamentMatch).toHaveBeenCalledTimes(2);
  });

  it('9. leaves no stale booking behind — the court release happens even when the release is a no-op', async () => {
    installCaseC();
    courtReservationMock.releaseCourt.mockResolvedValue({ released: false });

    const { outcome } = await correct();

    expect(courtReservationMock.releaseCourt).toHaveBeenCalledWith(TARGET_SHARED_MATCH);
    expect(outcome.courtReleased).toBe(false);
    // Reconciliation still completes: the release path is idempotent, so a
    // previously-released court is not an error.
    expect(slot(TARGET_SLOT).match_id).toBe(state.createdMatchIds[0]);
  });

  it('10. a cancelled downstream Match is still pre-start and therefore repairable', async () => {
    installStandardBracket({
      match_id: TARGET_SHARED_MATCH, participant1_id: 100, player1_id: 10, progression_state: 'cancelled',
    });
    installDownstreamMatch('cancelled');

    const { plan: p, outcome } = await correct();

    expect(p.case).toBe('C');
    expect(outcome.cancelledSharedMatchId).toBe(TARGET_SHARED_MATCH);
    expect(outcome.rematerialisedSharedMatchId).toBe(state.createdMatchIds[0]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11–16 · the guard
// ═══════════════════════════════════════════════════════════════════════════

describe('G8-D-KO-CORRECTION · guard — irreversible live-play boundary', () => {
  beforeEach(() => {
    installStandardBracket({ match_id: TARGET_SHARED_MATCH, participant1_id: 100, player1_id: 10 });
  });

  it.each([
    ['in_progress', null, 'downstream_match_in_progress'],
    ['completed', null, 'downstream_match_completed'],
    ['void', null, 'downstream_match_void'],
  ])('11. blocks when the downstream shared Match is %s', async (matchStatus, resultStatus, reason) => {
    installDownstreamMatch(matchStatus, resultStatus);

    await expect(plan()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_KNOCKOUT_CORRECTION_BLOCKED });
    expect(evaluateKnockoutCorrectionBlockReason({
      tournamentStatus: 'running', downstream: { matchStatus: matchStatus as any, resultSubmissionStatus: null },
    })).toBe(reason);
  });

  it('12. blocks when the downstream Match is closed but already holds a pending (submitted) result', async () => {
    installDownstreamMatch('closed', 'pending_confirmation');
    await expect(plan()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_KNOCKOUT_CORRECTION_BLOCKED });
  });

  it('13. blocks when the downstream Match is closed but already holds a disputed result', async () => {
    installDownstreamMatch('closed', 'disputed');
    await expect(plan()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_KNOCKOUT_CORRECTION_BLOCKED });
  });

  it('14. blocks when the downstream Match is closed but already holds an approved result', async () => {
    installDownstreamMatch('closed', 'approved');
    await expect(plan()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_KNOCKOUT_CORRECTION_BLOCKED });
  });

  it('15. blocks when the tournament itself is completed — even with no downstream target', async () => {
    installTournament({ status: 'completed' });
    installSlot(SOURCE_SLOT, {
      match_id: SOURCE_SHARED_MATCH, participant1_id: 100, participant2_id: 200,
      player1_id: 10, player2_id: 20, status: 'completed', progression_state: 'completed', winner_id: 10,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    });

    await expect(plan()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_KNOCKOUT_CORRECTION_BLOCKED });
    // Nothing was written and no Match was materialised.
    expect(state.createdMatchIds).toEqual([]);
  });

  it('16. allows every pre-start downstream status (the boundary is closed, not "any non-null match")', async () => {
    for (const st of ['open', 'full', 'closed', 'cancelled'] as const) {
      installDownstreamMatch(st);
      const p = await plan();
      expect(p.case).toBe('C');
      expect(p.targetSharedMatchId).toBe(TARGET_SHARED_MATCH);
    }
    // A downstream result that carries no score/outcome is not "in flight".
    installDownstreamMatch('closed', 'no_result');
    await expect(plan()).resolves.toMatchObject({ case: 'C' });
    installDownstreamMatch('closed', 'withdrawn');
    await expect(plan()).resolves.toMatchObject({ case: 'C' });
  });

  it('17. the guard is SCOPED to the derived bracket target — an unrelated live match never blocks', async () => {
    // A different round of the same tournament is in_progress. The guard only
    // ever inspects the target derived from progression_meta, so it must not
    // scan other tournament matches.
    installSlot(99, { round: 3, bracket_position: 0, match_id: 999, participant1_id: 300, player1_id: 30, status: 'in_progress' });
    matchServiceMock.inspectPreStartState.mockImplementation(async (matchId: number) => {
      if (matchId === 999) return { status: 'in_progress', result: { id: 5, submissionStatus: 'approved', outcome: 'completed' } };
      if (matchId === TARGET_SHARED_MATCH) return { status: 'closed', result: null };
      return null;
    });

    const p = await plan();
    expect(p.case).toBe('C');
    // Only the derived target was ever inspected.
    const inspected = matchServiceMock.inspectPreStartState.mock.calls.map((c) => c[0]);
    expect(inspected).toEqual([TARGET_SHARED_MATCH]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 18–21 · error contract, participant-awareness, atomicity & concurrency
// ═══════════════════════════════════════════════════════════════════════════

describe('G8-D-KO-CORRECTION · error contract', () => {
  it('18. throws a 409 CONFLICT carrying the dedicated code, with NO internal details exposed', async () => {
    installStandardBracket({ match_id: TARGET_SHARED_MATCH, participant1_id: 100, player1_id: 10 });
    installDownstreamMatch('in_progress');

    let thrown: any;
    try {
      await plan();
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.statusCode).toBe(409);
    expect(thrown.errorCode).toBe('CONFLICT');
    expect(thrown.code).toBe('TOURNAMENT_KNOCKOUT_CORRECTION_BLOCKED');
    expect(thrown.message).toBe(KNOCKOUT_CORRECTION_BLOCKED_MESSAGE);
    // No internal state (statuses, ids, participants, records) leaks to the client.
    expect(thrown.details).toBeUndefined();
    for (const leak of ['in_progress', 'completed', String(TARGET_SHARED_MATCH), String(TARGET_SLOT), 'resultId']) {
      expect(thrown.message).not.toContain(leak);
    }
  });

  it('18b. the guard predicate and the thrower are the single shared source of truth', () => {
    // Same function powers the read-only planner, the in-transaction re-verify,
    // and any future caller — there is no second, divergent guard.
    expect(evaluateKnockoutCorrectionBlockReason({ tournamentStatus: 'running', downstream: null })).toBeNull();
    expect(evaluateKnockoutCorrectionBlockReason({ tournamentStatus: 'completed', downstream: null })).toBe('tournament_completed');
    expect(KNOCKOUT_CORRECTION_BLOCKED_MATCH_STATUSES).toEqual(['in_progress', 'completed', 'void']);
    expect(KNOCKOUT_CORRECTION_BLOCKED_RESULT_STATUSES).toEqual(['pending_confirmation', 'disputed', 'approved']);
    expect(() => throwKnockoutCorrectionBlocked('downstream_match_void')).toThrow(KNOCKOUT_CORRECTION_BLOCKED_MESSAGE);
  });
});

describe('G8-D-KO-CORRECTION · participant-aware winner resolution', () => {
  it('19. resolves a DOUBLES winner from the participant roster, not from a two-player assumption', async () => {
    // Source is a doubles match: side home = pair 101 (users 10,11), away = pair 201 (20,21).
    installPairBracket(
      { participant1_id: 101, participant2_id: 201, player1_id: 10, player2_id: 20 },
      { match_id: null, participant1_id: 101, player1_id: 10 },
    );

    const p = await plan([
      { userId: 10, side: 'home', outcome: 'loss' },
      { userId: 11, side: 'home', outcome: 'loss' },
      { userId: 20, side: 'away', outcome: 'win' },
      { userId: 21, side: 'away', outcome: 'win' },
    ]);

    // The whole doubles PAIR advances, keyed by the authoritative participant id.
    expect(p.winnerParticipantId).toBe(201);
    expect(p.winnerPrimaryUserId).toBe(20);
  });

  it('19b. resolves a TEAM winner with a 3-member roster and seats the roster intact downstream', async () => {
    // CASE C: the downstream R2 slot already holds a repairable shared Match.
    installPairBracket(
      { participant1_id: 102, participant2_id: 202, player1_id: 10, player2_id: 20 },
      { match_id: TARGET_SHARED_MATCH },
    );
    installDownstreamMatch('closed');

    const p = await plan([
      { userId: 10, side: 'home', outcome: 'loss' },
      { userId: 11, side: 'home', outcome: 'loss' },
      { userId: 12, side: 'home', outcome: 'loss' },
      { userId: 20, side: 'away', outcome: 'win' },
      { userId: 21, side: 'away', outcome: 'win' },
      { userId: 22, side: 'away', outcome: 'win' },
    ]);
    expect(p.winnerParticipantId).toBe(202);
    expect(p.winnerPrimaryUserId).toBe(20);

    await svc.reconcileKnockoutResultCorrection(p, vi.fn(async () => undefined) as any);

    // The re-materialised Match is built from the FULL roster, never a single member.
    const created = matchServiceMock.createForTournament.mock.calls[0][0] as any;
    expect(created.participants.map((x: any) => x.userId)).toEqual([20, 21, 22, 30]);
    expect(created.participants.map((x: any) => x.side)).toEqual(['home', 'home', 'home', 'away']);
    expect(created.participants.map((x: any) => x.teamIndex)).toEqual([0, 0, 0, 1]);
  });

  it('19c. a winner that cannot be mapped to exactly one participant is refused, never silently treated as "no winner"', async () => {
    installStandardBracket({ match_id: null, participant1_id: 100, player1_id: 10 });

    // The winning side claims a user who is not a member of the source's participant.
    await expect(plan([
      { userId: 10, side: 'home', outcome: 'loss' },
      { userId: 999, side: 'away', outcome: 'win' },
    ])).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_PROGRESSION_AMBIGUOUS_WINNER });
  });
});

describe('G8-D-KO-CORRECTION · atomicity, concurrency & idempotency', () => {
  it('20. re-verifies the guard INSIDE the transaction and writes nothing when the downstream match started meanwhile', async () => {
    installStandardBracket({ match_id: TARGET_SHARED_MATCH, participant1_id: 100, player1_id: 10 });
    installDownstreamMatch('closed');

    const p = await plan();
    expect(p.case).toBe('C');

    // The boundary is crossed after the plan was produced.
    installDownstreamMatch('in_progress');

    const write = vi.fn(async () => undefined);
    await expect(svc.reconcileKnockoutResultCorrection(p, write as any))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_KNOCKOUT_CORRECTION_BLOCKED });

    expect(write).not.toHaveBeenCalled();
    expect(state.rollbacks).toBe(1);
    expect(state.commits).toBe(0);
    // The bracket is untouched.
    expect(slot(TARGET_SLOT).participant1_id).toBe(100);
    expect(slot(SOURCE_SLOT).winner_id).toBe(10);
  });

  it('21. locks both the source and the target slot FOR UPDATE, in the SAME order forward progression uses', async () => {
    installStandardBracket({ match_id: null, participant1_id: 100, player1_id: 10 });

    await correct();

    const locked = repo.lockMatchById.mock.calls.map((c) => c[0]);
    expect(locked).toContain(TARGET_SLOT);
    expect(locked).toContain(SOURCE_SLOT);
    // Every lock is taken on the reconciling connection, and SOURCE is locked
    // BEFORE target — the same order `progressFromApprovedResult` establishes
    // (source update, then target update). A consistent global order is what
    // keeps a correction racing an in-flight progression from deadlocking.
    expect(repo.lockMatchById.mock.calls.every((c) => c[1] === fakeConn)).toBe(true);
    expect(locked.indexOf(SOURCE_SLOT)).toBeLessThan(locked.indexOf(TARGET_SLOT));
  });

  it('21b. refuses to commit a source-only correction when the downstream slot vanished', async () => {
    installStandardBracket({ match_id: null, participant1_id: 100, player1_id: 10 });

    const p = await plan();
    state.slots.delete(TARGET_SLOT);

    const write = vi.fn(async () => undefined);
    await expect(svc.reconcileKnockoutResultCorrection(p, write as any)).rejects.toBeDefined();
    expect(write).not.toHaveBeenCalled();
    expect(state.rollbacks).toBe(1);
  });
});

describe('G8-D-KO-CORRECTION · realtime + audit (post-commit only, existing events)', () => {
  it('22. emits the EXISTING progression/lifecycle events, and nothing before the commit', async () => {
    installStandardBracket({ match_id: TARGET_SHARED_MATCH, participant1_id: 100, player1_id: 10, progression_state: 'ready' });
    installDownstreamMatch('closed');

    const emitOrder: string[] = [];
    bus.emit.mockImplementation((type: string) => { emitOrder.push(type); });
    fakeConn.commit.mockImplementation(async () => {
      state.commits += 1;
      emitOrder.push('COMMIT');
    });

    await correct();

    expect(emitOrder.indexOf('COMMIT')).toBeLessThan(emitOrder.indexOf('tournament:match-progressed'));
    // No new event type: the bracket/standings/detail invalidation rides on the
    // two existing events only.
    const types = emitOrder.filter((t) => t !== 'COMMIT');
    expect(new Set(types)).toEqual(new Set(['tournament:match-progressed', 'tournament:match-created', 'tournament:updated']));
  });

  it('22b. the match-progressed payload invalidates the bracket AND the standings', async () => {
    installStandardBracket({ match_id: null, participant1_id: 100, player1_id: 10 });

    await correct();

    const progressed = state.events.find((e) => e.type === 'tournament:match-progressed');
    expect(progressed).toBeDefined();
    expect(progressed!.payload).toMatchObject({
      tournamentId: 1, fromSlotId: SOURCE_SLOT, toSlotId: TARGET_SLOT, winnerId: 20, corrected: true,
    });
    const updated = state.events.find((e) => e.type === 'tournament:updated');
    expect(updated!.payload).toMatchObject({ tournamentId: 1, standings: true, bracket: true });
  });

  it('22c. CASE A emits no bracket event at all (nothing downstream changed)', async () => {
    installSlot(SOURCE_SLOT, {
      match_id: SOURCE_SHARED_MATCH, participant1_id: 100, participant2_id: 200,
      player1_id: 10, player2_id: 20, status: 'completed', progression_state: 'completed', winner_id: 10,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
    });

    await correct();

    expect(state.events.map((e) => e.type)).toEqual([]);
    // The correction is still audited so the reconciliation is traceable.
    expect(state.audit.map((a) => a.action)).toContain('TOURNAMENT.KNOCKOUT_CORRECTION_RECONCILED');
  });

  it('23. audits the reconciliation with the EXISTING audit infrastructure (no new action, no new table)', async () => {
    installStandardBracket({ match_id: TARGET_SHARED_MATCH, participant1_id: 100, player1_id: 10, progression_state: 'ready' });
    installDownstreamMatch('closed');

    await correct();

    const entry = state.audit.find((a) => a.action === 'TOURNAMENT.KNOCKOUT_CORRECTION_RECONCILED');
    expect(entry).toBeDefined();
    expect(entry.entityType).toBe('tournament_match');
    expect(entry.afterState).toMatchObject({
      case: 'C', source_slot_id: SOURCE_SLOT, target_slot_id: TARGET_SLOT, target_side: 'player1',
      previous_target_participant_id: 100, winner_participant_id: 200,
    });
  });

  it('23b. reuses the existing bracket-cancellation audit and emits no financial/rating/settlement side effect', async () => {
    installStandardBracket({ match_id: TARGET_SHARED_MATCH, participant1_id: 100, player1_id: 10, progression_state: 'ready' });
    installDownstreamMatch('closed');

    await correct();

    // The reconciler never touches rating, payments, wallets or prizes. Standings
    // recomputation remains the `match:result-corrected` listener's job, so it is
    // not duplicated here.
    expect(repo.recalculateStandings).not.toHaveBeenCalled();
    expect(bus.emit.mock.calls.map((c) => c[0]).filter((t) => String(t).includes('payment'))).toEqual([]);
    expect(bus.emit.mock.calls.map((c) => c[0]).filter((t) => String(t).includes('rating'))).toEqual([]);
  });
});
