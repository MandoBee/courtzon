import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { membershipSubscriptionService } from './membership-subscription.service.js';

const log = createModuleLogger('membership-p1-lifecycle');

let registered = false;

/**
 * G11.22 P1 — finalise a membership subscription once its FULL payment is
 * confirmed. Reacts to the SAME `payment:succeeded` event the accounting
 * engine listens to (dispatched by the payment module on webhook, and by the
 * membership module on operator cash/card confirmation). Filtered by
 * reference_type == 'membership_subscription'. Idempotent.
 */
export function registerMembershipP1Lifecycle(): void {
  if (registered) {
    log.info('Membership P1 lifecycle listeners already registered — skip');
    return;
  }
  registered = true;

  eventBusV2.on('payment:succeeded', async (data: any) => {
    try {
      if (data?.referenceType !== 'membership_subscription') return;
      const referenceId = Number(data.referenceId);
      const paymentMethod = String(data?.metadata?.paymentMethod || 'card');
      if (!referenceId) return;
      await membershipSubscriptionService.finalizePaidSubscription(referenceId, paymentMethod);
    } catch (err) {
      log.error({ err, data }, 'membership:payment:succeeded handler failed');
    }
  });

  log.info('Membership P1 lifecycle listeners registered');
}