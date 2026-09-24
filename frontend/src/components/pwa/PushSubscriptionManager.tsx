import { useEffect } from 'react';
import { useAuthStore } from '../../store/auth.store';
import { initPushNotifications } from '../../services/push';

/**
 * G9-D5 — mounts the web-push subscription lifecycle once the user is
 * authenticated. Everything inside is feature-detected and silent when push is
 * unavailable or unconfigured (no VAPID key, non-secure context, no SW).
 */
export default function PushSubscriptionManager() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      initPushNotifications();
    }
  }, [isAuthenticated]);

  return null;
}