import type { NotificationAction } from '@courtzon/shared';

export interface NotificationTarget {
  route: string;
  tab?: string;
  params?: Record<string, string | number | boolean | null>;
  replace?: boolean;
}

export function getNotificationRoute(action: NotificationAction | null | undefined): string | null {
  if (!action?.route || !action.route.startsWith('/')) {
    return null;
  }
  return action.route;
}

/**
 * G9-D5 — single source of truth for resolving a notification's deep link.
 *
 * The backend sends the deep link in `action` (derived from
 * `action_payload.route`). This also falls back to `action_payload.route`
 * directly for resilience (older rows / partial payloads), and tolerates
 * malformed input without throwing.
 */
export function resolveNotificationTarget(
  notification: {
    action?: NotificationAction | null;
    action_payload?: Record<string, unknown> | null;
  } | null | undefined,
): NotificationTarget | null {
  if (!notification) return null;

  const action =
    notification.action && typeof notification.action.route === 'string'
      ? notification.action
      : null;

  const payload =
    notification.action_payload && typeof notification.action_payload === 'object'
      ? notification.action_payload
      : null;

  const candidate: NotificationAction | null =
    action && action.route.startsWith('/')
      ? action
      : payload && typeof (payload as { route?: unknown }).route === 'string'
        ? ((payload as unknown as NotificationAction))
        : null;

  if (!candidate || !candidate.route.startsWith('/')) return null;

  return {
    route: candidate.route,
    tab: candidate.tab,
    params: candidate.params,
    replace: candidate.replace,
  };
}
