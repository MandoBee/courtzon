import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('socket-mapper');

export interface MappedSocketEvent {
  type: string;
  payload: Record<string, unknown>;
  rooms: string[];
}

export function mapDomainEvent(eventName: string, payload: Record<string, unknown>): MappedSocketEvent | null {
  try {
    if (eventName.startsWith('booking:')) return mapBookingEvent(eventName, payload);
    if (eventName.startsWith('payment:')) return mapPaymentEvent(eventName, payload);
    if (eventName.startsWith('wallet:')) return mapWalletEvent(eventName, payload);
    if (eventName.startsWith('marketplace:')) return mapMarketplaceEvent(eventName, payload);
    if (eventName.startsWith('notification:')) return mapNotificationEvent(eventName, payload);
    if (eventName.startsWith('settlement:')) return mapSettlementEvent(eventName, payload);
    if (eventName.startsWith('organisation:') || eventName.startsWith('subscription:')) return mapOrganisationEvent(eventName, payload);
    if (eventName.startsWith('academy:') || eventName.startsWith('coaching:')) return mapAcademyEvent(eventName, payload);
    if (eventName.startsWith('attendance:')) return mapAttendanceEvent(eventName, payload);
    if (eventName.startsWith('membership:')) return mapMembershipEvent(eventName, payload);
    return null;
  } catch (err) {
    log.error({ err, eventName }, 'socket.map_failed');
    return null;
  }
}

function roomsForUser(userId: number): string[] {
  return userId ? [`user:${userId}`] : [];
}

function roomsForBooking(bookingId: number, userId?: number): string[] {
  const rooms: string[] = [];
  if (bookingId) rooms.push(`booking:${bookingId}`);
  if (userId) rooms.push(`user:${userId}`);
  return rooms;
}

function mapBookingEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const type = `booking.${eventName.split(':')[1] || 'updated'}`;
  return {
    type,
    payload: { bookingId: p.bookingId, userId: p.userId, status: p.booking_status || p.status, startTime: p.startTime, endTime: p.endTime },
    rooms: roomsForBooking(p.bookingId, p.userId),
  };
}

function mapPaymentEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  return {
    type: `payment.${eventName.split(':')[1] || 'updated'}`,
    payload: { paymentId: p.paymentId, userId: p.userId, amount: p.amount, status: p.payment_status || p.status },
    rooms: roomsForUser(p.userId),
  };
}

function mapWalletEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  return {
    type: `wallet.${eventName.split(':')[1] || 'updated'}`,
    payload: { walletId: p.walletId, userId: p.userId, amount: p.amount, balance: p.balance },
    rooms: roomsForUser(p.userId),
  };
}

function mapMarketplaceEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const sub = eventName.split(':')[1] || 'updated';
  const rooms: string[] = [];
  if (p.userId) rooms.push(`user:${p.userId}`);
  if (p.sellerId) rooms.push(`marketplace:seller:${p.sellerId}`);
  return { type: `marketplace.${sub}`, payload: { orderId: p.orderId, userId: p.userId, sellerId: p.sellerId, status: p.status }, rooms };
}

function mapNotificationEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  return {
    type: 'notification.new',
    payload: { notificationId: p.notificationId, userId: p.userId, title: p.title, body: p.body, type: p.type },
    rooms: roomsForUser(p.userId),
  };
}

function mapSettlementEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  return {
    type: `settlement.${eventName.split(':')[1] || 'updated'}`,
    payload: { settlementId: p.settlementId, organisationId: p.organisationId, amount: p.amount, status: p.status },
    rooms: p.organisationId ? [`organisation:${p.organisationId}`, 'finance'] : ['finance'],
  };
}

function mapOrganisationEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const rooms: string[] = [];
  if (p.organisationId) rooms.push(`organisation:${p.organisationId}`);
  if (p.userId) rooms.push(`user:${p.userId}`);
  return { type: `organisation.${eventName.split(':')[1] || 'updated'}`, payload: { organisationId: p.organisationId, userId: p.userId }, rooms };
}

function mapAcademyEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const rooms: string[] = [];
  if (p.userId) rooms.push(`user:${p.userId}`);
  if (p.academyId) rooms.push(`academy:${p.academyId}`);
  if (p.coachId) rooms.push(`coach:${p.coachId}`);
  return { type: `academy.${eventName.split(':')[1] || 'updated'}`, payload: { academyId: p.academyId, userId: p.userId, sessionId: p.sessionId }, rooms };
}

function mapAttendanceEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  return {
    type: 'attendance.updated',
    payload: { attendanceId: p.attendanceId, userId: p.userId, sessionId: p.sessionId, status: p.status },
    rooms: roomsForUser(p.userId),
  };
}

function mapMembershipEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  return {
    type: `membership.${eventName.split(':')[1] || 'updated'}`,
    payload: { membershipId: p.membershipId, userId: p.userId, type: p.type },
    rooms: roomsForUser(p.userId),
  };
}
