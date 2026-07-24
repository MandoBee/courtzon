import api from './api';

export const pricingApi = {
  preview: (data: { resourceId: number; date: string; startTime: string; endTime: string; expectedOccupancy?: number }) =>
    api.post('/pricing/preview', data).then(r => r.data.data),
  getRules: () => api.get('/admin/pricing/rules').then(r => r.data.data),
  getRule: (id: number) => api.get(`/admin/pricing/rules/${id}`).then(r => r.data.data),
  createRule: (data: any) => api.post('/admin/pricing/rules', data).then(r => r.data.data),
  updateRule: (id: number, data: any) => api.put(`/admin/pricing/rules/${id}`, data).then(r => r.data),
  deleteRule: (id: number) => api.delete(`/admin/pricing/rules/${id}`).then(r => r.data),
  getSeasons: () => api.get('/admin/pricing/seasons').then(r => r.data.data),
  createSeason: (data: any) => api.post('/admin/pricing/seasons', data).then(r => r.data.data),
  deleteSeason: (id: number) => api.delete(`/admin/pricing/seasons/${id}`).then(r => r.data),
};
