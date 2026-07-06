import api from './api';

export const notificationsApi = {
  getAll: (page = 1, limit = 20, filters?: { actionKey?: string; type?: string; priority?: string; isRead?: boolean }) => {
    let url = `/notifications?page=${page}&limit=${limit}`;
    if (filters) {
      if (filters.actionKey) url += `&action_key=${encodeURIComponent(filters.actionKey)}`;
      if (filters.type) url += `&type=${encodeURIComponent(filters.type)}`;
      if (filters.priority) url += `&priority=${encodeURIComponent(filters.priority)}`;
      if (filters.isRead !== undefined) url += `&is_read=${filters.isRead}`;
    }
    return api.get(url).then((r) => r.data);
  },

  getUnreadCount: () =>
    api.get('/notifications/unread-count').then((r) => r.data),

  getFilters: () =>
    api.get('/notifications/filters').then((r) => r.data),

  markAsRead: (id: number) =>
    api.put(`/notifications/${id}/read`).then((r) => r.data),

  markAllAsRead: () =>
    api.put('/notifications/read-all').then((r) => r.data),

  archive: (id: number) =>
    api.put(`/notifications/${id}/archive`).then((r) => r.data),

  archiveAll: () =>
    api.put('/notifications/archive-all').then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/notifications/${id}`).then((r) => r.data),

  getPreferences: () =>
    api.get('/notification-preferences').then((r) => r.data),

  updatePreferences: (preferences: any[]) =>
    api.put('/notification-preferences', { preferences }).then((r) => r.data),
};
