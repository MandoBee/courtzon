import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useNotificationStore } from '../store/notification.store';
import { resolveNotificationTarget } from '../utils/notificationRoutes';
import type { AppNotification } from '../components/notifications/NotificationDetailModal';

/**
 * G9-D5 — SHARED notification interaction (single source of truth).
 *
 * The NotificationBell dropdown, the NotificationsPage list and the detail
 * modal all route their clicks through this one handler so read-marking,
 * unread-count update, cache invalidation and navigation stay identical.
 *
 * Behaviour:
 *  1. persist read state via the store (server-authoritative),
 *  2. invalidate the notification React Query caches (bell + page + counts),
 *  3. resolve the deep link from the notification's action/payload,
 *  4. navigate; gracefully no-ops when there is no valid target.
 */
export function useNotificationInteraction() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const markAsRead = useNotificationStore((s) => s.markAsRead);

  const handleNotificationClick = useCallback(
    async (notification: AppNotification | null | undefined) => {
      if (!notification) return;

      if (!notification.is_read) {
        await markAsRead(notification.id);
      }

      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });

      const target = resolveNotificationTarget(notification);
      if (target) {
        navigate(target.route, {
          replace: target.replace ?? false,
          state: { tab: target.tab, params: target.params },
        });
      }
    },
    [navigate, queryClient, markAsRead],
  );

  return { handleNotificationClick };
}