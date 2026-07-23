import { getPool } from '../../database/mysql.js';
import { createModuleLogger } from '../utils/logger.js';
import { queueService } from '../../infrastructure/queue/queue.service.js';
import { registry } from '../../infrastructure/metrics/metrics.js';
import client from 'prom-client';
import type { EventEnvelope } from './event-envelope.js';

const log = createModuleLogger('event-bus');

const outboxEventsTotal = new client.Counter({
  name: 'courtzon_outbox_events_processed_total',
  help: 'Total number of events processed by Outbox Poller',
  labelNames: [] as const,
  registers: [registry],
});

const outboxRecoveredTotal = new client.Counter({
  name: 'courtzon_outbox_recovered_total',
  help: 'Total number of events recovered by Outbox Poller',
  labelNames: ['event_name'] as const,
  registers: [registry],
});

export const OUTBOX_POLL_INTERVAL_MS = 5000;
export const OUTBOX_BATCH_SIZE = 100;

export class OutboxPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private subscriberIds: () => string[];
  private subscriberFilter: (subscriberId: string, eventName: string) => boolean;

  constructor(
    getSubscriberIds: () => string[],
    isSubscribed: (subscriberId: string, eventName: string) => boolean,
  ) {
    this.subscriberIds = getSubscriberIds;
    this.subscriberFilter = isSubscribed;
  }

  start(): void {
    if (this.timer) return;
    log.info({ interval: OUTBOX_POLL_INTERVAL_MS }, 'outbox.poller_started');
    setTimeout(() => this.poll(), 10000);
    this.timer = setInterval(() => this.poll(), OUTBOX_POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info('outbox.poller_stopped');
  }

  private async poll(): Promise<void> {
    const pool = getPool();
    const subscriberIds = this.subscriberIds();

    for (const subscriberId of subscriberIds) {
      try {
        const [cursorRows] = await pool.execute(
          `SELECT last_event_id FROM outbox_cursors WHERE subscriber_id = ?`,
          [subscriberId],
        );

        let cursor = 0;
        if ((cursorRows as any[]).length === 0) {
          await pool.execute(
            'INSERT IGNORE INTO outbox_cursors (subscriber_id, last_event_id) VALUES (?, 0)',
            [subscriberId],
          );
        } else {
          cursor = (cursorRows as any[])[0].last_event_id;
        }

        const [events] = await pool.execute(
          `SELECT * FROM published_events WHERE id > ? ORDER BY id ASC LIMIT ?`,
          [cursor, OUTBOX_BATCH_SIZE],
        );

        if (!(events as any[]).length) continue;

        let newCursor = cursor;

        for (const event of events as any[]) {
          const subscribed = this.subscriberFilter(subscriberId, event.event_name);

          if (subscribed) {
            try {
              const envelope: EventEnvelope = {
                eventId: event.event_id,
                eventName: event.event_name,
                schemaVersion: event.schema_version || 1,
                occurredAt: new Date(event.occurred_at).toISOString(),
                publishedAt: new Date(event.published_at).toISOString(),
                correlationId: event.correlation_id || '',
                causationId: event.causation_id || '',
                actorId: event.metadata?.actorId ?? null,
                aggregateType: event.aggregate_type,
                aggregateId: event.aggregate_id,
                aggregateVersion: event.aggregate_version,
                payload: event.payload || {},
                metadata: event.metadata || {},
              };

              await queueService.addToQueue(subscriberId, envelope as unknown as Record<string, unknown>, {
                jobId: `${event.event_id}:${subscriberId}`,
              });

              outboxRecoveredTotal.inc({ event_name: event.event_name });
              newCursor = event.id;
            } catch (err) {
              log.error({ err, subscriberId, eventId: event.event_id }, 'outbox.enqueue_failed');
              break;
            }
          } else {
            newCursor = event.id;
          }
        }

        if (newCursor > cursor) {
          await pool.execute(
            'UPDATE outbox_cursors SET last_event_id = ? WHERE subscriber_id = ? AND last_event_id < ?',
            [newCursor, subscriberId, newCursor],
          );
        }
      } catch (err) {
        log.error({ err, subscriberId }, 'outbox.subscriber_poll_failed');
      }
    }

    outboxEventsTotal.inc(1);
  }
}
