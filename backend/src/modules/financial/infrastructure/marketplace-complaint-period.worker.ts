import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { financialEntitlementService } from '../application/financial-entitlement.service.js';

const log = createModuleLogger('marketplace-complaint-period');

type RowData = import('mysql2/promise').RowDataPacket[];

const CONFIG_ID = 1;
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
 * This is the ONLY activation path for marketplace entitlements — the generic
 * activation worker explicitly skips marketplace rows with NULL available_at.
 * Recovery is inherent: each run re-scans delivered orders, so a missed run or
 * crash is repaired on the next cycle.
 */
export async function handleComplaintPeriodActivation(): Promise<void> {
  const periodDays = await resolveComplaintPeriodDays();
  if (periodDays < 0) {
    log.warn('Complaint period config missing — marketplace entitlements will not be activated');
    return;
  }

  const activated = await financialEntitlementService.activateMarketplaceEligible(periodDays, BATCH_SIZE);
  if (activated > 0) {
    log.info({ activated, periodDays }, 'Marketplace complaint-period activation completed');
  }
}

/**
 * Reads the platform-wide complaint window in days. Returns -1 when the config
 * row is absent (activation deferred until configured), or 0 when the window is
 * explicitly disabled (activation happens immediately on delivery).
 */
async function resolveComplaintPeriodDays(): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT complaint_period_days, is_active
     FROM marketplace_complaint_config
     WHERE id = ?`,
    [CONFIG_ID],
  );
  if (!rows.length) return -1;
  const config = rows[0] as any;
  if (!config.is_active) return 0;
  return Number(config.complaint_period_days || 0);
}