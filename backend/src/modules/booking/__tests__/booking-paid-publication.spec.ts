import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * P0.1 — atomic payment claim + transactional booking:paid.
 *
 * Booking creation (V1 and V2) confirms the booking but must NEVER publish
 * booking:paid. booking:paid is published only by updatePaymentStatus(), after
 * a conditional `pending → paid` claim succeeds, inside the SAME transaction
 * as the published event.
 *
 * These are pure unit tests (no MySQL/Redis/external services): the DB layer,
 * repositories, command pipeline and event bus are mocked.
 *
 * SQL CONTRACT: the claim tests below call the REAL BookingRepository method.
 * A fake connection evaluates the SQL predicates the method actually emits
 * (`payment_status = 'pending'` + `booking_status IN (...)`), so the state
 * matrix is driven by the real SQL text — not by an unrelated mocked boolean.
 * This still cannot prove InnoDB row-lock behaviour; that remains an
 * integration-test concern.
 */

const state = vi.hoisted(() => ({
  featureFlag: true,
  confirmFails: false,
  booking: null as any,
  createArgs: null as any,
  confirmPayload: null as any,
  claimResults: [] as boolean[],
}));

const mocks = vi.hoisted(() => {
  const conn = {
    beginTransaction: vi.fn(async () => undefined),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    release: vi.fn(() => undefined),
    execute: vi.fn(async () => [{ insertId: 1 }]),
  };
  const pool = {
    execute: vi.fn(async () => [[{ id: 7, organisation_id: 77, timezone: 'Africa/Cairo', opening_time: '08:00', closing_time: '22:00' }], []]),
    getConnection: vi.fn(async () => conn),
  };
  return {
    emit: vi.fn(async () => undefined),
    findById: vi.fn(),
    canAccessOrganisation: vi.fn(async () => true),
    persistPaymentStatus: vi.fn(async () => undefined),
    claimPaidStatus: vi.fn(),
    persistTransition: vi.fn(async () => undefined),
    checkSlotAvailability: vi.fn(async () => true),
    createBookingRow: vi.fn(async () => 59292),
    createMatchmakingRequest: vi.fn(async () => undefined),
    commandExecute: vi.fn(),
    poolExecute: pool.execute,
    conn,
    pool,
    failCommit: false,
  };
});

vi.mock('../../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: 6379,
    REDIS_DB: 0,
    DB_HOST: '127.0.0.1',
    DB_PORT: 3306,
    DB_USER: 'root',
    DB_PASSWORD: 'test',
    DB_NAME: 'courtzon_test',
  },
}));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => mocks.pool }));
vi.mock('../../../database/database.transaction.js', () => ({
  isInTransaction: () => false,
  onAfterCommit: (hook: any) => { void hook(); },
  // Emulates withTransaction: commit on success, rollback + field restore on
  // failure. `failCommit` models a commit-time failure.
  withTransaction: async (fn: any) => {
    const snapshot = state.booking ? { ...state.booking } : null;
    await mocks.conn.beginTransaction();
    try {
      const result = await fn(mocks.conn);
      if (mocks.failCommit) throw new Error('commit failed');
      await mocks.conn.commit();
      return result;
    } catch (err) {
      if (snapshot && state.booking) Object.assign(state.booking, snapshot);
      await mocks.conn.rollback();
      throw err;
    }
  },
  runProvidedTransaction: async (conn: any, fn: any) => fn(),
}));
vi.mock('../../../infrastructure/redis/redis.client.js', () => ({
  getRedisClient: () => ({
    get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), expire: vi.fn(),
    on: vi.fn(), quit: vi.fn(),
  }),
  closeRedisClient: vi.fn(),
}));
vi.mock('../infrastructure/redis/redis-lock.js', () => ({
  redisLock: {
    acquireAll: vi.fn(async () => true),
    releaseAll: vi.fn(async () => undefined),
  },
  createLockOwner: vi.fn(() => 'test-lock-owner'),
}));
vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  bookingRepository: {
    findById: mocks.findById,
    canAccessOrganisation: mocks.canAccessOrganisation,
    persistPaymentStatus: mocks.persistPaymentStatus,
    claimPaidStatus: mocks.claimPaidStatus,
    persistTransition: mocks.persistTransition,
    checkSlotAvailability: mocks.checkSlotAvailability,
    create: mocks.createBookingRow,
    createMatchmakingRequest: mocks.createMatchmakingRequest,
  },
}));
vi.mock('../domain/pricing-engine.js', () => ({
  pricingEngine: { calculatePrice: vi.fn(async () => ({ totalPrice: 50 })) },
  PricingEngine: class {},
}));
vi.mock('../../financial/application/commission.service.js', () => ({
  commissionService: {
    calculate: vi.fn(async () => ({
      rate: 0, rateType: 'percentage', commissionAmount: 0, netAmount: 50, planName: 'test', planId: 0,
    })),
  },
}));
vi.mock('../../financial/application/transaction.service.js', () => ({ transactionService: {} }));
vi.mock('../../financial/infrastructure/transaction.repository.js', () => ({ transactionRepository: {} }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: {} }));
vi.mock('../../organisations/infrastructure/repositories/resource.repository.js', () => ({
  resourceRepository: {
    findById: vi.fn(async () => ({ opening_time: '08:00', closing_time: '22:00', slot_duration: 60, sport_id: 1 })),
  },
}));
vi.mock('../../rbac/infrastructure/repositories/rbac.repository.js', () => ({
  rbacRepository: {
    getUserRoles: vi.fn(async () => []),
    getUserPermissionKeys: vi.fn(async () => []),
  },
}));
vi.mock('../infrastructure/repositories/booking-series.repository.js', () => ({
  bookingSeriesRepository: {},
  weekdayNumbersToSet: vi.fn(() => new Set()),
  weekdaySetToNumbers: vi.fn(() => []),
}));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit: mocks.emit } }));
vi.mock('../../../shared/command/command-pipeline.js', () => ({ commandPipeline: { execute: mocks.commandExecute } }));
vi.mock('../../../shared/utils/feature-flags.js', () => ({
  isFeatureEnabled: vi.fn(() => state.featureFlag),
  setFeatureFlag: vi.fn(),
}));
vi.mock('../../notifications/application/scheduler.service.js', () => ({
  scheduleBookingReminder: vi.fn(async () => undefined),
}));
vi.mock('../../financial/application/tax-resolution.service.js', () => ({
  taxResolution: {
    resolveOrgTaxRate: vi.fn(async () => ({ rate: 0, rateId: null, treatment: 'zero_rated' })),
    calculateTax: vi.fn(() => ({ taxRate: 0, taxRateId: null, taxAmount: 0, treatment: 'zero_rated' })),
  },
}));

import { BookingService } from '../application/booking.service.js';

const bookingService = new BookingService();

const PLAYER_ID = 555;
const ADMIN_ID = 1;
const BOOKING_ID = 59292;

const BOOKING = {
  id: BOOKING_ID,
  user_id: PLAYER_ID,
  organisation_id: 77,
  branch_id: 7,
  resource_id: 9,
  booking_status: 'confirmed',
  payment_status: 'pending',
  payment_method: 'cash',
  total_amount: 50,
  tax_amount: 0,
  coach_amount: 0,
  club_amount: 50,
  commission_amount: 0,
  aggregate_version: 1,
};

const EXPECTED_PAID_PAYLOAD = {
  bookingId: BOOKING_ID,
  userId: PLAYER_ID,
  organisationId: 77,
  grossAmount: 50,
  taxAmount: 0,
  coachAmount: 0,
  organisationAmount: 50,
  commissionAmount: 0,
  paymentMethod: 'cod',
  currency: 'EGP',
  sourceId: BOOKING_ID,
};

/**
 * Evaluates the predicates the REAL claim SQL must contain against a booking
 * state. Throws if a required predicate is missing, so a future broadening of
 * the SQL fails these tests instead of silently passing.
 */
function sqlAppliesToState(sql: string, booking: any): boolean {
  if (!booking) return false;
  const normalized = sql.replace(/\s+/g, ' ');

  const paymentPredicate = normalized.match(/AND payment_status = '([^']+)'/);
  if (!paymentPredicate) {
    throw new Error(`claim SQL is missing the payment_status predicate: ${normalized}`);
  }
  if ((booking.payment_status ?? null) !== paymentPredicate[1]) return false;

  const bookingPredicate = normalized.match(/AND booking_status IN \(([^)]+)\)/);
  if (!bookingPredicate) {
    throw new Error(`claim SQL is missing the booking_status predicate: ${normalized}`);
  }
  const allowedBookingStatuses = bookingPredicate[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''));

  return allowedBookingStatuses.includes(String(booking.booking_status));
}

function makeClaimConn() {
  return {
    execute: async (sql: string, params: any[]) => {
      const applies =
        !!state.booking &&
        params.length === 1 &&
        params[0] === state.booking.id &&
        sqlAppliesToState(sql, state.booking);
      // Model the UPDATE so a second concurrent claim observes the new state.
      if (applies) state.booking.payment_status = 'paid';
      return [{ affectedRows: applies ? 1 : 0 }];
    },
  } as any;
}

let realClaimRepo: any;

beforeAll(async () => {
  const actual = await vi.importActual<any>('../infrastructure/repositories/booking.repository.js');
  realClaimRepo = new actual.BookingRepository();
});

function bookingDateInWindow(): string {
  return new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function createInput() {
  return {
    branchId: 7,
    resourceId: 9,
    bookingType: 'private_match',
    bookingDate: bookingDateInWindow(),
    startTime: '10:00',
    endTime: '11:00',
    paymentMethod: 'cash',
  } as any;
}

function paidCalls(): any[][] {
  return mocks.emit.mock.calls.filter((c: any[]) => c[0] === 'booking:paid');
}

beforeEach(() => {
  vi.clearAllMocks();
  state.featureFlag = true;
  state.confirmFails = false;
  state.booking = { ...BOOKING };
  state.createArgs = null;
  state.confirmPayload = null;
  state.claimResults = [];
  mocks.failCommit = false;

  mocks.findById.mockImplementation(async () => state.booking);
  mocks.canAccessOrganisation.mockResolvedValue(true);
  mocks.persistPaymentStatus.mockResolvedValue(undefined);
  mocks.persistTransition.mockResolvedValue(undefined);
  mocks.checkSlotAvailability.mockResolvedValue(true);
  mocks.createBookingRow.mockImplementation(async (data: any) => {
    state.createArgs = data;
    return BOOKING_ID;
  });
  mocks.emit.mockResolvedValue(undefined);
  mocks.pool.execute.mockResolvedValue([
    [{ id: 7, organisation_id: 77, timezone: 'Africa/Cairo', opening_time: '08:00', closing_time: '22:00' }],
    [],
  ]);
  mocks.conn.execute.mockResolvedValue([{ insertId: 1 }]);

  // The mocked repository method delegates to the REAL repository SQL, evaluated
  // against the current booking state by makeClaimConn().
  mocks.claimPaidStatus.mockImplementation(async (id: number) => {
    const won = await realClaimRepo.claimPaidStatus(id, makeClaimConn());
    state.claimResults.push(won);
    return won;
  });

  // Emulate the real command pipeline: execute the handler, then publish the
  // handler's domain events with their envelope context.
  mocks.commandExecute.mockImplementation(async (command: any, handler: any) => {
    if (command.commandType === 'ConfirmBooking') {
      state.confirmPayload = command.payload;
      if (state.confirmFails) throw new Error('confirm failed');
    }
    const data = await handler.execute(command, mocks.conn);
    const events = handler.events ? handler.events(command, data) : [];
    for (const event of events) {
      await mocks.emit(event.eventName, event.payload, event.context);
    }
    return { status: 'processed', data };
  });
});

describe('claimPaidStatus SQL contract (real repository)', () => {
  it('uses the approved predicate and passes the booking id', async () => {
    let captured: any;
    const conn = {
      execute: async (sql: string, params: any[]) => {
        captured = { sql, params };
        return [{ affectedRows: 1 }];
      },
    };

    await expect(realClaimRepo.claimPaidStatus(42, conn)).resolves.toBe(true);

    const sql = captured.sql.replace(/\s+/g, ' ');
    expect(sql).toContain("SET payment_status = 'paid'");
    expect(sql).toContain('WHERE id = ?');
    expect(sql).toContain("AND payment_status = 'pending'");
    expect(sql).toContain("AND booking_status IN ('confirmed', 'checked_in', 'completed')");
    // The historical broad predicates must be gone.
    expect(sql).not.toContain("payment_status <> 'paid'");
    expect(sql).not.toContain('payment_status IS NULL');
    expect(captured.params).toEqual([42]);
  });

  it('returns false when the UPDATE matches no row', async () => {
    const conn = { execute: async () => [{ affectedRows: 0 }] };
    await expect(realClaimRepo.claimPaidStatus(42, conn)).resolves.toBe(false);
  });

  it.each([
    ['pending', 'confirmed', true],
    ['pending', 'checked_in', true],
    ['pending', 'completed', true],
    ['paid', 'confirmed', false],
    ['refunded', 'confirmed', false],
    ['partially_refunded', 'confirmed', false],
    ['failed', 'confirmed', false],
    ['penalty', 'confirmed', false],
    [null, 'confirmed', false],
    ['pending', 'cancelled', false],
    ['pending', 'expired', false],
    ['pending', 'no_show', false],
  ])('payment_status=%s booking_status=%s => claim=%s', async (paymentStatus, bookingStatus, expected) => {
    const booking = { id: 42, payment_status: paymentStatus, booking_status: bookingStatus };
    const conn = {
      execute: async (sql: string, params: any[]) => {
        const applies = params[0] === booking.id && sqlAppliesToState(sql, booking);
        return [{ affectedRows: applies ? 1 : 0 }];
      },
    };

    await expect(realClaimRepo.claimPaidStatus(42, conn)).resolves.toBe(expected);
  });

  it('missing booking (no row) is not a claim', async () => {
    const conn = { execute: async () => [{ affectedRows: 0 }] };
    await expect(realClaimRepo.claimPaidStatus(999, conn)).resolves.toBe(false);
  });
});

describe('booking:paid is never published at booking creation', () => {
  it('V2 cash creation: confirmed + pending, publishes booking:confirmed but no booking:paid', async () => {
    state.featureFlag = true;
    state.booking.booking_status = 'pending';
    state.booking.payment_status = 'pending';

    const result = await bookingService.createBooking(createInput(), PLAYER_ID);

    expect(result.id).toBe(BOOKING_ID);
    // Confirmation ran, and it did not ask the command to mark the booking paid.
    expect(state.confirmPayload).toEqual({ bookingId: BOOKING_ID });
    expect(mocks.persistTransition).toHaveBeenCalledTimes(1);
    const transitionArgs = mocks.persistTransition.mock.calls[0];
    expect(transitionArgs[0]).toBe(BOOKING_ID);
    expect(transitionArgs[1]).toBe('confirmed');
    expect(transitionArgs[2]).toBeUndefined(); // no paymentStatus → stays pending
    // The persisted booking row keeps the cash lifecycle: confirmed + pending.
    expect(state.createArgs.bookingStatus).toBe('pending'); // create command inserts pending, then confirms
    expect(state.createArgs.paymentStatus).toBe('pending');

    const names = mocks.emit.mock.calls.map((c: any[]) => c[0]);
    expect(names).toContain('booking:created');
    expect(names).toContain('booking:confirmed');
    expect(paidCalls()).toHaveLength(0);
    expect(mocks.claimPaidStatus).not.toHaveBeenCalled();
  });

  it('V1 cash creation: confirmed + pending, publishes booking:confirmed but no booking:paid', async () => {
    state.featureFlag = false;
    state.booking.booking_status = 'confirmed';
    state.booking.payment_status = 'pending';

    const result = await bookingService.createBooking(createInput(), PLAYER_ID);

    expect(result.id).toBe(BOOKING_ID);
    expect(state.createArgs.bookingStatus).toBe('confirmed');
    expect(state.createArgs.paymentStatus).toBe('pending');

    const names = mocks.emit.mock.calls.map((c: any[]) => c[0]);
    expect(names).toContain('booking:created');
    expect(names).toContain('booking:confirmed');
    expect(paidCalls()).toHaveLength(0);
    expect(mocks.claimPaidStatus).not.toHaveBeenCalled();

    // Creation events now carry the canonical booking aggregate context.
    const confirmedCall = mocks.emit.mock.calls.find((c: any[]) => c[0] === 'booking:confirmed');
    expect(confirmedCall?.[2]).toEqual({
      aggregateType: 'booking',
      aggregateId: String(BOOKING_ID),
      actorId: PLAYER_ID,
    });
  });
});

describe('atomic paid collection claim', () => {
  it('first pending → paid claim persists paid and emits exactly one booking:paid', async () => {
    await bookingService.updatePaymentStatus(BOOKING_ID, 'paid', ADMIN_ID);

    // The claim runs on the transaction connection, never the unconditional write.
    expect(mocks.claimPaidStatus).toHaveBeenCalledWith(BOOKING_ID, mocks.conn);
    expect(mocks.persistPaymentStatus).not.toHaveBeenCalled();
    expect(mocks.claimPaidStatus.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.emit.mock.invocationCallOrder[0]);
    expect(state.booking.payment_status).toBe('paid');

    const calls = paidCalls();
    expect(calls).toHaveLength(1);
    // Accounting payload must remain byte-for-byte compatible.
    expect(calls[0][1]).toEqual(EXPECTED_PAID_PAYLOAD);
    // Canonical aggregate context + the SAME transaction connection.
    expect(calls[0][2]).toEqual({
      aggregateType: 'booking',
      aggregateId: String(BOOKING_ID),
      actorId: ADMIN_ID,
    });
    expect(calls[0][3]).toBe(mocks.conn);
  });

  it.each(['checked_in', 'completed'])('pending + %s is a collectible state', async (bookingStatus) => {
    state.booking.booking_status = bookingStatus;

    await bookingService.updatePaymentStatus(BOOKING_ID, 'paid', ADMIN_ID);

    expect(paidCalls()).toHaveLength(1);
    expect(state.booking.payment_status).toBe('paid');
  });

  it('a second update after paid is a no-op and publishes nothing', async () => {
    state.booking.payment_status = 'paid';

    await bookingService.updatePaymentStatus(BOOKING_ID, 'paid', ADMIN_ID);

    expect(mocks.claimPaidStatus).not.toHaveBeenCalled();
    expect(mocks.persistPaymentStatus).not.toHaveBeenCalled();
    expect(paidCalls()).toHaveLength(0);
  });

  it('concurrent requests: exactly one claim wins and exactly one event is published', async () => {
    await Promise.all([
      bookingService.updatePaymentStatus(BOOKING_ID, 'paid', ADMIN_ID),
      bookingService.updatePaymentStatus(BOOKING_ID, 'paid', ADMIN_ID),
    ]);

    // Both reached the claim; only one observed affectedRows = 1.
    expect(state.claimResults).toHaveLength(2);
    expect(state.claimResults.filter(Boolean)).toHaveLength(1);
    expect(paidCalls()).toHaveLength(1);
    expect(state.booking.payment_status).toBe('paid');
  });

  it('a losing claim (already paid by a concurrent request) publishes nothing', async () => {
    // Simulate the stale read: this request saw pending, then lost the claim.
    mocks.claimPaidStatus.mockImplementationOnce(async () => {
      state.booking.payment_status = 'paid';
      state.claimResults.push(false);
      return false;
    });

    await bookingService.updatePaymentStatus(BOOKING_ID, 'paid', ADMIN_ID);

    expect(state.claimResults).toEqual([false]);
    expect(paidCalls()).toHaveLength(0);
    expect(mocks.persistPaymentStatus).not.toHaveBeenCalled();
  });

  it('a failed claim on a non-paid row throws and never publishes', async () => {
    mocks.claimPaidStatus.mockImplementationOnce(async () => false);

    await expect(bookingService.updatePaymentStatus(BOOKING_ID, 'paid', ADMIN_ID))
      .rejects.toThrow(/could not be claimed/i);

    expect(paidCalls()).toHaveLength(0);
  });

  it.each([
    ['refunded', 'confirmed'],
    ['partially_refunded', 'confirmed'],
    ['failed', 'confirmed'],
    ['penalty', 'confirmed'],
    ['pending', 'cancelled'],
    ['pending', 'expired'],
    ['pending', 'no_show'],
  ])('invalid source state payment_status=%s booking_status=%s never publishes', async (paymentStatus, bookingStatus) => {
    state.booking = { ...BOOKING, payment_status: paymentStatus, booking_status: bookingStatus };

    await expect(bookingService.updatePaymentStatus(BOOKING_ID, 'paid', ADMIN_ID))
      .rejects.toThrow(/could not be claimed/i);

    expect(paidCalls()).toHaveLength(0);
    expect(state.booking.payment_status).toBe(paymentStatus);
  });

  it('NULL payment_status + confirmed never publishes', async () => {
    state.booking = { ...BOOKING, payment_status: null, booking_status: 'confirmed' };

    await expect(bookingService.updatePaymentStatus(BOOKING_ID, 'paid', ADMIN_ID))
      .rejects.toThrow(/could not be claimed/i);

    expect(paidCalls()).toHaveLength(0);
  });

  it('paid + confirmed is an idempotent success with no event', async () => {
    state.booking = { ...BOOKING, payment_status: 'paid', booking_status: 'confirmed' };

    await bookingService.updatePaymentStatus(BOOKING_ID, 'paid', ADMIN_ID);

    expect(paidCalls()).toHaveLength(0);
    expect(mocks.persistPaymentStatus).not.toHaveBeenCalled();
  });

  it('event insertion failure rolls back the payment claim (no paid without its event)', async () => {
    mocks.emit.mockRejectedValueOnce(new Error('event insert failed'));

    await expect(bookingService.updatePaymentStatus(BOOKING_ID, 'paid', ADMIN_ID))
      .rejects.toThrow('event insert failed');

    expect(mocks.claimPaidStatus).toHaveBeenCalled();
    expect(mocks.conn.rollback).toHaveBeenCalled();
    expect(mocks.conn.commit).not.toHaveBeenCalled();
    expect(state.booking.payment_status).toBe('pending');
  });

  it('transaction commit failure does not leave the booking paid without its event', async () => {
    mocks.failCommit = true;

    await expect(bookingService.updatePaymentStatus(BOOKING_ID, 'paid', ADMIN_ID))
      .rejects.toThrow('commit failed');

    expect(mocks.conn.commit).not.toHaveBeenCalled();
    expect(mocks.conn.rollback).toHaveBeenCalled();
    expect(state.booking.payment_status).toBe('pending');
  });

  it('never claims/publishes for non-cash (gateway) bookings', async () => {
    state.booking.payment_method = 'card';

    await expect(bookingService.updatePaymentStatus(BOOKING_ID, 'paid', ADMIN_ID))
      .rejects.toThrow(/cash-on-delivery/i);

    expect(mocks.claimPaidStatus).not.toHaveBeenCalled();
    expect(mocks.persistPaymentStatus).not.toHaveBeenCalled();
    expect(paidCalls()).toHaveLength(0);
  });

  it('non-paid status updates keep the unconditional write and publish nothing', async () => {
    await bookingService.updatePaymentStatus(BOOKING_ID, 'failed', ADMIN_ID);

    expect(mocks.persistPaymentStatus).toHaveBeenCalledWith(BOOKING_ID, 'failed');
    expect(mocks.claimPaidStatus).not.toHaveBeenCalled();
    expect(paidCalls()).toHaveLength(0);
  });
});

describe('confirmation failure never publishes booking:paid', () => {
  it('V2 cash creation survives a failed confirmation without a payment event', async () => {
    state.featureFlag = true;
    state.booking.booking_status = 'pending';
    state.booking.payment_status = 'pending';
    state.confirmFails = true;

    const result = await bookingService.createBooking(createInput(), PLAYER_ID);

    expect(result.bookingId).toBe(BOOKING_ID);
    expect(paidCalls()).toHaveLength(0);
    // The failed confirm published nothing: no booking:confirmed either.
    const names = mocks.emit.mock.calls.map((c: any[]) => c[0]);
    expect(names).not.toContain('booking:confirmed');
  });
});
