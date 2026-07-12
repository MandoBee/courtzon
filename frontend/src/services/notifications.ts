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

  getCounts: () =>
    api.get('/notifications/filters').then((r) => r.data.counts),

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

  getReconnectQueue: () =>
    api.get('/notifications/reconnect-queue').then((r) => r.data),

  trackEvent: (eventType: string, payload: any) =>
    api.post('/notifications/track', { eventType, ...payload }).then((r) => r.data),

  sendBroadcast: (data: {
    title: string; body: string; type?: string; priority?: string;
    actionKey?: string; routePattern?: string; imageUrls?: Record<string, string>;
    actions?: any[]; target: any; scheduledAt?: string;
  }) =>
    api.post('/admin/notifications/broadcast', data).then((r) => r.data),

  getBroadcasts: (activeOnly: boolean = false, page: number = 1, limit: number = 50) =>
    api.get(`/admin/notifications/broadcasts?active_only=${activeOnly}&page=${page}&limit=${limit}`).then((r) => r.data),

  cancelBroadcast: (id: number) =>
    api.put(`/admin/notifications/broadcasts/${id}/cancel`).then((r) => r.data),

  getAnalytics: (filters?: { eventType?: string; from?: string; to?: string }) => {
    let url = '/admin/notifications/analytics';
    if (filters?.eventType) url += `&event_type=${encodeURIComponent(filters.eventType)}`;
    if (filters?.from) url += `&from=${encodeURIComponent(filters.from)}`;
    if (filters?.to) url += `&to=${encodeURIComponent(filters.to)}`;
    url = url.replace('?&', '?');
    return api.get(url).then((r) => r.data);
  },

  getDeadLetters: (resolved = false) =>
    api.get(`/admin/notifications/dead-letters?resolved=${resolved}`).then((r) => r.data),

  resolveDeadLetter: (id: number) =>
    api.put(`/admin/notifications/dead-letters/${id}/resolve`).then((r) => r.data),
};
