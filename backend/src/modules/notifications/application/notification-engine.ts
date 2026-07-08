import { eventBus } from '../../../shared/event-bus/index.js';
import { dispatchToUser, dispatchByRole, dispatchByOrg } from './dispatcher.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('notification-engine');

type EventListener = (data: any) => Promise<void>;

class NotificationEngine {
  private subscribed = false;

  start(): void {
    if (this.subscribed) return;
    this.subscribed = true;

    const events = [
      'booking:created', 'booking:confirmed', 'booking:cancelled', 'booking:expired',
      'booking:rescheduled', 'booking:completed', 'booking:reminder', 'booking:no-show',
      'booking:check-in', 'booking:matchmaking-complete', 'booking:fully-booked',

      'payment:completed', 'payment:failed', 'payment:refunded', 'payment:initiated',
      'payment:wallet-topup', 'payment:wallet-low-balance',

      'marketplace:order-placed', 'marketplace:order-confirmed', 'marketplace:order-shipped',
      'marketplace:order-delivered', 'marketplace:order-cancelled',
      'marketplace:order-status-changed', 'marketplace:order-refunded',
      'marketplace:new-review', 'marketplace:product-back-in-stock',
      'marketplace:price-drop', 'marketplace:flash-sale',

      'user:registered', 'user:approved', 'user:rejected', 'user:suspended',
      'user:activated', 'user:profile-updated', 'user:deleted',

      'auth:password-changed', 'auth:login', 'auth:logout', 'auth:2fa-setup',

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

      'coupon:published',       'booking:auto-cancelled', 'booking:application-declined',
    ];

    for (const event of events) {
      eventBus.on(event as any, (data) => {
        this.handleEvent(event, data).catch((err) => {
          log.error({ err, event }, 'Error handling event');
        });
      });
    }
  }

  // eslint-disable-next-line complexity
  private async handleEvent(eventName: string, data: any): Promise<void> {
    const categorySlug = this.getCategorySlug(eventName);

    switch (eventName) {
      case 'user:registered': {
        await dispatchByRole('super_admin', {
          eventName: eventName,
          categorySlug,
          data,
        });
        break;
      }

      case 'system:announcement': {
        if (data.targetUserId) {
          await dispatchToUser({ userId: data.targetUserId, eventName: eventName, categorySlug, data });
        } else if (data.targetRole) {
          await dispatchByRole(data.targetRole, {
            eventName: eventName, categorySlug,
            data: { ...data, title: data.title, body: data.body },
          });
        } else if (data.title && data.body) {
          const { dispatchToAll } = await import('./dispatcher.service.js');
          await dispatchToAll({
            eventName: eventName, categorySlug,
            data: { title: data.title, body: data.body },
          });
        }
        break;
      }

      case 'booking:created':
      case 'booking:confirmed':
      case 'booking:cancelled':
      case 'booking:auto-cancelled':
      case 'booking:expired':
      case 'booking:rescheduled':
      case 'booking:completed':
      case 'booking:no-show':
      case 'booking:application-declined':
      case 'booking:check-in': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug,
            data,
            organisationId: data.organisationId,
            branchId: data.branchId,
            relatedEntityType: 'booking',
            relatedEntityId: String(data.bookingId),
            actionPayload: { bookingId: data.bookingId },
          });
        }
        break;
      }

      case 'booking:reminder': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'booking', relatedEntityId: String(data.bookingId),
            digestable: false,
          });
        }
        break;
      }

      case 'booking:matchmaking-complete': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'booking', relatedEntityId: String(data.bookingId),
            actionPayload: { bookingId: data.bookingId },
          });
        }
        break;
      }

      case 'booking:fully-booked': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'booking', relatedEntityId: String(data.bookingId),
          });
        }
        break;
      }

      case 'payment:completed':
      case 'payment:failed':
      case 'payment:refunded':
      case 'payment:initiated': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            organisationId: data.organisationId,
            relatedEntityType: 'payment', relatedEntityId: String(data.paymentId),
          });
        }
        break;
      }

      case 'payment:wallet-topup':
      case 'payment:wallet-low-balance':
      case 'wallet:deposit':
      case 'wallet:withdrawal':
      case 'wallet:low-balance':
      case 'wallet:transaction': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
          });
        }
        break;
      }

      case 'marketplace:order-placed':
      case 'marketplace:order-confirmed':
      case 'marketplace:order-shipped':
      case 'marketplace:order-delivered':
      case 'marketplace:order-refunded':
      case 'marketplace:order-cancelled':
      case 'marketplace:order-status-changed': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'order', relatedEntityId: String(data.orderId),
          });
        }
        if (data.sellerId && data.sellerId !== data.userId) {
          await dispatchToUser({
            userId: data.sellerId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'order', relatedEntityId: String(data.orderId),
          });
        }
        break;
      }

      case 'marketplace:new-review': {
        if (data.reviewedUserId) {
          await dispatchToUser({
            userId: data.reviewedUserId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'review', relatedEntityId: String(data.reviewId),
          });
        }
        break;
      }

      case 'marketplace:product-back-in-stock':
      case 'marketplace:price-drop':
      case 'marketplace:flash-sale': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'product', relatedEntityId: String(data.productId),
          });
        }
        break;
      }

      case 'user:approved':
      case 'user:rejected':
      case 'user:suspended':
      case 'user:activated':
      case 'user:profile-updated':
      case 'user:deleted': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'user', relatedEntityId: String(data.userId),
          });
        }
        break;
      }

      case 'auth:password-changed':
      case 'auth:login':
      case 'auth:logout':
      case 'auth:2fa-setup': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            digestable: false,
          });
        }
        break;
      }

      case 'organisation:created':
      case 'organisation:approved':
      case 'organisation:rejected':
      case 'organisation:subscription-expiring':
      case 'organisation:subscription-expired':
      case 'organisation:subscription-renewed': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            organisationId: data.organisationId,
            relatedEntityType: 'organisation', relatedEntityId: String(data.organisationId),
          });
        }
        break;
      }

      case 'club:created':
      case 'club:member-joined':
      case 'club:member-left': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            organisationId: data.organisationId,
            relatedEntityType: 'club', relatedEntityId: String(data.clubId || data.organisationId),
          });
        }
        break;
      }

      case 'academy:enrolled':
      case 'academy:session-reminder':
      case 'academy:graduated': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            organisationId: data.organisationId,
            relatedEntityType: 'academy', relatedEntityId: String(data.academyId),
            digestable: eventName === 'academy:session-reminder' ? false : undefined,
          });
        }
        break;
      }

      case 'coaching:session-scheduled':
      case 'coaching:session-reminder':
      case 'coaching:session-cancelled': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'session', relatedEntityId: String(data.sessionId),
            digestable: false,
          });
        }
        if (data.coachId && data.coachId !== data.userId) {
          await dispatchToUser({
            userId: data.coachId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'session', relatedEntityId: String(data.sessionId),
            digestable: false,
          });
        }
        break;
      }

      case 'tournament:created':
      case 'tournament:registration-open':
      case 'tournament:registration-closed':
      case 'tournament:starting-soon':
      case 'tournament:match-scheduled':
      case 'tournament:result': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'tournament', relatedEntityId: String(data.tournamentId || data.matchId),
          });
        }
        break;
      }

      case 'community:mention':
      case 'community:reply':
      case 'community:like': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'post', relatedEntityId: String(data.postId),
          });
        }
        break;
      }

      case 'friend:request':
      case 'friend:accepted':
      case 'friend:blocked': {
        if (data.toUserId) {
          await dispatchToUser({
            userId: data.toUserId, eventName: eventName, categorySlug, data,
            senderId: data.fromUserId,
          });
        }
        if (data.fromUserId && data.toUserId !== data.fromUserId) {
          await dispatchToUser({
            userId: data.fromUserId, eventName: eventName, categorySlug, data,
          });
        }
        break;
      }

      case 'chat:new-message': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'chat',
          });
        }
        break;
      }
      case 'chat:group-created':
      case 'chat:group-joined': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'chat',
          });
        }
        break;
      }

      case 'membership:expiring':
      case 'membership:expired':
      case 'membership:renewed':
      case 'membership:upgraded': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'membership',
            digestable: false,
          });
        }
        break;
      }

      case 'review:received': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'review', relatedEntityId: String(data.reviewId),
          });
        }
        break;
      }

      case 'attendance:marked': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'booking', relatedEntityId: String(data.bookingId),
          });
        }
        break;
      }

      case 'support:ticket-opened':
      case 'support:ticket-resolved':
      case 'support:ticket-closed': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'ticket', relatedEntityId: String(data.ticketId),
          });
        }
        break;
      }

      case 'security:suspicious-login':
      case 'security:account-locked': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            digestable: false,
            priority: 'critical',
          });
        }
        break;
      }

      case 'system:maintenance':
      case 'system:birthday': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            digestable: false,
          });
        }
        break;
      }

      case 'match:invitation': {
        if (data.userId) {
          await dispatchToUser({
            userId: data.userId, eventName: eventName, categorySlug, data,
            relatedEntityType: 'booking', relatedEntityId: String(data.bookingId),
            senderId: data.senderId,
            actions: data.actions,
            digestable: false,
            actionPayload: { bookingId: data.bookingId },
          });
        }
        break;
      }

      case 'coupon:published': {
        if (data.organisationIds?.length) {
          for (const orgId of data.organisationIds) {
            await dispatchByOrg(orgId, {
              eventName, categorySlug, data,
              relatedEntityType: 'coupon', relatedEntityId: String(data.couponId),
            });
          }
        }
        break;
      }

      default:
        log.warn({ event: eventName }, 'Unhandled notification event');
    }
  }

  private getCategorySlug(event: string): string {
    if (event.startsWith('booking')) return 'bookings';
    if (event.startsWith('payment') || event.startsWith('wallet')) return 'payments';
    if (event.startsWith('marketplace')) return 'marketplace';
    if (event.startsWith('user') || event.startsWith('auth')) return 'system';
    if (event.startsWith('organisation') || event.startsWith('club') || event.startsWith('membership')) return 'system';
    if (event.startsWith('academy') || event.startsWith('coaching')) return 'system';
    if (event.startsWith('tournament') || event.startsWith('match')) return 'system';
    if (event.startsWith('community') || event.startsWith('friend') || event.startsWith('chat')) return 'system';
    if (event.startsWith('review') || event.startsWith('attendance')) return 'system';
    if (event.startsWith('support')) return 'system';
    if (event.startsWith('security')) return 'system';
    if (event.startsWith('system')) return 'system';
    return 'system';
  }
}

export const notificationEngine = new NotificationEngine();
