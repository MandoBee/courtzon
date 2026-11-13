// ============================================================================
// LAYER B — booking refund settlement-reservation preflight.
//
// Unit-only: every DB/queue/gateway dependency is mocked. Proves the preflight
// runs BEFORE the booking cancel transition and BEFORE any refund/reversal
// side effect, and that a reserved booking rejects the whole operation.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  commandExecute: vi.fn(async () => ({ status: 'ok', data: {} })),
  poolExecute: vi.fn(async () => [[{ paid: 0 }], []]),
  emit: vi.fn(),
  preflight: vi.fn(async () => undefined),
  refund: vi.fn(async () => ({ success: true })),
  canAccessOrg: vi.fn(async () => true),
  canAccessBranch: vi.fn(async () => false),
}));

const pool = {
  execute: mocks.poolExecute,
  query: mocks.poolExecute,
  getConnection: vi.fn(async () => ({
    execute: mocks.poolExecute,
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  })),
};

vi.mock('../../../config/env.js', () => ({
  env: { NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: 3306, DB_USER: 'root', DB_PASSWORD: 'test', DB_NAME: 'courtzon_test', REDIS_HOST: '127.0.0.1', REDIS_PORT: 6379, REDIS_DB: 0 },
}));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../../database/database.transaction.js', () => ({
  withTransaction: async (fn: any) => fn(await pool.getConnection()),
  runProvidedTransaction: async (_c: any, fn: any) => fn(),
  isInTransaction: () => false,
  onAfterCommit: (hook: any) => { void hook(); },
}));
vi.mock('../../../infrastructure/redis/redis.client.js', () => ({
  getRedisClient: () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), expire: vi.fn(), on: vi.fn(), quit: vi.fn() }),
  closeRedisClient: vi.fn(),
}));
vi.mock('../infrastructure/redis/redis-lock.js', () => ({
  redisLock: { acquireAll: vi.fn(async () => true), releaseAll: vi.fn(async () => undefined) },
  createLockOwner: vi.fn(() => 'test-owner'),
}));
vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  bookingRepository: {
    findById: mocks.findById,
    canAccessOrganisation: mocks.canAccessOrg,
    persistPaymentStatus: vi.fn(),
    claimPaidStatus: vi.fn(),
    persistTransition: vi.fn(),
    checkSlotAvailability: vi.fn(),
    create: vi.fn(),
    createMatchmakingRequest: vi.fn(),
  },
}));
vi.mock('../domain/pricing-engine.js', () => ({ pricingEngine: { calculatePrice: vi.fn() }, PricingEngine: class {} }));
vi.mock('../../financial/application/commission.service.js', () => ({ commissionService: { calculate: vi.fn() } }));
vi.mock('../../financial/application/transaction.service.js', () => ({ transactionService: {} }));
vi.mock('../../financial/infrastructure/transaction.repository.js', () => ({ transactionRepository: {} }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: {} }));
vi.mock('../../organisations/infrastructure/repositories/resource.repository.js', () => ({ resourceRepository: { findById: vi.fn() } }));
vi.mock('../../rbac/infrastructure/repositories/rbac.repository.js', () => ({ rbacRepository: { getUserRoles: vi.fn(async () => []), getUserPermissionKeys: vi.fn(async () => []) } }));
vi.mock('../infrastructure/repositories/booking-series.repository.js', () => ({
  bookingSeriesRepository: {},
  weekdayNumbersToSet: vi.fn(() => new Set()),
  weekdaySetToNumbers: vi.fn(() => []),
}));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit: mocks.emit } }));
vi.mock('../../../shared/middleware/org-access.js', () => ({
  canAccessBranch: mocks.canAccessBranch,
  canAccessOrganisation: mocks.canAccessOrg,
  isPlatformAdmin: vi.fn(async () => false),
  findAccessibleOrgIds: vi.fn(async () => []),
}));
vi.mock('../../../shared/command/command-pipeline.js', () => ({ commandPipeline: { execute: mocks.commandExecute } }));
vi.mock('../../../shared/utils/feature-flags.js', () => ({ isFeatureEnabled: vi.fn(() => false), setFeatureFlag: vi.fn() }));
vi.mock('../../notifications/application/scheduler.service.js', () => ({ scheduleBookingReminder: vi.fn(async () => undefined) }));
vi.mock('../../financial/application/tax-resolution.service.js', () => ({
  taxResolution: { resolveOrgTaxRate: vi.fn(async () => ({ rate: 0, rateId: null, treatment: 'zero_rated' })), calculateTax: vi.fn(() => ({ taxRate: 0, taxRateId: null, taxAmount: 0, treatment: 'zero_rated' })) },
}));
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService: { refund: mocks.refund, charge: vi.fn() } }));
vi.mock('../../financial/application/financial-entitlement.service.js', () => ({
  financialEntitlementService: { assertNoActiveSettlementReservation: mocks.preflight },
}));

const { BookingService } = await import('../application/booking.service.js');
const bookingService = new BookingService();

const BOOKING = {
  id: 501,
  user_id: 77,
  organisation_id: 7,
  branch_id: 3,
  booking_status: 'confirmed',
  payment_status: 'paid',
  payment_method: 'card',
  total_amount: 300,
  tax_amount: 0,
  series_id: null,
};

const Conflict = async () => (await import('../../../shared/errors/app-error.js')).ConflictError;

describe('LAYER B — booking refund settlement-reservation preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preflight.mockReset().mockResolvedValue(undefined);
    mocks.findById.mockResolvedValue({ ...BOOKING });
    mocks.commandExecute.mockResolvedValue({ status: 'ok', data: {} });
    mocks.poolExecute.mockImplementation(async (sql: any) => {
      // _resolveBookingPaidAmount has no captured payment; the wallet fallback
      // lookup finds no debit row → no money moved (no refund side effect).
      if (typeof sql === 'string' && sql.includes('wallet_transactions')) return [[], []] as any;
      return [[{ paid: 0 }], []] as any;
    });
  });

  it('runs the preflight with the canonical booking source before any cancel/refund', async () => {
    const result = await bookingService.cancelBookingByProvider(501, 900, 'provider cancel');

    expect(mocks.preflight).toHaveBeenCalledWith('booking', [501]);
    expect(mocks.commandExecute).toHaveBeenCalled();
    // no captured money → no gateway refund (existing behavior preserved)
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(result).toMatchObject({ cancelled: true, refunded: false });
  });

  it('blocks the provider full refund before the cancel command when reserved', async () => {
    const ConflictError = await Conflict();
    mocks.preflight.mockRejectedValueOnce(new ConflictError('Refund blocked: entitlement 9 is reserved by settlement 91'));

    await expect(bookingService.cancelBookingByProvider(501, 900, 'provider cancel')).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(mocks.commandExecute).not.toHaveBeenCalled();
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it('blocks an admin/player cancellation refund before the cancel command when reserved', async () => {
    const ConflictError = await Conflict();
    mocks.preflight.mockRejectedValueOnce(new ConflictError('Refund blocked: entitlement 9 is reserved by settlement 91'));
    const spy = vi.spyOn(bookingService as any, '_calculateCancellationFee').mockResolvedValue({ feeAmount: 0, refundAmount: 300 });

    await expect(bookingService.updateBookingStatus(501, 'cancelled', 900)).rejects.toMatchObject({ statusCode: 409 });

    expect(spy).toHaveBeenCalled();
    expect(mocks.commandExecute).not.toHaveBeenCalled();
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it('orders preflight strictly before the cancel command', async () => {
    const sequence: string[] = [];
    mocks.preflight.mockImplementationOnce(async () => {
      sequence.push('preflight');
    });
    mocks.commandExecute.mockImplementationOnce(async () => {
      sequence.push('cancel-command');
      return { status: 'ok', data: {} };
    });

    await bookingService.cancelBookingByProvider(501, 900, 'provider cancel');
    expect(sequence).toEqual(['preflight', 'cancel-command']);
  });

  it('has no HTTP-user dependency (provider/saga callers synthesize actorId)', async () => {
    await bookingService.cancelBookingByProvider(501, 900, 'provider cancel');
    expect(mocks.preflight).toHaveBeenCalledTimes(1);
  });

  it('does not run the preflight for a cancelled booking (existing no-op preserved)', async () => {
    mocks.findById.mockResolvedValue({ ...BOOKING, booking_status: 'cancelled' });
    const result = await bookingService.cancelBookingByProvider(501, 900, 'again');
    expect(result).toEqual({ cancelled: false, refunded: false, refundAmount: 0 });
    expect(mocks.preflight).not.toHaveBeenCalled();
  });
});

describe('cancelForRefund — operational staff authorization and single bookings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue({ ...BOOKING });
    mocks.commandExecute.mockResolvedValue({ status: 'ok', data: {} });
    mocks.preflight.mockResolvedValue(undefined);
    mocks.canAccessOrg.mockResolvedValue(true);
    mocks.canAccessBranch.mockResolvedValue(false);
  });

  it('allows authorized staff to cancel a single (non-series) booking', async () => {
    vi.spyOn(bookingService, 'canBypassPlayerBookingWindow').mockResolvedValue(true);

    await bookingService.cancelForRefund(501, 900, 'institution refund');

    expect(mocks.commandExecute).toHaveBeenCalledTimes(1);
    expect(mocks.preflight).toHaveBeenCalledWith('booking', [501]);
  });

  it('rejects staff without the cancellation capability', async () => {
    vi.spyOn(bookingService, 'canBypassPlayerBookingWindow').mockResolvedValue(false);

    await expect(
      bookingService.cancelForRefund(501, 900, 'institution refund'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.commandExecute).not.toHaveBeenCalled();
  });

  it('rejects cross-organisation staff even with the capability', async () => {
    vi.spyOn(bookingService, 'canBypassPlayerBookingWindow').mockResolvedValue(true);
    mocks.canAccessOrg.mockResolvedValue(false);
    mocks.canAccessBranch.mockResolvedValue(false);

    await expect(
      bookingService.cancelForRefund(501, 900, 'institution refund'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.commandExecute).not.toHaveBeenCalled();
  });

  it('allows a player to cancel their own booking under the existing window rules', async () => {
    mocks.findById.mockResolvedValue({ ...BOOKING, user_id: 900 });
    vi.spyOn(bookingService as any, '_canUserCancel').mockResolvedValue(true);

    await bookingService.cancelForRefund(501, 900, 'player cancel');

    expect(mocks.commandExecute).toHaveBeenCalledTimes(1);
  });

  it('keeps the established series booking path working for staff', async () => {
    mocks.findById.mockResolvedValue({ ...BOOKING, series_id: 44 });
    vi.spyOn(bookingService, 'canBypassPlayerBookingWindow').mockResolvedValue(true);

    await bookingService.cancelForRefund(501, 900, 'series refund');

    expect(mocks.commandExecute).toHaveBeenCalledTimes(1);
  });
});
