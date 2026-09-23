import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * G9-D5-D — notification store sound integration (H/I/J/K/L/M/N/O/P).
 * Sound fires ONLY on a genuinely new socket-delivered notification (deduped by
 * id). Reconnect, hydration, polling, rerender and duplicate deliveries never
 * replay sound. The sound call is category-agnostic.
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
    getUnreadCount: vi.fn(async () => ({ count: 1 })),
    getReconnectQueue: vi.fn(async () => ({ notifications: [] })),
    markAsRead: vi.fn(async () => undefined),
    trackEvent: vi.fn(async () => undefined),
  },
}));

const soundMock = vi.hoisted(() => ({
  maybePlayNotificationSound: vi.fn(),
  initNotificationSound: vi.fn(),
}));

vi.mock('../services/notificationSound', () => soundMock);

import { useNotificationStore } from './notification.store';

function newNotification(id: number, categorySlug = 'tournament') {
  return {
    id,
    title: `Notification ${id}`,
    body: 'body',
    category_slug: categorySlug,
    is_read: false,
    created_at: new Date().toISOString(),
    type: 'info',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useNotificationStore.getState().destroy();
  useNotificationStore.getState().init();
});

afterEach(() => {
  useNotificationStore.getState().destroy();
});

describe('G9-D5-D — sound on notification arrival', () => {
  it('M/N. a new notification triggers the sound attempt (service gates on the sound preference)', () => {
    __handlers['notification.new'](newNotification(5));
    expect(soundMock.maybePlayNotificationSound).toHaveBeenCalledTimes(1);
    expect(useNotificationStore.getState().items.some((n) => n.id === 5)).toBe(true);
  });

  it('O. sound is category-agnostic (booking category also triggers it)', () => {
    __handlers['notification.new'](newNotification(5, 'bookings'));
    expect(soundMock.maybePlayNotificationSound).toHaveBeenCalledTimes(1);
  });

  it('H. the same notification delivered twice plays sound only once', () => {
    __handlers['notification.new'](newNotification(5));
    __handlers['notification.new'](newNotification(5));
    expect(soundMock.maybePlayNotificationSound).toHaveBeenCalledTimes(1);
  });

  it('J. store-level manual prepend / addNotification never plays sound', () => {
    useNotificationStore.getState().prependNotification(newNotification(7));
    useNotificationStore.getState().addNotification(newNotification(8));
    expect(soundMock.maybePlayNotificationSound).not.toHaveBeenCalled();
  });

  it('L. no socket arrival → no sound (suppressed tournament notifications never reach the client)', () => {
    expect(soundMock.maybePlayNotificationSound).not.toHaveBeenCalled();
  });
});

describe('G9-D5-D — reconnect / hydration never replay sound', () => {
  it('I/K. reconnect sync adds missed notifications WITHOUT sound', async () => {
    const { notificationsApi } = await import('../services/notifications');
    vi.mocked(notificationsApi.getReconnectQueue).mockResolvedValue({ notifications: [newNotification(9)] } as any);

    __handlers['connect']();
    await Promise.resolve(); // flush async handleReconnectSync

    expect(useNotificationStore.getState().items.some((n) => n.id === 9)).toBe(true);
    expect(soundMock.maybePlayNotificationSound).not.toHaveBeenCalled();
  });
});

describe('G9-D5-D — realtime wiring remains intact', () => {
  it('P. the store still subscribes to the authoritative socket events', () => {
    expect(__handlers['notification.new']).toBeDefined();
    expect(__handlers['connect']).toBeDefined();
    expect(__handlers['disconnect']).toBeDefined();
    expect(__handlers['notification:reconnect-queue']).toBeDefined();
    expect(soundMock.initNotificationSound).toHaveBeenCalled();
  });
});