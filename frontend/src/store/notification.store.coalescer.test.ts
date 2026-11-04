import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createUnreadCountCoalescer,
  UNREAD_REFRESH_DEBOUNCE_MS,
  UNREAD_REFRESH_MAX_WAIT_MS,
} from './unreadCountCoalescer';

/**
 * Store-level coverage for the coalesced unread-count refresh and the guards
 * that protect it from stale/out-of-order responses.
 *
 * These tests pin:
 *   1. a socket burst produces exactly one server refresh;
 *   2. a pending refresh is cancelled by destroy();
 *   3. only the newest of two overlapping requests may set the count;
 *   4. a response that resolves after destroy() is ignored;
 *   5. a handler invoked after destroy() cannot start a refresh.
 */

const h = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => void>,
  getUnreadCount: vi.fn(async () => ({ count: 0 })),
  getReconnectQueue: vi.fn(async () => ({ notifications: [] })),
  markAsRead: vi.fn(async () => undefined),
  trackEvent: vi.fn(async () => undefined),
}));

vi.mock('../services/socket', () => ({
  socketService: {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      h.handlers[event] = handler;
    }),
    off: vi.fn((event: string, handler: (...args: any[]) => void) => {
      if (h.handlers[event] === handler) delete h.handlers[event];
    }),
  },
}));

vi.mock('../services/notifications', () => ({
  notificationsApi: {
    getUnreadCount: h.getUnreadCount,
    getReconnectQueue: h.getReconnectQueue,
    markAsRead: h.markAsRead,
    markAllAsRead: vi.fn(async () => undefined),
    trackEvent: h.trackEvent,
  },
}));

vi.mock('../services/notificationSound', () => ({
  maybePlayNotificationSound: vi.fn(),
  initNotificationSound: vi.fn(),
}));

vi.mock('../services/appBadge', () => ({
  updateAppBadge: vi.fn(),
}));

import { useNotificationStore } from './notification.store';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('notification store — coalesced unread refresh', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    h.handlers = {};
    h.getUnreadCount.mockResolvedValue({ count: 0 });
    h.getReconnectQueue.mockResolvedValue({ notifications: [] });

    useNotificationStore.getState().destroy();
    useNotificationStore.getState().init();
    // Let init()'s direct refresh settle before each test's own assertions.
    await Promise.resolve();
  });

  afterEach(() => {
    useNotificationStore.getState().destroy();
    vi.useRealTimers();
  });

  it('coalesces a burst of unread-count events into one refresh', async () => {
    h.getUnreadCount.mockClear();
    h.getUnreadCount.mockResolvedValue({ count: 9 });

    for (let i = 0; i < 14; i += 1) {
      h.handlers['notification.unread-count']();
    }

    expect(h.getUnreadCount).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(750);

    expect(h.getUnreadCount).toHaveBeenCalledTimes(1);
    expect(useNotificationStore.getState().unreadCount).toBe(9);
  });

  it('cancels a pending refresh on destroy()', async () => {
    h.getUnreadCount.mockClear();
    h.handlers['notification.unread-count']();

    useNotificationStore.getState().destroy();
    await vi.advanceTimersByTimeAsync(2_500);

    expect(h.getUnreadCount).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('does not let an older overlapping response overwrite a newer one', async () => {
    const first = deferred<{ count: number }>();
    const second = deferred<{ count: number }>();

    h.getUnreadCount.mockReset();
    h.getUnreadCount
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const firstRequest = useNotificationStore.getState().refreshUnreadCount();
    const secondRequest = useNotificationStore.getState().refreshUnreadCount();

    second.resolve({ count: 9 });
    await secondRequest;
    expect(useNotificationStore.getState().unreadCount).toBe(9);

    first.resolve({ count: 3 });
    await firstRequest;

    // The older response is stale and must not overwrite the newer count.
    expect(useNotificationStore.getState().unreadCount).toBe(9);
  });

  it('ignores a response that resolves after destroy()', async () => {
    const pending = deferred<{ count: number }>();

    h.getUnreadCount.mockReset();
    h.getUnreadCount.mockImplementationOnce(() => pending.promise);

    const request = useNotificationStore.getState().refreshUnreadCount();
    useNotificationStore.getState().destroy();

    pending.resolve({ count: 7 });
    await request;

    expect(useNotificationStore.getState().initialized).toBe(false);
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('does not start a refresh when initialized is false', async () => {
    useNotificationStore.getState().destroy();
    h.getUnreadCount.mockClear();

    await useNotificationStore.getState().refreshUnreadCount();

    expect(h.getUnreadCount).not.toHaveBeenCalled();
  });

  it('does not refresh when an already-queued event fires after destroy()', async () => {
    const handler = h.handlers['notification.unread-count'];

    useNotificationStore.getState().destroy();
    h.getUnreadCount.mockClear();
    handler();

    await vi.advanceTimersByTimeAsync(750);

    expect(h.getUnreadCount).not.toHaveBeenCalled();
  });
});

describe('createUnreadCountCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('coalesces a burst of socket events into a single refresh', () => {
    const refresh = vi.fn();
    const coalescer = createUnreadCountCoalescer(refresh);

    for (let i = 0; i < 14; i += 1) {
      coalescer.schedule();
      vi.advanceTimersByTime(20); // events ~20 ms apart
    }

    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(UNREAD_REFRESH_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not lose the last event when the trailing window re-arms', () => {
    const refresh = vi.fn();
    const coalescer = createUnreadCountCoalescer(refresh);

    coalescer.schedule();
    vi.advanceTimersByTime(UNREAD_REFRESH_DEBOUNCE_MS - 50);
    expect(refresh).not.toHaveBeenCalled();

    coalescer.schedule(); // late event → re-arm
    vi.advanceTimersByTime(UNREAD_REFRESH_DEBOUNCE_MS - 50);
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes within the max wait while events keep arriving', () => {
    const refresh = vi.fn();
    const coalescer = createUnreadCountCoalescer(refresh);

    coalescer.schedule();
    // One event every 200 ms for 2.2 s — a pure debounce would never fire.
    for (let i = 0; i < 11; i += 1) {
      vi.advanceTimersByTime(200);
      coalescer.schedule();
    }
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(UNREAD_REFRESH_MAX_WAIT_MS - 2_200);
    expect(refresh).toHaveBeenCalledTimes(1);

    // A post-flush event opens a fresh window.
    coalescer.schedule();
    vi.advanceTimersByTime(UNREAD_REFRESH_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('supports an immediate flush and a cancel', () => {
    const refresh = vi.fn();
    const coalescer = createUnreadCountCoalescer(refresh);

    coalescer.schedule();
    coalescer.flush();
    expect(refresh).toHaveBeenCalledTimes(1);

    // Nothing pending → no extra call.
    coalescer.flush();
    expect(refresh).toHaveBeenCalledTimes(1);

    coalescer.schedule();
    coalescer.cancel();
    vi.advanceTimersByTime(UNREAD_REFRESH_MAX_WAIT_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
