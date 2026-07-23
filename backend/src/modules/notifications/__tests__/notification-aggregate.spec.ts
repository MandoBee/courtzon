import { describe, it, expect } from 'vitest';
import { categorizeEvent, shouldDispatch } from '../domain/notification-aggregate.js';

describe('NotificationAggregate — categorization', () => {
  describe('categorizeEvent', () => {
    it('categorizes booking events as bookings', () => {
      expect(categorizeEvent('booking:created')).toBe('bookings');
      expect(categorizeEvent('booking:confirmed')).toBe('bookings');
      expect(categorizeEvent('booking:cancelled')).toBe('bookings');
    });

    it('categorizes payment/wallet events as payments', () => {
      expect(categorizeEvent('payment:completed')).toBe('payments');
      expect(categorizeEvent('wallet:deposit')).toBe('payments');
    });

    it('categorizes marketplace events as marketplace', () => {
      expect(categorizeEvent('marketplace:order-placed')).toBe('marketplace');
    });

    it('categorizes other events as system', () => {
      expect(categorizeEvent('user:registered')).toBe('system');
      expect(categorizeEvent('auth:login')).toBe('system');
      expect(categorizeEvent('unknown:event')).toBe('system');
    });
  });

  describe('shouldDispatch', () => {
    it('returns true when rate check allows', () => {
      expect(shouldDispatch({ allowed: true })).toBe(true);
    });

    it('returns false when rate check denies', () => {
      expect(shouldDispatch({ allowed: false })).toBe(false);
    });
  });
});
