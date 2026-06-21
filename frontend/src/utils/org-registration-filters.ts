/** Org types and plans that must not appear on organization registration. */
export const ORG_REGISTRATION_EXCLUDED_TYPE_SLUGS = new Set([
  'player',
  'shop',
  'player_seller',
  'shop',
  'seller',
]);

export function normalizeOrgTypeSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/_/g, '-');
}

export function isExcludedOrgRegistrationType(slug: string): boolean {
  return ORG_REGISTRATION_EXCLUDED_TYPE_SLUGS.has(normalizeOrgTypeSlug(slug));
}

export function filterOrgRegistrationTypes<T extends { slug: string }>(types: T[]): T[] {
  return types.filter((t) => !isExcludedOrgRegistrationType(t.slug));
}

type ApplicableOrgType = number | string;

function buildExclusionSets(allOrgTypes: { id: number; slug: string }[]) {
  const excludedIds = new Set<number>();
  const excludedSlugs = new Set<string>(ORG_REGISTRATION_EXCLUDED_TYPE_SLUGS);
  for (const t of allOrgTypes) {
    if (isExcludedOrgRegistrationType(t.slug)) {
      excludedIds.add(t.id);
      excludedSlugs.add(normalizeOrgTypeSlug(t.slug));
    }
  }
  return { excludedIds, excludedSlugs };
}

function isApplicableExcluded(
  value: ApplicableOrgType,
  excludedIds: Set<number>,
  excludedSlugs: Set<string>,
): boolean {
  if (typeof value === 'number') return excludedIds.has(value);
  if (typeof value === 'string') return excludedSlugs.has(normalizeOrgTypeSlug(value));
  return false;
}

/** Plans aimed at players, sellers, or shops — not organization facilities. */
function isNonOrganizationPlanName(planName?: string): boolean {
  if (!planName) return false;
  return /player|seller|shop|free\s*sell/i.test(planName);
}

export function filterOrgRegistrationPlans<
  T extends { planName?: string; applicableOrgTypes?: ApplicableOrgType[] },
>(plans: T[], allOrgTypes: { id: number; slug: string }[]): T[] {
  const { excludedIds, excludedSlugs } = buildExclusionSets(allOrgTypes);
  return plans.filter((plan) => {
    if (isNonOrganizationPlanName(plan.planName)) return false;
    const applicable = plan.applicableOrgTypes;
    if (!applicable?.length) return false;
    if (applicable.some((t) => isApplicableExcluded(t, excludedIds, excludedSlugs))) {
      return false;
    }
    return applicable.some((t) => !isApplicableExcluded(t, excludedIds, excludedSlugs));
  });
}
