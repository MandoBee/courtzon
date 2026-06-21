/** Canonical commission entity keys stored on subscription plans. */
export const CANONICAL_COMMISSION_ENTITIES = [
  'booking',
  'tournament',
  'marketplace',
  'coach_session',
  'academy',
] as const;

export type CommissionEntity = (typeof CANONICAL_COMMISSION_ENTITIES)[number];

const ALIAS_TO_CANONICAL: Record<string, CommissionEntity> = {
  booking: 'booking',
  bookings: 'booking',
  tournament: 'tournament',
  tournaments: 'tournament',
  marketplace: 'marketplace',
  product: 'marketplace',
  products: 'marketplace',
  seller_fees: 'marketplace',
  coach_session: 'coach_session',
  coaching: 'coach_session',
  coaching_session: 'coach_session',
  academy: 'academy',
  academies: 'academy',
};

/** Map UI / legacy entity slugs to the canonical plan-rate key. */
export function normalizeCommissionEntity(entity: string): CommissionEntity | null {
  const key = entity.trim().toLowerCase();
  return ALIAS_TO_CANONICAL[key] ?? null;
}

/** All DB keys that may match a canonical entity (aliases + canonical). */
export function commissionEntityLookupKeys(entityType: string): string[] {
  const canonical = normalizeCommissionEntity(entityType);
  if (!canonical) return [entityType.trim().toLowerCase()];
  const aliases = Object.entries(ALIAS_TO_CANONICAL)
    .filter(([, value]) => value === canonical)
    .map(([alias]) => alias);
  return [...new Set([canonical, ...aliases])];
}
