/**
 * Subscription status presentation mapping.
 *
 * The database `organisation_subscriptions.subscription_status` enum stores
 * lifecycle states: 'active', 'expired', 'cancelled', 'pending', 'suspended'.
 *
 * The visible business model exposes two primary states — Active and Suspended:
 *   - 'active'    → Active   (subscription enabled)
 *   - 'suspended' → Suspended (admin-suspended subscription)
 *
 * 'pending' is a WORKFLOW state (awaiting activation/payment/approval), surfaced
 * contextually through the subscription-request flow — it is NOT a permanent
 * Subscription Status and must never be mislabeled as Suspended.
 *
 * 'expired' and 'cancelled' are terminal states shown as-is.
 */

export type SubscriptionStatusLabel = 'Active' | 'Suspended' | 'Pending' | 'Expired' | 'Cancelled' | 'No Subscription';

export function subscriptionStatusLabel(status: string | null | undefined): SubscriptionStatusLabel {
  switch (status) {
    case 'active':
      return 'Active';
    case 'suspended':
      return 'Suspended';
    case 'pending':
      return 'Pending';
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

