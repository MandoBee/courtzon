import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
import { completeBookingHandler } from './complete-booking.command.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/app-error.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  BookingRepository: vi.fn(),
  bookingRepository: { findById: vi.fn(), persistTransition: vi.fn() },
}));

const mockConn = {} as PoolConnection;

describe('CompleteBooking command', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('validates a valid command', async () => {
    const c: Command = { commandId: 't1', commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    await expect(completeBookingHandler.validate(c)).resolves.toBeUndefined();
  });

  it('rejects invalid payload', async () => {
    const c: Command = { commandId: 't2', commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '1', payload: {} };
    await expect(completeBookingHandler.validate(c)).rejects.toThrow('bookingId is required');
  });

  it('completes a confirmed booking (v2 → v3)', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'confirmed', aggregate_version: 2 });
    vi.mocked(bookingRepository.persistTransition).mockResolvedValue();
    const c: Command = { commandId: 't3', commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    const r = await completeBookingHandler.execute(c, mockConn);
    expect(r.bookingId).toBe(42);
    expect(r.aggregateVersion).toBe(3);
    expect(bookingRepository.persistTransition).toHaveBeenCalledWith(42, 'completed', undefined, 2, mockConn);
  });

  it('skips if already completed (replay safety)', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'completed', aggregate_version: 3 });
    const c: Command = { commandId: 't4', commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    const r = await completeBookingHandler.execute(c, mockConn);
    expect(r.bookingId).toBe(42);
    expect(bookingRepository.persistTransition).not.toHaveBeenCalled();
  });

  it('rejects complete for pending booking', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'pending', aggregate_version: 1 });
    const c: Command = { commandId: 't5', commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    await expect(completeBookingHandler.execute(c, mockConn)).rejects.toThrow('Illegal booking state transition');
  });

  it('rejects complete for cancelled booking', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'cancelled', aggregate_version: 2 });
    const c: Command = { commandId: 't6', commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    await expect(completeBookingHandler.execute(c, mockConn)).rejects.toThrow('terminal state');
  });

  it.each(['no_show', 'expired', 'cancelled_with_fee'] as const)(
    'rejects complete for %s terminal booking with a ConflictError',
    async (status) => {
      vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: status, aggregate_version: 2 });
      const c: Command = { commandId: `t-terminal-${status}`, commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
      await expect(completeBookingHandler.execute(c, mockConn)).rejects.toBeInstanceOf(ConflictError);
      expect(bookingRepository.persistTransition).not.toHaveBeenCalled();
    },
  );

  it('reads and writes through the caller transaction and keeps the optimistic-lock version', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'confirmed', aggregate_version: 5 });
    vi.mocked(bookingRepository.persistTransition).mockResolvedValue();
    const c: Command = { commandId: 't8', commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };

    const r = await completeBookingHandler.execute(c, mockConn);

    expect(bookingRepository.findById).toHaveBeenCalledWith(42, mockConn);
    expect(bookingRepository.persistTransition).toHaveBeenCalledWith(42, 'completed', undefined, 5, mockConn);
    expect(r.aggregateVersion).toBe(6);
  });

  it('defaults to aggregate_version 1 when the row has no version', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'confirmed' });
    vi.mocked(bookingRepository.persistTransition).mockResolvedValue();
    const c: Command = { commandId: 't9', commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };

    await completeBookingHandler.execute(c, mockConn);

    expect(bookingRepository.persistTransition).toHaveBeenCalledWith(42, 'completed', undefined, 1, mockConn);
  });

  it('surfaces an optimistic-lock conflict instead of completing', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'confirmed', aggregate_version: 2 });
    vi.mocked(bookingRepository.persistTransition).mockRejectedValue(new ConflictError('version conflict'));
    const c: Command = { commandId: 't10', commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };

    await expect(completeBookingHandler.execute(c, mockConn)).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws NotFoundError when the booking row does not exist', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue(null);
    const c: Command = { commandId: 't11', commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };

    await expect(completeBookingHandler.execute(c, mockConn)).rejects.toBeInstanceOf(NotFoundError);
    expect(bookingRepository.persistTransition).not.toHaveBeenCalled();
  });

  it('emits booking.completed event on success', () => {
    const events = completeBookingHandler.events!(
      { commandId: 't7', commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 }, correlationId: 'corr-001' } as Command,
      { bookingId: 42, aggregateVersion: 3 },
    );
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('booking:completed');
    expect(events[0].payload.aggregateVersion).toBe(3);
    expect(events[0].context.aggregateVersion).toBe(3);
  });
});
