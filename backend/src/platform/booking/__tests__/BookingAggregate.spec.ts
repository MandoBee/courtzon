import { describe, it, expect } from 'vitest';
import { BookingAggregate } from '../BookingAggregate.js';
import type { BookingStatus } from '../../shared/booking-types.js';

const aggregate = new BookingAggregate();

describe('BookingAggregate', () => {
  describe('allowed transitions', () => {
    it.each([
      ['pending', 'confirmed'],
      ['pending', 'cancelled'],
      ['pending', 'expired'],
      ['confirmed', 'completed'],
      ['confirmed', 'cancelled'],
      ['confirmed', 'cancelled_with_fee'],
      ['confirmed', 'checked_in'],
      ['confirmed', 'no_show'],
      ['checked_in', 'completed'],
    ])('allows %s → %s', (from, to) => {
      const result = aggregate.transition(from as BookingStatus, to as BookingStatus);
      expect(result).toBe(to);
    });

    it('allows pending → confirmed with paid paymentStatus', () => {
      const result = aggregate.confirm('pending', { paymentStatus: 'paid', paymentMethod: 'card' });
      expect(result).toBe('confirmed');
    });

    it('allows pending → confirmed with cash payment method', () => {
      const result = aggregate.confirm('pending', { paymentStatus: 'pending', paymentMethod: 'cash' });
      expect(result).toBe('confirmed');
    });

    it('allows pending → confirmed with COD payment method', () => {
      const result = aggregate.confirm('pending', { paymentStatus: 'pending', paymentMethod: 'cod' });
      expect(result).toBe('confirmed');
    });
  });

  describe('forbidden transitions', () => {
    it.each([
      ['pending', 'completed'],
      ['pending', 'checked_in'],
    ])('rejects %s → %s as invalid transition', (from, to) => {
      expect(() => aggregate.transition(from as BookingStatus, to as BookingStatus)).toThrow(
        `Transition from '${from}' to '${to}' is not allowed`,
      );
    });
  });

  describe('terminal states reject all transitions', () => {
    it.each([
      'cancelled', 'cancelled_with_fee', 'no_show', 'completed', 'expired',
    ] as BookingStatus[])('%s rejects all transitions', (status) => {
      expect(() => aggregate.transition(status, 'confirmed')).toThrow(
        `Booking is already in terminal status '${status}'`,
      );
      expect(() => aggregate.transition(status, 'pending')).toThrow(
        `Booking is already in terminal status '${status}'`,
      );
      expect(() => aggregate.transition(status, 'cancelled')).toThrow(
        `Booking is already in terminal status '${status}'`,
      );
    });
  });

  describe('confirm validation', () => {
    it('rejects confirm from non-pending status', () => {
      expect(() => aggregate.confirm('confirmed', { paymentStatus: 'paid' })).toThrow(
        "Cannot confirm booking in 'confirmed' status",
      );
      expect(() => aggregate.confirm('completed', { paymentStatus: 'paid' })).toThrow(
        "Cannot confirm booking in 'completed' status",
      );
    });

    it('rejects confirm without context', () => {
      expect(() => aggregate.confirm('pending')).toThrow('Confirmation context required');
    });

    it('rejects confirm when payment is not paid and method is not cash/COD', () => {
      expect(() => aggregate.confirm('pending', { paymentStatus: 'pending', paymentMethod: 'card' })).toThrow(
        "Cannot confirm booking with payment_status 'pending'",
      );
    });
  });

  describe('checkIn validation', () => {
    it('only allows check-in from confirmed', () => {
      expect(() => aggregate.checkIn('pending')).toThrow(
        "Cannot check in booking in 'pending' status",
      );
      expect(() => aggregate.checkIn('completed')).toThrow(
        "Cannot check in booking in 'completed' status",
      );
    });

    it('allows check-in from confirmed', () => {
      const result = aggregate.checkIn('confirmed');
      expect(result).toBe('checked_in');
    });
  });

  describe('complete validation', () => {
    it('allows complete from confirmed and checked_in', () => {
      expect(aggregate.complete('confirmed')).toBe('completed');
      expect(aggregate.complete('checked_in')).toBe('completed');
    });

    it('rejects complete from pending', () => {
      expect(() => aggregate.complete('pending')).toThrow(
        "Cannot complete booking in 'pending' status",
      );
    });

    it('rejects complete from cancelled', () => {
      expect(() => aggregate.complete('cancelled')).toThrow(
        "Cannot complete booking in 'cancelled' status",
      );
    });
  });

  describe('cancelWithFee validation', () => {
    it('only allows cancelWithFee from confirmed', () => {
      const result = aggregate.cancelWithFee('confirmed');
      expect(result).toBe('cancelled_with_fee');
    });

    it('rejects cancelWithFee from pending', () => {
      expect(() => aggregate.cancelWithFee('pending')).toThrow(
        "Cannot cancel with fee booking in 'pending' status",
      );
    });
  });

  describe('cancel and expire', () => {
    it.each([
      ['pending', 'cancelled'],
      ['confirmed', 'cancelled'],
    ])('allows cancel from %s', (from, to) => {
      expect(aggregate.cancel(from as BookingStatus)).toBe(to);
    });

    it('allows expire from pending', () => {
      expect(aggregate.expire('pending')).toBe('expired');
    });

    it('rejects cancel from terminal', () => {
      expect(() => aggregate.cancel('completed')).toThrow('terminal status');
      expect(() => aggregate.cancel('expired')).toThrow('terminal status');
    });
  });

  describe('noShow validation', () => {
    it('allows noShow from confirmed', () => {
      expect(aggregate.noShow('confirmed')).toBe('no_show');
    });

    it('rejects noShow from pending', () => {
      expect(() => aggregate.noShow('pending')).toThrow(
        "Transition from 'pending' to 'no_show' is not allowed",
      );
    });
  });
});
