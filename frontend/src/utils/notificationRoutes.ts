import type { AppNotification } from '../components/notifications/NotificationDetailModal';

export function getNotificationRoute(notification: AppNotification): string | null {
  const route = notification.action_payload?.route as string | undefined;
  if (route && typeof route === 'string' && route.startsWith('/')) {
    return route;
  }
  if (import.meta.env.DEV) {
    console.warn('[Notification] Missing or invalid action.route for notification', {
      id: notification.id,
      title: notification.title,
      action_payload: notification.action_payload,
    });
  }
  return null;
}
