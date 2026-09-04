import { describe, it, expect } from 'vitest';
import { mapDomainEvent } from '../application/socket-event-mapper.js';

describe('SocketEventMapper', () => {
  it('maps booking:confirmed', () => {
    const result = mapDomainEvent('booking:confirmed', { bookingId: 1, userId: 42 });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('booking.confirmed');
    expect(result!.rooms).toContain('user:42');
  });

  it('routes booking:confirmed to the organisation + resource rooms when org/resource are present', () => {
    // Regression: ConfirmBooking previously emitted without organisationId, so
    // the org/admin screens never received the confirmation in realtime. The
    // event must now carry org + resource scope so it reaches those rooms.
    const result = mapDomainEvent('booking:confirmed', {
      bookingId: 1,
      userId: 42,
      organisationId: 9,
      resourceId: 7,
      courtId: 7,
    });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('booking.confirmed');
    expect(result!.rooms).toContain('booking:1');
    expect(result!.rooms).toContain('user:42');
    expect(result!.rooms).toContain('organisation:9');
    expect(result!.rooms).toContain('resource:7');
    // Super Admin global bookings screen subscribes to the admin room.
    expect(result!.rooms).toContain('admin');
  });

  it('routes booking:no-show to the organisation + resource rooms', () => {
    const result = mapDomainEvent('booking:no-show', {
      bookingId: 5,
      userId: 42,
      organisationId: 9,
      resourceId: 7,
    });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('booking.no_show');
    expect(result!.rooms).toContain('organisation:9');
    expect(result!.rooms).toContain('resource:7');
    expect(result!.rooms).toContain('admin');
  });

  it('routes booking:check-in to the organisation room', () => {
    const result = mapDomainEvent('booking:check-in', {
      bookingId: 5,
      userId: 42,
      organisationId: 9,
      resourceId: 7,
    });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('booking.checked_in');
    expect(result!.rooms).toContain('organisation:9');
    expect(result!.rooms).toContain('admin');
  });

  it('routes booking:paid to the admin + finance rooms (accounting refresh)', () => {
    const result = mapDomainEvent('booking:paid', {
      bookingId: 5,
      userId: 42,
      organisationId: 9,
      resourceId: 7,
      paymentMethod: 'card',
      grossAmount: 100,
    });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('booking.paid');
    expect(result!.rooms).toContain('admin');
    expect(result!.rooms).toContain('finance');
    expect(result!.rooms).toContain('organisation:9');
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

  // ── entitlement:activated (marketplace delivery realtime) ──
  describe('entitlement:activated', () => {
    it('routes an org entitlement activation to the organisation and finance rooms', () => {
      const result = mapDomainEvent('entitlement:activated', {
        entitlementId: 55, publicId: 'ENT-ABC', organisationId: 6,
        entitlementType: 'ORGANIZATION_EARNING', sourceType: 'marketplace',
        sourceId: 101, amount: 1200, currency: 'EGP',
      });
      expect(result).not.toBeNull();
      expect(result!.type).toBe('entitlement.activated');
      expect(result!.rooms).toContain('organisation:6');
      expect(result!.rooms).toContain('finance');
      expect(result!.payload).toMatchObject({
        entitlementId: 55, publicId: 'ENT-ABC', organisationId: 6,
        entitlementType: 'ORGANIZATION_EARNING', sourceType: 'marketplace',
        sourceId: 101, amount: 1200, currency: 'EGP',
      });
    });

    it('routes to finance only when no organisation scope is present', () => {
      const result = mapDomainEvent('entitlement:activated', {
        entitlementId: 1, publicId: 'X', organisationId: null,
        entitlementType: 'COURTZON_COMMISSION', sourceType: 'marketplace',
        amount: 80, currency: 'EGP',
      });
      expect(result!.type).toBe('entitlement.activated');
      expect(result!.rooms).toEqual(['finance']);
      expect(result!.rooms).not.toContain('organisation:null');
    });
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

  it('maps booking:expired/completed without identity to admin + booking rooms but type intact', () => {
    const result = mapDomainEvent('booking:expired', { bookingId: 10 });
    expect(result!.type).toBe('booking.expired');
    expect(result!.rooms).toContain('booking:10');
    expect(result!.rooms).toContain('admin');
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

  // ── Organisation registration lifecycle (admin visibility regression) ──
  it('routes organisation:created to the admin room', () => {
    const result = mapDomainEvent('organisation:created', { organisationId: 5, name: 'Org', userId: 42 });
    expect(result!.type).toBe('organisation.created');
    expect(result!.rooms).toContain('admin');
    expect(result!.rooms).toContain('organisation:5');
  });

  it('routes organisation:approved to the admin room (was fall-through without admin)', () => {
    const result = mapDomainEvent('organisation:approved', { organisationId: 5, name: 'Org', userId: 42 });
    expect(result!.type).toBe('organisation.approved');
    expect(result!.rooms).toContain('admin');
    expect(result!.rooms).toContain('organisation:5');
    expect(result!.rooms).toContain('user:42');
  });

  it('routes organisation:rejected to the admin room with reason', () => {
    const result = mapDomainEvent('organisation:rejected', { organisationId: 5, userId: 42, reason: 'Incomplete documents' });
    expect(result!.type).toBe('organisation.rejected');
    expect(result!.rooms).toContain('admin');
    expect(result!.payload.reason).toBe('Incomplete documents');
  });

  it('routes subscription:request-submitted to the admin room for self-registration', () => {
    const result = mapDomainEvent('subscription:request-submitted', {
      organisationId: 5, userId: 42, requestId: 9, requestType: 'organization',
    });
    expect(result!.type).toBe('subscription.request-submitted');
    expect(result!.rooms).toContain('admin');
    expect(result!.rooms).toContain('organisation:5');
    expect(result!.rooms).toContain('user:42');
    expect(result!.payload.requestId).toBe(9);
  });

  // ── Issue 2: approval/status changes must reach the OWNER's personal room ──
  // Owners are not members of the organisation room (user_organisations is
  // never populated) — without user:{ownerId} targeting the org portal guard
  // keeps showing "Awaiting approval" until a manual refresh.
  describe('organisation:status-changed owner targeting (Issue 2)', () => {
    it('routes an activation to admin + organisation + owner rooms', () => {
      const result = mapDomainEvent('organisation:status-changed', { organisationId: 6, userId: 77, status: 'active' });
      expect(result!.type).toBe('organisation.status-changed');
      expect(result!.rooms).toContain('admin');
      expect(result!.rooms).toContain('organisation:6');
      expect(result!.rooms).toContain('user:77');
    });

    it('still reaches admin when no owner is supplied (legacy emitters)', () => {
      const result = mapDomainEvent('organisation:status-changed', { organisationId: 6, status: 'suspended' });
      expect(result!.rooms).toContain('admin');
      expect(result!.rooms).toContain('organisation:6');
    });
  });

  describe('organisation:subscription-status-changed owner targeting (Issue 2)', () => {
    it('routes a subscription toggle to admin + organisation + owner rooms', () => {
      const result = mapDomainEvent('organisation:subscription-status-changed', { organisationId: 6, userId: 77, subscriptionStatus: 'active' });
      expect(result!.type).toBe('organisation.subscription-status-changed');
      expect(result!.rooms).toContain('admin');
      expect(result!.rooms).toContain('organisation:6');
      expect(result!.rooms).toContain('user:77');
    });

    it('renewal promotion payload carries the owner id for scope refresh', () => {
      const result = mapDomainEvent('organisation:subscription-status-changed', { organisationId: 9, userId: 31, subscriptionStatus: 'active' });
      expect(result!.payload.userId).toBe(31);
      expect(result!.payload.subscriptionStatus).toBe('active');
    });
  });

  // ── user:registered (player/seller) → Admin Users realtime refresh ──
  describe('user:registered', () => {
    it('routes player registration to the admin room with the user payload', () => {
      const result = mapDomainEvent('user:registered', { userId: 77, name: 'New Player', userType: 'player' });
      expect(result).not.toBeNull();
      expect(result!.type).toBe('user.registered');
      expect(result!.rooms).toEqual(['admin']);
      expect(result!.payload).toMatchObject({ userId: 77, userType: 'player' });
    });

    it('routes seller registration to the admin room with the user payload', () => {
      const result = mapDomainEvent('user:registered', { userId: 88, name: 'New Seller', userType: 'seller' });
      expect(result).not.toBeNull();
      expect(result!.type).toBe('user.registered');
      expect(result!.rooms).toEqual(['admin']);
      expect(result!.payload).toMatchObject({ userId: 88, userType: 'seller' });
    });

    it('does NOT rely on the freshly-created personal user room (regression: admin list staleness)', () => {
      const result = mapDomainEvent('user:registered', { userId: 99, name: 'X', userType: 'player' });
      expect(result!.rooms).not.toContain('user:99');
    });
  });

  // ── accounting:entry-recorded (post-commit ledger signal) ──
  describe('accounting:entry-recorded', () => {
    it('routes a committed subscription cash entry to admin, finance and the organisation room', () => {
      const result = mapDomainEvent('accounting:entry-recorded', {
        eventType: 'subscription_cash_payment', sourceType: 'subscription', sourceId: 33, organisationId: 12,
      });
      expect(result).not.toBeNull();
      expect(result!.type).toBe('accounting.entry-recorded');
      expect(result!.rooms).toContain('admin');
      expect(result!.rooms).toContain('finance');
      expect(result!.rooms).toContain('organisation:12');
    });

    it('routes org-scoped entries to the organisation room, platform entries do not', () => {
      const orgResult = mapDomainEvent('accounting:entry-recorded', {
        eventType: 'card_payment', sourceType: 'subscription', sourceId: 34, organisationId: 7,
      });
      expect(orgResult!.rooms).toEqual(['admin', 'finance', 'organisation:7']);

      const platformResult = mapDomainEvent('accounting:entry-recorded', {
        eventType: 'card_payment', sourceType: 'subscription', sourceId: 34, organisationId: null,
      });
      expect(platformResult!.type).toBe('accounting.entry-recorded');
      expect(platformResult!.rooms).toEqual(['admin', 'finance']);
      expect(platformResult!.rooms).not.toContain('organisation:null');
    });

    it('carries the payload needed to scope a targeted refetch', () => {
      const result = mapDomainEvent('accounting:entry-recorded', {
        eventType: 'booking_card_payment', sourceType: 'booking', sourceId: 55, organisationId: 3,
      });
      expect(result!.payload).toMatchObject({
        eventType: 'booking_card_payment', sourceType: 'booking', sourceId: 55, organisationId: 3,
      });
      expect(result!.rooms).toContain('organisation:3');
    });
  });

  // ── marketplace:product-status-changed (approval realtime) ──
  describe('marketplace:product-status-changed', () => {
    it('D: org product approval reaches seller, organisation, player and admin rooms', () => {
      const result = mapDomainEvent('marketplace:product-status-changed', {
        productId: 501, name: 'Racket', previousStatus: 'pending', status: 'active',
        sellerType: 'org', organisationId: 77, sellerUserId: null,
      });
      expect(result!.type).toBe('marketplace.product-status-changed');
      expect(result!.rooms).toContain('marketplace:seller:77');
      expect(result!.rooms).toContain('organisation:77');
      expect(result!.rooms).toContain('player');
      expect(result!.rooms).toContain('admin');
    });

    it('player-seller products reach the owner personal room instead of org rooms', () => {
      const result = mapDomainEvent('marketplace:product-status-changed', {
        productId: 502, status: 'rejected', previousStatus: 'pending',
        sellerType: 'player', organisationId: null, sellerUserId: 901,
      });
      expect(result!.rooms).toContain('user:901');
      expect(result!.rooms).not.toContain('organisation:null');
      expect(result!.rooms).toContain('player');
      expect(result!.rooms).toContain('admin');
    });
  });

  // ── marketplace:product-visibility-changed ──
  describe('marketplace:product-visibility-changed', () => {
    it('15+16+17: hide reaches admin, seller/org, and player catalog rooms', () => {
      const result = mapDomainEvent('marketplace:product-visibility-changed', {
        productId: 505, name: 'Racket', visible: false, status: 'active',
        sellerType: 'org', organisationId: 77, sellerUserId: null,
      });
      expect(result!.type).toBe('marketplace.product-visibility-changed');
      expect(result!.payload).toMatchObject({ productId: 505, visible: false, status: 'active' });
      expect(result!.rooms).toContain('admin');
      expect(result!.rooms).toContain('player');
      expect(result!.rooms).toContain('marketplace:seller:77');
      expect(result!.rooms).toContain('organisation:77');
    });

    it('player-seller visibility reaches owner personal room', () => {
      const result = mapDomainEvent('marketplace:product-visibility-changed', {
        productId: 506, visible: true, status: 'active',
        sellerType: 'player', organisationId: null, sellerUserId: 901,
      });
      expect(result!.rooms).toContain('user:901');
      expect(result!.rooms).not.toContain('organisation:null');
    });
  });
});
