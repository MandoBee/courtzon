// ============================================================================
// Academy G6 — Player-facing self-service (unit tests)
//
// Exercises the REAL public-academy service + enrollment service with mocked
// repositories. Covers: published/public browse + detail + DTO safety,
// self-enrollment gates (published + start), effective capacity + unlimited,
// duplicate, waitlist result, identity-bound my-data, and the four G6
// notifications (accepted / waitlisted / promoted / payment-acknowledged).
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

const startGate = vi.hoisted(() => ({ isAcademyGroupStarted: vi.fn(), isAcademyProgramStarted: vi.fn() }));
vi.mock('../application/academy-start.js', () => startGate);

const programRepo = vi.hoisted(() => ({
  listPublic: vi.fn(), getPublicById: vi.fn(), getById: vi.fn(), getCapacityForUpdate: vi.fn(), setCapacityOverride: vi.fn(), clearCapacityOverride: vi.fn(),
}));
vi.mock('../infrastructure/repositories/program.repository.js', () => ({ programRepository: programRepo }));

const enrollmentRepo = vi.hoisted(() => ({
  list: vi.fn(), getById: vi.fn(), getByIdForUpdate: vi.fn(), getByPlayerAndProgram: vi.fn(),
  getConfirmedCount: vi.fn(), getGroupConfirmedCount: vi.fn(), getNextWaitingOrder: vi.fn(),
  getWaitlistHead: vi.fn(), create: vi.fn(), updateStatus: vi.fn(), promoteToConfirmed: vi.fn(),
  moveToGroup: vi.fn(), getHistory: vi.fn(), markPaymentConfirmed: vi.fn(), getConfirmedUserIdsByGroup: vi.fn(),
  countConfirmedByPrograms: vi.fn(), listForPlayer: vi.fn(),
}));
vi.mock('../infrastructure/repositories/enrollment.repository.js', () => ({ enrollmentRepository: enrollmentRepo }));

const groupRepo = vi.hoisted(() => ({ getByIdForCapacity: vi.fn(), getById: vi.fn() }));
vi.mock('../infrastructure/repositories/group.repository.js', () => ({ groupRepository: groupRepo }));

const sessionRepo = vi.hoisted(() => ({ listForPlayer: vi.fn() }));
vi.mock('../infrastructure/repositories/session.repository.js', () => ({ sessionRepository: sessionRepo }));

const attendanceRepo = vi.hoisted(() => ({ listForPlayer: vi.fn() }));
vi.mock('../infrastructure/repositories/attendance.repository.js', () => ({ attendanceRepository: attendanceRepo }));

const scope = vi.hoisted(() => ({ resolveProgramScope: vi.fn(), assertCanManageAcademy: vi.fn() }));
vi.mock('../application/academy-scope.js', () => scope);

const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock('../../audit-log/index.js', () => audit);

const eventBus = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: eventBus }));

import { publicAcademyService } from '../application/public-academy.service.js';
import { academyEnrollmentService } from '../application/enrollment.service.js';
import { academyConfirmationService } from '../application/academy-confirmation.service.js';

function makePublicProgram(overrides: Record<string, any> = {}) {
  return {
    id: 1, code: 'AC1', name: 'Tennis Pro', description: 'desc', category: 'tennis', level: 'A', season: '2028',
    capacity: 5, original_capacity: 5, capacity_override_amount: null, capacity_override_until: null,
    price: 200, currency: 'USD', price_type: 'FIXED', status: 'published', is_public: 1, ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  startGate.isAcademyProgramStarted.mockResolvedValue(false);
  startGate.isAcademyGroupStarted.mockResolvedValue(false);
  programRepo.listPublic.mockResolvedValue([makePublicProgram()]);
  programRepo.getPublicById.mockResolvedValue(makePublicProgram());
  programRepo.getById.mockResolvedValue({ ...makePublicProgram(), organisation_id: 7, lifecycle_state: 'confirmed' });
  programRepo.getCapacityForUpdate.mockResolvedValue(makePublicProgram());
  enrollmentRepo.countConfirmedByPrograms.mockResolvedValue(new Map([[1, 2]]));
  enrollmentRepo.getConfirmedCount.mockResolvedValue(2);
  enrollmentRepo.getByPlayerAndProgram.mockResolvedValue(null);
  enrollmentRepo.getNextWaitingOrder.mockResolvedValue(1);
  enrollmentRepo.create.mockResolvedValue(501);
  enrollmentRepo.getById.mockResolvedValue({ id: 501, player_id: 200, program_id: 1, group_id: null, status: 'confirmed', waiting_order: null, enrolled_at: '2028-01-01 10:00:00', payment_confirmed_at: null });
  enrollmentRepo.getByIdForUpdate.mockResolvedValue({ id: 100, player_id: 200, program_id: 1, group_id: 2, status: 'waiting', waiting_order: 1 });
  enrollmentRepo.getWaitlistHead.mockResolvedValue({ id: 100, waiting_order: 1 });
  enrollmentRepo.promoteToConfirmed.mockResolvedValue(true);
  enrollmentRepo.markPaymentConfirmed.mockResolvedValue(true);
  enrollmentRepo.listForPlayer.mockResolvedValue([
    { id: 1, player_id: 200, program_id: 1, group_id: 2, status: 'confirmed', waiting_order: null, enrolled_at: 'x', created_at: 'x', payment_confirmed_at: null, program_name: 'Tennis Pro', program_code: 'AC1', price: 200, currency: 'USD', group_name: 'G1' },
  ]);
  groupRepo.getByIdForCapacity.mockResolvedValue({ id: 2, program_id: 1, capacity: 10, status: 'active' });
  enrollmentRepo.getGroupConfirmedCount.mockResolvedValue(0);
  scope.resolveProgramScope.mockResolvedValue({ programId: 1, organisationId: 7, branchId: 5, sportId: 21, lifecycleState: 'confirmed' });
  scope.assertCanManageAcademy.mockResolvedValue(undefined);
});

// ── PUBLIC BROWSE / DETAIL ──
describe('G6 public browse + detail', () => {
  it('#1/#4 browse returns only published + public programs with a safe DTO', async () => {
    const list = await publicAcademyService.listPublished();
    expect(list).toHaveLength(1);
    const p = list[0];
    expect(p).toMatchObject({ id: 1, name: 'Tennis Pro', category: 'tennis', capacity: 5, confirmedCount: 2, availableSeats: 3, isFull: false, isUnlimited: false });
    const json = JSON.stringify(p);
    expect(json).not.toContain('organisation_id');
    expect(json).not.toContain('branch_id');
    expect(json).not.toContain('sport_id');
    expect(json).not.toContain('lifecycle');
    expect(json).not.toContain('confirmed_by');
    expect(json).not.toContain('capacity_override_amount');
    expect(json).not.toContain('archived_at');
  });

  it('browse marks full programs when at effective capacity', async () => {
    enrollmentRepo.countConfirmedByPrograms.mockResolvedValue(new Map([[1, 5]]));
    const list = await publicAcademyService.listPublished();
    expect(list[0].isFull).toBe(true);
    expect(list[0].availableSeats).toBe(0);
  });

  it('browse preserves unlimited semantics', async () => {
    programRepo.listPublic.mockResolvedValue([makePublicProgram({ capacity: 0, original_capacity: 0 })]);
    const list = await publicAcademyService.listPublished();
    expect(list[0].isUnlimited).toBe(true);
    expect(list[0].availableSeats).toBe(-1);
  });

  it('#2/#3 detail rejects draft/archived/non-published via non-revealing 404', async () => {
    programRepo.getPublicById.mockResolvedValue(null);
    await expect(publicAcademyService.getPublished(1)).rejects.toMatchObject({ code: 'ACADEMY_PROGRAM_NOT_FOUND' });
  });

  it('detail returns safe DTO with live availability', async () => {
    const p = await publicAcademyService.getPublished(1);
    expect(p.name).toBe('Tennis Pro');
    expect(JSON.stringify(p)).not.toContain('organisation_id');
  });
});

// ── SELF-ENROLLMENT ──
describe('G6 self-enrollment', () => {
  it('#5/#12 confirmed when capacity exists; identity bound to playerId', async () => {
    const res = await publicAcademyService.enroll(200, 1);
    expect(res.status).toBe('confirmed');
    expect(enrollmentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ player_id: 200, program_id: 1, status: 'confirmed' }), conn);
  });

  it('#6 waiting when full, exposes own position', async () => {
    enrollmentRepo.getConfirmedCount.mockResolvedValue(5);
    enrollmentRepo.getNextWaitingOrder.mockResolvedValue(3);
    enrollmentRepo.getById.mockResolvedValue({ id: 501, player_id: 200, program_id: 1, group_id: null, status: 'waiting', waiting_order: 3, enrolled_at: 'x', payment_confirmed_at: null });
    const res = await publicAcademyService.enroll(200, 1);
    expect(res.status).toBe('waiting');
    expect(res.enrollment.waitingOrder).toBe(3);
  });

  it('#7 respects effective capacity (override)', async () => {
    programRepo.getPublicById.mockResolvedValue(makePublicProgram({ capacity_override_amount: 3 }));
    enrollmentRepo.getConfirmedCount.mockResolvedValue(7); // 7 < 8
    const res = await publicAcademyService.enroll(200, 1);
    expect(res.status).toBe('confirmed');
  });

  it('#8 capacity=0 unlimited remains confirmed', async () => {
    programRepo.getPublicById.mockResolvedValue(makePublicProgram({ capacity: 0, original_capacity: 0 }));
    const res = await publicAcademyService.enroll(200, 1);
    expect(res.status).toBe('confirmed');
  });

  it('#9 duplicate self-enroll rejected', async () => {
    enrollmentRepo.getByPlayerAndProgram.mockResolvedValue({ id: 9, player_id: 200, program_id: 1, status: 'confirmed' });
    await expect(publicAcademyService.enroll(200, 1)).rejects.toMatchObject({ code: 'ACADEMY_PLAYER_ALREADY_ASSIGNED' });
  });

  it('#11 rejects invalid program state (non-published -> 404)', async () => {
    programRepo.getPublicById.mockResolvedValue(null);
    await expect(publicAcademyService.enroll(200, 1)).rejects.toMatchObject({ code: 'ACADEMY_PROGRAM_NOT_FOUND' });
  });

  it('rejects self-enrollment after the program has started', async () => {
    startGate.isAcademyProgramStarted.mockResolvedValue(true);
    await expect(publicAcademyService.enroll(200, 1)).rejects.toMatchObject({ code: 'ACADEMY_ENROLLMENT_CLOSED' });
    expect(enrollmentRepo.create).not.toHaveBeenCalled();
  });
});

// ── MY DATA (identity-bound) ──
describe('G6 my enrollments / sessions / attendance', () => {
  it('#14 my enrollments only (server queries by playerId)', async () => {
    const rows = await publicAcademyService.myEnrollments(200);
    expect(enrollmentRepo.listForPlayer).toHaveBeenCalledWith(200);
    expect(rows[0]).toMatchObject({ programName: 'Tennis Pro', paymentState: 'pending' });
    expect(JSON.stringify(rows)).not.toContain('player_id');
    expect(JSON.stringify(rows)).not.toContain('payment_confirmed_by');
  });

  it('#15 my sessions bound to player', async () => {
    sessionRepo.listForPlayer.mockResolvedValue([{ id: 10, session_status: 'scheduled', program_name: 'Tennis Pro' }]);
    const rows = await publicAcademyService.mySessions(200);
    expect(sessionRepo.listForPlayer).toHaveBeenCalledWith(200);
    expect(rows).toHaveLength(1);
  });

  it('#16 my attendance bound to player', async () => {
    attendanceRepo.listForPlayer.mockResolvedValue([{ attendance_id: 1, attendance_status: 'present', program_name: 'Tennis Pro' }]);
    const rows = await publicAcademyService.myAttendance(200);
    expect(attendanceRepo.listForPlayer).toHaveBeenCalledWith(200);
    expect(rows).toHaveLength(1);
  });
});

// ── NOTIFICATIONS ──
describe('G6 notifications', () => {
  it('#26 enrollment-accepted fires only after a confirmed enrollment', async () => {
    await academyEnrollmentService.enroll({ player_id: 200, program_id: 1 });
    expect(eventBus.emit).toHaveBeenCalledWith('academy:enrollment-accepted', expect.objectContaining({ programId: 1, userId: 200 }));
    expect(eventBus.emit).not.toHaveBeenCalledWith('academy:enrollment-waitlisted', expect.anything());
  });

  it('#27 enrollment-waitlisted fires for waiting result', async () => {
    enrollmentRepo.getConfirmedCount.mockResolvedValue(5);
    enrollmentRepo.getNextWaitingOrder.mockResolvedValue(2);
    enrollmentRepo.getById.mockResolvedValue({ id: 501, player_id: 200, program_id: 1, group_id: null, status: 'waiting', waiting_order: 2, enrolled_at: 'x', payment_confirmed_at: null });
    await academyEnrollmentService.enroll({ player_id: 200, program_id: 1 });
    expect(eventBus.emit).toHaveBeenCalledWith('academy:enrollment-waitlisted', expect.objectContaining({ programId: 1, userId: 200, waitlistPosition: 2 }));
  });

  it('#25 promoted fires only after successful waiting->confirmed', async () => {
    await academyEnrollmentService.promote(100, 9, {});
    expect(eventBus.emit).toHaveBeenCalledWith('academy:promoted', expect.objectContaining({ programId: 1, userId: 200 }));
  });

  it('#28 payment-acknowledged fires only after successful acknowledgment', async () => {
    enrollmentRepo.getById.mockResolvedValue({ id: 11, player_id: 200, program_id: 1, status: 'confirmed', payment_confirmed_at: null });
    await academyConfirmationService.markPaymentConfirmed(11, 9);
    expect(eventBus.emit).toHaveBeenCalledWith('academy:payment-acknowledged', expect.objectContaining({ enrollmentId: 11, userId: 200 }));
  });
});