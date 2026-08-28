import { describe, it, expect, vi } from 'vitest';

/**
 * Finding 6 — entitlement creation must never silently skip a confirmed booking.
 *
 * handleBookingConfirmed previously wrapped commissionService.calculate in a
 * try/catch that logged and RETURNED. In BullMQ terms a handler that returns
 * normally counts as a success, so a transient commission calculation failure
 * permanently dropped the org earning + platform commission entitlements for an
 * already-confirmed, already-paid booking — money that vanishes from settlement.
 *
 * The fix rethrows so the BullMQ subscriber retries (6 attempts, exponential
 * backoff) and the outbox poller re-emits the event.
 */

const bookingRepo = vi.hoisted(() => ({ findById: vi.fn() }));
const commissionSvc = vi.hoisted(() => ({ calculate: vi.fn() }));
const entitlementSvc = vi.hoisted(() => ({ getEntitlementsBySource: vi.fn(), createEntitlements: vi.fn() }));
const eventBus = vi.hoisted(() => ({ emit: vi.fn(), on: vi.fn(), subscribe: vi.fn() }));

vi.mock('../../booking/infrastructure/repositories/booking.repository.js', () => ({ bookingRepository: bookingRepo }));
vi.mock('../application/commission.service.js', () => ({ commissionService: commissionSvc }));
vi.mock('../application/financial-entitlement.service.js', () => ({ financialEntitlementService: entitlementSvc }));
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ getConnection: vi.fn(async () => { throw new Error('pool must not be reached'); }) }),
}));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: eventBus }));
vi.mock('../../../shared/event-bus/subscriber.worker.js', () => ({ createSubscriberWorker: vi.fn() }));
vi.mock('../../../shared/utils/logger.js', () => ({
  createModuleLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

const { handleBookingConfirmed } = await import('../application/entitlement-booking.listener.js');

const booking = {
  id: 333,
  user_id: 1,
  organisation_id: 5,
  branch_id: 10,
  total_amount: 1000,
  tax_amount: 100,
  commission_amount: 200,
  club_amount: 800,
  payment_method: 'card',
  currency: 'EGP',
  booking_date: '2026-08-01',
  start_time: '10:00:00',
};

describe('Finding 6 — entitlement listener rethrows commission failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bookingRepo.findById.mockResolvedValue(booking);
    entitlementSvc.getEntitlementsBySource.mockResolvedValue([]);
  });

  it('rethrows when commission calculation fails so BullMQ can retry', async () => {
    commissionSvc.calculate.mockRejectedValue(new Error('commission engine down'));

    await expect(
      handleBookingConfirmed({ payload: { bookingId: 333 } } as any),
    ).rejects.toThrow('commission engine down');

    expect(commissionSvc.calculate).toHaveBeenCalledWith(5, 'booking', 1000);
  });

  it('still skips silently when entitlements already exist (idempotent skip preserved)', async () => {
    entitlementSvc.getEntitlementsBySource.mockResolvedValue([{ id: 1 }]);

    await expect(
      handleBookingConfirmed({ payload: { bookingId: 333 } } as any),
    ).resolves.toBeUndefined();
    expect(commissionSvc.calculate).not.toHaveBeenCalled();
  });
});