import { describe, it, expect } from 'vitest';
import { mapDomainEvent } from '../application/socket-event-mapper.js';

describe('SocketEventMapper', () => {
  it('maps booking:confirmed', () => {
    const result = mapDomainEvent('booking:confirmed', { bookingId: 1, userId: 42 });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('booking.confirmed');
    expect(result!.rooms).toContain('user:42');
  });

  it('maps payment:completed', () => {
    const result = mapDomainEvent('payment:completed', { paymentId: 1, userId: 42, amount: 100 });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('payment.completed');
    expect(result!.rooms).toContain('user:42');
  });

  it('maps wallet:deposit', () => {
    const result = mapDomainEvent('wallet:deposit', { walletId: 1, userId: 42, amount: 50, balance: 500 });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('wallet.deposit');
  });

  it('maps marketplace:order-placed with seller', () => {
    const result = mapDomainEvent('marketplace:order-placed', { orderId: 1, userId: 42, sellerId: 7 });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('marketplace.order-placed');
    expect(result!.rooms).toContain('user:42');
    expect(result!.rooms).toContain('marketplace:seller:7');
  });

  it('maps notification:broadcast', () => {
    const result = mapDomainEvent('notification:broadcast', { notificationId: 1, userId: 42, title: 'Test' });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('notification.new');
  });

  it('maps settlement:completed', () => {
    const result = mapDomainEvent('settlement:completed', { settlementId: 1, organisationId: 5, amount: 1000 });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('settlement.completed');
    expect(result!.rooms).toContain('organisation:5');
    expect(result!.rooms).toContain('finance');
  });

  it('returns null for unmapped event', () => {
    const result = mapDomainEvent('unknown:event', {});
    expect(result).toBeNull();
  });
});
