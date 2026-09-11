import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

// ── Controllable fake DB (branches/resources/programs) ──
const db = vi.hoisted(() => ({
  branch: { id: 5, timezone: 'Asia/Riyadh', opening_time: '06:00', closing_time: '23:00', is_active: 1 },
  resource: { id: 10, name: 'Court A', branch_id: 5, is_active: 1, deleted_at: null, opening_time: '06:00', closing_time: '23:00', sport_id: 21 },
  program: { program_id: 1, organisation_id: 7, branch_id: 5, sport_id: 21, lifecycle_state: 'setup' },
}));
const captured = vi.hoisted(() => [] as string[]);
const conn = vi.hoisted(() => ({
  beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
  query: async (_sql: string, _params: any[] = []) => [[], []],
  execute: async (_sql: string, _params: any[] = []) => [{ affectedRows: 0 }],
}));

const fakePool = vi.hoisted(() => ({
  query: async (sql: string, params: any[] = []) => {
    captured.push(sql);
    if (sql.includes('FROM branches WHERE id = ?')) {
      return [[db.branch], []];
    }
    if (sql.includes('FROM resources WHERE id = ?')) {
      const hit = db.resource && Number(params[0]) === db.resource.id ? db.resource : null;
      return [hit ? [hit] : [], []];
    }
    if (sql.includes('FROM resources WHERE branch_id = ?')) {
      return [[db.resource], []];
    }
    if (sql.includes('FROM academy_programs WHERE id = ?')) {
      return [[db.program], []];
    }
    return [[], []];
  },
  execute: async (sql: string) => { captured.push(sql); return [{ affectedRows: 0 }, []]; },
  getConnection: async () => conn,
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => fakePool }));

const orgAccess = vi.hoisted(() => ({ canAccessOrganisation: vi.fn(), canAccessBranch: vi.fn(), isPlatformAdmin: vi.fn(), findAccessibleOrgIds: vi.fn(), findAccessibleBranchIds: vi.fn() }));
vi.mock('../../../shared/middleware/org-access.js', () => orgAccess);

const scheduleRepo = vi.hoisted(() => ({
  listSchedules: vi.fn(), listSessions: vi.fn(), getScheduleById: vi.fn(),
  listScheduleSessions: vi.fn(), findRecurringSessionByDate: vi.fn(),
  createSchedule: vi.fn(), updateSchedule: vi.fn(), setScheduleStatus: vi.fn(),
  insertSession: vi.fn(), updateSessionG2: vi.fn(), getSessionById: vi.fn(),
  findCompetingHolds: vi.fn(), downgradeLaterHolders: vi.fn(), findExpiredHolds: vi.fn(), markHoldExpired: vi.fn(),
}));
vi.mock('../infrastructure/repositories/academy-schedule.repository.js', () => ({ academyScheduleRepository: scheduleRepo }));

const groupRepo = vi.hoisted(() => ({ getById: vi.fn() }));
vi.mock('../infrastructure/repositories/group.repository.js', () => ({ groupRepository: groupRepo }));

const programRepo = vi.hoisted(() => ({ getById: vi.fn() }));
vi.mock('../infrastructure/repositories/program.repository.js', () => ({ programRepository: programRepo }));

const bookingRepo = vi.hoisted(() => ({ checkSlotAvailability: vi.fn(), findBookingsByBusinessDate: vi.fn() }));
vi.mock('../../booking/infrastructure/repositories/booking.repository.js', () => ({ bookingRepository: bookingRepo }));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
vi.mock('../../audit-log/index.js', () => audit);

const eventBusMock = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: eventBusMock }));

import { academyScheduleService } from '../application/academy-schedule.service.js';
import { permissionMatchesTemplate } from '../../rbac/application/role-permission-templates.js';

function makeSchedule(overrides: Record<string, any> = {}) {
  return {
    id: 1, group_id: 2, name: 'Weekly', weekdays: ['wed'],
    start_date: '2028-01-01', end_date: '2028-12-31',
    local_start_time: '10:00', local_end_time: '11:00',
    timezone: 'Asia/Riyadh', branch_id: 5, preferred_court_id: 10,
    pending_priority_minutes: 1440, status: 'active',
    created_by: 1, updated_by: null, created_at: '', updated_at: '', ...overrides,
  };
}

function makeGroup(overrides: Record<string, any> = {}) {
  return { id: 2, program_id: 1, name: 'G', coach_id: 3, capacity: 10, status: 'active', ...overrides };
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
    conflict_metadata: null, generation_ref: '1:2028-06-01:10:00', ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  db.branch = { id: 5, timezone: 'Asia/Riyadh', opening_time: '06:00', closing_time: '23:00', is_active: 1 };
  db.resource = { id: 10, name: 'Court A', branch_id: 5, is_active: 1, deleted_at: null, opening_time: '06:00', closing_time: '23:00', sport_id: 21 };
  db.program = { program_id: 1, organisation_id: 7, branch_id: 5, sport_id: 21, lifecycle_state: 'setup' };
  orgAccess.canAccessOrganisation.mockResolvedValue(true);
  orgAccess.canAccessBranch.mockResolvedValue(true);
  orgAccess.isPlatformAdmin.mockResolvedValue(false);
  orgAccess.findAccessibleOrgIds.mockResolvedValue([7]);
  orgAccess.findAccessibleBranchIds.mockResolvedValue([5]);
  groupRepo.getById.mockImplementation(async () => makeGroup());
  programRepo.getById.mockImplementation(async () => ({ id: 1, code: 'AC1', name: 'A1', organisation_id: 7, branch_id: 5 }));
  bookingRepo.checkSlotAvailability.mockResolvedValue(true);
  bookingRepo.findBookingsByBusinessDate.mockResolvedValue([]);
  scheduleRepo.getScheduleById.mockImplementation(async () => makeSchedule());
  scheduleRepo.getSessionById.mockImplementation(async () => makeSession());
  scheduleRepo.listScheduleSessions.mockResolvedValue([]);
  scheduleRepo.findRecurringSessionByDate.mockResolvedValue(null);
  scheduleRepo.findCompetingHolds.mockResolvedValue([]);
  scheduleRepo.downgradeLaterHolders.mockResolvedValue(0);
  scheduleRepo.findExpiredHolds.mockResolvedValue([]);
  scheduleRepo.markHoldExpired.mockResolvedValue(undefined);
  scheduleRepo.createSchedule.mockResolvedValue(1);
  scheduleRepo.updateSchedule.mockResolvedValue(undefined);
  scheduleRepo.insertSession.mockResolvedValue(55);
});

describe('G2 TEST 9 — create validation', () => {
  it('rejects empty/invalid weekdays and inverted date range', async () => {
    await expect(academyScheduleService.create({ group_id: 2, weekdays: [], start_date: '2028-01-01', end_date: '2028-12-31', local_start_time: '10:00', local_end_time: '11:00', branch_id: 5 } as any, 9)).rejects.toThrow(/weekdays is required/);
    await expect(academyScheduleService.create({ group_id: 2, weekdays: ['mon'] as any, start_date: '2028-01-01', end_date: '2028-01-01', local_start_time: '11:00', local_end_time: '10:00', branch_id: 5 } as any, 9)).rejects.toThrow(/before local_end_time|start_date/);
  });

  it('requires branch_id', async () => {
    await expect(academyScheduleService.create({ group_id: 2, weekdays: ['mon'], start_date: '2028-01-01', end_date: '2028-12-31', local_start_time: '10:00', local_end_time: '11:00', branch_id: undefined } as any, 9)).rejects.toThrow(/branch_id is required/);
  });

  it('rejects a timezone that differs from the branch', async () => {
    await expect(academyScheduleService.create({ group_id: 2, weekdays: ['mon'], start_date: '2028-01-01', end_date: '2028-12-31', local_start_time: '10:00', local_end_time: '11:00', branch_id: 5, timezone: 'UTC' } as any, 9)).rejects.toThrow(/must equal the branch timezone/);
  });

  it('rejects an out-of-range pending_priority_minutes', async () => {
    await expect(academyScheduleService.create({ group_id: 2, weekdays: ['mon'], start_date: '2028-01-01', end_date: '2028-12-31', local_start_time: '10:00', local_end_time: '11:00', branch_id: 5, pending_priority_minutes: 5 } as any, 9)).rejects.toThrow(/between 30 and 10080/);
  });

  it('rejects a court that does not belong to the branch', async () => {
    db.resource = { id: 20, name: 'Other', branch_id: 99, is_active: 1, deleted_at: null, opening_time: '06:00', closing_time: '23:00', sport_id: 21 };
    await expect(academyScheduleService.create({ group_id: 2, weekdays: ['mon'], start_date: '2028-01-01', end_date: '2028-12-31', local_start_time: '10:00', local_end_time: '11:00', branch_id: 5, preferred_court_id: 20 } as any, 9)).rejects.toThrow(/does not belong to the branch/);
  });
});

describe('G2 TEST 10 — idempotent generation on create', () => {
  it('inserts recurring sessions with deterministic generation_ref for active schedules', async () => {
    const created = await academyScheduleService.create({
      group_id: 2, name: 'Weekly', weekdays: ['wed'], start_date: '2028-01-01', end_date: '2028-03-01',
      local_start_time: '10:00', local_end_time: '11:00', branch_id: 5, preferred_court_id: 10, timezone: 'Asia/Riyadh',
    }, 9);
    expect(created?.id).toBe(1);
    expect(scheduleRepo.createSchedule).toHaveBeenCalledWith(expect.objectContaining({ group_id: 2, timezone: 'Asia/Riyadh', created_by: 9 }));
    expect(scheduleRepo.insertSession).toHaveBeenCalled();
    const inserted = scheduleRepo.insertSession.mock.calls.map((c: any[]) => c[0]);
    const refs = inserted.map((i: any) => i.generation_ref);
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(r).toMatch(/^1:\d{4}-\d{2}-\d{2}:10:00$/);
    // each generated session is a pending priority hold with schedule priority
    for (const i of inserted) {
      expect(i.reservation_status).toBe('pending_court');
      expect(i.priority_seq).toBe(1);
      expect(i.source_type).toBe('recurring');
    }
    // regression: engine states must be persisted as lowercase DB enum values
    const all = (scheduleRepo.insertSession.mock.calls as any[]).map((c: any[]) => c[0]);
    for (const i of all) {
      expect(i.reservation_status).toMatch(/^(pending_court|conflict|pending_expired|deferred|resolved)$/);
      expect(i.reservation_status).not.toMatch(/[A-Z]/);
    }
  });

  it('skips dates where a recurring session already exists (idempotency)', async () => {
    scheduleRepo.findRecurringSessionByDate.mockResolvedValue(makeSession() as any);
    await academyScheduleService.create({
      group_id: 2, weekdays: ['wed'], start_date: '2028-01-01', end_date: '2028-03-01',
      local_start_time: '10:00', local_end_time: '11:00', branch_id: 5,
    }, 9);
    expect(scheduleRepo.insertSession).not.toHaveBeenCalled();
  });
});

describe('G2 TEST 11 — update guards', () => {
  it('rejects branch change after creation', async () => {
    await expect(academyScheduleService.update(1, { branch_id: 99 } as any, 9)).rejects.toThrow(/Branch cannot be changed/);
  });

  it('rejects timezone change after creation', async () => {
    await expect(academyScheduleService.update(1, { timezone: 'UTC' } as any, 9)).rejects.toThrow(/Timezone cannot be changed/);
  });

  it('rejects a preferred court that does not belong to the schedule branch', async () => {
    db.resource = { id: 55, name: 'Other', branch_id: 99, is_active: 1, deleted_at: null, opening_time: '06:00', closing_time: '23:00', sport_id: 21 };
    await expect(academyScheduleService.update(1, { preferred_court_id: 55 } as any, 9)).rejects.toThrow(/does not belong to the schedule branch/);
  });

  it('applies a whole-schedule change after evaluation (persist)', async () => {
    scheduleRepo.listScheduleSessions.mockResolvedValue([makeSession({ session_date: '2028-06-07', start_time: '10:00', end_time: '11:00' })]);
    const result = await academyScheduleService.update(1, { local_start_time: '12:00', local_end_time: '13:00', preferred_court_id: 10, pending_priority_minutes: 720 } as any, 9);
    expect(result.affected).toBeGreaterThan(0);
    expect(scheduleRepo.updateSchedule).toHaveBeenCalledWith(1, expect.objectContaining({ local_start_time: '12:00', updated_by: 9 }));
    // evaluated future sessions are re-applied (window change → snapshot/move)
    const patches = scheduleRepo.updateSessionG2.mock.calls.map((c: any[]) => c[1]);
    expect(patches.some((p: any) => p.session_date === '2028-06-07' && p.start_time === '12:00')).toBe(true);
  });
});

describe('G2 TEST 12 — single-session resolution preserves session id', () => {
  it('release clears the hold without touching court/date (manual fallback)', async () => {
    const s = await academyScheduleService.resolveSession(101, { type: 'release' }, 9);
    expect(s).toBeDefined();
    const patch = scheduleRepo.updateSessionG2.mock.calls[0][1];
    expect(patch.reservation_status).toBeNull();
    expect(patch.pending_expires_at).toBeNull();
    expect(patch.court_id).toBeUndefined();
    expect(patch.session_date).toBeUndefined();
  });

  it('keep confirms the hold without moving the session (resolved)', async () => {
    await academyScheduleService.resolveSession(101, { type: 'keep' }, 9);
    const patch = scheduleRepo.updateSessionG2.mock.calls[0][1];
    expect(patch.reservation_status).toBe('resolved');
    expect(patch.pending_resolved_by).toBe(9);
    expect(patch.pending_expires_at).toBeNull();
    expect(patch.court_id).toBeUndefined();
    expect(patch.session_date).toBeUndefined();
  });

  it('keep re-checks the slot occupancy; rejects when a player booking appeared', async () => {
    bookingRepo.checkSlotAvailability.mockResolvedValue(false);
    await expect(academyScheduleService.resolveSession(101, { type: 'keep' }, 9)).rejects.toThrow(/occupied by a player booking/);
  });

  it('apply_alternative cannot target a date within the player horizon', async () => {
    const near = new Date(); const iso = `${near.getFullYear()}-${String(near.getMonth() + 1).padStart(2, '0')}-${String(near.getDate()).padStart(2, '0')}`;
    await expect(academyScheduleService.resolveSession(101, { type: 'apply_alternative', alternative: { court_id: 10, session_date: iso, start_time: '10:00', end_time: '11:00' } }, 9)).rejects.toThrow(/player booking horizon/);
  });

  it('apply_alternative rejects a DST-gap target', async () => {
    db.branch = { id: 5, timezone: 'America/New_York', opening_time: '06:00', closing_time: '23:00', is_active: 1 };
    scheduleRepo.getScheduleById.mockImplementation(async () => makeSchedule({ timezone: 'America/New_York' }));
    await expect(academyScheduleService.resolveSession(101, { type: 'apply_alternative', alternative: { court_id: 10, session_date: '2028-03-12', start_time: '02:30', end_time: '03:30' } }, 9)).rejects.toThrow(/DST gap/);
  });

  it('apply_alternative moves the SAME session id to the alternative window (resolved)', async () => {
    await academyScheduleService.resolveSession(101, { type: 'apply_alternative', alternative: { court_id: 10, session_date: '2028-06-02', start_time: '10:00', end_time: '11:00' } }, 9);
    expect(scheduleRepo.updateSessionG2).toHaveBeenCalledWith(101, expect.objectContaining({ session_date: '2028-06-02', reservation_status: 'resolved' }), conn);
    expect(scheduleRepo.updateSessionG2.mock.calls[0][0]).toBe(101);
  });
});

describe('G2 TEST 13 — pending-hold expiry worker path', () => {
  it('marks expired holds pending_expired, never cancels, and emits hold-expired', async () => {
    scheduleRepo.findExpiredHolds.mockResolvedValue([{ id: 101, group_id: 2, schedule_id: 1, session_date: '2028-06-01' }]);
    const result = await academyScheduleService.expireHolds();
    expect(result.expired).toBe(1);
    expect(scheduleRepo.markHoldExpired).toHaveBeenCalledWith(101);
    expect(eventBusMock.emit).toHaveBeenCalledWith('academy:session:hold-expired', expect.objectContaining({ sessionId: 101, scheduleId: 1 }));
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACADEMY_SESSION.HOLD_EXPIRED' }));
    // never auto-cancels or auto-extends the session itself
    expect(scheduleRepo.updateSessionG2).not.toHaveBeenCalled();
  });

  it('does nothing when no holds are expired', async () => {
    const result = await academyScheduleService.expireHolds();
    expect(result.expired).toBe(0);
    expect(scheduleRepo.markHoldExpired).not.toHaveBeenCalled();
    expect(eventBusMock.emit).not.toHaveBeenCalled();
  });
});

describe('G2 TEST 14 — object scope (cross-organisation denied — non-revealing)', () => {
  it('an actor without organisation access cannot manage the schedule', async () => {
    orgAccess.canAccessOrganisation.mockResolvedValue(false);
    await expect(academyScheduleService.update(1, { name: 'X' } as any, 999)).rejects.toThrow(/not found/i);
  });

  it('regenerate is permission-gated through the same manage assertion', async () => {
    orgAccess.canAccessOrganisation.mockResolvedValue(false);
    await expect(academyScheduleService.regenerate(1, 999)).rejects.toThrow(/not found/i);
  });
});

describe('G2 TEST 15 — RBAC: academy.schedule.* is admin-only, players cannot mutate', () => {
  it('admin academy roles are granted view/manage/resolve', () => {
    for (const role of ['org-admin', 'master-admin', 'academy-manager']) {
      expect(permissionMatchesTemplate(role, 'academy.schedule.view')).toBe(true);
      expect(permissionMatchesTemplate(role, 'academy.schedule.manage')).toBe(true);
      expect(permissionMatchesTemplate(role, 'academy.schedule.resolve')).toBe(true);
    }
  });

  it('player/coach roles never receive schedule manage or resolve', () => {
    expect(permissionMatchesTemplate('player', 'academy.schedule.view')).toBe(false);
    expect(permissionMatchesTemplate('coach', 'academy.schedule.manage')).toBe(false);
    expect(permissionMatchesTemplate('player', 'academy.schedule.resolve')).toBe(false);
  });
});

describe('G2 TEST 16 — regeneration respects status and horizon', () => {
  it('archived/paused schedules generate nothing', async () => {
    scheduleRepo.getScheduleById.mockImplementation(async () => makeSchedule({ status: 'archived' }));
    const result = await academyScheduleService.regenerate(1, 9);
    expect(scheduleRepo.insertSession).not.toHaveBeenCalled();
    expect(result.generated).toBe(0);
  });

  it('listSessions passes the scheduleId/status filters to the repo', async () => {
    scheduleRepo.listSessions.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
    await academyScheduleService.listSessions({ scheduleId: 1, status: 'pending_court' });
    expect(scheduleRepo.listSessions).toHaveBeenCalledWith(
      expect.stringContaining('s.schedule_id = ?'),
      expect.arrayContaining([1, 'pending_court']),
      expect.any(Object),
    );
  });
});

describe('G2 TEST 17 — reservation_status persistence casing regression', () => {
  it('persists DST admin-resolution state as lowercase `conflict` (not an uppercase engine label)', async () => {
    db.branch = { id: 5, timezone: 'America/New_York', opening_time: '00:00', closing_time: '23:59', is_active: 1 };
    db.resource = { id: 10, name: 'Court A', branch_id: 5, is_active: 1, deleted_at: null, opening_time: '00:00', closing_time: '23:59', sport_id: 21 };
    scheduleRepo.getScheduleById.mockImplementation(async () => makeSchedule({ timezone: 'America/New_York', weekdays: ['sun'], local_start_time: '02:00', local_end_time: '03:00' }));
    scheduleRepo.listScheduleSessions.mockResolvedValue([
      makeSession({ session_date: '2028-03-12', start_time: '02:00', end_time: '03:00', timezone: 'America/New_York' }),
    ]);

    await academyScheduleService.update(1, { name: 'DST-edited' } as any, 9);

    const patch = scheduleRepo.updateSessionG2.mock.calls[0][1];
    expect(patch.reservation_status).toBe('conflict');
    expect(patch.conflict_metadata?.reason).toBe('dst_gap');
    expect(patch.reservation_status).not.toMatch(/[A-Z]/);
  });

  it('omits reservation_status from the patch when the DB value is already correct (no always-overwrite)', async () => {
    scheduleRepo.listScheduleSessions.mockResolvedValue([makeSession()]);
    await academyScheduleService.resync(1, 9);
    const patch = scheduleRepo.updateSessionG2.mock.calls[0][1];
    expect(patch.reservation_status).toBeUndefined();
  });

  it('downgrades a lower-priority holder to lowercase conflict on resync', async () => {
    bookingRepo.checkSlotAvailability.mockResolvedValue(true);
    scheduleRepo.listScheduleSessions.mockResolvedValue([
      makeSession({ reservation_status: 'conflict' }),
      makeSession({ id: 102, priority_seq: 1, reservation_status: 'pending_court' }),
    ]);
    await academyScheduleService.resync(1, 9);
    expect(scheduleRepo.updateSessionG2).toHaveBeenCalled();
    for (const call of scheduleRepo.updateSessionG2.mock.calls) {
      const p = call[1] as any;
      if (p.reservation_status !== undefined) expect(p.reservation_status).not.toMatch(/[A-Z]/);
    }
  });
});