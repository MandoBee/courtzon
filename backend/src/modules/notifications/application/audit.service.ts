import { getPool } from '../../../database/mysql.js';
import type { ResultSetHeader } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('audit');

export type LifecycleEvent =
  | 'created'
  | 'template_resolved'
  | 'channel_selected'
  | 'queued'
  | 'processing'
  | 'delivered'
  | 'delivery_failed'
  | 'opened'
  | 'clicked'
  | 'action_taken'
  | 'read'
  | 'archived'
  | 'deleted'
  | 'expired'
  | 'retried'
  | 'dead_letter'
  | 'provider_failover'
  | 'quiet_hours_deferred'
  | 'ab_variant_selected'
  | 'replayed';

export async function recordAuditEvent(
  notificationId: number,
  userId: number,
  lifecycleEvent: LifecycleEvent,
  options?: {
    channel?: string;
    providerSlug?: string;
    attempt?: number;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  },
): Promise<void> {
  try {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO notification_audit_trail
       (notification_id, user_id, lifecycle_event, channel, provider_slug, attempt, metadata, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        notificationId,
        userId,
        lifecycleEvent,
        options?.channel || null,
        options?.providerSlug || null,
        options?.attempt || 1,
        options?.metadata ? JSON.stringify(options.metadata) : null,
        options?.ipAddress || null,
        options?.userAgent || null,
      ],
    );
  } catch (err: any) {
    log.error({ err, notificationId, lifecycleEvent }, 'Failed to record audit event');
  }
}

export async function getAuditTrail(
  notificationId: number,
): Promise<any[]> {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM notification_audit_trail
     WHERE notification_id = ?
     ORDER BY created_at ASC`,
    [notificationId],
  );
  return rows as any[];
}

export async function getUserAuditTrail(
  userId: number,
  limit: number = 50,
  offset: number = 0,
): Promise<any[]> {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM notification_audit_trail
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset],
  );
  return rows as any[];
}
