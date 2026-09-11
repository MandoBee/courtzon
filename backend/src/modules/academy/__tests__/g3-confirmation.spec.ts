// ============================================================================
// Academy G3 — Confirmation Lifecycle (unit tests)
// ============================================================================
// Covers: readiness gate (all blocker codes), atomic confirmation (program →
// groups → schedules → sessions → courts), capacity overrides with reason,
// snapshot-token concurrency guard, no-reconfirm, payment acknowledgment,
// player-booking race abort, and the post-confirm G2 schedule-mutation lock.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

// ── Controllable fake DB (branches/courts/programs/groups/enrollments) ──
const db = vi.hoisted(() => ({
  branch: { id: 5, timezone: 'Asia/Riyadh', opening_time: '06:00', closing_time: '23:00', is_active: 1 },
  resource: { id: 10, name: 'Court A', branch_id: 5, is_active: 1, deleted_at: null, opening_time: '06:00', closing_time: '23:00', sport_id: 21 },
  program: {
    id: 1, code: 'AC1', name: 'A1', description: null, category: 'tennis', level: null, season: null,
    capacity: 5, price: 200, currency: 'USD', price_type: 'FIXED', status: 'open', is_public: 1,
    organisation_id: 7, branch_id: 5, sport_id: 21, lifecycle_state: 'setup',
    confirmed_at: null, confirmed_by: null, updated_at: '2028-01-01 10:00:00',
  },
}));
const captured = vi.hoisted(() => [] as string[]);

const conn = vi.hoisted(() => ({
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(async () => undefined),
  query: async () => [[], []],
  execute: async () => [{ affectedRows: 0 }],
}));

const queryHandler = vi.hoisted(() => async (sql: string, params: any[] = []) => {
  captured.push(sql);
  if (sql.includes('FROM academy_groups g')) {
    const rows = (globalThis as any).__g3Groups ?? [];
    return [rows, []];
  }
  if (sql.includes('FROM academy_enrollments e')) {
    const rows = (globalThis as any).__g3Enrollments ?? [];
    return [rows, []];
  }
  if (sql.includes('WHERE id IN')) {
    const ids = Array.isArray(params[0]) ? params[0] : params;
    const hit = db.resource && ids.some((i: number) => Number(i) === db.resource.id) ? [db.resource] : [];
    return [hit, []];
  }
  return [[], []];
});

const fakePool = vi.hoisted(() => ({
  query: queryHandler,
  execute: async (sql: string) => { captured.push(sql); return [{ affectedRows: 0 }, []]; },
  getConnection: async () => conn,
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => fakePool }));
Object.defineProperty(conn, 'query', { value: queryHandler, writable: true });
Object.defineProperty(conn, 'execute', { value: async () => [{ affectedRows: 0 }], writable: true });

const orgAccess = vi.hoisted(() => ({ canAccessOrganisation: vi.fn(), canAccessBranch: vi.fn(), isPlatformAdmin: vi.fn(), findAccessibleOrgIds: vi.fn(), findAccessibleBranchIds: vi.fn() }));
vi.mock('../../../shared/middleware/org-access.js', () => orgAccess);

const scope = vi.hoisted(() => ({
  resolveProgramScope: vi.fn(),
  assertCanManageAcademy: vi.fn(),
  assertCanManageScopeInput: vi.fn(),
  isApprovedCoach: vi.fn(),
}));
vi.mock('../application/academy-scope.js', () => scope);

const scheduleRepo = vi.hoisted(() => ({
  listSchedulesByProgram: vi.fn(),
  listFutureSessionsForProgram: vi.fn(),
  lockScheduleIdsForProgram: vi.fn(),
  lockSessionIdsForProgram: vi.fn(),
  lockSchedule: vi.fn(),
  updateSessionG2: vi.fn(),
  getSessionById: vi.fn(),
  getScheduleById: vi.fn(),
}));
vi.mock('../infrastructure/repositories/academy-schedule.repository.js', () => ({ academyScheduleRepository: scheduleRepo }));

const groupRepo = vi.hoisted(() => ({ getById: vi.fn(), confirmLock: vi.fn() }));
vi.mock('../infrastructure/repositories/group.repository.js', () => ({ groupRepository: groupRepo }));

const programRepo = vi.hoisted(() => ({ getById: vi.fn(), getByIdForUpdate: vi.fn(), confirm: vi.fn() }));
vi.mock('../infrastructure/repositories/program.repository.js', () => ({ programRepository: programRepo }));

const enrollmentRepo = vi.hoisted(() => ({ getById: vi.fn(), markPaymentConfirmed: vi.fn() }));
vi.mock('../infrastructure/repositories/enrollment.repository.js', () => ({ enrollmentRepository: enrollmentRepo }));

const bookingRepo = vi.hoisted(() => ({ checkSlotAvailability: vi.fn(), lockResource: vi.fn() }));
vi.mock('../../booking/infrastructure/repositories/booking.repository.js', () => ({ bookingRepository: bookingRepo }));

const pricing = vi.hoisted(() => ({ calculatePrice: vi.fn() }));
vi.mock('../../booking/domain/pricing-engine.js', () => ({ pricingEngine: pricing }));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock('../../audit-log/index.js', () => audit);

import { academyConfirmationService } from '../application/academy-confirmation.service.js';
import { academyScheduleService } from '../application/academy-schedule.service.js';

function makeProgram(overrides: Record<string, any> = {}) {
  return { ...db.program, ...overrides };
}

function makeGroup(overrides: Record<string, any> = {}) {
  return {
    id: 2, program_id: 1, name: 'G', coach_id: 3, coach_name: 'Coach A', coach_locked_at: null,
    comp_type: 'fixed_per_session', comp_value: 50, comp_currency: 'USD', capacity: 10, status: 'active',
    updated_at: '2028-01-01 10:00:00', ...overrides,
  };
}

function makeSchedule(overrides: Record<string, any> = {}) {
  return {
    id: 1, group_id: 2, name: 'Weekly', weekdays: ['wed'],
    start_date: '2028-01-01', end_date: '2028-12-31',
    local_start_time: '10:00', local_end_time: '11:00',
    timezone: 'Asia/Riyadh', branch_id: 5, preferred_court_id: 10,
    pending_priority_minutes: 1440, status: 'active',
    created_by: 1, updated_by: null, created_at: '', updated_at: '2028-01-01 10:00:00',
    locked_at: null, locked_by: null, ...overrides,
  };
}

function makeSession(overrides: Record<string, any> = {}) {
  return {
    id: 101, group_id: 2, schedule_id: 1, source_type: 'recurring',
    session_date: '2028-06-01', start_time: '10:00', end_time: '11:00',
    court_id: 10, coach_id: 3, status: 'scheduled', timezone: 'Asia/Riyadh',
    start_at_utc: '2028-06-01T07:00:00.000Z', end_at_utc: '2028-06-01T08:00:00.000Z',
    reservation_status: 'pending_court', priority_seq: 1,
    pending_expires_at: '2030-01-01T00:00:00.000Z', pending_resolved_at: null, pending_resolved_by: null,
    original_session_date: '2028-06-01', original_start_time: '10:00', original_end_time: '11:00', original_court_id: 10,
    conflict_metadata: null, generation_ref: '1:2028-06-01:10:00',
    group_name: 'G', court_name: 'Court A', ...overrides,
  };
}

function makeEnrollment(overrides: Record<string, any> = {}) {
  return {
    id: 11, player_id: 200, program_id: 1, group_id: 2, status: 'confirmed',
    enrolled_at: '2028-01-05 10:00:00', payment_confirmed_at: '2028-01-06 10:00:00', payment_confirmed_by: 9,
    player_name: 'Player A', ...overrides,
  };
}

function setState(opts: {
  groups?: any[]; schedules?: any[]; sessions?: any[]; enrollments?: any[]; program?: any;
  resource?: any; bookingOk?: boolean; price?: any; coachApproved?: boolean; lifecycle?: string;
} = {}) {
  (globalThis as any).__g3Groups = opts.groups ?? [makeGroup()];
  (globalThis as any).__g3Enrollments = opts.enrollments ?? [makeEnrollment()];
  if (opts.program) db.program = opts.program;
  if (opts.resource) db.resource = opts.resource;
  if (opts.lifecycle) db.program = { ...db.program, lifecycle_state: opts.lifecycle };
  scheduleRepo.listSchedulesByProgram.mockResolvedValue(opts.schedules ?? [makeSchedule()]);
  scheduleRepo.listFutureSessionsForProgram.mockResolvedValue(opts.sessions ?? [makeSession()]);
  scheduleRepo.lockScheduleIdsForProgram.mockResolvedValue((opts.schedules ?? [makeSchedule()]).map((s) => s.id));
  scheduleRepo.lockSessionIdsForProgram.mockResolvedValue((opts.sessions ?? [makeSession()]).map((s) => s.id));
  scheduleRepo.lockSchedule.mockResolvedValue(undefined);
  scheduleRepo.updateSessionG2.mockResolvedValue(undefined);
  scheduleRepo.getScheduleById.mockResolvedValue(makeSchedule());
  bookingRepo.checkSlotAvailability.mockResolvedValue(opts.bookingOk ?? true);
  bookingRepo.lockResource.mockResolvedValue(undefined);
  pricing.calculatePrice.mockResolvedValue(opts.price ?? { totalPrice: 150, standardAmount: 150, peakAmount: 0, peakMultiplier: 1 });
  scope.isApprovedCoach.mockResolvedValue(opts.coachApproved ?? true);
  groupRepo.confirmLock.mockResolvedValue(undefined);
  programRepo.confirm.mockResolvedValue(undefined);
  programRepo.getById.mockResolvedValue(makeProgram({ lifecycle_state: opts.lifecycle ?? 'setup' }));
  programRepo.getByIdForUpdate.mockResolvedValue(makeProgram({ lifecycle_state: opts.lifecycle ?? 'setup' }));
  groupRepo.getById.mockResolvedValue(makeGroup());
}

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  db.program = {
    id: 1, code: 'AC1', name: 'A1', description: null, category: 'tennis', level: null, season: null,
    capacity: 5, price: 200, currency: 'USD', price_type: 'FIXED', status: 'open', is_public: 1,
    organisation_id: 7, branch_id: 5, sport_id: 21, lifecycle_state: 'setup',
    confirmed_at: null, confirmed_by: null, updated_at: '2028-01-01 10:00:00',
  };
  db.resource = { id: 10, name: 'Court A', branch_id: 5, is_active: 1, deleted_at: null, opening_time: '06:00', closing_time: '23:00', sport_id: 21 };
  orgAccess.canAccessOrganisation.mockResolvedValue(true);
  orgAccess.canAccessBranch.mockResolvedValue(true);
  scope.resolveProgramScope.mockResolvedValue({ programId: 1, organisationId: 7, branchId: 5, sportId: 21, lifecycleState: 'setup' });
  scope.assertCanManageAcademy.mockResolvedValue(undefined);
  setState();
});

describe('G3 readiness — happy path + stats', () => {
  it('returns ready=true with zero blockers and a stable snapshot token', async () => {
    const r = await academyConfirmationService.readiness(1, 9);
    expect(r.ready).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(r.programName).toBe('A1');
    expect(r.stats).toMatchObject({
      activeGroups: 1, schedules: 1, futureSessions: 1, finalizableSessions: 1,
      confirmedEnrollments: 1, unpaidEnrollments: 0, capacity: 5,
    });
    expect(r.snapshotToken).toMatch(/^[0-9a-f]{40}$/);
  });

  it('produces a deterministic token and changes it when the coach changes', async () => {
    const a = await academyConfirmationService.readiness(1, 9);
    const b = await academyConfirmationService.readiness(1, 9);
    expect(a.snapshotToken).toBe(b.snapshotToken);
    setState({ groups: [makeGroup({ coach_id: 99, comp_type: 'fixed_total' })] });
    const c = await academyConfirmationService.readiness(1, 9);
    expect(c.snapshotToken).not.toBe(a.snapshotToken);
  });
});

describe('G3 readiness — blocker matrix', () => {
  it('MISSING_SCHEDULE when the program has no schedules', async () => {
    setState({ schedules: [] });
    const r = await academyConfirmationService.readiness(1, 9);
    expect(r.ready).toBe(false);
    expect(r.blockers.map((b) => b.code)).toContain('MISSING_SCHEDULE');
  });

  it('MISSING_COACH / INVALID_COACH / MISSING_COMPENSATION from an incomplete group', async () => {
    setState({ groups: [makeGroup({ coach_id: null })] });
    const r = await academyConfirmationService.readiness(1, 9);
    expect(r.blockers.map((b) => b.code)).toContain('MISSING_COACH');

    setState({ groups: [makeGroup({ coach_id: 3, comp_type: null })] });
    const r2 = await academyConfirmationService.readiness(1, 9);
    expect(r2.blockers.map((b) => b.code)).toContain('MISSING_COMPENSATION');

    setState({ groups: [makeGroup({ coach_id: 3 })], coachApproved: false });
    const r3 = await academyConfirmationService.readiness(1, 9);
    expect(r3.blockers.map((b) => b.code)).toContain('INVALID_COACH');
  });

  it('MISSING_COURT when an active schedule has no preferred court', async () => {
    setState({ schedules: [makeSchedule({ preferred_court_id: null })] });
    const r = await academyConfirmationService.readiness(1, 9);
    expect(r.blockers.map((b) => b.code)).toContain('MISSING_COURT');
  });

  it('MISSING_COURT when the preferred court is decommissioned', async () => {
    setState({ resource: { id: 10, branch_id: 5, is_active: 0, deleted_at: null } });
    const r = await academyConfirmationService.readiness(1, 9);
    expect(r.blockers.map((b) => b.code)).toContain('MISSING_COURT');
  });

  it('UNRESOLVED_DST when a future session sits in a DST gap', async () => {
    setState({ sessions: [makeSession({ reservation_status: 'conflict', conflict_metadata: { reason: 'dst_gap' } })] });
    const r = await academyConfirmationService.readiness(1, 9);
    expect(r.blockers.map((b) => b.code)).toContain('UNRESOLVED_DST');
  });

  it('UNRESOLVED_COURT_CONFLICT when a session still conflicts (non-DST)', async () => {
    setState({ sessions: [makeSession({ reservation_status: 'conflict', conflict_metadata: { reason: 'player_booking_conflict' } })] });
    const r = await academyConfirmationService.readiness(1, 9);
    expect(r.blockers.map((b) => b.code)).toContain('UNRESOLVED_COURT_CONFLICT');
  });

  it('UNRESOLVED_PENDING_HOLD when a hold expired with no decision', async () => {
    setState({ sessions: [makeSession({ reservation_status: 'pending_expired' })] });
    const r = await academyConfirmationService.readiness(1, 9);
    expect(r.blockers.map((b) => b.code)).toContain('UNRESOLVED_PENDING_HOLD');
  });

  it('UNPAID_ENROLLMENT for each unacknowledged confirmed enrollment (paid program)', async () => {
    setState({ enrollments: [
      makeEnrollment({ id: 11, payment_confirmed_at: null, player_name: 'A' }),
      makeEnrollment({ id: 12, payment_confirmed_at: null, player_name: 'B' }),
      makeEnrollment({ id: 13 }),
    ] });
    const r = await academyConfirmationService.readiness(1, 9);
    const unpaid = r.blockers.filter((b) => b.code === 'UNPAID_ENROLLMENT');
    expect(unpaid).toHaveLength(2);
    expect(r.stats.unpaidEnrollments).toBe(2);
  });

  it('skips the unpaid gate for free programs', async () => {
    setState({ program: makeProgram({ price: 0 }), enrollments: [makeEnrollment({ payment_confirmed_at: null })] });
    const r = await academyConfirmationService.readiness(1, 9);
    expect(r.blockers.map((b) => b.code)).not.toContain('UNPAID_ENROLLMENT');
    expect(r.stats.unpaidEnrollments).toBe(0);
  });

  it('BELOW_MINIMUM and ABOVE_MAXIMUM are overridable capacity blockers', async () => {
    setState({ enrollments: [] });
    const below = await academyConfirmationService.readiness(1, 9);
    const b = below.blockers.find((x) => x.code === 'BELOW_MINIMUM');
    expect(b).toBeTruthy();
    expect(b!.overridable).toBe(true);

    setState({ enrollments: Array.from({ length: 6 }, (_, i) => makeEnrollment({ id: 20 + i })) });
    const above = await academyConfirmationService.readiness(1, 9);
    const ab = above.blockers.find((x) => x.code === 'ABOVE_MAXIMUM');
    expect(ab).toBeTruthy();
    expect(ab!.overridable).toBe(true);
  });

  it('ALREADY_CONFIRMED when the program lifecycle is confirmed', async () => {
    setState({ lifecycle: 'confirmed' });
    const r = await academyConfirmationService.readiness(1, 9);
    expect(r.blockers.map((b) => b.code)).toContain('ALREADY_CONFIRMED');
  });

  it('denies readiness to users without object scope', async () => {
    scope.assertCanManageAcademy.mockRejectedValue(new Error('ACADEMY_PROGRAM_NOT_FOUND'));
    await expect(academyConfirmationService.readiness(1, 9)).rejects.toThrow('ACADEMY_PROGRAM_NOT_FOUND');
  });
});

describe('G3 confirmation — success path (atomic)', () => {
  it('finalizes pending sessions, snapshots price, locks everything, commits', async () => {
    const result = await academyConfirmationService.confirm(1, 9, { expectedSnapshotToken: undefined });
    expect(result).toEqual({ confirmed: true, programId: 1, lifecycleState: 'confirmed', finalizedSessions: 1, lockedSchedules: 1, lockedGroups: 1 });
    expect(programRepo.getByIdForUpdate).toHaveBeenCalledWith(1, conn);
    expect(scheduleRepo.lockScheduleIdsForProgram).toHaveBeenCalledWith(1, conn);
    expect(bookingRepo.lockResource).toHaveBeenCalledWith(10, conn);
    expect(pricing.calculatePrice).toHaveBeenCalledWith(10, '10:00', '11:00');
    const patch = scheduleRepo.updateSessionG2.mock.calls[0][1];
    expect(patch).toMatchObject({
      reservation_status: 'confirmed', confirmed_by: 9,
      court_price_amount: 150, court_price_currency: 'USD', court_price_snapshot_at: expect.any(String),
      pending_expires_at: null,
    });
    expect(scheduleRepo.lockSchedule).toHaveBeenCalledWith(1, 9, conn);
    expect(groupRepo.confirmLock).toHaveBeenCalledWith(2, 9, conn);
    expect(programRepo.confirm).toHaveBeenCalledWith(1, 9, conn);
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ actorId: 9, action: 'ACADEMY_PROGRAM.CONFIRMED', entityType: 'academy_program', entityId: 1 }));
  });

  it('finalizes only recurring sessions with a status — skips confirmed + manual (null)', async () => {
    setState({
      sessions: [
        makeSession({ id: 101, reservation_status: 'confirmed', confirmed_at: 'x', confirmed_by: 9 }),
        makeSession({ id: 102, reservation_status: null, court_id: 10, source_type: 'manual' }),
        makeSession({ id: 103, reservation_status: 'deferred' }),
      ],
    });
    const result = await academyConfirmationService.confirm(1, 9, {});
    expect(result.finalizedSessions).toBe(1);
    const updatedIds = scheduleRepo.updateSessionG2.mock.calls.map((c: any) => c[0]);
    expect(updatedIds).toEqual([103]);
  });

  it('honors the supplied snapshot token when it still matches', async () => {
    const r = await academyConfirmationService.readiness(1, 9);
    const result = await academyConfirmationService.confirm(1, 9, { expectedSnapshotToken: r.snapshotToken });
    expect(result.confirmed).toBe(true);
  });
});

describe('G3 confirmation — not ready / concurrency', () => {
  it('rejects with ACADEMY_NOT_READY + blockers and rolls back when blockers remain', async () => {
    setState({ sessions: [makeSession({ reservation_status: 'conflict', conflict_metadata: { reason: 'dst_gap' } })] });
    await expect(academyConfirmationService.confirm(1, 9, {})).rejects.toMatchObject({
      code: 'ACADEMY_NOT_READY',
      details: { code: 'ACADEMY_NOT_READY', blockers: expect.arrayContaining([expect.objectContaining({ code: 'UNRESOLVED_DST' })]) },
    });
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(scheduleRepo.updateSessionG2).not.toHaveBeenCalled();
    expect(programRepo.confirm).not.toHaveBeenCalled();
  });

  it('rejects a stale snapshot token with CONCURRENT_MODIFICATION', async () => {
    setState({ groups: [makeGroup({ coach_id: 999, comp_type: 'fixed_total' })] });
    await expect(academyConfirmationService.confirm(1, 9, { expectedSnapshotToken: 'deadbeef' })).rejects.toMatchObject({
      code: 'ACADEMY_NOT_READY',
      details: { blockers: [expect.objectContaining({ code: 'CONCURRENT_MODIFICATION' })] },
    });
    expect(conn.rollback).toHaveBeenCalled();
  });

  it('aborts when a player booking occupies a court during confirmation', async () => {
    setState({ bookingOk: false });
    await expect(academyConfirmationService.confirm(1, 9, {})).rejects.toMatchObject({
      code: 'ACADEMY_NOT_READY',
      details: { blockers: [expect.objectContaining({ code: 'UNRESOLVED_COURT_CONFLICT', detail: 'court_occupied_during_confirmation' })] },
    });
    expect(conn.rollback).toHaveBeenCalled();
    expect(programRepo.confirm).not.toHaveBeenCalled();
  });

  it('never re-confirms an already-confirmed program', async () => {
    setState({ lifecycle: 'confirmed' });
    await expect(academyConfirmationService.confirm(1, 9, {})).rejects.toMatchObject({ code: 'ACADEMY_LIFECYCLE_LOCKED' });
    expect(conn.rollback).toHaveBeenCalled();
  });
});

describe('G3 confirmation — capacity overrides', () => {
  it('BELOW_MINIMUM can be overridden with a reason (audited)', async () => {
    setState({ enrollments: [] });
    const result = await academyConfirmationService.confirm(1, 9, { overrideBelowMin: true, reason: 'Startup cohort below minimum — approved by director.' });
    expect(result.confirmed).toBe(true);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      afterState: expect.objectContaining({ override_below_min: true, reason: 'Startup cohort below minimum — approved by director.' }),
    }));
  });

  it('ABOVE_MAXIMUM can be overridden with a reason', async () => {
    setState({ enrollments: Array.from({ length: 6 }, (_, i) => makeEnrollment({ id: 30 + i })) });
    const result = await academyConfirmationService.confirm(1, 9, { overrideAboveMax: true, reason: 'Waitlist absorbed.' });
    expect(result.confirmed).toBe(true);
  });

  it('requires a reason when an override is used', async () => {
    setState({ enrollments: [] });
    await expect(academyConfirmationService.confirm(1, 9, { overrideBelowMin: true })).rejects.toThrow(/reason is required/);
    expect(conn.rollback).toHaveBeenCalled();
  });

  it('non-overridable blockers still block despite an unrelated override', async () => {
    setState({ sessions: [makeSession({ reservation_status: 'pending_expired' })], enrollments: [] });
    await expect(academyConfirmationService.confirm(1, 9, { overrideBelowMin: true, reason: 'ok' })).rejects.toMatchObject({
      details: { blockers: expect.arrayContaining([expect.objectContaining({ code: 'UNRESOLVED_PENDING_HOLD' })]) },
    });
  });
});

describe('G3 payment acknowledgment', () => {
  it('acknowledges an unpaid confirmed enrollment and audits it', async () => {
    enrollmentRepo.getById.mockResolvedValue(makeEnrollment({ id: 11, payment_confirmed_at: null }));
    enrollmentRepo.markPaymentConfirmed.mockResolvedValue(true);
    const result = await academyConfirmationService.markPaymentConfirmed(11, 9);
    expect(result.payment_confirmed_at).toBeTruthy();
    expect(enrollmentRepo.markPaymentConfirmed).toHaveBeenCalledWith(11, 9);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ actorId: 9, action: 'ACADEMY_ENROLLMENT.PAYMENT_CONFIRMED', entityId: 11 }));
  });

  it('rejects acknowledgment for a non-confirmed enrollment', async () => {
    enrollmentRepo.getById.mockResolvedValue(makeEnrollment({ status: 'pending' }));
    await expect(academyConfirmationService.markPaymentConfirmed(11, 9)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_TRANSITION' });
  });

  it('rejects double acknowledgment', async () => {
    enrollmentRepo.getById.mockResolvedValue(makeEnrollment({ payment_confirmed_at: '2028-01-06 10:00:00' }));
    await expect(academyConfirmationService.markPaymentConfirmed(11, 9)).rejects.toMatchObject({ code: 'ACADEMY_ENROLLMENT_ALREADY_PAID' });
  });

  it('404s a missing enrollment', async () => {
    enrollmentRepo.getById.mockResolvedValue(null);
    await expect(academyConfirmationService.markPaymentConfirmed(999, 9)).rejects.toMatchObject({ code: 'ACADEMY_ENROLLMENT_NOT_FOUND' });
  });
});

describe('G3 post-confirm lock — G2 mutations frozen', () => {
  it('rejects G2 schedule mutations once the program lifecycle is confirmed', async () => {
    scope.resolveProgramScope.mockResolvedValue({ programId: 1, organisationId: 7, branchId: 5, sportId: 21, lifecycleState: 'confirmed' });
    await expect(academyScheduleService.update(1, { name: 'Changed' }, 9)).rejects.toMatchObject({ code: 'ACADEMY_LIFECYCLE_LOCKED' });
  });
});