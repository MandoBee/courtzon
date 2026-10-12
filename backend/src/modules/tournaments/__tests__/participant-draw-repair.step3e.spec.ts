import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParticipantDrawService } from '../application/participant-draw.service.js';

/**
 * Step 3E — narrow legacy membership repair used by the result-approval
 * progression path (`repairMissingIndividualMemberRow`).
 *
 * These unit tests pin the ELIGIBILITY BOUNDARY and IDEMPOTENCY of the repair
 * (the progression integration spec covers the end-to-end path):
 *   * an individual + active participant with no membership history is repaired;
 *   * pair/team participants are never repaired;
 *   * inactive participants are never repaired;
 *   * a left/replaced membership is never resurrected;
 *   * a participant from another tournament is never repaired;
 *   * repeated execution never duplicates membership.
 */

const drawRepo = vi.hoisted(() => ({
  findParticipantById: vi.fn(),
}));

const pmRepo = vi.hoisted(() => ({
  listMembersByParticipant: vi.fn(),
  findMember: vi.fn(),
  addMember: vi.fn(),
}));

vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: drawRepo }));
vi.mock('../infrastructure/repositories/participant-member.repository.js', () => ({ participantMemberRepository: pmRepo }));
// Avoid loading the real (circular) tournament service / DB-bound modules.
vi.mock('../application/tournament.service.js', () => ({ tournamentService: {} }));
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    query: vi.fn(async () => [[]]),
    execute: vi.fn(async () => [[]]),
  }),
}));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit: vi.fn() } }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../../match-result/infrastructure/rating.repository.js', () => ({ ratingRepository: { getRating: vi.fn() } }));
vi.mock('../../match-result/application/rating/rating.service.js', () => ({ ratingService: { resolveOverallPercent: vi.fn() } }));

const svc = new ParticipantDrawService();

/** A legacy individual participant: active, with the `member_user_ids` cache but no member row. */
function legacyParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    tournament_id: 1,
    participant_type: 'individual',
    status: 'active',
    member_user_ids: [10],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  drawRepo.findParticipantById.mockResolvedValue(null);
  pmRepo.listMembersByParticipant.mockResolvedValue([]);
  pmRepo.findMember.mockResolvedValue(null);
  pmRepo.addMember.mockResolvedValue(1);
});

describe('Step 3E — repairMissingIndividualMemberRow eligibility boundary', () => {
  it('repairs an individual + active participant that has no membership history', async () => {
    drawRepo.findParticipantById.mockResolvedValue(legacyParticipant());

    const repaired = await svc.repairMissingIndividualMemberRow(1, [100]);

    expect(repaired).toBe(1);
    expect(pmRepo.addMember).toHaveBeenCalledTimes(1);
    expect(pmRepo.addMember).toHaveBeenCalledWith(expect.objectContaining({
      tournament_id: 1,
      participant_id: 100,
      user_id: 10,
      member_order: 0,
    }));
  });

  it('never repairs pair or team participants', async () => {
    drawRepo.findParticipantById.mockImplementation(async (id: number) => legacyParticipant({
      id,
      participant_type: id === 101 ? 'pair' : 'team',
      member_user_ids: [10, 11],
    }));

    const repaired = await svc.repairMissingIndividualMemberRow(1, [101, 102]);

    expect(repaired).toBe(0);
    expect(pmRepo.addMember).not.toHaveBeenCalled();
  });

  it('never repairs an inactive participant (waiting / withdrawn / disqualified)', async () => {
    const statuses = ['waiting', 'withdrawn', 'withdrawn_after_start', 'disqualified'];
    drawRepo.findParticipantById.mockImplementation(async (id: number) => legacyParticipant({ id, status: statuses[id - 200] }));

    const repaired = await svc.repairMissingIndividualMemberRow(1, [200, 201, 202, 203]);

    expect(repaired).toBe(0);
    expect(pmRepo.addMember).not.toHaveBeenCalled();
  });

  it('never resurrects a departed (left) or replaced membership', async () => {
    drawRepo.findParticipantById.mockResolvedValue(legacyParticipant());
    pmRepo.listMembersByParticipant.mockResolvedValue([
      { id: 1, participant_id: 100, user_id: 10, status: 'left', member_order: 0 },
    ]);

    const repaired = await svc.repairMissingIndividualMemberRow(1, [100]);

    expect(repaired).toBe(0);
    // A departing member short-circuits BEFORE any insert is attempted.
    expect(pmRepo.findMember).not.toHaveBeenCalled();
    expect(pmRepo.addMember).not.toHaveBeenCalled();
  });

  it('never repairs a participant that belongs to another tournament', async () => {
    drawRepo.findParticipantById.mockResolvedValue(legacyParticipant({ tournament_id: 999 }));

    const repaired = await svc.repairMissingIndividualMemberRow(1, [100]);

    expect(repaired).toBe(0);
    expect(pmRepo.addMember).not.toHaveBeenCalled();
  });

  it('is idempotent — a repeated repair creates no duplicate membership', async () => {
    drawRepo.findParticipantById.mockResolvedValue(legacyParticipant());

    expect(await svc.repairMissingIndividualMemberRow(1, [100])).toBe(1);
    // The repaired row is now present, so the second run is a no-op.
    pmRepo.listMembersByParticipant.mockResolvedValue([
      { id: 1, participant_id: 100, user_id: 10, status: 'active', member_order: 0 },
    ]);
    expect(await svc.repairMissingIndividualMemberRow(1, [100])).toBe(0);

    expect(pmRepo.addMember).toHaveBeenCalledTimes(1);
  });

  it('deduplicates ids and ignores null / undefined / non-positive / non-numeric ids', async () => {
    drawRepo.findParticipantById.mockResolvedValue(legacyParticipant());

    const repaired = await svc.repairMissingIndividualMemberRow(1, [100, 100, null, undefined, 0, -1, NaN]);

    expect(repaired).toBe(1);
    expect(drawRepo.findParticipantById).toHaveBeenCalledTimes(1);
    expect(pmRepo.addMember).toHaveBeenCalledTimes(1);
  });
});
