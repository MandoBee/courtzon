export type OrgStatus = 'active' | 'suspended' | 'pending' | 'rejected';
export type OrgVerificationStatus = 'verified' | 'unverified' | 'pending';

export interface OrganisationRecord {
  id: number;
  name: string;
  status: OrgStatus;
  is_verified: boolean;
  owner_id: number;
  aggregate_version: number;
}

export function isActiveOrg(org: OrganisationRecord): boolean {
  return org.status === 'active';
}

export function isVerifiedOrg(org: OrganisationRecord): boolean {
  return org.is_verified;
}
