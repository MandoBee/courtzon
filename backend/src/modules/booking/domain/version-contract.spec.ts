import { describe, it, expect, vi } from 'vitest';
import { planTransition, assertValidTransition, isTerminal, BookingStatus } from '../domain/booking-aggregate.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { confirmBookingHandler } from '../commands/confirm-booking.command.js';
import { cancelBookingHandler } from '../commands/cancel-booking.command.js';
import type { PoolConnection } from 'mysql2/promise';
import type { Command } from '../../../shared/command/command-base.js';

vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  BookingRepository: vi.fn(),
  bookingRepository: { findById: vi.fn(), persistTransition: vi.fn() },
}));

const mockConn = {} as PoolConnection;

describe('Aggregate Version Contract', () => {
  describe('planTransition', () => {
    it('pending → confirmed: version goes 1 → 2', () => {
      const r = planTransition({ fromStatus: 'pending', toStatus: 'confirmed', currentVersion: 1 });
      expect(r.newVersion).toBe(2);
      expect(r.didTransition).toBe(true);
    });

    it('confirmed → completed: version goes 2 → 3', () => {
      const r = planTransition({ fromStatus: 'confirmed', toStatus: 'completed', currentVersion: 2 });
      expect(r.newVersion).toBe(3);
    });

    it('pending → cancelled: version goes 1 → 2', () => {
      const r = planTransition({ fromStatus: 'pending', toStatus: 'cancelled', currentVersion: 1 });
      expect(r.newVersion).toBe(2);
    });

    it('confirmed → cancelled: version goes 2 → 3', () => {
      const r = planTransition({ fromStatus: 'confirmed', toStatus: 'cancelled', currentVersion: 2 });
      expect(r.newVersion).toBe(3);
    });

    it('pending → expired: version goes 1 → 2', () => {
      const r = planTransition({ fromStatus: 'pending', toStatus: 'expired', currentVersion: 1 });
      expect(r.newVersion).toBe(2);
    });
  });

  describe('rejected transitions do NOT increment version', () => {
    it('confirmed → confirmed throws, no version change', () => {
      expect(() => assertValidTransition('confirmed', 'confirmed')).toThrow();
    });

    it('cancelled → confirmed throws, no version change', () => {
      expect(() => assertValidTransition('cancelled', 'confirmed')).toThrow();
    });

    it('expired → confirmed throws, no version change', () => {
      expect(() => assertValidTransition('expired', 'confirmed')).toThrow();
    });

    it('completed → confirmed throws, no version change', () => {
      expect(() => assertValidTransition('completed', 'confirmed')).toThrow();
    });
  });

  describe('idempotent replay does NOT increment version', () => {
    it('confirm already-confirmed booking skips persistTransition', async () => {
      vi.mocked(bookingRepository.findById).mockResolvedValue({
        id: 42, booking_status: 'confirmed', payment_status: 'paid', aggregate_version: 2,
      });

      const c: Command = { commandId: 'v-test-1', commandType: 'ConfirmBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } };
      const r = await confirmBookingHandler.execute(c, mockConn);
      expect(r.bookingId).toBe(42);
      expect(r.aggregateVersion).toBeUndefined();
      expect(bookingRepository.persistTransition).not.toHaveBeenCalled();
    });
  });

  describe('event version consistency', () => {
    it('emitted event carries aggregateVersion matching persisted version', () => {
      const events = confirmBookingHandler.events!(
        { commandId: 'v-test-2', commandType: 'ConfirmBooking', aggregateType: 'booking', aggregateId: '42', payload: { bookingId: 42 } } as Command,
        { bookingId: 42, aggregateVersion: 2 },
      );
      expect(events[0].context.aggregateVersion).toBe(2);
      expect(events[0].payload.aggregateVersion).toBe(2);
    });
  });
});
