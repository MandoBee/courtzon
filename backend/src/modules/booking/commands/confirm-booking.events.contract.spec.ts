import { describe, it, expect, vi } from 'vitest';
import { confirmBookingHandler } from './confirm-booking.command.js';
import { generateUlid } from '../../../shared/event-bus/event-envelope.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  BookingRepository: vi.fn(),
  bookingRepository: { findById: vi.fn(), persistTransition: vi.fn() },
}));

const EVENT_SCHEMA = {
  eventName: 'booking.confirmed',
  requiredPayloadFields: ['bookingId'],
  requiredContextFields: ['aggregateType', 'aggregateId', 'aggregateVersion'],
};

describe('Event contract: booking.confirmed', () => {
  const command: Command = {
    commandId: generateUlid(),
    commandType: 'ConfirmBooking',
    aggregateType: 'booking',
    aggregateId: '42',
    payload: { bookingId: 42 },
    correlationId: 'corr-001',
    causationId: 'caus-001',
  };

  const result = { bookingId: 42 };

  it('emits event with correct name', () => {
    const events = confirmBookingHandler.events!(command, result);
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe(EVENT_SCHEMA.eventName);
  });

  it('contains all required payload fields', () => {
    const events = confirmBookingHandler.events!(command, result);
    const payload = events[0].payload;

    for (const field of EVENT_SCHEMA.requiredPayloadFields) {
      expect(payload).toHaveProperty(field);
    }
    expect(payload.bookingId).toBe(42);
  });

  it('contains all required context fields', () => {
    const events = confirmBookingHandler.events!(command, result);
    const ctx = events[0].context;

    for (const field of EVENT_SCHEMA.requiredContextFields) {
      expect(ctx).toHaveProperty(field);
    }
    expect(ctx.aggregateType).toBe('booking');
    expect(ctx.aggregateId).toBe('42');
    expect(ctx.aggregateVersion).toBe(1);
  });

  it('includes tracing metadata', () => {
    const events = confirmBookingHandler.events!(command, result);
    expect(events[0].context.correlationId).toBe('corr-001');
    expect(events[0].context.causationId).toBe(command.commandId);
  });

  it('maintains schema stability', () => {
    const events = confirmBookingHandler.events!(command, result);
    const payload = events[0].payload as Record<string, unknown>;

    expect(payload).toHaveProperty('bookingId');
    expect(typeof payload.bookingId).toBe('number');

    const ctx = events[0].context;
    expect(ctx).toHaveProperty('aggregateType');
    expect(ctx).toHaveProperty('aggregateId');
    expect(ctx).toHaveProperty('aggregateVersion');
  });
});
