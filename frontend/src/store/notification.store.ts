import { create } from 'zustand';
import { socketService } from '../services/socket';
import { notificationsApi } from '../services/notifications';
import { maybePlayNotificationSound, initNotificationSound } from '../services/notificationSound';
import { updateAppBadge } from '../services/appBadge';
import type { AppNotification } from '../components/notifications/NotificationDetailModal';

interface NotificationState {
  items: AppNotification[];
  unreadCount: number;
  initialized: boolean;
  connected: boolean;
  _pollTimer: ReturnType<typeof setInterval> | null;
  init: () => void;
  destroy: () => void;
  addNotification: (n: AppNotification) => void;
  refreshUnreadCount: () => Promise<void>;
  setUnreadCount: (count: number) => void;
  prependNotification: (n: AppNotification) => void;
  clearAll: () => void;
  handleReconnectSync: () => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  handleAction: (notificationId: number, actionKey: string, actionPayload?: any) => void;
}

/**
 * G9-D5 — keep the app-icon badge in sync with the single (server-authoritative)
 * unread counter. Subscribing once covers every mutation path (arrival, read,
 * mark-all-read, reconnect, poll, clear, destroy) without scattering calls.
 */
function bindBadgeSync() {
  useNotificationStore.subscribe((state, prev) => {
    if (state.unreadCount !== prev.unreadCount) {
      updateAppBadge(state.unreadCount);
    }
  });
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unreadCount: 0,
  initialized: false,
  connected: false,
  _pollTimer: null,

  init: () => {
    if (get().initialized) return;
    set({ initialized: true });

    // G9-D5-D — unlock audio after the user's first interaction (autoplay policy).
    initNotificationSound();

    socketService.on('notification.new', handleNotificationNew);
    socketService.on('notification.unread-count', handleUnreadCountEvent);
    socketService.on('notification:reconnect-queue', handleReconnectQueue);
    socketService.on('connect', handleSocketConnect);
    socketService.on('disconnect', handleSocketDisconnect);

    get().refreshUnreadCount();

    const timer = setInterval(() => get().refreshUnreadCount(), 30_000);
    set({ _pollTimer: timer });
  },

  destroy: () => {
    const timer = get()._pollTimer;
    if (timer) clearInterval(timer);
    // Unregister the SAME handler references init() registered — without this a
    // destroy()/init() cycle (logout → login without a page reload) stacked a
    // new copy of every listener on `socketService`.
    socketService.off('notification.new', handleNotificationNew);
    socketService.off('notification.unread-count', handleUnreadCountEvent);
    socketService.off('notification:reconnect-queue', handleReconnectQueue);
    socketService.off('connect', handleSocketConnect);
    socketService.off('disconnect', handleSocketDisconnect);
    set({ initialized: false, items: [], unreadCount: 0, connected: false, _pollTimer: null });
  },

  addNotification: (n: AppNotification) => {
    const state = get();
    const id = n.id ?? (n as any).notificationId;
    const exists = id != null && state.items.some((item) => item.id === id);
    if (!exists) {
      set({ items: [enrichNotification({ ...n, ...(id != null ? { id } : {}) }), ...state.items] });
    }
  },

  refreshUnreadCount: async () => {
    try {
      const data = await notificationsApi.getUnreadCount();
      set({ unreadCount: data.count ?? 0 });
    } catch { }
  },

  setUnreadCount: (count: number) => set({ unreadCount: count }),

  prependNotification: (n: AppNotification) => {
    const state = get();
    const id = n.id ?? (n as any).notificationId;
    const exists = id != null && state.items.some((item) => item.id === id);
    if (!exists) {
      set({ items: [enrichNotification({ ...n, ...(id != null ? { id } : {}) }), ...state.items], unreadCount: state.unreadCount + 1 });
    }
  },

  clearAll: () => set({ items: [], unreadCount: 0 }),

  handleReconnectSync: async () => {
    try {
      const data = await notificationsApi.getReconnectQueue();
      if (data?.notifications?.length) {
        const state = get();
        const newItems = data.notifications
          .map(enrichNotification)
          .filter((n: AppNotification) => !state.items.some((existing) => existing.id === n.id));
        if (newItems.length) {
          set({
            items: [...newItems, ...state.items],
            unreadCount: state.unreadCount + newItems.length,
          });
        }
      }
    } catch { }
  },

  markAsRead: async (id: number) => {
    try {
      await notificationsApi.markAsRead(id);
      set((state) => {
        const target = state.items.find((n) => n.id === id);
        const wasUnread = target ? !target.is_read : state.unreadCount > 0;
        return {
          items: state.items.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
          // Never double-decrement when a stale list item is clicked twice.
          unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
        };
      });
      notificationsApi.trackEvent('read', { notificationId: id });
    } catch { }
  },

  handleAction: (notificationId: number, actionKey: string, actionPayload?: any) => {
    notificationsApi.trackEvent('clicked', { notificationId, actionKey, actionPayload });
    get().markAsRead(notificationId);
  },
}));

/**
 * Socket.IO handlers are module-level functions so `init()` and `destroy()`
 * register/remove the SAME references. Building fresh arrow functions inside
 * `init()` stacked a new copy of every listener on `socketService` after each
 * destroy()/init() cycle (logout → login without a page reload).
 */
function handleNotificationNew(notification: AppNotification): void {
  const state = useNotificationStore.getState();
  // The socket payload may arrive with `notificationId` (backend mapper)
  // instead of `id` — normalize so dedup/sound/count stay correct.
  const id = notification.id ?? (notification as any).notificationId;
  const exists = id != null && state.items.some((n) => n.id === id);
  if (!exists) {
    const enriched = { ...enrichNotification(notification), ...(id != null ? { id } : {}) };
    useNotificationStore.setState({
      items: [enriched, ...state.items],
      unreadCount: state.unreadCount + 1,
    });
    // G9-D5-D — sound fires ONLY on a genuinely new socket-delivered
    // notification (deduped by id). Reconnect/hydration/polling/rerender
    // never trigger sound.
    maybePlayNotificationSound();
  }
}

function handleUnreadCountEvent(): void {
  void useNotificationStore.getState().refreshUnreadCount();
}

function handleReconnectQueue(data: { ids: number[] }): void {
  if (!data?.ids?.length) return;
  const state = useNotificationStore.getState();
  const newIds = data.ids.filter((id) => !state.items.some((n) => n.id === id));
  if (newIds.length) {
    void useNotificationStore.getState().refreshUnreadCount();
  }
}

function handleSocketConnect(): void {
  useNotificationStore.setState({ connected: true });
  void useNotificationStore.getState().handleReconnectSync();
}

function handleSocketDisconnect(): void {
  useNotificationStore.setState({ connected: false });
}

bindBadgeSync();

function enrichNotification(n: any): AppNotification {
  return {
    ...n,
    actions: typeof n.actions === 'string' ? safeParse(n.actions) : n.actions,
    image_urls: typeof n.image_urls === 'string' ? safeParse(n.image_urls) : n.image_urls,
    action_payload: typeof n.action_payload === 'string' ? safeParse(n.action_payload) : n.action_payload,
  };
}

function safeParse(v: string): any {
  try { return JSON.parse(v); } catch { return null; }
}
