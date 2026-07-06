import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { eventBus } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { dispatchToUser } from './dispatcher.service.js';

const log = createModuleLogger('event-replay');

export interface ReplayOptions {
  eventName: string;
  from: Date;
  to: Date;
  limit?: number;
  replayedBy?: number;
  reason?: string;
}

export async function replayEvent(options: ReplayOptions): Promise<{ affected: number }> {
  const pool = getPool();
  const limit = options.limit || 1000;

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM notification_replay_log
     WHERE event_name = ? AND created_at >= ? AND created_at <= ?
     ORDER BY created_at ASC LIMIT ?`,
    [options.eventName, options.from, options.to, limit],
  );

  let affected = 0;

  for (const row of rows as any[]) {
    try {
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      if (payload.userId) {
        await dispatchToUser({
          userId: payload.userId,
          eventName: options.eventName,
          categorySlug: getCategorySlug(options.eventName),
          data: payload,
          digestable: false,
        });
        affected++;
      }
    } catch (err: any) {
      log.error({ err, replayId: row.id }, 'Failed to replay event');
    }
  }

  log.info({ eventName: options.eventName, affected }, 'Event replay complete');
  return { affected };
}

export async function storeReplayEvent(
  eventName: string,
  payload: any,
  options: { replayedBy?: number; reason?: string; affectedUsers?: number },
): Promise<number> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO notification_replay_log
     (event_name, payload, replayed_by, reason, affected_users)
     VALUES (?, ?, ?, ?, ?)`,
    [eventName, JSON.stringify(payload), options.replayedBy || null, options.reason || null, options.affectedUsers || 0],
  );
  return result.insertId;
}

export async function getReplayLogs(
  limit: number = 50,
  offset: number = 0,
): Promise<any[]> {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM notification_replay_log
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  return rows as any[];
}

function getCategorySlug(event: string): string {
  if (event.startsWith('booking')) return 'bookings';
  if (event.startsWith('payment') || event.startsWith('wallet')) return 'payments';
  if (event.startsWith('marketplace')) return 'marketplace';
  return 'system';
}
