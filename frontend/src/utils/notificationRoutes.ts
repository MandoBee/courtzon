import type { AppNotification } from '../components/notifications/NotificationDetailModal';

type Payload = Record<string, unknown> | null | undefined;

function id(payload: Payload, ...keys: string[]): string | undefined {
  if (!payload) return undefined;
  for (const k of keys) {
    const v = payload[k];
    if (v != null && v !== '') return String(v);
  }
  return undefined;
}

const ROUTE_MAP: Record<string, (payload: Payload) => string | null> = {
  view_booking: (p) => { const bid = id(p, 'bookingId', 'booking_id'); return bid ? `/bookings/${bid}` : '/bookings'; },
  view_bookings: () => '/bookings',
  view_payment: (p) => { const bid = id(p, 'bookingId', 'booking_id'); return bid ? `/bookings/${bid}` : '/bookings'; },
  view_wallet: () => '/app',
  view_order: (p) => { const oid = id(p, 'orderId', 'order_id'); return oid ? `/marketplace/orders/${oid}` : '/marketplace/orders'; },
  view_orders: () => '/marketplace/orders',
  view_product: (p) => { const pid = id(p, 'productId', 'product_id'); return pid ? `/marketplace/products/${pid}` : '/marketplace'; },
  view_seller: () => '/marketplace/seller',
  view_review: (p) => { const pid = id(p, 'productId', 'product_id'); return pid ? `/marketplace/products/${pid}` : '/marketplace'; },
  view_user: () => '/profile',
  view_dashboard: () => '/app',
  view_settings: () => '/profile',
  view_announcement: () => '/notifications',
  view_friends: () => '/community/events',
  view_organisation: (p) => { const oid = id(p, 'organizationId', 'orgId', 'organisation_id'); return oid ? `/organisations/${oid}` : '/browse'; },
  view_subscription: () => '/app',
  view_membership: () => '/app',
  renew_membership: () => '/app',
  view_notifications: () => '/notifications',
  view_academy: (p) => { const aid = id(p, 'academyId', 'academy_id'); return aid ? `/academies/${aid}` : '/academies'; },
  view_session: () => '/coaches/sessions/me',
  view_sessions: () => '/coaches/sessions/me',
  view_coaching: () => '/coaches',
  view_tournament: (p) => { const tid = id(p, 'tournamentId', 'tournament_id'); return tid ? `/tournaments/${tid}` : '/tournaments'; },
  view_match: (p) => { const mid = id(p, 'matchId', 'match_id'); return mid ? `/matches/${mid}` : '/matches'; },
  view_matches: () => '/matches',
  view_ticket: (p) => { const bid = id(p, 'bookingId', 'booking_id'); return bid ? `/bookings/${bid}` : '/bookings'; },
  view_tickets: () => '/bookings',
  view_security: () => '/profile',
  view_support: () => '/community/events',
  view_post: () => '/community/events',
  view_login: () => '/login',
  view_home: () => '/app',
  view_coupon: () => '/marketplace',
  view_matchmaking_booking: () => '/matches',
};

export function getNotificationRoute(notification: AppNotification): string | null {
  const key = notification.action_key;
  if (!key) return null;
  const resolver = ROUTE_MAP[key];
  if (!resolver) return null;
  return resolver(notification.action_payload);
}
