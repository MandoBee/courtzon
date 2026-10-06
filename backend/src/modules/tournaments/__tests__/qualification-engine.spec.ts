import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QualificationService } from '../application/qualification.service.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

const __state = vi.hoisted(() => ({
  tournament: { id: 9, status: 'running' },
  stage: {
    id: 5, tournament_id: 9, competition_id: 1, stage_order: 1, name: 'Group Stage', progression_format: 'round_robin', advance_count: 2, status: 'pending',
    config: { format: 'group_stage_knockout', groupStage: { groupCount: 8, participantsPerGroup: 4, format: 'round_robin', qualification: { topPerGroup: 2, bestThirdPlaces: 0, ordering: 'rank' } }, knockout: { startingRound: 'round_of_16', seeding: 'automatic', separateGroupWinners: true, preventSameGroupRematch: true, allowByes: false } },
  },
  groups: [] as any[],
  standings: new Map<number, any[]>(),
  members: new Map<number, any[]>(),
  participants: [] as any[],
  unresolved: 0,
  seedByParticipant: new Map<number, number>(),
}));

const tournRepo = vi.hoisted(() => ({
  findStages: vi.fn(),
  countIncompleteStageMatches: vi.fn(),
  findGroups: vi.fn(),
  findGroupMembers: vi.fn(),
  getStandings: vi.fn(),
  createGroup: vi.fn(),
  createMatch: vi.fn(),
  addGroupMember: vi.fn(),
}));
vi.mock('../infrastructure/repositories/tournament.repository', () => ({ tournamentRepository: tournRepo }));

const pdRepo = vi.hoisted(() => ({ listParticipantsByCompetition: vi.fn() }));
vi.mock('../infrastructure/repositories/participant-draw.repository', () => ({ participantDrawRepository: pdRepo }));

const tournServiceMock = vi.hoisted(() => ({ getByIdDetailed: vi.fn() }));
vi.mock('../application/tournament.service', () => ({ tournamentService: tournServiceMock }));

const compServiceMock = vi.hoisted(() => ({ resolveRegistrationCompetition: vi.fn(async () => ({ id: 1 })) }));
vi.mock('../application/competition.service', () => ({ competitionService: compServiceMock }));

/** Build `groupCount` groups of `perGroup`, standings 1..perGroup, participants per group. */
function stageWith(groupCount: number, perGroup: number, topPerGroup: number, bestThirdPlaces: number, ordering: string) {
  __state.stage.config = {
    format: 'group_stage_knockout',
    groupStage: { groupCount, participantsPerGroup: perGroup, format: 'round_robin', qualification: { topPerGroup, bestThirdPlaces, ordering } },
    knockout: { startingRound: 'round_of_16', seeding: 'automatic', separateGroupWinners: true, preventSameGroupRematch: true, allowByes: false },
  };
}

function buildGroupsAndStandings(groupCount: number, perGroup: number, pointsByRank: (rank: number) => number = (r) => perGroup - r + 1) {
  __state.groups = Array.from({ length: groupCount }, (_, gi) => ({ id: 10 + gi, tournament_id: 9, competition_id: 1, name: String.fromCharCode(65 + gi), advance_count: 2 }));
  __state.standings = new Map();
  __state.members = new Map();
  __state.participants = [];
  __state.seedByParticipant = new Map();
  let pid = 1;
  for (let gi = 0; gi < groupCount; gi++) {
    const groupId = __state.groups[gi].id;
    const rows: any[] = [];
    const memberRows: any[] = [];
    for (let r = 1; r <= perGroup; r++) {
      const participantId = pid++;
      __state.participants.push({ id: participantId, tournament_id: 9, competition_id: 1, registration_id: 1000 + participantId, status: 'active', member_user_ids: [participantId * 100], seed_number: participantId });
      __state.seedByParticipant.set(participantId, participantId);
      rows.push({ tournament_id: 9, group_id: groupId, registration_id: participantId * 100, wins: r <= 2 ? 2 : 0, losses: r >= 3 ? 2 : 0, draws: 0, points: pointsByRank(r), games_won: r, games_lost: 0, sets_won: 0, sets_lost: 0, rank_position: r });
      memberRows.push({ group_id: groupId, registration_id: 1000 + participantId, seed: r });
    }
    __state.standings.set(groupId, rows);
    __state.members.set(groupId, memberRows);
  }
  pdRepo.listParticipantsByCompetition.mockResolvedValue(__state.participants as any);
  tournRepo.findGroups.mockImplementation(async () => [...__state.groups]);
  tournRepo.findGroupMembers.mockImplementation(async (groupId: number) => __state.members.get(groupId) ?? []);
  tournRepo.getStandings.mockImplementation(async (_tid: number, groupId: number) => __state.standings.get(groupId) ?? []);
}

function run() {
  return new QualificationService().qualifyGroupStage(9, 5);
}

beforeEach(() => {
  vi.clearAllMocks();
  tournServiceMock.getByIdDetailed.mockResolvedValue({ ...__state.tournament });
  tournRepo.findStages.mockImplementation(async () => [JSON.parse(JSON.stringify(__state.stage))]);
  tournRepo.countIncompleteStageMatches.mockResolvedValue(0);
  tournRepo.createGroup.mockReset();
  tournRepo.createMatch.mockReset();
  tournRepo.addGroupMember.mockReset();
});

describe('QualificationService — top-N + best-third + ordering (deterministic)', () => {
  it('8 groups × 4, top 2 → 16 qualified', async () => {
    stageWith(8, 4, 2, 0, 'rank');
    buildGroupsAndStandings(8, 4);
    const res = await run();
    expect(res.totalQualified).toBe(16);
    expect(res.qualified.length).toBe(16);
    expect(res.qualified.every((q) => q.qualificationType === 'group_position')).toBe(true);
    expect(new Set(res.qualified.map((q) => q.participantId)).size).toBe(16);
  });

  it('4 groups × 4, top 1 → 4 qualified', async () => {
    stageWith(4, 4, 1, 0, 'rank');
    buildGroupsAndStandings(4, 4);
    const res = await run();
    expect(res.totalQualified).toBe(4);
  });

  it('8 groups × 4, top 2 + best 3rd = 4 → 20 qualified (no knockout-compat validation here)', async () => {
    stageWith(8, 4, 2, 4, 'rank');
    buildGroupsAndStandings(8, 4);
    const res = await run();
    expect(res.totalQualified).toBe(20);
    expect(res.qualified.filter((q) => q.qualificationType === 'best_third').length).toBe(4);
  });

  it('bestThirdPlaces = 0 → no third-place candidates', async () => {
    stageWith(8, 4, 2, 0, 'rank');
    buildGroupsAndStandings(8, 4);
    const res = await run();
    expect(res.qualified.some((q) => q.qualificationType === 'best_third')).toBe(false);
  });

  it('bestThirdPlaces = 1 → exactly one third, the best by standings comparator', async () => {
    stageWith(4, 4, 2, 1, 'rank');
    buildGroupsAndStandings(4, 4);
    const res = await run();
    const thirds = res.qualified.filter((q) => q.qualificationType === 'best_third');
    expect(thirds.length).toBe(1);
  });

  it('bestThirdPlaces exceeded available candidates → rejected', async () => {
    stageWith(4, 4, 2, 9, 'rank');
    buildGroupsAndStandings(4, 4);
    await expect(run()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID });
  });

  it('topPerGroup > participantsPerGroup → rejected', async () => {
    stageWith(8, 4, 5, 0, 'rank');
    buildGroupsAndStandings(8, 4);
    await expect(run()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID });
  });

  it('a group with fewer than 3 ranked participants excludes it from third-place candidates', async () => {
    stageWith(4, 4, 2, 1, 'rank');
    buildGroupsAndStandings(4, 4);
    // Shrink one group to 2 members (no rank 3) → only 3 third candidates remain.
    const smallGroupIdx = 10;
    __state.standings.set(smallGroupIdx, __state.standings.get(smallGroupIdx)!.slice(0, 2));
    __state.members.set(smallGroupIdx, __state.members.get(smallGroupIdx)!.slice(0, 2));
    const res = await run();
    expect(res.totalQualified).toBe(2 * 4 + 1); // 8 group positions + 1 best third (3 candidates available)
  });

  it('incomplete group stage (unresolved matches) → rejected', async () => {
    stageWith(8, 4, 2, 0, 'rank');
    buildGroupsAndStandings(8, 4);
    tournRepo.countIncompleteStageMatches.mockResolvedValue(3);
    await expect(run()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_MATCHES_UNRESOLVED });
  });

  it('missing groups → rejected', async () => {
    stageWith(8, 4, 2, 0, 'rank');
    buildGroupsAndStandings(8, 4);
    tournRepo.findGroups.mockResolvedValue(__state.groups.slice(0, 7));
    await expect(run()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID });
  });

  it('missing standings for a group → rejected', async () => {
    stageWith(8, 4, 2, 0, 'rank');
    buildGroupsAndStandings(8, 4);
    tournRepo.getStandings.mockImplementation(async (_tid: number, groupId: number) => (groupId === 10 ? [] : __state.standings.get(groupId) ?? []));
    await expect(run()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID });
  });

  it('duplicate participant across groups → rejected', async () => {
    stageWith(2, 4, 2, 0, 'rank');
    buildGroupsAndStandings(2, 4);
    // Both groups reference the same user key → second group maps to an already-known participant.
    const g1 = __state.standings.get(10)!;
    const g2 = __state.standings.get(11)!;
    g2[0].registration_id = g1[0].registration_id;
    __state.standings.set(11, g2);
    // The map is keyed by user id, so a duplicate key is caught by participants.
    __state.participants[4] = { ...__state.participants[4], member_user_ids: [__state.participants[0].member_user_ids[0]] };
    pdRepo.listParticipantsByCompetition.mockResolvedValue(__state.participants as any);
    await expect(run()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID });
  });

  it('top-N participant cannot also appear as best-third (topPerGroup ≥ 3 leaves no thirds)', async () => {
    stageWith(8, 4, 3, 1, 'rank');
    buildGroupsAndStandings(8, 4);
    await expect(run()).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID });
  });

  it('tie-breaking follows the existing standings comparator (points, then game difference)', async () => {
    stageWith(1, 4, 2, 0, 'rank');
    buildGroupsAndStandings(1, 4, (r) => 1); // all tied on points
    // Participant 1 and 2 tie on points and have NO rank_position → the comparator
    // (points, then game difference) decides: participant 2 has more games_won.
    const rows = __state.standings.get(10)!;
    rows[0].points = 1; rows[0].games_won = 1; rows[0].rank_position = null;
    rows[1].points = 1; rows[1].games_won = 2; rows[1].rank_position = null;
    rows[2].points = 1; rows[3].points = 1;
    const res = await run();
    expect(Number(res.qualified[0].participantId)).toBe(2);
    expect(Number(res.qualified[1].participantId)).toBe(1);
  });

  it('ranks from rank_position when available', async () => {
    stageWith(1, 4, 2, 0, 'rank');
    buildGroupsAndStandings(1, 4);
    const res = await run();
    expect(res.qualified.map((q) => q.groupRank)).toEqual([1, 2]);
  });

  it('ordering = seed sorts by tournament seed ascending', async () => {
    stageWith(2, 4, 1, 0, 'seed');
    buildGroupsAndStandings(2, 4);
    const res = await run();
    const seeds = res.qualified.map((q) => q.seed);
    expect(seeds).toEqual([...seeds].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it('ordering = points sorts by standings points descending', async () => {
    stageWith(2, 4, 1, 0, 'points');
    buildGroupsAndStandings(2, 4);
    const res = await run();
    const points = res.qualified.map((q) => q.points ?? 0);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });

  it('ordering = rank groups by source group then group rank', async () => {
    stageWith(2, 4, 2, 0, 'rank');
    buildGroupsAndStandings(2, 4);
    const res = await run();
    expect(res.qualified.slice(0, 2).every((q) => q.groupId === 10)).toBe(true);
    expect(res.qualified[0].groupRank).toBe(1);
  });

  it('repeated qualification is identical (deterministic + idempotent)', async () => {
    stageWith(8, 4, 2, 2, 'rank');
    buildGroupsAndStandings(8, 4);
    const first = await run();
    const second = await run();
    expect(second).toEqual(first);
  });

  it('returns the full result contract (participantId/groupId/groupRank/type/qualificationRank)', async () => {
    stageWith(2, 4, 2, 1, 'rank');
    buildGroupsAndStandings(2, 4);
    const res = await run();
    for (const q of res.qualified) {
      expect(Number.isInteger(q.participantId)).toBe(true);
      expect(Number.isInteger(q.groupId)).toBe(true);
      expect(q.groupRank).toBeGreaterThanOrEqual(1);
      expect(['group_position', 'best_third']).toContain(q.qualificationType);
      expect(q.qualificationRank).toBeGreaterThanOrEqual(1);
    }
  });

  it('has NO knockout side effects (no groups/matches/stage writes, no bracket calls)', async () => {
    stageWith(8, 4, 2, 0, 'rank');
    buildGroupsAndStandings(8, 4);
    await run();
    expect(tournRepo.createGroup).not.toHaveBeenCalled();
    expect(tournRepo.createMatch).not.toHaveBeenCalled();
    expect(tournRepo.addGroupMember).not.toHaveBeenCalled();
  });
});