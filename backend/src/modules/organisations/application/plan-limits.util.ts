import { getFeatureLimit } from './current-subscription.service.js';

/**
 * Read a numeric feature limit from the org's effective subscription plan.
 * Uses plan_snapshot if available, otherwise falls back to live tables.
 *
 * Returns `defaultValue` when:
 *  - the org has no active subscription
 *  - the plan has no matching feature
 *  - the value is not a valid number
 *
 * The value `-1` or the string `"unlimited"` returns `Infinity`.
 */
export async function getPlanNumericLimit(
  orgId: number,
  key: string,
  defaultValue: number,
): Promise<number> {
  return getFeatureLimit(orgId, key, defaultValue);
}
