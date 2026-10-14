import api from './api';

/**
 * Payload contract for `POST /admin/membership/plans`, mirroring
 * `CreateMembershipPlanSchema` (backend/src/modules/membership/presentation/membership.dto.ts)
 * and the canonical `membership_plans` column domains.
 * `plan_type` and `duration_days` are NOT NULL columns without a DB default and
 * are supplied by the caller (no derivation exists).
 */
export type MembershipPlanDurationType = 'days' | 'months' | 'years' | 'perpetual';
export type MembershipPlanType =
  | 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'unlimited'
  | 'credits' | 'session_bundle' | 'corporate' | 'family' | 'student';
export type MembershipPlanStatus = 'draft' | 'active' | 'archived';

export interface AdminMembershipPlanInput {
  code: string;
  name: string;
  description?: string;
  category: string;
  duration_type: MembershipPlanDurationType;
  duration_value: number;
  plan_type: MembershipPlanType;
  duration_days: number;
  price: number;
  currency?: string;
  status?: MembershipPlanStatus;
  is_default?: boolean;
  is_public?: boolean;
  sort_order?: number;
}

/** Select options mirroring the canonical column domains (shared by admin forms). */
export const MEMBERSHIP_PLAN_DURATION_TYPE_OPTIONS: MembershipPlanDurationType[] = ['days', 'months', 'years', 'perpetual'];
export const MEMBERSHIP_PLAN_TYPE_OPTIONS: MembershipPlanType[] = [
  'monthly', 'quarterly', 'semiannual', 'annual', 'unlimited',
  'credits', 'session_bundle', 'corporate', 'family', 'student',
];
export const MEMBERSHIP_PLAN_STATUS_OPTIONS: MembershipPlanStatus[] = ['draft', 'active', 'archived'];

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
  adminCreatePlan: (data: AdminMembershipPlanInput) => api.post('/admin/membership/plans', data).then(r => r.data.data),
  adminGetCampaigns: () => api.get('/admin/membership/campaigns').then(r => r.data.data),
  adminCreateCampaign: (data: any) => api.post('/admin/membership/campaigns', data).then(r => r.data.data),
  adminCreateReward: (data: any) => api.post('/admin/membership/rewards', data).then(r => r.data.data),
};
