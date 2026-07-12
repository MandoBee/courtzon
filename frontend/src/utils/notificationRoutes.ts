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

function routeFromEntityType(n: AppNotification): string | null {
  const type = n.related_entity_type;
  const eid = n.related_entity_id;
  if (!type || !eid) return null;
  switch (type) {
    case 'booking': return `/bookings/${eid}`;
    case 'order': return `/marketplace/orders/${eid}`;
    case 'product': return `/marketplace/products/${eid}`;
    case 'match': return `/matches/${eid}`;
    case 'tournament': return `/tournaments/${eid}`;
    case 'academy': return `/academies/${eid}`;
    case 'session': return `/coaches/sessions/me`;
    case 'coaching': return `/coaches`;
    case 'organisation': return `/organisations/${eid}`;
    case 'club': return `/organisations/${eid}`;
    case 'payment': return `/bookings/${eid}`;
    case 'review': return `/marketplace/products/${eid}`;
    case 'post': return `/community/events`;
    case 'chat': return `/messages`;
    case 'user': return `/profile`;
    case 'membership': return `/app`;
    case 'coupon': return `/marketplace`;
    default: return null;
  }
}

const ROUTE_MAP: Record<string, (n: AppNotification) => string | null> = {
  view_booking: (n) => { const bid = id(n.action_payload, 'bookingId', 'booking_id') || n.related_entity_id; return bid ? `/bookings/${bid}` : '/bookings'; },
  view_bookings: () => '/bookings',
  view_payment: (n) => { const bid = id(n.action_payload, 'bookingId', 'booking_id') || n.related_entity_id; return bid ? `/bookings/${bid}` : '/bookings'; },
  view_wallet: () => '/app',
  view_order: (n) => { const oid = id(n.action_payload, 'orderId', 'order_id') || n.related_entity_id; return oid ? `/marketplace/orders/${oid}` : '/marketplace/orders'; },
  view_orders: () => '/marketplace/orders',
  view_product: (n) => { const pid = id(n.action_payload, 'productId', 'product_id') || n.related_entity_id; return pid ? `/marketplace/products/${pid}` : '/marketplace'; },
  view_seller: () => '/marketplace/seller',
  view_review: (n) => { const pid = id(n.action_payload, 'productId', 'product_id') || n.related_entity_id; return pid ? `/marketplace/products/${pid}` : '/marketplace'; },
  view_user: () => '/profile',
  view_dashboard: () => '/app',
  view_settings: () => '/profile',
  view_announcement: () => '/notifications',
  view_friends: () => '/community/events',
  view_organisation: (n) => { const oid = id(n.action_payload, 'organizationId', 'orgId', 'organisation_id') || n.related_entity_id; return oid ? `/organisations/${oid}` : '/browse'; },
  view_subscription: () => '/app',
  view_membership: () => '/app',
  renew_membership: () => '/app',
  view_notifications: () => '/notifications',
  view_academy: (n) => { const aid = id(n.action_payload, 'academyId', 'academy_id') || n.related_entity_id; return aid ? `/academies/${aid}` : '/academies'; },
  view_session: () => '/coaches/sessions/me',
  view_sessions: () => '/coaches/sessions/me',
  view_coaching: () => '/coaches',
  view_tournament: (n) => { const tid = id(n.action_payload, 'tournamentId', 'tournament_id') || n.related_entity_id; return tid ? `/tournaments/${tid}` : '/tournaments'; },
  view_match: (n) => { const mid = id(n.action_payload, 'matchId', 'match_id') || n.related_entity_id; return mid ? `/matches/${mid}` : '/matches'; },
  view_matches: () => '/matches',
  view_ticket: (n) => { const bid = id(n.action_payload, 'bookingId', 'booking_id') || n.related_entity_id; return bid ? `/bookings/${bid}` : '/bookings'; },
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
  if (key) {
    const resolver = ROUTE_MAP[key];
    if (resolver) {
      const route = resolver(notification);
      if (route) return route;
    }
  }
  return routeFromEntityType(notification);
}
