import { describe, it, expect } from 'vitest';
import { assertValidTransition, isTerminal, canExpire } from './booking-aggregate.js';
import { FixedClock } from '../../../shared/utils/clock.js';

describe('BookingAggregate — state machine', () => {
  describe('assertValidTransition', () => {
    const allowed: [string, string][] = [
      ['pending', 'confirmed'], ['pending', 'cancelled'], ['pending', 'expired'],
      ['confirmed', 'completed'], ['confirmed', 'cancelled'],
    ];
    const denied: [string, string][] = [
      ['confirmed', 'confirmed'], ['cancelled', 'confirmed'], ['expired', 'confirmed'],
      ['completed', 'confirmed'], ['no_show', 'confirmed'], ['cancelled', 'cancelled'],
      ['expired', 'cancelled'], ['completed', 'cancelled'], ['cancelled', 'expired'],
      ['cancelled', 'completed'], ['pending', 'pending'], ['pending', 'completed'],
      ['pending', 'no_show'],
    ];
    for (const [from, to] of allowed) {
      it(`allows ${from} → ${to}`, () => {
        expect(() => assertValidTransition(from as any, to as any)).not.toThrow();
      });
    }
    for (const [from, to] of denied) {
      it(`rejects ${from} → ${to}`, () => {
        expect(() => assertValidTransition(from as any, to as any)).toThrow('Illegal booking state transition');
      });
    }
  });

  describe('isTerminal', () => {
    const terminal = ['cancelled', 'expired', 'completed', 'no_show', 'cancelled_with_fee'];
    const nonTerminal = ['pending', 'confirmed'];
    for (const s of terminal) {
      it(`considers ${s} as terminal`, () => expect(isTerminal(s as any)).toBe(true));
    }
    for (const s of nonTerminal) {
      it(`considers ${s} as non-terminal`, () => expect(isTerminal(s as any)).toBe(false));
    }
  });
});

describe('BookingAggregate — time rules', () => {
  const baseDate = new Date('2026-07-23T12:00:00Z');

  describe('canExpire', () => {
    it('permits expiry when pending and past expires_at', () => {
      const clock = new FixedClock(new Date('2026-07-23T12:05:00Z'));
      const booking = { booking_status: 'pending' as const, expires_at: new Date('2026-07-23T12:00:00Z') };
      expect(() => canExpire(booking, clock)).not.toThrow();
    });

    it('rejects expiry when pending but exactly at expires_at', () => {
      const clock = new FixedClock(new Date('2026-07-23T12:00:00Z'));
      const booking = { booking_status: 'pending' as const, expires_at: new Date('2026-07-23T12:00:00Z') };
      expect(() => canExpire(booking, clock)).not.toThrow();
    });

    it('rejects expiry when one second before expires_at', () => {
      const clock = new FixedClock(new Date('2026-07-23T11:59:59Z'));
      const booking = { booking_status: 'pending' as const, expires_at: new Date('2026-07-23T12:00:00Z') };
      expect(() => canExpire(booking, clock)).toThrow('Booking cannot expire yet');
    });

    it('permits one second after expires_at', () => {
      const clock = new FixedClock(new Date('2026-07-23T12:00:01Z'));
      const booking = { booking_status: 'pending' as const, expires_at: new Date('2026-07-23T12:00:00Z') };
      expect(() => canExpire(booking, clock)).not.toThrow();
    });

    it('rejects expiry for confirmed booking regardless of time', () => {
      const clock = new FixedClock(new Date('2026-07-23T13:00:00Z'));
      const booking = { booking_status: 'confirmed' as const, expires_at: new Date('2026-07-23T12:00:00Z') };
      expect(() => canExpire(booking, clock)).toThrow('Only pending bookings can expire');
    });

    it('rejects expiry for cancelled booking', () => {
      const clock = new FixedClock(baseDate);
      expect(() => canExpire({ booking_status: 'cancelled' as const, expires_at: baseDate }, clock))
        .toThrow('Only pending bookings can expire');
    });

    it('rejects expiry when expires_at is null', () => {
      const clock = new FixedClock(baseDate);
      expect(() => canExpire({ booking_status: 'pending' as const, expires_at: null }, clock))
        .toThrow('Booking has no expiration time');
    });
  });
});
