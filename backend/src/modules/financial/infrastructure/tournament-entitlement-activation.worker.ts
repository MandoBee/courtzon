import { createModuleLogger } from '../../../shared/utils/logger.js';
import { financialEntitlementService } from '../application/financial-entitlement.service.js';

const log = createModuleLogger('tournament-entitlement-activation');

const BATCH_SIZE = 200;

/**
 * G11.4 — scheduled activation of TOURNAMENT financial entitlements.
 *
 * Tournament entitlements are created PENDING with `available_at = NULL`, and
 * that NULL deliberately does NOT mean "immediately available": the release
 * condition is a BUSINESS EVENT, not a clock. The generic entitlement activation
 * worker explicitly skips `source_type = 'tournament'` for exactly that reason.
 *
 * This worker is the ONLY activation path for tournament entitlements, and it
 * applies the two custody-correct release conditions:
 *
 *   CARD (collector 'courtzon')
 *     → activate only once the backing payment owns an ACTIVE gateway
 *       settlement. Customer Paid ≠ Gateway Settled: until the batch is
 *       recorded the money is still in 1100 Payment Clearing, and paying the org
 *       then would overdraw the bank leg.
 *
 *   CASH (collector 'org')
 *     → activate only once the tournament's CURRENT draw is LOCKED
 *       (`is_current = 1 AND status = 'locked'`), the same authoritative
 *       "refunds are closed" state G11.3 uses as its refund cutoff. Cash never
 *       touches the gateway, and a tournament with no current locked draw fails
 *       closed (the entitlement simply stays PENDING).
 *
 * Runs every 5 minutes on the default queue. Idempotent and crash-safe: each run
 * re-scans, only PENDING rows are matched, and the bulk activation is a guarded
 * `WHERE status = 'PENDING'` UPDATE — so a missed run or a duplicated trigger is
 * repaired by the next cycle and can never double-activate.
 */
export async function handleTournamentEntitlementActivation(): Promise<void> {
  const cardActivated = await financialEntitlementService.activateTournamentEligible('card', BATCH_SIZE);
  const cashActivated = await financialEntitlementService.activateTournamentEligible('cash', BATCH_SIZE);

  if (cardActivated > 0 || cashActivated > 0) {
    log.info({ cardActivated, cashActivated }, 'Tournament entitlement activation completed');
  }
}
