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
    expect(result!.type).toBe('notification.broadcast');
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

  it('maps booking:created to resource and user rooms with slot info', () => {
    const result = mapDomainEvent('booking:created', {
      bookingId: 10, userId: 42, resourceId: 7, courtId: 7,
      bookingDate: '2026-08-20', startTime: '10:00', endTime: '11:00',
      organisationId: 5, branchId: 3,
    });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('booking.created');
    expect(result!.rooms).toContain('user:42');
    expect(result!.rooms).toContain('resource:7');
    expect(result!.rooms).toContain('organisation:5');
    expect(result!.payload.resourceId).toBe(7);
    expect(result!.payload.bookingDate).toBe('2026-08-20');
  });

  it('maps booking:created with courtId only (legacy service emit)', () => {
    const result = mapDomainEvent('booking:created', { bookingId: 10, userId: 42, courtId: 7 });
    expect(result!.rooms).toContain('resource:7');
    expect(result!.payload.courtId).toBe(7);
  });

  it('maps booking:cancelled with full identity for room resolution', () => {
    const result = mapDomainEvent('booking:cancelled', {
      bookingId: 10, userId: 42, organisationId: 5, branchId: 3, resourceId: 7,
      bookingDate: '2026-08-20', startTime: '10:00', endTime: '11:00', reason: 'User request',
    });
    expect(result!.type).toBe('booking.cancelled');
    expect(result!.rooms).toContain('user:42');
    expect(result!.rooms).toContain('organisation:5');
    expect(result!.rooms).toContain('resource:7');
    expect(result!.payload.reason).toBe('User request');
  });

  it('maps booking:expired/completed without identity to no rooms but type intact', () => {
    const result = mapDomainEvent('booking:expired', { bookingId: 10 });
    expect(result!.type).toBe('booking.expired');
    expect(result!.rooms).toEqual(['booking:10']);
  });

  it('maps user:suspended to user.account.suspended in user room', () => {
    const result = mapDomainEvent('user:suspended', { userId: 42, reason: 'Admin action' });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('user.account.suspended');
    expect(result!.rooms).toContain('user:42');
    expect(result!.payload.reason).toBe('Admin action');
  });

  it('maps user:deleted to user.account.deleted', () => {
    const result = mapDomainEvent('user:deleted', { userId: 42 });
    expect(result!.type).toBe('user.account.deleted');
    expect(result!.rooms).toContain('user:42');
  });

  it('maps security:session-revoked to user.force.logout', () => {
    const result = mapDomainEvent('security:session-revoked', { userId: 42 });
    expect(result!.type).toBe('user.force.logout');
    expect(result!.rooms).toContain('user:42');
  });

  it('maps user.role.changed (dot) to user.roles.changed', () => {
    const result = mapDomainEvent('user.role.changed', { userId: 42, roleSlug: 'coach' });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('user.roles.changed');
    expect(result!.rooms).toContain('user:42');
  });
});
