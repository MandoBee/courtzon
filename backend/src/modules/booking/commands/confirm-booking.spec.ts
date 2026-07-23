import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
import { confirmBookingHandler } from './confirm-booking.command.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  BookingRepository: vi.fn(),
  bookingRepository: { findById: vi.fn(), persistTransition: vi.fn() },
}));

const mockConn = {} as PoolConnection;

describe('ConfirmBooking command', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('validates a valid command', async () => {
    const c: Command = { commandId: 't1', commandType: 'ConfirmBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    await expect(confirmBookingHandler.validate(c)).resolves.toBeUndefined();
  });

  it('rejects invalid payload', async () => {
    const c: Command = { commandId: 't2', commandType: 'ConfirmBooking', aggregateType: 'booking', aggregateId: '1', payload: {} };
    await expect(confirmBookingHandler.validate(c)).rejects.toThrow('bookingId is required');
  });

  it('confirms a pending booking', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'pending', payment_status: 'pending', aggregate_version: 1 });
    vi.mocked(bookingRepository.persistTransition).mockResolvedValue();
    const c: Command = { commandId: 't3', commandType: 'ConfirmBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    const r = await confirmBookingHandler.execute(c, mockConn);
    expect(r.bookingId).toBe(42);
    expect(r.aggregateVersion).toBe(2);
    expect(bookingRepository.persistTransition).toHaveBeenCalledWith(42, 'confirmed', undefined, 1, mockConn);
  });

  it('skips if already confirmed', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'confirmed', payment_status: 'pending', aggregate_version: 2 });
    const c: Command = { commandId: 't4', commandType: 'ConfirmBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    const r = await confirmBookingHandler.execute(c, mockConn);
    expect(r.bookingId).toBe(42);
    expect(bookingRepository.persistTransition).not.toHaveBeenCalled();
  });

  it('rejects cancelled → confirmed', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'cancelled', payment_status: 'pending', aggregate_version: 2 });
    const c: Command = { commandId: 't5', commandType: 'ConfirmBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    await expect(confirmBookingHandler.execute(c, mockConn)).rejects.toThrow('Illegal booking state transition');
  });

  it('throws NotFoundError for unknown booking', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue(null);
    const c: Command = { commandId: 't6', commandType: 'ConfirmBooking', aggregateType: 'booking', aggregateId: '999', payload: { bookingId: 999 } };
    await expect(confirmBookingHandler.execute(c, mockConn)).rejects.toThrow('Booking not found');
  });

  it('emits booking.confirmed event on success', () => {
    const events = confirmBookingHandler.events!(
      { commandId: 't7', commandType: 'ConfirmBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 }, correlationId: 'corr-001' } as Command,
      { bookingId: 42, aggregateVersion: 2 },
    );
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('booking.confirmed');
    expect(events[0].payload.aggregateVersion).toBe(2);
    expect(events[0].context.aggregateVersion).toBe(2);
  });
});
