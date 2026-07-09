import { eventBus } from '../../../shared/event-bus/index.js';
import { dispatchToUser, dispatchByRole, dispatchByOrg } from './dispatcher.service.js';
import { realtimeService } from '../../../platform/realtime/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('notification-engine');

type EventHandler = (eventName: string, data: any, categorySlug: string) => Promise<void>;

interface EventGroupConfig {
  events: string[];
  handler: EventHandler;
}

const eventGroups: EventGroupConfig[] = [
  {
    events: ['user:registered'],
    handler: async (eventName, data, categorySlug) => {
      await dispatchByRole('super_admin', { eventName, categorySlug, data });
    },
  },
  {
    events: ['system:announcement'],
    handler: async (eventName, data, categorySlug) => {
      if (data.targetUserId) {
        await dispatchToUser({ userId: data.targetUserId, eventName, categorySlug, data });
      } else if (data.targetRole) {
        await dispatchByRole(data.targetRole, {
          eventName, categorySlug,
          data: { ...data, title: data.title, body: data.body },
        });
      } else if (data.title && data.body) {
        const { dispatchToAll } = await import('./dispatcher.service.js');
        await dispatchToAll({ eventName, categorySlug, data: { title: data.title, body: data.body } });
      }
    },
  },
  {
    events: [
      'booking:created', 'booking:cancelled', 'booking:auto-cancelled',
      'booking:expired', 'booking:rescheduled', 'booking:completed',
      'booking:no-show', 'booking:application-declined', 'booking:check-in',
    ],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          organisationId: data.organisationId, branchId: data.branchId,
          relatedEntityType: 'booking', relatedEntityId: String(data.bookingId),
          actionPayload: { bookingId: data.bookingId }, digestable: false,
        });
      }
      if (eventName === 'booking:created' && data.bookingType === 'public_match') {
        realtimeService.emitToPlayers('match:available', { bookingId: data.bookingId, timestamp: new Date().toISOString() });
      }
      if (eventName === 'booking:cancelled' || eventName === 'booking:auto-cancelled') {
        realtimeService.emitToPlayers('match:removed', { bookingId: data.bookingId });
      }
    },
  },
  {
    events: ['booking:confirmed'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          organisationId: data.organisationId, branchId: data.branchId,
          relatedEntityType: 'booking', relatedEntityId: String(data.bookingId),
          actionPayload: { bookingId: data.bookingId }, digestable: false,
        });
      }
      const { scheduleBookingReminder } = await import('./scheduler.service.js');
      const { getPool } = await import('../../../database/mysql.js');
      const pool = getPool();
      const [bkRows] = await pool.execute<any>(
        'SELECT user_id, booking_date, start_time FROM bookings WHERE id = ?', [data.bookingId],
      );
      if (bkRows.length) {
        const bk = bkRows[0];
        const startDate = new Date(`${String(bk.booking_date).split('T')[0]}T${bk.start_time}`);
        scheduleBookingReminder(data.bookingId, bk.user_id, startDate).catch((err: any) =>
          log.error({ err, bookingId: data.bookingId }, 'Failed to schedule booking reminder')
        );
      }
    },
  },
  {
    events: ['booking:reminder'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'booking', relatedEntityId: String(data.bookingId),
          digestable: false,
        });
      }
    },
  },
  {
    events: ['booking:matchmaking-complete'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'booking', relatedEntityId: String(data.bookingId),
          actionPayload: { bookingId: data.bookingId },
        });
      }
    },
  },
  {
    events: ['booking:fully-booked'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'booking', relatedEntityId: String(data.bookingId),
        });
      }
    },
  },
  {
    events: ['payment:completed', 'payment:failed', 'payment:refunded', 'payment:initiated'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          organisationId: data.organisationId,
          relatedEntityType: 'payment', relatedEntityId: String(data.paymentId),
          digestable: false,
        });
      }
    },
  },
  {
    events: ['payment:wallet-topup', 'payment:wallet-low-balance', 'wallet:deposit', 'wallet:withdrawal', 'wallet:low-balance', 'wallet:transaction'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({ userId: data.userId, eventName, categorySlug, data });
      }
    },
  },
  {
    events: ['marketplace:order-placed', 'marketplace:order-confirmed', 'marketplace:order-shipped', 'marketplace:order-delivered', 'marketplace:order-refunded', 'marketplace:order-cancelled', 'marketplace:order-status-changed'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'order', relatedEntityId: String(data.orderId),
        });
      }
      if (data.sellerId && data.sellerId !== data.userId) {
        await dispatchToUser({
          userId: data.sellerId, eventName, categorySlug, data,
          relatedEntityType: 'order', relatedEntityId: String(data.orderId),
        });
      }
    },
  },
  {
    events: ['marketplace:new-review'],
    handler: async (eventName, data, categorySlug) => {
      if (data.reviewedUserId) {
        await dispatchToUser({
          userId: data.reviewedUserId, eventName, categorySlug, data,
          relatedEntityType: 'review', relatedEntityId: String(data.reviewId),
        });
      }
    },
  },
  {
    events: ['marketplace:product-back-in-stock', 'marketplace:price-drop', 'marketplace:flash-sale'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'product', relatedEntityId: String(data.productId),
        });
      }
    },
  },
  {
    events: ['marketplace:new-seller-registered'],
    handler: async (eventName, data, categorySlug) => {
      await dispatchByRole('super_admin', {
        eventName, categorySlug,
        data: { ...data, title: 'New Seller Registered', body: `${data.shopName} has registered as a seller.` },
      });
    },
  },
  {
    events: ['user:approved', 'user:rejected', 'user:suspended', 'user:activated', 'user:profile-updated', 'user:deleted'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'user', relatedEntityId: String(data.userId),
        });
      }
    },
  },
  {
    events: ['auth:password-reset', 'auth:password-changed', 'auth:login', 'auth:logout', 'auth:2fa-setup'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({ userId: data.userId, eventName, categorySlug, data, digestable: false });
      }
    },
  },
  {
    events: ['organisation:created', 'organisation:approved', 'organisation:rejected', 'organisation:subscription-expiring', 'organisation:subscription-expired', 'organisation:subscription-renewed'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          organisationId: data.organisationId,
          relatedEntityType: 'organisation', relatedEntityId: String(data.organisationId),
        });
      }
    },
  },
  {
    events: ['club:created', 'club:member-joined', 'club:member-left'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          organisationId: data.organisationId,
          relatedEntityType: 'club', relatedEntityId: String(data.clubId || data.organisationId),
        });
      }
    },
  },
  {
    events: ['academy:enrolled', 'academy:session-reminder', 'academy:graduated'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          organisationId: data.organisationId,
          relatedEntityType: 'academy', relatedEntityId: String(data.academyId),
          digestable: eventName === 'academy:session-reminder' ? false : undefined,
        });
      }
    },
  },
  {
    events: ['coaching:session-scheduled', 'coaching:session-reminder', 'coaching:session-cancelled'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'session', relatedEntityId: String(data.sessionId),
          digestable: false,
        });
      }
      if (data.coachId && data.coachId !== data.userId) {
        await dispatchToUser({
          userId: data.coachId, eventName, categorySlug, data,
          relatedEntityType: 'session', relatedEntityId: String(data.sessionId),
          digestable: false,
        });
      }
    },
  },
  {
    events: ['tournament:created', 'tournament:registration-open', 'tournament:registration-closed', 'tournament:starting-soon', 'tournament:match-scheduled', 'tournament:result'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'tournament', relatedEntityId: String(data.tournamentId || data.matchId),
        });
      }
    },
  },
  {
    events: ['community:mention', 'community:reply', 'community:like'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'post', relatedEntityId: String(data.postId),
        });
      }
    },
  },
  {
    events: ['friend:request', 'friend:accepted', 'friend:blocked'],
    handler: async (eventName, data, categorySlug) => {
      if (data.toUserId) {
        await dispatchToUser({ userId: data.toUserId, eventName, categorySlug, data, senderId: data.fromUserId });
      }
      if (data.fromUserId && data.toUserId !== data.fromUserId) {
        await dispatchToUser({ userId: data.fromUserId, eventName, categorySlug, data });
      }
    },
  },
  {
    events: ['chat:new-message'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'chat',
        });
      }
    },
  },
  {
    events: ['chat:group-created', 'chat:group-joined'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'chat',
        });
      }
    },
  },
  {
    events: ['membership:expiring', 'membership:expired', 'membership:renewed', 'membership:upgraded'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'membership', digestable: false,
        });
      }
    },
  },
  {
    events: ['review:received'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'review', relatedEntityId: String(data.reviewId),
        });
      }
    },
  },
  {
    events: ['attendance:marked'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'booking', relatedEntityId: String(data.bookingId),
        });
      }
    },
  },
  {
    events: ['support:ticket-opened', 'support:ticket-resolved', 'support:ticket-closed'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'ticket', relatedEntityId: String(data.ticketId),
        });
      }
    },
  },
  {
    events: ['security:suspicious-login', 'security:account-locked'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          digestable: false, priority: 'critical',
        });
      }
    },
  },
  {
    events: ['system:maintenance', 'system:birthday'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          digestable: false,
        });
      }
    },
  },
  {
    events: ['match:invitation'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'booking', relatedEntityId: String(data.bookingId),
          senderId: data.senderId, actions: data.actions,
          digestable: false, actionPayload: { bookingId: data.bookingId },
        });
      }
    },
  },
  {
    events: ['coupon:published'],
    handler: async (eventName, data, categorySlug) => {
      if (data.organisationIds?.length) {
        for (const orgId of data.organisationIds) {
          await dispatchByOrg(orgId, {
            eventName, categorySlug, data,
            relatedEntityType: 'coupon', relatedEntityId: String(data.couponId),
          });
        }
      }
    },
  },
  {
    events: ['notification:broadcast'],
    handler: async (eventName, data, categorySlug) => {
      const { dispatchToAll, dispatchByBranch, dispatchByUserIdsBulk } = await import('./dispatcher.service.js');
      const options = {
        eventName: 'system:announcement' as const,
        categorySlug: 'system' as const,
        data: { title: data.payload.title, body: data.payload.body, broadcastId: data.broadcastId },
        type: data.payload.type, priority: data.payload.priority,
        actionKey: data.payload.actionKey, imageUrls: data.payload.imageUrls,
        actions: data.payload.actions, locale: 'en',
      };
      switch (data.target.scope) {
        case 'all': await dispatchToAll(options); break;
        case 'role': await dispatchByRole(data.target.roleSlug, options); break;
        case 'organisation': await dispatchByOrg(data.target.organisationId, options); break;
        case 'branch': await dispatchByBranch(data.target.branchId ?? 0, options); break;
        case 'users': await dispatchByUserIdsBulk(data.target.userIds, options); break;
      }
    },
  },
];

function buildEventMap(groups: EventGroupConfig[]): Map<string, EventHandler> {
  const map = new Map<string, EventHandler>();
  for (const group of groups) {
    for (const event of group.events) {
      map.set(event, group.handler);
    }
  }
  return map;
}

function getCategorySlug(event: string): string {
  if (event.startsWith('booking')) return 'bookings';
  if (event.startsWith('payment') || event.startsWith('wallet')) return 'payments';
  if (event.startsWith('marketplace')) return 'marketplace';
  return 'system';
}

class NotificationEngine {
  private subscribed = false;

  start(): void {
    if (this.subscribed) return;
    this.subscribed = true;

    const subscribedEvents: string[] = [
      'booking:created', 'booking:confirmed', 'booking:cancelled', 'booking:expired',
      'booking:rescheduled', 'booking:completed', 'booking:reminder', 'booking:no-show',
      'booking:check-in', 'booking:matchmaking-complete', 'booking:fully-booked',
      'payment:completed', 'payment:failed', 'payment:refunded', 'payment:initiated',
      'payment:wallet-topup', 'payment:wallet-low-balance',
      'marketplace:order-placed', 'marketplace:order-confirmed', 'marketplace:order-shipped',
      'marketplace:order-delivered', 'marketplace:order-cancelled',
      'marketplace:order-status-changed', 'marketplace:order-refunded',
      'marketplace:new-review', 'marketplace:product-back-in-stock',
      'marketplace:price-drop', 'marketplace:flash-sale', 'marketplace:new-seller-registered',
      'user:registered', 'user:approved', 'user:rejected', 'user:suspended',
      'user:activated', 'user:profile-updated', 'user:deleted',
      'auth:password-reset', 'auth:password-changed', 'auth:login', 'auth:logout', 'auth:2fa-setup',
      'organisation:created', 'organisation:approved', 'organisation:rejected',
      'organisation:subscription-expiring', 'organisation:subscription-expired',
      'organisation:subscription-renewed',
      'club:created', 'club:member-joined', 'club:member-left',
      'academy:enrolled', 'academy:session-reminder', 'academy:graduated',
      'coaching:session-scheduled', 'coaching:session-reminder', 'coaching:session-cancelled',
      'tournament:created', 'tournament:registration-open', 'tournament:registration-closed',
      'tournament:starting-soon', 'tournament:match-scheduled', 'tournament:result',
      'community:mention', 'community:reply', 'community:like',
      'friend:request', 'friend:accepted', 'friend:blocked',
      'chat:new-message', 'chat:group-created', 'chat:group-joined',
      'membership:expiring', 'membership:expired', 'membership:renewed', 'membership:upgraded',
      'wallet:deposit', 'wallet:withdrawal', 'wallet:low-balance', 'wallet:transaction',
      'review:received', 'attendance:marked',
      'support:ticket-opened', 'support:ticket-resolved', 'support:ticket-closed',
      'security:suspicious-login', 'security:account-locked',
      'system:announcement', 'system:maintenance', 'system:birthday', 'system:digest',
      'match:invitation',
      'coupon:published', 'booking:auto-cancelled', 'booking:application-declined',
      'notification:broadcast',
    ];

    const eventMap = buildEventMap(eventGroups);

    for (const event of subscribedEvents) {
      const handler = eventMap.get(event);
      if (!handler) {
        log.warn({ event }, 'No event configuration found — event will be processed as no-op');
        eventBus.on(event as any, () => {});
        continue;
      }
      eventBus.on(event as any, (data) => {
        this.handleEvent(event, handler, data).catch((err) => {
          log.error({ err, event }, 'Error handling event');
        });
      });
    }
  }

  private async handleEvent(eventName: string, handler: EventHandler, data: any): Promise<void> {
    const categorySlug = getCategorySlug(eventName);
    await handler(eventName, data, categorySlug);
  }
}

export const notificationEngine = new NotificationEngine();
