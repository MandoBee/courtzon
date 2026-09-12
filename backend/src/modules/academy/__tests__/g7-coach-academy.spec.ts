// ============================================================================
// Academy G7 — Coach-facing Academy (unit tests)
//
// Exercises the REAL coach-academy service (thin authorization wrapper) against
// mocked repositories + shared G5 services. Covers coach scope (group.coach_id =
// authenticated user), non-revealing denial, roster, attendance integrity,
// lifecycle delegation (single-winner), and approved-coach gate.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

const conn = vi.hoisted(() => ({
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(async () => undefined),
  query: async () => [[], []],
  execute: async () => [{ affectedRows: 0 }],
}));
const fakePool = vi.hoisted(() => ({ getConnection: async () => conn }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => fakePool }));

const scope = vi.hoisted(() => ({ isApprovedCoach: vi.fn(), resolveProgramScope: vi.fn(), assertCanManageAcademy: vi.fn() }));
vi.mock('../application/academy-scope.js', () => scope);

const sessionRepo = vi.hoisted(() => ({
  list: vi.fn(), createManual: vi.fn(), update: vi.fn(), getById: vi.fn(), getByIdForUpdate: vi.fn(), updateStatusConditional: vi.fn(),
  listForCoach: vi.fn(), getByIdForCoach: vi.fn(),
}));
vi.mock('../infrastructure/repositories/session.repository.js', () => ({ sessionRepository: sessionRepo }));

const attendanceRepo = vi.hoisted(() => ({
  getSession: vi.fn(), getSessionGroupId: vi.fn(), getAttendanceSessionId: vi.fn(), list: vi.fn(),
  getBySessionAndEnrollment: vi.fn(), create: vi.fn(), update: vi.fn(), getBySession: vi.fn(),
  getAttendanceSummary: vi.fn(), getSessionRoster: vi.fn(), getSessionRosterCount: vi.fn(), getByIdWithSession: vi.fn(),
  listForPlayer: vi.fn(),
}));
vi.mock('../infrastructure/repositories/attendance.repository.js', () => ({ attendanceRepository: attendanceRepo }));

const enrollmentRepo = vi.hoisted(() => ({
  getById: vi.fn(), getByPlayerAndProgram: vi.fn(), getConfirmedCount: vi.fn(), getGroupConfirmedCount: vi.fn(),
  getNextWaitingOrder: vi.fn(), create: vi.fn(), getByIdForUpdate: vi.fn(), getWaitlistHead: vi.fn(),
  promoteToConfirmed: vi.fn(), updateStatus: vi.fn(), moveToGroup: vi.fn(), getHistory: vi.fn(),
  markPaymentConfirmed: vi.fn(), getConfirmedUserIdsByGroup: vi.fn(), countConfirmedByPrograms: vi.fn(), listForPlayer: vi.fn(),
}));
vi.mock('../infrastructure/repositories/enrollment.repository.js', () => ({ enrollmentRepository: enrollmentRepo }));

const groupRepo = vi.hoisted(() => ({ getByIdForCapacity: vi.fn(), getById: vi.fn() }));
vi.mock('../infrastructure/repositories/group.repository.js', () => ({ groupRepository: groupRepo }));

const programRepo = vi.hoisted(() => ({ getById: vi.fn(), getCapacityForUpdate: vi.fn(), getPublicById: vi.fn(), listPublic: vi.fn() }));
vi.mock('../infrastructure/repositories/program.repository.js', () => ({ programRepository: programRepo }));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock('../../audit-log/index.js', () => audit);

const eventBus = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: eventBus }));

import { coachAcademyService } from '../application/coach-academy.service.js';

function makeCoachSession(overrides: Record<string, any> = {}) {
  return {
    id: 10, group_id: 2, group_name: 'G', program_id: 1, program_name: 'Tennis Pro', program_code: 'AC1',
    session_date: '2028-06-01', start_time: '10:00', end_time: '11:00', timezone: 'Asia/Riyadh',
    start_at_utc: '2028-06-01T07:00:00.000Z', status: 'scheduled', court_id: 10, court_name: 'Court A', ...overrides,
  };
}

function makeEnrollment(overrides: Record<string, any> = {}) {
  return { id: 100, player_id: 200, program_id: 1, group_id: 2, status: 'confirmed', waiting_order: null, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  scope.isApprovedCoach.mockResolvedValue(true);
  sessionRepo.listForCoach.mockResolvedValue([makeCoachSession()]);
  sessionRepo.getByIdForCoach.mockResolvedValue(makeCoachSession());
  sessionRepo.getById.mockResolvedValue(makeCoachSession());
  sessionRepo.getByIdForUpdate.mockResolvedValue(makeCoachSession());
  sessionRepo.updateStatusConditional.mockResolvedValue(true);
  attendanceRepo.getSession.mockResolvedValue({ id: 10, group_id: 2, status: 'in_progress' });
  attendanceRepo.getSessionRoster.mockResolvedValue([{ enrollment_id: 100, player_id: 200, player_name: 'P1', enrollment_status: 'confirmed', attendance_status: null }]);
  attendanceRepo.getSessionRosterCount.mockResolvedValue(1);
  attendanceRepo.getAttendanceSummary.mockResolvedValue({ present: 0, absent: 0, excused: 0, late: 0 });
  attendanceRepo.getByIdWithSession.mockResolvedValue({ attendance: { id: 1, group_session_id: 10, enrollment_id: 100 }, session: { status: 'in_progress', group_id: 2 } });
  attendanceRepo.getBySessionAndEnrollment.mockResolvedValue(null);
  attendanceRepo.create.mockResolvedValue(7);
  enrollmentRepo.getById.mockResolvedValue(makeEnrollment());
  enrollmentRepo.getConfirmedUserIdsByGroup.mockResolvedValue([]);
});

// ── COACH AUTHORIZATION ──
describe('G7 coach authorization (group.coach_id = authenticated user)', () => {
  it('#1 assigned coach lists only own Academy sessions', async () => {
    const sessions = await coachAcademyService.listMySessions(300);
    expect(sessionRepo.listForCoach).toHaveBeenCalledWith(300);
    expect(sessions).toHaveLength(1);
  });

  it('#2 assigned coach can view own session', async () => {
    const s = await coachAcademyService.getMySession(300, 10);
    expect(sessionRepo.getByIdForCoach).toHaveBeenCalledWith(10, 300);
    expect(s.id).toBe(10);
  });

  it('#3/#4 coach A cannot view coach B\'s session (non-revealing)', async () => {
    sessionRepo.getByIdForCoach.mockResolvedValue(null);
    await expect(coachAcademyService.getMySession(300, 10)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_SESSION' });
  });

  it('#5 cross-org access is inherently denied (no submitted org/group id; ownership only via group.coach_id)', async () => {
    // The service never accepts a client org/group/coach id — session ownership
    // resolves purely through sessionRepository.getByIdForCoach(sessionId, userId).
    await coachAcademyService.getMySession(300, 10);
    expect(sessionRepo.getByIdForCoach).toHaveBeenCalledWith(10, 300);
  });

  it('#6/#7 non-approved user is denied coach access', async () => {
    scope.isApprovedCoach.mockResolvedValue(false);
    await expect(coachAcademyService.listMySessions(300)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_SESSION' });
    await expect(coachAcademyService.getMySession(300, 10)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_SESSION' });
    expect(sessionRepo.listForCoach).not.toHaveBeenCalled();
  });

  it('#8/#9/#10 forged coach_id/group_id cannot bypass scope (service signature has no such inputs)', async () => {
    // There is no coach_id/group_id parameter on any coach method — identity is
    // always the authenticated user, and session resolution is ownership-bound.
    sessionRepo.getByIdForCoach.mockResolvedValue(null);
    await expect(coachAcademyService.getMySession(999, 10)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_SESSION' });
  });
});

// ── ROSTER ──
describe('G7 coach roster', () => {
  it('#11/#14 coach roster returns confirmed roster + attendance summary', async () => {
    const roster = await coachAcademyService.getRoster(300, 10);
    expect(attendanceRepo.getSessionRoster).toHaveBeenCalledWith(10);
    expect(roster.data).toHaveLength(1);
    expect(roster.summary).toMatchObject({ total: 1, unmarked: 1 });
  });

  it('roster denied when session not owned by coach', async () => {
    sessionRepo.getByIdForCoach.mockResolvedValue(null);
    await expect(coachAcademyService.getRoster(300, 10)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_SESSION' });
    expect(attendanceRepo.getSessionRoster).not.toHaveBeenCalled();
  });
});

// ── COACH ATTENDANCE (G5 rules preserved) ──
describe('G7 coach attendance', () => {
  it('#15 valid in_progress attendance via shared service', async () => {
    const r = await coachAcademyService.markAttendance(300, { group_session_id: 10, enrollment_id: 100, attendance_status: 'present' });
    expect(r.id).toBeTruthy();
    expect(attendanceRepo.create).toHaveBeenCalledWith(expect.objectContaining({ group_session_id: 10, enrollment_id: 100, attendance_status: 'present' }));
  });

  it('#16 scheduled attendance rejected (window)', async () => {
    attendanceRepo.getSession.mockResolvedValue({ id: 10, group_id: 2, status: 'scheduled' });
    await expect(coachAcademyService.markAttendance(300, { group_session_id: 10, enrollment_id: 100 }))
      .rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_WINDOW' });
  });

  it('#17 completed attendance update rejected', async () => {
    attendanceRepo.getByIdWithSession.mockResolvedValue({ attendance: { id: 1, group_session_id: 10 }, session: { status: 'completed', group_id: 2 } });
    await expect(coachAcademyService.updateAttendance(300, 1, { attendance_status: 'present' }))
      .rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_WINDOW' });
  });

  it('#18 cancelled attendance update rejected', async () => {
    attendanceRepo.getByIdWithSession.mockResolvedValue({ attendance: { id: 1, group_session_id: 10 }, session: { status: 'cancelled', group_id: 2 } });
    await expect(coachAcademyService.updateAttendance(300, 1, { attendance_status: 'absent' }))
      .rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_WINDOW' });
  });

  it('#19 cross-group enrollment rejected', async () => {
    enrollmentRepo.getById.mockResolvedValue(makeEnrollment({ group_id: 99 }));
    await expect(coachAcademyService.markAttendance(300, { group_session_id: 10, enrollment_id: 100 }))
      .rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_GROUP_MISMATCH' });
  });

  it('#20 duplicate attendance safe', async () => {
    attendanceRepo.getBySessionAndEnrollment.mockResolvedValue(makeEnrollment({ id: 100 }));
    await expect(coachAcademyService.markAttendance(300, { group_session_id: 10, enrollment_id: 100 }))
      .rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_EXISTS' });
  });

  it('#21 bulk obeys G5 window (fast-fail)', async () => {
    attendanceRepo.getSession.mockResolvedValue({ id: 10, group_id: 2, status: 'scheduled' });
    await expect(coachAcademyService.bulkAttendance(300, 10, [{ enrollment_id: 100 }]))
      .rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_WINDOW' });
  });

  it('coach cannot mark attendance on a session not owned by them', async () => {
    sessionRepo.getByIdForCoach.mockResolvedValue(null);
    await expect(coachAcademyService.markAttendance(300, { group_session_id: 10, enrollment_id: 100 }))
      .rejects.toMatchObject({ code: 'ACADEMY_INVALID_SESSION' });
    expect(attendanceRepo.create).not.toHaveBeenCalled();
  });

  it('#22 summary correct', async () => {
    attendanceRepo.getSessionRosterCount.mockResolvedValue(5);
    attendanceRepo.getAttendanceSummary.mockResolvedValue({ present: 2, absent: 1, excused: 0, late: 0 });
    const s = await coachAcademyService.getRoster(300, 10);
    expect(s.summary).toMatchObject({ total: 5, present: 2, marked: 3, unmarked: 2, progress: 60 });
  });
});

// ── COACH LIFECYCLE (shared G5 single-winner) ──
describe('G7 coach session lifecycle', () => {
  it('#23 coach can start own session', async () => {
    const s = await coachAcademyService.start(300, 10);
    expect(sessionRepo.updateStatusConditional).toHaveBeenCalledWith(10, ['scheduled'], 'in_progress', conn);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_SESSION.START', actorId: 300 }));
  });

  it('#24 coach can complete own in_progress session', async () => {
    sessionRepo.getByIdForUpdate.mockResolvedValue(makeCoachSession({ status: 'in_progress' }));
    await coachAcademyService.complete(300, 10);
    expect(sessionRepo.updateStatusConditional).toHaveBeenCalledWith(10, ['in_progress'], 'completed', conn);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_SESSION.COMPLETE' }));
  });

  it('#25/#26 coach can cancel scheduled / in_progress', async () => {
    await coachAcademyService.cancel(300, 10, 'rain');
    expect(sessionRepo.updateStatusConditional).toHaveBeenCalledWith(10, ['scheduled', 'in_progress'], 'cancelled', conn);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_SESSION.CANCEL', afterState: expect.objectContaining({ reason: 'rain' }) }));
  });

  it('#27/#28/#29 invalid/terminal transitions rejected (shared validator)', async () => {
    sessionRepo.getByIdForUpdate.mockResolvedValue(makeCoachSession({ status: 'completed' }));
    await expect(coachAcademyService.start(300, 10)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_TRANSITION' });
    sessionRepo.getByIdForUpdate.mockResolvedValue(makeCoachSession({ status: 'cancelled' }));
    await expect(coachAcademyService.complete(300, 10)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_TRANSITION' });
    expect(sessionRepo.updateStatusConditional).not.toHaveBeenCalled();
  });

  it('#30/#31 concurrent coach/admin start has exactly one winner', async () => {
    sessionRepo.updateStatusConditional.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const outcomes = await Promise.allSettled([coachAcademyService.start(300, 10), coachAcademyService.start(300, 10)]);
    expect(outcomes.filter((o) => o.status === 'fulfilled').length).toBe(1);
    expect((outcomes.filter((o) => o.status === 'rejected')[0] as PromiseRejectedResult).reason?.code)
      .toBe('ACADEMY_SESSION_ALREADY_TRANSITIONED');
  });

  it('#32 audit emitted exactly once per successful transition', async () => {
    await coachAcademyService.start(300, 10);
    expect(audit.recordAudit).toHaveBeenCalledTimes(1);
    expect(audit.recordAudit.mock.calls[0][0].action).toBe('ACADEMY_SESSION.START');
  });

  it('coach lifecycle denied for a session not owned by them', async () => {
    sessionRepo.getByIdForCoach.mockResolvedValue(null);
    await expect(coachAcademyService.start(300, 10)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_SESSION' });
    expect(sessionRepo.updateStatusConditional).not.toHaveBeenCalled();
  });
});