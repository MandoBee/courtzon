import type { NotificationAction } from '@courtzon/shared';

export function getNotificationRoute(action: NotificationAction | null | undefined): string | null {
  if (!action?.route || !action.route.startsWith('/')) {
    return null;
  }
  return action.route;
}
