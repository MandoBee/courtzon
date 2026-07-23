import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
import { expireBookingHandler } from './expire-booking.command.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  BookingRepository: vi.fn(),
  bookingRepository: { findById: vi.fn(), persistTransition: vi.fn() },
}));

const mockConn = {} as PoolConnection;

describe('ExpireBooking command', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('validates a valid command', async () => {
    const c: Command = { commandId: 't1', commandType: 'ExpireBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    await expect(expireBookingHandler.validate(c)).resolves.toBeUndefined();
  });

  it('rejects invalid payload', async () => {
    const c: Command = { commandId: 't2', commandType: 'ExpireBooking', aggregateType: 'booking', aggregateId: '1', payload: {} };
    await expect(expireBookingHandler.validate(c)).rejects.toThrow('bookingId is required');
  });

  it('expires a pending booking past expires_at', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'pending', expires_at: new Date('2024-01-01'), aggregate_version: 1 });
    vi.mocked(bookingRepository.persistTransition).mockResolvedValue();
    const c: Command = { commandId: 't3', commandType: 'ExpireBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    const r = await expireBookingHandler.execute(c, mockConn);
    expect(r.bookingId).toBe(42);
    expect(r.aggregateVersion).toBe(2);
    expect(bookingRepository.persistTransition).toHaveBeenCalledWith(42, 'expired', undefined, 1, mockConn);
  });

  it('skips if already expired (replay safety)', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'expired', expires_at: new Date('2024-01-01'), aggregate_version: 2 });
    const c: Command = { commandId: 't4', commandType: 'ExpireBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    const r = await expireBookingHandler.execute(c, mockConn);
    expect(r.bookingId).toBe(42);
    expect(bookingRepository.persistTransition).not.toHaveBeenCalled();
  });

  it('rejects expire for confirmed booking', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'confirmed', expires_at: new Date('2024-01-01'), aggregate_version: 2 });
    const c: Command = { commandId: 't5', commandType: 'ExpireBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    await expect(expireBookingHandler.execute(c, mockConn)).rejects.toThrow('Only pending bookings can expire');
  });

  it('rejects expire when expires_at is null', async () => {
    vi.mocked(bookingRepository.findById).mockResolvedValue({ id: 42, booking_status: 'pending', expires_at: null, aggregate_version: 1 });
    const c: Command = { commandId: 't6', commandType: 'ExpireBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    await expect(expireBookingHandler.execute(c, mockConn)).rejects.toThrow('Booking has no expiration time');
  });

  it('emits booking.expired event on success', () => {
    const events = expireBookingHandler.events!(
      { commandId: 't7', commandType: 'ExpireBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 }, correlationId: 'corr-001' } as Command,
      { bookingId: 42, aggregateVersion: 2 },
    );
    expect(events[0].eventName).toBe('booking.expired');
    expect(events[0].payload.aggregateVersion).toBe(2);
    expect(events[0].context.aggregateVersion).toBe(2);
  });
});

describe('ExpireBooking — replay safety', () => {
  it('second expire skips without re-persisting', async () => {
    vi.mocked(bookingRepository.findById)
      .mockResolvedValueOnce({ id: 42, booking_status: 'pending', expires_at: new Date('2024-01-01'), aggregate_version: 1 })
      .mockResolvedValueOnce({ id: 42, booking_status: 'expired', expires_at: new Date('2024-01-01'), aggregate_version: 2 });
    vi.mocked(bookingRepository.persistTransition).mockResolvedValue();
    const c: Command = { commandId: 'r1', commandType: 'ExpireBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
    const r1 = await expireBookingHandler.execute(c, mockConn);
    expect(r1.bookingId).toBe(42);
    const r2 = await expireBookingHandler.execute(c, mockConn);
    expect(r2.bookingId).toBe(42);
    expect(bookingRepository.persistTransition).toHaveBeenCalledTimes(1);
  });
});
