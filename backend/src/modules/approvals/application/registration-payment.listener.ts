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

    log.info({ paymentId: data.paymentId, requestId }, 'Subscription payment succeeded — approving seller registration');
    try {
      const request = await getSubscriptionRequestById(requestId);
      if (!request) {
        log.warn({ requestId }, 'Upgrade request not found for subscription payment');
        return;
      }
      if (request.status !== 'pending') {
        log.info({ requestId, status: request.status }, 'Upgrade request not pending — idempotent skip');
        return;
      }
      if (request.registration_type !== 'seller') {
        log.warn({ requestId, registrationType: request.registration_type }, 'Subscription payment for non-seller request — skipping');
        return;
      }

      const { approvalService } = await import('../../approvals/application/approval.service.js');
      await approvalService.approveRegistration(request.requested_by, requestId);
      log.info({ requestId, orgId: request.organisation_id }, 'Seller registration auto-approved via card payment');
    } catch (err: any) {
      log.error({ err, paymentId: data.paymentId, requestId }, 'Seller registration approval failed on payment succeeded');
    }
  });

  for (const eventName of ['payment:failed-event', 'payment:cancelled-event', 'payment:expired-event'] as const) {
    eventBusV2.on(eventName, async (data) => {
      if (data.referenceType !== 'subscription') return;
      const requestId = data.referenceId;
      if (!requestId) return;
      log.warn({ eventName, paymentId: data.paymentId, requestId }, 'Seller registration payment did not complete — request stays pending for admin review');
    });
  }

  log.info('Registration payment listeners registered');
}
