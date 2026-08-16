import { describe, it, expect, vi } from 'vitest';
import { expireBookingHandler } from './expire-booking.command.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  BookingRepository: vi.fn(),
  bookingRepository: { findById: vi.fn(), persistTransition: vi.fn() },
}));

describe('Event contract: booking.expired', () => {
  const command: Command = {
    commandId: 'ec-001', commandType: 'ExpireBooking',
    aggregateType: 'booking', aggregateId: '42',
    payload: { bookingId: 42 },
    correlationId: 'corr-001',
  };

  const result = { bookingId: 42 };

  it('emits event with correct name', () => {
    const events = expireBookingHandler.events!(command, result);
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('booking:expired');
  });

  it('contains required payload fields', () => {
    const events = expireBookingHandler.events!(command, result);
    expect(events[0].payload.bookingId).toBe(42);
  });

  it('contains required context fields', () => {
    const events = expireBookingHandler.events!(command, result);
    expect(events[0].context.aggregateType).toBe('booking');
    expect(events[0].context.aggregateId).toBe('42');
    expect(events[0].context.aggregateVersion).toBe(1);
  });

  it('includes tracing metadata', () => {
    const events = expireBookingHandler.events!(command, result);
    expect(events[0].context.correlationId).toBe('corr-001');
    expect(events[0].context.causationId).toBe('ec-001');
  });

  it('carries booking identity for realtime room resolution', () => {
    const events = expireBookingHandler.events!(command, {
      bookingId: 42, aggregateVersion: 2, userId: 7,
      organisationId: 5, branchId: 3, resourceId: 9,
      bookingDate: '2026-08-20', startTime: '10:00', endTime: '11:00',
    });
    const payload = events[0].payload as Record<string, unknown>;
    expect(payload.userId).toBe(7);
    expect(payload.organisationId).toBe(5);
    expect(payload.resourceId).toBe(9);
    expect(payload.bookingDate).toBe('2026-08-20');
  });
});
