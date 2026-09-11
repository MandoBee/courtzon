import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

const bookingRepo = vi.hoisted(() => ({
  checkSlotAvailability: vi.fn(), findBookingsByBusinessDate: vi.fn(),
}));
vi.mock('../../booking/infrastructure/repositories/booking.repository.js', () => ({ bookingRepository: bookingRepo }));

const scheduleRepo = vi.hoisted(() => ({
  findCompetingHolds: vi.fn(), downgradeLaterHolders: vi.fn(),
}));
vi.mock('../infrastructure/repositories/academy-schedule.repository.js', () => ({ academyScheduleRepository: scheduleRepo }));

import { academyConflictService } from '../application/academy-conflict.service.js';
import type { AcademyConflictContext } from '../application/academy-conflict.service.js';

function makeCtx(overrides: Record<string, any> = {}): AcademyConflictContext {
  const branchId = overrides.branchId ?? 5;
  const resourceId = overrides.resourceId ?? 10;
  const defaultResource = {
    id: resourceId, name: 'Court A', branch_id: branchId,
    is_active: 1, deleted_at: null, opening_time: '06:00', closing_time: '23:00', sport_id: 21,
  };
  return {
    schedule: {
      id: 1, group_id: 1, name: 'Weekly', weekdays: ['wed', 'fri'],
      start_date: '2028-01-01', end_date: '2028-12-31',
      local_start_time: '10:00', local_end_time: '11:00',
      timezone: 'Asia/Riyadh', branch_id: branchId,
      preferred_court_id: resourceId, pending_priority_minutes: 1440, status: 'active',
      ...(overrides.schedule ?? {}),
    },
    groupCoachId: 3,
    resource: 'resource' in overrides ? (overrides.resource ?? null) : defaultResource,
    branchCourts: overrides.branchCourts ?? [],
    sessionId: 7,
    conn: undefined,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bookingRepo.checkSlotAvailability.mockResolvedValue(true);
  bookingRepo.findBookingsByBusinessDate.mockResolvedValue([]);
  scheduleRepo.findCompetingHolds.mockResolvedValue([]);
  scheduleRepo.downgradeLaterHolders.mockResolvedValue(0);
});

describe('G2 TEST 1 — DST gap / overlap requires explicit admin resolution', () => {
  it('DST gap returns ADMIN_TIME_RESOLUTION_REQUIRED (dst_gap)', async () => {
    const ctx = makeCtx({ schedule: { timezone: 'America/New_York' } });
    // US 2028 spring-forward: 2028-03-12 02:00→03:00 (02:30 does not exist).
    const ev = await academyConflictService.evaluate(10, '2028-03-12', '02:30', '03:30', ctx);
    expect(ev.state).toBe('ADMIN_TIME_RESOLUTION_REQUIRED');
    expect(ev.reason).toBe('dst_gap');
    expect(bookingRepo.checkSlotAvailability).not.toHaveBeenCalled();
  });

  it('DST overlap returns ADMIN_TIME_RESOLUTION_REQUIRED (dst_ambiguous)', async () => {
    const ctx = makeCtx({ schedule: { timezone: 'America/New_York' } });
    // US fall-back: 2028-11-05 01:30 occurs twice.
    const ev = await academyConflictService.evaluate(10, '2028-11-05', '01:30', '02:30', ctx);
    expect(ev.state).toBe('ADMIN_TIME_RESOLUTION_REQUIRED');
    expect(ev.reason).toBe('dst_ambiguous');
  });
});

describe('G2 TEST 2 — player booking horizon defers (no hold)', () => {
  it('a date inside the 7-day window is DEFERRED (within_player_horizon)', async () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const ev = await academyConflictService.evaluate(10, iso, '10:00', '11:00', makeCtx());
    expect(ev.state).toBe('DEFERRED');
    expect(ev.reason).toBe('within_player_horizon');
    expect(bookingRepo.checkSlotAvailability).not.toHaveBeenCalled();
  });
});

describe('G2 TEST 3 — resource eligibility', () => {
  it('deleted/inactive or missing preferred court → CONFLICT resource_unavailable', async () => {
    for (const resource of [
      null,
      { id: 10, name: 'X', branch_id: 5, is_active: 0, deleted_at: null, opening_time: '06:00', closing_time: '23:00', sport_id: 21 },
      { id: 10, name: 'X', branch_id: 5, is_active: 1, deleted_at: '2028-01-01', opening_time: '06:00', closing_time: '23:00', sport_id: 21 },
    ]) {
      const ctx = makeCtx({ resource: resource as any });
      const ev = await academyConflictService.evaluate(10, '2028-06-01', '10:00', '11:00', ctx);
      expect(ev.state).toBe('CONFLICT');
      expect(ev.reason).toBe('resource_unavailable');
    }
  });

  it('preferred court not in the branch → CONFLICT resource_not_in_branch', async () => {
    const ctx = makeCtx({ branchId: 5, resource: { id: 20, name: 'Other branch', branch_id: 99, is_active: 1, deleted_at: null, opening_time: '06:00', closing_time: '23:00', sport_id: 21 } });
    const ev = await academyConflictService.evaluate(20, '2028-06-01', '10:00', '11:00', ctx);
    expect(ev.state).toBe('CONFLICT');
    expect(ev.reason).toBe('resource_not_in_branch');
  });

  it('outside operating hours → CONFLICT outside_operating_hours', async () => {
    const ctx = makeCtx({ resource: { id: 10, name: 'A', branch_id: 5, is_active: 1, deleted_at: null, opening_time: '06:00', closing_time: '23:00', sport_id: 21 } });
    const ev = await academyConflictService.evaluate(10, '2028-06-01', '00:30', '01:30', ctx);
    expect(ev.state).toBe('CONFLICT');
    expect(ev.reason).toBe('outside_operating_hours');
  });
});

describe('G2 TEST 4 — deterministic priority: earlier recurring reservation wins', () => {
  it('higher-priority hold → academy_conflict, no downgrade', async () => {
    scheduleRepo.findCompetingHolds.mockResolvedValue([{ id: 5, priority_seq: 1, session_date: '2028-06-01', start_time: '10:00', end_time: '11:00', group_id: 2, reservation_status: 'pending_court' }]);
    const ctx = makeCtx({ sessionId: 7 });
    const ev = await academyConflictService.evaluate(10, '2028-06-01', '10:00', '11:00', ctx);
    expect(ev.state).toBe('CONFLICT');
    expect(ev.reason).toBe('academy_conflict');
    expect(ev.conflict).toMatchObject({ type: 'academy_session', id: 5, prioritySeq: 1 });
    expect(scheduleRepo.downgradeLaterHolders).not.toHaveBeenCalled();
  });

  it('tie-break: same priority_seq, lower session id wins', async () => {
    scheduleRepo.findCompetingHolds.mockResolvedValue([{ id: 6, priority_seq: 1, session_date: '2028-06-01', start_time: '10:00', end_time: '11:00', group_id: 2, reservation_status: 'pending_court' }]);
    const ctx = makeCtx({ schedule: { id: 1 }, sessionId: 7 });
    const ev = await academyConflictService.evaluate(10, '2028-06-01', '10:00', '11:00', ctx);
    expect(ev.state).toBe('CONFLICT');
    expect(ev.reason).toBe('academy_conflict');
    expect(ev.conflict?.id).toBe(6);
  });
});

describe('G2 TEST 5 — a later-priority hold is deterministically downgraded', () => {
  it('slot occupied by a player booking + competing later hold → PENDING_COURT and later holder downgraded', async () => {
    bookingRepo.checkSlotAvailability.mockResolvedValue(false);
    scheduleRepo.findCompetingHolds.mockResolvedValue([{ id: 8, priority_seq: 2, session_date: '2028-06-01', start_time: '10:00', end_time: '11:00', group_id: 2, reservation_status: 'pending_court' }]);
    const ctx = makeCtx({ sessionId: 7 });
    const ev = await academyConflictService.evaluate(10, '2028-06-01', '10:00', '11:00', ctx);
    expect(ev.state).toBe('PENDING_COURT');
    expect(scheduleRepo.downgradeLaterHolders).toHaveBeenCalledWith(10, '2028-06-01', '10:00', '11:00', 1, 7, expect.objectContaining({ reason: 'lower_priority', scheduleId: 1 }), undefined);
  });

  it('vacant slot + racing later holder → PENDING_COURT and later holder downgraded', async () => {
    (bookingRepo.checkSlotAvailability as any).mockResolvedValue(true);
    scheduleRepo.findCompetingHolds.mockResolvedValue([{ id: 8, priority_seq: 2, session_date: '2028-06-01', start_time: '10:00', end_time: '11:00', group_id: 2, reservation_status: 'pending_court' }]);
    const ev = await academyConflictService.evaluate(10, '2028-06-01', '10:00', '11:00', makeCtx({ sessionId: 7 }));
    expect(ev.state).toBe('PENDING_COURT');
    expect(scheduleRepo.downgradeLaterHolders).toHaveBeenCalled();
  });
});

describe('G2 TEST 6 — player booking conflict (no competing academy hold)', () => {
  it('occupied by a confirmed player booking → CONFLICT player_booking_conflict', async () => {
    bookingRepo.checkSlotAvailability.mockResolvedValue(false);
    scheduleRepo.findCompetingHolds.mockResolvedValue([]);
    const ev = await academyConflictService.evaluate(10, '2028-06-01', '10:00', '11:00', makeCtx());
    expect(ev.state).toBe('CONFLICT');
    expect(ev.reason).toBe('player_booking_conflict');
    expect(ev.conflict).toMatchObject({ type: 'booking' });
    expect(scheduleRepo.downgradeLaterHolders).not.toHaveBeenCalled();
  });
});

describe('G2 TEST 7 — vacant slot is held as pending priority court', () => {
  it('no bookings, no competing holds → PENDING_COURT with UTC bounds', async () => {
    const ev = await academyConflictService.evaluate(10, '2028-06-01', '10:00', '11:00', makeCtx());
    expect(ev.state).toBe('PENDING_COURT');
    expect(ev.startAtUtc).toBeTruthy();
    expect(ev.endAtUtc).toBeTruthy();
    expect(scheduleRepo.downgradeLaterHolders).not.toHaveBeenCalled();
  });
});

describe('G2 TEST 8 — alternatives engine', () => {
  it('suggests another free court on the same date/time and skips occupied ones', async () => {
    bookingRepo.checkSlotAvailability.mockImplementation(async (courtId: number) => courtId !== 11);
    bookingRepo.findBookingsByBusinessDate.mockImplementation(async (courtId: number) => {
      return courtId === 11 ? [{ startAtUtc: '2028-06-01T06:30:00.000Z', endAtUtc: '2028-06-01T07:30:00.000Z' }] : [];
    });
    const ctx = makeCtx({
      branchCourts: [
        { id: 11, name: 'Court B', branch_id: 5, is_active: 1, deleted_at: null, opening_time: '06:00', closing_time: '23:00', sport_id: 21 },
        { id: 12, name: 'Court C', branch_id: 5, is_active: 1, deleted_at: null, opening_time: '06:00', closing_time: '23:00', sport_id: 21 },
      ],
    });
    const ev = await academyConflictService.evaluate(11, '2028-06-01', '10:00', '11:00', ctx);
    expect(ev.state).toBe('CONFLICT');
    expect(ev.alternatives?.some((a) => a.court_id === 12 && a.session_date === '2028-06-01' && a.start_time === '10:00')).toBe(true);
    // the occupied court must not appear for the same date/time (it may still be offered on a later recurrence date)
    expect(ev.alternatives?.some((a) => a.court_id === 11 && a.session_date === '2028-06-01')).toBe(false);
  });

  it('offers alternative dates only on recurrence weekdays', async () => {
    bookingRepo.findBookingsByBusinessDate.mockResolvedValue([]);
    const ctx = makeCtx({ schedule: { id: 1, weekdays: ['wed'] }, resource: { id: 10, name: 'Court A', branch_id: 5, is_active: 1, deleted_at: null, opening_time: '06:00', closing_time: '23:00', sport_id: 21 } });
    bookingRepo.checkSlotAvailability.mockResolvedValue(false);
    const ev = await academyConflictService.evaluate(10, '2028-06-01', '10:00', '11:00', ctx);
    const dates = ev.alternatives?.map((a) => a.session_date) ?? [];
    expect(dates.length).toBeGreaterThan(0);
    for (const d of dates) expect(new Date(`${d}T00:00:00Z`).getUTCDay()).toBe(3);
  });

  it('returns at most 10 deduplicated alternatives', async () => {
    bookingRepo.findBookingsByBusinessDate.mockResolvedValue([]);
    const ctx = makeCtx({
      branchCourts: Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, name: `C${i}`, branch_id: 5, is_active: 1, deleted_at: null, opening_time: '06:00', closing_time: '23:00', sport_id: 21 })),
      resource: { id: 10, name: 'Court A', branch_id: 5, is_active: 1, deleted_at: null, opening_time: '06:00', closing_time: '23:00', sport_id: 21 },
    });
    bookingRepo.checkSlotAvailability.mockResolvedValue(false);
    const ev = await academyConflictService.evaluate(10, '2028-06-01', '10:00', '11:00', ctx);
    expect(ev.alternatives!.length).toBeLessThanOrEqual(10);
  });
});