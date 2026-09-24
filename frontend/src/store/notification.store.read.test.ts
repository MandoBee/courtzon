import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * G9-D5 — read/unread store behaviour:
 *  - opening an unread notification marks it read (server persisted),
 *  - unread count decreases by exactly one per notification,
 *  - an already-read notification is never double-decremented,
 *  - refresh (poll/reconnect) re-syncs from the authoritative server count,
 *  - socket payloads arriving as `notificationId` are normalized (dedup works),
 *  - badge sync follows the store count.
 */

const __handlers: Record<string, (...args: any[]) => void> = {};

vi.mock('../services/socket', () => ({
  socketService: {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      __handlers[event] = handler;
    }),
  },
}));

vi.mock('../services/notifications', () => ({
  notificationsApi: {
    getUnreadCount: vi.fn(async () => ({ count: 0 })),
    getReconnectQueue: vi.fn(async () => ({ notifications: [] })),
    markAsRead: vi.fn(async () => undefined),
    markAllAsRead: vi.fn(async () => undefined),
    trackEvent: vi.fn(async () => undefined),
  },
}));

const soundMock = vi.hoisted(() => ({
  maybePlayNotificationSound: vi.fn(),
  initNotificationSound: vi.fn(),
}));
vi.mock('../services/notificationSound', () => soundMock);

const badgeMock = vi.hoisted(() => ({ updateAppBadge: vi.fn() }));
vi.mock('../services/appBadge', () => badgeMock);

import { useNotificationStore } from './notification.store';
import { notificationsApi } from '../services/notifications';

function notification(id: number, overrides: Record<string, any> = {}) {
  return {
    id,
    title: `Notification ${id}`,
    body: 'body',
    category_slug: 'tournament',
    is_read: false,
    created_at: new Date().toISOString(),
    type: 'info',
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ count: 0 } as any);
  vi.mocked(notificationsApi.markAsRead).mockResolvedValue(undefined as any);
  vi.mocked(notificationsApi.trackEvent).mockResolvedValue(undefined as any);
  badgeMock.updateAppBadge.mockClear();
  soundMock.maybePlayNotificationSound.mockClear();
  useNotificationStore.getState().destroy();
  useNotificationStore.getState().init();
  // Let init()'s async refreshUnreadCount settle so counts start deterministic.
  await new Promise((r) => setTimeout(r, 0));
});

afterEach(() => {
  useNotificationStore.getState().destroy();
});

describe('G9-D5 — read state / unread count', () => {
  it('A. opening an unread notification marks it read and decrements the count once', async () => {
    vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ count: 2 } as any);
    await useNotificationStore.getState().refreshUnreadCount();
    useNotificationStore.getState().prependNotification(notification(10));

    expect(useNotificationStore.getState().unreadCount).toBe(3);
    await useNotificationStore.getState().markAsRead(10);

    const item = useNotificationStore.getState().items.find((n) => n.id === 10);
    expect(item?.is_read).toBe(true);
    expect(useNotificationStore.getState().unreadCount).toBe(2);
    expect(notificationsApi.markAsRead).toHaveBeenCalledWith(10);
  });

  it('B/D. an already-read notification is never double-decremented', async () => {
    useNotificationStore.getState().prependNotification(notification(10));
    expect(useNotificationStore.getState().unreadCount).toBe(1);

    await useNotificationStore.getState().markAsRead(10);
    expect(useNotificationStore.getState().unreadCount).toBe(0);

    // Stale list could click the same row again — count must stay 0.
    await useNotificationStore.getState().markAsRead(10);
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('two notifications: reading one decreases the count by exactly one', async () => {
    useNotificationStore.getState().prependNotification(notification(1));
    useNotificationStore.getState().prependNotification(notification(2));
    expect(useNotificationStore.getState().unreadCount).toBe(2);

    await useNotificationStore.getState().markAsRead(1);
    expect(useNotificationStore.getState().unreadCount).toBe(1);
    expect(useNotificationStore.getState().items.find((n) => n.id === 1)?.is_read).toBe(true);
    expect(useNotificationStore.getState().items.find((n) => n.id === 2)?.is_read).toBe(false);
  });

  it('C. refresh preserves read state and re-syncs to the server count', async () => {
    useNotificationStore.getState().prependNotification(notification(10));
    await useNotificationStore.getState().markAsRead(10);
    expect(useNotificationStore.getState().unreadCount).toBe(0);

    vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ count: 0 } as any);
    await useNotificationStore.getState().refreshUnreadCount();
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('F. mark-all-read path re-syncs unread count through refreshUnreadCount', async () => {
    useNotificationStore.getState().prependNotification(notification(1));
    useNotificationStore.getState().prependNotification(notification(2));
    expect(useNotificationStore.getState().unreadCount).toBe(2);

    // Bell/Page call markAllAsRead API then refresh the store from the server.
    vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ count: 0 } as any);
    await notificationsApi.markAllAsRead();
    await useNotificationStore.getState().refreshUnreadCount();
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });
});

describe('G9-D5 — socket id normalization + dedup', () => {
  it('E. payload arriving as notificationId is normalized (no duplicate items / count)', () => {
    const payload = { notificationId: 7, title: 'T', body: 'B', type: 'info' };
    __handlers['notification.new'](payload);
    __handlers['notification.new'](payload);

    expect(useNotificationStore.getState().items.filter((n) => n.id === 7)).toHaveLength(1);
    expect(useNotificationStore.getState().unreadCount).toBe(1);
    expect(soundMock.maybePlayNotificationSound).toHaveBeenCalledTimes(1);
  });
});

describe('G9-D5 — app badge sync', () => {
  it('O/P. badge is set when unread > 0 and cleared when it reaches 0', async () => {
    useNotificationStore.getState().prependNotification(notification(10));
    expect(badgeMock.updateAppBadge).toHaveBeenLastCalledWith(1);

    await useNotificationStore.getState().markAsRead(10);
    expect(badgeMock.updateAppBadge).toHaveBeenLastCalledWith(0);
  });

  it('R. refresh re-syncs the badge with the server count', async () => {
    vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ count: 4 } as any);
    await useNotificationStore.getState().refreshUnreadCount();
    expect(badgeMock.updateAppBadge).toHaveBeenLastCalledWith(4);
  });
});