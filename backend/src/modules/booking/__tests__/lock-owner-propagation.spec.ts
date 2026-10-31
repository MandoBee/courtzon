import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P8.7.14.32 — K3 owner-propagation contract.
 *
 * Proves at the behaviour level that the SAME per-acquisition lockOwner token is
 * handed to the acquire call and to the matching release call in all three
 * lock-using services. The Redis lock module is mocked with a deterministic
 * `createLockOwner`, so an owner mismatch would be visible immediately.
 *
 * No database, no Redis, no network: `getPool()` and every repository/service
 * that the exercised paths touch are mocked. Each scenario forces a failure
 * AFTER the lock is acquired so the release path (catch/finally) runs.
 *
 * The legacy `createBooking` court-lock path is intentionally not exercised:
 * `BOOKING_V2_CREATE` is permanently enabled (feature-flags.ts), so
 * `createBooking` always delegates to `createBookingV2` and the legacy lock is
 * unreachable in production. `prepareGatewayBooking` (live card-prepare path)
 * is covered instead.
 */

const h = vi.hoisted(() => ({
  acquireAll: vi.fn(),
  acquireAllForPrepare: vi.fn(),
  acquireCoach: vi.fn(),
  releaseAll: vi.fn(),
  releaseCoach: vi.fn(),
  execute: vi.fn(),
  getConnection: vi.fn(),
  checkSlotAvailability: vi.fn(),
  findMatchBookingId: vi.fn(),
  findResource: vi.fn(),
  findCoach: vi.fn(),
  getBranchCoachPolicy: vi.fn(),
  isCoachEligible: vi.fn(),
  getBranchOrganisationId: vi.fn(),
  commissionCalculate: vi.fn(),
  priceCalculate: vi.fn(),
}));

vi.mock('../infrastructure/redis/redis-lock.js', () => ({
  createLockOwner: (scope: string) => `${scope}:test-token`,
  redisLock: {
    acquire: vi.fn(),
    release: vi.fn(),
    acquireCoach: h.acquireCoach,
    releaseCoach: h.releaseCoach,
    acquireForPrepare: vi.fn(),
    acquireAllForPrepare: h.acquireAllForPrepare,
    acquireAll: h.acquireAll,
    releaseAll: h.releaseAll,
  },
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: h.execute, query: h.execute, getConnection: h.getConnection }),
  createPool: vi.fn(),
  closePool: vi.fn(),
}));

vi.mock('../../../infrastructure/redis/redis.client.js', () => ({
  getRedisClient: () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn(), eval: vi.fn() }),
}));

vi.mock('../../../shared/utils/logger.js', () => ({
  createModuleLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(),
  }),
}));

vi.mock('../../rbac/infrastructure/repositories/rbac.repository.js', () => ({
  rbacRepository: {
    // Platform admin -> booking-window bypass, keeping the test date deterministic.
    getUserRoles: async () => [{ role_slug: 'super_admin' }],
    getUserPermissionKeys: async () => [],
  },
}));

vi.mock('../../organisations/infrastructure/repositories/resource.repository.js', () => ({
  resourceRepository: { findById: h.findResource },
}));

vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  bookingRepository: {
    checkSlotAvailability: h.checkSlotAvailability,
    findById: vi.fn(),
    persistTransition: vi.fn(),
  },
}));

vi.mock('../infrastructure/repositories/court-reservation.repository.js', () => ({
  courtReservationRepository: {
    findMatchBookingId: h.findMatchBookingId,
    insertBookingSlots: vi.fn(),
    linkMatchBooking: vi.fn(),
    releaseTournamentBooking: vi.fn(),
    clearMatchBooking: vi.fn(),
  },
}));

vi.mock('../../activities/infrastructure/repositories/activities.repository.js', () => ({
  activitiesRepository: {
    findCoachById: h.findCoach,
    getBranchCoachPolicy: h.getBranchCoachPolicy,
    isCoachEligibleAtBranch: h.isCoachEligible,
    getBranchOrganisationId: h.getBranchOrganisationId,
    createCoachSession: vi.fn(),
    getAcceptedAgreement: vi.fn(),
  },
}));

vi.mock('../../financial/application/commission.service.js', () => ({
  commissionService: { calculate: h.commissionCalculate },
}));

vi.mock('../domain/pricing-engine.js', () => ({
  pricingEngine: { calculatePrice: h.priceCalculate },
  PricingEngine: class {},
}));

vi.mock('../../financial/application/tax-resolution.service.js', () => ({
  taxResolution: {
    resolveOrgTaxRate: async () => ({ rate: 0 }),
    calculateTax: () => ({ taxRate: 0, taxRateId: null, taxAmount: 0, treatment: 'taxable' }),
  },
}));

import { bookingService } from '../application/booking.service.js';
import { courtReservationService } from '../application/court-reservation.service.js';
import { schedulingBookingService } from '../../scheduling/application/scheduling-booking.service.js';

const D = '2027-03-15';

beforeEach(() => {
  vi.clearAllMocks();
  h.acquireAll.mockResolvedValue(true);
  h.acquireAllForPrepare.mockResolvedValue(true);
  h.acquireCoach.mockResolvedValue(true);
  h.releaseAll.mockResolvedValue(undefined);
  h.releaseCoach.mockResolvedValue(undefined);
  h.priceCalculate.mockResolvedValue({ totalPrice: 100 });
  h.commissionCalculate.mockResolvedValue({ commissionAmount: 0, netAmount: 100, rate: 0 });
  h.findResource.mockResolvedValue({
    opening_time: '08:00', closing_time: '22:00', slot_duration: 60,
    is_active: 1, branch_id: 6, sport_id: 1,
  });
  h.findCoach.mockResolvedValue({ id: 9, hourly_rate: 100, sports: '[1]', currency_code: 'EGP' });
  h.getBranchCoachPolicy.mockResolvedValue('independent_coaches_allowed');
  h.isCoachEligible.mockResolvedValue({ eligible: true });
  h.getBranchOrganisationId.mockResolvedValue(6);
  h.checkSlotAvailability.mockResolvedValue(true);
});

describe('K3 lock owner propagation — booking prepare (<service>.prepareGatewayBooking)', () => {
  it('releases the prepare lock with the exact token used to acquire it', async () => {
    h.execute.mockResolvedValueOnce([[
      { organisation_id: 6, timezone: 'Africa/Cairo', opening_time: '08:00', closing_time: '22:00' },
    ]]);
    h.checkSlotAvailability.mockRejectedValueOnce(new Error('slot check failed'));

    await expect(
      bookingService.prepareGatewayBooking({
        branchId: 6,
        resourceId: 5,
        bookingDate: D,
        startTime: '10:00',
        endTime: '11:00',
        paymentMethod: 'card',
        bookingType: 'public_match',
        returnUrl: 'http://localhost/return',
      } as any, 42),
    ).rejects.toThrow('slot check failed');

    expect(h.acquireAllForPrepare).toHaveBeenCalledTimes(1);
    expect(h.releaseAll).toHaveBeenCalledTimes(1);

    const acquiredOwner = h.acquireAllForPrepare.mock.calls[0][1];
    const releasedOwner = h.releaseAll.mock.calls[0][1];

    expect(acquiredOwner).toBe('user:42:test-token');
    expect(releasedOwner).toBe(acquiredOwner);
  });
});

describe('K3 lock owner propagation — tournament court reservation', () => {
  it('releases the slot locks with the exact token used to acquire them', async () => {
    h.findMatchBookingId.mockResolvedValueOnce(null);
    const conn = {
      beginTransaction: vi.fn().mockRejectedValue(new Error('tx failed')),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      query: vi.fn(),
    };
    h.getConnection.mockResolvedValueOnce(conn);

    await expect(
      courtReservationService.reserveCourt({
        userId: 42,
        organisationId: 6,
        branchId: 6,
        resourceId: 5,
        date: D,
        startTime: '10:00',
        endTime: '11:00',
        startAtUtc: '2027-03-15T08:00:00Z',
        endAtUtc: '2027-03-15T09:00:00Z',
        matchId: 7,
      } as any),
    ).rejects.toThrow('tx failed');

    expect(h.acquireAll).toHaveBeenCalledTimes(1);
    expect(h.releaseAll).toHaveBeenCalledTimes(1);

    const acquiredOwner = h.acquireAll.mock.calls[0][1];
    const releasedOwner = h.releaseAll.mock.calls[0][1];

    expect(acquiredOwner).toBe('tournament:42:7:test-token');
    expect(releasedOwner).toBe(acquiredOwner);
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

describe('K3 lock owner propagation — coach scheduling', () => {
  it('releases the coach lock with the exact token used to acquire it', async () => {
    // checkCoachAvailable() sees an overlapping session -> ConflictError after
    // the coach lock is taken, so the finally-block release runs.
    h.execute.mockResolvedValueOnce([[{ id: 1 }]]);

    await expect(
      schedulingBookingService.bookSession({
        coachId: 9,
        resourceId: 5,
        date: D,
        startTime: '10:00',
        endTime: '11:00',
      } as any, 42),
    ).rejects.toThrow('Coach is no longer available');

    expect(h.acquireCoach).toHaveBeenCalledTimes(1);
    expect(h.releaseCoach).toHaveBeenCalledTimes(1);

    const acquiredOwner = h.acquireCoach.mock.calls[0][3];
    const releasedOwner = h.releaseCoach.mock.calls[0][3];

    expect(acquiredOwner).toBe('scheduling:42:test-token');
    expect(releasedOwner).toBe(acquiredOwner);
  });
});
