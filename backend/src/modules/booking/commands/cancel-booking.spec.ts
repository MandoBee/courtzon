import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
import { cancelBookingHandler } from './cancel-booking.command.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  BookingRepository: vi.fn(),
  bookingRepository: { findById: vi.fn(), persistTransition: vi.fn() },
}));

const mockConn = {} as PoolConnection;

describe('CancelBooking command', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('validates a valid command', async () => {
    const c: Command = { commandId: 't1', commandType: 'CancelBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    await expect(cancelBookingHandler.validate(c)).resolves.toBeUndefined();
  });

  it('rejects missing bookingId', async () => {
    const c: Command = { commandId: 't2', commandType: 'CancelBooking', aggregateType: 'booking', aggregateId: '1', payload: {} };
    await expect(cancelBookingHandler.validate(c)).rejects.toThrow('bookingId is required');
  });

  it('cancels a pending booking', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'pending', aggregate_version: 1 });
    vi.mocked(bookingRepository.persistTransition).mockResolvedValue();
    const c: Command = { commandId: 't3', commandType: 'CancelBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    const r = await cancelBookingHandler.execute(c, mockConn);
    expect(r.bookingId).toBe(42);
    expect(r.aggregateVersion).toBe(2);
    expect(bookingRepository.persistTransition).toHaveBeenCalledWith(42, 'cancelled', undefined, 1, mockConn);
  });

  it('cancels a confirmed booking', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'confirmed', aggregate_version: 2 });
    const c: Command = { commandId: 't4', commandType: 'CancelBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    const r = await cancelBookingHandler.execute(c, mockConn);
    expect(r.bookingId).toBe(42);
    expect(r.aggregateVersion).toBe(3);
  });

  it('rejects cancel of cancelled booking', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'cancelled', aggregate_version: 2 });
    const c: Command = { commandId: 't5', commandType: 'CancelBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    await expect(cancelBookingHandler.execute(c, mockConn)).rejects.toThrow('terminal state');
  });

  it('rejects cancel of completed booking', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'completed', aggregate_version: 2 });
    const c: Command = { commandId: 't6', commandType: 'CancelBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    await expect(cancelBookingHandler.execute(c, mockConn)).rejects.toThrow('terminal state');
  });

  it('throws NotFoundError for unknown booking', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue(null);
    const c: Command = { commandId: 't7', commandType: 'CancelBooking', aggregateType: 'booking', aggregateId: '999', payload: { bookingId: 999 } };
    await expect(cancelBookingHandler.execute(c, mockConn)).rejects.toThrow('Booking not found');
  });

  it('emits booking.cancelled event on success', () => {
    const events = cancelBookingHandler.events!(
      { commandId: 't8', commandType: 'CancelBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42, reason: 'test' }, correlationId: 'corr-001' } as Command,
      { bookingId: 42, aggregateVersion: 2 },
    );
    expect(events[0].eventName).toBe('booking.cancelled');
    expect(events[0].payload.aggregateVersion).toBe(2);
  });
});

describe('CancelBooking — idempotency', () => {
  it('running with same commandId returns success', async () => {
    vi.mocked(bookingRepository.findById)
      .mockResolvedValueOnce({ id: 42, booking_status: 'pending', aggregate_version: 1 })
      .mockResolvedValueOnce({ id: 42, booking_status: 'cancelled', aggregate_version: 2 });
    vi.mocked(bookingRepository.persistTransition).mockResolvedValue();
    const c: Command = { commandId: 'i1', commandType: 'CancelBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    const r1 = await cancelBookingHandler.execute(c, mockConn);
    expect(r1.bookingId).toBe(42);
    await expect(cancelBookingHandler.execute(c, mockConn)).rejects.toThrow('terminal state');
  });
});

describe('CancelBooking — optimistic concurrency', () => {
  it('sequential cancels: first succeeds, second fails', async () => {
    vi.mocked(bookingRepository.findById)
      .mockResolvedValueOnce({ id: 42, booking_status: 'pending', aggregate_version: 1 })
      .mockResolvedValueOnce({ id: 42, booking_status: 'cancelled', aggregate_version: 2 });
    vi.mocked(bookingRepository.persistTransition).mockResolvedValue();
    const c1: Command = { commandId: 'c1', commandType: 'CancelBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    const c2: Command = { commandId: 'c2', commandType: 'CancelBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    await expect(cancelBookingHandler.execute(c1, mockConn)).resolves.toHaveProperty('bookingId', 42);
    await expect(cancelBookingHandler.execute(c2, mockConn)).rejects.toThrow('terminal state');
  });
});
