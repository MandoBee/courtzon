import { createModuleLogger } from '../../../shared/utils/logger.js';
import { membershipLifecycleService } from '../application/membership-lifecycle.service.js';

const log = createModuleLogger('membership-subscription-lifecycle-worker');

/**
 * G11.22 P2 — scheduled workers for membership_SUBSCRIPTION lifecycle
 * (separate from the legacy user_memberships worker).
 *
 *   handleMembershipSubscriptionExpiry      daily — expire subscriptions whose
 *                                           term AND grace ended; emit
 *                                           grace-started on the day the
 *                                           grace window opens.
 *   handleMembershipInstallmentOverdue      daily — mark pending installments
 *                                           overdue (never touches status).
 *   handleMembershipSubscriptionReminders   daily — renewal / grace-ending /
 *                                           installment-due reminders.
 */
export async function handleMembershipSubscriptionExpiry(): Promise<void> {
  try {
    const result = await membershipLifecycleService.processExpiry();
    if (result.expired || result.inGrace) {
      log.info({ result }, 'Membership subscription expiry sweep finished');
    }
  } catch (err) {
    log.error({ err }, 'Membership subscription expiry job failed');
  }
}

export async function handleMembershipInstallmentOverdue(): Promise<void> {
  try {
    const marked = await membershipLifecycleService.processOverdue();
    if (marked) log.info({ marked }, 'Membership installment overdue sweep finished');
  } catch (err) {
    log.error({ err }, 'Membership installment overdue job failed');
  }
}

export async function handleMembershipSubscriptionReminders(): Promise<void> {
  try {
    const emitted = await membershipLifecycleService.processReminders();
    if (emitted) log.info({ emitted }, 'Membership subscription reminders dispatched');
  } catch (err) {
    log.error({ err }, 'Membership subscription reminders job failed');
  }
}