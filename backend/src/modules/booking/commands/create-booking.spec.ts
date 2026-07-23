import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
import { createBookingHandler } from './create-booking.command.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  bookingRepository: {
    create: vi.fn(),
  },
}));

const mockConn = {} as PoolConnection;

describe('CreateBooking command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates a valid command payload', async () => {
    const command: Command = {
      commandId: 'test-001',
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
        totalAmount: 100,
        startAtUtc: '2026-07-23T08:00:00Z',
        endAtUtc: '2026-07-23T09:00:00Z',
        bookingType: 'standard',
      },
      actorId: 1,
    };

    await expect(createBookingHandler.validate(command)).resolves.toBeUndefined();
  });

  it('rejects invalid payload — missing branchId', async () => {
    const command: Command = {
      commandId: 'test-002',
      commandType: 'CreateBooking',
      aggregateType: 'booking',
      aggregateId: '1',
      payload: { resourceId: 42, bookingDate: '2026-07-23', totalAmount: 100 },
    };

    await expect(createBookingHandler.validate(command)).rejects.toThrow('branchId is required');
  });

  it('rejects invalid payload — zero totalAmount', async () => {
    const command: Command = {
      commandId: 'test-003',
      commandType: 'CreateBooking',
      aggregateType: 'booking',
      aggregateId: '1',
      payload: { branchId: 10, resourceId: 42, bookingDate: '2026-07-23', totalAmount: 0 },
    };

    await expect(createBookingHandler.validate(command)).rejects.toThrow('totalAmount must be positive');
  });

  it('executes the handler and creates a booking via repository', async () => {
    vi.mocked(bookingRepository.create).mockResolvedValue(123);

    const command: Command = {
      commandId: 'test-004',
      commandType: 'CreateBooking',
      aggregateType: 'booking',
      aggregateId: '42',
      payload: {
        userId: 1, branchId: 10, organisationId: 5, resourceId: 42,
        bookingDate: '2026-07-23', startTime: '10:00', endTime: '11:00',
        totalAmount: 100, startAtUtc: '2026-07-23T08:00:00Z', endAtUtc: '2026-07-23T09:00:00Z',
        bookingType: 'standard',
      },
      actorId: 1,
    };

    const result = await createBookingHandler.execute(command, mockConn);

    expect(result.bookingId).toBe(123);
    expect(bookingRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        branchId: 10,
        resourceId: 42,
        totalAmount: 100,
      }),
      mockConn,
    );
  });

  it('emits booking.created event on success', () => {
    const command: Command = {
      commandId: 'test-005',
      commandType: 'CreateBooking',
      aggregateType: 'booking',
      aggregateId: '42',
      payload: { userId: 1, totalAmount: 100 },
      correlationId: 'corr-001',
    };

    const result = { bookingId: 123, publicId: 'ulid-001' };
    const events = createBookingHandler.events!(command, result);

    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('booking.created');
    expect(events[0].payload.bookingId).toBe(123);
    expect(events[0].context.aggregateType).toBe('booking');
    expect(events[0].context.causationId).toBe('test-005');
  });
});
