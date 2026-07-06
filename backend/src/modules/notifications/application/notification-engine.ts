import { eventBus, type DomainEventName } from '../../../shared/event-bus/index.js';
import { notificationService } from './notification.service.js';
import { getIO } from '../../../realtime/index.js';
import { getTemplate, formatTitle, formatBody, formatActionPayload } from './notification-rules.js';
import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

type RowData = RowDataPacket[];

class NotificationEngine {
  private pool: mysql.Pool;
  private subscribed = false;

  constructor() {
    this.pool = getPool();
  }

  start(): void {
    if (this.subscribed) return;
    this.subscribed = true;

    const events: DomainEventName[] = [
      'booking:created',
      'booking:confirmed',
      'booking:cancelled',
      'booking:expired',
      'payment:completed',
      'payment:failed',
      'payment:refunded',
      'marketplace:order-placed',
      'marketplace:order-status-changed',
      'marketplace:new-review',
      'user:registered',
      'user:approved',
      'system:announcement',
    ];

    for (const event of events) {
      eventBus.on(event, (data) => {
        this.handleEvent(event, data).catch((err) => {
          console.error(`[NotificationEngine] Error handling event ${event}:`, err);
        });
      });
    }
  }

  private async handleEvent(event: DomainEventName, data: any): Promise<void> {
    const template = getTemplate(event);
    if (!template) return;

    const recipients = template.resolveRecipients(data);

    if (event === 'user:registered') {
      const adminUserIds = await this.getAdminUserIds();
      for (const adminId of adminUserIds) {
        await this.createAndSend(adminId, template, data, null);
      }
      return;
    }

    if (event === 'system:announcement') {
      if (data.targetUserId) {
        await this.createAndSend(data.targetUserId, template, data, null);
      } else if (data.targetRole) {
        const userIds = await this.getUserIdsByRole(data.targetRole);
        for (const uid of userIds) {
          await this.createAndSend(uid, template, data, null);
        }
      }
      return;
    }

    for (const recipient of recipients) {
      await this.createAndSend(recipient.userId, template, data, {
        organisationId: recipient.organisationId,
        branchId: recipient.branchId,
      });
    }
  }

  private async createAndSend(
    userId: number,
    template: any,
    data: any,
    orgBranch: { organisationId?: number; branchId?: number } | null,
  ): Promise<void> {
    const shouldSend = await this.checkPreference(userId, template.categorySlug);
    if (!shouldSend) return;

    const relatedEntity = template.resolveRelatedEntity?.(data) || null;

    const notificationId = await notificationService.createNotification({
      userId,
      title: formatTitle(template, data),
      body: formatBody(template, data),
      categorySlug: template.categorySlug,
      actionKey: template.actionKey,
      actionPayload: formatActionPayload(template, data),
      type: template.type,
      priority: template.priority,
      organisationId: orgBranch?.organisationId,
      branchId: orgBranch?.branchId,
      senderId: data.userId || data.adminId || undefined,
      relatedEntityType: relatedEntity?.type,
      relatedEntityId: relatedEntity?.id,
    });

    this.emitRealtime(userId, notificationId);
  }

  private async emitRealtime(userId: number, notificationId: number): Promise<void> {
    try {
      const [rows] = await this.pool.execute<RowData>(
        `SELECT n.*, nc.slug as category_slug, na.action_key
         FROM notifications n
         LEFT JOIN notification_categories nc ON nc.id = n.category_id
         LEFT JOIN notification_actions na ON na.id = n.action_id
         WHERE n.id = ?`,
        [notificationId],
      );
      if (!rows.length) return;

      const notification = rows[0] as any;
      if (notification.action_payload) {
        try { notification.action_payload = JSON.parse(notification.action_payload); } catch { }
      }

      const io = getIO();
      io.to(`user:${userId}`).emit('notification:new', notification);
      io.to(`user:${userId}`).emit('notification:unread-count');
    } catch (err) {
      console.error('[NotificationEngine] emitRealtime error:', err);
    }
  }

  private async checkPreference(userId: number, categorySlug: string): Promise<boolean> {
    try {
      const [rows] = await this.pool.execute<RowData>(
        `SELECT un.is_allowed
         FROM notification_categories nc
         LEFT JOIN user_notification_preferences un ON un.category_id = nc.id AND un.user_id = ?
         WHERE nc.slug = ? AND nc.is_active = TRUE`,
        [userId, categorySlug],
      );
      if (!rows.length) return true;
      return (rows[0] as any).is_allowed !== 0;
    } catch {
      return true;
    }
  }

  private async getAdminUserIds(): Promise<number[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT DISTINCT ur.user_id FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE r.slug IN ('super_admin', 'admin')`
    );
    return (rows as any[]).map((r) => r.user_id);
  }

  private async getUserIdsByRole(roleSlug: string): Promise<number[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT DISTINCT ur.user_id FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE r.slug = ?`,
      [roleSlug]
    );
    return (rows as any[]).map((r) => r.user_id);
  }
}

export const notificationEngine = new NotificationEngine();
