import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { financialEntitlementRepository } from '../infrastructure/repositories/financial-entitlement.repository.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';

const log = createModuleLogger('entitlement-activation');

/**
 * Scheduled BullMQ worker: activates PENDING entitlements whose available_at
 * window has passed (or is NULL = immediate activation).
 *
 * Runs every 5 minutes via the default queue.
 * Batch-limited to 200 to avoid long-running transactions.
 */
export async function handleActivateEntitlements(): Promise<void> {
  const pending = await financialEntitlementRepository.findPendingForActivation(200);
  if (!pending.length) return;

  const ids = pending.map(e => e.id);
  const activated = await financialEntitlementRepository.batchActivate(ids);

  for (const e of pending) {
    try {
      eventBusV2.emit('entitlement:activated', {
        entitlementId: e.id,
        publicId: e.public_id,
        organisationId: e.organisation_id,
        entitlementType: e.entitlement_type,
        sourceType: e.source_type,
        sourceId: e.source_id,
        amount: e.amount,
        currency: e.currency,
      } as any);
    } catch (err) {
      log.error({ err, entitlementId: e.id }, 'Failed to emit entitlement:activated event');
    }
  }

  log.info({ activated }, `Activated ${activated} pending entitlements`);
}
