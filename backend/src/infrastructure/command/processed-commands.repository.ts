import type mysql from 'mysql2/promise';
import { getPool } from '../../database/mysql.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { registry } from '../metrics/metrics.js';
import client from 'prom-client';

const log = createModuleLogger('command');

type Executor = mysql.Pool | mysql.PoolConnection;

function resolveExecutor(conn?: mysql.PoolConnection): Executor {
  return conn ?? getPool();
}

export const DEFAULT_RETENTION_DAYS = 90;
export const DEFAULT_CLEANUP_BATCH_SIZE = 1000;

const commandsProcessedTotal = new client.Counter({
  name: 'courtzon_commands_processed_total',
  help: 'Total number of commands processed (one per unique command_id + subscriber_id pair)',
  labelNames: ['command_type', 'subscriber_id'] as const,
  registers: [registry],
});

const duplicateCommandsTotal = new client.Counter({
  name: 'courtzon_duplicate_commands_total',
  help: 'Total number of duplicate command delivery attempts rejected by idempotency check',
  labelNames: ['command_type', 'subscriber_id'] as const,
  registers: [registry],
});

const cleanupDeletedRowsTotal = new client.Counter({
  name: 'courtzon_command_cleanup_deleted_rows_total',
  help: 'Total number of expired processed_commands rows deleted by cleanup jobs',
  labelNames: [] as const,
  registers: [registry],
});

export interface ProcessedCommandCreate {
  commandId: string;
  commandType: string;
  subscriberId: string;
  correlationId?: string;
  causationId?: string;
  metadata?: Record<string, unknown>;
}

class ProcessedCommandsRepository {

  async hasBeenProcessed(
    commandId: string,
    subscriberId: string,
    conn?: mysql.PoolConnection,
  ): Promise<boolean> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT 1 FROM processed_commands WHERE command_id = ? AND subscriber_id = ? LIMIT 1`,
      [commandId, subscriberId],
    );
    return (rows as any[]).length > 0;
  }

  async recordProcessed(
    data: ProcessedCommandCreate,
    conn?: mysql.PoolConnection,
  ): Promise<void> {
    const pool = resolveExecutor(conn);
    try {
      await pool.execute(
        `INSERT INTO processed_commands (command_id, command_type, subscriber_id, correlation_id, causation_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          data.commandId,
          data.commandType,
          data.subscriberId,
          data.correlationId || null,
          data.causationId || null,
          data.metadata ? JSON.stringify(data.metadata) : null,
        ],
      );
      commandsProcessedTotal.inc({ command_type: data.commandType, subscriber_id: data.subscriberId });
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        duplicateCommandsTotal.inc({ command_type: data.commandType, subscriber_id: data.subscriberId });
        return;
      }
      log.error({ err, commandId: data.commandId, commandType: data.commandType }, 'Failed to record processed command');
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
      `SELECT COUNT(*) as cnt FROM processed_commands
       WHERE subscriber_id = ? AND processed_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [subscriberId, sinceHours],
    );
    return (rows as any[])[0]?.cnt || 0;
  }

  async getProcessedCountByType(
    commandType: string,
    sinceHours = 24,
    conn?: mysql.PoolConnection,
  ): Promise<number> {
    const pool = resolveExecutor(conn);
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM processed_commands
       WHERE command_type = ? AND processed_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [commandType, sinceHours],
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
        `DELETE FROM processed_commands
         WHERE processed_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         LIMIT ${safeBatch}`,
        [olderThanDays],
      );
      deleted = (result as mysql.ResultSetHeader).affectedRows || 0;
      totalDeleted += deleted;
    } while (deleted >= safeBatch);

    if (totalDeleted > 0) {
      log.info({ totalDeleted, olderThanDays, batchSize }, 'Cleanup of processed_commands completed');
      cleanupDeletedRowsTotal.inc(totalDeleted);
    }
    return totalDeleted;
  }
}

export const processedCommandsRepository = new ProcessedCommandsRepository();
