import { useQueryClient } from '@tanstack/react-query';
import { useSocketEvent } from './useSocket';
import { useAuthStore } from '../store/auth.store';
import { disconnectSocket, createSocket } from './socket-client';

/**
 * Centralized realtime cache update handler.
 * Mount ONCE in the app root.
 * Every socket event updates the React Query cache directly.
 */
export function useRealtimeCacheUpdates(): void {
  const qc = useQueryClient();

  // ── Booking events ─────────────────────────────────────────────
  const invalidateSlots = (p: any) => {
    if (p?.resourceId && p?.bookingDate) {
      qc.invalidateQueries({ queryKey: ['resource-slots', p.resourceId, p.bookingDate] });
    }
  };

  useSocketEvent('booking.created', (p: any) => {
    console.log(`[TRACE][React][${new Date().toISOString()}] [useRealtimeCacheUpdates] booking.created RECEIVED — invalidating queries`);
    qc.invalidateQueries({ queryKey: ['user-bookings'] });
    qc.invalidateQueries({ queryKey: ['home-upcoming-bookings'] });
    qc.invalidateQueries({ queryKey: ['home-recent-activity'] });
    invalidateSlots(p);
  });

  useSocketEvent('booking.confirmed', (p: any) => {
    console.log(`[TRACE][React][${new Date().toISOString()}] [useRealtimeCacheUpdates] booking.confirmed RECEIVED bookingId=${p.bookingId} — updating cache`);
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'confirmed' } : old);
    qc.invalidateQueries({ queryKey: ['user-bookings'] });
    qc.invalidateQueries({ queryKey: ['home-upcoming-bookings'] });
  });

  useSocketEvent('booking.cancelled', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'cancelled' } : old);
    qc.invalidateQueries({ queryKey: ['user-bookings'] });
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
    qc.invalidateQueries({ queryKey: ['admin-bookings'] });
    qc.invalidateQueries({ queryKey: ['home-upcoming-bookings'] });
    invalidateSlots(p);
  });

  useSocketEvent('booking.expired', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'expired' } : old);
    qc.invalidateQueries({ queryKey: ['user-bookings'] });
    invalidateSlots(p);
  });

  useSocketEvent('booking.completed', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'completed' } : old);
    qc.invalidateQueries({ queryKey: ['user-bookings'] });
  });

  useSocketEvent('booking.checked_in', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'checked_in' } : old);
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
  });

  useSocketEvent('booking.refunded', () => {
    qc.invalidateQueries({ queryKey: ['user-bookings'] });
    qc.invalidateQueries({ queryKey: ['payment-history'] });
    qc.invalidateQueries({ queryKey: ['wallet'] });
    qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  });

  // ── Payment events ─────────────────────────────────────────────
  useSocketEvent('payment.completed', () => {
    console.log(`[TRACE][React][${new Date().toISOString()}] [useRealtimeCacheUpdates] payment.completed RECEIVED — invalidating queries`);
    qc.invalidateQueries({ queryKey: ['wallet'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
    qc.invalidateQueries({ queryKey: ['mp-order'] });
    qc.invalidateQueries({ queryKey: ['payment-history'] });
  });

  useSocketEvent('payment.failed', () => {
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
    qc.invalidateQueries({ queryKey: ['payment-history'] });
  });

  useSocketEvent('payment.expired', () => {
    qc.invalidateQueries({ queryKey: ['payment-history'] });
    qc.invalidateQueries({ queryKey: ['wallet'] });
    qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
  });

  useSocketEvent('payment.cancelled', () => {
    qc.invalidateQueries({ queryKey: ['payment-history'] });
    qc.invalidateQueries({ queryKey: ['wallet'] });
    qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
  });

  useSocketEvent('payment.refunded', () => {
    qc.invalidateQueries({ queryKey: ['payment-history'] });
    qc.invalidateQueries({ queryKey: ['wallet'] });
    qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  });

  // ── Wallet events ──────────────────────────────────────────────
  useSocketEvent('wallet.deposit', () => {
    qc.invalidateQueries({ queryKey: ['wallet'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  });

  useSocketEvent('wallet.withdrawal', () => {
    qc.invalidateQueries({ queryKey: ['wallet'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  });

  useSocketEvent('wallet.transaction', () => {
    qc.invalidateQueries({ queryKey: ['wallet'] });
    qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
    qc.invalidateQueries({ queryKey: ['my-wallet'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  });

  for (const ev of ['wallet.withdrawal-submitted', 'wallet.withdrawal-under-review', 'wallet.withdrawal-approved', 'wallet.withdrawal-rejected', 'wallet.withdrawal-processing', 'wallet.withdrawal-completed', 'wallet.withdrawal-cancelled', 'wallet.withdrawal-assigned']) {
    useSocketEvent(ev, () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
      qc.invalidateQueries({ queryKey: ['my-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['admin-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['withdrawal-stats'] });
      qc.invalidateQueries({ queryKey: ['assignable-admins'] });
    });
  }

  // ── Marketplace events ─────────────────────────────────────────
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

  useSocketEvent('match.pending', () => {
    qc.invalidateQueries({ queryKey: ['my-matches'] });
  });

  // ── Academy events ─────────────────────────────────────────────
  useSocketEvent('academy.enrolled', () => {
    qc.invalidateQueries({ queryKey: ['academies'] });
    qc.invalidateQueries({ queryKey: ['my-academies'] });
  });

  useSocketEvent('academy.graduated', () => {
    qc.invalidateQueries({ queryKey: ['academies'] });
    qc.invalidateQueries({ queryKey: ['my-academies'] });
  });

  // ── Coaching events ────────────────────────────────────────────
  useSocketEvent('coaching.session-scheduled', () => {
    qc.invalidateQueries({ queryKey: ['coach-sessions'] });
    qc.invalidateQueries({ queryKey: ['coach-availability'] });
  });

  useSocketEvent('coaching.session-cancelled', () => {
    qc.invalidateQueries({ queryKey: ['coach-sessions'] });
    qc.invalidateQueries({ queryKey: ['coach-availability'] });
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
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['admin-coaches'] });
      qc.invalidateQueries({ queryKey: ['admin', 'user'] });
      qc.invalidateQueries({ queryKey: ['my-coach-agreements'] });
      qc.invalidateQueries({ queryKey: ['org-coaches'] });
      qc.invalidateQueries({ queryKey: ['coach-profile'] });
    });
  }

  // ── Attendance events ──────────────────────────────────────────
  useSocketEvent('attendance.updated', () => {
    qc.invalidateQueries({ queryKey: ['attendance'] });
    qc.invalidateQueries({ queryKey: ['session-attendance'] });
  });

  // ── Settlement events ──────────────────────────────────────────
  useSocketEvent('settlement.completed', () => {
    qc.invalidateQueries({ queryKey: ['settlements'] });
    qc.invalidateQueries({ queryKey: ['seller-settlements'] });
    qc.invalidateQueries({ queryKey: ['org-settlements'] });
    qc.invalidateQueries({ queryKey: ['booking-settlements'] });
  });

  useSocketEvent('settlement.paid', () => {
    qc.invalidateQueries({ queryKey: ['settlements'] });
    qc.invalidateQueries({ queryKey: ['seller-settlements'] });
    qc.invalidateQueries({ queryKey: ['org-settlements'] });
    qc.invalidateQueries({ queryKey: ['booking-settlements'] });
  });

  useSocketEvent('settlement.failed', () => {
    qc.invalidateQueries({ queryKey: ['settlements'] });
    qc.invalidateQueries({ queryKey: ['seller-settlements'] });
    qc.invalidateQueries({ queryKey: ['org-settlements'] });
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

  // Organisation Status changed (Active ↔ Suspended)
  useSocketEvent('organisation.status-changed', () => {
    qc.invalidateQueries({ queryKey: ['admin', 'organisations'] });
    qc.invalidateQueries({ queryKey: ['admin-marketplace-sellers'] });
    qc.invalidateQueries({ queryKey: ['admin', 'organisation-subscriptions'] });
    qc.invalidateQueries({ queryKey: ['organisation'] });
  });

  // Subscription Status changed (Active ↔ Suspended)
  useSocketEvent('organisation.subscription-status-changed', () => {
    qc.invalidateQueries({ queryKey: ['admin', 'organisations'] });
    qc.invalidateQueries({ queryKey: ['admin-marketplace-sellers'] });
    qc.invalidateQueries({ queryKey: ['admin', 'organisation-subscriptions'] });
    qc.invalidateQueries({ queryKey: ['org-subscription'] });
  });

  // Subscription request lifecycle (submit / approve / reject)
  const subscriptionRequestEvents = [
    'subscription.request-submitted', 'subscription.request-approved', 'subscription.request-rejected',
  ];
  for (const ev of subscriptionRequestEvents) {
    useSocketEvent(ev, () => {
      qc.invalidateQueries({ queryKey: ['admin', 'subscription-requests'] });
      qc.invalidateQueries({ queryKey: ['org-subscription-requests'] });
      qc.invalidateQueries({ queryKey: ['admin-approvals'] });
      qc.invalidateQueries({ queryKey: ['org-subscription'] });
    });
  }

  // ── Membership events ──────────────────────────────────────────
  useSocketEvent('membership.created', () => {
    qc.invalidateQueries({ queryKey: ['memberships'] });
  });

  useSocketEvent('membership.renewed', () => {
    qc.invalidateQueries({ queryKey: ['memberships'] });
  });

  useSocketEvent('membership.expiring', () => {
    qc.invalidateQueries({ queryKey: ['memberships'] });
  });

  useSocketEvent('membership.expired', () => {
    qc.invalidateQueries({ queryKey: ['memberships'] });
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
    qc.invalidateQueries({ queryKey: ['me'] });
    qc.invalidateQueries({ queryKey: ['admin', 'user'] });
    // Refresh socket room membership (role/admin/org rooms) for the new role set.
    disconnectSocket();
    createSocket();
  });
}
