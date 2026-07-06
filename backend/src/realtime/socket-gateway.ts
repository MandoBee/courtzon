/**
 * Socket Gateway — bridges Domain Events to Socket.IO rooms.
 *
 * Architecture:
 *   Domain Event → Event Bus → Socket Gateway → Room → Clients
 *
 * Never emit Socket.IO events directly from controllers or services.
 * All real-time events flow through this gateway.
 */

import type { Server as SocketIOServer } from 'socket.io';
import { eventBus } from '../shared/event-bus/index.js';
import { createModuleLogger } from '../shared/utils/logger.js';

const log = createModuleLogger('socket-gateway');

// ── Room helpers ──

export function room(prefix: string, id: string | number): string {
  return `${prefix}:${id}`;
}

export function userRoom(id: number) { return room('user', id); }
export function orgRoom(id: number) { return room('organisation', id); }
export function branchRoom(id: number) { return room('branch', id); }
export function bookingRoom(id: number) { return room('booking', id); }
export function matchRoom(id: number) { return room('match', id); }
export function conversationRoom(id: number) { return room('conversation', id); }
export const ADMIN_ROOM = 'admin';
export const PLAYER_ROOM = 'player';
export const COACH_ROOM = 'coach';

// ── Dedup helpers ──

const emittedEvents = new Map<string, number>();
const DEDUP_WINDOW_MS = 2000;

function isDuplicate(eventKey: string): boolean {
  const now = Date.now();
  const last = emittedEvents.get(eventKey);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  emittedEvents.set(eventKey, now);
  if (emittedEvents.size > 10000) {
    const cutoff = now - DEDUP_WINDOW_MS;
    for (const [k, v] of emittedEvents) { if (v < cutoff) emittedEvents.delete(k); }
  }
  return false;
}

// ── Gateway ──

export function setupSocketGateway(io: SocketIOServer): void {
  log.info('Socket Gateway initializing...');

  // ═══════════════════════════════════════════════
  // BOOKINGS
  // ═══════════════════════════════════════════════

  eventBus.on('booking:created' as any, (data: any) => {
    const key = `booking:created:${data.bookingId}`;
    if (isDuplicate(key)) return;
    io.to(userRoom(data.userId)).emit('booking:created', data);
    if (data.organisationId) io.to(orgRoom(data.organisationId)).emit('booking:created', data);
    if (data.branchId) io.to(branchRoom(data.branchId)).emit('booking:created', data);
    if (data.bookingType === 'public_match') {
      io.to(PLAYER_ROOM).emit('match:available', { bookingId: data.bookingId, timestamp: new Date().toISOString() });
    }
    io.to(ADMIN_ROOM).emit('dashboard:updated', { type: 'booking_created' });
  });

  eventBus.on('booking:confirmed' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('booking:confirmed', data);
    if (data.organisationId) io.to(orgRoom(data.organisationId)).emit('booking:confirmed', data);
    io.to(bookingRoom(data.bookingId)).emit('booking:confirmed', data);
    io.to(ADMIN_ROOM).emit('dashboard:updated', { type: 'booking_confirmed' });
  });

  eventBus.on('booking:cancelled' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('booking:cancelled', data);
    if (data.organisationId) io.to(orgRoom(data.organisationId)).emit('booking:cancelled', data);
    io.to(bookingRoom(data.bookingId)).emit('booking:cancelled', data);
    io.to(PLAYER_ROOM).emit('match:removed', { bookingId: data.bookingId });
    io.to(ADMIN_ROOM).emit('dashboard:updated', { type: 'booking_cancelled' });
  });

  eventBus.on('booking:completed' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('booking:completed', data);
    if (data.organisationId) io.to(orgRoom(data.organisationId)).emit('booking:completed', data);
  });

  eventBus.on('booking:expired' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('booking:expired', data);
    io.to(PLAYER_ROOM).emit('match:removed', { bookingId: data.bookingId });
  });

  // ═══════════════════════════════════════════════
  // PUBLIC MATCHES
  // ═══════════════════════════════════════════════

  eventBus.on('match:invitation' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('match:invitation', data);
  });

  eventBus.on('booking:matchmaking-complete' as any, (data: any) => {
    io.to(bookingRoom(data.bookingId)).emit('match:updated', data);
    io.to(PLAYER_ROOM).emit('match:updated', { bookingId: data.bookingId });
  });

  // ═══════════════════════════════════════════════
  // PAYMENTS & WALLET
  // ═══════════════════════════════════════════════

  eventBus.on('payment:completed' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('payment:completed', data);
    io.to(userRoom(data.userId)).emit('wallet:updated', { type: 'payment_completed' });
    io.to(ADMIN_ROOM).emit('dashboard:updated', { type: 'payment_completed', amount: data.amount });
  });

  eventBus.on('payment:failed' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('payment:failed', data);
  });

  eventBus.on('payment:refunded' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('payment:refunded', data);
    io.to(userRoom(data.userId)).emit('wallet:updated', { type: 'payment_refunded' });
  });

  eventBus.on('payment:wallet-topup' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('wallet:updated', { type: 'topup', amount: data.amount });
  });

  // ═══════════════════════════════════════════════
  // MARKETPLACE
  // ═══════════════════════════════════════════════

  eventBus.on('marketplace:order-placed' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('order:created', data);
    if (data.sellerId && data.sellerId !== data.userId) {
      io.to(userRoom(data.sellerId)).emit('order:created', data);
    }
  });

  eventBus.on('marketplace:order-shipped' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('order:updated', { ...data, status: 'shipped' });
  });

  eventBus.on('marketplace:order-delivered' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('order:updated', { ...data, status: 'delivered' });
  });

  eventBus.on('marketplace:order-cancelled' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('order:updated', { ...data, status: 'cancelled' });
    if (data.sellerId) io.to(userRoom(data.sellerId)).emit('order:updated', { ...data, status: 'cancelled' });
  });

  // ═══════════════════════════════════════════════
  // NOTIFICATIONS (already handled by in-app provider)
  // ═══════════════════════════════════════════════

  eventBus.on('system:announcement' as any, (data: any) => {
    if (data.targetRole) {
      io.to(`role:${data.targetRole}`).emit('notification:new', data);
    } else if (!data.targetUserId) {
      io.to(PLAYER_ROOM).emit('notification:new', data);
      io.to(ADMIN_ROOM).emit('notification:new', data);
    }
  });

  // ═══════════════════════════════════════════════
  // ORGANISATION
  // ═══════════════════════════════════════════════

  eventBus.on('organisation:approved' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('organisation:approved', data);
    if (data.organisationId) io.to(orgRoom(data.organisationId)).emit('organisation:updated', data);
  });

  eventBus.on('organisation:subscription-expiring' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('organisation:subscription-expiring', data);
    if (data.organisationId) io.to(orgRoom(data.organisationId)).emit('organisation:subscription-expiring', data);
  });

  // ═══════════════════════════════════════════════
  // USER & AUTH
  // ═══════════════════════════════════════════════

  eventBus.on('user:approved' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('user:updated', { status: 'approved' });
  });

  eventBus.on('user:suspended' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('user:updated', { status: 'suspended' });
  });

  // ═══════════════════════════════════════════════
  // SECURITY
  // ═══════════════════════════════════════════════

  eventBus.on('security:account-locked' as any, (data: any) => {
    io.to(userRoom(data.userId)).emit('security:account-locked', data);
  });

  log.info('Socket Gateway initialized — 25 event subscriptions');
}
