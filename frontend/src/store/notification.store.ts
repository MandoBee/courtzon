import { create } from 'zustand';
import { socketService } from '../services/socket';
import { notificationsApi } from '../services/notifications';
import type { AppNotification } from '../components/notifications/NotificationDetailModal';

interface NotificationState {
  items: AppNotification[];
  unreadCount: number;
  initialized: boolean;
  init: () => void;
  destroy: () => void;
  addNotification: (n: AppNotification) => void;
  refreshUnreadCount: () => Promise<void>;
  setUnreadCount: (count: number) => void;
  prependNotification: (n: AppNotification) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unreadCount: 0,
  initialized: false,

  init: () => {
    if (get().initialized) return;
    set({ initialized: true });

    socketService.connect();

    socketService.on('notification:new', (notification: AppNotification) => {
      const state = get();
      const exists = state.items.some((n) => n.id === notification.id);
      if (!exists) {
        set({ items: [notification, ...state.items], unreadCount: state.unreadCount + 1 });
      }
    });

    socketService.on('notification:unread-count', () => {
      get().refreshUnreadCount();
    });

    get().refreshUnreadCount();
  },

  destroy: () => {
    socketService.disconnect();
    set({ initialized: false, items: [], unreadCount: 0 });
  },

  addNotification: (n: AppNotification) => {
    const state = get();
    const exists = state.items.some((item) => item.id === n.id);
    if (!exists) {
      set({ items: [n, ...state.items] });
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
      set({ items: [n, ...state.items], unreadCount: state.unreadCount + 1 });
    }
  },

  clearAll: () => set({ items: [], unreadCount: 0 }),
}));
