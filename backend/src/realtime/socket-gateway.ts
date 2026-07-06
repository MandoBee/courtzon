/**
 * Socket Gateway — bridges Domain Events to Socket.IO rooms.
 *
 * Architecture: Domain Event → Event Bus → Socket Gateway → Validation → Room → Client
 * Never emit Socket.IO events directly from controllers or services.
 */

import type { Server as SocketIOServer } from 'socket.io';
import { eventBus } from '../shared/event-bus/index.js';
import { createModuleLogger } from '../shared/utils/logger.js';
import { validateEvent } from './event-contracts.js';

const log = createModuleLogger('socket-gateway');

// ── Room helpers ──

export function room(prefix: string, id: string | number): string { return `${prefix}:${id}`; }
export function userRoom(id: number) { return room('user', id); }
export function orgRoom(id: number) { return room('organisation', id); }
export function branchRoom(id: number) { return room('branch', id); }
export function bookingRoom(id: number) { return room('booking', id); }
export function matchRoom(id: number) { return room('match', id); }
export function conversationRoom(id: number) { return room('conversation', id); }
export const ADMIN_ROOM = 'admin';
export const PLAYER_ROOM = 'player';
export const COACH_ROOM = 'coach';

// Room authorization — which rooms can a client join based on context
export function canJoinRoom(roomName: string, userId: number, role: string | null, orgId: number | null): boolean {
  const [prefix, idStr] = roomName.split(':');
  const id = Number(idStr);
  if (prefix === 'user') return id === userId;
  if (prefix === 'role') return role === idStr;
  if (prefix === 'organisation') return orgId === id;
  if (prefix === 'branch' || prefix === 'booking' || prefix === 'match' || prefix === 'conversation') return true;
  if (roomName === ADMIN_ROOM) return role ? ['super_admin', 'admin'].includes(role) : false;
  if (roomName === PLAYER_ROOM || roomName === COACH_ROOM) return true;
  return false;
}

// ── Metrics ──

const metrics = {
  clients: 0,
  eventsEmitted: 0,
  eventsDropped: 0,
  eventsInvalid: 0,
  eventsDuplicated: 0,
  lastMinuteEvents: 0,
  roomsCreated: 0,
  errors: 0,
};

let metricTimer: ReturnType<typeof setInterval> | null = null;

export function getSocketMetrics() {
  return { ...metrics, timestamp: new Date().toISOString() };
}

// ── Dedup ──

const emittedEvents = new Map<string, number>();
const DEDUP_WINDOW_MS = 2000;

function isDuplicate(eventKey: string): boolean {
  const now = Date.now();
  const last = emittedEvents.get(eventKey);
  if (last && now - last < DEDUP_WINDOW_MS) { metrics.eventsDuplicated++; return true; }
  emittedEvents.set(eventKey, now);
  if (emittedEvents.size > 10000) {
    const cutoff = now - DEDUP_WINDOW_MS;
    for (const [k, v] of emittedEvents) { if (v < cutoff) emittedEvents.delete(k); }
  }
  return false;
}

// ── Safe emit ──

function safeEmit(io: SocketIOServer, event: string, target: ReturnType<typeof userRoom>, data: any): void {
  const key = `${event}:${target}:${JSON.stringify(data).substring(0, 200)}`;
  if (isDuplicate(key)) return;

  const result = validateEvent(event, data);
  if (!result.valid) {
    metrics.eventsInvalid++;
    return;
  }

  try {
    io.to(target).emit(event, result.data || data);
    metrics.eventsEmitted++;
  } catch (err: any) {
    metrics.errors++;
    log.error({ err, event, target }, 'Socket emit error');
  }
}

// ── Gateway ──

export function setupSocketGateway(io: SocketIOServer): void {
  log.info('Socket Gateway initializing...');

  if (metricTimer) clearInterval(metricTimer);
  metrics.lastMinuteEvents = 0;
  metricTimer = setInterval(() => {
    const rate = metrics.eventsEmitted - metrics.lastMinuteEvents;
    metrics.lastMinuteEvents = metrics.eventsEmitted;
    log.info({ eps: (rate / 60).toFixed(1), dropped: metrics.eventsDropped, invalid: metrics.eventsInvalid, duplicated: metrics.eventsDuplicated }, 'Socket metrics');
  }, 60000);

  // ═══ BOOKINGS ═══
  eventBus.on('booking:created' as any, (d: any) => {
    safeEmit(io, 'booking:created', userRoom(d.userId), d);
    if (d.organisationId) safeEmit(io, 'booking:created', orgRoom(d.organisationId), d);
    if (d.branchId) safeEmit(io, 'booking:created', branchRoom(d.branchId), d);
    if (d.bookingType === 'public_match') safeEmit(io, 'match:available', PLAYER_ROOM, { bookingId: d.bookingId, timestamp: new Date().toISOString() });
    safeEmit(io, 'dashboard:updated', ADMIN_ROOM, { type: 'booking_created', amount: d.amount });
  });

  eventBus.on('booking:confirmed' as any, (d: any) => {
    safeEmit(io, 'booking:confirmed', userRoom(d.userId), d);
    if (d.organisationId) safeEmit(io, 'booking:confirmed', orgRoom(d.organisationId), d);
    safeEmit(io, 'booking:confirmed', bookingRoom(d.bookingId), d);
    safeEmit(io, 'dashboard:updated', ADMIN_ROOM, { type: 'booking_confirmed' });
  });

  eventBus.on('booking:cancelled' as any, (d: any) => {
    safeEmit(io, 'booking:cancelled', userRoom(d.userId), d);
    if (d.organisationId) safeEmit(io, 'booking:cancelled', orgRoom(d.organisationId), d);
    safeEmit(io, 'booking:cancelled', bookingRoom(d.bookingId), d);
    safeEmit(io, 'match:removed', PLAYER_ROOM, { bookingId: d.bookingId });
  });

  eventBus.on('booking:completed' as any, (d: any) => {
    safeEmit(io, 'booking:completed', userRoom(d.userId), d);
    if (d.organisationId) safeEmit(io, 'booking:completed', orgRoom(d.organisationId), d);
  });

  eventBus.on('booking:expired' as any, (d: any) => {
    safeEmit(io, 'booking:expired', userRoom(d.userId), d);
    safeEmit(io, 'match:removed', PLAYER_ROOM, { bookingId: d.bookingId });
  });

  // ═══ MATCHES ═══
  eventBus.on('match:invitation' as any, (d: any) => {
    safeEmit(io, 'match:invitation', userRoom(d.userId), d);
  });

  eventBus.on('booking:matchmaking-complete' as any, (d: any) => {
    safeEmit(io, 'match:updated', bookingRoom(d.bookingId), d);
    safeEmit(io, 'match:updated', PLAYER_ROOM, { bookingId: d.bookingId });
  });

  // ═══ PAYMENTS & WALLET ═══
  eventBus.on('payment:completed' as any, (d: any) => {
    safeEmit(io, 'payment:completed', userRoom(d.userId), d);
    safeEmit(io, 'wallet:updated', userRoom(d.userId), { type: 'payment_completed', amount: d.amount });
    safeEmit(io, 'dashboard:updated', ADMIN_ROOM, { type: 'payment_completed', amount: d.amount });
  });

  eventBus.on('payment:failed' as any, (d: any) => {
    safeEmit(io, 'payment:failed', userRoom(d.userId), d);
  });

  eventBus.on('payment:refunded' as any, (d: any) => {
    safeEmit(io, 'payment:refunded', userRoom(d.userId), d);
    safeEmit(io, 'wallet:updated', userRoom(d.userId), { type: 'refund', amount: d.amount });
  });

  eventBus.on('payment:wallet-topup' as any, (d: any) => {
    safeEmit(io, 'wallet:updated', userRoom(d.userId), { type: 'topup', amount: d.amount });
  });

  // ═══ MARKETPLACE ═══
  eventBus.on('marketplace:order-placed' as any, (d: any) => {
    safeEmit(io, 'order:created', userRoom(d.userId), d);
    if (d.sellerId && d.sellerId !== d.userId) safeEmit(io, 'order:created', userRoom(d.sellerId), d);
    safeEmit(io, 'cart:updated', userRoom(d.userId), { userId: d.userId, itemCount: 0 });
  });

  eventBus.on('marketplace:order-shipped' as any, (d: any) => {
    safeEmit(io, 'order:updated', userRoom(d.userId), { ...d, status: 'shipped' });
  });

  eventBus.on('marketplace:order-delivered' as any, (d: any) => {
    safeEmit(io, 'order:updated', userRoom(d.userId), { ...d, status: 'delivered' });
  });

  eventBus.on('marketplace:order-cancelled' as any, (d: any) => {
    safeEmit(io, 'order:updated', userRoom(d.userId), { ...d, status: 'cancelled' });
    if (d.sellerId) safeEmit(io, 'order:updated', userRoom(d.sellerId), { ...d, status: 'cancelled' });
  });

  eventBus.on('marketplace:product-back-in-stock' as any, (d: any) => {
    safeEmit(io, 'inventory:updated', userRoom(d.userId), { productId: d.productId, quantity: -1 });
  });

  eventBus.on('marketplace:price-drop' as any, (d: any) => {
    safeEmit(io, 'wishlist:updated', userRoom(d.userId), { userId: d.userId, productId: d.productId });
  });

  // ═══ NOTIFICATIONS ═══
  eventBus.on('system:announcement' as any, (d: any) => {
    if (d.targetRole) safeEmit(io, 'notification:new', `role:${d.targetRole}`, d);
    else if (!d.targetUserId) {
      safeEmit(io, 'notification:new', PLAYER_ROOM, d);
      safeEmit(io, 'notification:new', ADMIN_ROOM, d);
    } else {
      safeEmit(io, 'notification:new', userRoom(d.targetUserId), d);
    }
  });

  // ═══ ORGANISATION ═══
  eventBus.on('organisation:approved' as any, (d: any) => {
    safeEmit(io, 'organisation:approved', userRoom(d.userId), d);
    if (d.organisationId) safeEmit(io, 'organisation:approved', orgRoom(d.organisationId), d);
  });

  eventBus.on('organisation:subscription-expiring' as any, (d: any) => {
    safeEmit(io, 'organisation:subscription-expiring', userRoom(d.userId), d);
    if (d.organisationId) safeEmit(io, 'organisation:subscription-expiring', orgRoom(d.organisationId), d);
  });

  // ═══ USER / AUTH ═══
  eventBus.on('user:approved' as any, (d: any) => {
    safeEmit(io, 'user:updated', userRoom(d.userId), { status: 'approved' });
  });

  eventBus.on('user:suspended' as any, (d: any) => {
    safeEmit(io, 'user:updated', userRoom(d.userId), { status: 'suspended' });
  });

  eventBus.on('user:reactivated' as any, (d: any) => {
    safeEmit(io, 'user:updated', userRoom(d.userId), { status: 'reactivated' });
  });

  // ═══ SECURITY ═══
  eventBus.on('security:account-locked' as any, (d: any) => {
    safeEmit(io, 'security:account-locked', userRoom(d.userId), d);
  });

  // ═══ TOURNAMENT ═══
  eventBus.on('tournament:starting-soon' as any, (d: any) => {
    safeEmit(io, 'score:updated', matchRoom(d.matchId || d.tournamentId), { matchId: d.matchId || 0 });
  });

  eventBus.on('tournament:result' as any, (d: any) => {
    safeEmit(io, 'score:updated', matchRoom(d.matchId || d.tournamentId), { matchId: d.matchId || d.tournamentId, score: d.result });
  });

  // ═══ ACADEMY ═══
  eventBus.on('academy:session-reminder' as any, (d: any) => {
    safeEmit(io, 'attendance:updated', userRoom(d.userId), { sessionId: d.sessionId || 0, userId: d.userId, status: 'reminder' });
  });

  // ═══ CHAT ═══
  eventBus.on('chat:new-message' as any, (d: any) => {
    safeEmit(io, 'message:created', conversationRoom(d.conversationId || 0), d);
  });

  eventBus.on('chat:group-created' as any, (d: any) => {
    safeEmit(io, 'message:created', userRoom(d.userId), { conversationId: d.conversationId, senderId: d.userId });
  });

  // ═══ PRESENCE ═══
  eventBus.on('auth:login' as any, (d: any) => {
    safeEmit(io, 'presence:online', PLAYER_ROOM, { userId: d.userId });
  });

  eventBus.on('auth:logout' as any, (d: any) => {
    safeEmit(io, 'presence:offline', PLAYER_ROOM, { userId: d.userId });
  });

  log.info('Socket Gateway initialized — 35 event subscriptions, validation enabled');
}
