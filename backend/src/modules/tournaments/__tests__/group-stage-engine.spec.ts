import { describe, it, expect, vi, beforeEach } from 'vitest';
import { planGroupMemberCounts, assignGroupsDeterministic } from '../domain/group-stage.js';
import { GroupStageService } from '../application/group-stage.service.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Pure planning helpers
// ─────────────────────────────────────────────────────────────────────────────
describe('Group Stage — pure planning (deterministic, validated)', () => {
  it('4 participants / 1 group → 1 group of 4 (6 RR matches)', () => {
    expect(planGroupMemberCounts(4, 1, 4)).toEqual([4]);
  });

  it('8 participants / 2 groups × 4 → 4+4', () => {
    expect(planGroupMemberCounts(8, 2, 4)).toEqual([4, 4]);
  });

  it('16 participants / 4 groups × 4 → 4+4+4+4', () => {
    expect(planGroupMemberCounts(16, 4, 4)).toEqual([4, 4, 4, 4]);
  });

  it('allows a smaller final group (established convention)', () => {
    expect(planGroupMemberCounts(20, 2, 11).reduce((a, b) => a + b, 0)).toBe(20);
    expect(Math.max(...planGroupMemberCounts(20, 8, 4))).toBe(3); // 20 / 8 → groups of 3/2
  });

  it('rejects groupCount < 1', () => {
    expect(() => planGroupMemberCounts(4, 0, 4)).toThrow(/groupCount/);
  });

  it('rejects participantsPerGroup < 2', () => {
    expect(() => planGroupMemberCounts(4, 1, 1)).toThrow(/participantsPerGroup/);
  });

  it('rejects too few participants for the requested groups', () => {
    // 4 participants into 3 groups would leave a group with < 2.
    expect(() => planGroupMemberCounts(4, 3, 4)).toThrow(/at least 2/);
  });

  it('rejects participant count exceeding group capacity', () => {
    expect(() => planGroupMemberCounts(9, 2, 4)).toThrow(/capacity/);
  });

  it('assigns deterministically: same seed → identical membership', () => {
    const inputs = Array.from({ length: 8 }, (_, i) => ({ id: i + 1 }));
    const a = assignGroupsDeterministic(inputs, 42, [4, 4]).map((g) => g.map((m) => m.id));
    const b = assignGroupsDeterministic(inputs, 42, [4, 4]).map((g) => g.map((m) => m.id));
    expect(a).toEqual(b);
  });

  it('a different seed produces a different valid assignment when the algorithm varies', () => {
    const inputs = Array.from({ length: 8 }, (_, i) => ({ id: i + 1 }));
    const base = assignGroupsDeterministic(inputs, 0, [4, 4]).flat().map((m) => m.id).join(',');
    const differs = Array.from({ length: 40 }, (_, seed) => seed + 1).some((seed) => {
      const flat = assignGroupsDeterministic(inputs, seed, [4, 4]).flat().map((m) => m.id).join(',');
      return flat !== base;
    });
    expect(differs).toBe(true);
  });

  it('no participant is omitted and none appears in two groups', () => {
    const inputs = Array.from({ length: 8 }, (_, i) => ({ id: i + 1 }));
    const groups = assignGroupsDeterministic(inputs, 7, [4, 4]);
    const all = groups.flat().map((m) => m.id).sort((a, b) => a - b);
    expect(all).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(all).size).toBe(8);
    for (const g of groups) expect(new Set(g.map((m) => m.id)).size).toBe(g.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GroupStageService — unit tests (mocked persistence)
// ─────────────────────────────────────────────────────────────────────────────
const __state = vi.hoisted(() => ({
  tournament: { id: 9, status: 'registration_closed', draw_seed: 1234, sport_id: 22 },
  stage: { id: 5, tournament_id: 9, competition_id: 1, stage_order: 1, name: 'Group Stage', progression_format: 'round_robin', advance_count: 2, status: 'pending', config: { format: 'group_stage_knockout', groupStage: { groupCount: 2, participantsPerGroup: 4, format: 'round_robin', qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'seed' } }, knockout: { startingRound: 'round_of_16', seeding: 'automatic', separateGroupWinners: true, preventSameGroupRematch: true, allowByes: false } } },
  participants: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, tournament_id: 9, competition_id: 1, registration_id: 100 + i, status: 'active', seed_number: i + 1 })),
  conn: {},
  matchRows: [] as any[],
  groupIds: [] as number[],
  createdGroups: 0,
  createdMembers: 0,
  createdMatches: 0,
  sharedMatchIds: 0,
  groupQueryResult: [] as any[],
}));

vi.mock('../../../database/mysql', () => ({
  getPool: vi.fn(() => ({ getConnection: vi.fn(async () => __state.conn) })),
}));

vi.mock('../../../database/database.transaction', () => ({
  runProvidedTransaction: vi.fn(async (_conn: any, fn: () => Promise<void>) => { await fn(); }),
}));

vi.mock('../../audit-log/index', () => ({ recordAudit: vi.fn() }));

vi.mock('../../match/application/services/match.service', () => ({
  matchService: { createForTournament: vi.fn(async () => ({ id: ++__state.sharedMatchIds })) },
}));

const tournamentServiceMock = vi.hoisted(() => ({
  getByIdDetailed: vi.fn(),
  resolveMatchFormatContext: vi.fn(async () => ({ formatId: 3, ruleSetId: 4, formatSnapshot: {}, ruleSnapshot: {} })),
}));
vi.mock('../application/tournament.service', () => ({ tournamentService: tournamentServiceMock }));

const competitionServiceMock = vi.hoisted(() => ({
  resolveRegistrationCompetition: vi.fn(async () => ({ id: 1 })),
}));
vi.mock('../application/competition.service', () => ({ competitionService: competitionServiceMock }));

const tournRepo = vi.hoisted(() => ({
  findStages: vi.fn(),
  findGroups: vi.fn(),
  createGroup: vi.fn(),
  addGroupMember: vi.fn(),
  createMatch: vi.fn(),
}));
vi.mock('../infrastructure/repositories/tournament.repository', () => ({ tournamentRepository: tournRepo }));

const pdRepo = vi.hoisted(() => ({
  listParticipantsByCompetition: vi.fn(),
}));
vi.mock('../infrastructure/repositories/participant-draw.repository', () => ({ participantDrawRepository: pdRepo }));

const pmRepo = vi.hoisted(() => ({
  listMembersByParticipant: vi.fn(),
}));
vi.mock('../infrastructure/repositories/participant-member.repository', () => ({ participantMemberRepository: pmRepo }));

vi.mock('../../../shared/event-bus/event-bus.v2', () => ({ eventBusV2: { emit: vi.fn() } }));
vi.mock('../application/tournament-realtime-scope', () => ({ tournamentRealtimeScope: () => ({}) }));

function setupParticipants(count: number) {
  __state.participants = Array.from({ length: count }, (_, i) => ({ id: i + 1, tournament_id: 9, competition_id: 1, registration_id: 100 + i, status: 'active', seed_number: i + 1 }));
  pdRepo.listParticipantsByCompetition.mockResolvedValue(__state.participants as any);
}

function resetPersistence() {
  __state.matchRows = [];
  __state.groupIds = [];
  __state.createdGroups = 0;
  __state.createdMembers = 0;
  __state.createdMatches = 0;
  __state.sharedMatchIds = 0;
  tournRepo.createGroup.mockImplementation(async (data: any) => {
    __state.createdGroups += 1;
    const id = __state.createdGroups;
    __state.groupIds.push(id);
    return id;
  });
  tournRepo.addGroupMember.mockImplementation(async () => { __state.createdMembers += 1; return 1; });
  tournRepo.createMatch.mockImplementation(async (data: any) => {
    __state.createdMatches += 1;
    __state.matchRows.push(data);
    return __state.createdMatches;
  });
  (pmRepo.listMembersByParticipant as any).mockImplementation(async (pid: number) => [{ user_id: pid * 100, status: 'active' }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.conn = { query: vi.fn(async () => []), release: vi.fn() };
  resetPersistence();
  resetStage();
  tournamentServiceMock.getByIdDetailed.mockResolvedValue({ ...__state.tournament });
  tournRepo.findStages.mockImplementation(async () => [{ ...__state.stage }]);
  tournRepo.findGroups.mockResolvedValue([]);
});

function resetStage() {
  __state.stage = {
    id: 5, tournament_id: 9, competition_id: 1, stage_order: 1, name: 'Group Stage', progression_format: 'round_robin', advance_count: 2, status: 'pending',
    config: { format: 'group_stage_knockout', groupStage: { groupCount: 2, participantsPerGroup: 4, format: 'round_robin', qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'seed' } }, knockout: { startingRound: 'round_of_16', seeding: 'automatic', separateGroupWinners: true, preventSameGroupRematch: true, allowByes: false } },
  };
}

async function runStage() {
  return new GroupStageService().generateGroupStage(9, 5, 1);
}

describe('GroupStageService — group + round robin match generation', () => {
  it('4 participants / 1 group → 1 group, 6 RR matches', async () => {
    resetStage();
    __state.stage.config.groupStage.groupCount = 1;
    setupParticipants(4);
    const res = await runStage();
    expect(res.groups).toBe(1);
    expect(__state.createdGroups).toBe(1);
    expect(__state.createdMembers).toBe(4);
    expect(__state.createdMatches).toBe(6);
  });

  it('8 participants / 2 groups × 4 → 2 groups, 12 matches (6 each)', async () => {
    setupParticipants(8);
    const res = await runStage();
    expect(res.groups).toBe(2);
    expect(res.members).toBe(8);
    expect(res.matches).toBe(12);
    expect(__state.createdGroups).toBe(2);
    expect(__state.createdMembers).toBe(8);
    const perGroup = new Map<number, number>();
    for (const m of __state.matchRows) perGroup.set(Number(m.group_id), (perGroup.get(Number(m.group_id)) ?? 0) + 1);
    expect([...perGroup.values()].sort()).toEqual([6, 6]);
    // advance_count mirrors topPerGroup
    expect(tournRepo.createGroup.mock.calls[0][0].advance_count).toBe(2);
  });

  it('16 participants / 4 groups × 4 → 4 groups, 24 matches', async () => {
    resetStage();
    __state.stage.config.groupStage.groupCount = 4;
    setupParticipants(16);
    const res = await runStage();
    expect(res.groups).toBe(4);
    expect(res.matches).toBe(24);
  });

  it('every group match carries stage_id and a non-null group_id', async () => {
    setupParticipants(8);
    await runStage();
    expect(__state.matchRows.length).toBeGreaterThan(0);
    for (const m of __state.matchRows) {
      expect(Number(m.stage_id)).toBe(5);
      expect(m.group_id).not.toBeNull();
      expect(m.group_id).toBeGreaterThan(0);
    }
  });

  it('rejects a non-group (knockout) stage', async () => {
    resetStage();
    __state.stage.progression_format = 'knockout';
    setupParticipants(8);
    await expect(runStage()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_GROUP_STAGE_INVALID });
  });

  it('rejects a stage without GSK configuration', async () => {
    resetStage();
    __state.stage.config = null;
    setupParticipants(8);
    await expect(runStage()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_GROUP_STAGE_INVALID });
  });

  it('rejects generation on a completed stage', async () => {
    resetStage();
    __state.stage.status = 'completed';
    setupParticipants(8);
    await expect(runStage()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_GROUP_STAGE_INVALID });
  });

  it('rejects generation outside the registration_closed/running lifecycle window', async () => {
    tournamentServiceMock.getByIdDetailed.mockResolvedValue({ ...__state.tournament, status: 'registration_open' });
    setupParticipants(8);
    await expect(runStage()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_STATUS });
  });

  it('rejects a participant count that violates the group configuration', async () => {
    resetStage();
    __state.stage.config.groupStage.participantsPerGroup = 2; // 8 into 2 groups × 2 is impossible
    setupParticipants(8);
    await expect(runStage()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_GROUP_CONFIG_INVALID });
  });

  it('rejects when a group participant has no registration', async () => {
    setupParticipants(8);
    __state.participants[0].registration_id = null;
    pdRepo.listParticipantsByCompetition.mockResolvedValue(__state.participants as any);
    await expect(runStage()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_GROUP_STAGE_INVALID });
  });

  it('idempotent: a second run with existing groups is rejected and creates nothing', async () => {
    setupParticipants(8);
    await runStage();
    expect(__state.createdGroups).toBe(2);
    // Simulate the DB now containing groups.
    tournRepo.findGroups.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const before = __state.createdMatches;
    await expect(runStage()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_GROUPS_ALREADY_GENERATED });
    expect(__state.createdGroups).toBe(2);
    expect(__state.createdMembers).toBe(8);
    expect(__state.createdMatches).toBe(before);
  });
});