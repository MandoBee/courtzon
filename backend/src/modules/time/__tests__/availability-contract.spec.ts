import { describe, it, expect } from 'vitest';
import { mergeBookingConflicts, resolveAvailability, isSlotAvailable } from '../availability-time-service.js';
import type { AvailableSlot, BookingConflict } from '../types.js';

function makeSlot(startUtc: string, endUtc: string): AvailableSlot {
  return {
    localStartTime: '10:00',
    localEndTime: '11:00',
    startAtUtc: startUtc,
    endAtUtc: endUtc,
    businessDate: '2026-07-20',
    utcOffsetMinutes: 180,
    status: 'available',
  };
}

describe('BookingConflict contract — camelCase is the only supported shape', () => {
  it('detects conflict when given proper BookingConflict objects (camelCase)', () => {
    const slots = [makeSlot('2026-07-20T08:00:00.000Z', '2026-07-20T09:00:00.000Z')];
    const bookings: BookingConflict[] = [
      { startAtUtc: '2026-07-20T08:00:00.000Z', endAtUtc: '2026-07-20T09:00:00.000Z' },
    ];
    const result = mergeBookingConflicts(slots, bookings);
    expect(result[0].status).toBe('booked');
  });

  it('does NOT silently skip bookings — snake_case objects are NOT BookingConflict', () => {
    const slots = [makeSlot('2026-07-20T08:00:00.000Z', '2026-07-20T09:00:00.000Z')];
    // This simulates what the OLD code would pass — snake_case from DB
    // After the fix, this should NOT be passable to TimeEngine
    const snakeCaseBookings = [
      { start_at_utc: '2026-07-20T08:00:00.000Z', end_at_utc: '2026-07-20T09:00:00.000Z' },
    ];
    // TypeScript should reject this at compile time, but at runtime the guard
    // !booking.startAtUtc evaluates to true, so conflict is skipped
    const result = mergeBookingConflicts(slots, snakeCaseBookings as any);
    // This is THE BUG: with snake_case, the slot incorrectly stays 'available'
    // After the fix, callers must never reach here with snake_case objects
    expect(result[0].status).toBe('available'); // documents the old broken behavior
  });

  it('marks slot as booked when overlapping BookingConflict is provided', () => {
    const slots = [makeSlot('2026-07-20T08:00:00.000Z', '2026-07-20T09:00:00.000Z')];
    const bookings: BookingConflict[] = [
      { startAtUtc: '2026-07-20T07:30:00.000Z', endAtUtc: '2026-07-20T08:30:00.000Z' },
    ];
    const result = mergeBookingConflicts(slots, bookings);
    expect(result[0].status).toBe('booked');
  });

  it('marks slot as booked when partial overlap exists', () => {
    const slots = [makeSlot('2026-07-20T08:00:00.000Z', '2026-07-20T09:00:00.000Z')];
    const bookings: BookingConflict[] = [
      { startAtUtc: '2026-07-20T08:30:00.000Z', endAtUtc: '2026-07-20T09:30:00.000Z' },
    ];
    const result = mergeBookingConflicts(slots, bookings);
    expect(result[0].status).toBe('booked');
  });

  it('leaves slot as available when no overlap exists', () => {
    const slots = [makeSlot('2026-07-20T08:00:00.000Z', '2026-07-20T09:00:00.000Z')];
    const bookings: BookingConflict[] = [
      { startAtUtc: '2026-07-20T09:00:00.000Z', endAtUtc: '2026-07-20T10:00:00.000Z' },
    ];
    const result = mergeBookingConflicts(slots, bookings);
    expect(result[0].status).toBe('available');
  });

  it('handles empty bookings array', () => {
    const slots = [makeSlot('2026-07-20T08:00:00.000Z', '2026-07-20T09:00:00.000Z')];
    const result = mergeBookingConflicts(slots, []);
    expect(result[0].status).toBe('available');
  });

  it('skip bookings with missing startAtUtc or endAtUtc', () => {
    const slots = [makeSlot('2026-07-20T08:00:00.000Z', '2026-07-20T09:00:00.000Z')];
    const bookings: BookingConflict[] = [
      { startAtUtc: '', endAtUtc: '2026-07-20T09:00:00.000Z' },
    ];
    const result = mergeBookingConflicts(slots, bookings);
    expect(result[0].status).toBe('available');
  });
});

describe('BookingConflict contract — resolveAvailability full chain', () => {
  it('returns booked status through the full resolveAvailability pipeline', () => {
    const slots = [
      makeSlot('2026-07-20T08:00:00.000Z', '2026-07-20T09:00:00.000Z'),
      makeSlot('2026-07-20T09:00:00.000Z', '2026-07-20T10:00:00.000Z'),
    ];
    const bookings: BookingConflict[] = [
      { startAtUtc: '2026-07-20T08:00:00.000Z', endAtUtc: '2026-07-20T09:00:00.000Z' },
    ];
    const result = resolveAvailability(slots, bookings, '2026-07-20T05:00:00.000Z');
    expect(result[0].status).toBe('booked');
    expect(result[1].status).toBe('available');
  });

  it('isSlotAvailable returns correct boolean', () => {
    const bookings: BookingConflict[] = [
      { startAtUtc: '2026-07-20T08:00:00.000Z', endAtUtc: '2026-07-20T09:00:00.000Z' },
    ];
    expect(isSlotAvailable('2026-07-20T08:00:00.000Z', '2026-07-20T09:00:00.000Z', bookings)).toBe(false);
    expect(isSlotAvailable('2026-07-20T09:00:00.000Z', '2026-07-20T10:00:00.000Z', bookings)).toBe(true);
  });
});
