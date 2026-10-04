/**
 * G11.22 P1+P2 — membership plan versioning + subscriptions + installments API
 * client. P1 = full payment; P2 = installments / renewal / cancel / refund /
 * eligibility. All mutations are org-managed (membership.manage) or player-owned.
 */
import api from './api';

export const membershipP1Api = {
  // Organisation settings (durations, payment channels + cancellation/refund policy)
  getOrgSettings: (orgId: number) => api.get(`/org/${orgId}/membership/settings`).then((r) => r.data),
  saveOrgSettings: (orgId: number, data: { enabledDurations: string[]; allowedPaymentMethods: string[]; cancellationRefundPolicy?: any }) =>
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

  // G11.22 P2 — installments
  confirmInstallmentCash: (orgId: number, subscriptionId: number, seq: number) =>
    api.post(`/org/${orgId}/membership/subscriptions/${subscriptionId}/installments/${seq}/confirm-cash`, {}).then((r) => r.data),
  completeInstallmentCard: (orgId: number, subscriptionId: number, seq: number) =>
    api.post(`/org/${orgId}/membership/subscriptions/${subscriptionId}/installments/${seq}/complete-card`, {}).then((r) => r.data),

  // G11.22 P2 — renewal / cancellation / refund (org-managed)
  renew: (orgId: number, subscriptionId: number, paymentMethod: 'cash' | 'card' = 'card') =>
    api.post(`/org/${orgId}/membership/subscriptions/${subscriptionId}/renew`, { paymentMethod }).then((r) => r.data),
  cancel: (orgId: number, subscriptionId: number, reason?: string) =>
    api.post(`/org/${orgId}/membership/subscriptions/${subscriptionId}/cancel`, { reason }).then((r) => r.data),
  refund: (orgId: number, subscriptionId: number, installmentIds: number[], reason?: string) =>
    api.post(`/org/${orgId}/membership/subscriptions/${subscriptionId}/refund`, { installmentIds, reason }).then((r) => r.data),

  // G11.22 P2 — eligibility facts (org + player)
  getOrgEligibility: (orgId: number, subscriptionId: number) =>
    api.get(`/org/${orgId}/membership/subscriptions/${subscriptionId}/eligibility`).then((r) => r.data),
  getMyEligibility: (subscriptionId: number) =>
    api.get(`/my/membership/subscriptions/${subscriptionId}/eligibility`).then((r) => r.data),

  // Player storefront + purchase
  listActiveVersions: (orgId: number) => api.get(`/organisations/${orgId}/membership/plans-active`).then((r) => r.data),
  purchase: (orgId: number, data: { planVersionId: number; paymentMethod: 'cash' | 'card' }) =>
    api.post(`/organisations/${orgId}/membership/subscriptions`, data).then((r) => r.data),
  listMySubscriptions: () => api.get('/my/membership/subscriptions').then((r) => r.data),
};