import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { MatchScheduleService } from '../application/match-schedule.service.js';

const pdRepo = vi.hoisted(() => ({
  findParticipantById: vi.fn(),
  findCurrentDraw: vi.fn(),
  findDrawEntries: vi.fn(),
}));

const pmRepo = vi.hoisted(() => ({
  listMembersByParticipant: vi.fn(),
}));

const tRepo = vi.hoisted(() => ({
  countMatches: vi.fn(),
  createMatch: vi.fn(),
  findMatches: vi.fn(),
  findMatchesDetailed: vi.fn(),
  findMatchById: vi.fn(),
  findEligibleCourts: vi.fn(),
  updateMatch: vi.fn(),
}));

const tSvc = vi.hoisted(() => ({
  getByIdDetailed: vi.fn(),
  resolveMatchFormatContext: vi.fn(),
  advanceByes: vi.fn(),
}));

const matchSvc = vi.hoisted(() => ({
  createForTournament: vi.fn(),
}));

const reservationSvc = vi.hoisted(() => ({
  reserveCourt: vi.fn(),
  releaseCourt: vi.fn(),
}));

const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));

vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: pdRepo }));
vi.mock('../infrastructure/repositories/participant-member.repository.js', () => ({ participantMemberRepository: pmRepo }));
vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: tRepo }));
vi.mock('../application/tournament.service.js', () => ({ tournamentService: tSvc }));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: matchSvc }));
vi.mock('../../booking/application/court-reservation.service.js', () => ({ courtReservationService: reservationSvc }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../booking/infrastructure/repositories/booking.repository.js', () => ({ bookingRepository: { checkSlotAvailability: vi.fn(async () => true) } }));

const svc = new MatchScheduleService();

function draw(id: number, status: string) {
  return { id, tournament_id: 1, attempt_number: 1, draw_seed: 42, status, validation_status: 'valid', is_current: 1 };
}

function participant(id: number, type = 'individual', memberUserIds?: number[]) {
  return { id, tournament_id: 1, registration_id: id, participant_type: type, status: 'active', member_user_ids: memberUserIds ?? [id * 10] };
}

const TOUR = {
  id: 1, creator_id: 1, organisation_id: 5, branch_id: 9, sport_id: 22, match_format_id: 1, rule_set_id: 1,
  format: 'knockout', name: 'Cup', status: 'running', start_date: '2026-12-01', end_date: '2026-12-03',
  daily_start_time: '09:00', daily_end_time: '21:00', branch_timezone: 'Africa/Cairo', entry_fee: 0,
};

const FORMAT_CTX = {
  formatId: 1, ruleSetId: 1,
  formatSnapshot: { formatId: 1, formatType: 'doubles', playersPerSide: 2, name: 'Padel Standard' },
  ruleSnapshot: { score_structure: 'sets' },
};

const COURTS = [
  { id: 1, name: 'Court A', branch_id: 9, sport_id: 22, opening_time: '08:00', closing_time: '22:00' },
  { id: 2, name: 'Court B', branch_id: 9, sport_id: 22, opening_time: '08:00', closing_time: '22:00' },
];

beforeEach(() => {
  vi.clearAllMocks();
  tSvc.getByIdDetailed.mockResolvedValue(TOUR);
  tSvc.resolveMatchFormatContext.mockResolvedValue(FORMAT_CTX);
  tSvc.advanceByes.mockResolvedValue({ advanced: 0 });
  tRepo.countMatches.mockResolvedValue(0);
  tRepo.createMatch.mockResolvedValue(100);
  tRepo.findEligibleCourts.mockResolvedValue(COURTS);
  tRepo.findMatchesDetailed.mockResolvedValue([]);
  reservationSvc.reserveCourt.mockResolvedValue({ bookingId: 5001, alreadyReserved: false });
  reservationSvc.releaseCourt.mockResolvedValue({ released: true, bookingId: 5001 });
  matchSvc.createForTournament.mockResolvedValue({ id: 900 });
});

describe('G8 — MATCH GENERATION from LOCKED draw', () => {
  it('A1. generation requires a LOCKED draw (draft rejected)', async () => {
    pdRepo.findCurrentDraw.mockResolvedValue(draw(10, 'draft'));
    await expect(svc.generateMatchesFromLockedDraw(1, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_DRAW_NOT_LOCKED });
  });

  it('A2. approved draw is also rejected (only locked is authoritative)', async () => {
    pdRepo.findCurrentDraw.mockResolvedValue(draw(10, 'approved'));
    await expect(svc.generateMatchesFromLockedDraw(1, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_DRAW_NOT_LOCKED });
  });

  it('A3. generation is blocked once matches already exist', async () => {
    pdRepo.findCurrentDraw.mockResolvedValue(draw(10, 'locked'));
    tRepo.countMatches.mockResolvedValue(3);
    await expect(svc.generateMatchesFromLockedDraw(1, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_MATCHES_ALREADY_GENERATED });
  });

  it('A4. creates participant-based matches from the locked draw order', async () => {
    pdRepo.findCurrentDraw.mockResolvedValue(draw(10, 'locked'));
    pdRepo.findDrawEntries.mockResolvedValue([
      { id: 1, draw_id: 10, participant_id: 1, position: 0 },
      { id: 2, draw_id: 10, participant_id: 2, position: 1 },
      { id: 3, draw_id: 10, participant_id: 3, position: 2 },
      { id: 4, draw_id: 10, participant_id: 4, position: 3 },
    ]);
    pdRepo.findParticipantById.mockImplementation(async (id: number) => participant(id));
    const r = await svc.generateMatchesFromLockedDraw(1, 1);
    expect(r.generated).toBe(2); // 4 participants → 2 round-1 knockout matches
    expect(r.byes).toBe(0);
    // participant refs + primary member refs written
    expect(tRepo.createMatch).toHaveBeenCalledWith(expect.objectContaining({ participant1_id: 1, participant2_id: 2, player1_id: 10, player2_id: 20 }));
    expect(matchSvc.createForTournament).toHaveBeenCalledTimes(2);
    expect(bus.emit).toHaveBeenCalledWith('tournament:matches-generated', expect.objectContaining({ tournamentId: 1, generated: 2 }), expect.anything());
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.MATCHES_GENERATED' }));
  });

  it('A5. doubles/team members become match_participants with explicit side + team_index', async () => {
    pdRepo.findCurrentDraw.mockResolvedValue(draw(10, 'locked'));
    pdRepo.findDrawEntries.mockResolvedValue([
      { id: 1, draw_id: 10, participant_id: 1, position: 0 },
      { id: 2, draw_id: 10, participant_id: 2, position: 1 },
    ]);
    pdRepo.findParticipantById.mockImplementation(async (id: number) =>
      id === 1 ? participant(1, 'pair', [11, 12]) : participant(2, 'pair', [21, 22]),
    );
    await svc.generateMatchesFromLockedDraw(1, 1);
    const call = matchSvc.createForTournament.mock.calls[0][0];
    expect(call.participants).toEqual([
      { userId: 11, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 12, side: 'home', teamIndex: 0, role: 'host' },
      { userId: 21, side: 'away', teamIndex: 1, role: 'joiner' },
      { userId: 22, side: 'away', teamIndex: 1, role: 'joiner' },
    ]);
  });

  it('A6. bye slots create NO shared match and NO court', async () => {
    pdRepo.findCurrentDraw.mockResolvedValue(draw(10, 'locked'));
    pdRepo.findDrawEntries.mockResolvedValue([
      { id: 1, draw_id: 10, participant_id: 1, position: 0 },
      { id: 2, draw_id: 10, participant_id: 2, position: 1 },
      { id: 3, draw_id: 10, participant_id: 3, position: 2 },
      { id: 4, draw_id: 10, participant_id: 4, position: 3 },
      { id: 5, draw_id: 10, participant_id: 5, position: 4 },
    ]);
    pdRepo.findParticipantById.mockImplementation(async (id: number) => participant(id));
    const r = await svc.generateMatchesFromLockedDraw(1, 1);
    // 5 participants → power of 2 = 8 → round1: [0v1, 2v3, 4vBYE, ∅] → 2 real + 1 bye + 1 padding skip
    expect(r.generated).toBe(2);
    expect(r.byes).toBe(1);
    expect(matchSvc.createForTournament).toHaveBeenCalledTimes(2);
    expect(tRepo.createMatch).toHaveBeenCalledWith(expect.objectContaining({ match_number: 0 }));
  });

  it('A7. unsupported bracket returns a structured error (never wrong matches)', async () => {
    tSvc.getByIdDetailed.mockResolvedValue({ ...TOUR, format: 'double_elimination' });
    pdRepo.findCurrentDraw.mockResolvedValue(draw(10, 'locked'));
    await expect(svc.generateMatchesFromLockedDraw(1, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
    expect(matchSvc.createForTournament).not.toHaveBeenCalled();
  });
});

describe('G8 — SCHEDULING + COURT RESERVATION', () => {
  it('B1. valid schedule reserves the court + persists schedule fields', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled' });
    tRepo.updateMatch.mockResolvedValue(undefined);
    const r = await svc.scheduleMatch(1, 50, { date: '2026-12-01', start_time: '10:00', end_time: '11:00', resource_id: 1 }, 1);
    expect(reservationSvc.reserveCourt).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 900, resourceId: 1, userId: 1, organisationId: 5, branchId: 9,
    }));
    expect(tRepo.updateMatch).toHaveBeenCalledWith(50, expect.objectContaining({ resource_id: 1, status: 'scheduled' }));
    expect(r.bookingId).toBe(5001);
    expect(bus.emit).toHaveBeenCalledWith('tournament:court-reserved', expect.objectContaining({ matchId: 50, bookingId: 5001 }), expect.anything());
  });

  it('B2. a bye / placeholder match can never schedule or reserve a court', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 51, tournament_id: 1, match_id: null, round: 1, status: 'scheduled' });
    await expect(svc.scheduleMatch(1, 51, { date: '2026-12-01', start_time: '10:00', end_time: '11:00', resource_id: 1 }, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_BYE_MATCH });
    expect(reservationSvc.reserveCourt).not.toHaveBeenCalled();
  });

  it('B3. a court not eligible for the tournament is rejected', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled' });
    await expect(svc.scheduleMatch(1, 50, { date: '2026-12-01', start_time: '10:00', end_time: '11:00', resource_id: 999 }, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_COURT_NOT_ELIGIBLE });
  });

  it('B4. a date outside the tournament window is rejected', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled' });
    await expect(svc.scheduleMatch(1, 50, { date: '2027-01-05', start_time: '10:00', end_time: '11:00', resource_id: 1 }, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_SCHEDULE_INVALID });
  });

  it('B5. a time outside the tournament daily window is rejected', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled' });
    await expect(svc.scheduleMatch(1, 50, { date: '2026-12-01', start_time: '22:30', end_time: '23:30', resource_id: 1 }, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_SCHEDULE_INVALID });
  });

  it('B6. a court availability conflict (normal booking) is surfaced as unavailable', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled' });
    reservationSvc.reserveCourt.mockRejectedValue(new Error('One or more court slots are no longer available'));
    await expect(svc.scheduleMatch(1, 50, { date: '2026-12-01', start_time: '10:00', end_time: '11:00', resource_id: 1 }, 1))
      .rejects.toThrow(/no longer available/);
  });

  it('B7. reservation is idempotent (already reserved → returns existing, no double book)', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled' });
    reservationSvc.reserveCourt.mockResolvedValue({ bookingId: 5001, alreadyReserved: true });
    const r = await svc.scheduleMatch(1, 50, { date: '2026-12-01', start_time: '10:00', end_time: '11:00', resource_id: 1 }, 1);
    expect(r.bookingId).toBe(5001);
    expect(reservationSvc.reserveCourt).toHaveBeenCalledTimes(1);
  });

  it('B8. release frees the reservation + clears the court', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled' });
    const r = await svc.releaseMatchCourt(1, 50, 1);
    expect(r.released).toBe(true);
    expect(tRepo.updateMatch).toHaveBeenCalledWith(50, expect.objectContaining({ resource_id: null }));
    expect(bus.emit).toHaveBeenCalledWith('tournament:court-released', expect.objectContaining({ matchId: 50 }), expect.anything());
  });

  it('B9. tenant isolation — a match of another tournament is rejected', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 999, match_id: 900, round: 1, status: 'scheduled' });
    await expect(svc.scheduleMatch(1, 50, { date: '2026-12-01', start_time: '10:00', end_time: '11:00', resource_id: 1 }, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_MATCH_NOT_FOUND });
  });
});

describe('G8 — REALTIME + AUDIT', () => {
  it('C1. all mutations go through EventBusV2 (no direct socket.emit)', async () => {
    pdRepo.findCurrentDraw.mockResolvedValue(draw(10, 'locked'));
    pdRepo.findDrawEntries.mockResolvedValue([
      { id: 1, draw_id: 10, participant_id: 1, position: 0 },
      { id: 2, draw_id: 10, participant_id: 2, position: 1 },
    ]);
    pdRepo.findParticipantById.mockImplementation(async (id: number) => participant(id));
    await svc.generateMatchesFromLockedDraw(1, 1);
    expect(bus.emit.mock.calls.every((c: any[]) => c[0].startsWith('tournament:'))).toBe(true);
    expect((svc as any).io).toBeUndefined();
  });
});