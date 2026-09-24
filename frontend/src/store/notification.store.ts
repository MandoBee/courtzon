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

    socketService.on('notification.new', (notification: AppNotification) => {
      const state = get();
      // The socket payload may arrive with `notificationId` (backend mapper)
      // instead of `id` — normalize so dedup/sound/count stay correct.
      const id = notification.id ?? (notification as any).notificationId;
      const exists = id != null && state.items.some((n) => n.id === id);
      if (!exists) {
        const enriched = { ...enrichNotification(notification), ...(id != null ? { id } : {}) };
        set({ items: [enriched, ...state.items], unreadCount: state.unreadCount + 1 });
        // G9-D5-D — sound fires ONLY on a genuinely new socket-delivered
        // notification (deduped by id). Reconnect/hydration/polling/rerender
        // never trigger sound.
        maybePlayNotificationSound();
      }
    });

    socketService.on('notification.unread-count', () => {
      get().refreshUnreadCount();
    });

    socketService.on('notification:reconnect-queue', (data: { ids: number[] }) => {
      if (data?.ids?.length) {
        const state = get();
        const newIds = data.ids.filter((id) => !state.items.some((n) => n.id === id));
        if (newIds.length) {
          get().refreshUnreadCount();
        }
      }
    });

    socketService.on('connect', () => {
      set({ connected: true });
      get().handleReconnectSync();
    });

    socketService.on('disconnect', () => {
      set({ connected: false });
    });

    get().refreshUnreadCount();

    const timer = setInterval(() => get().refreshUnreadCount(), 30_000);
    set({ _pollTimer: timer });
  },

  destroy: () => {
    const timer = get()._pollTimer;
    if (timer) clearInterval(timer);
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
