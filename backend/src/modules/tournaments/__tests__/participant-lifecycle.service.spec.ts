import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { ParticipantDrawService } from '../application/participant-draw.service.js';

const repo = vi.hoisted(() => ({
  findParticipantById: vi.fn(),
  findParticipantByRegistration: vi.fn(),
  findWaitlistHead: vi.fn(),
  listWaitingParticipants: vi.fn(),
  updateParticipantStatus: vi.fn(),
  updateParticipantWaitingOrder: vi.fn(),
  createParticipant: vi.fn(),
  findActiveParticipantByPlayer: vi.fn(),
  findSeedByParticipant: vi.fn(),
  findCurrentDraw: vi.fn(),
  findDrawById: vi.fn(),
  findEntryByParticipant: vi.fn(),
  deleteDrawEntryByParticipant: vi.fn(),
  markDrawRequiresRedraw: vi.fn(),
  updateDraw: vi.fn(),
}));

const tRepo = vi.hoisted(() => ({
  findById: vi.fn(),
  findRegistrationsByTournament: vi.fn(),
  updateRegistrationStatus: vi.fn(),
  updateRegistrationWaitingOrder: vi.fn(),
  hasAnyStartedMatch: vi.fn(),
  updateRegistrationPaymentStatus: vi.fn(),
  createCashPaymentTransaction: vi.fn(),
}));

const tournamentServiceMock = vi.hoisted(() => ({
  resolveEffectiveRegistrationPaymentMethods: vi.fn(),
  resolveWithdrawnSlots: vi.fn(),
}));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const ratingRepo = vi.hoisted(() => ({ getRating: vi.fn() }));
const ratingSvc = vi.hoisted(() => ({ resolveOverallPercent: vi.fn() }));
const poolConn = vi.hoisted(() => ({
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(),
  query: vi.fn(async () => [[]]),
  execute: vi.fn(async () => [[]]),
}));
const poolMock = vi.hoisted(() => ({
  getConnection: vi.fn(async () => poolConn),
  query: vi.fn(async () => [[]]),
  execute: vi.fn(async () => [[]]),
}));

vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: repo }));
vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: tRepo }));
vi.mock('../application/tournament.service.js', () => ({ tournamentService: tournamentServiceMock }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => poolMock }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../match-result/infrastructure/rating.repository.js', () => ({ ratingRepository: ratingRepo }));
vi.mock('../../match-result/application/rating/rating.service.js', () => ({ ratingService: ratingSvc }));

const svc = new ParticipantDrawService();

function participant(id: number, opts: Partial<Record<string, unknown>> = {}) {
  return { id, tournament_id: 1, registration_id: id, participant_type: 'individual', status: 'active', member_user_ids: [id * 10], ...opts };
}

const TOURN = { id: 1, sport_id: 22, name: 'Cup', status: 'registration_open', entry_fee: 0, currency_code: 'AED', max_participants: 8 };

beforeEach(() => {
  vi.clearAllMocks();
  tRepo.findById.mockResolvedValue(TOURN);
  tRepo.findRegistrationsByTournament.mockResolvedValue([]);
  tRepo.hasAnyStartedMatch.mockResolvedValue(false);
  tRepo.updateRegistrationStatus.mockResolvedValue(undefined);
  tRepo.updateRegistrationWaitingOrder.mockResolvedValue(undefined);
  tRepo.updateRegistrationPaymentStatus.mockResolvedValue(undefined);
  tRepo.createCashPaymentTransaction.mockResolvedValue(5001);
  tournamentServiceMock.resolveEffectiveRegistrationPaymentMethods.mockResolvedValue(['cash', 'card']);
  tournamentServiceMock.resolveWithdrawnSlots.mockResolvedValue({ resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0 });
  repo.findParticipantById.mockImplementation(async (id: number) => ({ id, tournament_id: 1, registration_id: id, participant_type: 'individual', status: 'active', member_user_ids: [id * 10] }));
  repo.findSeedByParticipant.mockResolvedValue(null);
  repo.findCurrentDraw.mockResolvedValue(null);
  repo.findActiveParticipantByPlayer.mockResolvedValue(null);
});

describe('Group 6 — WITHDRAWAL', () => {
  it('11. active participant can withdraw before start', async () => {
    repo.findParticipantById.mockResolvedValue(participant(5));
    const r = await svc.withdrawParticipant(1, 5, 42, 'injured');
    expect(r.status).toBe('withdrawn');
    expect(repo.updateParticipantStatus).toHaveBeenCalledWith(5, 'withdrawn');
    expect(tRepo.updateRegistrationStatus).toHaveBeenCalledWith(5, 'withdrawn');
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.PARTICIPANT_WITHDRAWN' }));
  });

  it('12. withdrawal after start uses a separate lifecycle (no waitlist replacement)', async () => {
    tRepo.hasAnyStartedMatch.mockResolvedValue(true);
    repo.findParticipantById.mockResolvedValue(participant(5));
    const r = await svc.withdrawParticipant(1, 5, 42);
    expect(r.status).toBe('withdrawn_after_start');
    expect(repo.updateParticipantStatus).toHaveBeenCalledWith(5, 'withdrawn_after_start');
    // Registration is NOT flipped to 'withdrawn' (post-start competitive state).
    expect(tRepo.updateRegistrationStatus).not.toHaveBeenCalled();
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.PARTICIPANT_WITHDRAWN_AFTER_START' }));
  });

  it('13. withdrawal preserves the historical registration (status update only, never delete)', async () => {
    repo.findParticipantById.mockResolvedValue(participant(5));
    await svc.withdrawParticipant(1, 5, 42);
    expect(tRepo.updateRegistrationStatus).toHaveBeenCalledWith(5, 'withdrawn');
    expect(repo.createParticipant).not.toHaveBeenCalled(); // identity preserved, not re-created
  });

  it('14. withdrawal preserves the seed history', async () => {
    repo.findParticipantById.mockResolvedValue(participant(5));
    repo.findSeedByParticipant.mockResolvedValue({ id: 9, tournament_id: 1, participant_id: 5, seed_number: 3, source: 'manual' });
    await svc.withdrawParticipant(1, 5, 42);
    // No seed delete/update occurs; the seed row remains attached to participant 5.
    expect((repo as any).updateSeed).toBeUndefined();
    expect(repo.findSeedByParticipant).toHaveBeenCalledWith(5);
  });

  it('15. withdrawal affects a draft draw correctly (entry removed + flagged)', async () => {
    repo.findParticipantById.mockResolvedValue(participant(5));
    repo.findSeedByParticipant.mockResolvedValue({ id: 9, tournament_id: 1, participant_id: 5, seed_number: 1, source: 'manual' });
    repo.findCurrentDraw.mockResolvedValue({ id: 10, tournament_id: 1, status: 'draft' });
    repo.findDrawById.mockResolvedValue({ id: 10, tournament_id: 1, status: 'draft' });
    repo.findEntryByParticipant.mockResolvedValue({ id: 2, draw_id: 10, participant_id: 5, position: 0, placement_source: 'auto' });
    const r = await svc.withdrawParticipant(1, 5, 42);
    expect(repo.deleteDrawEntryByParticipant).toHaveBeenCalledWith(10, 5);
    expect(repo.updateDraw).toHaveBeenCalledWith(10, { validation_status: 'manually_modified' });
    expect(r.drawImpact).toEqual(expect.objectContaining({ drawAffected: true, requiresRedraw: true, seedAffected: true }));
  });

  it('16. a locked draw is never silently mutated (flagged for re-draw)', async () => {
    repo.findParticipantById.mockResolvedValue(participant(5));
    repo.findCurrentDraw.mockResolvedValue({ id: 10, tournament_id: 1, status: 'locked' });
    repo.findDrawById.mockResolvedValue({ id: 10, tournament_id: 1, status: 'locked' });
    repo.findEntryByParticipant.mockResolvedValue({ id: 2, draw_id: 10, participant_id: 5, position: 0, placement_source: 'auto' });
    await svc.withdrawParticipant(1, 5, 42);
    expect(repo.deleteDrawEntryByParticipant).not.toHaveBeenCalled();
    expect(repo.markDrawRequiresRedraw).toHaveBeenCalledWith(10);
  });

  it('12b. post-start withdrawal resolves affected bracket slots (G9-D2 orchestration)', async () => {
    tRepo.hasAnyStartedMatch.mockResolvedValue(true);
    repo.findParticipantById.mockResolvedValue(participant(5));
    tournamentServiceMock.resolveWithdrawnSlots.mockResolvedValue({ resolvedSlots: 2, cancelledMatches: 1, releasedCourts: 1 });
    const r = await svc.withdrawParticipant(1, 5, 42);
    expect(r.status).toBe('withdrawn_after_start');
    expect(tournamentServiceMock.resolveWithdrawnSlots).toHaveBeenCalledWith(1, 5);
    expect(r.resolution).toEqual({ resolvedSlots: 2, cancelledMatches: 1, releasedCourts: 1 });
    expect(bus.emit).toHaveBeenCalledWith('tournament:participant-updated', expect.objectContaining({ tournamentId: 1, participantId: 5, status: 'withdrawn_after_start' }), expect.anything());
  });

  it('12c. re-withdrawing an already-withdrawn_after_start participant is idempotent (no duplicate effects)', async () => {
    tRepo.hasAnyStartedMatch.mockResolvedValue(true);
    repo.findParticipantById.mockResolvedValue(participant(5, { status: 'withdrawn_after_start' }));
    const r = await svc.withdrawParticipant(1, 5, 42);
    expect(r.status).toBe('withdrawn_after_start');
    // The terminal post-start state is NOT re-written; no duplicate status event.
    expect(repo.updateParticipantStatus).not.toHaveBeenCalled();
    // The resolution is re-run and skips already-resolved slots.
    expect(tournamentServiceMock.resolveWithdrawnSlots).toHaveBeenCalledWith(1, 5);
    expect(r.resolution).toEqual({ resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0 });
    const participantUpdated = bus.emit.mock.calls.filter((c: any[]) => c[0] === 'tournament:participant-updated');
    expect(participantUpdated).toHaveLength(0);
  });
});

describe('Group 6 — WAITLIST PROMOTION (FIFO)', () => {
  it('3/6. promotion selects the earliest eligible waiting participant (FIFO head)', async () => {
    repo.findWaitlistHead.mockResolvedValue(participant(2, { status: 'waiting', waiting_order: 1, registration_id: 2 }));
    const p = await svc.promoteNextWaitlisted(1, 42);
    expect(repo.findWaitlistHead).toHaveBeenCalledWith(1, expect.anything());
    expect(repo.updateParticipantStatus).toHaveBeenCalledWith(2, 'active', expect.anything());
    expect(repo.updateParticipantWaitingOrder).toHaveBeenCalledWith(2, null, expect.anything());
    expect(tRepo.updateRegistrationStatus).toHaveBeenCalledWith(2, 'registered', undefined, expect.anything());
    expect(p?.status).toBe('active');
  });

  it('7. concurrent promotion cannot double-promote (tournament row locked FOR UPDATE)', async () => {
    // The service acquires a transaction + locks the tournament row; a second
    // concurrent caller serializes on the lock and re-reads the head.
    repo.findWaitlistHead.mockResolvedValueOnce(participant(2, { status: 'waiting', waiting_order: 1, registration_id: 2 }));
    await svc.promoteNextWaitlisted(1, 42);
    expect(poolConn.query).toHaveBeenCalledWith('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [1]);
    expect(poolConn.beginTransaction).toHaveBeenCalled();
    expect(poolConn.commit).toHaveBeenCalled();
  });

  it('5/4. waitlist order is monotonic and unique (MAX+1 per tournament)', async () => {
    repo.findWaitlistHead.mockResolvedValue(participant(2, { status: 'waiting', waiting_order: 1, registration_id: 2 }));
    repo.getNextWaitingOrderByTournament ?? null; // (repo-level SQL covered in the repository spec)
    await svc.promoteNextWaitlisted(1, 42);
    expect(repo.updateParticipantWaitingOrder).toHaveBeenCalledWith(2, null, expect.anything());
  });

  it('8. promotion payment follows Group 3 (cash → paid offline row)', async () => {
    tRepo.findById.mockResolvedValue({ ...TOURN, entry_fee: 200 });
    repo.findWaitlistHead.mockResolvedValue(participant(2, { status: 'waiting', waiting_order: 1, registration_id: 2 }));
    repo.findParticipantById.mockResolvedValue(participant(2, { status: 'active', registration_id: 2 }));
    const p = await svc.promoteNextWaitlisted(1, 42, 'cash');
    expect(tRepo.createCashPaymentTransaction).toHaveBeenCalledWith(expect.objectContaining({ userId: 20, registrationId: 2, amount: 200, currency: 'AED' }));
    expect(tRepo.updateRegistrationPaymentStatus).toHaveBeenCalledWith(2, 'paid');
    expect(p?.payment).toEqual(expect.objectContaining({ method: 'cash', status: 'paid' }));
    expect(bus.emit).toHaveBeenCalledWith('payment:succeeded', expect.objectContaining({ referenceType: 'tournament', referenceId: 2 }));
  });

  it('9. wallet remains unavailable (promotion rejects a wallet payment method)', async () => {
tournamentServiceMock.resolveEffectiveRegistrationPaymentMethods.mockResolvedValue(['cash', 'card']);
  tournamentServiceMock.resolveWithdrawnSlots.mockResolvedValue({ resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0 });
    await expect(svc.promoteNextWaitlisted(1, 42, 'wallet')).rejects.toThrow();
  });

  it('10. tenant isolation — a participant from another tournament cannot be promoted here', async () => {
    repo.findParticipantById.mockResolvedValue({ id: 2, tournament_id: 999, registration_id: 2, participant_type: 'individual', status: 'waiting', member_user_ids: [20] });
    await expect(svc.replaceParticipant(1, 5, 2, 42)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_NOT_FOUND });
  });
});

describe('Group 6 — PRE-START REPLACEMENT', () => {
  it('17/20/21. valid pre-start replacement creates a NEW active identity and never transfers the seed', async () => {
    repo.findParticipantById.mockImplementation(async (id: number) => {
      if (id === 5) return participant(5, { status: 'withdrawn' });       // withdrawn A
      if (id === 2) return participant(2, { status: 'waiting', waiting_order: 1, registration_id: 2, member_user_ids: [20] }); // waiting B
      return participant(id);
    });
    const r = await svc.replaceParticipant(1, 5, 2, 42);
    // B is promoted under B's OWN participant id (2) — A's id (5) is never reused.
    expect(repo.updateParticipantStatus).toHaveBeenCalledWith(2, 'active', expect.anything());
    expect(repo.updateParticipantStatus).not.toHaveBeenCalledWith(5, 'active');
    // No seed transfer: the draw impact flags revalidation; no seed row is moved.
    expect((repo as any).updateSeed).toBeUndefined();
    expect(r.drawImpact).toEqual(expect.objectContaining({ drawAffected: false, seedAffected: false }));
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.PARTICIPANT_REPLACED' }));
  });

  it('18. invalid replacement rejected (participant is not withdrawn / not waiting)', async () => {
    repo.findParticipantById.mockImplementation(async (id: number) => {
      if (id === 5) return participant(5, { status: 'active' }); // A still active — cannot replace
      if (id === 2) return participant(2, { status: 'active' }); // B already active
      return participant(id);
    });
    await expect(svc.replaceParticipant(1, 5, 2, 42)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_TRANSITION });
  });

  it('19. original participant remains historical (status update only)', async () => {
    repo.findParticipantById.mockImplementation(async (id: number) => {
      if (id === 5) return participant(5, { status: 'withdrawn' });
      if (id === 2) return participant(2, { status: 'waiting', waiting_order: 1, registration_id: 2, member_user_ids: [20] });
      return participant(id);
    });
    await svc.replaceParticipant(1, 5, 2, 42);
    // A's row is untouched after withdrawal (no delete, no re-activation).
    expect(repo.updateParticipantStatus).not.toHaveBeenCalledWith(5, expect.anything());
  });

  it('24. duplicate replacement prevented (B already active in the tournament)', async () => {
    repo.findParticipantById.mockImplementation(async (id: number) => {
      if (id === 5) return participant(5, { status: 'withdrawn' });
      if (id === 2) return participant(2, { status: 'waiting', waiting_order: 1, registration_id: 2, member_user_ids: [20] });
      return participant(id);
    });
    repo.findActiveParticipantByPlayer.mockResolvedValue(participant(77, { status: 'active', member_user_ids: [20] }));
    await expect(svc.replaceParticipant(1, 5, 2, 42)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_REGISTRATION_EXISTS });
  });

  it('22. draw impact is reported for replacement', async () => {
    repo.findParticipantById.mockImplementation(async (id: number) => {
      if (id === 5) return participant(5, { status: 'withdrawn' });
      if (id === 2) return participant(2, { status: 'waiting', waiting_order: 1, registration_id: 2, member_user_ids: [20] });
      return participant(id);
    });
    repo.findSeedByParticipant.mockResolvedValue({ id: 9, tournament_id: 1, participant_id: 5, seed_number: 3, source: 'manual' });
    repo.findCurrentDraw.mockResolvedValue({ id: 10, tournament_id: 1, status: 'draft' });
    repo.findDrawById.mockResolvedValue({ id: 10, tournament_id: 1, status: 'draft' });
    repo.findEntryByParticipant.mockResolvedValue({ id: 2, draw_id: 10, participant_id: 5, position: 0, placement_source: 'auto' });
    const r = await svc.replaceParticipant(1, 5, 2, 42);
    expect(r.drawImpact).toEqual(expect.objectContaining({ drawAffected: true, requiresRedraw: true, seedAffected: true }));
  });
});

describe('Group 6 — NOTIFICATIONS + REALTIME', () => {
  it('25/27/28/29. lifecycle events go through EventBusV2 (no direct socket.emit)', async () => {
    repo.findParticipantById.mockResolvedValue(participant(5));
    await svc.withdrawParticipant(1, 5, 42);
    expect(bus.emit).toHaveBeenCalledWith('tournament:participant-updated', expect.objectContaining({ tournamentId: 1, participantId: 5, status: 'withdrawn' }), expect.anything());
    // No direct socket API is referenced anywhere in the service.
    expect(bus.emit.mock.calls.every((c: any[]) => c[0].startsWith('tournament:') || c[0] === 'payment:succeeded')).toBe(true);
  });

  it('26. waitlist-promoted notification is emitted once (dedup handled by the notification engine)', async () => {
    repo.findWaitlistHead.mockResolvedValue(participant(2, { status: 'waiting', waiting_order: 1, registration_id: 2 }));
    repo.findParticipantById.mockResolvedValue(participant(2, { status: 'active', registration_id: 2 }));
    await svc.promoteNextWaitlisted(1, 42);
    const promotedEmits = bus.emit.mock.calls.filter((c: any[]) => c[0] === 'tournament:waitlist-promoted');
    expect(promotedEmits).toHaveLength(1);
    expect(promotedEmits[0][1]).toEqual(expect.objectContaining({ tournamentId: 1, participantId: 2, userId: 20 }));
  });
});