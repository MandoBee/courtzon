/** API path helpers for OrganisationForm across admin / org / seller contexts. */
export type OrganisationFormContext = 'admin' | 'seller' | 'org';

export function organisationFormPaths(context: OrganisationFormContext, orgId: number) {
  const isOrg = context === 'org';
  return {
    isOrg,
    orgInfo: isOrg ? `/org/${orgId}/info` : `/organisations/${orgId}`,
    branchesList: isOrg ? `/org/${orgId}/branches` : `/organisations/${orgId}/branches`,
    branchUpdate: (branchId: number) =>
      isOrg ? `/org/${orgId}/branches/${branchId}` : `/branches/${branchId}`,
    branchDelete: (branchId: number) =>
      isOrg ? `/org/${orgId}/branches/${branchId}` : `/branches/${branchId}`,
    branchFinancialDetails: (branchId: number) =>
      isOrg ? `/org/${orgId}/branches/${branchId}/financial-details` : `/branches/${branchId}/financial-details`,
    createBranch: isOrg ? `/org/${orgId}/branches` : '/branches',
    createResource: isOrg ? `/org/${orgId}/resources` : '/resources',
    resourceUpdate: (resourceId: number) =>
      isOrg ? `/org/${orgId}/resources/${resourceId}` : `/resources/${resourceId}`,
    resourceDelete: (resourceId: number) =>
      isOrg ? `/org/${orgId}/resources/${resourceId}` : `/resources/${resourceId}`,
    cancellationSettings: isOrg ? `/org/${orgId}/cancellation-settings` : `/organisations/${orgId}/cancellation-settings`,
    branchesQueryKey: isOrg ? (['org-branches', orgId] as const) : (['branches', orgId] as const),
    orgQueryKey: isOrg ? (['org-info', orgId] as const) : (['organisation', orgId] as const),
  };
}

export function unwrapBranchesResponse(context: OrganisationFormContext, data: unknown): any[] {
  if (context === 'org') {
    return Array.isArray(data) ? data : [];
  }
  return (data as { data?: unknown[] })?.data ?? [];
}
