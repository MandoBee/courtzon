import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { notificationsApi } from '../../services/notifications';
import { useNotificationStore } from '../../store/notification.store';
import { useSocketEvent } from '../../realtime/useSocket';
import NotificationDetailModal, { type AppNotification } from '../../components/notifications/NotificationDetailModal';
import { Skeleton, SkeletonRow } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n';

type FilterTab = 'all' | 'unread' | 'info' | 'success' | 'warning' | 'error';
const PAGE_SIZE = 20;

function groupByDay(notifications: AppNotification[]): Map<string, AppNotification[]> {
  const groups = new Map<string, AppNotification[]>();
  for (const n of notifications) {
    const day = new Date(n.created_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(n);
  }
  return groups;
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refreshUnreadCount = useNotificationStore((s) => s.refreshUnreadCount);
  const [selected, setSelected] = useState<AppNotification | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [showPrefs, setShowPrefs] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set(JSON.parse(localStorage.getItem('pinnedNotifications') || '[]')));
  const sentinelRef = useRef<HTMLDivElement>(null);

  const filters: Record<string, any> = {};
  if (filterTab === 'unread') filters.isRead = false;
  if (['info', 'success', 'warning', 'error'].includes(filterTab)) filters.type = filterTab;
  if (search.trim()) filters.search = search.trim();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['notifications', 'list', filterTab, search],
    queryFn: ({ pageParam = 1 }) => notificationsApi.getAll(pageParam, PAGE_SIZE, filters),
    getNextPageParam: (lastPage, pages) => {
      const total = lastPage?.total || 0;
      const loaded = pages.length * PAGE_SIZE;
      return loaded < total ? pages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });

  const { data: counts } = useQuery({
    queryKey: ['notifications', 'counts'],
    queryFn: () => notificationsApi.getCounts(),
    refetchInterval: 30_000,
  });

  // Auto-fetch next page when sentinel enters viewport
  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) fetchNextPage();
    }, { rootMargin: '200px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  // Socket event: refresh on new notification
  useSocketEvent('notification.new', () => {
    queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
    refreshUnreadCount();
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
      refreshUnreadCount();
    },
  });

  const allNotifications: AppNotification[] = data?.pages?.flatMap((p) => p?.data || []) || [];
  const grouped = groupByDay(allNotifications);

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts?.all ?? 0 },
    { key: 'unread', label: 'Unread', count: counts?.unread ?? 0 },
    { key: 'info', label: 'Info', count: counts?.info ?? 0 },
    { key: 'success', label: 'Success', count: counts?.success ?? 0 },
    { key: 'warning', label: 'Warning', count: counts?.warning ?? 0 },
    { key: 'error', label: 'Error', count: counts?.error ?? 0 },
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('settings.notifications')}</h1>
        <div className="flex gap-3 text-sm items-center">
          <button onClick={() => setShowPrefs(!showPrefs)} className="text-[var(--color-text-muted)] hover:underline">{showPrefs ? 'Close' : 'Preferences'}</button>
          <button onClick={() => archiveAllMutation.mutate()} className="text-[var(--color-text-muted)] hover:underline">Archive all</button>
          <button onClick={() => markAllMutation.mutate()} className="text-[var(--color-primary)] hover:underline">{t('notification.mark_all_read')}</button>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-[var(--color-primary)]/5 rounded-xl text-sm">
          <span className="text-[var(--color-text-muted)]">{selectedIds.size} selected</span>
          <button onClick={() => { selectedIds.forEach(id => deleteMutation.mutate(id)); setSelectedIds(new Set()); }} className="text-[var(--color-error)] hover:underline">Delete</button>
          <button onClick={() => { queryClient.invalidateQueries({ queryKey: ['notifications'] }); setSelectedIds(new Set()); }} className="text-[var(--color-primary)] hover:underline">Deselect</button>
        </div>
      )}

      {/* Preferences panel */}
      {showPrefs && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
          <h3 className="text-sm font-semibold mb-4 text-[var(--color-text)]">Notification Preferences</h3>
          {['bookings', 'payments', 'marketplace', 'system'].map(cat => (
            <div key={cat} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
              <span className="text-sm capitalize text-[var(--color-text)]">{cat}</span>
              <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <input type="checkbox" defaultChecked className="rounded" /> In-App
                <input type="checkbox" defaultChecked className="rounded" /> Email
              </label>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search notifications..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 pl-10 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">🔍</span>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setFilterTab(tab.key); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filterTab === tab.key
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="bg-[var(--color-error)] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                {tab.count > 99 ? '99+' : tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notification List - Grouped by Day */}
      {allNotifications.length === 0 ? (
        <p className="text-[var(--color-text-muted)] py-8 text-center">{t('notification.empty')}</p>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([day, notifications]) => (
            <div key={day}>
              <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2 px-1">{day}</h3>
              <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-2 px-4 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)] cursor-pointer transition-colors ${!n.is_read ? 'bg-[var(--color-info-bg)]/50' : ''} ${pinnedIds.has(n.id) ? 'border-l-2 border-l-yellow-500' : ''}`}
                    onClick={() => setSelected(n)}
                  >
                    <input type="checkbox" checked={selectedIds.has(n.id)} onChange={e => { e.stopPropagation(); const next = new Set(selectedIds); if (next.has(n.id)) next.delete(n.id); else next.add(n.id); setSelectedIds(next); }}
                      className="mt-1 shrink-0 rounded" />
                    <span className="text-xl shrink-0 mt-0.5">{n.icon || '📬'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {pinnedIds.has(n.id) && <span className="text-[10px]">📌</span>}
                          {n.type && (
                            <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${
                              n.type === 'success' ? 'bg-green-100 text-green-700' :
                              n.type === 'error' ? 'bg-red-100 text-red-700' :
                              n.type === 'warning' ? 'bg-amber-100 text-amber-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>{n.type}</span>
                          )}
                          <p className="text-sm font-medium text-[var(--color-text)] truncate">{n.title}</p>
                        </div>
                        <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">
                          {new Date(n.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {n.body && <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{n.body}</p>}
                    </div>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] shrink-0 mt-2" />}
                    <button onClick={e => { e.stopPropagation(); const next = new Set(pinnedIds); if (next.has(n.id)) next.delete(n.id); else next.add(n.id); setPinnedIds(next); localStorage.setItem('pinnedNotifications', JSON.stringify([...next])); }}
                      className={`text-xs shrink-0 mt-1 ${pinnedIds.has(n.id) ? 'text-yellow-500' : 'text-[var(--color-text-muted)]'}`} title="Pin">{pinnedIds.has(n.id) ? '★' : '☆'}</button>
                    <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(n.id); }}
                      className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)] shrink-0 mt-1" title="Delete">✕</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />
      {isFetchingNextPage && <p className="text-center text-sm text-[var(--color-text-muted)]">Loading more...</p>}

      <NotificationDetailModal notification={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
