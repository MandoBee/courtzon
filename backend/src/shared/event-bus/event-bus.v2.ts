import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';
import { createModuleLogger } from '../utils/logger.js';
import { createEnvelope, type EventEnvelope, type EnvelopeContext } from './event-envelope.js';
import { publishedEventsRepository } from '../../infrastructure/event-store/published-events.repository.js';
import { onAfterCommit } from '../../database/database.transaction.js';
import { queueService } from '../../infrastructure/queue/queue.service.js';
import { registry } from '../../infrastructure/metrics/metrics.js';
import client from 'prom-client';
import type { SubscriberRegistration } from './event-bus.types.js';

const log = createModuleLogger('event-bus');

const emitTotal = new client.Counter({
  name: 'courtzon_eventbus_emit_total',
  help: 'Total number of EventBus emit() calls',
  labelNames: ['event_name'] as const,
  registers: [registry],
});

const enqueueTotal = new client.Counter({
  name: 'courtzon_eventbus_enqueue_total',
  help: 'Total number of events enqueued to subscriber queues',
  labelNames: ['queue'] as const,
  registers: [registry],
});

const enqueueFailedTotal = new client.Counter({
  name: 'courtzon_eventbus_enqueue_failed_total',
  help: 'Total number of enqueue failures',
  labelNames: ['queue'] as const,
  registers: [registry],
});

class EventBusV2 {
  private subscribers = new Map<string, SubscriberRegistration[]>();
  private inMemoryHandlers = new Map<string, Array<(data: any) => void>>();

  subscribe(registration: SubscriberRegistration): void {
    const { eventName, subscriberId } = registration;
    const existing = this.subscribers.get(eventName) || [];
    existing.push(registration);
    this.subscribers.set(eventName, existing);

    if (registration.options?.startingCursor === 'latest') {
      this.initCursorLatest(subscriberId, registration.queueName);
    } else {
      this.initCursorAt(subscriberId, registration.queueName, typeof registration.options?.startingCursor === 'number' ? registration.options.startingCursor : 0);
    }

    log.info({ subscriberId, eventName, queueName: registration.queueName }, 'subscriber.registered');
  }

  private async initCursorLatest(subscriberId: string, queueName: string): Promise<void> {
    try {
      const pool = getPool();
      const [rows] = await pool.execute('SELECT COALESCE(MAX(id), 0) as max_id FROM published_events');
      const maxId = (rows as any[])[0]?.max_id || 0;
      await pool.execute(
        'INSERT IGNORE INTO outbox_cursors (subscriber_id, last_event_id) VALUES (?, ?)',
        [queueName || subscriberId, maxId],
      );
    } catch (err) {
      log.warn({ subscriberId, err }, 'subscriber.cursor_init_failed');
    }
  }

  private async initCursorAt(subscriberId: string, queueName: string, eventId: number): Promise<void> {
    try {
      const pool = getPool();
      await pool.execute(
        'INSERT IGNORE INTO outbox_cursors (subscriber_id, last_event_id) VALUES (?, ?)',
        [queueName || subscriberId, eventId],
      );
    } catch (err) {
      log.warn({ subscriberId, err }, 'subscriber.cursor_init_failed');
    }
  }

  async emit(
    eventName: string,
    payload: Record<string, unknown>,
    context?: Partial<EnvelopeContext>,
    conn?: mysql.PoolConnection,
  ): Promise<void> {
    const envContext: EnvelopeContext = {
      aggregateType: context?.aggregateType || 'unknown',
      aggregateId: context?.aggregateId || '0',
      aggregateVersion: context?.aggregateVersion || 1,
      correlationId: context?.correlationId,
      causationId: context?.causationId,
      actorId: context?.actorId,
      metadata: context?.metadata,
      schemaVersion: context?.schemaVersion,
    };

    const envelope = createEnvelope(eventName, payload, envContext);

    try {
      await publishedEventsRepository.insert({
        eventId: envelope.eventId,
        eventName: envelope.eventName,
        aggregateType: envelope.aggregateType,
        aggregateId: envelope.aggregateId,
        aggregateVersion: envelope.aggregateVersion,
        correlationId: envelope.correlationId,
        causationId: envelope.causationId,
        payload: envelope.payload,
        metadata: envelope.metadata as Record<string, unknown>,
        occurredAt: new Date(envelope.occurredAt),
        schemaVersion: envelope.schemaVersion,
      }, conn);
    } catch (err: any) {
      if (err?.code !== 'ER_DUP_ENTRY') {
        log.error({ err, eventName, eventId: envelope.eventId }, 'event.publish_failed');
        throw err;
      }
    }

    emitTotal.inc({ event_name: eventName });

    onAfterCommit(async () => {
      const subs = this.subscribers.get(eventName) || [];
      for (const sub of subs) {
        try {
          await queueService.addToQueue(sub.queueName, envelope as unknown as Record<string, unknown>, {
            jobId: `${envelope.eventId}:${sub.queueName}`,
            attempts: sub.options?.attempts ?? 6,
            backoffDelay: sub.options?.backoffDelay ?? 2000,
          });
          enqueueTotal.inc({ queue: sub.queueName });
        } catch (err) {
          enqueueFailedTotal.inc({ queue: sub.queueName });
          log.error({ err, queue: sub.queueName, eventId: envelope.eventId }, 'event.enqueue_failed');
        }
      }

      try {
        const handlers = this.inMemoryHandlers.get(eventName) || [];
        for (const handler of handlers) {
          handler(envelope);
        }
      } catch (err) {
        log.error({ err, eventName }, 'event.in_memory_handler_failed');
      }
    });
  }

  on(eventName: string, handler: (data: any) => void): void {
    const existing = this.inMemoryHandlers.get(eventName) || [];
    existing.push(handler);
    this.inMemoryHandlers.set(eventName, existing);
  }

  getSubscribersFor(eventName: string): SubscriberRegistration[] {
    return this.subscribers.get(eventName) || [];
  }

  getAllSubscriberIds(): string[] {
    const ids = new Set<string>();
    for (const subs of this.subscribers.values()) {
      for (const sub of subs) {
        ids.add(sub.queueName || sub.subscriberId);
      }
    }
    return Array.from(ids);
  }
}

export const eventBusV2 = new EventBusV2();
