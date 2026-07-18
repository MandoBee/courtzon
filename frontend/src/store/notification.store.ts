import { create } from 'zustand';
import { socketService } from '../services/socket';
import { notificationsApi } from '../services/notifications';
import { queryClient } from '../lib/queryClient';
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

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unreadCount: 0,
  initialized: false,
  connected: false,
  _pollTimer: null,

  init: () => {
    if (get().initialized) return;
    set({ initialized: true });

    socketService.connect();

    socketService.on('notification:new', (notification: AppNotification) => {
      const state = get();
      const exists = state.items.some((n) => n.id === notification.id);
      if (!exists) {
        const enriched = enrichNotification(notification);
        set({ items: [enriched, ...state.items], unreadCount: state.unreadCount + 1 });
        invalidateQueriesForNotification(enriched);
      }
    });

    socketService.on('notification:unread-count', () => {
      get().refreshUnreadCount();
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
    socketService.disconnect();
    set({ initialized: false, items: [], unreadCount: 0, connected: false, _pollTimer: null });
  },

  addNotification: (n: AppNotification) => {
    const state = get();
    const exists = state.items.some((item) => item.id === n.id);
    if (!exists) {
      set({ items: [enrichNotification(n), ...state.items] });
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
    const exists = state.items.some((item) => item.id === n.id);
    if (!exists) {
      set({ items: [enrichNotification(n), ...state.items], unreadCount: state.unreadCount + 1 });
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
          newItems.forEach(invalidateQueriesForNotification);
        }
      }
    } catch { }
  },

  markAsRead: async (id: number) => {
    try {
      await notificationsApi.markAsRead(id);
      set((state) => ({
        items: state.items.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
      notificationsApi.trackEvent('read', { notificationId: id });
    } catch { }
  },

  handleAction: (notificationId: number, actionKey: string, actionPayload?: any) => {
    notificationsApi.trackEvent('clicked', { notificationId, actionKey, actionPayload });
    get().markAsRead(notificationId);
  },
}));

function enrichNotification(n: any): AppNotification {
  return {
    ...n,
    actions: typeof n.actions === 'string' ? safeParse(n.actions) : n.actions,
    image_urls: typeof n.image_urls === 'string' ? safeParse(n.image_urls) : n.image_urls,
    action_payload: typeof n.action_payload === 'string' ? safeParse(n.action_payload) : n.action_payload,
  };
}

function invalidateQueriesForNotification(n: AppNotification) {
  const bookingRelated =
    n.related_entity_type === 'booking' ||
    n.category_slug === 'bookings' ||
    n.category_slug === 'payments' ||
    (typeof n.action_key === 'string' && n.action_key.includes('booking'));

  if (bookingRelated) {
    queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['home-continue'] });
    queryClient.invalidateQueries({ queryKey: ['home-upcoming-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['home-recent-activity'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
  }

  if (n.related_entity_type === 'match' || n.category_slug === 'matches') {
    queryClient.invalidateQueries({ queryKey: ['public-matches'] });
    queryClient.invalidateQueries({ queryKey: ['match-applicants'] });
  }
}

function safeParse(v: string): any {
  try { return JSON.parse(v); } catch { return null; }
}
