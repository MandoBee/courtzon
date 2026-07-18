import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

// ─── Mocks ───
const mockFindCoachById = vi.fn();
const mockCreateCoachSession = vi.fn();
const mockUpdateSessionBooking = vi.fn();
const mockAcquireCoach = vi.fn();
const mockReleaseCoach = vi.fn();
const mockCreateBooking = vi.fn();
const mockGetBooking = vi.fn();
const mockPoolExecute = vi.fn();
const mockGetConnection = vi.fn();
const mockConn = {
  execute: vi.fn().mockResolvedValue([{}]),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};

vi.mock('../../../database/mysql.js', () => ({
  getPool: vi.fn(() => ({ execute: mockPoolExecute, getConnection: mockGetConnection })),
}));

vi.mock('../../booking/infrastructure/repositories/booking.repository.js', () => ({
  bookingRepository: {
    findById: vi.fn().mockResolvedValue({
      id: 100, booking_status: 'confirmed', payment_status: 'paid',
      total_amount: 200, organisation_id: 1, branch_id: 5, user_id: 999,
      resource_id: 20, payment_method: 'card',
    }),
    persistTransition: vi.fn(),
    persistPaymentStatus: vi.fn(),
  },
}));

vi.mock('../../booking/application/booking.service.js', () => ({
  bookingService: { createBooking: mockCreateBooking, getBooking: mockGetBooking },
}));

vi.mock('../../../modules/financial/application/commission.service.js', () => ({
  CommissionService: class {},
  commissionService: { calculate: vi.fn().mockResolvedValue({ rate: 0.1, netAmount: 90 }) },
}));

vi.mock('../../organisations/infrastructure/repositories/resource.repository.js', () => ({
  resourceRepository: {
    findById: vi.fn().mockResolvedValue({ id: 20, branch_id: 5, organisation_id: 1, is_active: true }),
  },
}));

vi.mock('../../activities/infrastructure/repositories/activities.repository.js', () => ({
  activitiesRepository: {
    findCoachById: mockFindCoachById,
    createCoachSession: mockCreateCoachSession,
    updateSessionBooking: mockUpdateSessionBooking,
  },
}));

vi.mock('../../booking/infrastructure/redis/redis-lock.js', () => ({
  redisLock: { acquireCoach: mockAcquireCoach, releaseCoach: mockReleaseCoach },
}));

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('../../../shared/utils/logger.js', () => ({
  createModuleLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({
  walletRepository: { findByUserId: vi.fn(), lockAndGetBalance: vi.fn(), updateBalance: vi.fn() },
}));

vi.mock('../../financial/application/transaction.service.js', () => ({
  transactionService: { createRefund: vi.fn() },
}));

import { initBooking } from '../../../platform/booking/BookingSaga.js';

// ─── Helpers ───
function setupDefaults() {
  initBooking({
    findById: vi.fn().mockResolvedValue({
      id: 100, booking_status: 'confirmed', payment_status: 'paid',
      total_amount: 200, organisation_id: 1, branch_id: 5, user_id: 999,
      resource_id: 20, payment_method: 'card',
    }),
    persistTransition: vi.fn(),
    persistPaymentStatus: vi.fn(),
    releaseSlots: vi.fn(),
    lockSlots: vi.fn(),
    createCancellation: vi.fn(),
  } as any);
  mockFindCoachById.mockResolvedValue({ id: 10, status: 'approved', hourly_rate: 200, currency_code: 'EGP' });
  mockAcquireCoach.mockResolvedValue(true);
  mockReleaseCoach.mockResolvedValue(undefined);
  mockCreateCoachSession.mockResolvedValue(500);
  mockUpdateSessionBooking.mockResolvedValue(undefined);
  mockCreateBooking.mockResolvedValue({
    id: 100, booking_status: 'confirmed', payment_status: 'paid',
    total_amount: 200, commission_amount: 20, organisation_id: 1, branch_id: 5,
  });
  mockGetBooking.mockResolvedValue({
    id: 100, booking_status: 'confirmed', payment_status: 'paid',
    total_amount: 200, organisation_id: 1, branch_id: 5, user_id: 999,
  });
  // Default: coach available (no existing sessions)
  mockPoolExecute.mockResolvedValue([[]]);
  mockConn.execute.mockReset();
  mockConn.execute.mockResolvedValue([{}]);
  mockConn.beginTransaction.mockReset();
  mockConn.commit.mockReset();
  mockConn.rollback.mockReset();
  mockConn.release.mockReset();
  mockGetConnection.mockResolvedValue(mockConn);
}

// ─── Tests ───
describe('SchedulingBookingService — Compensation Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('should cancel booking and throw when coach session creation fails', async () => {
    const { schedulingBookingService } = await import('../application/scheduling-booking.service.js');

    // Simulate coach session creation failure
    mockCreateCoachSession.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(
      schedulingBookingService.bookSession(
        { coachId: 10, resourceId: 20, date: '2026-07-20', startTime: '10:00', endTime: '11:00' },
        999,
      ),
    ).rejects.toThrow('Booking could not be completed');

    // Coach lock acquired and released
    expect(mockAcquireCoach).toHaveBeenCalledWith(10, '2026-07-20', '10:00', expect.any(String));
    expect(mockReleaseCoach).toHaveBeenCalledWith(10, '2026-07-20', '10:00', expect.any(String));

    // Booking was created
    expect(mockCreateBooking).toHaveBeenCalled();

    // Coach session creation was attempted
    expect(mockCreateCoachSession).toHaveBeenCalled();

    // Compensation: booking cancelled via saga (cancellation record + status update)
    // (cancellation INSERT now delegated to repository — tested in BookingSaga.spec.ts)

    // Compensation: court slot released
    // (slot release now delegated to repository — tested in BookingSaga.spec.ts)
  });

  it('should reject when coach is not approved (before lock acquisition)', async () => {
    const { schedulingBookingService } = await import('../application/scheduling-booking.service.js');

    mockFindCoachById.mockResolvedValueOnce({ id: 10, status: 'rejected' });

    await expect(
      schedulingBookingService.bookSession(
        { coachId: 10, resourceId: 20, date: '2026-07-20', startTime: '10:00', endTime: '11:00' },
        999,
      ),
    ).rejects.toThrow('Coach not found or not approved');

    expect(mockAcquireCoach).not.toHaveBeenCalled();
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  it('should release coach lock when coach is no longer available', async () => {
    const { schedulingBookingService } = await import('../application/scheduling-booking.service.js');

    // Pool returns an existing session → coach not available
    mockPoolExecute.mockResolvedValueOnce([[{ id: 1 }]]);

    await expect(
      schedulingBookingService.bookSession(
        { coachId: 10, resourceId: 20, date: '2026-07-20', startTime: '10:00', endTime: '11:00' },
        999,
      ),
    ).rejects.toThrow('Coach is no longer available');

    expect(mockAcquireCoach).toHaveBeenCalled();
    expect(mockReleaseCoach).toHaveBeenCalled();
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  it('should reject when coach lock cannot be acquired (concurrent booking)', async () => {
    const { schedulingBookingService } = await import('../application/scheduling-booking.service.js');

    mockAcquireCoach.mockResolvedValueOnce(false);

    await expect(
      schedulingBookingService.bookSession(
        { coachId: 10, resourceId: 20, date: '2026-07-20', startTime: '10:00', endTime: '11:00' },
        999,
      ),
    ).rejects.toThrow('currently being booked by another user');

    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  it('should succeed when everything works', async () => {
    const { schedulingBookingService } = await import('../application/scheduling-booking.service.js');

    const result = await schedulingBookingService.bookSession(
      { coachId: 10, resourceId: 20, date: '2026-07-20', startTime: '10:00', endTime: '11:00' },
      999,
    );

    expect(result.bookingId).toBe(100);
    expect(result.sessionId).toBe(500);
    expect(result.status).toBe('confirmed');
    expect(result.priceBreakdown.total).toBe(200);

    // Lock acquired and released
    expect(mockAcquireCoach).toHaveBeenCalled();
    expect(mockReleaseCoach).toHaveBeenCalled();

    // No compensation
    expect(mockConn.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO booking_cancellations'),
      expect.any(Array),
    );
  });
});
