import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

const svc = vi.hoisted(() => ({
  getUnreadCount: vi.fn(),
  getUserNotifications: vi.fn(),
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  archive: vi.fn(),
  archiveAll: vi.fn(),
  getFilters: vi.fn(),
}));

vi.mock('../application/notification.service.js', () => ({ notificationService: svc }));

import { notificationPlatform } from '../infrastructure/notification-platform.impl.js';

describe('NotificationPlatform REST contract (K3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serializes notification rows with snake_case keys the frontend consumes', async () => {
    svc.getUserNotifications.mockResolvedValue({
      data: [{
        id: 10,
        title: 'Match starting soon',
        body: 'Your match kicks off at 10:00',
        icon: 'clock',
        type: 'booking',
        priority: 'high',
        category_slug: 'matches',
        action_key: 'view-match',
        action_payload: { matchId: 8 },
        is_read: 0,
        created_at: '2026-09-15 08:00:00',
        read_at: null,
      }],
      total: 1,
    });

    const result = await notificationPlatform.list(42, { page: 1, limit: 20 });
    const item = result.data[0];

    expect(item).toMatchObject({
      category_slug: 'matches',
      action_key: 'view-match',
      action_payload: { matchId: 8 },
      is_read: false,
      created_at: '2026-09-15 08:00:00',
      read_at: null,
    });
    expect(item).not.toHaveProperty('categorySlug');
    expect(item).not.toHaveProperty('isRead');
    expect(item).not.toHaveProperty('createdAt');
  });

  it('G9-D5 — exposes `action` (deep link) when action_payload has a route', async () => {
    svc.getUserNotifications.mockResolvedValue({
      data: [{
        id: 11,
        title: 'Your match is scheduled',
        body: 'body',
        type: 'info',
        priority: 'normal',
        category_slug: 'tournament',
        action_key: 'view_tournament',
        action_payload: { route: '/tournaments/123', tab: 'bracket' },
        is_read: 0,
        created_at: '2026-09-15 08:00:00',
        read_at: null,
      }],
      total: 1,
    });

    const item = (await notificationPlatform.list(42, { page: 1, limit: 20 })).data[0];
    expect(item.action).toEqual({ route: '/tournaments/123', tab: 'bracket' });
  });

  it('G9-D5 — `action` is null when action_payload has no route', async () => {
    svc.getUserNotifications.mockResolvedValue({
      data: [{
        id: 12,
        title: 'Generic',
        body: null,
        type: 'info',
        priority: 'normal',
        category_slug: 'system',
        action_key: null,
        action_payload: { bookingId: 5 },
        is_read: 1,
        created_at: '2026-09-15 08:00:00',
        read_at: null,
      }],
      total: 1,
    });

    const item = (await notificationPlatform.list(42, { page: 1, limit: 20 })).data[0];
    expect(item.action).toBeNull();
  });
});