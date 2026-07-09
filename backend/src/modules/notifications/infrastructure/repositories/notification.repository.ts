import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';

type RowData = RowDataPacket[];

function safeParseJSON(value: string): any {
  try { return JSON.parse(value); } catch { return value; }
}

export class NotificationRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async create(data: {
    userId: number;
    title: string;
    body?: string;
    icon?: string;
    categorySlug?: string;
    actionKey?: string;
    actionPayload?: Record<string, any>;
    type?: string;
    priority?: string;
    organisationId?: number;
    branchId?: number;
    senderId?: number;
    relatedEntityType?: string;
    relatedEntityId?: string;
    eventName?: string;
    actions?: any[];
    imageUrls?: Record<string, string>;
    templateId?: number;
    templateVersion?: number;
    renderedTitle?: string;
    renderedBody?: string;
    isPushed?: boolean;
  }): Promise<number> {
    let categoryId: number | null = null;
    if (data.categorySlug) {
      const [catRows] = await this.pool.execute<RowData>(
        'SELECT id FROM notification_categories WHERE slug = ?', [data.categorySlug]
      );
      categoryId = catRows.length ? (catRows[0] as any).id : null;
    }

    let actionId: number | null = null;
    if (data.actionKey) {
      const [actRows] = await this.pool.execute<RowData>(
        'SELECT id FROM notification_actions WHERE action_key = ?', [data.actionKey]
      );
      if (actRows.length) {
        actionId = (actRows[0] as any).id;
      } else {
        const [ins] = await this.pool.execute<ResultSetHeader>(
          'INSERT INTO notification_actions (action_key) VALUES (?)', [data.actionKey]
        );
        actionId = ins.insertId;
      }
    }

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO notifications
       (user_id, category_id, action_id, action_payload, title, body, icon, type, priority,
        organization_id, branch_id, sender_id, related_entity_type, related_entity_id,
        event_name, actions, image_urls, template_id, template_version,
        rendered_title, rendered_body, is_pushed, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, NOW())`,
      [
        data.userId, categoryId, actionId,
        data.actionPayload ? JSON.stringify(data.actionPayload) : null,
        data.title, data.body || null, data.icon || null,
        data.type || 'info', data.priority || 'normal',
        data.organisationId || null, data.branchId || null,
        data.senderId || null, data.relatedEntityType || null, data.relatedEntityId || null,
        data.eventName || null,
        data.actions ? JSON.stringify(data.actions) : null,
        data.imageUrls ? JSON.stringify(data.imageUrls) : null,
        data.templateId || null, data.templateVersion || null,
        data.renderedTitle || null, data.renderedBody || null,
        data.isPushed ?? false,
      ]
    );

    return result.insertId;
  }

  async findByUser(
    userId: number,
    page = 1,
    limit = 20,
    filters?: { actionKey?: string; type?: string; priority?: string; isRead?: boolean },
  ): Promise<{ data: any[]; total: number }> {
    const pag = buildPagination(page, limit);
    const conditions: string[] = ['n.user_id = ?'];
    const params: any[] = [userId];

    if (filters?.actionKey) {
      conditions.push('na.action_key = ?');
      params.push(filters.actionKey);
    }
    if (filters?.type) {
      conditions.push('n.type = ?');
      params.push(filters.type);
    }
    if (filters?.priority) {
      conditions.push('n.priority = ?');
      params.push(filters.priority);
    }
    if (filters?.isRead !== undefined) {
      conditions.push('n.is_read = ?');
      params.push(filters.isRead ? 1 : 0);
    }

    conditions.push('n.deleted_at IS NULL');

    const where = conditions.join(' AND ');

    const [countRows] = await this.pool.execute<RowData>(
      `SELECT COUNT(*) as total FROM notifications n
       LEFT JOIN notification_actions na ON na.id = n.action_id
       WHERE ${where}`, params
    );
    const total = (countRows[0] as any).total;

    const [rows] = await this.pool.execute<RowData>(
      `SELECT n.*, nc.slug as category_slug, na.action_key
       FROM notifications n
       LEFT JOIN notification_categories nc ON nc.id = n.category_id
       LEFT JOIN notification_actions na ON na.id = n.action_id
       WHERE ${where}
       ORDER BY n.created_at DESC${paginationClause(pag)}`,
      params,
    );

    const parsed = (rows as any[]).map((r) => ({
      ...r,
      action_payload: typeof r.action_payload === 'string' ? safeParseJSON(r.action_payload) : r.action_payload,
    }));
    return { data: parsed, total };
  }

  async getUnreadCount(userId: number): Promise<number> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = FALSE AND deleted_at IS NULL',
      [userId]
    );
    return (rows[0] as any).cnt;
  }

  async markAsRead(id: number, userId: number): Promise<void> {
    await this.pool.execute(
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = ? AND user_id = ?',
      [id, userId]
    );
  }

  async markAllAsRead(userId: number): Promise<void> {
    await this.pool.execute(
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = ? AND is_read = FALSE AND deleted_at IS NULL',
      [userId]
    );
  }

  async archive(id: number, userId: number): Promise<void> {
    await this.pool.execute(
      'UPDATE notifications SET archived_at = NOW() WHERE id = ? AND user_id = ?',
      [id, userId]
    );
  }

  async archiveAll(userId: number): Promise<void> {
    await this.pool.execute(
      'UPDATE notifications SET archived_at = NOW() WHERE user_id = ? AND archived_at IS NULL AND deleted_at IS NULL',
      [userId]
    );
  }

  async softDelete(id: number, userId: number): Promise<void> {
    await this.pool.execute(
      'UPDATE notifications SET deleted_at = NOW() WHERE id = ? AND user_id = ?',
      [id, userId]
    );
  }

  async getFilters(userId: number): Promise<{ types: string[]; priorities: string[] }> {
    const [typeRows] = await this.pool.execute<RowData>(
      `SELECT DISTINCT n.type FROM notifications n
       WHERE n.user_id = ? AND n.type IS NOT NULL AND n.type != '' AND n.deleted_at IS NULL
       ORDER BY n.type`, [userId]
    );
    const [priorityRows] = await this.pool.execute<RowData>(
      `SELECT DISTINCT n.priority FROM notifications n
       WHERE n.user_id = ? AND n.priority IS NOT NULL AND n.deleted_at IS NULL
       ORDER BY FIELD(n.priority, 'critical','high','normal','low')`, [userId]
    );
    return {
      types: (typeRows as any[]).map((r: any) => r.type),
      priorities: (priorityRows as any[]).map((r: any) => r.priority),
    };
  }

  async getCategories(): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT id, slug FROM notification_categories WHERE is_active = TRUE ORDER BY sort_order'
    );
    return rows as any[];
  }

  async getUserPreferences(userId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT nc.id as category_id, un.is_allowed as isAllowed, un.push_enabled as pushEnabled,
              un.email_enabled as emailEnabled, un.sms_enabled as smsEnabled
       FROM notification_categories nc
       LEFT JOIN user_notification_preferences un ON un.category_id = nc.id AND un.user_id = ?
       WHERE nc.is_active = TRUE
       ORDER BY nc.sort_order`,
      [userId]
    );
    return (rows as any[]).map((r) => ({
      categoryId: r.category_id,
      categorySlug: r.slug,
      isAllowed: r.isAllowed ?? 1,
      pushEnabled: r.pushEnabled ?? 1,
      emailEnabled: r.emailEnabled ?? 0,
      smsEnabled: r.smsEnabled ?? 0,
    }));
  }

  async upsertPreferences(userId: number, preferences: { categoryId: number; isAllowed: boolean; pushEnabled: boolean; emailEnabled: boolean; smsEnabled: boolean }[]) {
    for (const pref of preferences) {
      await this.pool.execute(
        `INSERT INTO user_notification_preferences (user_id, category_id, is_allowed, push_enabled, email_enabled, sms_enabled)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE is_allowed = VALUES(is_allowed), push_enabled = VALUES(push_enabled),
         email_enabled = VALUES(email_enabled), sms_enabled = VALUES(sms_enabled)`,
        [userId, pref.categoryId, pref.isAllowed, pref.pushEnabled, pref.emailEnabled, pref.smsEnabled]
      );
    }
  }
}

export const notificationRepository = new NotificationRepository();
