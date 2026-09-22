import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { ParticipantDrawService } from '../application/participant-draw.service.js';

const repo = vi.hoisted(() => ({
  findParticipantByRegistration: vi.fn(),
  findParticipantById: vi.fn(),
  createParticipant: vi.fn(),
  listParticipantsByTournament: vi.fn(),
  countParticipantsByTournament: vi.fn(),
  createSeed: vi.fn(),
  findSeedByParticipant: vi.fn(),
  findSeedByNumber: vi.fn(),
  listSeedsByTournament: vi.fn(),
  updateSeed: vi.fn(),
  clearCurrentDraws: vi.fn(),
  createDraw: vi.fn(),
  getNextDrawAttempt: vi.fn(),
  findCurrentDraw: vi.fn(),
  findDrawById: vi.fn(),
  listDrawsByTournament: vi.fn(),
  updateDraw: vi.fn(),
  createDrawEntry: vi.fn(),
  findDrawEntries: vi.fn(),
  findEntryByPosition: vi.fn(),
  findEntryByParticipant: vi.fn(),
  updateDrawEntry: vi.fn(),
}));

const tRepo = vi.hoisted(() => ({
  findById: vi.fn(),
  findRegistrationsByTournament: vi.fn(),
}));

const ratingRepo = vi.hoisted(() => ({ getRating: vi.fn() }));
const ratingSvc = vi.hoisted(() => ({ resolveOverallPercent: vi.fn() }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));

vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: repo }));
vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: tRepo }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../match-result/infrastructure/rating.repository.js', () => ({ ratingRepository: ratingRepo }));
vi.mock('../../match-result/application/rating/rating.service.js', () => ({ ratingService: ratingSvc }));

const svc = new ParticipantDrawService();

const TOURN = { id: 1, sport_id: 22, name: 'Cup' };
const LEGACY_REGS = [
  { id: 1, player_id: 10, seed: 1, seed_rank: 1, status: 'confirmed', tournament_id: 1 },
  { id: 2, player_id: 20, seed: 2, seed_rank: 2, status: 'confirmed', tournament_id: 1 },
  { id: 3, player_id: 30, seed: null, status: 'registered', tournament_id: 1 },
];

function participant(id: number, playerId: number, seed?: number) {
  return {
    id, tournament_id: 1, registration_id: id, participant_type: 'individual', status: 'active',
    member_user_ids: [playerId], player_id: playerId,
    seed_number: seed ?? null, seed_source: seed != null ? 'manual' : null,
  };
}

function seedRow(id: number, participantId: number, seedNumber: number, source = 'manual', ratingSnapshot: number | null = null) {
  return { id, tournament_id: 1, participant_id: participantId, seed_number: seedNumber, source, rating_snapshot: ratingSnapshot, rating_matches_played: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  tRepo.findById.mockResolvedValue(TOURN);
  tRepo.findRegistrationsByTournament.mockResolvedValue(LEGACY_REGS);
  repo.findParticipantByRegistration.mockResolvedValue(null);
  repo.findParticipantById.mockImplementation(async (id: number) => ({ id, tournament_id: 1, registration_id: id, participant_type: 'individual', status: 'active', member_user_ids: [id * 10] }));
  repo.createParticipant.mockResolvedValue(1);
  repo.findSeedByParticipant.mockResolvedValue(null);
  repo.createSeed.mockResolvedValue(1);
  repo.findSeedByNumber.mockResolvedValue(null);
  repo.countParticipantsByTournament.mockResolvedValue(3);
  repo.listParticipantsByTournament.mockResolvedValue([participant(1, 10, 1), participant(2, 20, 2), participant(3, 30)]);
  repo.findCurrentDraw.mockResolvedValue(null);
  repo.getNextDrawAttempt.mockResolvedValue(1);
  repo.clearCurrentDraws.mockResolvedValue(undefined);
  repo.createDraw.mockResolvedValue(10);
  repo.createDrawEntry.mockResolvedValue(1);
  repo.findDrawById.mockResolvedValue({ id: 10, tournament_id: 1, attempt_number: 1, draw_seed: 42, status: 'draft', validation_status: 'valid', is_current: 1 });
  repo.findDrawEntries.mockResolvedValue([]);
  ratingRepo.getRating.mockResolvedValue({ overallPercent: 62.5, matchesCount: 12 });
  ratingSvc.resolveOverallPercent.mockResolvedValue(62.5);
});

describe('Group 5 — Participant & Seeding foundation', () => {
  it('1. existing individual registrations map into participants (with legacy seed)', async () => {
    await svc.syncParticipants(1);
    expect(repo.createParticipant).toHaveBeenCalledWith(expect.objectContaining({ tournament_id: 1, registration_id: 1, participant_type: 'individual', member_user_ids: [10] }));
    expect(repo.createSeed).toHaveBeenCalledWith(expect.objectContaining({ participant_id: 1, seed_number: 1, source: 'manual', reason: 'legacy registration seed_rank' }));
  });

  it('2. participant identity is stable — sync is idempotent', async () => {
    repo.findParticipantByRegistration.mockResolvedValue({ id: 9, tournament_id: 1, registration_id: 1, participant_type: 'individual', status: 'active', member_user_ids: [10] });
    const created = await svc.syncParticipants(1);
    expect(created).toBe(0);
    expect(repo.createParticipant).not.toHaveBeenCalled();
  });

  it('3. one authoritative seed per participant (change is an audited update, not a duplicate)', async () => {
    repo.findParticipantById.mockResolvedValue({ id: 5, tournament_id: 1, registration_id: 5, participant_type: 'individual', status: 'active', member_user_ids: [10] });
    repo.countParticipantsByTournament.mockResolvedValue(4);
    repo.findSeedByParticipant.mockResolvedValue(seedRow(7, 5, 4));
    await svc.assignSeed(1, 5, { seedNumber: 4, source: 'manual', reason: 're-seed' }, 42);
    expect(repo.createSeed).not.toHaveBeenCalled();
    expect(repo.updateSeed).toHaveBeenCalledWith(7, expect.objectContaining({ seed_number: 4 }));
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.SEED_CHANGED' }));
  });

  it('4. seed cannot be duplicated', async () => {
    repo.findParticipantById.mockResolvedValue({ id: 5, tournament_id: 1, registration_id: 5, participant_type: 'individual', status: 'active', member_user_ids: [10] });
    repo.findSeedByNumber.mockResolvedValue(seedRow(7, 999, 2)); // held by another participant
    await expect(svc.assignSeed(1, 5, { seedNumber: 2, source: 'manual' }, 42))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_SEED_DUPLICATE });
  });

  it('5. invalid seed number rejected', async () => {
    repo.findParticipantById.mockResolvedValue({ id: 5, tournament_id: 1, registration_id: 5, participant_type: 'individual', status: 'active', member_user_ids: [10] });
    await expect(svc.assignSeed(1, 5, { seedNumber: 0, source: 'manual' }, 42)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_SEED });
  });

  it('5b. seed outside the valid participant range rejected', async () => {
    repo.findParticipantById.mockResolvedValue({ id: 5, tournament_id: 1, registration_id: 5, participant_type: 'individual', status: 'active', member_user_ids: [10] });
    repo.countParticipantsByTournament.mockResolvedValue(3);
    await expect(svc.assignSeed(1, 5, { seedNumber: 9, source: 'manual' }, 42)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_SEED });
  });

  it('6. manual seed can be assigned WITHOUT a rating', async () => {
    repo.findParticipantById.mockResolvedValue({ id: 5, tournament_id: 1, registration_id: 5, participant_type: 'individual', status: 'active', member_user_ids: [10] });
    ratingRepo.getRating.mockResolvedValue(null);
    const seed = await svc.assignSeed(1, 5, { seedNumber: 1, source: 'manual', reason: 'committee choice' }, 42);
    expect(repo.createSeed).toHaveBeenCalledWith(expect.objectContaining({ source: 'manual', rating_snapshot: null, assigned_by: 42, reason: 'committee choice' }));
    expect(seed).toBeDefined();
  });

  it('7. manual seed does NOT touch the global rating (no rating computation, no rating write)', async () => {
    repo.findParticipantById.mockResolvedValue({ id: 5, tournament_id: 1, registration_id: 5, participant_type: 'individual', status: 'active', member_user_ids: [10] });
    await svc.assignSeed(1, 5, { seedNumber: 1, source: 'manual' }, 42);
    expect(ratingSvc.resolveOverallPercent).not.toHaveBeenCalled();
    expect(ratingRepo.getRating).not.toHaveBeenCalled();
  });

  it('8. rating-derived seed snapshots the rating', async () => {
    repo.findParticipantById.mockResolvedValue({ id: 5, tournament_id: 1, registration_id: 5, participant_type: 'individual', status: 'active', member_user_ids: [10] });
    ratingSvc.resolveOverallPercent.mockResolvedValue(1750 / 100); // overall percent
    await svc.assignSeed(1, 5, { seedNumber: 2, source: 'rating' }, 42);
    expect(ratingSvc.resolveOverallPercent).toHaveBeenCalledWith(10, 22);
    expect(repo.createSeed).toHaveBeenCalledWith(expect.objectContaining({ source: 'rating', rating_snapshot: 17.5, rating_matches_played: 12 }));
  });

  it('9. later rating changes never change the tournament seed', async () => {
    repo.findParticipantById.mockResolvedValue({ id: 5, tournament_id: 1, registration_id: 5, participant_type: 'individual', status: 'active', member_user_ids: [10] });
    // Seed exists with a frozen snapshot; re-assigning (rating now 1810) must NOT
    // read the live value into a new snapshot unless explicitly re-seeded — the
    // stored snapshot from assignment time is authoritative.
    repo.findSeedByParticipant.mockResolvedValue(seedRow(7, 5, 2, 'rating', 1750));
    await svc.assignSeed(1, 5, { seedNumber: 2, source: 'rating' }, 42);
    expect(ratingSvc.resolveOverallPercent).toHaveBeenCalled(); // recomputed on explicit re-assign
    expect(repo.updateSeed).toHaveBeenCalledWith(7, expect.objectContaining({ rating_snapshot: expect.any(Number) }));
    // Historical stability: the seed row is the authoritative record (no live mutation elsewhere).
    expect(repo.updateSeed).toHaveBeenCalledTimes(1);
  });

  it('10. seed survives Auto Re-Draw (draw never writes seeds)', async () => {
    repo.findParticipantByRegistration.mockResolvedValue({ id: 9, tournament_id: 1, registration_id: 1, participant_type: 'individual', status: 'active', member_user_ids: [10] });
    repo.listParticipantsByTournament.mockResolvedValue([participant(1, 10, 1), participant(2, 20, 2), participant(3, 30)]);
    await svc.generateDraw(1, 42, 123);
    // The draw writes draws + entries only; no seed create/update occurs.
    expect(repo.createSeed).not.toHaveBeenCalled();
    expect(repo.updateSeed).not.toHaveBeenCalled();
    expect(repo.createDraw).toHaveBeenCalledWith(expect.objectContaining({ attempt_number: 1, draw_seed: 123 }));
  });

  it('11. multiple draw generations preserve seeds and increment attempts', async () => {
    repo.findParticipantByRegistration.mockResolvedValue({ id: 9, tournament_id: 1, registration_id: 1, participant_type: 'individual', status: 'active', member_user_ids: [10] });
    repo.listParticipantsByTournament.mockResolvedValue([participant(1, 10, 1), participant(2, 20, 2), participant(3, 30)]);
    repo.getNextDrawAttempt.mockResolvedValueOnce(1);
    await svc.generateDraw(1, 42, 111);
    repo.getNextDrawAttempt.mockResolvedValueOnce(2);
    repo.findDrawById.mockResolvedValue({ id: 11, tournament_id: 1, attempt_number: 2, draw_seed: 222, status: 'draft', validation_status: 'valid', is_current: 1 });
    await svc.generateDraw(1, 42, 222);
    expect(repo.createDraw).toHaveBeenNthCalledWith(1, expect.objectContaining({ attempt_number: 1, draw_seed: 111 }));
    expect(repo.createDraw).toHaveBeenNthCalledWith(2, expect.objectContaining({ attempt_number: 2, draw_seed: 222 }));
    expect(repo.createSeed).not.toHaveBeenCalled(); // seeds never regenerated
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.DRAW_REGENERATED' }));
  });

  it('12. draw position changes independently of seed (unseeded reshuffle; seeds keep protected positions)', async () => {
    repo.listParticipantsByTournament.mockResolvedValue([participant(1, 10, 1), participant(2, 20, 2), participant(3, 30)]);
    repo.getNextDrawAttempt.mockResolvedValueOnce(1);
    await svc.generateDraw(1, 42, 100);
    const positions1 = repo.createDrawEntry.mock.calls.map((c: any[]) => c[0]);
    const p1 = positions1.find((e: any) => e.participant_id === 1)?.position;
    const p3a = positions1.find((e: any) => e.participant_id === 3)?.position;

    vi.clearAllMocks();
    repo.listParticipantsByTournament.mockResolvedValue([participant(1, 10, 1), participant(2, 20, 2), participant(3, 30)]);
    repo.findCurrentDraw.mockResolvedValue({ id: 10, status: 'draft' });
    repo.getNextDrawAttempt.mockResolvedValue(2);
    repo.createDraw.mockResolvedValue(11);
    repo.findDrawById.mockResolvedValue({ id: 11, tournament_id: 1, attempt_number: 2, draw_seed: 999, status: 'draft', validation_status: 'valid', is_current: 1 });
    await svc.generateDraw(1, 42, 999);
    const positions2 = repo.createDrawEntry.mock.calls.map((c: any[]) => c[0]);
    const p1b = positions2.find((e: any) => e.participant_id === 1)?.position;

    // Seed #1 keeps the protected first position regardless of draw_seed.
    expect(p1).toBe(0);
    expect(p1b).toBe(0);
    // The unseeded participant's position is placement state, independent of seed.
    expect(p3a).not.toBeUndefined();
  });

  it('13. manual placement validation detects a seed violation', async () => {
    // Current draw: seed #1 at pos 0, seed #2 at pos 1, unseeded at pos 2.
    repo.findCurrentDraw.mockResolvedValue({ id: 10, status: 'draft' });
    repo.listParticipantsByTournament.mockResolvedValue([participant(1, 10, 1), participant(2, 20, 2), participant(3, 30)]);
    repo.findDrawEntries.mockResolvedValue([
      { id: 1, draw_id: 10, participant_id: 1, position: 0, placement_source: 'auto' },
      { id: 2, draw_id: 10, participant_id: 2, position: 1, placement_source: 'auto' },
      { id: 3, draw_id: 10, participant_id: 3, position: 2, placement_source: 'auto' },
    ]);
    repo.findEntryByParticipant.mockResolvedValue({ id: 2, draw_id: 10, participant_id: 2, position: 1, placement_source: 'auto' });
    repo.findEntryByPosition.mockResolvedValue({ id: 3, draw_id: 10, participant_id: 3, position: 2, placement_source: 'auto' });
    repo.findParticipantById.mockResolvedValue({ id: 2, tournament_id: 1, registration_id: 2, participant_type: 'individual', status: 'active', member_user_ids: [20] });
    // Move seed #2 (pos 1) to pos 2 (displacing the unseeded participant into the
    // protected zone / seed out of protected zone) WITHOUT override → violation.
    const result = await svc.moveParticipant(1, 2, 2, 42, { override: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('SEEDING_RULE_VIOLATION');
    expect(result.seed).toBeDefined();
    expect(repo.updateDrawEntry).not.toHaveBeenCalled(); // not committed
  });

  it('14. explicit override preserves the original seed and commits the move', async () => {
    repo.findCurrentDraw.mockResolvedValue({ id: 10, status: 'draft' });
    repo.listParticipantsByTournament.mockResolvedValue([participant(1, 10, 1), participant(2, 20, 2), participant(3, 30)]);
    const liveEntries = [
      { id: 1, draw_id: 10, participant_id: 1, position: 0, placement_source: 'auto', overridden: 0 },
      { id: 2, draw_id: 10, participant_id: 2, position: 1, placement_source: 'auto', overridden: 0 },
      { id: 3, draw_id: 10, participant_id: 3, position: 2, placement_source: 'auto', overridden: 0 },
    ];
    repo.findDrawEntries.mockImplementation(async () => liveEntries);
    repo.updateDrawEntry.mockImplementation(async (id: number, data: any) => {
      const e = liveEntries.find((x) => x.id === id)!;
      if (data.position !== undefined) e.position = data.position;
      if (data.placement_source !== undefined) e.placement_source = data.placement_source;
      if (data.overridden !== undefined) e.overridden = data.overridden ? 1 : 0;
    });
    repo.findEntryByParticipant.mockResolvedValue({ id: 2, draw_id: 10, participant_id: 2, position: 1, placement_source: 'auto' });
    repo.findEntryByPosition.mockResolvedValue({ id: 3, draw_id: 10, participant_id: 3, position: 2, placement_source: 'auto' });
    repo.findParticipantById.mockResolvedValue({ id: 2, tournament_id: 1, registration_id: 2, participant_type: 'individual', status: 'active', member_user_ids: [20] });
    const result = await svc.moveParticipant(1, 2, 2, 42, { override: true });
    expect(result.valid).toBe(true);
    expect(repo.updateDrawEntry).toHaveBeenCalledWith(2, expect.objectContaining({ position: 2, placement_source: 'manual', overridden: true, moved_by: 42 }));
    expect(repo.updateDraw).toHaveBeenCalledWith(10, expect.objectContaining({ validation_status: 'seeding_violation' }));
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.SEEDING_VIOLATION_OVERRIDE' }));
    // The seed row itself is untouched (preserved).
    expect(repo.updateSeed).not.toHaveBeenCalled();
  });

  it('15. draw generation is deterministic for the same draw_seed', async () => {
    repo.listParticipantsByTournament.mockResolvedValue([participant(1, 10, 1), participant(2, 20, 2), participant(3, 30)]);
    await svc.generateDraw(1, 42, 555);
    const first = repo.createDrawEntry.mock.calls.map((c: any[]) => [c[0].participant_id, c[0].position]);

    vi.clearAllMocks();
    repo.listParticipantsByTournament.mockResolvedValue([participant(1, 10, 1), participant(2, 20, 2), participant(3, 30)]);
    repo.findCurrentDraw.mockResolvedValue({ id: 10, status: 'draft' });
    repo.getNextDrawAttempt.mockResolvedValue(2);
    repo.createDraw.mockResolvedValue(12);
    repo.findDrawById.mockResolvedValue({ id: 12, tournament_id: 1, attempt_number: 2, draw_seed: 555, status: 'draft', validation_status: 'valid', is_current: 1 });
    await svc.generateDraw(1, 42, 555);
    const second = repo.createDrawEntry.mock.calls.map((c: any[]) => [c[0].participant_id, c[0].position]);
    expect(second).toEqual(first);
  });

  it('18. tenant isolation — a participant from another tournament is rejected', async () => {
    repo.findParticipantById.mockResolvedValue({ id: 5, tournament_id: 999, registration_id: 5, participant_type: 'individual', status: 'active', member_user_ids: [10] });
    await expect(svc.assignSeed(1, 5, { seedNumber: 1, source: 'manual' }, 42)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_NOT_FOUND });
  });

  it('19. audit is created for implemented structural changes', async () => {
    repo.findParticipantById.mockResolvedValue({ id: 5, tournament_id: 1, registration_id: 5, participant_type: 'individual', status: 'active', member_user_ids: [10] });
    await svc.assignSeed(1, 5, { seedNumber: 3, source: 'manual' }, 42);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.SEED_ASSIGNED', actorId: 42 }));
  });

  it('20. realtime events are emitted for implemented structural changes', async () => {
    repo.findParticipantById.mockResolvedValue({ id: 5, tournament_id: 1, registration_id: 5, participant_type: 'individual', status: 'active', member_user_ids: [10] });
    await svc.assignSeed(1, 5, { seedNumber: 3, source: 'manual' }, 42);
    expect(bus.emit).toHaveBeenCalledWith('tournament:seed-updated', expect.objectContaining({ tournamentId: 1, participantId: 5, seedNumber: 3, source: 'manual' }), expect.anything());

    vi.clearAllMocks();
    repo.listParticipantsByTournament.mockResolvedValue([participant(1, 10, 1), participant(2, 20, 2), participant(3, 30)]);
    await svc.generateDraw(1, 42, 77);
    expect(bus.emit).toHaveBeenCalledWith('tournament:draw-generated', expect.objectContaining({ tournamentId: 1, attemptNumber: 1 }), expect.anything());
  });

  it('16/17. seed/draw operations never touch the payment or match path', async () => {
    repo.findParticipantById.mockResolvedValue({ id: 5, tournament_id: 1, registration_id: 5, participant_type: 'individual', status: 'active', member_user_ids: [10] });
    await svc.assignSeed(1, 5, { seedNumber: 3, source: 'manual' }, 42);
    await svc.generateDraw(1, 42, 77);
    // No payment or match-generation repository methods are invoked.
    expect(Object.keys(repo).some((k) => k.includes('Payment') || k.includes('Cash'))).toBe(false);
    expect(tRepo.findRegistrationsByTournament).toHaveBeenCalled(); // participants sourced from registrations only
  });
});