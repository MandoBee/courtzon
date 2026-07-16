import { eventBus } from '../../../shared/event-bus/index.js';
import { marketplaceService } from './marketplace.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('marketplace-payment-listener');

export function registerMarketplacePaymentListeners() {
  eventBus.on('payment:succeeded', async (data) => {
    if (data.referenceType !== 'order') return;
    log.info({ paymentId: data.paymentId, orderId: data.referenceId }, 'Marketplace: payment succeeded');
    try {
      await marketplaceService.handlePaymentSucceeded(data);
    } catch (err) {
      log.error({ err, paymentId: data.paymentId, orderId: data.referenceId }, 'Marketplace: payment succeeded handler failed');
    }
  });

  eventBus.on('payment:failed-event', async (data) => {
    if (data.referenceType !== 'order') return;
    log.info({ paymentId: data.paymentId, orderId: data.referenceId, reason: data.reason }, 'Marketplace: payment failed');
    try {
      await marketplaceService.handlePaymentFailed(data);
    } catch (err) {
      log.error({ err, paymentId: data.paymentId, orderId: data.referenceId }, 'Marketplace: payment failed handler failed');
    }
  });

  log.info('Marketplace payment listeners registered');
}
