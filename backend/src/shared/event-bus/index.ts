import { EventEmitter } from 'events';

export interface BaseEvent {
  eventId?: string;
  timestamp?: string;
  correlationId?: string;
}

export interface DomainEventMap {
  'booking:created': BaseEvent & { bookingId: number; userId: number; courtId: number; startTime: Date; endTime: Date; startAtUtc?: string; endAtUtc?: string; bookingType?: string; organisationId?: number; branchId?: number };
  'booking:confirmed': BaseEvent & { bookingId: number; userId: number; organisationId?: number; branchId?: number; bookingType?: string };
  'booking:cancelled': BaseEvent & { bookingId: number; userId: number; reason?: string; organisationId?: number; branchId?: number };
  'booking:completed': BaseEvent & { bookingId: number; userId: number; organisationId?: number };
  'booking:expired': BaseEvent & { bookingId: number; userId: number; organisationId?: number };
  'booking:no-show': BaseEvent & { bookingId: number; userId: number; organisationId?: number };
  'booking:check-in': BaseEvent & { bookingId: number; userId: number; organisationId?: number };
  'booking:reminder': BaseEvent & { bookingId: number; userId: number; startTime: Date; organisationId?: number };
  'booking:matchmaking-complete': BaseEvent & { bookingId: number; userId: number; matchedPlayers: number; maxPlayers: number };
  'booking:rescheduled': BaseEvent & { bookingId: number; userId: number; oldStart: Date; newStart: Date; organisationId?: number };
  'booking:fully-booked': BaseEvent & { bookingId: number; userId: number; resourceId: number; organisationId?: number };
  'booking:auto-cancelled': BaseEvent & { bookingId: number; userId: number; reason: string; organisationId?: number };
  'booking:application-declined': BaseEvent & { bookingId: number; userId: number; ownerId: number };
  'payment:completed': BaseEvent & { paymentId: number; userId: number; amount: number; currency: string; gateway: string; organisationId?: number };
  'payment:failed': BaseEvent & { paymentId: number; userId: number; amount: number; currency?: string; error: string; organisationId?: number };
  'payment:refunded': BaseEvent & { paymentId: number; userId: number; amount: number; organisationId?: number };
  'payment:succeeded': BaseEvent & { paymentId: number; referenceType: string; referenceId: number; amount: number; metadata?: Record<string, any> };
  'payment:failed-event': BaseEvent & { paymentId: number; referenceType: string; referenceId: number; amount: number; reason?: string; metadata?: Record<string, any> };
  'payment:cancelled-event': BaseEvent & { paymentId: number; referenceType: string; referenceId: number; metadata?: Record<string, any> };
  'payment:expired-event': BaseEvent & { paymentId: number; referenceType: string; referenceId: number; metadata?: Record<string, any> };
  'payment:wallet-credited': BaseEvent & { walletId: number; userId: number; amount: number; balance: number };
  'payment:wallet-debited': BaseEvent & { walletId: number; userId: number; amount: number; balance: number };
  'payment:wallet-low-balance': BaseEvent & { userId: number; balance: number; currency: string };
  'payment:wallet-topup': BaseEvent & { walletId: number; userId: number; amount: number; balance: number; currency: string };
  'marketplace:order-placed': BaseEvent & { orderId: number; userId: number; sellerId: number; total: number; organisationId?: number };
  'marketplace:order-confirmed': BaseEvent & { orderId: number; userId: number; sellerId: number };
  'marketplace:order-shipped': BaseEvent & { orderId: number; userId: number; trackingNumber?: string };
  'marketplace:order-delivered': BaseEvent & { orderId: number; userId: number };
  'marketplace:order-cancelled': BaseEvent & { orderId: number; userId: number; reason?: string };
  'marketplace:new-review': BaseEvent & { reviewId: number; productId: number; reviewedUserId: number; rating: number };
  'marketplace:product-back-in-stock': BaseEvent & { productId: number; userId: number; productName: string };
  'marketplace:price-drop': BaseEvent & { productId: number; userId: number; oldPrice: number; newPrice: number; productName: string };
  'marketplace:flash-sale': BaseEvent & { productId: number; userId: number; discountPercent: number; productName: string; endsAt: Date };
  'marketplace:new-seller-registered': BaseEvent & { sellerId: number; userId: number; shopName: string };
  'marketplace:order-status-changed': BaseEvent & { orderId: number; userId: number; fromStatus: string; toStatus: string };
  'marketplace:order-refunded': BaseEvent & { orderId: number; userId: number; amount?: number; reason?: string };
  'user:registered': BaseEvent & { userId: number; email: string; role?: string };
  'user:approved': BaseEvent & { userId: number; role: string };
  'user:rejected': BaseEvent & { userId: number; reason?: string };
  'user:suspended': BaseEvent & { userId: number; reason?: string };
  'user:activated': BaseEvent & { userId: number };
  'user:reactivated': BaseEvent & { userId: number };
  'user:profile-updated': BaseEvent & { userId: number };
  'user:deleted': BaseEvent & { userId: number };
  'auth:login': BaseEvent & { userId: number; ip: string };
  'auth:login-failed': BaseEvent & { email: string; ip: string };
  'auth:logout': BaseEvent & { userId: number };
  'auth:password-changed': BaseEvent & { userId: number };
  'auth:password-reset': BaseEvent & { userId: number; email: string; resetLink: string };
  'auth:mfa-enabled': BaseEvent & { userId: number; method: string };
  'auth:mfa-disabled': BaseEvent & { userId: number };
  'auth:2fa-setup': BaseEvent & { userId: number; method: string };
  'organisation:created': BaseEvent & { organisationId: number; ownerId: number; name: string };
  'organisation:updated': BaseEvent & { organisationId: number; userId: number };
  'organisation:approved': BaseEvent & { organisationId: number; name: string; userId?: number };
  'organisation:rejected': BaseEvent & { organisationId: number; reason?: string };
  'organisation:suspended': BaseEvent & { organisationId: number; reason?: string };
  'organisation:member-joined': BaseEvent & { organisationId: number; userId: number; role: string };
  'organisation:member-left': BaseEvent & { organisationId: number; userId: number };
  'organisation:subscription-expiring': BaseEvent & { organisationId: number; daysLeft: number; planName: string };
  'organisation:subscription-expired': BaseEvent & { organisationId: number; planName: string };
  'organisation:subscription-renewed': BaseEvent & { organisationId: number; planName: string; billingCycle: string };
  'club:created': BaseEvent & { clubId: number; userId: number; name: string };
  'club:member-joined': BaseEvent & { clubId: number; userId: number; clubName: string };
  'club:member-left': BaseEvent & { clubId: number; userId: number };
  'club:new-event': BaseEvent & { eventId: number; clubId: number; title: string; date: Date };
  'academy:enrolled': BaseEvent & { academyId: number; userId: number; studentName: string };
  'academy:session-reminder': BaseEvent & { sessionId: number; userId: number; startTime: Date; academyName: string };
  'academy:graduated': BaseEvent & { academyId: number; userId: number; studentName: string };
  'coaching:session-scheduled': BaseEvent & { sessionId: number; coachId: number; userId: number; startTime: Date };
  'coaching:session-cancelled': BaseEvent & { sessionId: number; userId: number; reason?: string };
  'coaching:session-reminder': BaseEvent & { sessionId: number; userId: number; startTime: Date; coachName: string };
  'coach:invited': BaseEvent & { coachId: number; userId: number; organisationId: number; organisationName: string; invitedBy: number };
  'coach:agreement-added': BaseEvent & { coachId: number; coachName: string; userId: number; organisationId: number; organisationName: string };
  'tournament:created': BaseEvent & { tournamentId: number; userId: number; name: string };
  'tournament:starting-soon': BaseEvent & { tournamentId: number; userId: number; name: string; startDate: Date };
  'tournament:registration-open': BaseEvent & { tournamentId: number; name: string };
  'tournament:registration-closed': BaseEvent & { tournamentId: number; name: string };
  'tournament:match-scheduled': BaseEvent & { matchId: number; userId: number; opponent: string; date: Date };
  'tournament:result': BaseEvent & { matchId: number; userId: number; result: string; ranking?: number };
  'match:invitation': BaseEvent & { bookingId: number; userId: number; senderId: number; startTime?: Date; actions?: any[] };
  'community:new-post': BaseEvent & { postId: number; userId: number; communityName: string };
  'community:new-comment': BaseEvent & { commentId: number; postId: number; userId: number; authorName: string };
  'community:mention': BaseEvent & { userId: number; mentionedBy: number; postId: number };
  'community:reply': BaseEvent & { postId: number; userId: number; authorName: string };
  'community:like': BaseEvent & { postId: number; userId: number; likedBy: number };
  'friend:request': BaseEvent & { friendId: number; userId: number; fromUserId: number; fromUserName: string };
  'friend:accepted': BaseEvent & { friendId: number; userId: number; byUserId: number };
  'friend:blocked': BaseEvent & { userId: number; blockedUserId: number };
  'chat:new-message': BaseEvent & { conversationId: number; userId: number; senderName: string; preview: string };
  'chat:missed-call': BaseEvent & { conversationId: number; userId: number; callerName: string };
  'chat:group-created': BaseEvent & { groupId: number; userId: number; groupName: string };
  'chat:group-joined': BaseEvent & { groupId: number; userId: number; groupName: string };
  'chat:group-invitation': BaseEvent & { conversationId: number; userId: number; inviterId: number; inviterName: string; groupName: string };
  'membership:expiring': BaseEvent & { membershipId: number; userId: number; daysLeft: number; type: string };
  'membership:expired': BaseEvent & { membershipId: number; userId: number; type: string };
  'membership:renewed': BaseEvent & { membershipId: number; userId: number; type: string };
  'membership:upgraded': BaseEvent & { membershipId: number; userId: number; type: string };
  'subscription:renewal-reminder': BaseEvent & { subscriptionId: number; userId: number; daysLeft: number; planName: string };
  'subscription:upgraded': BaseEvent & { subscriptionId: number; userId: number; planName: string };
  'subscription:cancelled': BaseEvent & { subscriptionId: number; userId: number; planName: string };
  'subscription:request-submitted': BaseEvent & { organisationId: number; userId: number; requestId: number; requestType: string; requestedPlanName?: string; notes?: string };
  'subscription:request-approved': BaseEvent & { organisationId: number; requestId: number; requestType: string; requestedPlanName?: string; approvedBy: number };
  'subscription:request-rejected': BaseEvent & { organisationId: number; requestId: number; requestType: string; requestedPlanName?: string; reason: string; rejectedBy: number };
  'wallet:deposit': BaseEvent & { walletId: number; userId: number; amount: number; balance: number; currency?: string };
  'wallet:withdrawal': BaseEvent & { walletId: number; userId: number; amount: number; balance: number; currency?: string };
  'wallet:low-balance': BaseEvent & { userId: number; balance: number; currency: string };
  'wallet:transaction': BaseEvent & { walletId: number; userId: number; amount: number; type: string; description?: string };
  'settlement:completed': BaseEvent & { settlementId: number; organisationId: number; amount: number };
  'settlement:failed': BaseEvent & { settlementId: number; organisationId: number; reason: string };
  'coupon:published': BaseEvent & { couponId: number; code: string; discountValue: number; discountType: string; organisationIds: number[] };
  'review:received': BaseEvent & { reviewId: number; entityId: number; userId: number; rating: number; entityType: string };
  'attendance:recorded': BaseEvent & { attendanceId: number; userId: number; sessionId: number; status: string };
  'attendance:marked': BaseEvent & { attendanceId: number; userId: number; sessionId: number; status: string; bookingId?: number };
  'support:ticket-opened': BaseEvent & { ticketId: number; userId: number; subject: string };
  'support:ticket-updated': BaseEvent & { ticketId: number; userId: number; status: string };
  'support:ticket-resolved': BaseEvent & { ticketId: number; userId: number };
  'support:ticket-closed': BaseEvent & { ticketId: number; userId: number };
  'security:suspicious-login': BaseEvent & { userId: number; ip: string; location?: string };
  'security:account-locked': BaseEvent & { userId: number; reason: string };
  'security:permission-changed': BaseEvent & { userId: number; changedBy: number; roleId: number };
  'system:announcement': BaseEvent & { title: string; body: string; targetRole?: string; targetUserId?: number; targetOrgId?: number; targetBranchId?: number };
  'system:maintenance': BaseEvent & { title: string; body: string; startAt: Date; endAt: Date };
  'system:birthday': BaseEvent & { userId: number; name: string };
  'system:digest': BaseEvent & { userId: number; notifications: Array<{ id: number; title: string; categorySlug: string }> };
  'notification:broadcast': BaseEvent & { broadcastId: number; payload: BroadcastPayload; target: BroadcastTarget };
}

export interface BroadcastPayload {
  title: string;
  body: string;
  type?: string;
  priority?: string;
  actionKey?: string;
  imageUrls?: Record<string, string>;
  actions?: any[];
}

export type BroadcastTarget =
  | { scope: 'all' }
  | { scope: 'role'; roleSlug: string }
  | { scope: 'organisation'; organisationId: number }
  | { scope: 'branch'; branchId: number }
  | { scope: 'users'; userIds: number[] };

export type DomainEventName = keyof DomainEventMap;

import { eventBusV2 } from './event-bus.v2.js';

const legacyEmitter = new EventEmitter();
legacyEmitter.setMaxListeners(200);

class EventBus {
  emit<E extends DomainEventName>(event: E, data: DomainEventMap[E]): void {
    const payload = {
      ...data,
      eventId: data.eventId || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: data.timestamp || new Date().toISOString(),
    };

    eventBusV2.emit(event as string, payload as unknown as Record<string, unknown>, {
      aggregateType: event.split(':')[0] || 'unknown',
      aggregateId: String((data as any).bookingId || (data as any).userId || (data as any).paymentId || (data as any).orderId || '0'),
      aggregateVersion: 1,
      correlationId: data.correlationId,
    }).catch((err) => {
      console.error('EventBus v2 emit failed', err);
    });

    process.nextTick(() => {
      legacyEmitter.emit(event, payload);
      legacyEmitter.emit('*', { event, data: payload });
    });
  }

  on<E extends DomainEventName>(event: E, handler: (data: DomainEventMap[E]) => void): void {
    legacyEmitter.on(event, handler);
  }

  subscribe(registration: Parameters<typeof eventBusV2.subscribe>[0]): void {
    eventBusV2.subscribe(registration);
  }

  onAny(handler: (event: DomainEventName, data: any) => void): void {
    legacyEmitter.on('*', ({ event, data }: { event: DomainEventName; data: any }) => handler(event, data));
  }

  off<E extends DomainEventName>(event: E, handler: (data: DomainEventMap[E]) => void): void {
    legacyEmitter.off(event, handler);
  }

  once<E extends DomainEventName>(event: E, handler: (data: DomainEventMap[E]) => void): void {
    legacyEmitter.once(event, handler);
  }

  removeAllListeners(event?: DomainEventName): void {
    if (event) legacyEmitter.removeAllListeners(event);
    else legacyEmitter.removeAllListeners();
  }

  listenerCount(event: DomainEventName): number {
    return legacyEmitter.listenerCount(event);
  }
}

export const eventBus = new EventBus();

export { eventBusV2 } from './event-bus.v2.js';
export { OutboxPoller } from './outbox-poller.js';
export { createSubscriberWorker } from './subscriber.worker.js';
export { createEnvelope, generateUlid } from './event-envelope.js';
export type { EventEnvelope, EnvelopeContext } from './event-envelope.js';
export type { SubscriberRegistration, SubscriberWorkerConfig, StartingCursor, DeliveryGuarantee } from './event-bus.types.js';
