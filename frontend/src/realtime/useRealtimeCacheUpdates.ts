import { useQueryClient } from '@tanstack/react-query';
import { useSocketEvent } from './useSocket';
import { useAuthStore } from '../store/auth.store';
import { disconnectSocket, createSocket } from './socket-client';

/**
 * Centralized realtime cache update handler.
 * Mount ONCE in the app root.
 * Every socket event updates the React Query cache directly.
 */

/**
 * Query-key prefixes invalidated when the organization registration lifecycle
 * changes server state. Keys mirror the inline keys used by the admin pages:
 * - created: new user + org + cloned org-admin role/scope + pending subscription/request
 * - approved: organisation verified/active, request approved, subscription activated
 * - rejected: request rejected (org stays unverified)
 * React Query prefix-matches, so ['admin','users'] covers every page/filter variant.
 */
export const ORG_LIFECYCLE_INVALIDATIONS = {
  created: [
    ['admin', 'organisations'],
    ['admin-approvals'],
    ['admin', 'users'],
    ['admin', 'roles'],
    ['admin', 'organisation-subscriptions'],
    ['admin', 'dashboard'],
    ['admin', 'dashboard-trends'],
  ],
  approved: [
    ['admin', 'organisations'],
    ['admin-approvals'],
    ['admin', 'organisation-subscriptions'],
    ['org-subscription'],
    ['admin', 'dashboard'],
    ['admin', 'dashboard-trends'],
  ],
  rejected: [
    ['admin', 'organisations'],
    ['admin-approvals'],
    ['admin', 'dashboard'],
  ],
} as const;

export type OrgLifecycleEvent = keyof typeof ORG_LIFECYCLE_INVALIDATIONS;

export function invalidateOrgLifecycle(qc: { invalidateQueries: (opts: { queryKey: readonly string[] }) => void }, event: OrgLifecycleEvent): void {
  for (const queryKey of ORG_LIFECYCLE_INVALIDATIONS[event]) {
    qc.invalidateQueries({ queryKey });
  }
}

/**
 * Player/Seller registrations bypass the org lifecycle events entirely — the
 * backend publishes `user.registered` to the Admin room instead. Keys mirror
 * the org 'created' strategy for the surfaces a new user mutates.
 */
export const USER_REGISTRATION_INVALIDATIONS = [
  ['admin', 'users'],
  ['admin', 'dashboard'],
] as const;

export function invalidateUserRegistration(qc: { invalidateQueries: (opts: { queryKey: readonly string[] }) => void }): void {
  for (const queryKey of USER_REGISTRATION_INVALIDATIONS) {
    qc.invalidateQueries({ queryKey });
  }
}

/**
 * Fired by `accounting.entry-recorded` AFTER a ledger entry + GL projection
 * have durably committed. The `['accounting']` and `['finance']` roots are
 * used exclusively by the Admin Accounting/Finance screens (verified across
 * pages/admin/accounting/* and pages/admin/finance/*) — React Query
 * prefix-matching therefore refreshes exactly those screens (General Ledger,
 * Journal Entries, dashboards, reports, …) without touching any
 * consumer/org query.
 */
export const FINANCE_INVALIDATIONS = [
  ['accounting'],
  ['finance'],
] as const;

export function invalidateFinanceEntries(qc: { invalidateQueries: (opts: { queryKey: readonly string[] }) => void }): void {
  for (const queryKey of FINANCE_INVALIDATIONS) {
    qc.invalidateQueries({ queryKey });
  }
}

/**
 * Fired by `marketplace.product-status-changed` after a product lifecycle
 * transition commits (admin approval/rejection/pause). Covers every audience:
 * player catalog + details, player own-products, seller management, org
 * marketplace, and admin lists. Roots are marketplace-scoped only.
 */
export const MARKETPLACE_PRODUCT_INVALIDATIONS = [
  ['mp-products'],
  ['mp-product'],
  ['mp-player-products'],
  ['mp-seller-products'],
  ['mp-seller-stats'],
  ['org-products'],
  ['product-detail'],
  ['admin-marketplace-products'],
  ['admin-product'],
] as const;

export function invalidateMarketplaceProducts(qc: { invalidateQueries: (opts: { queryKey: readonly string[] }) => void }): void {
  for (const queryKey of MARKETPLACE_PRODUCT_INVALIDATIONS) {
    qc.invalidateQueries({ queryKey });
  }
}
export function useRealtimeCacheUpdates(): void {
  const qc = useQueryClient();

  // ── Booking events ─────────────────────────────────────────────
  const invalidateSlots = (p: any) => {
    if (p?.resourceId && p?.bookingDate) {
      qc.invalidateQueries({ queryKey: ['resource-slots', p.resourceId, p.bookingDate] });
    }
  };

  useSocketEvent('booking.created', (p: any) => {
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
    qc.invalidateQueries({ queryKey: ['home-upcoming-bookings'] });
    qc.invalidateQueries({ queryKey: ['home-recent-activity'] });
    invalidateSlots(p);
  });

  useSocketEvent('booking.confirmed', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'confirmed' } : old);
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
    qc.invalidateQueries({ queryKey: ['home-upcoming-bookings'] });
  });

  useSocketEvent('booking.cancelled', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'cancelled' } : old);
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
    qc.invalidateQueries({ queryKey: ['admin', 'bookings'] });
    qc.invalidateQueries({ queryKey: ['home-upcoming-bookings'] });
    invalidateSlots(p);
  });

  useSocketEvent('booking.expired', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'expired' } : old);
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
    invalidateSlots(p);
  });

  useSocketEvent('booking.completed', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'completed' } : old);
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
  });

  useSocketEvent('booking.checked_in', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'checked_in' } : old);
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
    qc.invalidateQueries({ queryKey: ['admin', 'bookings'] });
  });

  useSocketEvent('booking.refunded', () => {
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
    qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  });

  useSocketEvent('booking.paid', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'paid' } : old);
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
  });

  useSocketEvent('booking.fully-booked', () => {
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
    qc.invalidateQueries({ queryKey: ['home-upcoming-bookings'] });
  });

  useSocketEvent('booking.application-declined', () => {
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
  });

  // ── Payment events ─────────────────────────────────────────────
  useSocketEvent('payment.completed', () => {
    qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
    qc.invalidateQueries({ queryKey: ['mp-order'] });
  });

  useSocketEvent('payment.failed', () => {
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
  });

  useSocketEvent('payment.expired', () => {
    qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
  });

  useSocketEvent('payment.cancelled', () => {
    qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
  });

  useSocketEvent('payment.refunded', () => {
    qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  });

  useSocketEvent('payment.succeeded', () => {
    qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  });

  // ── Wallet events ──────────────────────────────────────────────
  useSocketEvent('wallet.deposit', () => {
    qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  });

  useSocketEvent('wallet.withdrawal', () => {
    qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  });

  useSocketEvent('wallet.transaction', () => {
    qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
    qc.invalidateQueries({ queryKey: ['my-wallet'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  });

  for (const ev of ['wallet.withdrawal-submitted', 'wallet.withdrawal-under-review', 'wallet.withdrawal-approved', 'wallet.withdrawal-rejected', 'wallet.withdrawal-processing', 'wallet.withdrawal-completed', 'wallet.withdrawal-cancelled', 'wallet.withdrawal-assigned']) {
    useSocketEvent(ev, () => {
      qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
      qc.invalidateQueries({ queryKey: ['my-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['admin-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['withdrawal-stats'] });
      qc.invalidateQueries({ queryKey: ['assignable-admins'] });
    });
  }

  // ── Marketplace events ─────────────────────────────────────────
  useSocketEvent('marketplace.product-status-changed', () => {
    invalidateMarketplaceProducts(qc);
  });

  // Visibility changes affect the same Marketplace/Product surfaces.
  useSocketEvent('marketplace.product-visibility-changed', () => {
    invalidateMarketplaceProducts(qc);
  });

  useSocketEvent('marketplace.order-placed', () => {
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
    qc.invalidateQueries({ queryKey: ['mp-seller-orders'] });
  });

  useSocketEvent('marketplace.order-confirmed', () => {
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
    qc.invalidateQueries({ queryKey: ['mp-seller-orders'] });
    qc.invalidateQueries({ queryKey: ['mp-cart'] });
  });

  useSocketEvent('marketplace.order-shipped', (p: any) => {
    qc.setQueryData(['mp-order', p.orderId], (old: any) => old ? { ...old, status: 'shipped' } : old);
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
    qc.invalidateQueries({ queryKey: ['mp-seller-orders'] });
  });

  useSocketEvent('marketplace.order-delivered', (p: any) => {
    qc.setQueryData(['mp-order', p.orderId], (old: any) => old ? { ...old, status: 'delivered' } : old);
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
    qc.invalidateQueries({ queryKey: ['mp-seller-orders'] });
  });

  useSocketEvent('marketplace.order-cancelled', (p: any) => {
    qc.setQueryData(['mp-order', p.orderId], (old: any) => old ? { ...old, status: 'cancelled' } : old);
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
    qc.invalidateQueries({ queryKey: ['mp-seller-orders'] });
    qc.invalidateQueries({ queryKey: ['mp-cart'] });
  });

  useSocketEvent('marketplace.order-status-changed', () => {
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
    qc.invalidateQueries({ queryKey: ['mp-seller-orders'] });
  });

  useSocketEvent('marketplace.order-refunded', (p: any) => {
    qc.setQueryData(['mp-order', p.orderId], (old: any) => old ? { ...old, status: 'refunded' } : old);
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
    qc.invalidateQueries({ queryKey: ['mp-seller-orders'] });
  });

  useSocketEvent('marketplace.new-seller-registered', () => {
    qc.invalidateQueries({ queryKey: ['admin-marketplace-sellers'] });
  });

  // ── Notification events ────────────────────────────────────────
  useSocketEvent('notification.new', () => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['notification-unread-count'] });
    qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
  });

  useSocketEvent('notification.unread-count', () => {
    qc.invalidateQueries({ queryKey: ['notification-unread-count'] });
    qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
  });

  useSocketEvent('notification.sync-read', () => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['notification-unread-count'] });
    qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
  });

  useSocketEvent('notification.sync-deleted', () => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['notification-unread-count'] });
    qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
  });

  // ── Match events ───────────────────────────────────────────────
  useSocketEvent('match.available', () => {
    qc.invalidateQueries({ queryKey: ['public-matches'] });
    qc.invalidateQueries({ queryKey: ['home-upcoming-matches'] });
  });

  useSocketEvent('match.removed', () => {
    qc.invalidateQueries({ queryKey: ['public-matches'] });
  });

  useSocketEvent('match.updated', () => {
    qc.invalidateQueries({ queryKey: ['public-matches'] });
    qc.invalidateQueries({ queryKey: ['home-upcoming-matches'] });
  });

  // ── Academy events ─────────────────────────────────────────────
  useSocketEvent('academy.enrolled', () => {
    qc.invalidateQueries({ queryKey: ['academies'] });
  });

  useSocketEvent('academy.graduated', () => {
    qc.invalidateQueries({ queryKey: ['academies'] });
  });

  // ── Coaching events ────────────────────────────────────────────
  useSocketEvent('coaching.session-scheduled', () => {
    qc.invalidateQueries({ queryKey: ['home-upcoming-bookings'] });
  });

  useSocketEvent('coaching.session-cancelled', () => {
    qc.invalidateQueries({ queryKey: ['home-upcoming-bookings'] });
  });

  // ── Coach lifecycle events ─────────────────────────────────────
  const coachLifecycleEvents = [
    'coach.application-approved', 'coach.application-rejected',
    'coach.verified', 'coach.platform-activated', 'coach.platform-suspended',
    'coach.platform-deactivated', 'coach.availability-changed',
    'coach.invited', 'coach.agreement-added',
    'coach.org-accepted', 'coach.org-rejected', 'coach.org-suspended',
    'coach.org-resumed', 'coach.org-ended',
    'coach.invite-accepted', 'coach.invite-rejected',
  ];

  for (const eventName of coachLifecycleEvents) {
    useSocketEvent(eventName, () => {
      qc.invalidateQueries({ queryKey: ['admin-coaches'] });
      qc.invalidateQueries({ queryKey: ['admin', 'user'] });
      qc.invalidateQueries({ queryKey: ['my-coach-agreements'] });
      qc.invalidateQueries({ queryKey: ['org-coaches'] });
    });
  }

  // ── Settlement events ──────────────────────────────────────────
  useSocketEvent('settlement.completed', () => {
    qc.invalidateQueries({ queryKey: ['settlements'] });
    qc.invalidateQueries({ queryKey: ['booking-settlements'] });
  });

  useSocketEvent('settlement.paid', () => {
    qc.invalidateQueries({ queryKey: ['settlements'] });
    qc.invalidateQueries({ queryKey: ['booking-settlements'] });
  });

  useSocketEvent('settlement.failed', () => {
    qc.invalidateQueries({ queryKey: ['settlements'] });
  });

  // ── Organisation events ────────────────────────────────────────
  useSocketEvent('organisation.subscription-renewed', () => {
    qc.invalidateQueries({ queryKey: ['org-subscription'] });
  });

  useSocketEvent('organisation.subscription-expiring', () => {
    qc.invalidateQueries({ queryKey: ['org-subscription'] });
    qc.invalidateQueries({ queryKey: ['admin', 'organisation-subscriptions'] });
  });

  useSocketEvent('organisation.subscription-expired', () => {
    qc.invalidateQueries({ queryKey: ['org-subscription'] });
  });

  useSocketEvent('organisation.status-changed', () => {
    qc.invalidateQueries({ queryKey: ['admin', 'organisations'] });
    qc.invalidateQueries({ queryKey: ['admin-marketplace-sellers'] });
    qc.invalidateQueries({ queryKey: ['admin', 'organisation-subscriptions'] });
    qc.invalidateQueries({ queryKey: ['organisation'] });
  });

  useSocketEvent('organisation.subscription-status-changed', () => {
    qc.invalidateQueries({ queryKey: ['admin', 'organisations'] });
    qc.invalidateQueries({ queryKey: ['admin-marketplace-sellers'] });
    qc.invalidateQueries({ queryKey: ['admin', 'organisation-subscriptions'] });
    qc.invalidateQueries({ queryKey: ['org-subscription'] });
  });

  useSocketEvent('organisation.approved', () => {
    invalidateOrgLifecycle(qc, 'approved');
    // The owner's scopes changed (org is now verified+active) — refresh auth state
    // so route guards stop showing "Awaiting approval" without a manual re-login.
    void useAuthStore.getState().refreshOrganisations();
  });

  useSocketEvent('organisation.rejected', () => {
    invalidateOrgLifecycle(qc, 'rejected');
    void useAuthStore.getState().refreshOrganisations();
  });

  useSocketEvent('organisation.created', () => {
    invalidateOrgLifecycle(qc, 'created');
  });

  // ── User registration events (player / seller) ─────────────────
  useSocketEvent('user.registered', () => {
    invalidateUserRegistration(qc);
  });

  // ── Accounting events (post-commit ledger entries) ─────────────
  useSocketEvent('accounting.entry-recorded', () => {
    invalidateFinanceEntries(qc);
  });

  const subscriptionRequestEvents = [
    'subscription.request-submitted', 'subscription.request-approved', 'subscription.request-rejected', 'subscription.request-reopened',
  ];
  for (const ev of subscriptionRequestEvents) {
    useSocketEvent(ev, () => {
      qc.invalidateQueries({ queryKey: ['admin', 'subscription-requests'] });
      qc.invalidateQueries({ queryKey: ['org-subscription-requests'] });
      qc.invalidateQueries({ queryKey: ['admin-approvals'] });
      qc.invalidateQueries({ queryKey: ['org-subscription'] });
      qc.invalidateQueries({ queryKey: ['admin', 'organisation-subscriptions'] });
    });
  }

  // ── Membership events ──────────────────────────────────────────
  useSocketEvent('membership.created', () => {
    qc.invalidateQueries({ queryKey: ['membership'] });
  });

  useSocketEvent('membership.renewed', () => {
    qc.invalidateQueries({ queryKey: ['membership'] });
  });

  useSocketEvent('membership.expiring', () => {
    qc.invalidateQueries({ queryKey: ['membership'] });
  });

  useSocketEvent('membership.expired', () => {
    qc.invalidateQueries({ queryKey: ['membership'] });
  });

  // ── Tournament events ──────────────────────────────────────────
  useSocketEvent('tournament.created', () => {
    qc.invalidateQueries({ queryKey: ['tournaments'] });
  });

  useSocketEvent('tournament.match-scheduled', (p: any) => {
    if (p?.tournamentId) {
      qc.invalidateQueries({ queryKey: ['tournament', p.tournamentId] });
      qc.invalidateQueries({ queryKey: ['tournament', p.tournamentId, 'bracket'] });
    }
  });

  useSocketEvent('tournament.result', (p: any) => {
    if (p?.tournamentId) {
      qc.invalidateQueries({ queryKey: ['tournament', p.tournamentId] });
      qc.invalidateQueries({ queryKey: ['tournament', p.tournamentId, 'standings'] });
    }
  });

  // ── Presence events ────────────────────────────────────────────
  useSocketEvent('presence.online', (p: any) => {
    qc.setQueryData(['user-presence', p.userId], () => true);
  });

  useSocketEvent('presence.offline', (p: any) => {
    qc.setQueryData(['user-presence', p.userId], () => false);
  });

  // ── Security / access events (centralized force logout) ────────
  const forceLogout = useAuthStore((s) => s.forceLogout);

  useSocketEvent('user.account.suspended', (p: any) => {
    forceLogout(p?.reason || 'Your account has been suspended');
  });

  useSocketEvent('user.account.deleted', () => {
    forceLogout('Your account has been deleted');
  });

  useSocketEvent('user.force.logout', (p: any) => {
    forceLogout(p?.reason || 'Session terminated by administrator');
  });

  useSocketEvent('user.roles.changed', () => {
    qc.invalidateQueries({ queryKey: ['admin', 'user'] });
    disconnectSocket();
    createSocket();
  });
}
