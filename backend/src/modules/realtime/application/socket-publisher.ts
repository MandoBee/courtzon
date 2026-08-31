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
      'match:available', 'match:removed', 'match:updated', 'match:pending',
      'settlement:completed', 'settlement:failed', 'settlement:paid',
      'payment:gateway-settled',
      'organisation:subscription-renewed', 'organisation:subscription-expired',
      'organisation:subscription-expiring',
      'organisation:status-changed', 'organisation:subscription-status-changed',
      'organisation:created', 'organisation:approved', 'organisation:rejected',
      'subscription:request-submitted', 'subscription:request-approved', 'subscription:request-rejected', 'subscription:request-reopened',
      'academy:enrolled', 'academy:session-reminder', 'academy:graduated',
      'coaching:session-scheduled', 'coaching:session-cancelled',
      'referee:assigned', 'referee:unassigned',
      'coach:application-submitted', 'coach:application-approved', 'coach:application-rejected',
      'coach:verified', 'coach:platform-activated', 'coach:platform-suspended', 'coach:platform-deactivated',
      'coach:availability-changed',
      'coach:invited', 'coach:agreement-added',
      'coach:org-accepted', 'coach:org-rejected', 'coach:org-suspended', 'coach:org-resumed', 'coach:org-ended',
      'coach:invite-accepted', 'coach:invite-rejected',
      'attendance:marked',
      'membership:expiring', 'membership:expired', 'membership:renewed', 'membership:created',
      'system:announcement',
      'tournament:created', 'tournament:match-scheduled', 'tournament:result',
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

    for (const room of mapped.rooms) {
      this.io.to(room).emit(mapped.type, mapped.payload);
    }

    eventsPublishedTotal.inc({ event_type: mapped.type });
    log.debug({ type: mapped.type, rooms: mapped.rooms }, 'socket.published');
  }
}

export const socketPublisher = new SocketPublisher();
