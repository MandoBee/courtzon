import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSocketEvent } from './useSocket';
import { useAuthStore } from '../store/auth.store';
import { disconnectSocket, createSocket, getSocketState, onSocketStateChange } from './socket-client';

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
 * Journal Entries, dashboards, reports, …). `['account-ledger']` covers the
 * shared account ledger drill-down modal used by both Super Admin and org
 * reports. This never touches consumer queries.
 */
export const FINANCE_INVALIDATIONS = [
  ['accounting'],
  ['finance'],
  ['account-ledger'],
  ['year-close'],
] as const;

export function invalidateFinanceEntries(qc: QueryClient): void {
  for (const queryKey of FINANCE_INVALIDATIONS) {
    qc.invalidateQueries({ queryKey, type: 'all' });
  }
}

/**
 * Org-scoped accounting/finance query roots. These keys are owned by the
 * organisation portal (Org Accounting Records, Accounting Dashboard, Chart of
 * Accounts, Trial Balance / Income Statement / Balance Sheet, Tax Summary,
 * Financial Position, transactions/settlements, booking settlements). All of
 * them embed the organisation id in the key, so invalidation is additionally
 * narrowed by a predicate that matches only the changed organisation — the org
 * room signal carries organisationId, keeping the refresh scoped to that org.
 */
export const ORG_ACCOUNTING_ROOTS = [
  ['org', 'accounting'],
  ['org-position'],
  ['org-transactions'],
  ['org-settlements'],
  ['org-settlement-detail'],
  ['org', 'booking-settlements'],
] as const;

export function invalidateOrgAccounting(
  qc: QueryClient,
  organisationId: number | null | undefined,
): void {
  if (organisationId == null) return; // platform-only entry — no organisation impact
  const orgId = String(organisationId);
  for (const root of ORG_ACCOUNTING_ROOTS) {
    qc.invalidateQueries({
      queryKey: root,
      type: 'all',
      predicate: (query: any) => {
        const key = query?.queryKey;
        return Array.isArray(key) && key.some((part: unknown) => String(part) === orgId);
      },
    });
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

/**
 * Tournament draw/progression invalidations (Group 5B). Any of these signals
 * mutates the bracket, the tournament header and/or the standings — so the
 * detail page (query keys `['tournament', <id>]`, `['tournament', <id>,
 * 'bracket']`, `['tournament', <id>', 'standings']`) refreshes live. Page ids
 * are route strings, so the numeric backend id is converted with String().
 */
export const TOURNAMENT_REALTIME_EVENTS = [
  'tournament.bracket-generated',
  'tournament.match-created',
  'tournament.match-progressed',
  'tournament.stage-completed',
  'tournament.completed',
] as const;

export function invalidateTournament(
  qc: { invalidateQueries: (opts: { queryKey: readonly (string | number)[] }) => void },
  tournamentId: number | null | undefined,
): void {
  if (tournamentId == null) return;
  const id = String(tournamentId);
  // React Query treats numbers and strings as distinct key elements, so both the
  // string (realtime) and numeric (screen) forms are invalidated.
  qc.invalidateQueries({ queryKey: ['tournament', id] });
  qc.invalidateQueries({ queryKey: ['tournament', tournamentId] });
  qc.invalidateQueries({ queryKey: ['tournaments'] });
  // Admin/org tournament workbench surfaces (T-B): the matches screen and the
  // admin tournament roots must refresh after draw/progression/result. Org
  // detail roots are org-scoped (orgId unknown here) and are handled by the
  // org portal's own listeners when the org UI lands (T-C).
  qc.invalidateQueries({ queryKey: ['tournament-admin-matches'] });
  qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
}

/**
 * G8-D-MINIMAL — targeted invalidation of the authoritative tournament
 * standings query key. Result correction (and automatic no-result expiry
 * reconciliation) re-emits `tournament.updated` with `standings: true`; that
 * payload must refresh the standings screen, scoped to the exact tournament,
 * without invalidating unrelated tournament queries.
 */
export function invalidateTournamentStandings(
  qc: { invalidateQueries: (opts: { queryKey: readonly (string | number)[] }) => void },
  tournamentId: number | null | undefined,
): void {
  if (tournamentId == null) return;
  const id = String(tournamentId);
  // Both numeric (screen) and string (realtime) key forms — mirrors
  // invalidateTournament's dual-form convention.
  qc.invalidateQueries({ queryKey: ['tournament', id, 'standings'] });
  qc.invalidateQueries({ queryKey: ['tournament', tournamentId, 'standings'] });
}

/**
 * Coach lifecycle invalidation keys. These fire on agreement accepted/rejected/
 * invited/ended, approval/status changes, and availability toggles — all of
 * which can change a coach's eligibility at a contract-required branch. The
 * branch-eligibility surfaces (coaches directory + scheduling candidate lists)
 * are included so search and booking never reflect stale eligibility.
 */
export const COACH_LIFECYCLE_INVALIDATIONS = [
  ['admin-coaches'],
  ['admin', 'user'],
  ['my-coach-agreements'],
  ['my-coach-availability'],
  ['org-coaches'],
  // Per-coach agreement list (CoachDetailPage) + coach detail.
  ['coach-agreements'],
  ['coach'],
  // Branch-eligibility surfaces.
  ['coaches'],
  ['scheduling-search'],
  ['scheduling-search-resource'],
] as const;

/**
 * Group 5 — canonical socket event names for the Match / Result surface. Kept
 * here so the cache hook and its tests share ONE source of truth with the
 * backend subscription list.
 */
export const MATCH_LIFECYCLE_SOCKET_EVENTS = [
  'match.created',
  'match.status_changed',
  'match.cancelled',
  'match.completed',
  'match.updated',
  'match.available',
  'match.removed',
  'match.pending',
  'participant.added',
  'participant.removed',
  'session.started',
  'session.completed',
  'invitation.sent',
  'invitation.declined',
  'invitation.expired',
  'join_request.submitted',
  'join_request.approved',
  'join_request.rejected',
  'join_request.withdrawn',
  'join_request.auto_rejected',
  'waiting_list.entry_added',
  'waiting_list.entry_removed',
  'waiting_list.promoted',
] as const;

export const MATCH_RESULT_SOCKET_EVENTS = [
  'match.result-submitted',
  'match.result-approved',
  'match.result-auto-approved',
  'match.result-disputed',
  'match.result-resolved',
  'match.result-rejected',
  'match.result-corrected',
  'match.result-no-result',
  'match.result-withdrawn',
] as const;

export function invalidateMatchKeys(qc: QueryClient, p: Record<string, any> | undefined): void {
  for (const queryKey of [
    ['public-matches'],
    ['my-matches'],
    ['home-upcoming-matches'],
    ['matches', 'upcoming'],
    ['match-result'],
    ['admin-matches'],
    ['org-matches'],
    ['admin-match-results'],
    ['org-match-results'],
  ]) {
    qc.invalidateQueries({ queryKey });
  }

  if (p?.matchId != null) {
    const matchId = Number(p.matchId);
    for (const key of [
      ['match', matchId],
      ['match', String(matchId)],
      ['match-result', matchId],
      ['match-result', String(matchId)],
    ]) {
      qc.invalidateQueries({ queryKey: key });
    }
  }

  if (p?.bookingId != null) {
    const bookingId = Number(p.bookingId);
    qc.invalidateQueries({ queryKey: ['match-applicants', bookingId] });
    qc.invalidateQueries({ queryKey: ['match-applicants', String(bookingId)] });
  }

  if (p?.tournamentId != null) {
    invalidateTournament(qc, Number(p.tournamentId));
  }
}

/**
 * Refresh every Match/Result/Tournament cache the current device could be
 * holding after a socket reconnect, so stale in-memory data cannot survive a
 * dropped connection (minimal, cache-centred reconciliation; no replay).
 */
export function invalidateRealtimeReconcile(qc: { invalidateQueries: (opts: { queryKey: readonly (string | number)[] }) => void }): void {
  for (const queryKey of [
    ['public-matches'],
    ['my-matches'],
    ['home-upcoming-matches'],
    ['matches', 'upcoming'],
    ['match-result'],
    ['admin-matches'],
    ['org-matches'],
    ['admin-match-results'],
    ['org-match-results'],
    ['match-applicants'],
    ['tournaments'],
    ['tournament-admin-matches'],
    ['admin-tournaments'],
    ['my-tournaments'],
    ['tournament-participants'],
    ['tournament-waitlist'],
    ['tournament-matches'],
    ['tournament-schedule'],
    ['player-nav-counts'],
  ]) {
    qc.invalidateQueries({ queryKey });
  }
}

/**
 * G7-E — Tournament registration/lifecycle realtime reconciliation (targeted).
 * A registration/waitlist/promotion/cancellation touches the tournament's
 * detail, participants, waitlist, my-tournaments and admin/org lists.
 */
export function invalidateRegistrationLifecycle(
  qc: { invalidateQueries: (opts: { queryKey: readonly (string | number)[] }) => void },
  p: Record<string, any> | undefined,
): void {
  invalidateTournament(qc, p?.tournamentId);
  qc.invalidateQueries({ queryKey: ['my-tournaments'] });
  if (p?.tournamentId != null) {
    const id = String(p.tournamentId);
    qc.invalidateQueries({ queryKey: ['tournament', id, 'participants'] });
    qc.invalidateQueries({ queryKey: ['tournament', id, 'waitlist'] });
    qc.invalidateQueries({ queryKey: ['tournament-participants', p.tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament-participants', id] });
    qc.invalidateQueries({ queryKey: ['tournament-waitlist', p.tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament-waitlist', id] });
  }
}

export function useRealtimeCacheUpdates(): void {
  const qc = useQueryClient();

  // Group 5 — reconnect reconciliation. When the socket drops and reconnects,
  // events emitted while disconnected are NOT replayed (deferred durability
  // architecture). The minimal, cache-centred safety net is to refetch the
  // match/result/tournament surfaces so no stale in-memory state survives.
  const previousSocketStateRef = useRef(getSocketState());
  useEffect(() => {
    const unsub = onSocketStateChange((next) => {
      const previous = previousSocketStateRef.current;
      previousSocketStateRef.current = next;
      if (next === 'connected' && (previous === 'disconnected' || previous === 'reconnecting')) {
        invalidateRealtimeReconcile(qc);
      }
    });
    return unsub;
  }, [qc]);

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
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
    qc.invalidateQueries({ queryKey: ['admin', 'bookings'] });
    invalidateSlots(p);
  });

  useSocketEvent('booking.confirmed', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'confirmed', payment_status: old.payment_status || 'pending' } : old);
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
    qc.invalidateQueries({ queryKey: ['admin', 'bookings'] });
    qc.invalidateQueries({ queryKey: ['home-upcoming-bookings'] });
  });

  useSocketEvent('booking.rejected', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'rejected' } : old);
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
    qc.invalidateQueries({ queryKey: ['admin', 'bookings'] });
    invalidateSlots(p);
  });

  useSocketEvent('booking.updated', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, ...(p.status ? { booking_status: p.status } : {}) } : old);
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
    qc.invalidateQueries({ queryKey: ['admin', 'bookings'] });
    invalidateSlots(p);
  });

  useSocketEvent('booking.rescheduled', (p: any) => {
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
    qc.invalidateQueries({ queryKey: ['admin', 'bookings'] });
    qc.invalidateQueries({ queryKey: ['home-upcoming-bookings'] });
    invalidateSlots(p);
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
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
    qc.invalidateQueries({ queryKey: ['admin', 'bookings'] });
    invalidateSlots(p);
  });

  useSocketEvent('booking.completed', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'completed' } : old);
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
    qc.invalidateQueries({ queryKey: ['admin', 'bookings'] });
  });

  useSocketEvent('booking.no_show', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'no_show' } : old);
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
    qc.invalidateQueries({ queryKey: ['admin', 'bookings'] });
  });

  useSocketEvent('booking.checked_in', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, booking_status: 'checked_in' } : old);
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
    qc.invalidateQueries({ queryKey: ['admin', 'bookings'] });
  });

  useSocketEvent('booking.refunded', () => {
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
    qc.invalidateQueries({ queryKey: ['admin', 'bookings'] });
    qc.invalidateQueries({ queryKey: ['wallet', 'me'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  });

  useSocketEvent('booking.paid', (p: any) => {
    qc.setQueryData(['booking', p.bookingId], (old: any) => old ? { ...old, payment_status: 'paid', booking_status: old.booking_status || 'confirmed' } : old);
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
    qc.invalidateQueries({ queryKey: ['org-bookings'] });
    qc.invalidateQueries({ queryKey: ['admin', 'bookings'] });
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

  // Platform broadcasts reach every player room; the recipient's own
  // notifications list + unread counter must refresh live.
  useSocketEvent('notification.broadcast', () => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['notification-unread-count'] });
    qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
  });

  // ── Chat events ────────────────────────────────────────────────
  // A new message bumps the conversations list (last message + unread count)
  // and refreshes the open thread cache. Prefix invalidation covers every
  // conversation thread this device currently holds in cache.
  useSocketEvent('chat.new-message', (p: any) => {
    qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    qc.invalidateQueries({ queryKey: ['chat-messages'] });
    if (p?.conversationId) {
      qc.invalidateQueries({ queryKey: ['chat-group-info', p.conversationId] });
    }
  });

  useSocketEvent('chat.group-invitation', () => {
    qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    qc.invalidateQueries({ queryKey: ['chat-invitations'] });
  });

  useSocketEvent('chat.group-created', () => {
    qc.invalidateQueries({ queryKey: ['chat-conversations'] });
  });

  useSocketEvent('chat.group-joined', () => {
    qc.invalidateQueries({ queryKey: ['chat-conversations'] });
  });

  // ── Match events ───────────────────────────────────────────────
  // Every lifecycle signal invalidates the match detail, result page, applicant
  // roster and the public/home/admin/org lists. Tenant scoping happens on the
  // server; here we simply refresh whatever the event reaches.
  useSocketEvent('match.available', (p: any) => {
    invalidateMatchKeys(qc, p);
  });

  useSocketEvent('match.removed', (p: any) => {
    invalidateMatchKeys(qc, p);
  });

  useSocketEvent('match.updated', (p: any) => {
    invalidateMatchKeys(qc, p);
  });

  for (const eventName of ['match.created', 'match.status_changed', 'match.cancelled', 'match.completed', 'match.pending'] as const) {
    useSocketEvent(eventName, (p: any) => {
      invalidateMatchKeys(qc, p);
    });
  }

  // Participant/session lifecycle: the roster depth of a match changed.
  for (const eventName of ['participant.added', 'participant.removed', 'session.started', 'session.completed'] as const) {
    useSocketEvent(eventName, (p: any) => {
      invalidateMatchKeys(qc, p);
      qc.invalidateQueries({ queryKey: ['match-applicants'] });
    });
  }

  // Invitation lifecycle: the recipient's badge + the applicant roster refresh.
  for (const eventName of ['invitation.sent', 'invitation.declined', 'invitation.expired'] as const) {
    useSocketEvent(eventName, (p: any) => {
      invalidateMatchKeys(qc, p);
      qc.invalidateQueries({ queryKey: ['match-applicants'] });
    });
  }

  // Join-request / waiting-list changes mutate the applicant roster live.
  for (const eventName of ['join_request.submitted', 'join_request.approved', 'join_request.rejected', 'join_request.withdrawn', 'join_request.auto_rejected', 'waiting_list.entry_added', 'waiting_list.entry_removed', 'waiting_list.promoted'] as const) {
    useSocketEvent(eventName, (p: any) => {
      invalidateMatchKeys(qc, p);
      qc.invalidateQueries({ queryKey: ['match-applicants'] });
    });
  }

  // Match result lifecycle events (submitted/approved/disputed/resolved/…)
  // reach the participant user rooms + the admin room. Refresh the match
  // detail, the result page, the public/home lists and the admin workbench.
  for (const eventName of MATCH_RESULT_SOCKET_EVENTS) {
    useSocketEvent(eventName, (p: any) => {
      invalidateMatchKeys(qc, p);
      if (p?.matchId) {
        qc.invalidateQueries({ queryKey: ['match', p.matchId] });
        qc.invalidateQueries({ queryKey: ['match-result', p.matchId] });
      }
    });
  }

  // ── Academy events ─────────────────────────────────────────────
  useSocketEvent('academy.enrolled', () => {
    qc.invalidateQueries({ queryKey: ['academies'] });
  });

  useSocketEvent('academy.graduated', () => {
    qc.invalidateQueries({ queryKey: ['academies'] });
  });

  // Enrollment lifecycle: admin workbench, the player's own enrollments, the
  // public program/detail capacity and the admin academy dashboard all refresh.
  const academyEnrollmentEvents = [
    'academy.enrollment-accepted', 'academy.enrollment-waitlisted',
    'academy.promoted', 'academy.payment-acknowledged', 'academy.enrollment-paid',
  ];
  for (const eventName of academyEnrollmentEvents) {
    useSocketEvent(eventName, (p: any) => {
      qc.invalidateQueries({ queryKey: ['admin', 'academy', 'enrollments'] });
      qc.invalidateQueries({ queryKey: ['admin', 'academy', 'dashboard'] });
      qc.invalidateQueries({ queryKey: ['admin', 'academy', 'capacity'] });
      qc.invalidateQueries({ queryKey: ['my', 'academy', 'enrollments'] });
      qc.invalidateQueries({ queryKey: ['academy', 'public'] });
      if (p?.programId) {
        qc.invalidateQueries({ queryKey: ['academy', 'public', 'program', p.programId] });
      }
    });
  }

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
      for (const queryKey of COACH_LIFECYCLE_INVALIDATIONS) {
        qc.invalidateQueries({ queryKey });
      }
    });
  }

  // Coach service-locations change — emitted after a coach saves their branch
  // selection. The acting coach's own profile/location queries and every
  // discovery/candidate surface that depends on branch eligibility must refresh
  // live so players never see a stale (now-ineligible) coach at a branch.
  useSocketEvent('coach.service-locations-changed', () => {
    qc.invalidateQueries({ queryKey: ['my-coach-service-locations'] });
    qc.invalidateQueries({ queryKey: ['available-branches'] });
    qc.invalidateQueries({ queryKey: ['coaches'] });
    qc.invalidateQueries({ queryKey: ['coach'] });
    qc.invalidateQueries({ queryKey: ['org-coaches'] });
    qc.invalidateQueries({ queryKey: ['admin-coaches'] });
    qc.invalidateQueries({ queryKey: ['scheduling-search'] });
    qc.invalidateQueries({ queryKey: ['scheduling-search-resource'] });
  });

  // ── Settlement events ──────────────────────────────────────────
  const invalidateSettlementViews = () => {
    // Super Admin unified settlement list + preview (same canonical projection).
    qc.invalidateQueries({ queryKey: ['unified-settlements'] });
    qc.invalidateQueries({ queryKey: ['unified-settlement-preview'] });
    // Organisation portal settlement history, outstanding projection and position.
    qc.invalidateQueries({ queryKey: ['org-settlements'] });
    qc.invalidateQueries({ queryKey: ['org-settlement-detail'] });
    qc.invalidateQueries({ queryKey: ['org-settlement-outstanding'] });
    qc.invalidateQueries({ queryKey: ['org-position'] });
    // Legacy booking-settlements root.
    qc.invalidateQueries({ queryKey: ['booking-settlements'] });
    qc.invalidateQueries({ queryKey: ['settlements'] });
  };

  useSocketEvent('settlement.created', invalidateSettlementViews);
  useSocketEvent('settlement.completed', invalidateSettlementViews);
  useSocketEvent('settlement.paid', invalidateSettlementViews);
  useSocketEvent('settlement.failed', invalidateSettlementViews);

  // ── Entitlement activation events ─────────────────────────────
  // A financial entitlement becoming AVAILABLE (e.g. a marketplace order's
  // complaint window clears immediately on delivery) increases the org's
  // available balance / settlement position. Refresh all settlement-sensitive
  // seller + org surfaces so they update live instead of on the 5-min worker.
  const invalidateEntitlementViews = () => {
    // Organisation position + outstanding (AVAILABLE balance feeding both).
    qc.invalidateQueries({ queryKey: ['org-position'] });
    qc.invalidateQueries({ queryKey: ['org-settlement-outstanding'] });
    qc.invalidateQueries({ queryKey: ['org-settlements'] });
    qc.invalidateQueries({ queryKey: ['org-settlement-detail'] });
    // Seller marketplace dashboard balance + settlement list.
    qc.invalidateQueries({ queryKey: ['mp-seller-settlement-balance'] });
    qc.invalidateQueries({ queryKey: ['mp-seller-settlements'] });
    qc.invalidateQueries({ queryKey: ['mp-seller-orders'] });
    // Unified settlement workbench used by Super Admin finance.
    qc.invalidateQueries({ queryKey: ['unified-settlements'] });
    qc.invalidateQueries({ queryKey: ['unified-settlement-preview'] });
  };

  useSocketEvent('entitlement.activated', invalidateEntitlementViews);

  // ── Gateway settlement events ─────────────────────────────────
  useSocketEvent('payment.gateway-settled', () => {
    qc.invalidateQueries({ queryKey: ['gateway-settlements'] });
    qc.invalidateQueries({ queryKey: ['settlements'] });
    qc.invalidateQueries({ queryKey: ['mp-seller-settlements'] });
  });

  // A reversed gateway settlement is eligible again on the pending list and the
  // settled list must reflect the new 'reversed' status.
  useSocketEvent('payment.gateway-settlement-reversed', () => {
    qc.invalidateQueries({ queryKey: ['gateway-settlements'] });
    qc.invalidateQueries({ queryKey: ['settlements'] });
    qc.invalidateQueries({ queryKey: ['mp-seller-settlements'] });
  });

  // ── Organisation events ────────────────────────────────────────
  useSocketEvent('organisation.subscription-renewed', () => {
    qc.invalidateQueries({ queryKey: ['org-subscription'] });
    qc.invalidateQueries({ queryKey: ['org-subscription-periods'] });
  });

  useSocketEvent('organisation.subscription-expiring', () => {
    qc.invalidateQueries({ queryKey: ['org-subscription'] });
    qc.invalidateQueries({ queryKey: ['admin', 'organisation-subscriptions'] });
  });

  useSocketEvent('organisation.subscription-expired', () => {
    qc.invalidateQueries({ queryKey: ['org-subscription'] });
    qc.invalidateQueries({ queryKey: ['org-subscription-periods'] });
  });

  useSocketEvent('organisation.status-changed', () => {
    qc.invalidateQueries({ queryKey: ['admin', 'organisations'] });
    qc.invalidateQueries({ queryKey: ['admin-marketplace-sellers'] });
    qc.invalidateQueries({ queryKey: ['admin', 'organisation-subscriptions'] });
    qc.invalidateQueries({ queryKey: ['organisation'] });
    // Owner scopes embed is_active/is_verified — refresh so portal guards
    // react to (de)activation without a manual re-login.
    void useAuthStore.getState().refreshOrganisations();
  });

  useSocketEvent('organisation.subscription-status-changed', () => {
    qc.invalidateQueries({ queryKey: ['admin', 'organisations'] });
    qc.invalidateQueries({ queryKey: ['admin-marketplace-sellers'] });
    qc.invalidateQueries({ queryKey: ['admin', 'organisation-subscriptions'] });
    qc.invalidateQueries({ queryKey: ['org-subscription'] });
    qc.invalidateQueries({ queryKey: ['org-subscription-periods'] });
    void useAuthStore.getState().refreshOrganisations();
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
  useSocketEvent('accounting.entry-recorded', (p: any) => {
    // Super Admin finance/accounting surfaces + the shared account-ledger modal.
    invalidateFinanceEntries(qc);
    // Organisation portal accounting/finance surfaces (own org only, scoped by
    // the organisationId carried in the payload).
    invalidateOrgAccounting(qc, p?.organisationId);
  });

  const subscriptionRequestEvents = [
    'subscription.request-submitted', 'subscription.request-approved', 'subscription.request-rejected', 'subscription.request-reopened',
  ];
  for (const ev of subscriptionRequestEvents) {
    useSocketEvent(ev, () => {
      qc.invalidateQueries({ queryKey: ['admin', 'subscription-requests'] });
      qc.invalidateQueries({ queryKey: ['org-subscription-requests'] });
      qc.invalidateQueries({ queryKey: ['org-subscription-periods'] });
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

  // Registration opening is a public-discovery broadcast to interested players:
  // the tournament list refreshes so newly open tournaments appear live.
  useSocketEvent('tournament.registration-open', (p: any) => {
    invalidateTournament(qc, p?.tournamentId);
    qc.invalidateQueries({ queryKey: ['tournaments'] });
  });

  // Prize or payment-method configuration changes refresh the tournament detail.
  useSocketEvent('tournament.prizes-updated', (p: any) => {
    invalidateTournament(qc, p?.tournamentId);
  });

  useSocketEvent('tournament.match-scheduled', (p: any) => {
    invalidateTournament(qc, p?.tournamentId);
  });

  useSocketEvent('tournament.result', (p: any) => {
    invalidateTournament(qc, p?.tournamentId);
    qc.invalidateQueries({ queryKey: ['tournament', String(p?.tournamentId), 'standings'] });
  });

  // Group 5B draw + progression signals. A bracket generation, a seeded
  // placeholder becoming a real shareable Match, a slot winner advancing,
  // a stage finishing and the whole tournament completing ALL mutate the
  // bracket/standings/tournament caches — the TournamentDetailPage must
  // refresh live, with no manual reload.
  const tournamentRealtimeEvents = TOURNAMENT_REALTIME_EVENTS;
  for (const eventName of tournamentRealtimeEvents) {
    useSocketEvent(eventName, (p: any) => {
      invalidateTournament(qc, p?.tournamentId);
      const key = eventName === 'tournament.match-progressed' || eventName === 'tournament.completed' ? 'standings' : 'bracket';
      if (key === 'standings') qc.invalidateQueries({ queryKey: ['tournament', String(p?.tournamentId), 'standings'] });
      else qc.invalidateQueries({ queryKey: ['tournament', String(p?.tournamentId), 'bracket'] });
    });
  }

  // Group 6 — withdrawal resolution mutates the bracket, participants, waitlist
  // and schedule surfaces; the resolved participant is targeted via its room.
  useSocketEvent('tournament.withdrawal-resolved', (p: any) => {
    invalidateTournament(qc, p?.tournamentId);
    if (p?.tournamentId) {
      qc.invalidateQueries({ queryKey: ['tournament-participants', p.tournamentId] });
      qc.invalidateQueries({ queryKey: ['tournament', String(p.tournamentId), 'participants'] });
      qc.invalidateQueries({ queryKey: ['tournament-waitlist', p.tournamentId] });
      qc.invalidateQueries({ queryKey: ['tournament-matches', p.tournamentId] });
      qc.invalidateQueries({ queryKey: ['tournament', String(p.tournamentId), 'matches'] });
      qc.invalidateQueries({ queryKey: ['tournament-schedule', p.tournamentId] });
    }
  });

  // G7-E — registration lifecycle (created/withdrawn/confirmed), eligibility
  // config updates and waitlist promotion reconcile the affected sessions live.
  for (const eventName of ['registration.received', 'tournament.waitlist-promoted']) {
    useSocketEvent(eventName, (p: any) => {
      invalidateRegistrationLifecycle(qc, p);
    });
  }
  // G8-D-MINIMAL — `tournament.updated` is reused by result correction and
  // automatic no-result expiry reconciliation with `standings: true`. Besides
  // the lifecycle refresh, that payload must also invalidate the authoritative
  // standings query so connected users never see stale RR standings.
  useSocketEvent('tournament.updated', (p: any) => {
    invalidateRegistrationLifecycle(qc, p);
    if (p?.standings === true) {
      invalidateTournamentStandings(qc, p?.tournamentId);
    }
  });

  // Group 3 — a registration payment was settled (cash offline or card via the
  // shared Payment capability) → the participant list + tournament caches
  // refresh live. Payment-method configuration changes refresh the tournament
  // detail so the player/admin surfaces never show stale methods.
  useSocketEvent('tournament.registration-paid', (p: any) => {
    invalidateTournament(qc, p?.tournamentId);
    if (p?.tournamentId) qc.invalidateQueries({ queryKey: ['tournament', String(p.tournamentId), 'participants'] });
  });

  useSocketEvent('tournament.registration-payment-methods-updated', (p: any) => {
    invalidateTournament(qc, p?.tournamentId);
  });

  // Group 4 — mutable schedule configuration (deadline, venue branch, daily
  // playing window, dates) refreshed live without a manual reload.
  useSocketEvent('tournament.schedule-updated', (p: any) => {
    invalidateTournament(qc, p?.tournamentId);
  });

  // Group 5 — participant/seeding/draw foundation state changes refresh the
  // tournament + participants caches live.
  useSocketEvent('tournament.seed-updated', (p: any) => {
    invalidateTournament(qc, p?.tournamentId);
    if (p?.tournamentId) {
      qc.invalidateQueries({ queryKey: ['tournament', String(p.tournamentId), 'participants'] });
      qc.invalidateQueries({ queryKey: ['tournament-participants', p.tournamentId] });
    }
  });

  for (const ev of ['tournament.draw-generated', 'tournament.draw-updated']) {
    useSocketEvent(ev, (p: any) => {
      invalidateTournament(qc, p?.tournamentId);
      if (p?.tournamentId) {
        qc.invalidateQueries({ queryKey: ['tournament', String(p.tournamentId), 'bracket'] });
        qc.invalidateQueries({ queryKey: ['tournament-draw', p.tournamentId] });
      }
    });
  }

  // Group 6 — participant lifecycle (withdrawal / waitlist / replacement) state
  // changes refresh the participants + waitlist caches live.
  for (const ev of ['tournament.participant-updated', 'tournament.waitlist-updated', 'tournament.participant-replaced']) {
    useSocketEvent(ev, (p: any) => {
      invalidateTournament(qc, p?.tournamentId);
      if (p?.tournamentId) {
        qc.invalidateQueries({ queryKey: ['tournament-participants', p.tournamentId] });
        qc.invalidateQueries({ queryKey: ['tournament-waitlist', p.tournamentId] });
        qc.invalidateQueries({ queryKey: ['tournament', String(p.tournamentId), 'participants'] });
      }
    });
  }

  // Group 7 — pair/team member + replacement-request state changes refresh the
  // participants + replacement-request caches live (all authorized Admin/Org).
  for (const ev of ['tournament.participant-created', 'tournament.participant-members-updated', 'tournament.replacement-request-updated']) {
    useSocketEvent(ev, (p: any) => {
      invalidateTournament(qc, p?.tournamentId);
      if (p?.tournamentId) {
        qc.invalidateQueries({ queryKey: ['tournament-participants', p.tournamentId] });
        qc.invalidateQueries({ queryKey: ['tournament', String(p.tournamentId), 'participants'] });
        qc.invalidateQueries({ queryKey: ['tournament-replacement-requests', p.tournamentId] });
        if (p?.participantId != null) {
          qc.invalidateQueries({ queryKey: ['tournament-participant-members', p.tournamentId, p.participantId] });
        }
      }
    });
  }

  // Group 8 — match generation + schedule + court reservation state changes
  // refresh the tournament matches + schedule + courts caches live.
  for (const ev of ['tournament.matches-generated', 'tournament.schedule-updated', 'tournament.court-reserved', 'tournament.court-released']) {
    useSocketEvent(ev, (p: any) => {
      invalidateTournament(qc, p?.tournamentId);
      if (p?.tournamentId) {
        qc.invalidateQueries({ queryKey: ['tournament-matches', p.tournamentId] });
        qc.invalidateQueries({ queryKey: ['tournament', String(p.tournamentId), 'matches'] });
        qc.invalidateQueries({ queryKey: ['tournament-courts', p.tournamentId] });
        qc.invalidateQueries({ queryKey: ['tournament-schedule', p.tournamentId] });
      }
    });
  }

  // ── Presence events ────────────────────────────────────────────
  useSocketEvent('presence.online', (p: any) => {
    qc.setQueryData(['user-presence', p.userId], () => true);
  });

  useSocketEvent('presence.offline', (p: any) => {
    qc.setQueryData(['user-presence', p.userId], () => false);
  });

  // ── Player navigation counters (['player-nav-counts']) ──────────
  // Any event that can change one of the six nav badges (bookings, match
  // invitations, tournaments, academies, chat, marketplace orders) triggers a
  // refetch of the authoritative nav-summary endpoint. A periodic refetch in
  // the hook is the safety net; these invalidations keep the badges live.
  const invalidateNavCounts = () => qc.invalidateQueries({ queryKey: ['player-nav-counts'] });

  const navCountBookingEvents = [
    'booking.created', 'booking.confirmed', 'booking.rejected', 'booking.updated',
    'booking.rescheduled', 'booking.cancelled', 'booking.expired', 'booking.completed',
    'booking.no_show', 'booking.checked_in', 'booking.fully-booked',
    'booking.application-declined', 'booking.paid', 'booking.refunded',
  ];
  for (const ev of navCountBookingEvents) useSocketEvent(ev, invalidateNavCounts);

  for (const ev of ['payment.completed', 'payment.failed', 'payment.cancelled', 'payment.refunded', 'payment.succeeded']) {
    useSocketEvent(ev, invalidateNavCounts);
  }

  const navCountMarketplaceEvents = [
    'marketplace.order-placed', 'marketplace.order-confirmed', 'marketplace.order-shipped',
    'marketplace.order-delivered', 'marketplace.order-cancelled', 'marketplace.order-status-changed',
    'marketplace.order-refunded', 'marketplace.product-status-changed',
  ];
  for (const ev of navCountMarketplaceEvents) useSocketEvent(ev, invalidateNavCounts);

  for (const ev of ['chat.new-message', 'chat.group-invitation', 'chat.group-created', 'chat.group-joined']) {
    useSocketEvent(ev, invalidateNavCounts);
  }

  for (const ev of ['match.available', 'match.removed', 'match.updated', 'match.pending', 'match.created', 'match.status_changed', 'match.cancelled', 'match.completed', ...MATCH_RESULT_SOCKET_EVENTS]) {
    useSocketEvent(ev, invalidateNavCounts);
  }

  for (const ev of ['academy.enrolled', 'academy.graduated', ...academyEnrollmentEvents]) {
    useSocketEvent(ev, invalidateNavCounts);
  }

  for (const ev of ['tournament.created', 'tournament.match-scheduled', 'tournament.result', 'tournament.bracket-generated', 'tournament.match-created', 'tournament.match-progressed', 'tournament.completed', 'tournament.updated', 'tournament.waitlist-promoted', 'registration.received']) {
    useSocketEvent(ev, invalidateNavCounts);
  }

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
