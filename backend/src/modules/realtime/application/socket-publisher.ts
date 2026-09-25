import type { Server as SocketIOServer } from 'socket.io';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { mapDomainEvent } from './socket-event-mapper.js';
import { registry } from '../../../infrastructure/metrics/metrics.js';
import client from 'prom-client';

const log = createModuleLogger('socket-publisher');

const eventsPublishedTotal = new client.Counter({
  name: 'courtzon_socket_events_published_total',
  help: 'Total number of socket events published',
  labelNames: ['event_type'] as const,
  registers: [registry],
});

const eventsDroppedTotal = new client.Counter({
  name: 'courtzon_socket_events_dropped_total',
  help: 'Total number of domain events with no socket mapping',
  labelNames: ['event_name'] as const,
  registers: [registry],
});

/** Match/Result events routed through the single centralized SocketPublisher. */
export const MATCH_AND_RESULT_SOCKET_EVENTS = [
  'match:available', 'match:created', 'match:updated', 'match:status_changed',
  'match:cancelled', 'match:completed', 'match:removed', 'match:pending',
  'invitation:sent', 'invitation:declined', 'invitation:expired',
  'join_request:submitted', 'join_request:approved', 'join_request:rejected',
  'join_request:withdrawn', 'join_request:auto_rejected',
  'participant:added', 'participant:removed',
  'waiting_list:promoted', 'waiting_list:entry_added', 'waiting_list:entry_removed',
  'session:started', 'session:completed',
  'match:result-submitted', 'match:result-approved', 'match:result-auto-approved',
  'match:result-disputed', 'match:result-rejected', 'match:result-resolved',
  'match:result-corrected', 'match:result-no-result', 'match:result-withdrawn',
] as const;

export class SocketPublisher {
  private io: SocketIOServer | null = null;

  setIO(io: SocketIOServer): void {
    this.io = io;
  }

  start(): void {
    const subscribedEvents = [
      'booking:created', 'booking:confirmed', 'booking:cancelled', 'booking:expired',
      'booking:completed', 'booking:no-show', 'booking:check-in', 'booking:rescheduled',
      'booking:refunded', 'booking:paid', 'booking:fully-booked', 'booking:application-declined',
      'booking:rejected', 'booking:updated',
      'payment:completed', 'payment:failed', 'payment:refunded', 'payment:expired-event', 'payment:cancelled-event',
      'payment:wallet-topup', 'payment:wallet-low-balance', 'payment:succeeded',
      'wallet:deposit', 'wallet:withdrawal', 'wallet:low-balance', 'wallet:transaction',
      'wallet:withdrawal-submitted', 'wallet:withdrawal-under-review',
      'wallet:withdrawal-approved', 'wallet:withdrawal-rejected',
      'wallet:withdrawal-processing', 'wallet:withdrawal-completed',
      'wallet:withdrawal-cancelled',
      'wallet:withdrawal-assigned',
      'marketplace:order-placed', 'marketplace:order-confirmed', 'marketplace:order-shipped',
      'marketplace:order-delivered', 'marketplace:order-cancelled', 'marketplace:order-refunded',
      'marketplace:order-status-changed', 'marketplace:new-seller-registered',
      'marketplace:product-status-changed', 'marketplace:product-visibility-changed',
      'notification:broadcast',
      'notification:delivered', 'notification:unread-count',
      'notification:sync-read', 'notification:sync-deleted',
      ...MATCH_AND_RESULT_SOCKET_EVENTS,
      'chat:new-message', 'chat:group-invitation',
      'entitlement:activated',
      'settlement:created', 'settlement:completed', 'settlement:failed', 'settlement:paid',
      'payment:gateway-settled', 'payment:gateway-settlement-reversed',
      'organisation:subscription-renewed', 'organisation:subscription-expired',
      'organisation:subscription-expiring',
      'organisation:status-changed', 'organisation:subscription-status-changed',
      'organisation:created', 'organisation:approved', 'organisation:rejected',
      'subscription:request-submitted', 'subscription:request-approved', 'subscription:request-rejected', 'subscription:request-reopened',
      'academy:enrolled', 'academy:session-reminder', 'academy:session-started', 'academy:graduated',
      'academy:enrollment-accepted', 'academy:enrollment-waitlisted', 'academy:promoted', 'academy:payment-acknowledged', 'academy:enrollment-paid',
      'coaching:session-scheduled', 'coaching:session-cancelled',
      'referee:assigned', 'referee:unassigned',
      'coach:application-submitted', 'coach:application-approved', 'coach:application-rejected',
      'coach:verified', 'coach:platform-activated', 'coach:platform-suspended', 'coach:platform-deactivated',
      'coach:availability-changed',
      'coach:service-locations-changed',
      'coach:invited', 'coach:agreement-added',
      'coach:org-accepted', 'coach:org-rejected', 'coach:org-suspended', 'coach:org-resumed', 'coach:org-ended',
      'coach:invite-accepted', 'coach:invite-rejected',
      'attendance:marked',
      'membership:expiring', 'membership:expired', 'membership:renewed', 'membership:created',
      'system:announcement',
      'tournament:created', 'tournament:match-scheduled', 'tournament:result',
      'tournament:bracket-generated', 'tournament:match-created', 'tournament:match-progressed',
      'tournament:stage-completed', 'tournament:completed',
      'tournament:registration-open', 'tournament:registration-paid', 'tournament:registration-payment-methods-updated',
      'tournament:prizes-updated',
      'tournament:schedule-updated',
      'tournament:seed-updated', 'tournament:draw-generated', 'tournament:draw-updated',
      'tournament:participant-updated', 'tournament:waitlist-updated', 'tournament:participant-replaced',
      'tournament:waitlist-promoted',
      'tournament:withdrawal-resolved',
      'tournament:participant-created', 'tournament:participant-members-updated',
      'tournament:replacement-request-updated',
      'tournament:matches-generated', 'tournament:schedule-updated',
      'tournament:court-reserved', 'tournament:court-released',
      'setting:updated', 'setting:profile-applied',
      'accounting:entry-recorded',
      'user:suspended', 'user:activated', 'user:deleted', 'user.role.changed',
      'user:registered',
      'security:session-revoked',
    ];

    for (const eventName of subscribedEvents) {
      eventBusV2.on(eventName, (data: any) => {
        this.publish(eventName, data);
      });
    }

    log.info({ subscribedEvents: subscribedEvents.length }, 'socket.publisher_started');
  }

  private publish(eventName: string, payload: Record<string, unknown>): void {
    if (!this.io) {
      return;
    }

    const mapped = mapDomainEvent(eventName, payload);
    if (!mapped) {
      eventsDroppedTotal.inc({ event_name: eventName });
      return;
    }
    if (mapped.rooms.length === 0) {
      eventsDroppedTotal.inc({ event_name: eventName });
      return;
    }

    // Emit once to the union of rooms. Looping over rooms would deliver the
    // same event more than once whenever a user belongs to both a personal
    // room and an organisation/branch room.
    this.io.to(mapped.rooms).emit(mapped.type, mapped.payload);

    eventsPublishedTotal.inc({ event_type: mapped.type });
    log.debug({ type: mapped.type, rooms: mapped.rooms }, 'socket.published');
  }
}

export const socketPublisher = new SocketPublisher();
