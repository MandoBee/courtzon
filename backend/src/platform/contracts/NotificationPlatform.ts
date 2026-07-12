import type { PlatformContract } from './base/PlatformContract.js';
import type { PaginatedResult, PaginationInput } from '../shared/types.js';

export interface NotificationItem {
  id: number;
  title: string;
  body: string | null;
  icon: string | null;
  type: string | null;
  priority: string | null;
  categorySlug: string | null;
  actionKey: string | null;
  actionPayload: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPreferences {
  categoryId: number;
  slug: string;
  isAllowed: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
}

export interface NotificationFilters {
  actionKey?: string;
  type?: string;
  priority?: string;
  isRead?: boolean;
}

export interface FiltersResult {
  types: string[];
  priorities: string[];
  counts: {
    all: number;
    unread: number;
    info: number;
    success: number;
    warning: number;
    error: number;
  };
}

export interface NotificationPlatform extends PlatformContract {
  getUnreadCount(userId: number): Promise<number>;

  list(
    userId: number,
    pagination?: PaginationInput,
    filters?: NotificationFilters,
  ): Promise<PaginatedResult<NotificationItem>>;

  getById(userId: number, notificationId: number): Promise<NotificationItem | null>;

  getPreferences(userId: number): Promise<NotificationPreferences[]>;

  updatePreferences(
    userId: number,
    preferences: Omit<NotificationPreferences, 'slug'>[],
  ): Promise<void>;

  markRead(userId: number, notificationId: number): Promise<void>;

  markAllRead(userId: number): Promise<void>;

  archive(userId: number, notificationId: number): Promise<void>;

  archiveAll(userId: number): Promise<void>;

  getFilters(userId: number): Promise<FiltersResult>;
}
