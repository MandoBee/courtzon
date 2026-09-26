import { createModuleLogger } from '../../../shared/utils/logger.js';
import {
  ADMIN_ROOM,
  PLAYER_ROOM,
  bookingRoom,
  branchRoom,
  matchRoom,
  orgRoom,
  userRoom,
} from '../domain/realtime-rooms.js';

const log = createModuleLogger('socket-mapper');

export interface MappedSocketEvent {
  type: string;
  payload: Record<string, unknown>;
  rooms: string[];
}

export function mapDomainEvent(eventName: string, payload: Record<string, unknown>): MappedSocketEvent | null {
  try {
    if (eventName === 'payment:gateway-settlement-reversed') {
      // Gateway settlement reversal is a CourtZon-book finance event: admins and
      // the finance room must refresh the Settled Gateway Payments list and the
      // pending (re-eligible) list immediately.
      return {
        type: 'payment.gateway-settlement-reversed',
        payload: {
          settlementId: payload.settlementId,
          reversalReference: payload.reversalReference,
          reversedBy: payload.reversedBy,
          gross: payload.gross,
          net: payload.net,
          fee: payload.fee,
          currency: payload.currency,
        },
        rooms: [ADMIN_ROOM, 'finance'],
      };
    }
    if (eventName.startsWith('booking:')) return mapBookingEvent(eventName, payload);
    if (eventName.startsWith('chat:')) return mapChatEvent(eventName, payload);
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
    if (eventName === 'entitlement:activated') {
      // A financial entitlement became AVAILABLE (e.g. a marketplace order's
      // complaint window is cleared immediately on delivery). The owning
      // organisation and the finance room must refresh balance/position,
      // outstanding and settlement-preview surfaces right away — no manual
      // refresh or 5-minute worker wait.
      const rooms: string[] = ['finance'];
      if (payload.organisationId != null) {
        rooms.push(`organisation:${payload.organisationId}`);
      }
      return {
        type: 'entitlement.activated',
        payload: {
          entitlementId: payload.entitlementId,
          publicId: payload.publicId,
          organisationId: payload.organisationId,
          entitlementType: payload.entitlementType,
          sourceType: payload.sourceType,
          sourceId: payload.sourceId != null ? Number(payload.sourceId) : null,
          amount: payload.amount,
          currency: payload.currency,
        },
        rooms,
      };
    }
    if (eventName.startsWith('settlement:')) return mapSettlementEvent(eventName, payload);
    if (eventName.startsWith('organisation:') || eventName.startsWith('subscription:')) return mapOrganisationEvent(eventName, payload);
    if (eventName.startsWith('academy:') || eventName.startsWith('coaching:')) return mapAcademyEvent(eventName, payload);
    if (eventName.startsWith('coach:')) return mapCoachEvent(eventName, payload);
    if (eventName.startsWith('attendance:')) return mapAttendanceEvent(eventName, payload);
    if (eventName.startsWith('membership:')) return mapMembershipEvent(eventName, payload);
    if (eventName.startsWith('registration.')) {
      if (REGISTRATION_EVENT_NAMES.has(eventName)) return mapRegistrationEvent(eventName, payload);
      return null;
    }
    if (eventName.startsWith('tournament:')) return mapTournamentEvent(eventName, payload);
    if (MATCH_RESULT_EVENT_NAMES.has(eventName)) return mapMatchResultEvent(eventName, payload);
    if (MATCH_DOMAIN_EVENT_NAMES.has(eventName)) return mapMatchEvent(eventName, payload);
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
      // the admin room (and the finance room) may refetch. When the entry
      // belongs to an organisation (organisationId set), the organisation room
      // also receives it so the org's own accounting views (Accounting Records,
      // Trial Balance / Income Statement / Balance Sheet, Financial Position,
      // ledger drill-downs) refresh immediately and never show stale GL data.
      const rooms = [ADMIN_ROOM, 'finance'];
      if (payload.organisationId != null) {
        rooms.push(`organisation:${payload.organisationId}`);
      }
      return {
        type: `accounting.${eventName.split(':')[1] || 'updated'}`,
        payload: {
          eventType: payload.eventType,
          sourceType: payload.sourceType,
          sourceId: payload.sourceId,
          organisationId: payload.organisationId,
        },
        rooms,
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
  // Super Admin / global org management screens subscribe to the `admin` room
  // (see useRealtimeCacheUpdates -> ['admin', 'bookings']). Without this the
  // Super Admin bookings table only refreshes on mount/filter change.
  const rooms: string[] = [ADMIN_ROOM];
  if (p.bookingId) rooms.push(`booking:${p.bookingId}`);
  if (p.userId) rooms.push(`user:${p.userId}`);
  if (resourceId) rooms.push(`resource:${resourceId}`);
  if (p.organisationId) rooms.push(`organisation:${p.organisationId}`);
  // Financial booking events (payment confirmation / refund) also drive the
  // finance room (accounting journal screens).
  if (sub === 'paid' || sub === 'refunded') rooms.push('finance');
  return {
    type,
    payload: {
      // PRIVACY: expose only the minimum fields the frontend needs to
      // invalidate slot/cache state (bookingId, status, resourceId/courtId,
      // bookingDate). Booking-owner identity (userId), cancellation reason,
      // organisation/branch ids and session times are intentionally NOT sent to
      // socket rooms — in particular `resource:<id>`, which any authenticated
      // viewer of a court may legitimately join (Group 2 authorization). The
      // destination rooms above are still computed from the SOURCE event, so
      // routing is unchanged. Server-side accounting/notifications consume the
      // domain events directly, never this socket payload.
      bookingId: p.bookingId,
      status: p.booking_status || p.status,
      resourceId,
      courtId: resourceId,
      bookingDate: p.bookingDate || null,
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

/**
 * G4-A — Academy administrative-scope events. Routed to the organisation /
 * branch / super-admin rooms ONLY — never to player rooms. `attendance-updated`
 * also joins its authoritative group-coach user room (`user:{coachId}`).
 */
const ACADEMY_ADMIN_EVENTS = new Set([
  'academy:session:hold-expired',
  'academy:group-updated',
  'academy:schedule-updated',
  'academy:attendance-updated',
]);

/**
 * G4-A — Academy enrollment lifecycle events. Player delivery is preserved;
 * the organisation + super-admin rooms are added so the admin roster/capacity
 * workbench receives enrollment changes in realtime.
 */
const ACADEMY_ENROLLMENT_EVENTS = new Set([
  'academy:enrollment-accepted',
  'academy:enrollment-waitlisted',
  'academy:promoted',
  'academy:enrollment-cancelled',
  'academy:enrollment-completed',
  'academy:payment-acknowledged',
  'academy:enrollment-paid',
]);

function mapAcademyEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const isAdminEvent = ACADEMY_ADMIN_EVENTS.has(eventName);
  const isCoaching = eventName.startsWith('coaching:');
  const rooms: string[] = [];

  // Player delivery ONLY for player-scoped events — administrative state
  // (hold expiry, group/schedule/attendance workbench) must never reach a
  // player room.
  if (!isAdminEvent) {
    const userId = p.userId || p.playerId;
    if (userId) rooms.push(`user:${userId}`);
  }
  if (p.academyId) rooms.push(`academy:${p.academyId}`);
  // Coach delivery uses the coach's AUTHORITATIVE user room — every socket
  // joins `user:{id}`; the legacy `coach:{id}` room is never joined server-side.
  // Coach audience is contract-limited to events about their own sessions/work:
  // only attendance-updated carries an authoritative group-coach today.
  if (eventName === 'academy:attendance-updated' && p.coachId) rooms.push(`user:${p.coachId}`);

  if (isAdminEvent) {
    // Administrative audience — server-derived IDs only.
    if (p.organisationId) rooms.push(`organisation:${p.organisationId}`);
    if (p.branchId) rooms.push(`branch:${p.branchId}`);
    rooms.push(ADMIN_ROOM);
  } else if (ACADEMY_ENROLLMENT_EVENTS.has(eventName) && p.organisationId) {
    // Roster/capacity admin workbench follows the enrollment lifecycle.
    rooms.push(`organisation:${p.organisationId}`);
    rooms.push(ADMIN_ROOM);
  }

  const prefix = isCoaching ? 'coaching' : 'academy';
  // Preserve the FULL event name after the domain prefix: `academy:session:hold-expired`
  // must map to `academy.session.hold-expired`, never the truncated `academy.session`.
  // For single-colon events this yields the exact historical type, so existing
  // consumers are unchanged.
  const sub = eventName.split(':').slice(1).join('.') || 'updated';
  // Forward only fields already present in the authoritative event payload —
  // never invent or derive values. The frontend cache layer keys on these.
  return {
    type: `${prefix}.${sub}`,
    payload: {
      academyId: p.academyId,
      userId: p.userId || p.playerId,
      playerId: p.playerId,
      sessionId: p.sessionId,
      programId: p.programId,
      enrollmentId: p.enrollmentId,
      groupId: p.groupId,
      scheduleId: p.scheduleId,
      date: p.date,
      organisationId: p.organisationId,
      branchId: p.branchId,
      coachId: p.coachId,
    },
    rooms,
  };
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

const MATCH_RESULT_EVENT_NAMES = new Set([
  'match:result-submitted',
  'match:result-approved',
  'match:result-auto-approved',
  'match:result-disputed',
  'match:result-rejected',
  'match:result-resolved',
  'match:result-corrected',
  'match:result-no-result',
  'match:result-withdrawn',
]);

const MATCH_DOMAIN_EVENT_NAMES = new Set([
  // Match lifecycle and compatibility events derived by the notification engine.
  'match:available',
  'match:created',
  'match:updated',
  'match:status_changed',
  'match:cancelled',
  'match:completed',
  'match:removed',
  'match:pending',
  // Participant/session lifecycle events.
  'invitation:sent',
  'invitation:declined',
  'invitation:expired',
  'join_request:submitted',
  'join_request:approved',
  'join_request:rejected',
  'join_request:withdrawn',
  'join_request:auto_rejected',
  'participant:added',
  'participant:removed',
  'waiting_list:promoted',
  'waiting_list:entry_added',
  'waiting_list:entry_removed',
  'session:started',
  'session:completed',
]);

function numericId(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function addRoom(rooms: Set<string>, value: string): void {
  rooms.add(value);
}

function addIdRoom(rooms: Set<string>, prefix: 'booking' | 'branch' | 'match' | 'organisation' | 'user', value: unknown): void {
  const id = numericId(value);
  if (id == null) return;
  if (prefix === 'booking') addRoom(rooms, bookingRoom(id));
  else if (prefix === 'branch') addRoom(rooms, branchRoom(id));
  else if (prefix === 'match') addRoom(rooms, matchRoom(id));
  else if (prefix === 'organisation') addRoom(rooms, orgRoom(id));
  else addRoom(rooms, userRoom(id));
}

function addUserRooms(rooms: Set<string>, value: unknown): void {
  const values = Array.isArray(value) ? value : [value];
  for (const userId of values) addIdRoom(rooms, 'user', userId);
}

/**
 * Build the authenticated, tenant-scoped audience for match-derived events.
 * Payload arrays are used only for room selection and are never echoed back to
 * clients. A player room is reserved for explicitly public discovery events;
 * private lifecycle data must never fall back to a global fan-out room.
 */
function roomsForScopedAudience(
  p: Record<string, any>,
  options: { includeBookingRoom?: boolean; publicDiscovery?: boolean } = {},
): string[] {
  const rooms = new Set<string>([ADMIN_ROOM]);

  addIdRoom(rooms, 'match', p.matchId);
  if (options.includeBookingRoom) addIdRoom(rooms, 'booking', p.bookingId);

  for (const field of [
    'userId',
    'creatorId',
    'submittedById',
    'approvedBy',
    'disputedBy',
    'winnerId',
    'addedUserId',
    'removedUserId',
    'recipientUserId',
  ]) {
    addUserRooms(rooms, p[field]);
  }
  for (const field of ['allUserIds', 'opponentUserIds', 'participantUserIds', 'memberUserIds']) {
    addUserRooms(rooms, p[field]);
  }

  for (const organisationId of Array.isArray(p.organisationIds)
    ? p.organisationIds
    : [p.organisationId]) {
    addIdRoom(rooms, 'organisation', organisationId);
  }
  for (const branchId of Array.isArray(p.branchIds) ? p.branchIds : [p.branchId]) {
    addIdRoom(rooms, 'branch', branchId);
  }

  if (options.publicDiscovery && p.visibility === 'public') {
    addRoom(rooms, PLAYER_ROOM);
  }

  return [...rooms];
}

function mapTournamentEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const sub = eventName.split(':')[1] || 'updated';
  return {
    type: `tournament.${sub}`,
    payload: {
      tournamentId: p.tournamentId,
      matchId: p.matchId,
      userId: p.userId,
      creatorId: p.creatorId,
      name: p.name,
      result: p.result,
      winnerId: p.winnerId,
      stageId: p.stageId,
      stageCompleted: p.stageCompleted,
      tournamentCompleted: p.tournamentCompleted,
      organisationId: p.organisationId,
      branchId: p.branchId,
      // Group 7 — participant/member/replacement state changes.
      participantId: p.participantId,
      participantType: p.participantType,
      memberUserIds: p.memberUserIds,
      addedUserId: p.addedUserId,
      removedUserId: p.removedUserId,
      requestId: p.requestId,
      status: p.status,
      // Group 8 — match generation / scheduling / court reservation state.
      generated: p.generated,
      byes: p.byes,
      resourceId: p.resourceId,
      date: p.date,
      startTime: p.startTime,
      endTime: p.endTime,
      bookingId: p.bookingId,
      scheduled: p.scheduled,
      skipped: p.skipped,
      // G8-D — generic cache-invalidation hints carried on the EXISTING
      // `tournament:updated` lifecycle event. Result correction and the
      // knockout-correction reconciliation re-emit this event with
      // `standings: true` / `bracket: true`; without forwarding them the
      // frontend's targeted invalidation checks could never fire.
      standings: p.standings,
      bracket: p.bracket,
    },
    rooms: roomsForScopedAudience(p, { includeBookingRoom: true }),
  };
}

const REGISTRATION_EVENT_NAMES = new Set(['registration.received']);

function mapRegistrationEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  return {
    type: eventName,
    payload: { tournamentId: p.tournamentId, registrationId: p.registrationId, userId: p.userId, status: p.status, paymentRequired: p.paymentRequired },
    rooms: roomsForScopedAudience(p),
  };
}

function mapChatEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const sub = eventName.split(':')[1] || 'new-message';
  const type = `chat.${sub}`;
  const rooms: string[] = [];
  const participantUserIds: number[] = Array.isArray(p.participantUserIds) ? p.participantUserIds : [];
  for (const uid of participantUserIds) {
    if (uid != null) rooms.push(`user:${uid}`);
  }
  if (p.conversationId) rooms.push(`conversation:${p.conversationId}`);
  if (p.userId) rooms.push(`user:${p.userId}`);
  return {
    type,
    payload: {
      conversationId: p.conversationId,
      userId: p.userId,
      senderName: p.senderName,
      preview: p.preview,
      groupId: p.groupId,
      inviterId: p.inviterId,
      inviterName: p.inviterName,
      groupName: p.groupName,
      callerName: p.callerName,
      timestamp: Date.now(),
    },
    rooms,
  };
}

function mapMatchResultEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const sub = eventName.split(':')[1] || 'updated';
  return {
    type: `match.${sub}`,
    payload: {
      matchId: p.matchId,
      resultId: p.resultId,
      submittedById: p.submittedById,
      approvedBy: p.approvedBy,
      disputedBy: p.disputedBy,
      status: p.status,
      outcome: p.outcome,
      resolution: p.resolution,
      timestamp: p.timestamp ?? Date.now(),
    },
    rooms: roomsForScopedAudience(p),
  };
}

function mapMatchEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const [namespace, sub] = eventName.split(':');
  const type = `${namespace}.${sub || 'updated'}`;
  return {
    type,
    payload: {
      matchId: p.matchId,
      bookingId: p.bookingId,
      tournamentId: p.tournamentId,
      userId: p.userId,
      creatorId: p.creatorId,
      fromStatus: p.fromStatus,
      toStatus: p.toStatus,
      status: p.status,
      reason: p.reason,
      role: p.role,
      position: p.position,
      startedAt: p.startedAt,
      durationMinutes: p.durationMinutes,
      winnerId: p.winnerId,
      timestamp: p.timestamp ?? Date.now(),
    },
    rooms: roomsForScopedAudience(p, {
      includeBookingRoom: true,
      publicDiscovery: eventName === 'match:available',
    }),
  };
}

function mapCoachEvent(eventName: string, p: Record<string, any>): MappedSocketEvent {
  const rooms: string[] = [];
  const userId = p.userId || p.coachUserId;
  if (userId) rooms.push(`user:${userId}`);
  // The canonical organisation room (realtime-rooms.orgRoom → `organisation:<id>`)
  // is what org staff join on connect. Previously this used `org:<id>`, so
  // coach agreement/invite/service-location/availability events never reached
  // org staff and admins. Use the SAME naming convention as every other
  // organisation-scoped event. Support BOTH a single `organisationId` (legacy
  // events) and an `organisationIds` array (a coach with several active
  // agreements must reach every relevant organisation room).
  const orgIds = p.organisationIds ?? (p.organisationId != null ? [p.organisationId] : []);
  const orgIdList = Array.isArray(orgIds) ? orgIds : [orgIds];
  for (const orgId of orgIdList) {
    if (orgId != null) rooms.push(`organisation:${orgId}`);
  }
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
