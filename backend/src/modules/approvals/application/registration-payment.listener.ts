import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getSubscriptionRequestById } from '../../organisations/infrastructure/repositories/org-portal.repository.js';

const log = createModuleLogger('registration-payment-listener');

export function registerRegistrationPaymentListeners() {
  eventBusV2.on('payment:succeeded', async (data) => {
    if (data.referenceType !== 'subscription') return;
    const requestId = data.referenceId;
    if (!requestId) {
      log.error({ paymentId: data.paymentId }, 'Subscription payment succeeded but no upgrade request reference');
      return;
    }

    log.info({ paymentId: data.paymentId, requestId }, 'Subscription payment succeeded — activating subscription');
    try {
      const request = await getSubscriptionRequestById(requestId);
      if (!request) {
        log.warn({ requestId }, 'Upgrade request not found for subscription payment');
        return;
      }
      if (request.status === 'rejected' || request.status === 'cancelled') {
        log.info({ requestId, status: request.status }, 'Upgrade request already rejected/cancelled — skip');
        return;
      }
      // Idempotent: the activation mechanism accepts pending OR already-approved requests so a
      // payment arriving after an earlier approval can still complete activation exactly once.

      // Registration flows ('seller' / 'organization') must activate the ORGANISATION
      // itself (is_verified + is_active) in addition to the subscription — a successful
      // card payment never requires manual admin approval. Other request types
      // (upgrade / plan change / renewal) only need the subscription activated.
      if (request.registration_type === 'seller' || request.registration_type === 'organization') {
        const { approvalService } = await import('../../approvals/application/approval.service.js');
        await approvalService.approveRegistration(request.requested_by, requestId);
        log.info({ requestId, orgId: request.organisation_id, type: request.registration_type }, 'Registration activated via card payment');
      } else {
        // General org subscription (upgrade / plan change / renewal) — activate immediately on payment.
        const { tryActivateSubscriptionRequest } = await import('../../organisations/application/subscription-activation.service.js');
        await tryActivateSubscriptionRequest(requestId, { adminId: null, approvalNotes: 'Auto-approved after card payment' });
        log.info({ requestId, orgId: request.organisation_id }, 'Org subscription activated via card payment');
      }
    } catch (err: any) {
      log.error({ err, paymentId: data.paymentId, requestId }, 'Subscription activation failed on payment succeeded');
    }
  });

  for (const eventName of ['payment:failed-event', 'payment:cancelled-event', 'payment:expired-event'] as const) {
    eventBusV2.on(eventName, async (data) => {
      if (data.referenceType !== 'subscription') return;
      const requestId = data.referenceId;
      if (!requestId) return;
      log.warn({ eventName, paymentId: data.paymentId, requestId }, 'Subscription payment did not complete — request stays pending for admin review');
    });
  }

  log.info('Registration payment listeners registered');
}
