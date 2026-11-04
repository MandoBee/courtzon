import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createUnreadCountCoalescer,
  UNREAD_REFRESH_DEBOUNCE_MS,
  UNREAD_REFRESH_MAX_WAIT_MS,
} from './unreadCountCoalescer';

/**
 * Trailing-coalescing contract for `/notifications/unread-count` refreshes.
 *
 * The backend emits `notification.unread-count` once per dispatched
 * notification, so a matchmaking fan-out delivered ~14 events in ~500 ms and
 * produced 14 identical GETs (draining the shared 100/min per-IP budget).
 * These tests pin the behaviour that fixes it:
 *   1. a burst collapses into ONE refresh;
 *   2. the trailing window re-arms, so the last event is never lost;
 *   3. a continuous stream cannot postpone the refresh past the max wait.
 */

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
