/** CourtZon allows org portal only when verified AND active (admin approval sets both). */
export function canManageOrganisation(org: {
  isVerified?: boolean;
  isActive?: boolean;
}): boolean {
  return org.isVerified === true && org.isActive === true;
}

/** Pending / under review — missing either verified or active (e.g. Pending + Suspended). */
export function isOrganisationPendingApproval(org: {
  isVerified?: boolean;
  isActive?: boolean;
}): boolean {
  return !canManageOrganisation(org);
}

export function orgPortalPath(org: {
  id: number;
  isVerified?: boolean;
  isActive?: boolean;
}): string {
  if (isOrganisationPendingApproval(org)) {
    return `/org/${org.id}/pending-approval`;
  }
  return `/org/${org.id}/dashboard`;
}
