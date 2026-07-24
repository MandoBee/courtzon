import { useQueryClient } from '@tanstack/react-query';
import { useSocketEvent } from './useSocket';

/**
 * Centralized realtime cache update handler.
 * Mount ONCE in the app root.
 * Every socket event updates the React Query cache directly.
 */
export function useRealtimeCacheUpdates(): void {
  const qc = useQueryClient();

  // ── Booking events ─────────────────────────────────────────────
  useSocketEvent('booking.created', () => {
    qc.invalidateQueries({ queryKey: ['user-bookings'] });
    qc.invalidateQueries({ queryKey: ['home-upcoming-bookings'] });
    qc.invalidateQueries({ queryKey: ['home-recent-activity'] });
  });

  useSocketEvent('booking.confirmed', (p: any) => {
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
  });

  useSocketEvent('booking.expired', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'expired' } : old);
    qc.invalidateQueries({ queryKey: ['user-bookings'] });
  });

  useSocketEvent('booking.completed', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'completed' } : old);
    qc.invalidateQueries({ queryKey: ['user-bookings'] });
  });

  useSocketEvent('booking.checked_in', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'checked_in' } : old);
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
  });

  // ── Payment events ─────────────────────────────────────────────
  useSocketEvent('payment.completed', () => {
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

  // ── Wallet events ──────────────────────────────────────────────
  useSocketEvent('wallet.deposited', () => {
    qc.invalidateQueries({ queryKey: ['wallet'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  });

  useSocketEvent('wallet.withdrawn', () => {
    qc.invalidateQueries({ queryKey: ['wallet'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  });

  // ── Marketplace events ─────────────────────────────────────────
  useSocketEvent('marketplace.order-placed', () => {
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
    qc.invalidateQueries({ queryKey: ['seller-orders'] });
  });

  useSocketEvent('marketplace.order-confirmed', () => {
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
    qc.invalidateQueries({ queryKey: ['seller-orders'] });
    qc.invalidateQueries({ queryKey: ['mp-cart'] });
  });

  useSocketEvent('marketplace.order-shipped', (p: any) => {
    qc.setQueryData(['mp-order', p.orderId], (old: any) => old ? { ...old, status: 'shipped' } : old);
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
    qc.invalidateQueries({ queryKey: ['seller-orders'] });
  });

  useSocketEvent('marketplace.order-delivered', (p: any) => {
    qc.setQueryData(['mp-order', p.orderId], (old: any) => old ? { ...old, status: 'delivered' } : old);
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
    qc.invalidateQueries({ queryKey: ['seller-orders'] });
  });

  useSocketEvent('marketplace.order-cancelled', (p: any) => {
    qc.setQueryData(['mp-order', p.orderId], (old: any) => old ? { ...old, status: 'cancelled' } : old);
    qc.invalidateQueries({ queryKey: ['mp-orders'] });
    qc.invalidateQueries({ queryKey: ['seller-orders'] });
    qc.invalidateQueries({ queryKey: ['mp-cart'] });
  });

  // ── Notification events ────────────────────────────────────────
  useSocketEvent('notification.new', () => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['notification-unread-count'] });
  });

  useSocketEvent('notification.unread-count', () => {
    qc.invalidateQueries({ queryKey: ['notification-unread-count'] });
  });

  useSocketEvent('notification.sync-read', () => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['notification-unread-count'] });
  });

  useSocketEvent('notification.sync-deleted', () => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['notification-unread-count'] });
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

  // ── Attendance events ──────────────────────────────────────────
  useSocketEvent('attendance.updated', () => {
    qc.invalidateQueries({ queryKey: ['attendance'] });
    qc.invalidateQueries({ queryKey: ['session-attendance'] });
  });

  // ── Settlement events ──────────────────────────────────────────
  useSocketEvent('settlement.completed', () => {
    qc.invalidateQueries({ queryKey: ['settlements'] });
    qc.invalidateQueries({ queryKey: ['seller-settlements'] });
  });

  // ── Organisation events ────────────────────────────────────────
  useSocketEvent('organisation.subscription-renewed', () => {
    qc.invalidateQueries({ queryKey: ['org-subscription'] });
  });

  useSocketEvent('organisation.subscription-expired', () => {
    qc.invalidateQueries({ queryKey: ['org-subscription'] });
  });

  // ── Membership events ──────────────────────────────────────────
  useSocketEvent('membership.renewed', () => {
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
}
