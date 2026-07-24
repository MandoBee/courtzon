import api from './api';

export const membershipApi = {
  getPlans: () => api.get('/membership/plans').then(r => r.data.data),
  getPlan: (id: number) => api.get(`/membership/plans/${id}`).then(r => r.data.data),
  subscribe: (planId: number) => api.post('/membership/subscribe', { planId }).then(r => r.data.data),
  getMyMemberships: () => api.get('/membership/my').then(r => r.data.data),
  getActive: () => api.get('/membership/active').then(r => r.data.data),
  getLoyalty: () => api.get('/membership/loyalty').then(r => r.data.data),
  earnPoints: (amount: number, activityType?: string) => api.post('/membership/earn', { amount, activityType }).then(r => r.data.data),
  getRewards: () => api.get('/membership/rewards').then(r => r.data.data),
  claimReward: (rewardId: number) => api.post('/membership/rewards/claim', { rewardId }).then(r => r.data.data),

  // Admin
  adminGetPlans: () => api.get('/admin/membership/plans').then(r => r.data.data),
  adminCreatePlan: (data: any) => api.post('/admin/membership/plans', data).then(r => r.data.data),
  adminGetCampaigns: () => api.get('/admin/membership/campaigns').then(r => r.data.data),
  adminCreateCampaign: (data: any) => api.post('/admin/membership/campaigns', data).then(r => r.data.data),
  adminCreateReward: (data: any) => api.post('/admin/membership/rewards', data).then(r => r.data.data),
};
