const ORG_REGISTRATION_EXCLUDED_TYPE_SLUGS = new Set([
  'player',
  'player-seller',
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

function isNonOrganizationPlanName(planName: string): boolean {
  return /player|seller|shop|free\s*sell/i.test(planName);
}

function isApplicableExcluded(
  value: number | string,
  excludedIds: Set<number>,
  excludedSlugs: Set<string>,
): boolean {
  if (typeof value === 'number') return excludedIds.has(value);
  if (typeof value === 'string') return excludedSlugs.has(normalizeOrgTypeSlug(value));
  return false;
}

export function isInternalSubscriptionPlan(
  plan: { is_internal?: number | boolean | null; isInternal?: boolean | null },
): boolean {
  const raw = plan.is_internal ?? plan.isInternal;
  return raw === true || raw === 1;
}

/** Whether a subscription plan may be chosen during organization registration. */
export function isOrganizationRegistrationPlan(
  plan: { plan_name?: string; planName?: string; applicable_org_types?: unknown; is_internal?: number | boolean | null; isInternal?: boolean | null },
  orgTypes: { id: number; slug: string }[],
): boolean {
  if (isInternalSubscriptionPlan(plan)) return false;

  const planName = plan.plan_name ?? plan.planName ?? '';
  if (isNonOrganizationPlanName(planName)) return false;

  let applicable: (number | string)[] = [];
  const raw = plan.applicable_org_types;
  if (Array.isArray(raw)) applicable = raw;
  else if (typeof raw === 'string') {
    try {
      applicable = JSON.parse(raw);
    } catch {
      applicable = [];
    }
  }
  if (!applicable.length) return false;

  const excludedIds = new Set<number>();
  const excludedSlugs = new Set<string>(ORG_REGISTRATION_EXCLUDED_TYPE_SLUGS);
  for (const t of orgTypes) {
    if (isExcludedOrgRegistrationType(t.slug)) {
      excludedIds.add(t.id);
      excludedSlugs.add(normalizeOrgTypeSlug(t.slug));
    }
  }

  if (applicable.some((t) => isApplicableExcluded(t, excludedIds, excludedSlugs))) return false;
  return applicable.some((t) => !isApplicableExcluded(t, excludedIds, excludedSlugs));
}
