import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { dispatchToUser, dispatchByRole, dispatchByOrg, dispatchByPermission } from './dispatcher.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import type { NotificationAction } from '@courtzon/shared';

const log = createModuleLogger('notification-engine');

type EventHandler = (eventName: string, data: any, categorySlug: string) => Promise<void>;

interface EventGroupConfig {
  events: string[];
  handler: EventHandler;
}

const a = (route: string, tab?: string): NotificationAction => ({ route, ...(tab ? { tab } : {}) });

const eventGroups: EventGroupConfig[] = [
  {
    events: ['user:registered'],
    handler: async (eventName, data, categorySlug) => {
      await dispatchByRole('super_admin', { eventName, categorySlug, data, action: a('/app') });
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
          action: a(`/bookings/${data.bookingId}`), digestable: false,
        });
      }
      if (eventName === 'booking:created' && data.bookingType === 'public_match') {
        eventBusV2.emit('match:available', { bookingId: data.bookingId, timestamp: new Date().toISOString() }, { aggregateType: 'match', aggregateId: String(0), aggregateVersion: 1 });
      }
      if (eventName === 'booking:cancelled' || eventName === 'booking:auto-cancelled') {
        eventBusV2.emit('match:removed', { bookingId: data.bookingId }, { aggregateType: 'match', aggregateId: String(0), aggregateVersion: 1 });
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
          action: a(`/bookings/${data.bookingId}`), digestable: false,
        });
      }
      if (data.bookingType === 'public_match') {
        eventBusV2.emit('match:available', { bookingId: data.bookingId, timestamp: new Date().toISOString() }, { aggregateType: 'match', aggregateId: String(0), aggregateVersion: 1 });
      }
      const { scheduleBookingReminder } = await import('./scheduler.service.js');
      const { getPool } = await import('../../../database/mysql.js');
      const pool = getPool();
      const [bkRows] = await pool.execute<any>(
        'SELECT user_id, start_at_utc FROM bookings WHERE id = ?', [data.bookingId],
      );
      if (bkRows.length) {
        const bk = bkRows[0];
        const startDate = new Date(bk.start_at_utc);
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
          action: a(`/bookings/${data.bookingId}`), digestable: false,
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
          action: a(`/bookings/${data.bookingId}`),
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
          action: a(`/bookings/${data.bookingId}`),
        });
      }
    },
  },
  {
    events: ['payment:completed', 'payment:failed', 'payment:refunded'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          organisationId: data.organisationId,
          relatedEntityType: 'payment', relatedEntityId: String(data.paymentId),
          action: a(`/bookings/${data.bookingId || data.paymentId}`), digestable: false,
        });
      }
    },
  },
  {
    events: ['payment:wallet-topup', 'payment:wallet-low-balance', 'wallet:deposit', 'wallet:withdrawal', 'wallet:low-balance', 'wallet:transaction'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({ userId: data.userId, eventName, categorySlug, data, action: a('/app') });
      }
    },
  },
  {
    events: ['wallet:withdrawal-submitted'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({ userId: data.userId, eventName, categorySlug, data, relatedEntityType: 'withdrawal', relatedEntityId: String(data.withdrawalId), action: a('/wallet') });
      }
      await dispatchByPermission('financial.reconcile', { eventName, categorySlug, data: { ...data, title: 'New Withdrawal Request', body: `A withdrawal request of ${data.amount} has been submitted.` }, relatedEntityType: 'withdrawal', relatedEntityId: String(data.withdrawalId), action: a('/admin/withdrawals') });
    },
  },
  {
    events: ['wallet:withdrawal-assigned'],
    handler: async (eventName, data, categorySlug) => {
      if (data.assignedTo) {
        await dispatchToUser({
          userId: data.assignedTo, eventName, categorySlug,
          data: { ...data, title: 'Withdrawal Assigned', body: 'A withdrawal request has been assigned to you.' },
          relatedEntityType: 'withdrawal', relatedEntityId: String(data.withdrawalId),
          action: a('/admin/withdrawals'),
        });
      }
    },
  },
  {
    events: ['wallet:withdrawal-under-review', 'wallet:withdrawal-approved', 'wallet:withdrawal-rejected', 'wallet:withdrawal-processing', 'wallet:withdrawal-completed', 'wallet:withdrawal-cancelled'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        const statusLabels: Record<string,string> = { 'under-review': 'Under Review', 'approved': 'Approved', 'rejected': 'Rejected', 'processing': 'Processing', 'completed': 'Completed', 'cancelled': 'Cancelled' };
        const status = eventName.split('-').slice(2).join('-');
        await dispatchToUser({ userId: data.userId, eventName, categorySlug, data: { ...data, title: `Withdrawal ${statusLabels[status] || status}`, body: `Your withdrawal request of ${data.amount} has been ${statusLabels[status]?.toLowerCase() || status}.` }, relatedEntityType: 'withdrawal', relatedEntityId: String(data.withdrawalId), action: a('/wallet') });
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
          action: a(`/marketplace/orders/${data.orderId}`),
        });
      }
      if (data.sellerId && data.sellerId !== data.userId) {
        await dispatchToUser({
          userId: data.sellerId, eventName, categorySlug, data,
          relatedEntityType: 'order', relatedEntityId: String(data.orderId),
          action: a(`/marketplace/orders/${data.orderId}`),
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
          action: a(`/marketplace/products/${data.productId || data.reviewId}`),
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
          action: a(`/marketplace/products/${data.productId}`),
        });
      }
    },
  },
  {
    events: ['marketplace:new-seller-registered'],
    handler: async (eventName, data, categorySlug) => {
      await dispatchByRole('super_admin', {
        eventName, categorySlug, action: a('/admin'),
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
          action: a('/app'),
        });
      }
    },
  },
  {
    events: ['auth:password-reset', 'auth:password-changed', 'auth:login', 'auth:logout', 'auth:2fa-setup'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({ userId: data.userId, eventName, categorySlug, data, action: a('/app'), digestable: false });
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
          action: a(`/organisations/${data.organisationId}`),
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
          action: a(`/organisations/${data.organisationId || data.clubId}`),
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
          action: a(`/academies/${data.academyId}`),
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
          action: a(`/coaches/sessions/${data.sessionId}`), digestable: false,
        });
      }
      if (data.coachId && data.coachId !== data.userId) {
        await dispatchToUser({
          userId: data.coachId, eventName, categorySlug, data,
          relatedEntityType: 'session', relatedEntityId: String(data.sessionId),
          action: a(`/coaches/sessions/${data.sessionId}`), digestable: false,
        });
      }
    },
  },
  {
    events: ['coach:invited'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'coach', relatedEntityId: String(data.coachId),
          organisationId: data.organisationId, action: a(`/coaches/${data.coachId}`),
        });
      }
    },
  },
  {
    events: ['coach:application-submitted'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'coach', relatedEntityId: String(data.coachId),
          action: a('/profile'),
        });
      }
      await dispatchByPermission('coaches.approve', {
        eventName, categorySlug,
        data: {
          ...data,
          title: 'New Coach Application',
          body: `${data.playerName || 'A player'} has submitted a new Coach Application and is awaiting review.`,
        },
        relatedEntityType: 'coach', relatedEntityId: String(data.coachId),
        action: a('/admin/coaches'),
      });
    },
  },
  {
    events: ['coach:agreement-added'],
    handler: async (eventName, data, categorySlug) => {
      if (data.organisationId) {
        await dispatchByOrg(data.organisationId, {
          eventName, categorySlug, action: a(`/coaches/${data.coachId}`),
          data: { ...data, title: `New agreement from ${data.coachName || 'a coach'}`, body: `${data.coachName || 'A coach'} has added an agreement with ${data.organisationName || 'your organisation'}.` },
          organisationId: data.organisationId,
          relatedEntityType: 'coach', relatedEntityId: String(data.coachId),
        });
      }
    },
  },
  {
    events: ['coach:application-approved', 'coach:application-rejected'],
    handler: async (eventName, data, categorySlug) => {
      const isApproved = eventName.includes('approved');
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'coach', relatedEntityId: String(data.coachId),
          action: a(isApproved ? '/coach/dashboard' : '/profile'),
        });
      }
    },
  },
  {
    events: ['coach:verified'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'coach', relatedEntityId: String(data.coachId),
          action: a('/coach/profile'),
        });
      }
    },
  },
  {
    events: ['coach:platform-suspended', 'coach:platform-deactivated', 'coach:platform-activated'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'coach', relatedEntityId: String(data.coachId),
          action: a('/coach/dashboard'),
        });
      }
      // Notify all organizations with active relationships to this coach
      if (data.coachId) {
        try {
          const { getPool } = await import('../../../database/mysql.js');
          const pool = getPool();
          const [orgRows] = await pool.execute(
            `SELECT DISTINCT o.id, o.name FROM coach_org_agreements coa
             JOIN organisations o ON o.id = coa.organisation_id
             WHERE coa.coach_id = ? AND coa.status = 'active'`,
            [data.coachId]
          ) as any;
          const statusLabels: Record<string, string> = {
            'coach:platform-suspended': 'suspended by CourtZon and is temporarily unavailable',
            'coach:platform-activated': 'reactivated and is available again',
            'coach:platform-deactivated': 'deactivated by CourtZon',
          };
          const label = statusLabels[eventName] || eventName.replace('coach:platform-', '');
          for (const org of orgRows) {
            await dispatchByOrg(org.id, {
              eventName, categorySlug, action: a(`/org/${org.id}/coaches`),
              data: {
                ...data, organisationName: org.name, organisationId: org.id,
                title: `Coach ${eventName.includes('suspended') ? 'Suspended' : eventName.includes('activated') ? 'Reactivated' : 'Deactivated'}`,
                body: `${data.coachName || 'A coach'} has been ${label}.`,
              },
              organisationId: org.id,
              relatedEntityType: 'coach', relatedEntityId: String(data.coachId),
            });
          }
        } catch {}
      }
    },
  },
  {
    events: ['coach:org-accepted', 'coach:org-rejected', 'coach:org-suspended', 'coach:org-resumed', 'coach:org-ended'],
    handler: async (eventName, data, categorySlug) => {
      if (data.coachUserId) {
        await dispatchToUser({
          userId: data.coachUserId, eventName, categorySlug, data,
          relatedEntityType: 'coach', relatedEntityId: String(data.coachId),
          organisationId: data.organisationId, action: a('/coach/profile?tab=orgs'),
        });
      }
      if (data.organisationId) {
        await dispatchByOrg(data.organisationId, {
          eventName, categorySlug, action: a(`/org/${data.organisationId}/coaches`),
          data: { ...data, title: data.organisationName || 'An organisation', body: `Coach agreement has been ${eventName.split(':').pop()}.` },
          organisationId: data.organisationId,
          relatedEntityType: 'coach', relatedEntityId: String(data.coachId),
        });
      }
    },
  },
  {
    events: ['coach:invite-accepted', 'coach:invite-rejected'],
    handler: async (eventName, data, categorySlug) => {
      if (data.organisationId) {
        await dispatchByOrg(data.organisationId, {
          eventName, categorySlug, action: a(`/org/${data.organisationId}/coaches`),
          data: { ...data, title: 'Invitation response', body: `Coach has ${eventName.includes('accepted') ? 'accepted' : 'declined'} your invitation.` },
          organisationId: data.organisationId,
          relatedEntityType: 'coach', relatedEntityId: String(data.coachId),
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
          action: a(`/tournaments/${data.tournamentId || data.matchId}`),
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
          action: a('/community/events'),
        });
      }
    },
  },
  {
    events: ['friend:request', 'friend:accepted', 'friend:blocked'],
    handler: async (eventName, data, categorySlug) => {
      if (data.toUserId) {
        await dispatchToUser({ userId: data.toUserId, eventName, categorySlug, data, senderId: data.fromUserId, action: a('/community/events') });
      }
      if (data.fromUserId && data.toUserId !== data.fromUserId) {
        await dispatchToUser({ userId: data.fromUserId, eventName, categorySlug, data, action: a('/community/events') });
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
          action: a(data.conversationId ? `/messages/${data.conversationId}` : '/messages'),
        });
      }
    },
  },
  {
    events: ['chat:group-created', 'chat:group-joined', 'chat:group-invitation'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          senderId: data.inviterId,
          relatedEntityType: 'chat',
          action: a(data.conversationId ? `/messages/${data.conversationId}` : '/messages'),
          relatedEntityId: String(data.conversationId || data.groupId),
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
          relatedEntityType: 'membership', action: a('/app'), digestable: false,
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
          action: a(`/marketplace/products/${data.productId || data.reviewId}`),
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
          action: a(`/bookings/${data.bookingId}`),
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
          action: a(`/support/tickets/${data.ticketId}`),
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
          action: a('/app'), digestable: false, priority: 'critical',
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
          action: a('/app'), digestable: false,
        });
      }
    },
  },
  {
    events: ['invitation:sent', 'invitation:declined', 'invitation:expired'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        const isSent = eventName === 'invitation:sent';
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'match', relatedEntityId: String(data.matchId),
          action: a(`/matches/${data.matchId}`), digestable: false, priority: isSent ? 'high' : 'normal',
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
          action: a(data.bookingId ? `/matches/${data.bookingId}/applicants` : '/matches', 'applicants'),
          digestable: false,
        });
      }
    },
  },
  {
    events: ['match:created'],
    handler: async (eventName, data, categorySlug) => {
      if (data.creatorId) {
        await dispatchToUser({
          userId: data.creatorId, eventName, categorySlug, data,
          relatedEntityType: 'match', relatedEntityId: String(data.matchId),
          action: a(`/matches/${data.matchId}`), digestable: false,
        });
      }
      eventBusV2.emit('match:available', { matchId: data.matchId, timestamp: new Date().toISOString() }, { aggregateType: 'match', aggregateId: String(0), aggregateVersion: 1 });
    },
  },
  {
    events: ['match:cancelled', 'match:status_changed'],
    handler: async (eventName, data, categorySlug) => {
      eventBusV2.emit(eventName === 'match:cancelled' ? 'match:removed' : 'match:updated', {
        matchId: data.matchId, timestamp: new Date().toISOString(),
      });
    },
  },
  {
    events: ['match:completed'],
    handler: async (eventName, data, categorySlug) => {
      eventBusV2.emit('match:updated', { matchId: data.matchId, timestamp: new Date().toISOString() }, { aggregateType: 'match', aggregateId: String(0), aggregateVersion: 1 });
    },
  },
  {
    events: ['join_request:submitted'],
    handler: async (eventName, data, categorySlug) => {
      eventBusV2.emit('match:pending', { matchId: data.matchId, userId: data.userId, timestamp: new Date().toISOString() }, { aggregateType: 'match', aggregateId: String(0), aggregateVersion: 1 });
      if (data.creatorId) {
        await dispatchToUser({
          userId: data.creatorId, eventName, categorySlug, data,
          relatedEntityType: 'match', relatedEntityId: String(data.matchId),
          action: a(`/matches/${data.matchId}`, 'applicants'), digestable: false,
        });
      }
    },
  },
  {
    events: ['join_request:approved'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'match', relatedEntityId: String(data.matchId),
          action: a(`/matches/${data.matchId}`), digestable: false,
        });
      }
      eventBusV2.emit('match:updated', { matchId: data.matchId, timestamp: new Date().toISOString() }, { aggregateType: 'match', aggregateId: String(0), aggregateVersion: 1 });
    },
  },
  {
    events: ['join_request:rejected', 'join_request:auto_rejected'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId) {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'match', relatedEntityId: String(data.matchId),
          action: a(`/matches/${data.matchId}`), digestable: false,
        });
      }
    },
  },
  {
    events: ['join_request:withdrawn'],
    handler: async (eventName, data, categorySlug) => {
      eventBusV2.emit('match:updated', { matchId: data.matchId, timestamp: new Date().toISOString() }, { aggregateType: 'match', aggregateId: String(0), aggregateVersion: 1 });
    },
  },
  {
    events: ['participant:added', 'participant:removed'],
    handler: async (eventName, data, categorySlug) => {
      eventBusV2.emit('match:updated', { matchId: data.matchId, timestamp: new Date().toISOString() }, { aggregateType: 'match', aggregateId: String(0), aggregateVersion: 1 });
    },
  },
  {
    events: ['waiting_list:promoted', 'waiting_list:entry_added', 'waiting_list:entry_removed'],
    handler: async (eventName, data, categorySlug) => {
      if (data.userId && eventName === 'waiting_list:promoted') {
        await dispatchToUser({
          userId: data.userId, eventName, categorySlug, data,
          relatedEntityType: 'match', relatedEntityId: String(data.matchId),
          action: a(`/matches/${data.matchId}`), digestable: false,
        });
      }
    },
  },
  {
    events: ['session:started', 'session:completed'],
    handler: async (eventName, data, categorySlug) => {
      eventBusV2.emit('match:updated', { matchId: data.matchId, timestamp: new Date().toISOString() }, { aggregateType: 'match', aggregateId: String(0), aggregateVersion: 1 });
    },
  },
  {
    events: ['coupon:published'],
    handler: async (eventName, data, categorySlug) => {
      if (data.organisationIds?.length) {
        for (const orgId of data.organisationIds) {
          await dispatchByOrg(orgId, {
            eventName, categorySlug, data, action: a('/marketplace'),
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
        action: data.payload.action, imageUrls: data.payload.imageUrls,
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
      'payment:completed', 'payment:failed', 'payment:refunded',
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
      'coach:invited', 'coach:agreement-added',
      'tournament:created', 'tournament:registration-open', 'tournament:registration-closed',
      'tournament:starting-soon', 'tournament:match-scheduled', 'tournament:result',
      'community:mention', 'community:reply', 'community:like',
      'friend:request', 'friend:accepted', 'friend:blocked',
      'chat:new-message', 'chat:group-created', 'chat:group-joined', 'chat:group-invitation',
      'membership:expiring', 'membership:expired', 'membership:renewed', 'membership:upgraded',
      'wallet:deposit', 'wallet:withdrawal', 'wallet:low-balance', 'wallet:transaction',
      'wallet:withdrawal-submitted', 'wallet:withdrawal-under-review',
      'wallet:withdrawal-approved', 'wallet:withdrawal-rejected',
      'wallet:withdrawal-processing', 'wallet:withdrawal-completed',
      'wallet:withdrawal-cancelled',
      'wallet:withdrawal-assigned',
      'review:received', 'attendance:marked',
      'support:ticket-opened', 'support:ticket-resolved', 'support:ticket-closed',
      'security:suspicious-login', 'security:account-locked',
      'system:announcement', 'system:maintenance', 'system:birthday', 'system:digest',
      'match:invitation',
      'invitation:sent', 'invitation:declined', 'invitation:expired',
      'match:created', 'match:cancelled', 'match:status_changed', 'match:completed',
      'join_request:submitted', 'join_request:approved', 'join_request:rejected',
      'join_request:withdrawn', 'join_request:auto_rejected',
      'participant:added', 'participant:removed',
      'waiting_list:promoted', 'waiting_list:entry_added', 'waiting_list:entry_removed',
      'session:started', 'session:completed',
      'coupon:published', 'booking:auto-cancelled', 'booking:application-declined',
      'notification:broadcast',
      'subscription:request-submitted', 'subscription:request-approved', 'subscription:request-rejected',
    ];

    const eventMap = buildEventMap(eventGroups);

    for (const event of subscribedEvents) {
      const handler = eventMap.get(event);
      if (!handler) {
        log.warn({ event }, 'No event configuration found — event will be processed as no-op');
        eventBusV2.on(event as any, () => {});
        continue;
      }
      eventBusV2.on(event as any, (data) => {
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
