/**
 * G9-D5 — App icon unread badge (Badging API).
 *
 * `navigator.setAppBadge(count)` / `navigator.clearAppBadge()` — supported on
 * Chromium-based browsers for installed PWAs / Android. Feature-detected;
 * every call is guarded so unsupported environments never throw or log.
 *
 * The server-authoritative unread count (notification.store) remains the single
 * source of truth — this module only mirrors it onto the app icon.
 */
export function updateAppBadge(count: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as unknown as {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) {
      if (typeof nav.setAppBadge === 'function') {
        void nav.setAppBadge(count);
      }
    } else if (typeof nav.clearAppBadge === 'function') {
      void nav.clearAppBadge();
    }
  } catch {
    // Badging API is not universally available — never let it break notifications.
  }
}