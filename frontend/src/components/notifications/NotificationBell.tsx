import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../../services/notifications';
import { useAuthStore } from '../../store/auth.store';
import { useNotificationStore } from '../../store/notification.store';
import NotificationDetailModal, { type AppNotification } from './NotificationDetailModal';

export default function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const refreshUnreadCount = useNotificationStore((s) => s.refreshUnreadCount);
  const initStore = useNotificationStore((s) => s.init);
  const destroyStore = useNotificationStore((s) => s.destroy);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AppNotification | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthenticated) {
      initStore();
    } else {
      destroyStore();
    }
  }, [isAuthenticated, initStore, destroyStore]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data: recentData } = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => notificationsApi.getAll(1, 5),
    enabled: open,
    staleTime: 10000,
  });

  const markAllMutation = useMutation({
    mutationFn: notificationsApi.markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      refreshUnreadCount();
    },
  });

  const notifications = recentData?.data || [];

  const openNotification = useCallback((n: AppNotification) => {
    setOpen(false);
    setSelected(n);
  }, []);

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="relative p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          title="Notifications"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-[var(--color-error)] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-80 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <span className="text-sm font-semibold text-[var(--color-text)]">Notifications</span>
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllMutation.mutate()}
                    className="text-xs text-[var(--color-primary)] hover:underline"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => { setOpen(false); navigate('/notifications'); }}
                  className="text-xs text-[var(--color-text-muted)] hover:underline"
                >
                  View all
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No notifications</p>
              )}
              {notifications.map((n: AppNotification) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)] cursor-pointer transition-colors ${!n.is_read ? 'bg-[var(--color-info-bg)]/50 ' : ''}`}
                  onClick={() => openNotification(n)}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg shrink-0">{n.icon || '📬'}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)] truncate">{n.title}</p>
                      {n.body && <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 mt-0.5">{n.body}</p>}
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                        {new Date(n.created_at).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] shrink-0 mt-1.5" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <NotificationDetailModal
        notification={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
