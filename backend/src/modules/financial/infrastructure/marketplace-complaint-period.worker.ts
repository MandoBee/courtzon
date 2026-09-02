import { createModuleLogger } from '../../../shared/utils/logger.js';
import { financialEntitlementService } from '../application/financial-entitlement.service.js';
import { getMarketplaceComplaintPeriodDays } from '../application/complaint-period.config.js';

const log = createModuleLogger('marketplace-complaint-period');

const BATCH_SIZE = 200;

/**
 * Scheduled BullMQ worker: activates marketplace financial entitlements once the
 * delivery complaint window has passed.
 *
 * Runs every 5 minutes via the default queue. For each delivered order whose
 * `delivered_at + complaint_period_days` has passed, all still-PENDING item
 * entitlements are transitioned to AVAILABLE (via the shared batch activation),
 * making them eligible for settlement.
 *
 * The complaint period is read from the canonical admin-controlled system
 * setting `marketplace.complaint_period_days` (default 7). This is the ONLY
 * activation path for marketplace entitlements — the generic activation worker
 * explicitly skips marketplace rows with NULL available_at. Recovery is
 * inherent: each run re-scans delivered orders, so a missed run or crash is
 * repaired on the next cycle.
 */
export async function handleComplaintPeriodActivation(): Promise<void> {
  const periodDays = await getMarketplaceComplaintPeriodDays();

  const activated = await financialEntitlementService.activateMarketplaceEligible(periodDays, BATCH_SIZE);
  if (activated > 0) {
    log.info({ activated, periodDays }, 'Marketplace complaint-period activation completed');
  }
}