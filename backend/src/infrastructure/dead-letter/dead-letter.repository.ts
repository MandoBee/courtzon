import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { registry } from '../metrics/metrics.js';
import client from 'prom-client';

const log = createModuleLogger('dead-letter');

type Executor = mysql.Pool | mysql.PoolConnection;

function resolveExecutor(conn?: mysql.PoolConnection): Executor {
  return conn ?? getPool();
}

export const DEFAULT_CLEANUP_BATCH_SIZE = 500;
export const DEFAULT_RESOLVED_RETENTION_DAYS = 30;

export type ResolutionStatus = 'pending' | 'retrying' | 'resolved' | 'ignored';
export type MessageCategory = 'event' | 'command';

export interface DeadLetterCreate {
  messageId: string;
  messageType: string;
  messageCategory: MessageCategory;
  source: string;
  subscriberId?: string;
  workflowId?: number;
  correlationId?: string;
  causationId?: string;
  payload?: Record<string, unknown>;
  errorMessage: string;
  errorStack?: string;
}

export interface DeadLetterRecord {
  id: number;
  message_id: string;
  message_type: string;
  message_category: MessageCategory;
  source: string;
  subscriber_id: string | null;
  workflow_id: number | null;
  correlation_id: string | null;
  causation_id: string | null;
  payload: Record<string, unknown> | null;
  error_message: string;
  error_stack: string | null;
  retry_count: number;
  failed_at: Date;
  next_retry_at: Date | null;
  resolved_at: Date | null;
  resolution_status: ResolutionStatus;
}

const deadLetterInsertedTotal = new client.Counter({
  name: 'courtzon_dead_letter_inserted_total',
  help: 'Total number of messages sent to the dead letter queue',
  labelNames: ['message_category', 'resolution_status'] as const,
  registers: [registry],
});

const deadLetterResolvedTotal = new client.Counter({
  name: 'courtzon_dead_letter_resolved_total',
  help: 'Total number of dead letter messages resolved',
  labelNames: ['resolution_status'] as const,
  registers: [registry],
});

const cleanupDeletedRowsTotal = new client.Counter({
  name: 'courtzon_dead_letter_cleanup_deleted_rows_total',
  help: 'Total number of resolved dead letter entries deleted by cleanup jobs',
  labelNames: [] as const,
  registers: [registry],
});

class DeadLetterRepository {

  async insert(data: DeadLetterCreate, conn?: mysql.PoolConnection): Promise<number> {
    const pool = resolveExecutor(conn);
    const [result] = await pool.execute(
      `INSERT INTO dead_letter_entries
       (message_id, message_type, message_category, source, subscriber_id, workflow_id, correlation_id, causation_id, payload, error_message, error_stack, next_retry_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
      [
        data.messageId,
        data.messageType,
        data.messageCategory,
        data.source,
        data.subscriberId || null,
        data.workflowId || null,
        data.correlationId || null,
        data.causationId || null,
        data.payload ? JSON.stringify(data.payload) : null,
        data.errorMessage,
        data.errorStack || null,
      ],
    );
    deadLetterInsertedTotal.inc({ message_category: data.messageCategory, resolution_status: 'pending' });
    log.warn({ messageId: data.messageId, type: data.messageType, category: data.messageCategory },
      'Message sent to dead letter queue');
    return (result as mysql.ResultSetHeader).insertId;
  }

  async findPendingReplay(
    page = 1,
    limit = 50,
    conn?: mysql.PoolConnection,
  ): Promise<{ rows: DeadLetterRecord[]; total: number }> {
    const pool = resolveExecutor(conn);
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM dead_letter_entries WHERE resolution_status = 'pending'`,
    );
    const total = (countRows as any[])[0]?.cnt || 0;
    const offset = (page - 1) * limit;
    const [rows] = await pool.query(
      `SELECT * FROM dead_letter_entries WHERE resolution_status = 'pending' ORDER BY failed_at ASC LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    return { rows: rows as DeadLetterRecord[], total };
  }

  async findPendingRetry(conn?: mysql.PoolConnection): Promise<DeadLetterRecord[]> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT * FROM dead_letter_entries
       WHERE resolution_status = 'retrying' AND next_retry_at IS NOT NULL AND next_retry_at <= NOW()
       ORDER BY next_retry_at ASC`,
    );
    return rows as DeadLetterRecord[];
  }

  async markResolved(
    id: number,
    resolutionStatus: ResolutionStatus,
    conn?: mysql.PoolConnection,
  ): Promise<boolean> {
    const pool = resolveExecutor(conn);
    const [result] = await pool.execute(
      `UPDATE dead_letter_entries SET resolution_status = ?, resolved_at = NOW() WHERE id = ?`,
      [resolutionStatus, id],
    );
    const affected = (result as mysql.ResultSetHeader).affectedRows > 0;
    if (affected) {
      deadLetterResolvedTotal.inc({ resolution_status: resolutionStatus });
    }
    return affected;
  }

  async incrementRetry(id: number, conn?: mysql.PoolConnection): Promise<boolean> {
    const pool = resolveExecutor(conn);
    const [result] = await pool.execute(
      `UPDATE dead_letter_entries
       SET retry_count = retry_count + 1,
           next_retry_at = DATE_ADD(NOW(), INTERVAL POWER(2, retry_count) HOUR)
       WHERE id = ? AND resolution_status IN ('pending', 'retrying')`,
      [id],
    );
    return (result as mysql.ResultSetHeader).affectedRows > 0;
  }

  async getStatistics(
    sinceHours = 24,
    conn?: mysql.PoolConnection,
  ): Promise<{ status: ResolutionStatus; count: number }[]> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT resolution_status, COUNT(*) as cnt
       FROM dead_letter_entries
       WHERE failed_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
       GROUP BY resolution_status`,
      [sinceHours],
    );
    return (rows as any[]).map((r: any) => ({
      status: r.resolution_status as ResolutionStatus,
      count: r.cnt,
    }));
  }

  async cleanupResolved(
    olderThanDays = DEFAULT_RESOLVED_RETENTION_DAYS,
    batchSize = DEFAULT_CLEANUP_BATCH_SIZE,
    conn?: mysql.PoolConnection,
  ): Promise<number> {
    const pool = resolveExecutor(conn);
    const safeBatch = Math.max(1, Math.floor(batchSize));
    let totalDeleted = 0;
    let deleted: number;

    do {
      const [result] = await pool.query(
        `DELETE FROM dead_letter_entries
         WHERE resolution_status IN ('resolved', 'ignored')
         AND resolved_at IS NOT NULL
         AND resolved_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         LIMIT ${safeBatch}`,
        [olderThanDays],
      );
      deleted = (result as mysql.ResultSetHeader).affectedRows || 0;
      totalDeleted += deleted;
    } while (deleted >= safeBatch);

    if (totalDeleted > 0) {
      log.info({ totalDeleted, olderThanDays, batchSize }, 'Cleanup of resolved dead_letter entries completed');
      cleanupDeletedRowsTotal.inc(totalDeleted);
    }
    return totalDeleted;
  }
}

export const deadLetterRepository = new DeadLetterRepository();
