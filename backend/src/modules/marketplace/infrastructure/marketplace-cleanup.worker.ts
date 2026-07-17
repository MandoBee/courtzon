import { marketplaceService } from '../application/marketplace.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('marketplace-cleanup');

export async function handleCancelAbandonedOrders(data: { timeoutMinutes?: number }): Promise<void> {
  const timeout = data.timeoutMinutes ?? 30;
  log.info({ timeout }, 'Marketplace cleanup: cancelling abandoned pending orders');
  const result = await marketplaceService.cancelAbandonedOrders(timeout);
  log.info({ result }, 'Marketplace cleanup: completed');
}
