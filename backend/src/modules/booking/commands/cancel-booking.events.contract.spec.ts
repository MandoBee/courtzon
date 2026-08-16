import { describe, it, expect, vi } from 'vitest';
import { cancelBookingHandler } from './cancel-booking.command.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  BookingRepository: vi.fn(),
  bookingRepository: { findById: vi.fn(), persistTransition: vi.fn() },
}));

describe('Event contract: booking.cancelled', () => {
  const command: Command = {
    commandId: 'contract-001', commandType: 'CancelBooking',
    aggregateType: 'booking', aggregateId: '42',
    payload: { bookingId: 42, reason: 'User request' },
    correlationId: 'corr-001',
  };

  const result = { bookingId: 42 };

  it('emits event with correct name', () => {
    const events = cancelBookingHandler.events!(command, result);
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('booking:cancelled');
  });

  it('contains required payload fields', () => {
    const events = cancelBookingHandler.events!(command, result);
    expect(events[0].payload).toHaveProperty('bookingId');
    expect(events[0].payload).toHaveProperty('reason');
    expect(events[0].payload.bookingId).toBe(42);
    expect(events[0].payload.reason).toBe('User request');
  });

  it('contains required context fields', () => {
    const events = cancelBookingHandler.events!(command, result);
    const ctx = events[0].context;
    expect(ctx).toHaveProperty('aggregateType');
    expect(ctx).toHaveProperty('aggregateId');
    expect(ctx).toHaveProperty('aggregateVersion');
    expect(ctx.aggregateType).toBe('booking');
    expect(ctx.aggregateId).toBe('42');
  });

  it('includes tracing metadata', () => {
    const events = cancelBookingHandler.events!(command, result);
    expect(events[0].context.correlationId).toBe('corr-001');
    expect(events[0].context.causationId).toBe('contract-001');
  });

  it('supports null reason', () => {
    const cmd: Command = {
      commandId: 'contract-002', commandType: 'CancelBooking',
      aggregateType: 'booking', aggregateId: '42',
      payload: { bookingId: 42 },
    };
    const events = cancelBookingHandler.events!(cmd, result);
    expect(events[0].payload.reason).toBeNull();
  });

  it('carries booking identity for realtime room resolution', () => {
    const events = cancelBookingHandler.events!(command, {
      bookingId: 42, aggregateVersion: 2, userId: 7,
      organisationId: 5, branchId: 3, resourceId: 9,
      bookingDate: '2026-08-20', startTime: '10:00', endTime: '11:00',
    });
    const payload = events[0].payload as Record<string, unknown>;
    expect(payload.userId).toBe(7);
    expect(payload.organisationId).toBe(5);
    expect(payload.branchId).toBe(3);
    expect(payload.resourceId).toBe(9);
    expect(payload.bookingDate).toBe('2026-08-20');
    expect(payload.startTime).toBe('10:00');
    expect(payload.endTime).toBe('11:00');
    expect(payload.reason).toBe('User request');
  });
});
