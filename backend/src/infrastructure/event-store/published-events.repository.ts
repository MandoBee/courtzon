import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { registry } from '../metrics/metrics.js';
import client from 'prom-client';

const log = createModuleLogger('event-store');

type Executor = mysql.Pool | mysql.PoolConnection;

function resolveExecutor(conn?: mysql.PoolConnection): Executor {
  return conn ?? getPool();
}

export const DEFAULT_RETENTION_DAYS = 90;
export const DEFAULT_CLEANUP_BATCH_SIZE = 1000;

export interface PublishedEventCreate {
  eventId: string;
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId?: string;
  causationId?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  occurredAt: Date | string;
  schemaVersion?: number;
}

export interface PublishedEventRecord {
  id: number;
  event_id: string;
  event_name: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  correlation_id: string | null;
  causation_id: string | null;
  payload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  occurred_at: Date;
  published_at: Date;
  schema_version: number;
}

const eventsPublishedTotal = new client.Counter({
  name: 'courtzon_events_published_total',
  help: 'Total number of domain events published to the event store',
  labelNames: ['event_name'] as const,
  registers: [registry],
});

const cleanupDeletedRowsTotal = new client.Counter({
  name: 'courtzon_events_cleanup_deleted_rows_total',
  help: 'Total number of expired published_events rows deleted by cleanup jobs',
  labelNames: [] as const,
  registers: [registry],
});

class PublishedEventsRepository {

  async insert(data: PublishedEventCreate, conn?: mysql.PoolConnection): Promise<void> {
    const pool = resolveExecutor(conn);
    try {
      await pool.execute(
        `INSERT INTO published_events
         (event_id, event_name, aggregate_type, aggregate_id, aggregate_version, correlation_id, causation_id, payload, metadata, occurred_at, schema_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.eventId,
          data.eventName,
          data.aggregateType,
          data.aggregateId,
          data.aggregateVersion,
          data.correlationId || null,
          data.causationId || null,
          data.payload ? JSON.stringify(data.payload) : null,
          data.metadata ? JSON.stringify(data.metadata) : null,
          new Date(data.occurredAt),
          data.schemaVersion ?? 1,
        ],
      );
      eventsPublishedTotal.inc({ event_name: data.eventName });
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        return;
      }
      log.error({ err, eventId: data.eventId, eventName: data.eventName }, 'Failed to insert published event');
      throw err;
    }
  }

  async findByEventId(eventId: string, conn?: mysql.PoolConnection): Promise<PublishedEventRecord | null> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT * FROM published_events WHERE event_id = ?`,
      [eventId],
    );
    return (rows as any[])[0] || null;
  }

  async findByAggregate(
    aggregateType: string,
    aggregateId: string,
    conn?: mysql.PoolConnection,
  ): Promise<PublishedEventRecord[]> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT * FROM published_events
       WHERE aggregate_type = ? AND aggregate_id = ?
       ORDER BY aggregate_version ASC`,
      [aggregateType, aggregateId],
    );
    return rows as PublishedEventRecord[];
  }

  async findByCorrelationId(
    correlationId: string,
    page = 1,
    limit = 50,
    conn?: mysql.PoolConnection,
  ): Promise<{ rows: PublishedEventRecord[]; total: number }> {
    const pool = resolveExecutor(conn);
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM published_events WHERE correlation_id = ?`,
      [correlationId],
    );
    const total = (countRows as any[])[0]?.cnt || 0;
    const offset = (page - 1) * limit;
    const [rows] = await pool.query(
      `SELECT * FROM published_events WHERE correlation_id = ? ORDER BY occurred_at ASC LIMIT ? OFFSET ?`,
      [correlationId, limit, offset],
    );
    return { rows: rows as PublishedEventRecord[], total };
  }

  async findByEventName(
    eventName: string,
    sinceHours = 24,
    page = 1,
    limit = 50,
    conn?: mysql.PoolConnection,
  ): Promise<{ rows: PublishedEventRecord[]; total: number }> {
    const pool = resolveExecutor(conn);
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM published_events
       WHERE event_name = ? AND occurred_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [eventName, sinceHours],
    );
    const total = (countRows as any[])[0]?.cnt || 0;
    const offset = (page - 1) * limit;
    const [rows] = await pool.query(
      `SELECT * FROM published_events
       WHERE event_name = ? AND occurred_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
       ORDER BY occurred_at ASC LIMIT ? OFFSET ?`,
      [eventName, sinceHours, limit, offset],
    );
    return { rows: rows as PublishedEventRecord[], total };
  }

  async getStatistics(
    sinceHours = 24,
    conn?: mysql.PoolConnection,
  ): Promise<{ event_name: string; count: number }[]> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT event_name, COUNT(*) as cnt
       FROM published_events
       WHERE occurred_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
       GROUP BY event_name
       ORDER BY cnt DESC`,
      [sinceHours],
    );
    return (rows as any[]).map((r: any) => ({
      event_name: r.event_name,
      count: r.cnt,
    }));
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
        `DELETE FROM published_events
         WHERE occurred_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         LIMIT ${safeBatch}`,
        [olderThanDays],
      );
      deleted = (result as mysql.ResultSetHeader).affectedRows || 0;
      totalDeleted += deleted;
    } while (deleted >= safeBatch);

    if (totalDeleted > 0) {
      log.info({ totalDeleted, olderThanDays, batchSize }, 'Cleanup of published_events completed');
      cleanupDeletedRowsTotal.inc(totalDeleted);
    }
    return totalDeleted;
  }
}

export const publishedEventsRepository = new PublishedEventsRepository();
