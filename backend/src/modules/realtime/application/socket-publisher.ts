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
      'payment:completed', 'payment:failed', 'payment:refunded', 'payment:expired-event',
      'payment:wallet-topup', 'payment:wallet-low-balance',
      'wallet:deposit', 'wallet:withdrawal', 'wallet:low-balance', 'wallet:transaction',
      'marketplace:order-placed', 'marketplace:order-confirmed', 'marketplace:order-shipped',
      'marketplace:order-delivered', 'marketplace:order-cancelled', 'marketplace:order-refunded',
      'marketplace:order-status-changed',
      'notification:broadcast',
      'settlement:completed', 'settlement:failed',
      'organisation:subscription-renewed', 'organisation:subscription-expired',
      'organisation:subscription-expiring',
      'academy:enrolled', 'academy:session-reminder', 'academy:graduated',
      'coaching:session-scheduled', 'coaching:session-cancelled',
      'attendance:marked',
      'membership:expiring', 'membership:expired', 'membership:renewed',
      'system:announcement',
    ];

    for (const eventName of subscribedEvents) {
      eventBusV2.on(eventName, (data: any) => {
        this.publish(eventName, data.payload || data);
      });
    }

    log.info({ subscribedEvents: subscribedEvents.length }, 'socket.publisher_started');
  }

  private publish(eventName: string, payload: Record<string, unknown>): void {
    if (!this.io) return;

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
