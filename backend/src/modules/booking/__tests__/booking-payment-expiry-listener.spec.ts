import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// No pool / no DB env in this offline suite.
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: vi.fn(), query: vi.fn() }),
  createPool: vi.fn(),
  acquireConnection: vi.fn(),
  closePool: vi.fn(),
}));

// The series helpers live in a service that also wires Redis/queue clients.
// Mock the module with the real constant and pure helper shapes so the listener
// can be exercised offline without loading env/Redis.
vi.mock('../application/recurring-payment.service.js', () => ({
  SERIES_PAYMENT_REFERENCE_TYPE: 'booking_series',
  isOccurrenceConfirmable: () => ({ eligible: false, reason: 'not_eligible_in_offline_test' }),
  isOccurrenceCancellable: () => ({ eligible: false, reason: 'not_eligible_in_offline_test' }),
  seriesNowMs: () => Date.now(),
  summariseOutcomes: (outcomes: any[]) => ({ applied: [], skipped: outcomes }),
}));

/**
 * P5-06 — single-booking payment-expiry cancellation (OFFLINE).
 *
 * Closes matrix #21 ("Single booking expiry cancels the pending booking — not
 * only series"), which was previously untested for the single-booking listener
 * path. The real `booking-payment.listener` module is registered with mocked
 * bus/pipeline/repository: **no database and no network** are touched.
 *
 * Pinned behaviour:
 *   - `pending_payment` / `pending` booking → one `CancelBooking` with
 *     `PAYMENT_TIMEOUT`;
 *   - already `cancelled`/`expired`, missing booking, non-booking reference
 *     type, or missing reference id → no command (idempotent, no side effect);
 *   - `booking_series` → series branch, never the single-booking path;
 *   - a throwing/failed cancel command never escapes the event handler;
 *   - duplicate expiry events and double registration cannot double-cancel.
 */

const busHandlers = new Map<string, (data: any) => Promise<void>>();

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: {
    on: vi.fn((event: string, handler: (data: any) => Promise<void>) => {
      busHandlers.set(event, handler);
    }),
    emit: vi.fn(),
    getInMemoryHandlers: vi.fn(() => []),
  },
}));

const pipelineExecute = vi.fn();
vi.mock('../../../shared/command/command-pipeline.js', () => ({
  commandPipeline: { execute: (...args: any[]) => pipelineExecute(...args) },
}));

const repoFindById = vi.fn();
const repoFindBySeries = vi.fn();
vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  bookingRepository: {
    findById: (...args: any[]) => repoFindById(...args),
    findBySeries: (...args: any[]) => repoFindBySeries(...args),
  },
}));

describe('P5-06 single-booking payment-expiry cancellation', () => {
  beforeAll(async () => {
    const { registerBookingPaymentListeners } = await import('../application/booking-payment.listener.js');
    registerBookingPaymentListeners();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    pipelineExecute.mockResolvedValue({ status: 'success' });
    repoFindById.mockResolvedValue(undefined);
    repoFindBySeries.mockResolvedValue([]);
  });

  function expiredHandler() {
    const handler = busHandlers.get('payment:expired-event');
    expect(handler).toBeTypeOf('function');
    return handler!;
  }

  it('cancels the pending_payment booking with PAYMENT_TIMEOUT', async () => {
    repoFindById.mockResolvedValue({ id: 42, booking_status: 'pending_payment' });

    await expiredHandler()({ paymentId: 900, referenceType: 'booking', referenceId: 42 });

    expect(repoFindById).toHaveBeenCalledWith(42);
    expect(pipelineExecute).toHaveBeenCalledTimes(1);
    const command = pipelineExecute.mock.calls[0][0];
    expect(command.commandType).toBe('CancelBooking');
    expect(command.aggregateId).toBe('42');
    expect(command.payload).toEqual({ bookingId: 42, reason: 'Payment timeout' });
  });

  it('also expires a booking still in the generic pending status', async () => {
    repoFindById.mockResolvedValue({ id: 43, booking_status: 'pending' });

    await expiredHandler()({ paymentId: 901, referenceType: 'booking', referenceId: 43 });

    expect(pipelineExecute).toHaveBeenCalledTimes(1);
    expect(pipelineExecute.mock.calls[0][0].payload.reason).toBe('Payment timeout');
  });

  it('does not re-cancel an already cancelled or expired booking (idempotency)', async () => {
    for (const status of ['cancelled', 'expired']) {
      vi.clearAllMocks();
      repoFindById.mockResolvedValue({ id: 44, booking_status: status });
      await expiredHandler()({ paymentId: 902, referenceType: 'booking', referenceId: 44 });
      expect(pipelineExecute).not.toHaveBeenCalled();
    }
  });

  it('ignores a missing booking (deleted/never created)', async () => {
    repoFindById.mockResolvedValue(null);

    await expiredHandler()({ paymentId: 903, referenceType: 'booking', referenceId: 45 });

    expect(pipelineExecute).not.toHaveBeenCalled();
  });

  it('ignores non-booking reference types and missing reference ids', async () => {
    await expiredHandler()({ paymentId: 904, referenceType: 'order', referenceId: 46 });
    await expiredHandler()({ paymentId: 905, referenceType: 'booking', referenceId: 0 });
    await expiredHandler()({ paymentId: 906, referenceType: 'booking', referenceId: undefined });

    expect(repoFindById).not.toHaveBeenCalled();
    expect(pipelineExecute).not.toHaveBeenCalled();
  });

  it('routes a series reference to the series branch instead of single-booking cancellation', async () => {
    await expiredHandler()({ paymentId: 907, referenceType: 'booking_series', referenceId: 77 });

    expect(repoFindBySeries).toHaveBeenCalledWith(77);
    expect(repoFindById).not.toHaveBeenCalled();
    expect(pipelineExecute).not.toHaveBeenCalled();
  });

  it('does not throw when the cancel command fails (handler must stay event-safe)', async () => {
    repoFindById.mockResolvedValue({ id: 48, booking_status: 'pending_payment' });
    pipelineExecute.mockRejectedValue(new Error('boom'));

    await expect(
      expiredHandler()({ paymentId: 908, referenceType: 'booking', referenceId: 48 }),
    ).resolves.toBeUndefined();
  });

  it('does not throw when the command result status is error', async () => {
    repoFindById.mockResolvedValue({ id: 49, booking_status: 'pending_payment' });
    pipelineExecute.mockResolvedValue({ status: 'error', message: 'conflict' });

    await expect(
      expiredHandler()({ paymentId: 909, referenceType: 'booking', referenceId: 49 }),
    ).resolves.toBeUndefined();
  });

  it('a duplicate expiry event cannot double-cancel once the status is terminal', async () => {
    repoFindById
      .mockResolvedValueOnce({ id: 50, booking_status: 'pending_payment' })
      .mockResolvedValueOnce({ id: 50, booking_status: 'cancelled' });

    await expiredHandler()({ paymentId: 910, referenceType: 'booking', referenceId: 50 });
    await expiredHandler()({ paymentId: 910, referenceType: 'booking', referenceId: 50 });

    expect(pipelineExecute).toHaveBeenCalledTimes(1);
  });

  it('registers the expiry handler only once per process (no duplicate cancellation)', async () => {
    const { registerBookingPaymentListeners } = await import('../application/booking-payment.listener.js');
    registerBookingPaymentListeners();
    registerBookingPaymentListeners();

    repoFindById.mockResolvedValue({ id: 51, booking_status: 'pending_payment' });
    await expiredHandler()({ paymentId: 911, referenceType: 'booking', referenceId: 51 });

    expect(pipelineExecute).toHaveBeenCalledTimes(1);
  });
});
