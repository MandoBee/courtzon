/**
 * G11.22 P1 — membership plan versioning + subscription API client.
 * Full payment only; installments/refunds belong to later phases.
 */
import api from './api';

export const membershipP1Api = {
  // Organisation settings
  getOrgSettings: (orgId: number) => api.get(`/org/${orgId}/membership/settings`).then((r) => r.data),
  saveOrgSettings: (orgId: number, data: { enabledDurations: string[]; allowedPaymentMethods: string[] }) =>
    api.put(`/org/${orgId}/membership/settings`, data).then((r) => r.data),

  // Organisation plans + versions
  listOrgPlans: (orgId: number) => api.get(`/org/${orgId}/membership/plans`).then((r) => r.data),
  createPlan: (orgId: number, data: any) => api.post(`/org/${orgId}/membership/plans`, data).then((r) => r.data),
  updatePlanBasic: (orgId: number, planId: number, data: any) =>
    api.put(`/org/${orgId}/membership/plans/${planId}`, data).then((r) => r.data),
  createVersion: (orgId: number, planId: number, data: any) =>
    api.post(`/org/${orgId}/membership/plans/${planId}/versions`, data).then((r) => r.data),
  updateVersion: (orgId: number, versionId: number, data: any) =>
    api.put(`/org/${orgId}/membership/versions/${versionId}`, data).then((r) => r.data),
  activateVersion: (orgId: number, versionId: number) =>
    api.post(`/org/${orgId}/membership/versions/${versionId}/activate`).then((r) => r.data),
  archiveVersion: (orgId: number, versionId: number) =>
    api.post(`/org/${orgId}/membership/versions/${versionId}/archive`).then((r) => r.data),

  // Organisation subscriptions
  listOrgSubscriptions: (orgId: number) => api.get(`/org/${orgId}/membership/subscriptions`).then((r) => r.data),
  confirmCash: (orgId: number, subscriptionId: number) =>
    api.post(`/org/${orgId}/membership/subscriptions/${subscriptionId}/confirm-cash`).then((r) => r.data),
  completeCard: (orgId: number, subscriptionId: number) =>
    api.post(`/org/${orgId}/membership/subscriptions/${subscriptionId}/complete-card`).then((r) => r.data),

  // Player storefront + purchase
  listActiveVersions: (orgId: number) => api.get(`/organisations/${orgId}/membership/plans-active`).then((r) => r.data),
  purchase: (orgId: number, data: { planVersionId: number; paymentMethod: 'cash' | 'card' }) =>
    api.post(`/organisations/${orgId}/membership/subscriptions`, data).then((r) => r.data),
  listMySubscriptions: () => api.get('/my/membership/subscriptions').then((r) => r.data),
};