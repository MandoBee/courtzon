import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

const DEFAULT_TIMEOUT_MS = 30_000;

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousemove',
  'keydown',
  'mousedown',
  'touchstart',
  'scroll',
  'click',
];

interface UseInactivityTimerOptions {
  /** Timeout in milliseconds. Default: 30_000 (30 seconds). */
  timeoutMs?: number;
  /** Only active when authenticated. Default: true. */
  enabled?: boolean;
}

/**
 * Logs the user out and redirects to /login after a period of inactivity.
 * Timer resets on any user interaction (mouse, keyboard, touch, scroll, click).
 *
 * Usage: call inside any component that renders within authenticated routes.
 *
 *   useInactivityTimer({ timeoutMs: 30_000 });
 *
 * Cleanup is automatic on unmount.
 */
export function useInactivityTimer(options: UseInactivityTimerOptions = {}): void {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, enabled = true } = options;
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTimeout = useCallback(() => {
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) return;
    useAuthStore.getState().logout();
    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (!enabled) return;

    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(handleTimeout, timeoutMs);
    };

    // Register listeners
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    // Start initial timer
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [timeoutMs, enabled, handleTimeout]);
}
