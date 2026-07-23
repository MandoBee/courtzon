import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { queueService } from '../../../infrastructure/queue/queue.service.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('admin-broadcast');

type RowData = RowDataPacket[];

export interface BroadcastPayload {
  title: string;
  body: string;
  type?: string;
  priority?: string;
  actionKey?: string;
  routePattern?: string;
  imageUrls?: Record<string, string>;
  actions?: any[];
}

export type BroadcastTarget =
  | { scope: 'all' }
  | { scope: 'role'; roleSlug: string }
  | { scope: 'organisation'; organisationId: number }
  | { scope: 'branch'; branchId: number }
  | { scope: 'users'; userIds: number[] };

export interface ScheduledBroadcast {
  id?: number;
  title: string;
  body: string;
  broadcastType: string;
  priority: string;
  target: BroadcastTarget;
  scheduledAt: Date | null;
  createdBy: number;
  isActive?: boolean;
}

export async function sendBroadcast(
  payload: BroadcastPayload,
  target: BroadcastTarget,
  createdBy: number,
  scheduledAt?: Date,
): Promise<number> {
  const pool = getPool();

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO notification_broadcasts
     (title, body, type, priority, action_key, route_pattern, image_urls, actions,
      target_scope, target_value, created_by, scheduled_at, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, NOW())`,
    [
      payload.title,
      payload.body,
      payload.type ?? 'info',
      payload.priority ?? 'normal',
      payload.actionKey ?? null,
      payload.routePattern ?? null,
      payload.imageUrls ? JSON.stringify(payload.imageUrls) : null,
      payload.actions ? JSON.stringify(payload.actions) : null,
      getScopeName(target),
      getScopeValue(target),
      createdBy,
      scheduledAt ?? null,
    ],
  );

  const broadcastId = result.insertId;

  if (scheduledAt) {
    await queueService.add('send_scheduled_notification', {
      templateId: broadcastId,
      userId: 0,
      scheduledAt,
      payload: { broadcastId, ...payload },
      locale: 'en',
    }, { delay: scheduledAt.getTime() - Date.now(), attempts: 3 });
    log.info({ broadcastId, scheduledAt }, 'Broadcast scheduled');
  } else if (process.env.LEGACY_BROADCAST_ENABLED === 'true') {
    const { dispatchToAll, dispatchByRole, dispatchByOrg, dispatchByBranch, dispatchByUserIdsBulk } = await import('./dispatcher.service.js');
    const options = {
      eventName: 'system:announcement' as const,
      categorySlug: 'system' as const,
      data: { title: payload.title, body: payload.body, broadcastId },
      type: payload.type,
      priority: payload.priority,
      actionKey: payload.actionKey,
      imageUrls: payload.imageUrls,
      actions: payload.actions,
      locale: 'en',
    };
    switch (target.scope) {
      case 'all': await dispatchToAll(options); break;
      case 'role': await dispatchByRole(target.roleSlug, options); break;
      case 'organisation': await dispatchByOrg(target.organisationId, options); break;
      case 'branch': await dispatchByBranch(target.branchId, options); break;
      case 'users': await dispatchByUserIdsBulk(target.userIds, options); break;
    }
  } else {
    eventBusV2.emit('notification:broadcast', { broadcastId, payload, target });
  }

  return broadcastId;
}

function getScopeName(target: BroadcastTarget): string {
  return target.scope;
}

function getScopeValue(target: BroadcastTarget): string | null {
  switch (target.scope) {
    case 'role': return target.roleSlug;
    case 'organisation': return String(target.organisationId);
    case 'branch': return String(target.branchId);
    case 'users': return target.userIds.join(',');
    default: return null;
  }
}

export async function getBroadcasts(
  activeOnly: boolean = false,
  limit: number = 50,
  offset: number = 0,
): Promise<any[]> {
  const pool = getPool();
  let sql = `SELECT * FROM notification_broadcasts`;
  const params: any[] = [];

  if (activeOnly) {
    sql += ' WHERE is_active = TRUE';
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await pool.execute<RowData>(sql, params);
  return rows;
}

export async function cancelBroadcast(broadcastId: number): Promise<void> {
  const pool = getPool();
  await pool.execute(
    'UPDATE notification_broadcasts SET is_active = FALSE WHERE id = ?',
    [broadcastId],
  );
}
