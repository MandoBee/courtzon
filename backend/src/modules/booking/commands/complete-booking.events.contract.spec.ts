import { describe, it, expect, vi } from 'vitest';
import { completeBookingHandler } from './complete-booking.command.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  BookingRepository: vi.fn(),
  bookingRepository: { findById: vi.fn(), persistTransition: vi.fn() },
}));

describe('Event contract: booking.completed', () => {
  it('emits correct event name', () => {
    const events = completeBookingHandler.events!(
      { commandId: 'ec1', commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 }, correlationId: 'corr-001' } as Command,
      { bookingId: 42, aggregateVersion: 3 },
    );
    expect(events[0].eventName).toBe('booking:completed');
  });

  it('contains required fields', () => {
    const events = completeBookingHandler.events!(
      { commandId: 'ec2', commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } } as Command,
      { bookingId: 42, aggregateVersion: 3 },
    );
    expect(events[0].payload.bookingId).toBe(42);
    expect(events[0].payload.aggregateVersion).toBe(3);
    expect(events[0].context.aggregateType).toBe('booking');
    expect(events[0].context.aggregateVersion).toBe(3);
  });

  it('carries booking identity for realtime room resolution', () => {
    const events = completeBookingHandler.events!(
      { commandId: 'ec3', commandType: 'CompleteBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } } as Command,
      {
        bookingId: 42, aggregateVersion: 3, userId: 7,
        organisationId: 5, branchId: 3, resourceId: 9,
        bookingDate: '2026-08-20', startTime: '10:00', endTime: '11:00',
      },
    );
    const payload = events[0].payload as Record<string, unknown>;
    expect(payload.userId).toBe(7);
    expect(payload.organisationId).toBe(5);
    expect(payload.resourceId).toBe(9);
    expect(payload.bookingDate).toBe('2026-08-20');
  });
});
