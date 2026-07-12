import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../../services/notifications';
import { useNotificationStore } from '../../store/notification.store';
import NotificationDetailModal, { type AppNotification } from '../../components/notifications/NotificationDetailModal';
import { Skeleton, SkeletonRow } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n';

type FilterTab = 'all' | 'unread' | 'info' | 'success' | 'warning' | 'error';

export default function NotificationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refreshUnreadCount = useNotificationStore((s) => s.refreshUnreadCount);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AppNotification | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const PAGE_SIZE = 20;

  const filters: any = {};
  if (filterTab === 'unread') filters.isRead = false;
  if (['info', 'success', 'warning', 'error'].includes(filterTab)) filters.type = filterTab;

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'list', page, filterTab],
    queryFn: () => notificationsApi.getAll(page, PAGE_SIZE, filters),
  });

  const markAllMutation = useMutation({
    mutationFn: notificationsApi.markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      refreshUnreadCount();
    },
  });

  const archiveAllMutation = useMutation({
    mutationFn: notificationsApi.archiveAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const notifications: AppNotification[] = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'info', label: 'Info' },
    { key: 'success', label: 'Success' },
    { key: 'warning', label: 'Warning' },
    { key: 'error', label: 'Error' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton width={220} height={28} />
          <Skeleton width={120} height={16} />
        </div>
        <SkeletonRow count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('settings.notifications')}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => archiveAllMutation.mutate()}
            className="text-sm text-[var(--color-text-muted)] hover:underline"
          >
            Archive all
          </button>
          <button
            onClick={() => markAllMutation.mutate()}
            className="text-sm text-[var(--color-primary)] hover:underline"
          >
            {t('notification.mark_all_read')}
          </button>
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setFilterTab(tab.key); setPage(1); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filterTab === tab.key
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {notifications.length === 0 ? (
        <p className="text-[var(--color-text-muted)]">{t('notification.empty')}</p>
      ) : (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 px-4 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)] cursor-pointer transition-colors ${!n.is_read ? 'bg-[var(--color-info-bg)]/50 ' : ''}`}
              onClick={() => setSelected(n)}
            >
              <span className="text-xl shrink-0 mt-0.5">{n.icon || '📬'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {(n.type) && (
                      <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${
                        n.type === 'success' ? 'bg-green-100 text-green-700' :
                        n.type === 'error' ? 'bg-red-100 text-red-700' :
                        n.type === 'warning' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {n.type}
                      </span>
                    )}
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">{n.title}</p>
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">
                    {new Date(n.created_at).toLocaleDateString('en-GB')}
                  </span>
                </div>
                {n.body && <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{n.body}</p>}
              </div>
              {!n.is_read && (
                <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] shrink-0 mt-2" />
              )}
              <button
                onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(n.id); }}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)] shrink-0 mt-1 opacity-0 group-hover:opacity-100"
                title="Delete"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-muted)]">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 text-xs border border-[var(--color-border)] rounded disabled:opacity-40"
            >
              {t('common.previous')}
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 text-xs border border-[var(--color-border)] rounded disabled:opacity-40"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
      )}

      <NotificationDetailModal
        notification={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
