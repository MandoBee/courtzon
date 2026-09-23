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
  rescheduleCourt: vi.fn(),
  releaseCourt: vi.fn(),
}));

const crRepo = vi.hoisted(() => ({
  findTournamentBooking: vi.fn(),
}));

const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const bookingRepo = vi.hoisted(() => ({ checkSlotAvailability: vi.fn(async () => true) }));

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

vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: pdRepo }));
vi.mock('../infrastructure/repositories/participant-member.repository.js', () => ({ participantMemberRepository: pmRepo }));
vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: tRepo }));
vi.mock('../application/tournament.service.js', () => ({ tournamentService: tSvc }));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: matchSvc }));
vi.mock('../../booking/application/court-reservation.service.js', () => ({ courtReservationService: reservationSvc }));
vi.mock('../../booking/infrastructure/repositories/court-reservation.repository.js', () => ({ courtReservationRepository: crRepo }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => poolMock }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../booking/infrastructure/repositories/booking.repository.js', () => ({ bookingRepository: bookingRepo }));

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
  { id: 1, name: 'Court A', branch_id: 9, sport_id: 22, opening_time: '08:00', closing_time: '22:00', slot_duration: null },
  { id: 2, name: 'Court B', branch_id: 9, sport_id: 22, opening_time: '08:00', closing_time: '22:00', slot_duration: 30 },
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
  tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled' });
  reservationSvc.reserveCourt.mockResolvedValue({ bookingId: 5001, alreadyReserved: false });
  reservationSvc.rescheduleCourt.mockResolvedValue({ bookingId: 5002, released: true });
  reservationSvc.releaseCourt.mockResolvedValue({ released: true, bookingId: 5001 });
  crRepo.findTournamentBooking.mockResolvedValue(null);
  bookingRepo.checkSlotAvailability.mockResolvedValue(true);
  matchSvc.createForTournament.mockResolvedValue({ id: 900 });
  poolConn.beginTransaction.mockImplementation(async () => undefined);
  poolConn.commit.mockImplementation(async () => undefined);
  poolConn.rollback.mockImplementation(async () => undefined);
  poolConn.release.mockImplementation(() => undefined);
  poolConn.query.mockImplementation(async () => [[]]);
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
    pdRepo.findDrawEntries.mockResolvedValue([
      { id: 1, draw_id: 10, participant_id: 1, position: 0 },
      { id: 2, draw_id: 10, participant_id: 2, position: 1 },
    ]);
    pdRepo.findParticipantById.mockImplementation(async (id: number) => participant(id));
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
    // participant refs + primary member refs written (call 0 = draw slot (1,2))
    expect(tRepo.createMatch.mock.calls[0][0]).toMatchObject({ participant1_id: 1, participant2_id: 2, player1_id: 10, player2_id: 20 });
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
    expect(tRepo.createMatch.mock.calls.some((c: any[]) => c[0].match_number === 0)).toBe(true);
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

describe('G8 VERIFY — PART 1: auto-scheduling availability safety', () => {
  it('P1. an availability INFRASTRUCTURE error is never interpreted as AVAILABLE (autoSchedule aborts)', async () => {
    tRepo.findMatches.mockResolvedValue([{ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled', resource_id: null }]);
    bookingRepo.checkSlotAvailability.mockRejectedValue(new Error('db connection lost'));
    await expect(svc.autoSchedule(1, 1)).rejects.toThrow('db connection lost');
    // No match may be scheduled when availability could not be verified.
    expect(reservationSvc.reserveCourt).not.toHaveBeenCalled();
  });

  it('P2. OCCUPIED is reported as a conflict, not scheduled, and the match stays unscheduled', async () => {
    tRepo.findMatches.mockResolvedValue([{ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled', resource_id: null }]);
    bookingRepo.checkSlotAvailability.mockResolvedValue(false); // every candidate occupied
    const r = await svc.autoSchedule(1, 1);
    expect(r.conflicts).toBeGreaterThan(0);
    expect(r.scheduled).toBe(0);
    expect(reservationSvc.reserveCourt).not.toHaveBeenCalled();
    // The match remains in a clear unscheduled state (resource_id NULL).
    expect(tRepo.updateMatch).not.toHaveBeenCalledWith(50, expect.objectContaining({ resource_id: expect.any(Number) }));
  });

  it('P3. a VALIDATION failure (un-eligible court) is reported as skipped, not scheduled', async () => {
    tRepo.findMatches.mockResolvedValue([{ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled', resource_id: null }]);
    tRepo.findEligibleCourts.mockResolvedValue([]);
    await expect(svc.autoSchedule(1, 1)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_COURT_NOT_ELIGIBLE });
  });

  it('P4. SYSTEM_ERROR during a reservation aborts autoSchedule (no partial silent continue)', async () => {
    tRepo.findMatches.mockResolvedValue([{ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled', resource_id: null }]);
    tRepo.findEligibleCourts.mockResolvedValue(COURTS);
    reservationSvc.reserveCourt.mockRejectedValue(new Error('redis lock failure'));
    await expect(svc.autoSchedule(1, 1)).rejects.toThrow('redis lock failure');
  });
});

describe('G8 VERIFY — PART 2: rescheduling safety (exactly one authoritative reservation)', () => {
  const EXISTING = { id: 9001, resource_id: 1, booking_date: '2026-12-01', start_time: '10:00:00', end_time: '11:00:00', booking_type: 'tournament' };

  it('A. same court + same time → idempotent, no new booking, old kept', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled' });
    crRepo.findTournamentBooking.mockResolvedValue(EXISTING);
    const r = await svc.scheduleMatch(1, 50, { date: '2026-12-01', start_time: '10:00', end_time: '11:00', resource_id: 1 }, 1);
    expect(r.bookingId).toBe(9001);
    expect(reservationSvc.reserveCourt).not.toHaveBeenCalled();
    expect(reservationSvc.rescheduleCourt).not.toHaveBeenCalled();
  });

  it('B. same court + different time → old reservation released via atomic reschedule', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled' });
    crRepo.findTournamentBooking.mockResolvedValue(EXISTING);
    const r = await svc.scheduleMatch(1, 50, { date: '2026-12-01', start_time: '14:00', end_time: '15:00', resource_id: 1 }, 1);
    expect(reservationSvc.rescheduleCourt).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 1, startTime: '14:00' }), 9001);
    expect(r.bookingId).toBe(5002);
  });

  it('C. different court + same time → old court released, new court reserved', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled' });
    crRepo.findTournamentBooking.mockResolvedValue(EXISTING);
    await svc.scheduleMatch(1, 50, { date: '2026-12-01', start_time: '10:00', end_time: '11:00', resource_id: 2 }, 1);
    expect(reservationSvc.rescheduleCourt).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 2 }), 9001);
  });

  it('D. different court + different time → atomic swap (new created, old released in one transaction)', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled' });
    crRepo.findTournamentBooking.mockResolvedValue(EXISTING);
    const r = await svc.scheduleMatch(1, 50, { date: '2026-12-02', start_time: '09:00', end_time: '10:00', resource_id: 2 }, 1);
    expect(reservationSvc.rescheduleCourt).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 2, date: '2026-12-02' }), 9001);
    expect(r.bookingId).toBe(5002);
  });

  it('E. new slot conflicts → old reservation left intact, operation rejected', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled' });
    crRepo.findTournamentBooking.mockResolvedValue(EXISTING);
    const err: any = new Error('One or more court slots are no longer available');
    err.code = ErrorCodes.COURT_SLOT_UNAVAILABLE;
    reservationSvc.rescheduleCourt.mockRejectedValue(err);
    await expect(svc.scheduleMatch(1, 50, { date: '2026-12-01', start_time: '14:00', end_time: '15:00', resource_id: 1 }, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_COURT_UNAVAILABLE });
    // The old reservation was NOT released (transactional guard).
    expect(reservationSvc.releaseCourt).not.toHaveBeenCalled();
  });

  it('F. reschedule emits the court event only when it actually replaced the reservation', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled' });
    crRepo.findTournamentBooking.mockResolvedValue(EXISTING);
    await svc.scheduleMatch(1, 50, { date: '2026-12-01', start_time: '14:00', end_time: '15:00', resource_id: 1 }, 1);
    const courtReservedCalls = bus.emit.mock.calls.filter((c: any[]) => c[0] === 'tournament:court-reserved');
    expect(courtReservedCalls.length).toBe(1);
  });
});

describe('G8 VERIFY — PART 3: generation duplication race', () => {
  it('P1. generation runs in a transaction with the tournament row locked and an in-lock re-count', async () => {
    pdRepo.findCurrentDraw.mockResolvedValue(draw(10, 'locked'));
    pdRepo.findDrawEntries.mockResolvedValue([
      { id: 1, draw_id: 10, participant_id: 1, position: 0 },
      { id: 2, draw_id: 10, participant_id: 2, position: 1 },
    ]);
    pdRepo.findParticipantById.mockImplementation(async (id: number) => participant(id));
    await svc.generateMatchesFromLockedDraw(1, 1);
    expect(poolConn.query).toHaveBeenCalledWith('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [1]);
    expect(tRepo.countMatches).toHaveBeenCalledWith(1, expect.anything()); // in-lock re-count
  });

  it('P2. a second concurrent request is blocked by the in-lock re-count (one authoritative set)', async () => {
    pdRepo.findCurrentDraw.mockResolvedValue(draw(10, 'locked'));
    pdRepo.findDrawEntries.mockResolvedValue([
      { id: 1, draw_id: 10, participant_id: 1, position: 0 },
      { id: 2, draw_id: 10, participant_id: 2, position: 1 },
    ]);
    pdRepo.findParticipantById.mockImplementation(async (id: number) => participant(id));
    // Simulate: the winning transaction committed 2 matches before the loser's
    // in-lock re-count runs.
    tRepo.countMatches.mockImplementationOnce(async () => 0).mockImplementationOnce(async () => 2);
    await svc.generateMatchesFromLockedDraw(1, 1);
    await expect(svc.generateMatchesFromLockedDraw(1, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_MATCHES_ALREADY_GENERATED });
  });

  it('P3. generation is atomic — a mid-generation failure rolls back everything (no partial bracket)', async () => {
    pdRepo.findCurrentDraw.mockResolvedValue(draw(10, 'locked'));
    pdRepo.findDrawEntries.mockResolvedValue([
      { id: 1, draw_id: 10, participant_id: 1, position: 0 },
      { id: 2, draw_id: 10, participant_id: 2, position: 1 },
      { id: 3, draw_id: 10, participant_id: 3, position: 2 },
      { id: 4, draw_id: 10, participant_id: 4, position: 3 },
    ]);
    pdRepo.findParticipantById.mockImplementation(async (id: number) => participant(id));
    matchSvc.createForTournament.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ id: 900 });
    await expect(svc.generateMatchesFromLockedDraw(1, 1)).rejects.toThrow('boom');
    expect(poolConn.rollback).toHaveBeenCalled();
    expect(matchSvc.createForTournament).toHaveBeenCalledTimes(1); // aborted after first failure
  });
});

describe('G8 VERIFY — PART 5: dynamic match duration', () => {
  it('D1. rule-set match_duration_minutes is the authoritative duration (football 90)', async () => {
    tRepo.findMatches.mockResolvedValue([{ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled', resource_id: null }]);
    tRepo.findEligibleCourts.mockResolvedValue([{ id: 1, name: 'Court A', branch_id: 9, sport_id: 22, opening_time: '08:00', closing_time: '22:00', slot_duration: null }]);
    tSvc.resolveMatchFormatContext.mockResolvedValue({ ...FORMAT_CTX, ruleSnapshot: { score_structure: 'goals', match_duration_minutes: 90 } });
    await svc.autoSchedule(1, 1);
    // 90-min grid aligned to court opening (08:00, 09:30, ...) — first slot fully
    // inside the tournament daily window (09:00–21:00) is 09:30–11:00.
    expect(reservationSvc.reserveCourt).toHaveBeenCalledWith(expect.objectContaining({ startTime: '09:30', endTime: '11:00', resourceId: 1 }));
  });

  it('D2. court slot_duration is used when no rule duration exists', async () => {
    tRepo.findMatches.mockResolvedValue([{ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled', resource_id: null }]);
    tRepo.findEligibleCourts.mockResolvedValue([{ id: 2, name: 'Court B', branch_id: 9, sport_id: 22, opening_time: '08:00', closing_time: '22:00', slot_duration: 30 }]);
    tSvc.resolveMatchFormatContext.mockResolvedValue({ ...FORMAT_CTX, ruleSnapshot: { score_structure: 'sets' } });
    await svc.autoSchedule(1, 1);
    // daily window starts at 09:00 → first 30-min slot is 09:00–09:30
    expect(reservationSvc.reserveCourt).toHaveBeenCalledWith(expect.objectContaining({ startTime: '09:00', endTime: '09:30', resourceId: 2 }));
  });
});

describe('G8 VERIFY — PART 7: financial isolation + realtime', () => {
  it('F1. scheduleMatch emits NO booking/payment/accounting events (tournament-only realtime)', async () => {
    tRepo.findMatchById.mockResolvedValue({ id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled' });
    crRepo.findTournamentBooking.mockResolvedValue(null);
    await svc.scheduleMatch(1, 50, { date: '2026-12-01', start_time: '10:00', end_time: '11:00', resource_id: 1 }, 1);
    const bookingEvents = bus.emit.mock.calls.filter((c: any[]) => c[0].startsWith('booking:') || c[0].startsWith('payment:') || c[0].startsWith('accounting:'));
    expect(bookingEvents).toHaveLength(0);
    const tournamentEvents = bus.emit.mock.calls.filter((c: any[]) => c[0].startsWith('tournament:'));
    expect(tournamentEvents.length).toBeGreaterThan(0);
  });

  it('F2. autoSchedule reports scheduled / conflicts / skipped explicitly', async () => {
    tRepo.findMatches.mockResolvedValue([
      { id: 50, tournament_id: 1, match_id: 900, round: 1, status: 'scheduled', resource_id: null },
    ]);
    tRepo.findEligibleCourts.mockResolvedValue(COURTS);
    reservationSvc.reserveCourt.mockResolvedValue({ bookingId: 5001, alreadyReserved: false });
    const r = await svc.autoSchedule(1, 1);
    expect(r.scheduled).toBe(1);
    expect(r.conflicts).toBe(0);
    expect(r.skipped).toBe(0);
  });
});

describe('G8 VERIFY — PART 6: court eligibility', () => {
  it('E1. listEligibleCourts is gated on the tournament existing (tenant/branch guard flows through)', async () => {
    tSvc.getByIdDetailed.mockRejectedValue(Object.assign(new Error('Tournament not found'), { errorCode: 'TOURNAMENT_NOT_FOUND' }));
    await expect(svc.listEligibleCourts(999)).rejects.toMatchObject({ errorCode: 'TOURNAMENT_NOT_FOUND' });
    expect(tRepo.findEligibleCourts).not.toHaveBeenCalled();
  });

  it('E2. listEligibleCourts returns only the tournament branch + sport active courts (branch isolation)', async () => {
    tRepo.findEligibleCourts.mockResolvedValue([
      { id: 1, name: 'Court A', branch_id: 9, sport_id: 22, opening_time: '08:00', closing_time: '22:00', slot_duration: null },
      { id: 2, name: 'Court B', branch_id: 9, sport_id: null, opening_time: '08:00', closing_time: '22:00', slot_duration: null },
    ]);
    const courts = await svc.listEligibleCourts(1);
    expect(courts.every((c) => c.branch_id === 9)).toBe(true);
    expect(courts.every((c) => c.sport_id === 22 || c.sport_id === null)).toBe(true);
  });
});

describe('G9-A — ROUND-1 PROGRESSION TARGET WIRING (G8 locked-draw path)', () => {
  function entries(n: number) {
    return Array.from({ length: n }, (_, i) => ({ id: i + 1, draw_id: 10, participant_id: i + 1, position: i }));
  }

  it('T1. 8 participants — Round-1 slots persist exact targets; Round-2/Final placeholders exist for progression', async () => {
    pdRepo.findCurrentDraw.mockResolvedValue(draw(10, 'locked'));
    pdRepo.findDrawEntries.mockResolvedValue(entries(8));
    pdRepo.findParticipantById.mockImplementation(async (id: number) => participant(id));

    const r = await svc.generateMatchesFromLockedDraw(1, 1);
    expect(r.generated).toBe(4);
    expect(r.byes).toBe(0);

    const created = tRepo.createMatch.mock.calls.map((c: any[]) => c[0]);
    // 4 Round-1 real matches + 2 Round-2 placeholders + 1 Final placeholder = 7 slots.
    expect(created).toHaveLength(7);

    const r1 = created.filter((c: any) => c.round === 1 && c.match_id != null);
    expect(r1).toHaveLength(4);
    expect(r1.map((c: any) => c.progression_meta.target_round)).toEqual([2, 2, 2, 2]);
    expect(r1.map((c: any) => c.progression_meta.target_bracket_position)).toEqual([0, 0, 1, 1]);
    expect(r1.map((c: any) => c.progression_meta.target_side)).toEqual(['player1', 'player2', 'player1', 'player2']);
    // Round-1 real matches keep their shared Match + participants.
    expect(r1.every((c: any) => c.match_id != null && c.participant1_id != null && c.participant2_id != null)).toBe(true);

    const r2 = created.filter((c: any) => c.round === 2);
    expect(r2).toHaveLength(2);
    expect(r2.map((c: any) => c.progression_meta.target_round)).toEqual([3, 3]);
    expect(r2.map((c: any) => c.progression_meta.target_bracket_position)).toEqual([0, 0]);

    const fin = created.filter((c: any) => c.round === 3);
    expect(fin).toHaveLength(1);
    expect(fin[0].progression_meta.target_round).toBeNull();
    expect(fin[0].progression_meta.target_bracket_position).toBeNull();

    // Placeholders carry no shared Match; only real Round-1 matches create one.
    expect([...r2, ...fin].every((c: any) => c.match_id == null)).toBe(true);
    expect(matchSvc.createForTournament).toHaveBeenCalledTimes(4);
  });

  it('T2. 5 participants — lone bye + empty padding are wired; no shared Match for a bye', async () => {
    pdRepo.findCurrentDraw.mockResolvedValue(draw(10, 'locked'));
    pdRepo.findDrawEntries.mockResolvedValue(entries(5));
    pdRepo.findParticipantById.mockImplementation(async (id: number) => participant(id));

    const r = await svc.generateMatchesFromLockedDraw(1, 1);
    expect(r.generated).toBe(2);
    expect(r.byes).toBe(1);

    const created = tRepo.createMatch.mock.calls.map((c: any[]) => c[0]);
    const r1 = created.filter((c: any) => c.round === 1);
    expect(r1).toHaveLength(4);
    const r1Bye = r1.filter((c: any) => c.progression_meta.bye === true);
    expect(r1Bye).toHaveLength(2); // lone bye (p5) + empty padding

    // The lone bye (present participant) is wired to Round-2 position 1, side player1.
    const loneBye = r1Bye.find((c: any) => c.player1_id != null);
    expect(loneBye.progression_meta.target_round).toBe(2);
    expect(loneBye.progression_meta.target_bracket_position).toBe(1);
    expect(loneBye.progression_meta.target_side).toBe('player1');
    // No shared Match for any bye — never playable.
    expect(r1Bye.every((c: any) => c.match_id == null)).toBe(true);

    // Round-2 + Final placeholders exist so the bye can advance to the Final.
    expect(created.filter((c: any) => c.round === 2)).toHaveLength(2);
    expect(created.filter((c: any) => c.round === 3)).toHaveLength(1);
    expect(matchSvc.createForTournament).toHaveBeenCalledTimes(2);
  });

  it('T3. Round Robin — NO progression target metadata is introduced (regression)', async () => {
    tSvc.getByIdDetailed.mockResolvedValue({ ...TOUR, format: 'round_robin' });
    pdRepo.findCurrentDraw.mockResolvedValue(draw(10, 'locked'));
    pdRepo.findDrawEntries.mockResolvedValue(entries(4));
    pdRepo.findParticipantById.mockImplementation(async (id: number) => participant(id));

    const r = await svc.generateMatchesFromLockedDraw(1, 1);
    const created = tRepo.createMatch.mock.calls.map((c: any[]) => c[0]);
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((c: any) => c.progression_meta.is_bracket === false)).toBe(true);
    expect(created.every((c: any) => c.progression_meta.target_round == null)).toBe(true);
    expect(r.generated).toBe(6); // 4 players → 6 pairings
    expect(r.byes).toBe(0);
  });
});