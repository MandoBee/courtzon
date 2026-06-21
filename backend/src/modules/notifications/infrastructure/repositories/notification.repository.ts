import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

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
      `INSERT INTO notifications (user_id, category_id, action_id, action_payload, title, body, icon, is_pushed)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [data.userId, categoryId, actionId, data.actionPayload ? JSON.stringify(data.actionPayload) : null, data.title, data.body || null, data.icon || null]
    );

    await this.pool.execute(
      `INSERT INTO notification_queue (user_id, notification_id, channel, status)
       VALUES (?, ?, 'in_app', 'sent')`,
      [data.userId, result.insertId]
    );

    return result.insertId;
  }

  async findByUser(userId: number, page = 1, limit = 20, actionKey?: string): Promise<{ data: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const countParams: any[] = [userId];
    const dataParams: any[] = [userId];

    let actionFilter = '';
    if (actionKey) {
      actionFilter = ' AND na.action_key = ?';
      countParams.push(actionKey);
      dataParams.push(actionKey);
    }

    const [countRows] = await this.pool.execute<RowData>(
      `SELECT COUNT(*) as total FROM notifications n
       LEFT JOIN notification_actions na ON na.id = n.action_id
       WHERE n.user_id = ?${actionFilter}`, countParams
    );
    const total = (countRows[0] as any).total;
    const [rows] = await this.pool.execute<RowData>(
      `SELECT n.*, nc.slug as category_slug, na.action_key
       FROM notifications n
       LEFT JOIN notification_categories nc ON nc.id = n.category_id
       LEFT JOIN notification_actions na ON na.id = n.action_id
       WHERE n.user_id = ?${actionFilter}
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [...dataParams, limit, offset]
    );
    const parsed = (rows as any[]).map((r) => ({
      ...r,
      action_payload: typeof r.action_payload === 'string' ? safeParseJSON(r.action_payload) : r.action_payload,
    }));
    return { data: parsed, total };
  }

  async getUnreadCount(userId: number): Promise<number> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = FALSE', [userId]
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
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );
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
