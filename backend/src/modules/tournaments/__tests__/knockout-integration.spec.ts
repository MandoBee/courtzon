import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assignKnockoutSeeding, validateKnockoutPairing, type GskSeedInput } from '../domain/knockout-seeding.js';
import { KnockoutTransitionService } from '../application/knockout-transition.service.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic seeding (pure)
// ─────────────────────────────────────────────────────────────────────────────
describe('assignKnockoutSeeding — deterministic constraints', () => {
  function winnersAndRunners(groups: number): GskSeedInput[] {
    const inputs: GskSeedInput[] = [];
    for (let g = 0; g < groups; g++) {
      const groupId = 10 + g;
      inputs.push({ participantId: g * 2 + 1, groupId, groupRank: 1, qualificationType: 'group_position', seed: g * 2 + 1 });
      inputs.push({ participantId: g * 2 + 2, groupId, groupRank: 2, qualificationType: 'group_position', seed: g * 2 + 2 });
    }
    return inputs;
  }

  it('produced order has NO first-round pair with two group winners (separateGroupWinners)', () => {
    const order = assignKnockoutSeeding(winnersAndRunners(8), { separateGroupWinners: true, preventSameGroupRematch: true });
    const byId = new Map(winnersAndRunners(8).map((i) => [i.participantId, i]));
    for (let i = 0; i < order.length; i += 2) {
      const a = byId.get(order[i])!;
      const b = byId.get(order[i + 1]);
      if (b) {
        const aWin = a.qualificationType === 'group_position' && a.groupRank === 1;
        const bWin = b.qualificationType === 'group_position' && b.groupRank === 1;
        expect(aWin && bWin).toBe(false);
        expect(a.groupId).not.toBe(b.groupId);
      }
    }
  });

  it('seeds 8 winners + 8 runners into distinct pairs (16 → R16)', () => {
    const order = assignKnockoutSeeding(winnersAndRunners(8), { separateGroupWinners: true, preventSameGroupRematch: true });
    expect(order.length).toBe(16);
    expect(new Set(order).size).toBe(16);
  });

  it('rejects when winners exceed first-round pairs (impossible separation)', () => {
    const inputs = winnersAndRunners(2); // 4 participants → 2 pairs but 2 winners? winners=2==pairs ok; use top1 only: 4 groups × 1 winner
    const onlyWinners = inputs.map((i, idx) => ({ ...i, groupRank: 1, participantId: idx + 1 }));
    expect(() => assignKnockoutSeeding(onlyWinners, { separateGroupWinners: true, preventSameGroupRematch: true }))
      .toThrow(/separateGroupWinners/);
  });

  it('is fully deterministic (same input ⇒ same order)', () => {
    const inputs = winnersAndRunners(8);
    const a = assignKnockoutSeeding(inputs, { separateGroupWinners: true, preventSameGroupRematch: true });
    const b = assignKnockoutSeeding(inputs, { separateGroupWinners: true, preventSameGroupRematch: true });
    expect(a).toEqual(b);
  });

  it('validateKnockoutPairing rejects a manual ordering that collides same-group', () => {
    const inputs = winnersAndRunners(2);
    const byId = new Map(inputs.map((i) => [i.participantId, i]));
    // 1 & 2 are the same group (A): order them adjacently.
    expect(() => validateKnockoutPairing([1, 2, 3, 4], byId, { separateGroupWinners: true, preventSameGroupRematch: true }))
      .toThrow(/preventSameGroupRematch/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// KnockoutTransitionService (mocked persistence)
// ─────────────────────────────────────────────────────────────────────────────
const __state = vi.hoisted(() => ({
  tournament: { id: 9, status: 'running', sport_id: 22 },
  groupStage: {
    id: 5, tournament_id: 9, competition_id: 1, stage_order: 1, name: 'Group Stage', progression_format: 'round_robin',
    match_format_id: 2, rule_set_id: 3, advance_count: 2, status: 'pending',
    config: {
      format: 'group_stage_knockout',
      groupStage: { groupCount: 8, participantsPerGroup: 4, format: 'round_robin', qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'rank' } },
      knockout: { startingRound: 'round_of_16', seeding: 'automatic', separateGroupWinners: true, preventSameGroupRematch: true, allowByes: false },
    },
  },
  qualified: [] as any[],
  participants: [] as any[],
  matchRows: [] as any[],
  createdStages: [] as any[],
  nextStageId: 50,
  nextMatchId: 1,
  sharedMatches: 0,
  stageMatchCount: 0,
  conn: {},
}));

const tournRepo = vi.hoisted(() => ({
  findStages: vi.fn(),
  createStage: vi.fn(),
  countStageMatches: vi.fn(),
  createMatch: vi.fn(),
  updateStatus: vi.fn(),
  updateMatch: vi.fn(),
}));
vi.mock('../infrastructure/repositories/tournament.repository', () => ({ tournamentRepository: tournRepo }));

const pdRepo = vi.hoisted(() => ({ listParticipantsByCompetition: vi.fn() }));
vi.mock('../infrastructure/repositories/participant-draw.repository', () => ({ participantDrawRepository: pdRepo }));

const matchSvc = vi.hoisted(() => ({ createForTournament: vi.fn() }));
vi.mock('../../match/application/services/match.service', () => ({ matchService: matchSvc }));

const tournSvc = vi.hoisted(() => ({ getByIdDetailed: vi.fn(), resolveMatchFormatContext: vi.fn(), advanceByes: vi.fn(async () => ({ advanced: 0 })) }));
vi.mock('../application/tournament.service', () => ({ tournamentService: tournSvc }));

const compSvc = vi.hoisted(() => ({ resolveRegistrationCompetition: vi.fn(async () => ({ id: 1 })) }));
vi.mock('../application/competition.service', () => ({ competitionService: compSvc }));

const qualSvc = vi.hoisted(() => ({ qualifyGroupStage: vi.fn() }));
vi.mock('../application/qualification.service', () => ({ qualificationService: qualSvc }));

vi.mock('../../../database/mysql', () => ({ getPool: vi.fn(() => ({ getConnection: vi.fn(async () => __state.conn) })) }));
vi.mock('../../../database/database.transaction', () => ({ runProvidedTransaction: vi.fn(async (_c: any, fn: () => Promise<void>) => { await fn(); }) }));
vi.mock('../../audit-log/index', () => ({ recordAudit: vi.fn() }));
vi.mock('../../../shared/event-bus/event-bus.v2', () => ({ eventBusV2: { emit: vi.fn() } }));
vi.mock('../application/tournament-realtime-scope', () => ({ tournamentRealtimeScope: () => ({}) }));

/** Qualified fixture: groupCount groups, topPerGroup per group → participant ids sequential. */
function makeQualified(groupCount: number, topPerGroup: number, extraThirds = 0) {
  const list: any[] = [];
  let pid = 1;
  for (let g = 0; g < groupCount; g++) {
    const groupId = 10 + g;
    for (let r = 1; r <= topPerGroup; r++) {
      list.push({ participantId: pid, groupId, groupRank: r, qualificationType: 'group_position', qualificationRank: list.length + 1, seed: pid, points: 3 });
      pid++;
    }
  }
  for (let i = 0; i < extraThirds; i++) {
    list.push({ participantId: pid, groupId: 10 + i, groupRank: 3, qualificationType: 'best_third', qualificationRank: list.length + 1, seed: pid, points: 1 });
    pid++;
  }
  return list;
}

function setup(qualified: any[], knockoutOverrides: Record<string, unknown> = {}, participantsCount = 0) {
  __state.qualified = qualified;
  __state.groupStage.config.knockout = {
    startingRound: 'round_of_16', seeding: 'automatic', separateGroupWinners: true, preventSameGroupRematch: true, allowByes: false, ...knockoutOverrides,
  };
  const count = participantsCount || qualified.length;
  __state.participants = Array.from({ length: count }, (_, i) => ({
    id: i + 1, tournament_id: 9, competition_id: 1, registration_id: 1000 + i, status: 'active',
    member_user_ids: [(i + 1) * 100], seed_number: i + 1,
  }));
  pdRepo.listParticipantsByCompetition.mockResolvedValue(__state.participants as any);
  qualSvc.qualifyGroupStage.mockResolvedValue({ tournamentId: 9, stageId: 5, qualified, totalQualified: qualified.length });
}

function resetPersistence() {
  __state.matchRows = [];
  __state.createdStages = [];
  __state.nextStageId = 50;
  __state.nextMatchId = 1;
  __state.sharedMatches = 0;
  tournRepo.findStages.mockImplementation(async () => [JSON.parse(JSON.stringify(__state.groupStage))]);
  tournRepo.createStage.mockImplementation(async (data: any) => {
    __state.createdStages.push(data);
    const id = __state.nextStageId++;
    __state.stageId = id;
    return id;
  });
  tournRepo.countStageMatches.mockResolvedValue(__state.stageMatchCount);
  tournRepo.createMatch.mockImplementation(async (data: any) => {
    __state.matchRows.push(data);
    __state.stageId = data.stage_id;
    return __state.nextMatchId++;
  });
  matchSvc.createForTournament.mockImplementation(async () => ({ id: ++__state.sharedMatches }));
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.conn = { query: vi.fn(async () => []), release: vi.fn() };
  __state.stageMatchCount = 0;
  __state.stageId = 50;
  resetPersistence();
  tournSvc.getByIdDetailed.mockResolvedValue({ ...__state.tournament });
  tournSvc.resolveMatchFormatContext.mockResolvedValue({ formatId: 2, ruleSetId: 3, formatSnapshot: {}, ruleSnapshot: {} });
});

function runTransition() {
  return new KnockoutTransitionService().introduceKnockoutStage(9, 5, 1);
}

describe('KnockoutTransitionService — GSK → knockout (backed by the existing generator)', () => {
  it('16 qualified (8×4 top 2) → one R16 knockout stage, 15 matches, all with stage_id + bracket metadata', async () => {
    setup(makeQualified(8, 2));
    const res = await runTransition();
    expect(res.bracketSize).toBe(16);
    expect(res.participants).toBe(16);
    expect(__state.createdStages.length).toBe(1);
    expect(__state.createdStages[0].progression_format).toBe('knockout');
    expect(__state.createdStages[0].stage_order).toBe(2);
    expect(__state.createdStages[0].config).toEqual(__state.groupStage.config);
    expect(__state.matchRows.length).toBe(15);
    for (const m of __state.matchRows) {
      expect(m.stage_id).toBe(50);
      expect(m.progression_meta.is_bracket).toBe(true);
    }
  });

  it('4 qualified (2 groups × top 2) → semifinal bracket of 3 matches', async () => {
    setup(makeQualified(2, 2), { startingRound: 'semifinals' });
    const res = await runTransition();
    expect(res.bracketSize).toBe(4);
    expect(__state.matchRows.length).toBe(3);
  });

  it('2 qualified (1 group × top 2) → final bracket of 1 match', async () => {
    setup(makeQualified(1, 2), { startingRound: 'final', preventSameGroupRematch: false, separateGroupWinners: false });
    const res = await runTransition();
    expect(res.bracketSize).toBe(2);
    expect(__state.matchRows.length).toBe(1);
  });

  it('20 qualified against round_of_16 is explicitly rejected (no silent play-in conversion)', async () => {
    setup(makeQualified(8, 2, 4));
    await expect(runTransition()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_KNOCKOUT_CONFIG_INVALID });
  });

  it('allowByes=false + non-power-of-two first_valid_round is rejected; allowByes=true is accepted with safe byes', async () => {
    setup(makeQualified(6, 2), { startingRound: 'first_valid_round', allowByes: false }); // 12 qualified
    await expect(runTransition()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_KNOCKOUT_CONFIG_INVALID });

    setup(makeQualified(6, 2), { startingRound: 'first_valid_round', allowByes: true });
    const res = await runTransition();
    expect(res.bracketSize).toBe(16);
    expect(__state.matchRows.length).toBe(15);
    expect(tournSvc.advanceByes).toHaveBeenCalled();
    // Safe bye mechanism: 6 real round-1 matches (shared match) + explicit bye slots.
    const withShared = __state.matchRows.filter((m: any) => m.match_id != null).length;
    const byeRows = __state.matchRows.filter((m: any) => m.match_number === 0).length;
    expect(withShared).toBe(6);
    expect(byeRows).toBeGreaterThanOrEqual(2); // two final padding pairs are explicit byes
  });

  it('startingRound mismatch (Q=16 into quarterfinals) is rejected', async () => {
    setup(makeQualified(8, 2), { startingRound: 'quarterfinals' });
    await expect(runTransition()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_KNOCKOUT_CONFIG_INVALID });
  });

  it('playInRounds > 0 is rejected as unsupported', async () => {
    setup(makeQualified(8, 2), { startingRound: 'round_of_16', playInRounds: 2 });
    await expect(runTransition()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_KNOCKOUT_CONFIG_INVALID });
  });

  it('automatic seeding is deterministic (identical createMatch order on repeat)', async () => {
    setup(makeQualified(8, 2));
    await runTransition();
    const firstOrder = __state.matchRows.map((m: any) => `${m.participant1_id ?? '-'}/${m.participant2_id ?? '-'}`).join('|');
    resetPersistence();
    setup(makeQualified(8, 2));
    await runTransition();
    const secondOrder = __state.matchRows.map((m: any) => `${m.participant1_id ?? '-'}/${m.participant2_id ?? '-'}`).join('|');
    expect(secondOrder).toBe(firstOrder);
  });

  it('manual seeding is honored; missing manual seed is rejected', async () => {
    setup(makeQualified(8, 2), { seeding: 'manual', separateGroupWinners: false, preventSameGroupRematch: false });
    await runTransition(); // every fixture participant has seed_number → valid
    expect(__state.matchRows.length).toBe(15);

    setup(makeQualified(8, 2), { seeding: 'manual' });
    __state.participants[0].seed_number = null;
    pdRepo.listParticipantsByCompetition.mockResolvedValue(__state.participants as any);
    await expect(runTransition()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_KNOCKOUT_CONFIG_INVALID });
  });

  it('impossible group constraints (4 groups top-1 winners) are rejected', async () => {
    setup(makeQualified(4, 1), { startingRound: 'semifinals' });
    await expect(runTransition()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_KNOCKOUT_CONFIG_INVALID });
  });

  it('reused existing knockout stage (no duplicate stage) and rejects a second match generation', async () => {
    // Existing knockout stage present → reuses it, no createStage call.
    setup(makeQualified(8, 2));
    tournRepo.findStages.mockImplementation(async () => [
      JSON.parse(JSON.stringify(__state.groupStage)),
      { id: 60, tournament_id: 9, competition_id: 1, stage_order: 2, name: 'Knockout', progression_format: 'knockout', status: 'pending', config: __state.groupStage.config },
    ]);
    const res = await runTransition();
    expect(__state.createdStages.length).toBe(0);
    expect(res.stageId).toBe(60);
    expect(__state.matchRows.length).toBe(15);

    // Second run with matches already present → conflict (no duplicates).
    tournRepo.countStageMatches.mockResolvedValue(15);
    await expect(runTransition()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_MATCHES_ALREADY_GENERATED });
  });

  it('concurrent protection: no duplicate generation (stage match guard after FOR UPDATE)', async () => {
    setup(makeQualified(8, 2));
    tournRepo.countStageMatches.mockResolvedValueOnce(0).mockResolvedValueOnce(15);
    const first = await runTransition();
    expect(first.matches).toBe(15);
    await expect(runTransition()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_MATCHES_ALREADY_GENERATED });
  });

  it('every qualified participant appears exactly once; no fake/null real participants; no tournament completion', async () => {
    setup(makeQualified(8, 2));
    await runTransition();
    const real = __state.matchRows.filter((m: any) => m.match_id != null);
    const ids = real.flatMap((m: any) => [Number(m.participant1_id), Number(m.participant2_id)]).filter((x: number) => x > 0);
    expect(ids.length).toBe(16);
    expect(new Set(ids).size).toBe(16);
    expect(ids.some((x: number) => !Number.isFinite(x) || x <= 0)).toBe(false);
    expect(tournRepo.updateStatus).not.toHaveBeenCalled();
    expect(tournRepo.updateMatch).not.toHaveBeenCalled(); // group-stage matches untouched
  });

  it('knowledge of starter: generated matches carry valid progression targets (bracket wiring)', async () => {
    setup(makeQualified(8, 2));
    await runTransition();
    for (const m of __state.matchRows) {
      const meta = m.progression_meta;
      expect(meta.is_bracket).toBe(true);
      if (m.match_id != null) {
        expect(['player1', 'player2']).toContain(meta.target_side);
      }
    }
  });
});