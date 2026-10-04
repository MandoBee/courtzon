/**
 * G11.22 — Membership & Club Access P0.
 *
 * Organisation-level club access model and the SINGLE authoritative resolution
 * function for branch access policy.
 *
 * This module is the anchor for the future membership access resolver
 * (P1/P2/P3/P4). It is deliberately small and pure (no DB, no framework) so it
 * can be unit-tested in isolation and later extended with membership status,
 * grace period, branch entitlement and tournament eligibility WITHOUT building
 * a second access engine.
 */

/** Supported organisation access models (P0). */
export const ACCESS_MODEL_VALUES = ['PUBLIC_CLUB', 'MEMBERSHIP_CLUB'] as const;

export type OrganisationAccessModel = (typeof ACCESS_MODEL_VALUES)[number];

/** Existing branch access types — preserved unchanged (never renamed). */
export const BRANCH_ACCESS_TYPE_VALUES = ['open', 'restricted', 'invite_only'] as const;

export type BranchAccessType = (typeof BRANCH_ACCESS_TYPE_VALUES)[number];

/**
 * Effective branch policy after resolving organisation model + branch policy.
 *
 *   'public'               — open to everyone (PUBLIC_CLUB + branch access_type 'open')
 *   'restricted'           — approved players only (existing branch_player_access)
 *   'invite_only'          — invite/approval only (existing strictest branch type)
 *   'membership_required'  — access requires a valid membership (MEMBERSHIP_CLUB default).
 *                            P0 stores/derives this intent; actual membership
 *                            enforcement lands with the membership engine (P2/P4).
 */
export type BranchEffectivePolicy =
  | 'public'
  | 'restricted'
  | 'invite_only'
  | 'membership_required';

/** True when the value is a supported organisation access model. */
export function isValidAccessModel(value: unknown): value is OrganisationAccessModel {
  return typeof value === 'string' && (ACCESS_MODEL_VALUES as readonly string[]).includes(value);
}

export function isPublicClub(model: OrganisationAccessModel | null | undefined): boolean {
  return model === 'PUBLIC_CLUB';
}

export function isMembershipClub(model: OrganisationAccessModel | null | undefined): boolean {
  return model === 'MEMBERSHIP_CLUB';
}

/**
 * Resolve the effective branch access policy.
 *
 * PUBLIC_CLUB organisation:
 *   the branch access_type is authoritative and unchanged (open/restricted/
 *   invite_only) — perfectly backward compatible with today's behaviour.
 *
 * MEMBERSHIP_CLUB organisation:
 *   every branch is governed by membership rules by default. Branch-level
 *   access_type still applies when it is MORE restrictive than the default
 *   (restricted / invite_only); an otherwise 'open' branch is classified as
 *   'membership_required' so later phases can enforce membership without a
 *   second decision point.
 *
 * NOTE: P0 does not change any existing query (e.g. booking.repository) — this
 * function only CENTRALISES the policy answer. Existing branches are never
 * silently flipped to members-only.
 */
export function resolveBranchAccessPolicy(
  accessModel: OrganisationAccessModel | null | undefined,
  branchAccessType: BranchAccessType | string | null | undefined,
): BranchEffectivePolicy {
  const branchType: BranchAccessType = (BRANCH_ACCESS_TYPE_VALUES as readonly string[]).includes(
    String(branchAccessType ?? ''),
  )
    ? (branchAccessType as BranchAccessType)
    : 'open';

  if (isMembershipClub(accessModel)) {
    if (branchType === 'restricted') return 'restricted';
    if (branchType === 'invite_only') return 'invite_only';
    return 'membership_required';
  }

  // PUBLIC_CLUB (and any unknown/legacy NULL) — preserve current behaviour
  // ('open' branches are effectively fully public).
  if (branchType === 'restricted') return 'restricted';
  if (branchType === 'invite_only') return 'invite_only';
  return 'public';
}