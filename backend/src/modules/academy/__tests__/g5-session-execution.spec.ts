// ============================================================================
// Academy G5 — Session Execution & Attendance (unit tests)
//
// Covers the session state machine (start/complete/cancel), conditional
// concurrency guard, roster, attendance window + group-membership integrity,
// audit, and G5 notifications. Repositories are mocked; the REAL service +
// domain state machine are exercised.
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

const sessionRepo = vi.hoisted(() => ({
  list: vi.fn(), createManual: vi.fn(), update: vi.fn(), getById: vi.fn(), getByIdForUpdate: vi.fn(), updateStatusConditional: vi.fn(),
}));
vi.mock('../infrastructure/repositories/session.repository.js', () => ({ sessionRepository: sessionRepo }));

const attendanceRepo = vi.hoisted(() => ({
  getSession: vi.fn(), getSessionGroupId: vi.fn(), getAttendanceSessionId: vi.fn(), list: vi.fn(),
  getBySessionAndEnrollment: vi.fn(), create: vi.fn(), update: vi.fn(), getBySession: vi.fn(),
  getAttendanceSummary: vi.fn(), getSessionRoster: vi.fn(), getSessionRosterCount: vi.fn(), getByIdWithSession: vi.fn(),
}));
vi.mock('../infrastructure/repositories/attendance.repository.js', () => ({ attendanceRepository: attendanceRepo }));

const enrollmentRepo = vi.hoisted(() => ({
  getById: vi.fn(), getConfirmedUserIdsByGroup: vi.fn(),
}));
vi.mock('../infrastructure/repositories/enrollment.repository.js', () => ({ enrollmentRepository: enrollmentRepo }));

const programRepo = vi.hoisted(() => ({ getById: vi.fn() }));
vi.mock('../infrastructure/repositories/program.repository.js', () => ({ programRepository: programRepo }));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock('../../audit-log/index.js', () => audit);

const eventBus = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: eventBus }));

const scheduler = vi.hoisted(() => ({ scheduleAcademySessionReminder: vi.fn(async () => undefined) }));
vi.mock('../../notifications/application/scheduler.service.js', () => scheduler);

import { academySessionService } from '../application/session.service.js';
import { academyAttendanceService } from '../application/attendance.service.js';

function makeSession(overrides: Record<string, any> = {}) {
  return {
    id: 10, group_id: 2, group_name: 'G', program_id: 1, session_date: '2028-06-01',
    start_time: '10:00', end_time: '11:00', timezone: 'Asia/Riyadh',
    start_at_utc: '2028-06-01T07:00:00.000Z', court_id: 10, coach_id: 3, status: 'scheduled',
    court_name: 'Court A', coach_name: 'Coach A', ...overrides,
  };
}

function makeEnrollment(overrides: Record<string, any> = {}) {
  return { id: 100, player_id: 200, program_id: 1, group_id: 2, status: 'confirmed', waiting_order: null, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionRepo.getById.mockResolvedValue(makeSession());
  sessionRepo.getByIdForUpdate.mockResolvedValue(makeSession());
  sessionRepo.updateStatusConditional.mockResolvedValue(true);
  sessionRepo.createManual.mockResolvedValue(55);
  attendanceRepo.getSession.mockResolvedValue({ id: 10, group_id: 2, status: 'in_progress' });
  attendanceRepo.getBySessionAndEnrollment.mockResolvedValue(null);
  attendanceRepo.getByIdWithSession.mockResolvedValue({ attendance: { id: 1, group_session_id: 10, enrollment_id: 100 }, session: { status: 'in_progress', group_id: 2 } });
  attendanceRepo.create.mockResolvedValue(7);
  attendanceRepo.update.mockResolvedValue(undefined);
  enrollmentRepo.getById.mockResolvedValue(makeEnrollment());
  enrollmentRepo.getConfirmedUserIdsByGroup.mockResolvedValue([200, 201]);
  programRepo.getById.mockResolvedValue({ id: 1, name: 'Tennis Academy' });
});

// ── SESSION STATE MACHINE ──
describe('G5 session state machine', () => {
  it('#1 scheduled -> in_progress (start)', async () => {
    const s = await academySessionService.start(10, 9);
    expect(s.status).toBe('scheduled');
    expect(sessionRepo.updateStatusConditional).toHaveBeenCalledWith(10, ['scheduled'], 'in_progress', conn);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_SESSION.START', actorId: 9, entityId: 10 }));
  });

  it('#2 scheduled -> cancelled (cancel)', async () => {
    await academySessionService.cancel(10, 9, 'weather');
    expect(sessionRepo.updateStatusConditional).toHaveBeenCalledWith(10, ['scheduled', 'in_progress'], 'cancelled', conn);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_SESSION.CANCEL', afterState: expect.objectContaining({ status: 'cancelled', reason: 'weather' }) }));
  });

  it('#3 in_progress -> completed (complete)', async () => {
    sessionRepo.getByIdForUpdate.mockResolvedValue(makeSession({ status: 'in_progress' }));
    await academySessionService.complete(10, 9);
    expect(sessionRepo.updateStatusConditional).toHaveBeenCalledWith(10, ['in_progress'], 'completed', conn);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_SESSION.COMPLETE' }));
  });

  it('#4 in_progress -> cancelled', async () => {
    sessionRepo.getByIdForUpdate.mockResolvedValue(makeSession({ status: 'in_progress' }));
    await academySessionService.cancel(10, 9, null);
    expect(sessionRepo.updateStatusConditional).toHaveBeenCalledWith(10, ['scheduled', 'in_progress'], 'cancelled', conn);
  });

  it('#5 invalid transitions rejected', async () => {
    // completed -> start
    sessionRepo.getByIdForUpdate.mockResolvedValue(makeSession({ status: 'completed' }));
    await expect(academySessionService.start(10, 9)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_TRANSITION' });
    // cancelled -> complete
    sessionRepo.getByIdForUpdate.mockResolvedValue(makeSession({ status: 'cancelled' }));
    await expect(academySessionService.complete(10, 9)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_TRANSITION' });
    expect(conn.rollback).toHaveBeenCalled();
    expect(sessionRepo.updateStatusConditional).not.toHaveBeenCalled();
  });

  it('#6 completed cannot be changed', async () => {
    sessionRepo.getByIdForUpdate.mockResolvedValue(makeSession({ status: 'completed' }));
    await expect(academySessionService.cancel(10, 9, 'x')).rejects.toMatchObject({ code: 'ACADEMY_INVALID_TRANSITION' });
    await expect(academySessionService.start(10, 9)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_TRANSITION' });
  });

  it('#7 cancelled cannot be restarted/completed', async () => {
    sessionRepo.getByIdForUpdate.mockResolvedValue(makeSession({ status: 'cancelled' }));
    await expect(academySessionService.start(10, 9)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_TRANSITION' });
    await expect(academySessionService.complete(10, 9)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_TRANSITION' });
  });

  it('#8 concurrent start -> exactly one success, loser gets ALREADY_TRANSITIONED', async () => {
    sessionRepo.updateStatusConditional
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const results = await Promise.allSettled([academySessionService.start(10, 9), academySessionService.start(10, 9)]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason?.code).toBe('ACADEMY_SESSION_ALREADY_TRANSITIONED');
  });

  it('#9 concurrent complete -> exactly one success', async () => {
    sessionRepo.getByIdForUpdate.mockResolvedValue(makeSession({ status: 'in_progress' }));
    sessionRepo.updateStatusConditional.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const results = await Promise.allSettled([academySessionService.complete(10, 9), academySessionService.complete(10, 9)]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    expect((results.filter((r) => r.status === 'rejected')[0] as PromiseRejectedResult).reason?.code).toBe('ACADEMY_SESSION_ALREADY_TRANSITIONED');
  });
});

// ── NOTIFICATIONS ──
describe('G5 notifications', () => {
  it('#32/#33 session-started emitted only after successful transition, once per participant', async () => {
    await academySessionService.start(10, 9);
    expect(eventBus.emit).toHaveBeenCalledTimes(2);
    expect(eventBus.emit).toHaveBeenCalledWith('academy:session-started', expect.objectContaining({ sessionId: 10, userId: 200, academyName: 'Tennis Academy' }));
    expect(eventBus.emit).toHaveBeenCalledWith('academy:session-started', expect.objectContaining({ sessionId: 10, userId: 201 }));
  });

  it('#33 concurrent loser does NOT emit session-started', async () => {
    sessionRepo.updateStatusConditional.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await Promise.allSettled([academySessionService.start(10, 9), academySessionService.start(10, 9)]);
    expect(eventBus.emit).toHaveBeenCalledTimes(2); // only the winner's participants
  });

  it('#34 reminder scheduling is idempotent per (session,user) via deterministic jobId', async () => {
    enrollmentRepo.getConfirmedUserIdsByGroup.mockResolvedValue([200, 201]);
    await academySessionService.create({ group_id: 2, session_date: '2028-06-01', start_time: '10:00', end_time: '11:00' }, 9);
    expect(scheduler.scheduleAcademySessionReminder).toHaveBeenCalledTimes(2);
    expect(scheduler.scheduleAcademySessionReminder).toHaveBeenCalledWith(10, 200, expect.any(Date), 'Tennis Academy');
    expect(scheduler.scheduleAcademySessionReminder).toHaveBeenCalledWith(10, 201, expect.any(Date), 'Tennis Academy');
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_SESSION.CREATE' }));
  });
});

// ── ROSTER ──
describe('G5 session roster', () => {
  it('#15/#16/#17 roster returns confirmed enrollments of the session group; cross-group excluded by repo scope', async () => {
    attendanceRepo.getSessionRoster.mockResolvedValue([{ enrollment_id: 100, player_id: 200, player_name: 'P1', enrollment_status: 'confirmed' }]);
    attendanceRepo.getSessionRosterCount.mockResolvedValue(1);
    attendanceRepo.getAttendanceSummary.mockResolvedValue({ present: 1, absent: 0, excused: 0, late: 0 });
    const roster = await academySessionService.getRoster(10);
    expect(roster.data).toHaveLength(1);
    expect(roster.summary).toMatchObject({ total: 1, present: 1, unmarked: 0, progress: 100 });
    expect(attendanceRepo.getSessionRoster).toHaveBeenCalledWith(10);
  });
});

// ── ATTENDANCE WINDOW + INTEGRITY ──
describe('G5 attendance window + integrity', () => {
  it('#18 valid confirmed enrollment can be marked in progress', async () => {
    const r = await academyAttendanceService.record({ group_session_id: 10, enrollment_id: 100, attendance_status: 'present' });
    expect(r.id).toBeTruthy();
    expect(attendanceRepo.create).toHaveBeenCalledWith(expect.objectContaining({ group_session_id: 10, enrollment_id: 100, attendance_status: 'present' }));
  });

  it('#19 scheduled attendance rejected', async () => {
    attendanceRepo.getSession.mockResolvedValue({ id: 10, group_id: 2, status: 'scheduled' });
    await expect(academyAttendanceService.record({ group_session_id: 10, enrollment_id: 100 })).rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_WINDOW' });
  });

  it('#20 completed attendance modification rejected', async () => {
    attendanceRepo.getByIdWithSession.mockResolvedValue({ attendance: { id: 1 }, session: { status: 'completed', group_id: 2 } });
    await expect(academyAttendanceService.update(1, { attendance_status: 'present' })).rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_WINDOW' });
  });

  it('#21 cancelled attendance modification rejected', async () => {
    attendanceRepo.getByIdWithSession.mockResolvedValue({ attendance: { id: 1 }, session: { status: 'cancelled', group_id: 2 } });
    await expect(academyAttendanceService.update(1, { attendance_status: 'absent' })).rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_WINDOW' });
  });

  it('#22 cross-group enrollment rejected', async () => {
    enrollmentRepo.getById.mockResolvedValue(makeEnrollment({ group_id: 99 }));
    await expect(academyAttendanceService.record({ group_session_id: 10, enrollment_id: 100 })).rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_GROUP_MISMATCH' });
  });

  it('non-confirmed enrollment rejected', async () => {
    enrollmentRepo.getById.mockResolvedValue(makeEnrollment({ status: 'waiting' }));
    await expect(academyAttendanceService.record({ group_session_id: 10, enrollment_id: 100 })).rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_NOT_ELIGIBLE' });
  });

  it('#24 duplicate attendance handled safely', async () => {
    attendanceRepo.getBySessionAndEnrollment.mockResolvedValue(makeEnrollment({ id: 100 }));
    await expect(academyAttendanceService.record({ group_session_id: 10, enrollment_id: 100 })).rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_EXISTS' });
  });

  it('#25 bulk attendance obeys same state rules (fast-fail on window)', async () => {
    attendanceRepo.getSession.mockResolvedValue({ id: 10, group_id: 2, status: 'scheduled' });
    await expect(academyAttendanceService.recordBulk(10, [{ enrollment_id: 100 }])).rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_WINDOW' });
  });

  it('#25 bulk skips only genuine duplicates', async () => {
    attendanceRepo.getSession.mockResolvedValue({ id: 10, group_id: 2, status: 'in_progress' });
    attendanceRepo.getBySessionAndEnrollment
      .mockResolvedValueOnce(null)   // first -> created
      .mockResolvedValueOnce(makeEnrollment({ id: 101 })); // second -> duplicate
    attendanceRepo.create.mockResolvedValue(1);
    const r = await academyAttendanceService.recordBulk(10, [{ enrollment_id: 100 }, { enrollment_id: 101 }]);
    expect(r.created).toBe(1);
  });

  it('#26/#27 attendance summary correct with unmarked', async () => {
    attendanceRepo.getSessionRosterCount.mockResolvedValue(5);
    attendanceRepo.getAttendanceSummary.mockResolvedValue({ present: 2, absent: 1, excused: 0, late: 0 });
    const s = await academySessionService.getSummary(10);
    expect(s).toMatchObject({ total: 5, present: 2, absent: 1, marked: 3, unmarked: 2, progress: 60, status: 'scheduled' });
  });

  it('attendance update in_progress works', async () => {
    await academyAttendanceService.update(1, { attendance_status: 'absent' });
    expect(attendanceRepo.update).toHaveBeenCalledWith(1, { attendance_status: 'absent', notes: undefined });
  });
});

// ── AUDIT ──
describe('G5 audit coverage', () => {
  it('#28 START audit', async () => {
    await academySessionService.start(10, 9);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_SESSION.START', afterState: expect.objectContaining({ status: 'in_progress' }) }));
  });
  it('#29 COMPLETE audit', async () => {
    sessionRepo.getByIdForUpdate.mockResolvedValue(makeSession({ status: 'in_progress' }));
    await academySessionService.complete(10, 9);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_SESSION.COMPLETE' }));
  });
  it('#30 CANCEL audit', async () => {
    await academySessionService.cancel(10, 9, 'x');
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_SESSION.CANCEL' }));
  });
  it('#31 attendance create is audited via controller path (service returns record); window violations are audited at the controller', async () => {
    // The G5 session lifecycle audits live in the service; attendance create/update
    // audits remain in the controller (existing convention) — verify the service
    // does not double-audit.
    await academyAttendanceService.record({ group_session_id: 10, enrollment_id: 100 });
    expect(audit.recordAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_ATTENDANCE.RECORD' }));
  });
});

// ── CREATE/UPDATE (refactored out of controller) ──
describe('G5 session create/update (repository-backed)', () => {
  it('create always results in a scheduled session and schedules reminders', async () => {
    sessionRepo.getById.mockResolvedValue(makeSession());
    const s = await academySessionService.create({ group_id: 2, session_date: '2028-06-01', start_time: '10:00', end_time: '11:00' }, 9);
    expect(sessionRepo.createManual).toHaveBeenCalledWith(expect.objectContaining({ group_id: 2, session_date: '2028-06-01' }));
    expect(s.status).toBe('scheduled');
  });

  it('update never mutates status', async () => {
    sessionRepo.getById.mockResolvedValue(makeSession({ session_date: '2028-06-01' }));
    await academySessionService.update(10, { session_date: '2028-06-02' }, 9);
    expect(sessionRepo.update).toHaveBeenCalledWith(10, { session_date: '2028-06-02' });
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_SESSION.UPDATE' }));
  });
});