/**
 * Coach-service branch eligibility — the canonical business rule used by both
 * the `coach_service_locations` access checks and the scheduling booking engine.
 *
 * A coach may serve at a branch ONLY when BOTH of the following hold:
 *   1. SERVICE ACCESS — the coach has an explicit row in `coach_service_locations`
 *      for the branch. Service access is independent of any organisation
 *      agreement (the coach opts in, or an org grants access).
 *   2. POLICY — the branch coach policy is satisfied:
 *        - 'independent_coaches_allowed' → always eligible (given access).
 *        - 'contract_required'           → requires an accepted/active
 *          `coach_org_agreements` record with the branch's organisation.
 */
export type CoachBranchPolicy = 'contract_required' | 'independent_coaches_allowed';

export interface CoachEligibilityInput {
  hasServiceAccess: boolean;
  branchPolicy: CoachBranchPolicy;
  hasAgreement: boolean;
}

export interface CoachEligibilityResult {
  eligible: boolean;
  reason: string | null;
  /** Whether the blocker (if any) is a missing service-access row. */
  requiresServiceAccess: boolean;
  /** Whether the blocker (if any) is a missing contract agreement. */
  requiresAgreement: boolean;
}

export function evaluateCoachEligibility(input: CoachEligibilityInput): CoachEligibilityResult {
  if (!input.hasServiceAccess) {
    return {
      eligible: false,
      reason: 'Coach has no service access to this branch',
      requiresServiceAccess: true,
      requiresAgreement: false,
    };
  }

  if (input.branchPolicy === 'contract_required' && !input.hasAgreement) {
    return {
      eligible: false,
      reason: 'Coach has no active agreement with this organisation (contract required)',
      requiresServiceAccess: false,
      requiresAgreement: true,
    };
  }

  return { eligible: true, reason: null, requiresServiceAccess: false, requiresAgreement: false };
}