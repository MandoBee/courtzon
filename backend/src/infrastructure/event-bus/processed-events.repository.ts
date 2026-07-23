import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { registry } from '../metrics/metrics.js';
import client from 'prom-client';

const log = createModuleLogger('event-bus');

type Executor = mysql.Pool | mysql.PoolConnection;

function resolveExecutor(conn?: mysql.PoolConnection): Executor {
  return conn ?? getPool();
}

export const DEFAULT_RETENTION_DAYS = 90;
export const DEFAULT_CLEANUP_BATCH_SIZE = 1000;

const processedEventsTotal = new client.Counter({
  name: 'courtzon_processed_events_total',
  help: 'Total number of events processed by subscribers (one per unique event_id + subscriber_id pair)',
  labelNames: ['subscriber_id'] as const,
  registers: [registry],
});

const duplicateEventsTotal = new client.Counter({
  name: 'courtzon_duplicate_events_total',
  help: 'Total number of duplicate event delivery attempts rejected by idempotency check',
  labelNames: ['subscriber_id'] as const,
  registers: [registry],
});

const cleanupDeletedRowsTotal = new client.Counter({
  name: 'courtzon_cleanup_deleted_rows_total',
  help: 'Total number of expired processed_events rows deleted by cleanup jobs',
  labelNames: [] as const,
  registers: [registry],
});

/**
 * Repository for the `processed_events` table.
 *
 * Provides idempotency tracking for EventBus subscribers. Every subscriber
 * records each successfully processed event here. Before processing a delivery
 * the subscriber calls {@link hasBeenProcessed} — if true the delivery is skipped.
 *
 * ## Idempotency guarantee
 * The UNIQUE KEY on `(event_id, subscriber_id)` is enforced by MySQL.
 * Two concurrent subscribers with the same ID cannot both insert.
 * A second insert hits `ER_DUP_ENTRY` and is counted (not thrown).
 *
 * ## Retention policy
 * Rows are retained for {@link DEFAULT_RETENTION_DAYS} (90 days).
 * Call {@link cleanup} periodically — it deletes expired rows in configurable
 * batches ({@link DEFAULT_CLEANUP_BATCH_SIZE} = 1 000) to avoid long locks.
 *
 * ## Transaction behaviour
 * Every method accepts an optional `conn?: PoolConnection`. When provided the
 * operation runs inside the caller's transaction. When omitted a fresh
 * connection is acquired from the pool.
 *
 * ## Thread safety
 * Thread-safe by design. No shared mutable state across calls.
 * Idempotency is enforced at the DB level via the UNIQUE KEY.
 */
class ProcessedEventsRepository {

  async hasBeenProcessed(
    eventId: string,
    subscriberId: string,
    conn?: mysql.PoolConnection,
  ): Promise<boolean> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT 1 FROM processed_events WHERE event_id = ? AND subscriber_id = ? LIMIT 1`,
      [eventId, subscriberId],
    );
    return (rows as any[]).length > 0;
  }

  async recordProcessing(
    eventId: string,
    subscriberId: string,
    conn?: mysql.PoolConnection,
  ): Promise<void> {
    const pool = resolveExecutor(conn);
    try {
      await pool.execute(
        `INSERT INTO processed_events (event_id, subscriber_id) VALUES (?, ?)`,
        [eventId, subscriberId],
      );
      processedEventsTotal.inc({ subscriber_id: subscriberId });
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        duplicateEventsTotal.inc({ subscriber_id: subscriberId });
        return;
      }
      log.error({ err, eventId, subscriberId }, 'Failed to record processed event');
      throw err;
    }
  }

  async getProcessedCount(
    subscriberId: string,
    sinceHours = 24,
    conn?: mysql.PoolConnection,
  ): Promise<number> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM processed_events
       WHERE subscriber_id = ? AND processed_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [subscriberId, sinceHours],
    );
    return (rows as any[])[0]?.cnt || 0;
  }

  async cleanup(
    olderThanDays = DEFAULT_RETENTION_DAYS,
    batchSize = DEFAULT_CLEANUP_BATCH_SIZE,
    conn?: mysql.PoolConnection,
  ): Promise<number> {
    const pool = resolveExecutor(conn);
    const safeBatch = Math.max(1, Math.floor(batchSize));
    let totalDeleted = 0;
    let deleted: number;

    do {
      const [result] = await pool.query(
        `DELETE FROM processed_events
         WHERE processed_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         LIMIT ${safeBatch}`,
        [olderThanDays],
      );
      deleted = (result as mysql.ResultSetHeader).affectedRows || 0;
      totalDeleted += deleted;
    } while (deleted >= safeBatch);

    if (totalDeleted > 0) {
      log.info({ totalDeleted, olderThanDays, batchSize }, 'Cleanup of processed_events completed');
      cleanupDeletedRowsTotal.inc(totalDeleted);
    }
    return totalDeleted;
  }
}

export const processedEventsRepository = new ProcessedEventsRepository();
