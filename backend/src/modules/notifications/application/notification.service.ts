import { notificationRepository } from '../infrastructure/repositories/notification.repository.js';

export class NotificationService {
  async createNotification(data: {
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
  }) {
    return notificationRepository.create(data);
  }

  async getUserNotifications(
    userId: number,
    page?: number,
    limit?: number,
    filters?: { actionKey?: string; type?: string; priority?: string; isRead?: boolean },
  ) {
    return notificationRepository.findByUser(userId, page, limit, filters);
  }

  async getUnreadCount(userId: number) {
    return notificationRepository.getUnreadCount(userId);
  }

  async markAsRead(id: number, userId: number) {
    return notificationRepository.markAsRead(id, userId);
  }

  async markAllAsRead(userId: number) {
    return notificationRepository.markAllAsRead(userId);
  }

  async archive(id: number, userId: number) {
    return notificationRepository.archive(id, userId);
  }

  async archiveAll(userId: number) {
    return notificationRepository.archiveAll(userId);
  }

  async softDelete(id: number, userId: number) {
    return notificationRepository.softDelete(id, userId);
  }

  async getFilters(userId: number) {
    return notificationRepository.getFilters(userId);
  }

  async getPreferences(userId: number) {
    const categories: any[] = await notificationRepository.getCategories();
    const userPrefs: any[] = await notificationRepository.getUserPreferences(userId);
    const prefMap = new Map(userPrefs.map((p) => [p.categoryId, p]));
    return categories.map((cat) => {
      const existing = prefMap.get(cat.id);
      return {
        categoryId: cat.id,
        slug: cat.slug,
        isAllowed: existing ? !!existing.isAllowed : true,
        pushEnabled: existing ? !!existing.pushEnabled : true,
        emailEnabled: existing ? !!existing.emailEnabled : false,
        smsEnabled: existing ? !!existing.smsEnabled : false,
      };
    });
  }

  async updatePreferences(userId: number, preferences: { categoryId: number; isAllowed: boolean; pushEnabled: boolean; emailEnabled: boolean; smsEnabled: boolean }[]) {
    await notificationRepository.upsertPreferences(userId, preferences);
  }
}

export const notificationService = new NotificationService();
