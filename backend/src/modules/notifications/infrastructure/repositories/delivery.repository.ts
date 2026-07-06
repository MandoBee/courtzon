import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

type RowData = RowDataPacket[];

export interface DeliveryRecord {
  id: number;
  notificationId: number;
  userId: number;
  channel: string;
  status: string;
  attempts: number;
  maxRetries: number;
  errorMessage: string | null;
  queuedAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  clickedAt: Date | null;
}

export interface AnalyticsRecord {
  id: number;
  notificationId: number;
  userId: number;
  eventName: string | null;
  categorySlug: string | null;
  channel: string | null;
  action: string;
  metadata: Record<string, any> | null;
  createdAt: Date;
}

export interface DigestWindowRecord {
  id: number;
  userId: number;
  categorySlug: string;
  eventName: string;
  count: number;
  windowOpensAt: Date;
  windowClosesAt: Date;
  isAggregated: boolean;
}

export interface DeadLetterRecord {
  id: number;
  notificationId: number | null;
  userId: number;
  channel: string;
  payload: Record<string, any>;
  errorMessage: string;
  failedAttempts: number;
  lastErrorAt: Date;
}

// ── Delivery ──

export async function createDelivery(
  notificationId: number,
  userId: number,
  channel: string,
  maxRetries: number = 3,
): Promise<number> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO notification_delivery
     (notification_id, user_id, channel, status, attempts, max_retries, queued_at)
     VALUES (?, ?, ?, 'queued', 0, ?, NOW())`,
    [notificationId, userId, channel, maxRetries],
  );
  return result.insertId;
}

export async function updateDeliveryStatus(
  deliveryId: number,
  status: string,
  errorMessage?: string | null,
): Promise<void> {
  const pool = getPool();
  const setClauses: string[] = [`status = '${status}'`];
  const params: any[] = [];

  if (status === 'sent') {
    setClauses.push('sent_at = NOW()');
    setClauses.push('attempts = attempts + 1');
    setClauses.push('processing_at = NULL');
  }
  if (status === 'processing') {
    setClauses.push('processing_at = NOW()');
  }
  if (status === 'delivered') {
    setClauses.push('delivered_at = NOW()');
  }
  if (status === 'read') {
    setClauses.push('read_at = NOW()');
  }
  if (status === 'clicked') {
    setClauses.push('clicked_at = NOW()');
  }
  if (errorMessage !== undefined) {
    setClauses.push('error_message = ?');
    params.push(errorMessage);
  }

  await pool.execute(
    `UPDATE notification_delivery SET ${setClauses.join(', ')} WHERE id = ?`,
    [...params, deliveryId],
  );
}

export async function getDelivery(id: number): Promise<DeliveryRecord | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    'SELECT * FROM notification_delivery WHERE id = ?', [id],
  );
  return rows.length ? mapDelivery(rows[0]) : null;
}

export async function getPendingDeliveries(
  limit: number = 100,
  status: string = 'queued',
): Promise<DeliveryRecord[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM notification_delivery
     WHERE status = ? AND attempts < max_retries
     ORDER BY queued_at ASC LIMIT ?`,
    [status, limit],
  );
  return rows.map(mapDelivery);
}

export async function getFailedDeliveries(
  limit: number = 100,
): Promise<DeliveryRecord[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM notification_delivery
     WHERE status IN ('failed', 'dead_letter') AND attempts >= max_retries
     ORDER BY queued_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map(mapDelivery);
}

// ── Analytics ──

export async function recordAnalytics(
  notificationId: number,
  userId: number,
  action: string,
  channel: string,
  meta?: Record<string, any>,
): Promise<void> {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO notification_analytics
     (notification_id, user_id, action, channel, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [notificationId, userId, action, channel, meta ? JSON.stringify(meta) : null],
  );
}

export async function getAnalytics(
  action?: string,
  from?: Date,
  to?: Date,
  limit: number = 100,
  offset: number = 0,
): Promise<AnalyticsRecord[]> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: any[] = [];

  if (action) { conditions.push('a.action = ?'); params.push(action); }
  if (from) { conditions.push('a.created_at >= ?'); params.push(from); }
  if (to) { conditions.push('a.created_at <= ?'); params.push(to); }

  let sql = 'SELECT * FROM notification_analytics a';
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await pool.execute<RowData>(sql, params);
  return rows.map(mapAnalytics);
}

export async function getAnalyticsSummary(from?: Date, to?: Date): Promise<Record<string, number>> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: any[] = [];

  if (from) { conditions.push('created_at >= ?'); params.push(from); }
  if (to) { conditions.push('created_at <= ?'); params.push(to); }

  let sql = 'SELECT action, COUNT(*) as cnt FROM notification_analytics';
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' GROUP BY action';

  const [rows] = await pool.execute<RowData>(sql, params);
  const summary: Record<string, number> = {};
  for (const row of rows) { summary[row.action] = row.cnt; }
  return summary;
}

// ── Digest Windows ──

export async function getDigestWindow(
  userId: number,
  categorySlug: string,
  eventName: string,
): Promise<DigestWindowRecord | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM notification_digest_windows
     WHERE user_id = ? AND category_slug = ? AND event_name = ? AND is_aggregated = 0
     LIMIT 1`,
    [userId, categorySlug, eventName],
  );
  return rows.length ? mapDigestWindow(rows[0]) : null;
}

export async function createDigestWindow(
  userId: number,
  categorySlug: string,
  eventName: string,
  windowClosesAt: Date,
): Promise<number> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO notification_digest_windows
     (user_id, category_slug, event_name, count, window_opens_at, window_closes_at, is_aggregated)
     VALUES (?, ?, ?, 1, NOW(), ?, 0)`,
    [userId, categorySlug, eventName, windowClosesAt],
  );
  return result.insertId;
}

export async function incrementDigestWindow(windowId: number): Promise<void> {
  const pool = getPool();
  await pool.execute(
    'UPDATE notification_digest_windows SET count = count + 1 WHERE id = ?',
    [windowId],
  );
}

export async function markDigestAggregated(windowId: number): Promise<void> {
  const pool = getPool();
  await pool.execute(
    'UPDATE notification_digest_windows SET is_aggregated = 1 WHERE id = ?',
    [windowId],
  );
}

export async function getDueDigestWindows(): Promise<DigestWindowRecord[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM notification_digest_windows
     WHERE is_aggregated = 0 AND window_closes_at <= NOW()
     ORDER BY window_closes_at ASC LIMIT 100`,
  );
  return rows.map(mapDigestWindow);
}

// ── Dead Letter Queue ──

export async function sendToDeadLetter(
  notificationId: number,
  userId: number,
  channel: string,
  errorMessage: string,
  failedAttempts: number,
  payload: Record<string, any>,
): Promise<number> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO notification_dead_letter_queue
     (notification_id, user_id, channel, payload, error_message, failed_attempts, last_error_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [notificationId, userId, channel, JSON.stringify(payload), errorMessage, failedAttempts],
  );
  return result.insertId;
}

export async function getDeadLetters(
  limit: number = 100,
): Promise<DeadLetterRecord[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM notification_dead_letter_queue
     ORDER BY last_error_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map(mapDeadLetter);
}

export async function removeDeadLetter(id: number): Promise<void> {
  const pool = getPool();
  await pool.execute(
    'DELETE FROM notification_dead_letter_queue WHERE id = ?',
    [id],
  );
}

export async function retryFromDeadLetter(id: number): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    'SELECT * FROM notification_dead_letter_queue WHERE id = ?', [id],
  );
  if (!rows.length) return;

  const dl = rows[0] as any;
  const newDeliveryId = await createDelivery(dl.notification_id || 0, dl.user_id, dl.channel, dl.failed_attempts + 1);
  await removeDeadLetter(id);
}

// ── Mappers ──

function mapDelivery(row: any): DeliveryRecord {
  return {
    id: row.id,
    notificationId: row.notification_id,
    userId: row.user_id,
    channel: row.channel,
    status: row.status,
    attempts: row.attempts,
    maxRetries: row.max_retries,
    errorMessage: row.error_message,
    queuedAt: row.queued_at,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
    clickedAt: row.clicked_at,
  };
}

function mapAnalytics(row: any): AnalyticsRecord {
  return {
    id: row.id,
    notificationId: row.notification_id,
    userId: row.user_id,
    eventName: row.event_name,
    categorySlug: row.category_slug,
    channel: row.channel,
    action: row.action,
    metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
    createdAt: row.created_at,
  };
}

function mapDigestWindow(row: any): DigestWindowRecord {
  return {
    id: row.id,
    userId: row.user_id,
    categorySlug: row.category_slug,
    eventName: row.event_name,
    count: row.count,
    windowOpensAt: row.window_opens_at,
    windowClosesAt: row.window_closes_at,
    isAggregated: row.is_aggregated,
  };
}

function mapDeadLetter(row: any): DeadLetterRecord {
  return {
    id: row.id,
    notificationId: row.notification_id,
    userId: row.user_id,
    channel: row.channel,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    errorMessage: row.error_message,
    failedAttempts: row.failed_attempts,
    lastErrorAt: row.last_error_at,
  };
}
