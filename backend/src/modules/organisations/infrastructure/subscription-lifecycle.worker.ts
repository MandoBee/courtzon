import { expireSubscriptions, sendExpirationReminders } from '../application/subscription-lifecycle.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('subscription-lifecycle-worker');

export async function handleExpireSubscriptions(): Promise<void> {
  log.info('Subscription expiry worker started');
  const result = await expireSubscriptions();
  log.info({ result }, 'Subscription expiry worker completed');
}

export async function handleSendExpirationReminders(): Promise<void> {
  log.info('Subscription reminder worker started');
  const result = await sendExpirationReminders();
  log.info({ result }, 'Subscription reminder worker completed');
}
