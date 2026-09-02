import { systemSettingsService } from '../../admin/application/system-settings.service.js';

/**
 * CANONICAL marketplace complaint-period configuration.
 *
 * The marketplace complaint period is the number of days after an order is
 * delivered during which the buyer may submit a complaint. While it is open:
 *   - buyer complaints are accepted (marketplace-complaint.service), and
 *   - the order item's marketplace entitlements stay PENDING (not yet
 *     settlement-eligible).
 * Once `delivered_at + complaint_period_days` has passed, the complaint-period
 * activation worker transitions those entitlements to AVAILABLE.
 *
 * The value is stored ONCE in `system_settings` under
 * `marketplace.complaint_period_days` (admin-controllable via the existing
 * System Admin → Settings screen, RBAC `app-settings.view`/`app-settings.edit`).
 * Every code path that needs the complaint window MUST read it through
 * `getMarketplaceComplaintPeriodDays()` — never a hardcoded literal.
 */
const MARKETPLACE_COMPLAINT_PERIOD_KEY = 'marketplace.complaint_period_days';
export const DEFAULT_MARKETPLACE_COMPLAINT_PERIOD_DAYS = 7;

export async function getMarketplaceComplaintPeriodDays(): Promise<number> {
  return systemSettingsService.getInt(MARKETPLACE_COMPLAINT_PERIOD_KEY, DEFAULT_MARKETPLACE_COMPLAINT_PERIOD_DAYS);
}