/**
 * Trailing coalescer for unread-count refreshes.
 *
 * The backend emits `notification.unread-count` for every dispatched
 * notification, and the matchmaking fan-out can deliver a burst of them within
 * a second. Refreshing per event fired ~14 identical `GET
 * /notifications/unread-count` calls per page load, which drained the shared
 * per-IP API budget and produced 429s.
 *
 * This keeps the same single endpoint call but collapses a burst into ONE
 * refresh, with a hard ceiling so a continuous stream cannot postpone it:
 *  - trailing window: `UNREAD_REFRESH_DEBOUNCE_MS` (750 ms of quiet), and
 *  - max wait: `UNREAD_REFRESH_MAX_WAIT_MS` (2 500 ms from the first pending
 *    event), whichever comes first.
 *
 * A trailing flush always runs, so the last event of a burst is never lost.
 */

export const UNREAD_REFRESH_DEBOUNCE_MS = 750;
export const UNREAD_REFRESH_MAX_WAIT_MS = 2_500;

export interface UnreadCountCoalescer {
  /** Queue one refresh; repeated calls inside the window collapse into one. */
  schedule(): void;
  /** Run a pending refresh immediately (no-op when nothing is pending). */
  flush(): void;
  /** Drop a pending refresh without running it (logout/unmount). */
  cancel(): void;
}

export function createUnreadCountCoalescer(
  refresh: () => void | Promise<void>,
  delayMs: number = UNREAD_REFRESH_DEBOUNCE_MS,
  maxWaitMs: number = UNREAD_REFRESH_MAX_WAIT_MS,
): UnreadCountCoalescer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingSince: number | null = null;
  let pending = false;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = (): void => {
    clearTimer();
    if (!pending) {
      pendingSince = null;
      return;
    }
    pending = false;
    pendingSince = null;
    void refresh();
  };

  /**
   * (Re)arm the window. The wait is clamped so a continuous stream can never
   * push the refresh past `maxWaitMs` from the first pending event; the clamp
   * only shortens the wait, it never extends it.
   */
  const arm = (): void => {
    clearTimer();
    const now = Date.now();
    if (pendingSince === null) pendingSince = now;
    const remainingMaxWait = Math.max(0, maxWaitMs - (now - pendingSince));
    timer = setTimeout(flush, Math.min(delayMs, remainingMaxWait));
  };

  return {
    schedule() {
      pending = true;
      arm();
    },
    flush,
    cancel() {
      clearTimer();
      pending = false;
      pendingSince = null;
    },
  };
}
