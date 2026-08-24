import { createModuleLogger } from '../../../shared/utils/logger.js';
import { ADMIN_ROOM } from '../domain/realtime-rooms.js';

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
    if (eventName === 'marketplace:product-visibility-changed') {
      // Owner hides/shows an approved product: admin, owning seller/org and
      // the public catalog (player room) all refresh immediately.
      const rooms: string[] = [ADMIN_ROOM, 'player'];
      if (payload.organisationId) {
        rooms.push(`marketplace:seller:${payload.organisationId}`);
        rooms.push(`organisation:${payload.organisationId}`);
      }
      if (payload.sellerUserId) rooms.push(`user:${payload.sellerUserId}`);
      return {
        type: 'marketplace.product-visibility-changed',
        payload: {
          productId: payload.productId,
          name: payload.name,
          visible: payload.visible,
          status: payload.status,
          sellerType: payload.sellerType,
          organisationId: payload.organisationId,
          sellerUserId: payload.sellerUserId,
        },
        rooms,
      };
    }
    if (eventName === 'marketplace:product-status-changed') {
      // Product lifecycle transition (approved/rejected/paused/…): the seller's
      // room, the owning organisation, every consumer (player room) and admins.
      const rooms: string[] = [ADMIN_ROOM, 'player'];
      if (payload.organisationId) {
        rooms.push(`marketplace:seller:${payload.organisationId}`);
        rooms.push(`organisation:${payload.organisationId}`);
      }
      if (payload.sellerUserId) rooms.push(`user:${payload.sellerUserId}`);
      return {
        type: 'marketplace.product-status-changed',
        payload: {
          productId: payload.productId,
          name: payload.name,
          status: payload.status,
          previousStatus: payload.previousStatus,
          sellerType: payload.sellerType,
          organisationId: payload.organisationId,
          sellerUserId: payload.sellerUserId,
        },
        rooms,
      };
    }
    if (eventName.startsWith('marketplace:')) return mapMarketplaceEvent(eventName, payload);
    if (eventName.startsWith('notification:')) return mapNotificationEvent(eventName, payload);
    if (eventName.startsWith('settlement:')) return mapSettlementEvent(eventName, payload);
    if (eventName.startsWith('organisation:') || eventName.startsWith('subscription:')) return mapOrganisationEvent(eventName, payload);
    if (eventName.startsWith('academy:') || eventName.startsWith('coaching:')) return mapAcademyEvent(eventName, payload);
    if (eventName.startsWith('coach:')) return mapCoachEvent(eventName, payload);
    if (eventName.startsWith('attendance:')) return mapAttendanceEvent(eventName, payload);
    if (eventName.startsWith('membership:')) return mapMembershipEvent(eventName, payload);
    if (eventName.startsWith('tournament:')) return mapTournamentEvent(eventName, payload);
    if (eventName.startsWith('match:')) return mapMatchEvent(eventName, payload);
    if (eventName === 'system:announcement') {
      return {
        type: 'system.announcement',
        payload: { title: payload.title, body: payload.body, level: payload.level },
        rooms: payload.targetRole ? [`role:${payload.targetRole}`] : ['player'],
      };
    }
    if (eventName.startsWith('setting:')) {
      return {
        type: `setting.${eventName.split(':')[1] || 'updated'}`,
        payload: { key: payload.key, profileId: payload.profileId },
        rooms: [ADMIN_ROOM],
      };
    }
    if (eventName.startsWith('accounting:')) {
      // A ledger entry was durably committed — finance/accounting surfaces in
      // the admin room (and the finance room) may refetch.
      return {
        type: `accounting.${eventName.split(':')[1] || 'updated'}`,
        payload: {
          eventType: payload.eventType,
          sourceType: payload.sourceType,
          sourceId: payload.sourceId,
          organisationId: payload.organisationId,
        },
        rooms: [ADMIN_ROOM, 'finance'],
      };
    }
    if (eventName === 'user:registered') {
      // Fresh registrations must reach admin surfaces immediately. Routing to
      // the new user's personal room would be useless here — the Admin Users
      // list listens on the ADMIN_ROOM broadcast.
      return {
        type: 'user.registered',
        payload: { userId: payload.userId, name: payload.name, userType: payload.userType },
        rooms: [ADMIN_ROOM],
      };
    }
    if (eventName.startsWith('user:') || eventName.startsWith('auth:') || eventName.startsWith('security:') || eventName.startsWith('user.')) {
      return mapUserSecurityEvent(eventName, payload);
    }
    return null;
  } catch (err) {
    log.error({ err, eventName }, 'socket.map_failed');
    return null;
  }
}

function roomsForUser(userId: number): string[] {
  return userId ? [`user:${userId}`] : [];
}

function mapBookingEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const sub = eventName.split(':')[1] || 'updated';
  const typeMap: Record<string, string> = {
    'check-in': 'checked_in',
    'no-show': 'no_show',
  };
  const type = `booking.${typeMap[sub] || sub}`;
  const resourceId = p.resourceId ?? p.courtId ?? null;
  const rooms: string[] = [];
  if (p.bookingId) rooms.push(`booking:${p.bookingId}`);
  if (p.userId) rooms.push(`user:${p.userId}`);
  if (resourceId) rooms.push(`resource:${resourceId}`);
  if (p.organisationId) rooms.push(`organisation:${p.organisationId}`);
  return {
    type,
    payload: {
      bookingId: p.bookingId,
      userId: p.userId,
      status: p.booking_status || p.status,
      resourceId,
      courtId: resourceId,
      bookingDate: p.bookingDate || null,
      startTime: p.startTime,
      endTime: p.endTime,
      organisationId: p.organisationId,
      branchId: p.branchId,
      reason: p.reason,
    },
    rooms,
  };
}

function mapPaymentEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const sub = eventName.split(':')[1] || 'updated';
  const typeMap: Record<string, string> = {
    'expired-event': 'expired',
    'cancelled-event': 'cancelled',
  };
  return {
    type: `payment.${typeMap[sub] || sub}`,
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
  if (eventName === 'notification:broadcast') {
    return {
      type: 'notification.broadcast',
      payload: { notificationId: p.notificationId, title: p.title, body: p.body, type: p.type },
      rooms: p.targetRole ? [`role:${p.targetRole}`] : ['player'],
    };
  }
  if (eventName === 'notification:delivered') {
    return {
      type: 'notification.new',
      payload: { notificationId: p.notificationId, userId: p.userId, title: p.title, body: p.body, type: p.type },
      rooms: roomsForUser(p.userId),
    };
  }
  if (eventName === 'notification:unread-count') {
    return {
      type: 'notification.unread-count',
      payload: { userId: p.userId },
      rooms: roomsForUser(p.userId),
    };
  }
  if (eventName === 'notification:sync-read') {
    return {
      type: 'notification.sync-read',
      payload: { notificationId: p.notificationId, userId: p.userId, sourceDeviceId: p.sourceDeviceId, timestamp: p.timestamp },
      rooms: roomsForUser(p.userId),
    };
  }
  if (eventName === 'notification:sync-deleted') {
    return {
      type: 'notification.sync-deleted',
      payload: { notificationId: p.notificationId, userId: p.userId, sourceDeviceId: p.sourceDeviceId, timestamp: p.timestamp },
      rooms: roomsForUser(p.userId),
    };
  }
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
  if (eventName === 'organisation:created') {
    return {
      type: 'organisation.created',
      payload: { organisationId: p.organisationId, name: p.name, userId: p.userId },
      rooms: p.organisationId ? [`organisation:${p.organisationId}`, ADMIN_ROOM] : [ADMIN_ROOM],
    };
  }
  if (eventName === 'organisation:status-changed') {
    // userId routes the event to the owner's socket room — owners are NOT in
    // the organisation room (user_organisations is never populated), so without
    // it an approval/status change never reaches the org portal live and the
    // guard keeps showing "Awaiting approval" until a manual refresh.
    const rooms: string[] = [];
    if (p.organisationId) rooms.push(`organisation:${p.organisationId}`);
    if (p.userId) rooms.push(`user:${p.userId}`);
    rooms.push(ADMIN_ROOM);
    return {
      type: 'organisation.status-changed',
      payload: { organisationId: p.organisationId, userId: p.userId, status: p.status },
      rooms,
    };
  }
  if (eventName === 'organisation:subscription-status-changed') {
    const rooms: string[] = [];
    if (p.organisationId) rooms.push(`organisation:${p.organisationId}`);
    if (p.userId) rooms.push(`user:${p.userId}`);
    rooms.push(ADMIN_ROOM);
    return {
      type: 'organisation.subscription-status-changed',
      payload: { organisationId: p.organisationId, userId: p.userId, subscriptionStatus: p.subscriptionStatus },
      rooms,
    };
  }
  if (eventName === 'subscription:request-submitted') {
    const rooms: string[] = [];
    if (p.organisationId) rooms.push(`organisation:${p.organisationId}`);
    if (p.userId) rooms.push(`user:${p.userId}`);
    rooms.push(ADMIN_ROOM);
    return { type: 'subscription.request-submitted', payload: { organisationId: p.organisationId, userId: p.userId, requestId: p.requestId, requestType: p.requestType }, rooms };
  }
  if (eventName === 'subscription:request-approved') {
    const rooms: string[] = [];
    if (p.organisationId) rooms.push(`organisation:${p.organisationId}`);
    if (p.userId) rooms.push(`user:${p.userId}`);
    rooms.push(ADMIN_ROOM);
    return { type: 'subscription.request-approved', payload: { organisationId: p.organisationId, userId: p.userId, requestId: p.requestId, requestType: p.requestType }, rooms };
  }
  if (eventName === 'subscription:request-rejected') {
    const rooms: string[] = [];
    if (p.organisationId) rooms.push(`organisation:${p.organisationId}`);
    if (p.userId) rooms.push(`user:${p.userId}`);
    rooms.push(ADMIN_ROOM);
    return { type: 'subscription.request-rejected', payload: { organisationId: p.organisationId, userId: p.userId, requestId: p.requestId, requestType: p.requestType }, rooms };
  }
  if (eventName === 'subscription:request-reopened') {
    const rooms: string[] = [];
    if (p.organisationId) rooms.push(`organisation:${p.organisationId}`);
    if (p.userId) rooms.push(`user:${p.userId}`);
    rooms.push(ADMIN_ROOM);
    return { type: 'subscription.request-reopened', payload: { organisationId: p.organisationId, userId: p.userId, requestId: p.requestId, requestType: p.requestType }, rooms };
  }
  if (eventName === 'organisation:approved' || eventName === 'organisation:rejected') {
    // Admins act on approvals — without ADMIN_ROOM here the central frontend
    // handlers never fire and admin lists stay stale until a manual refresh.
    const sub = eventName.split(':')[1] || 'updated';
    const rooms: string[] = [];
    if (p.organisationId) rooms.push(`organisation:${p.organisationId}`);
    if (p.userId) rooms.push(`user:${p.userId}`);
    rooms.push(ADMIN_ROOM);
    return {
      type: `organisation.${sub}`,
      payload: { organisationId: p.organisationId, userId: p.userId, name: p.name, reason: p.reason },
      rooms,
    };
  }
  const rooms: string[] = [];
  if (p.organisationId) rooms.push(`organisation:${p.organisationId}`);
  if (p.userId) rooms.push(`user:${p.userId}`);
  rooms.push(ADMIN_ROOM);
  return { type: `organisation.${eventName.split(':')[1] || 'updated'}`, payload: { organisationId: p.organisationId, userId: p.userId }, rooms };
}

function mapAcademyEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const rooms: string[] = [];
  if (p.userId) rooms.push(`user:${p.userId}`);
  if (p.academyId) rooms.push(`academy:${p.academyId}`);
  if (p.coachId) rooms.push(`coach:${p.coachId}`);
  const prefix = eventName.startsWith('coaching:') ? 'coaching' : 'academy';
  return { type: `${prefix}.${eventName.split(':')[1] || 'updated'}`, payload: { academyId: p.academyId, userId: p.userId, sessionId: p.sessionId }, rooms };
}

function mapAttendanceEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  return {
    type: 'attendance.updated',
    payload: { attendanceId: p.attendanceId, userId: p.userId, sessionId: p.sessionId, status: p.status || p.attendance_status },
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

function mapTournamentEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const sub = eventName.split(':')[1] || 'updated';
  const rooms: string[] = [];
  if (p.userId) rooms.push(`user:${p.userId}`);
  if (p.organisationId) rooms.push(`organisation:${p.organisationId}`);
  return {
    type: `tournament.${sub}`,
    payload: { tournamentId: p.tournamentId, matchId: p.matchId, userId: p.userId, name: p.name, result: p.result },
    rooms,
  };
}

function mapMatchEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const sub = eventName.split(':')[1] || 'updated';
  return {
    type: `match.${sub}`,
    payload: { matchId: p.matchId, bookingId: p.bookingId, userId: p.userId, timestamp: p.timestamp },
    rooms: ['player'],
  };
}

function mapCoachEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const rooms: string[] = [];
  const userId = p.userId || p.coachUserId;
  if (userId) rooms.push(`user:${userId}`);
  if (p.organisationId) rooms.push(`org:${p.organisationId}`);
  return {
    type: `coach.${eventName.split(':').slice(1).join('.')}`,
    payload: { ...p, timestamp: Date.now() },
    rooms,
  };
}

function mapNotificationSync(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const sub = eventName.split(':')[1] || 'updated';
  return {
    type: `notification.${sub}`,
    payload: { notificationId: p.notificationId, userId: p.userId, sourceDeviceId: p.sourceDeviceId, timestamp: p.timestamp },
    rooms: roomsForUser(p.userId),
  };
}

function mapUserSecurityEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const userId = p.userId || p.actorId;
  const userRoom = userId ? [`user:${userId}`] : [];
  const types: Record<string, string> = {
    'user:suspended': 'user.account.suspended',
    'user:activated': 'user.account.activated',
    'user:deleted': 'user.account.deleted',
    'auth:logout': 'user.force.logout',
    'security:permission-changed': 'user.permissions.changed',
    'security:session-revoked': 'user.force.logout',
    'user.role.changed': 'user.roles.changed',
  };
  const type = types[eventName] || eventName.replace(/:/g, '.');
  return {
    type,
    payload: { userId, event: eventName, reason: p.reason || p.description, timestamp: p.timestamp || Date.now() },
    rooms: userRoom,
  };
}
