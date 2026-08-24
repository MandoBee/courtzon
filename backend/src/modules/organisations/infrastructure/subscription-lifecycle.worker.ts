import { activateDueRenewals, expireSubscriptions, sendExpirationReminders } from '../application/subscription-lifecycle.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('subscription-lifecycle-worker');

/**
 * Promotion MUST run before expiry: a renewal chained to start exactly on the
 * day after the previous period ends takes over the moment the old period
 * would expire, so the org never observes an "expired" gap for a paid period.
 */
export async function handleExpireSubscriptions(): Promise<void> {
  log.info('Subscription lifecycle worker started (promote due renewals, then expire)');
  const promoted = await activateDueRenewals();
  const result = await expireSubscriptions();
  log.info({ promoted, expired: result.expired }, 'Subscription lifecycle worker completed');
}

export async function handleSendExpirationReminders(): Promise<void> {
  log.info('Subscription reminder worker started');
  const result = await sendExpirationReminders();
  log.info({ result }, 'Subscription reminder worker completed');
}
