/**
 * Centralized subscription validity rules.
 *
 * A subscription is considered "active" (valid for transactional use) when:
 *   - subscription_status = 'active'
 *   - end_date IS NULL OR end_date >= CURDATE()
 *
 * Every query that checks subscription validity should use these helpers
 * so that the business rule is defined in exactly one place.
 */

/**
 * SQL fragment for the WHERE clause that defines an active subscription.
 * Use in queries like:
 *   SELECT ... FROM organisation_subscriptions os
 *   WHERE os.organisation_id = ? AND ${activeSubscriptionCondition('os')}
 *
 * @param alias - the table alias (e.g., 'os', 'sub')
 */
export function activeSubscriptionCondition(alias: string): string {
  return `${alias}.subscription_status = 'active' AND (${alias}.end_date IS NULL OR ${alias}.end_date >= CURDATE())`;
}

/**
 * SQL fragment for the WHERE clause that includes both active and pending
 * subscriptions (useful for admin displays) while still checking end_date.
 */
export function nonExpiredSubscriptionCondition(alias: string): string {
  return `${alias}.subscription_status IN ('active', 'pending') AND (${alias}.end_date IS NULL OR ${alias}.end_date >= CURDATE())`;
}

/**
 * Runtime check: validates whether a subscription row object is currently active.
 * Use this in application/TypeScript code rather than re-implementing the logic.
 *
 * @param sub - a subscription row (or partial) with subscription_status and end_date
 */
export function isSubscriptionActive(sub: { subscription_status?: string; end_date?: Date | string | null } | null | undefined): boolean {
  if (!sub) return false;
  if (sub.subscription_status !== 'active') return false;

  if (sub.end_date != null) {
    const end = typeof sub.end_date === 'string' ? new Date(sub.end_date) : sub.end_date;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (end < today) return false;
  }

  return true;
}


