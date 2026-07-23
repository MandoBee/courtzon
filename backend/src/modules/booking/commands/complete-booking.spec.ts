import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
import { completeBookingHandler } from './complete-booking.command.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
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

  it('emits booking.completed event on success', () => {
    const events = completeBookingHandler.events!(
      { commandId: 't7', commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 }, correlationId: 'corr-001' } as Command,
      { bookingId: 42, aggregateVersion: 3 },
    );
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('booking.completed');
    expect(events[0].payload.aggregateVersion).toBe(3);
    expect(events[0].context.aggregateVersion).toBe(3);
  });
});
