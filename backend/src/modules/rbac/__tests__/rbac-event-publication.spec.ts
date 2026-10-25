import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 4B-1.1 — RBAC → eventBusV2 publication contract.
 *
 * Every emission site in RBACService is exercised through the real service
 * code with module-level mocks. No MySQL, Redis, HTTP, or Docker dependency is
 * touched: `database/mysql.js`, the repository, the event bus, the command
 * pipeline, the rating service, and the logger are all replaced by mocks.
 *
 * Failure-handling tests need no timers or global unhandled-rejection hooks:
 * `eventBusV2.emit()` is mocked with an already-rejected promise, and the
 * service attaches `.catch()` synchronously before the awaited mutation
 * settles, so the handler is guaranteed to have run by the time the mutation
 * promise resolves (microtask ordering, deterministic).
 */

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'test-not-a-real-password';
  process.env.DB_NAME = 'test_not_a_real_database';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  process.env.PORT = '3001';
});

const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const loggerError = vi.hoisted(() => vi.fn());
const getConnection = vi.hoisted(() => vi.fn());
const commandPipeline = vi.hoisted(() => ({ execute: vi.fn() }));

const repo = vi.hoisted(() => ({
  getRole: vi.fn(),
  assignRole: vi.fn(),
  setUserRoleScope: vi.fn(),
  removeUserRole: vi.fn(),
  getUserById: vi.fn(),
  getUserRoles: vi.fn(),
  updateUser: vi.fn(),
  updateCoachStatus: vi.fn(),
  getCoachByUserId: vi.fn(),
  updateCoachPlatformStatus: vi.fn(),
}));

const rating = vi.hoisted(() => ({ recalculateSelfDeclaredForUser: vi.fn() }));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ getConnection }),
}));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../infrastructure/repositories/rbac.repository.js', () => ({ rbacRepository: repo }));
vi.mock('../../match-result/application/rating/rating.service.js', () => ({ ratingService: rating }));
vi.mock('../../../shared/command/command-pipeline.js', () => ({ commandPipeline }));
vi.mock('../../booking/commands/cancel-booking.command.js', () => ({
  cancelBookingHandler: { validate: vi.fn(), execute: vi.fn(), events: vi.fn() },
}));
vi.mock('../../../shared/utils/logger.js', () => ({
  createModuleLogger: () => ({ error: loggerError, info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { rbacService } from '../application/rbac.service.js';

const USER = { id: 42, email: 'user@example.com', full_name: 'Test User', avatar_url: null, account_status: 'active' };
const COACH = { id: 55, user_id: 42 };

const EVENT_ID_SHAPE = /^\d{10,}-[a-z0-9]*$/;
const ISO_TIMESTAMP_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Latest eventBusV2.emit(...) call: [eventName, payload, context]. */
function lastEmit(): [string, Record<string, any>, Record<string, any>] {
  const calls = bus.emit.mock.calls;
  return calls[calls.length - 1] as [string, Record<string, any>, Record<string, any>];
}

function expectEmit(
  eventName: string,
  payload: Record<string, unknown>,
  context: Record<string, unknown>,
): Record<string, any> {
  const call = lastEmit();
  expect(call[0]).toBe(eventName);
  expect(call[1]).toMatchObject(payload);
  // Legacy facade payload compatibility.
  expect(call[1].eventId).toMatch(EVENT_ID_SHAPE);
  expect(call[1].timestamp).toMatch(ISO_TIMESTAMP_SHAPE);
  expect(new Date(call[1].timestamp).toISOString()).toBe(call[1].timestamp);
  // Explicit aggregate context, identical to the legacy derivation.
  expect(call[2]).toEqual(context);
  expect(call).toHaveLength(3); // no transaction connection is passed
  return call[1];
}

function makeConnection(order: string[] = []) {
  return {
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {
      order.push('commit');
    }),
    rollback: vi.fn(async () => {
      order.push('rollback');
    }),
    release: vi.fn(),
    execute: vi.fn(async (sql: string) => {
      if (String(sql).includes('UPDATE users SET deleted_at = NOW()')) {
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bus.emit.mockResolvedValue(undefined);
  repo.getUserById.mockResolvedValue(USER);
  repo.getUserRoles.mockResolvedValue([]);
  repo.getRole.mockResolvedValue({ id: 3, slug: 'coach' });
  repo.assignRole.mockResolvedValue(61);
  repo.updateUser.mockResolvedValue(true);
  repo.getCoachByUserId.mockResolvedValue(COACH);
  rating.recalculateSelfDeclaredForUser.mockResolvedValue(undefined);
  getConnection.mockResolvedValue(makeConnection());
});

describe('RBAC event publication — user.role.changed', () => {
  it('assignment emits user.role.changed with the role payload and dot-form aggregateType', async () => {
    await rbacService.assignRole(7, 3, 99);

    expectEmit(
      'user.role.changed',
      { userId: 7, roleId: 3, roleSlug: 'coach', assignedBy: 99 },
      { aggregateType: 'user.role.changed', aggregateId: '7', aggregateVersion: 1 },
    );
    expect(repo.assignRole).toHaveBeenCalledWith(7, 3, 99);
  });

  it('removal emits user.role.changed with action=removed and no assignment-only fields', async () => {
    await rbacService.removeUserRole(7, 3);

    expectEmit(
      'user.role.changed',
      { userId: 7, roleId: 3, action: 'removed' },
      { aggregateType: 'user.role.changed', aggregateId: '7', aggregateVersion: 1 },
    );
    const payload = lastEmit()[1];
    expect(payload).not.toHaveProperty('roleSlug');
    expect(payload).not.toHaveProperty('assignedBy');
    expect(repo.removeUserRole).toHaveBeenCalledWith(7, 3);
  });
});

describe('RBAC event publication — user account lifecycle', () => {
  it('suspension emits user:suspended with the admin reason', async () => {
    repo.getUserById.mockResolvedValue({ ...USER, account_status: 'active' });

    await rbacService.updateUser(42, { accountStatus: 'suspended' });

    expectEmit(
      'user:suspended',
      { userId: 42, reason: 'Admin action' },
      { aggregateType: 'user', aggregateId: '42', aggregateVersion: 1 },
    );
  });

  it('reactivation from suspension emits user:activated', async () => {
    repo.getUserById.mockResolvedValue({ ...USER, account_status: 'suspended' });

    await rbacService.updateUser(42, { accountStatus: 'active' });

    const payload = expectEmit(
      'user:activated',
      { userId: 42 },
      { aggregateType: 'user', aggregateId: '42', aggregateVersion: 1 },
    );
    expect(payload).not.toHaveProperty('reason');
  });

  it('an unchanged account status emits nothing', async () => {
    repo.getUserById.mockResolvedValue({ ...USER, account_status: 'active' });

    await rbacService.updateUser(42, { accountStatus: 'active' });

    expect(bus.emit).not.toHaveBeenCalled();
  });

  it('deletion emits user:deleted only after the transaction has committed', async () => {
    const order: string[] = [];
    const conn = makeConnection(order);
    getConnection.mockResolvedValue(conn);
    bus.emit.mockImplementation(() => {
      order.push('emit:user:deleted');
      return Promise.resolve();
    });

    const result = await rbacService.deleteUser(42, 99);

    expect(result).toEqual({ id: 42, email: USER.email, fullName: USER.full_name });
    expect(order).toEqual(['commit', 'emit:user:deleted']);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expectEmit(
      'user:deleted',
      { userId: 42, actorId: 99 },
      { aggregateType: 'user', aggregateId: '42', aggregateVersion: 1 },
    );
  });

  it('a failed commit publishes nothing and still rolls back', async () => {
    const conn = makeConnection();
    conn.commit.mockRejectedValue(new Error('commit failed'));
    getConnection.mockResolvedValue(conn);

    await expect(rbacService.deleteUser(42, 99)).rejects.toThrow('commit failed');

    expect(bus.emit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledTimes(1);
  });
});

describe('RBAC event publication — coach application lifecycle', () => {
  it('approval emits coach:application-approved with the coach id', async () => {
    repo.getUserById.mockResolvedValue({ ...USER, coach_status: 'pending' });

    await rbacService.approveCoachApplication(42, 99);

    expectEmit(
      'coach:application-approved',
      { userId: 42, coachId: 55 },
      { aggregateType: 'coach', aggregateId: '42', aggregateVersion: 1 },
    );
    expect(repo.updateCoachStatus).toHaveBeenCalledWith(42, 'approved');
  });

  it('rejection emits coach:application-rejected with the reason', async () => {
    repo.getUserById.mockResolvedValue({ ...USER, coach_status: 'pending' });

    await rbacService.rejectCoachApplication(42, 'Incomplete documents', 99);

    expectEmit(
      'coach:application-rejected',
      { userId: 42, coachId: 55, reason: 'Incomplete documents' },
      { aggregateType: 'coach', aggregateId: '42', aggregateVersion: 1 },
    );
    expect(repo.updateCoachStatus).toHaveBeenCalledWith(42, 'rejected', 'Incomplete documents');
  });

  it('a missing coach row keeps coachId present-but-undefined and still emits', async () => {
    repo.getUserById.mockResolvedValue({ ...USER, coach_status: 'pending' });
    repo.getCoachByUserId.mockResolvedValue(null);

    await rbacService.approveCoachApplication(42, 99);

    const payload = expectEmit(
      'coach:application-approved',
      { userId: 42 },
      { aggregateType: 'coach', aggregateId: '42', aggregateVersion: 1 },
    );
    expect('coachId' in payload).toBe(true);
    expect(payload.coachId).toBeUndefined();
  });
});

describe('RBAC event publication — coach platform status', () => {
  it('suspension emits coach:platform-suspended with the coach name', async () => {
    await rbacService.suspendCoach(42);

    expectEmit(
      'coach:platform-suspended',
      { userId: 42, coachId: 55, coachName: 'Test User' },
      { aggregateType: 'coach', aggregateId: '42', aggregateVersion: 1 },
    );
    expect(repo.updateCoachPlatformStatus).toHaveBeenCalledWith(42, 'suspended');
  });

  it('reactivation emits coach:platform-activated with the coach name', async () => {
    await rbacService.reactivateCoach(42);

    expectEmit(
      'coach:platform-activated',
      { userId: 42, coachId: 55, coachName: 'Test User' },
      { aggregateType: 'coach', aggregateId: '42', aggregateVersion: 1 },
    );
    expect(repo.updateCoachPlatformStatus).toHaveBeenCalledWith(42, 'active');
  });

  it('deactivation emits coach:platform-deactivated with the coach name', async () => {
    await rbacService.deactivateCoach(42);

    expectEmit(
      'coach:platform-deactivated',
      { userId: 42, coachId: 55, coachName: 'Test User' },
      { aggregateType: 'coach', aggregateId: '42', aggregateVersion: 1 },
    );
    expect(repo.updateCoachPlatformStatus).toHaveBeenCalledWith(42, 'deactivated');
  });
});

describe('RBAC event publication — failure handling', () => {
  it('a rejected publication does not fail the role assignment and is logged', async () => {
    const err = new Error('outbox unavailable');
    bus.emit.mockRejectedValue(err);

    await expect(rbacService.assignRole(7, 3, 99)).resolves.toBeUndefined();

    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err, eventName: 'user.role.changed', userId: 7 }),
      'rbac.event.publish_failed',
    );
  });

  it('a rejected publication does not fail coach approval and is logged', async () => {
    const err = new Error('outbox unavailable');
    bus.emit.mockRejectedValue(err);
    repo.getUserById.mockResolvedValue({ ...USER, coach_status: 'pending' });

    await expect(rbacService.approveCoachApplication(42, 99)).resolves.toEqual(
      expect.objectContaining({ id: 42 }),
    );

    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err, eventName: 'coach:application-approved', userId: 42 }),
      'rbac.event.publish_failed',
    );
  });

  it('a rejected publication after a committed delete succeeds without rolling back', async () => {
    const err = new Error('outbox unavailable');
    bus.emit.mockRejectedValue(err);
    const conn = makeConnection();
    getConnection.mockResolvedValue(conn);

    await expect(rbacService.deleteUser(42, 99)).resolves.toEqual({
      id: 42,
      email: USER.email,
      fullName: USER.full_name,
    });

    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err, eventName: 'user:deleted', userId: 42 }),
      'rbac.event.publish_failed',
    );
  });
});
