/**
 * Subscription status presentation mapping.
 *
 * The database `organisation_subscriptions.subscription_status` enum stores
 * lifecycle/workflow states ('active', 'pending', 'expired', 'cancelled').
 * The visible business model exposes only two primary states — Active and
 * Suspended. 'pending' is used internally for both "awaiting activation"
 * (workflow — surfaced via the subscription-request flow) and "suspended by
 * admin", so it is presented as Suspended here. Transient/terminal states
 * (expired, cancelled) are kept as-is.
 */

export type SubscriptionStatusLabel = 'Active' | 'Suspended' | 'Expired' | 'Cancelled' | 'No Subscription';

export function subscriptionStatusLabel(status: string | null | undefined): SubscriptionStatusLabel {
  switch (status) {
    case 'active':
      return 'Active';
    case 'pending':
      return 'Suspended';
    case 'expired':
      return 'Expired';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'No Subscription';
  }
}

/** Whether a raw subscription_status represents the enabled (active) state. */
export function isSubscriptionEnabled(status: string | null | undefined): boolean {
  return status === 'active';
}
