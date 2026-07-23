import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createBookingHandler } from './create-booking.command.js';
import { generateUlid } from '../../../shared/event-bus/event-envelope.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  BookingRepository: vi.fn(),
  bookingRepository: { create: vi.fn() },
}));

const BOOKING_CREATED_SCHEMA = {
  eventName: 'booking.created',
  requiredPayloadFields: ['bookingId'],
  requiredContextFields: ['aggregateType', 'aggregateId', 'aggregateVersion'],
};

describe('Event contract: booking.created', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });
  const command: Command = {
    commandId: generateUlid(),
    commandType: 'CreateBooking',
    aggregateType: 'booking',
    aggregateId: '42',
    payload: {
      userId: 1,
      branchId: 10,
      organisationId: 5,
      resourceId: 42,
      bookingDate: '2026-07-23',
      startTime: '10:00',
      endTime: '11:00',
      totalAmount: 150.00,
      startAtUtc: '2026-07-23T08:00:00Z',
      endAtUtc: '2026-07-23T09:00:00Z',
      bookingType: 'standard',
    },
    correlationId: 'corr-001',
    causationId: 'caus-001',
    actorId: 1,
  };

  const result = { bookingId: 42, publicId: generateUlid() };

  it('emits event with correct name', () => {
    const events = createBookingHandler.events!(command, result);
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe(BOOKING_CREATED_SCHEMA.eventName);
  });

  it('contains all required payload fields', () => {
    const events = createBookingHandler.events!(command, result);
    const payload = events[0].payload;

    for (const field of BOOKING_CREATED_SCHEMA.requiredPayloadFields) {
      expect(payload).toHaveProperty(field);
    }

    expect(payload.bookingId).toBe(42);
    expect(payload.publicId).toBe(result.publicId);
    expect(payload.userId).toBe(1);
    expect(payload.totalAmount).toBe(150.00);
  });

  it('contains all required context fields', () => {
    const events = createBookingHandler.events!(command, result);
    const ctx = events[0].context;

    for (const field of BOOKING_CREATED_SCHEMA.requiredContextFields) {
      expect(ctx).toHaveProperty(field);
    }

    expect(ctx.aggregateType).toBe('booking');
    expect(ctx.aggregateId).toBe('42');
    expect(ctx.aggregateVersion).toBe(1);
  });

  it('includes metadata for tracing', () => {
    const events = createBookingHandler.events!(command, result);
    const ctx = events[0].context;

    expect(ctx.correlationId).toBe('corr-001');
    expect(ctx.causationId).toBe(command.commandId);
    expect(ctx.actorId).toBe(1);
  });

  it('maintains schema version compatibility — payload structure is stable', () => {
    const events = createBookingHandler.events!(command, result);
    const payload = events[0].payload as Record<string, unknown>;

    const expectedShape = {
      bookingId: 'number',
      publicId: 'string',
      userId: 'number',
      branchId: 'number',
      organisationId: 'number',
      resourceId: 'number',
      bookingDate: 'string',
      startTime: 'string',
      endTime: 'string',
      totalAmount: 'number',
    };

    for (const [field, type] of Object.entries(expectedShape)) {
      expect(payload).toHaveProperty(field);
      expect(typeof payload[field]).toBe(type);
    }
  });

  it('version compatibility — adding new fields must not remove existing fields', () => {
    const events = createBookingHandler.events!(command, result);
    const payload = events[0].payload as Record<string, unknown>;

    const knownFields = ['bookingId', 'publicId', 'userId', 'branchId', 'organisationId',
      'resourceId', 'bookingDate', 'startTime', 'endTime', 'totalAmount',
      'startAtUtc', 'endAtUtc', 'bookingType'];

    for (const field of knownFields) {
      expect(payload).toHaveProperty(field);
    }
  });
});
