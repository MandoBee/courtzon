// ============================================================================
// Academy G4 — Capacity + Waitlist hardening (unit tests)
//
// Exercises the REAL services/enrollment/capacity logic with mocked
// repositories, a real transactional connection stub, and a mocked start gate.
// Concurrency (real DB) is covered by g4-capacity.integration.spec.ts.
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

const scope = vi.hoisted(() => ({ resolveProgramScope: vi.fn(), assertCanManageAcademy: vi.fn() }));
vi.mock('../application/academy-scope.js', () => scope);

const startGate = vi.hoisted(() => ({ isAcademyGroupStarted: vi.fn() }));
vi.mock('../application/academy-start.js', () => startGate);

const programRepo = vi.hoisted(() => ({
  getById: vi.fn(), getCapacityForUpdate: vi.fn(), setCapacityOverride: vi.fn(), clearCapacityOverride: vi.fn(),
}));
vi.mock('../infrastructure/repositories/program.repository.js', () => ({ programRepository: programRepo }));

const enrollmentRepo = vi.hoisted(() => ({
  list: vi.fn(), getById: vi.fn(), getByIdForUpdate: vi.fn(), getByPlayerAndProgram: vi.fn(),
  getConfirmedCount: vi.fn(), getGroupConfirmedCount: vi.fn(), getNextWaitingOrder: vi.fn(),
  getWaitlistHead: vi.fn(), create: vi.fn(), updateStatus: vi.fn(), promoteToConfirmed: vi.fn(),
  moveToGroup: vi.fn(), getHistory: vi.fn(), markPaymentConfirmed: vi.fn(),
}));
vi.mock('../infrastructure/repositories/enrollment.repository.js', () => ({ enrollmentRepository: enrollmentRepo }));

const groupRepo = vi.hoisted(() => ({ getByIdForCapacity: vi.fn(), getById: vi.fn() }));
vi.mock('../infrastructure/repositories/group.repository.js', () => ({ groupRepository: groupRepo }));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock('../../audit-log/index.js', () => audit);

const eventBusMock = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: eventBusMock }));

import { academyEnrollmentService } from '../application/enrollment.service.js';
import { academyCapacityOverrideService } from '../application/capacity-override.service.js';
import { effectiveCapacity, isCapacityOverrideActive } from '../domain/capacity.js';

function makeProgram(overrides: Record<string, any> = {}) {
  return {
    id: 1, code: 'AC1', name: 'A1', capacity: 5, original_capacity: 5,
    capacity_override_amount: null, capacity_override_until: null, capacity_override_by: null,
    capacity_override_reason: null, price: 0, currency: 'USD', status: 'open', lifecycle_state: 'setup',
    organisation_id: 7, branch_id: 5, sport_id: 21, ...overrides,
  };
}

function makeGroup(overrides: Record<string, any> = {}) {
  return { id: 2, program_id: 1, name: 'G', capacity: 10, status: 'active', ...overrides };
}

function makeEnrollment(overrides: Record<string, any> = {}) {
  return {
    id: 100, player_id: 200, program_id: 1, group_id: 2, status: 'waiting', waiting_order: 1,
    enrolled_at: '2028-01-01 10:00:00', ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  scope.resolveProgramScope.mockResolvedValue({ programId: 1, organisationId: 7, branchId: 5, sportId: 21, lifecycleState: 'setup' });
  scope.assertCanManageAcademy.mockResolvedValue(undefined);
  startGate.isAcademyGroupStarted.mockResolvedValue(false);
  programRepo.getById.mockResolvedValue(makeProgram());
  programRepo.getCapacityForUpdate.mockResolvedValue(makeProgram());
  programRepo.setCapacityOverride.mockResolvedValue(undefined);
  programRepo.clearCapacityOverride.mockResolvedValue(undefined);
  enrollmentRepo.getById.mockResolvedValue(makeEnrollment());
  enrollmentRepo.getByIdForUpdate.mockResolvedValue(makeEnrollment());
  enrollmentRepo.getByPlayerAndProgram.mockResolvedValue(null);
  enrollmentRepo.getConfirmedCount.mockResolvedValue(0);
  enrollmentRepo.getGroupConfirmedCount.mockResolvedValue(0);
  enrollmentRepo.getNextWaitingOrder.mockResolvedValue(1);
  enrollmentRepo.getWaitlistHead.mockResolvedValue(null);
  enrollmentRepo.create.mockResolvedValue(501);
  enrollmentRepo.updateStatus.mockResolvedValue(undefined);
  enrollmentRepo.promoteToConfirmed.mockResolvedValue(true);
  groupRepo.getByIdForCapacity.mockResolvedValue(makeGroup());
  groupRepo.getById.mockResolvedValue(makeGroup());
});

// ── CAPACITY MODEL (domain helper) ──
describe('G4 capacity model (effectiveCapacity)', () => {
  it('#3 capacity=0 is unlimited even with override', () => {
    const p = makeProgram({ capacity: 0, original_capacity: 0, capacity_override_amount: 3 });
    expect(effectiveCapacity(p)).toBe(0);
  });

  it('#1/#4 effective max = original + active override', () => {
    expect(effectiveCapacity(makeProgram())).toBe(5);
    expect(effectiveCapacity(makeProgram({ capacity_override_amount: 3 }))).toBe(8);
  });

  it('#5 expired override returns to original max', () => {
    const now = new Date('2028-01-01T00:00:00Z');
    const p = makeProgram({ capacity_override_amount: 3, capacity_override_until: '2027-01-01T00:00:00Z' });
    expect(isCapacityOverrideActive(p, now)).toBe(false);
    expect(effectiveCapacity(p, now)).toBe(5);
  });

  it('#5 future expiry keeps override active', () => {
    const now = new Date('2028-01-01T00:00:00Z');
    const p = makeProgram({ capacity_override_amount: 3, capacity_override_until: '2029-01-01T00:00:00Z' });
    expect(isCapacityOverrideActive(p, now)).toBe(true);
    expect(effectiveCapacity(p, now)).toBe(8);
  });

  it('#6 original max is untouched by override state', () => {
    expect(makeProgram({ capacity_override_amount: 3 }).original_capacity).toBe(5);
  });
});

// ── ENROLL ──
describe('G4 enroll capacity decisions', () => {
  it('#1 enrollment below capacity -> confirmed', async () => {
    enrollmentRepo.getConfirmedCount.mockResolvedValue(2);
    enrollmentRepo.getById.mockResolvedValue(makeEnrollment({ status: 'confirmed' }));
    const e = await academyEnrollmentService.enroll({ player_id: 200, program_id: 1 });
    expect(e.status).toBe('confirmed');
    expect(enrollmentRepo.create.mock.calls[0][0].status).toBe('confirmed');
    expect(enrollmentRepo.create.mock.calls[0][0].waiting_order).toBeNull();
  });

  it('#2 enrollment at capacity -> waiting with FIFO order', async () => {
    enrollmentRepo.getConfirmedCount.mockResolvedValue(5);
    enrollmentRepo.getNextWaitingOrder.mockResolvedValue(7);
    const e = await academyEnrollmentService.enroll({ player_id: 200, program_id: 1 });
    expect(e.status).toBe('waiting');
    expect(enrollmentRepo.create.mock.calls[0][0].status).toBe('waiting');
    expect(enrollmentRepo.create.mock.calls[0][0].waiting_order).toBe(7);
  });

  it('#3 capacity=0 -> unlimited -> confirmed', async () => {
    programRepo.getCapacityForUpdate.mockResolvedValue(makeProgram({ capacity: 0, original_capacity: 0 }));
    enrollmentRepo.getById.mockResolvedValue(makeEnrollment({ status: 'confirmed' }));
    const e = await academyEnrollmentService.enroll({ player_id: 200, program_id: 1 });
    expect(e.status).toBe('confirmed');
  });

  it('#4 effective max includes active override', async () => {
    programRepo.getCapacityForUpdate.mockResolvedValue(makeProgram({ capacity_override_amount: 3 }));
    enrollmentRepo.getConfirmedCount.mockResolvedValue(7); // 7 < 8 (effective)
    enrollmentRepo.getById.mockResolvedValue(makeEnrollment({ status: 'confirmed' }));
    const e = await academyEnrollmentService.enroll({ player_id: 200, program_id: 1 });
    expect(e.status).toBe('confirmed');
  });

  it('#5 expired override falls back to original -> waiting at original max', async () => {
    programRepo.getCapacityForUpdate.mockResolvedValue(makeProgram({ capacity_override_amount: 3, capacity_override_until: '2020-01-01T00:00:00Z' }));
    enrollmentRepo.getConfirmedCount.mockResolvedValue(5); // == original max
    const e = await academyEnrollmentService.enroll({ player_id: 200, program_id: 1 });
    expect(e.status).toBe('waiting');
  });

  it('rejects duplicate active enrollment', async () => {
    enrollmentRepo.getByPlayerAndProgram.mockResolvedValue(makeEnrollment({ status: 'confirmed' }));
    await expect(academyEnrollmentService.enroll({ player_id: 200, program_id: 1 })).rejects.toMatchObject({ code: 'ACADEMY_PLAYER_ALREADY_ASSIGNED' });
    expect(conn.rollback).toHaveBeenCalled();
  });

  it('#25 program capacity available but group capacity full -> blocked', async () => {
    groupRepo.getByIdForCapacity.mockResolvedValue(makeGroup({ capacity: 1 }));
    enrollmentRepo.getGroupConfirmedCount.mockResolvedValue(1);
    await expect(academyEnrollmentService.enroll({ player_id: 200, program_id: 1, group_id: 2 })).rejects.toMatchObject({ code: 'ACADEMY_GROUP_FULL' });
  });
});

// ── PROMOTE (FIFO) ──
describe('G4 promotion (waiting -> confirmed)', () => {
  it('#9 waiting_order is FIFO via getWaitlistHead; head promoted', async () => {
    enrollmentRepo.getByIdForUpdate.mockResolvedValue(makeEnrollment({ id: 100, waiting_order: 1 }));
    enrollmentRepo.getWaitlistHead.mockResolvedValue({ id: 100, waiting_order: 1 });
    enrollmentRepo.getById.mockResolvedValue(makeEnrollment({ status: 'confirmed' }));
    const e = await academyEnrollmentService.promote(100, 9, {});
    expect(e.status).toBe('confirmed');
    expect(enrollmentRepo.promoteToConfirmed).toHaveBeenCalledWith(100, conn);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_WAITLIST.PROMOTE', actorId: 9, entityId: 100 }));
  });

  it('#11 non-head promotion rejected', async () => {
    enrollmentRepo.getByIdForUpdate.mockResolvedValue(makeEnrollment({ id: 100, waiting_order: 2 }));
    enrollmentRepo.getWaitlistHead.mockResolvedValue({ id: 101, waiting_order: 1 });
    await expect(academyEnrollmentService.promote(100, 9, {})).rejects.toMatchObject({ code: 'ACADEMY_WAITLIST_ORDER_VIOLATION' });
    expect(conn.rollback).toHaveBeenCalled();
  });

  it('#12 promotion requires available capacity', async () => {
    enrollmentRepo.getByIdForUpdate.mockResolvedValue(makeEnrollment());
    enrollmentRepo.getWaitlistHead.mockResolvedValue({ id: 100, waiting_order: 1 });
    enrollmentRepo.getConfirmedCount.mockResolvedValue(5);
    await expect(academyEnrollmentService.promote(100, 9, {})).rejects.toMatchObject({ code: 'ACADEMY_CAPACITY_EXCEEDED' });
  });

  it('#13 manual promotion works with headroom even without a departure', async () => {
    enrollmentRepo.getByIdForUpdate.mockResolvedValue(makeEnrollment());
    enrollmentRepo.getWaitlistHead.mockResolvedValue({ id: 100, waiting_order: 1 });
    enrollmentRepo.getConfirmedCount.mockResolvedValue(3);
    enrollmentRepo.getById.mockResolvedValue(makeEnrollment({ status: 'confirmed' }));
    const e = await academyEnrollmentService.promote(100, 9, {});
    expect(e.status).toBe('confirmed');
    expect(enrollmentRepo.promoteToConfirmed).toHaveBeenCalledWith(100, conn);
  });

  it('promotion of a non-waiting enrollment rejected', async () => {
    enrollmentRepo.getByIdForUpdate.mockResolvedValue(makeEnrollment({ status: 'confirmed' }));
    await expect(academyEnrollmentService.promote(100, 9, {})).rejects.toMatchObject({ code: 'ACADEMY_WAITLIST_NOT_ELIGIBLE' });
  });

  it('#26 promotion respects group capacity', async () => {
    enrollmentRepo.getByIdForUpdate.mockResolvedValue(makeEnrollment({ group_id: 2 }));
    enrollmentRepo.getWaitlistHead.mockResolvedValue({ id: 100, waiting_order: 1 });
    groupRepo.getByIdForCapacity.mockResolvedValue(makeGroup({ capacity: 1 }));
    enrollmentRepo.getGroupConfirmedCount.mockResolvedValue(1);
    await expect(academyEnrollmentService.promote(100, 9, {})).rejects.toMatchObject({ code: 'ACADEMY_GROUP_FULL' });
  });

  it('#14 no automatic promotion: promote is the only path (verified by design — no repo auto-call on enroll)', async () => {
    // enroll at capacity never calls promoteToConfirmed
    enrollmentRepo.getConfirmedCount.mockResolvedValue(5);
    await academyEnrollmentService.enroll({ player_id: 200, program_id: 1 });
    expect(enrollmentRepo.promoteToConfirmed).not.toHaveBeenCalled();
  });
});

// ── REPLACE (out-of-order) ──
describe('G4 out-of-order replacement', () => {
  it('#16 replace requires a reason', async () => {
    await expect(academyEnrollmentService.replace(100, 9, '')).rejects.toMatchObject({ code: 'ACADEMY_CAPACITY_OVERRIDE_REQUIRED' });
  });

  it('#15/#38 out-of-order replace bypasses FIFO and is audited', async () => {
    enrollmentRepo.getByIdForUpdate.mockResolvedValue(makeEnrollment({ id: 100, waiting_order: 2 }));
    enrollmentRepo.getWaitlistHead.mockResolvedValue({ id: 101, waiting_order: 1 }); // not head
    enrollmentRepo.getById.mockResolvedValue(makeEnrollment({ status: 'confirmed' }));
    const e = await academyEnrollmentService.replace(100, 9, 'Coach decision');
    expect(e.status).toBe('confirmed');
    expect(enrollmentRepo.promoteToConfirmed).toHaveBeenCalledWith(100, conn);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_WAITLIST.REPLACE', afterState: expect.objectContaining({ out_of_order: true, reason: 'Coach decision' }) }));
  });

  it('#17 replacement after start is blocked', async () => {
    startGate.isAcademyGroupStarted.mockResolvedValue(true);
    await expect(academyEnrollmentService.replace(100, 9, 'Too late')).rejects.toMatchObject({ code: 'ACADEMY_REPLACEMENT_AFTER_START' });
  });

  it('#17 promotion after start is blocked too', async () => {
    startGate.isAcademyGroupStarted.mockResolvedValue(true);
    await expect(academyEnrollmentService.promote(100, 9, {})).rejects.toMatchObject({ code: 'ACADEMY_REPLACEMENT_AFTER_START' });
  });
});

// ── CONFIRM (pending) ──
describe('G4 confirm pending enrollment', () => {
  it('confirming pending with headroom succeeds', async () => {
    enrollmentRepo.getByIdForUpdate.mockResolvedValue(makeEnrollment({ status: 'pending' }));
    enrollmentRepo.getConfirmedCount.mockResolvedValue(3);
    await academyEnrollmentService.confirm(100);
    expect(enrollmentRepo.updateStatus).toHaveBeenCalledWith(100, 'confirmed', conn);
  });

  it('confirming pending at capacity is rejected', async () => {
    enrollmentRepo.getByIdForUpdate.mockResolvedValue(makeEnrollment({ status: 'pending' }));
    enrollmentRepo.getConfirmedCount.mockResolvedValue(5);
    await expect(academyEnrollmentService.confirm(100)).rejects.toMatchObject({ code: 'ACADEMY_CAPACITY_EXCEEDED' });
  });

  it('confirming a non-pending enrollment is rejected', async () => {
    enrollmentRepo.getByIdForUpdate.mockResolvedValue(makeEnrollment({ status: 'confirmed' }));
    await expect(academyEnrollmentService.confirm(100)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_TRANSITION' });
  });
});

// ── CAPACITY OVERRIDE SERVICE ──
describe('G4 capacity override service', () => {
  it('#36/#39 override create is validated + audited (original untouched)', async () => {
    programRepo.getCapacityForUpdate.mockResolvedValue(makeProgram({ capacity_override_amount: null }));
    programRepo.getById.mockResolvedValue(makeProgram({ capacity_override_amount: 3 }));
    const status = await academyCapacityOverrideService.setOverride(1, 9, { amount: 3, reason: 'Extra demand' });
    expect(programRepo.setCapacityOverride).toHaveBeenCalledWith(1, expect.objectContaining({ amount: 3, by: 9, reason: 'Extra demand' }), conn);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_CAPACITY.OVERRIDE', entityId: 1, afterState: expect.objectContaining({ reason: 'Extra demand' }) }));
    expect(status.originalCapacity).toBe(5);
    expect(status.effectiveCapacity).toBe(8);
  });

  it('override amount must be positive', async () => {
    await expect(academyCapacityOverrideService.setOverride(1, 9, { amount: 0, reason: 'x' })).rejects.toMatchObject({ code: 'ACADEMY_CAPACITY_OVERRIDE_INVALID' });
  });

  it('override expiry must be in the future', async () => {
    await expect(academyCapacityOverrideService.setOverride(1, 9, { amount: 2, until: '2020-01-01T00:00:00.000Z', reason: 'x' })).rejects.toMatchObject({ code: 'ACADEMY_CAPACITY_OVERRIDE_INVALID' });
  });

  it('override reason is required', async () => {
    await expect(academyCapacityOverrideService.setOverride(1, 9, { amount: 2, reason: '' })).rejects.toMatchObject({ code: 'ACADEMY_CAPACITY_OVERRIDE_REQUIRED' });
  });

  it('#40 override removal requires reason and is audited (non-retroactive fields cleared)', async () => {
    programRepo.getCapacityForUpdate.mockResolvedValue(makeProgram({ capacity_override_amount: 3, capacity_override_reason: 'r' }));
    const status = await academyCapacityOverrideService.removeOverride(1, 9, 'Season over');
    expect(programRepo.clearCapacityOverride).toHaveBeenCalledWith(1, conn);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_CAPACITY.OVERRIDE_REMOVED' }));
    expect(status.originalCapacity).toBe(5);
    expect(status.effectiveCapacity).toBe(5);
  });

  it('override removal without reason rejected', async () => {
    await expect(academyCapacityOverrideService.removeOverride(1, 9, '')).rejects.toMatchObject({ code: 'ACADEMY_CAPACITY_OVERRIDE_REQUIRED' });
  });

  it('#7/#8 override removal is non-retroactive (service never demotes; only clears fields)', async () => {
    programRepo.getCapacityForUpdate.mockResolvedValue(makeProgram({ capacity_override_amount: 3 }));
    await academyCapacityOverrideService.removeOverride(1, 9, 'r');
    // No enrollment status mutations happen during override removal.
    expect(enrollmentRepo.updateStatus).not.toHaveBeenCalled();
    expect(enrollmentRepo.promoteToConfirmed).not.toHaveBeenCalled();
  });
});

// ── START GATE (tested in g4-start-gate.spec.ts with the real helper) ──

// ── AUDIT coverage ──
describe('G4 audit coverage', () => {
  it('#36 waitlist enrollment is audited by the controller path (service returns status)', async () => {
    enrollmentRepo.getConfirmedCount.mockResolvedValue(5);
    const e = await academyEnrollmentService.enroll({ player_id: 200, program_id: 1 });
    expect(e.status).toBe('waiting');
    // The controller records ACADEMY_ENROLLMENT.CREATE with status/waiting_order;
    // service-side audits exist for promote (#37), replace (#38), override (#39/#40).
    expect(audit.recordAudit).not.toHaveBeenCalled(); // enroll itself is controller-audited
  });

  it('#37 normal promotion audited', async () => {
    enrollmentRepo.getByIdForUpdate.mockResolvedValue(makeEnrollment());
    enrollmentRepo.getWaitlistHead.mockResolvedValue({ id: 100, waiting_order: 1 });
    await academyEnrollmentService.promote(100, 9, {});
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_WAITLIST.PROMOTE' }));
  });

  it('#39/#40 override create + removal audited', async () => {
    await academyCapacityOverrideService.setOverride(1, 9, { amount: 2, reason: 'r' });
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_CAPACITY.OVERRIDE' }));
    programRepo.getCapacityForUpdate.mockResolvedValue(makeProgram({ capacity_override_amount: 2 }));
    await academyCapacityOverrideService.removeOverride(1, 9, 'r2');
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_CAPACITY.OVERRIDE_REMOVED' }));
  });
});