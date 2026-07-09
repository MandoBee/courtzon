import type { PaginationInput, PaginatedResult } from '../shared/types.js';
import type {
  NotificationPlatform,
  NotificationItem,
  NotificationFilters,
  NotificationPreferences,
  FiltersResult,
} from '../contracts/NotificationPlatform.js';
import { notificationService } from '../../modules/notifications/application/notification.service.js';

function toNotificationItem(row: any): NotificationItem {
  return {
    id: row.id,
    title: row.title,
    body: row.body ?? null,
    icon: row.icon ?? null,
    type: row.type ?? null,
    priority: row.priority ?? null,
    categorySlug: row.category_slug ?? null,
    actionKey: row.action_key ?? null,
    actionPayload: row.action_payload ?? null,
    isRead: !!(row.is_read ?? row.isRead),
    createdAt: row.created_at ?? row.createdAt,
    readAt: row.read_at ?? row.readAt ?? null,
  };
}

export const notificationPlatform: NotificationPlatform = {
  contractName: 'NotificationPlatform',
  version: '1.0.0',

  async getUnreadCount(userId: number): Promise<number> {
    return notificationService.getUnreadCount(userId);
  },

  async list(
    userId: number,
    pagination?: PaginationInput,
    filters?: NotificationFilters,
  ): Promise<PaginatedResult<NotificationItem>> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const result = await notificationService.getUserNotifications(userId, page, limit, filters);
    return {
      data: (result.data ?? []).map(toNotificationItem),
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit) || 1,
    };
  },

  async getById(userId: number, notificationId: number): Promise<NotificationItem | null> {
    const result = await notificationService.getUserNotifications(userId, 1, 1_000_000);
    const row = (result.data ?? []).find((n: any) => n.id === notificationId);
    return row ? toNotificationItem(row) : null;
  },

  async getPreferences(userId: number): Promise<NotificationPreferences[]> {
    const prefs = await notificationService.getPreferences(userId);
    return prefs.map((p: any) => ({
      categoryId: p.categoryId,
      slug: p.slug ?? p.categorySlug,
      isAllowed: !!p.isAllowed,
      pushEnabled: !!p.pushEnabled,
      emailEnabled: !!p.emailEnabled,
      smsEnabled: !!p.smsEnabled,
    }));
  },

  async updatePreferences(
    userId: number,
    preferences: Omit<NotificationPreferences, 'slug'>[],
  ): Promise<void> {
    await notificationService.updatePreferences(userId, preferences as any);
  },

  async markRead(userId: number, notificationId: number): Promise<void> {
    await notificationService.markAsRead(notificationId, userId);
  },

  async markAllRead(userId: number): Promise<void> {
    await notificationService.markAllAsRead(userId);
  },

  async archive(userId: number, notificationId: number): Promise<void> {
    await notificationService.archive(notificationId, userId);
  },

  async archiveAll(userId: number): Promise<void> {
    await notificationService.archiveAll(userId);
  },

  async getFilters(userId: number): Promise<FiltersResult> {
    return notificationService.getFilters(userId);
  },
};
