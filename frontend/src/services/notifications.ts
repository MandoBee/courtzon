import api from './api';

export const notificationsApi = {
  getAll: (page = 1, limit = 20, actionKey?: string) => {
    let url = `/notifications?page=${page}&limit=${limit}`;
    if (actionKey) url += `&action_key=${encodeURIComponent(actionKey)}`;
    return api.get(url).then((r) => r.data);
  },

  getUnreadCount: () =>
    api.get('/notifications/unread-count').then((r) => r.data),

  markAsRead: (id: number) =>
    api.put(`/notifications/${id}/read`).then((r) => r.data),

  markAllAsRead: () =>
    api.put('/notifications/read-all').then((r) => r.data),
};
