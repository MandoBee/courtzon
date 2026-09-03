import type mysql from 'mysql2/promise';
import type { EventEnvelope } from '../../../shared/event-bus/event-envelope.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { createSubscriberWorker } from '../../../shared/event-bus/subscriber.worker.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getPool } from '../../../database/mysql.js';
import { marketplaceRepository } from '../../marketplace/infrastructure/repositories/marketplace.repository.js';
import { financialEntitlementService } from './financial-entitlement.service.js';
import { buildEntitlementInputs } from './marketplace-entitlement-calc.js';
import { getMarketplaceComplaintPeriodDays } from './complaint-period.config.js';
import type { Worker } from 'bullmq';

const log = createModuleLogger('entitlement-marketplace-listener');

type RowData = mysql.RowDataPacket[];

const SUBSCRIBER_ID_CONFIRMED = 'entitlement-marketplace-confirmed';
const SUBSCRIBER_ID_REFUNDED = 'entitlement-marketplace-refunded';
const SUBSCRIBER_ID_CANCELLED = 'entitlement-marketplace-cancelled';
const SUBSCRIBER_ID_DELIVERED = 'entitlement-marketplace-delivered';

const BATCH_SIZE = 200;

/**
 * Creates financial entitlements when a marketplace order is confirmed
 * (financial snapshot written), and cancels them when the order is refunded
 * or cancelled.
 *
 * Granularity: per order_item (source_id = order_items.id). Each confirmed item
 * creates two entitlements:
 *   1. ORGANIZATION_EARNING — the seller org's net share (product − discount −
 *      commission, plus proportional shipping and tax allocation)
 *   2. COURTZON_COMMISSION — the platform's commission on that item
 *
 * Entitlements are created in PENDING status with `available_at = NULL`. The
 * generic activation worker skips marketplace entitlements with NULL available_at;
 * they are activated only by the complaint-period worker after the delivery
 * complaint window has passed.
 *
 * Registered as a BullMQ subscriber (same reliability pattern as booking) so
 * failed creation is retried and crashes are recovered via the outbox poller.
 */
export function registerEntitlementMarketplaceSubscribers(): void {
  eventBusV2.subscribe({
    subscriberId: SUBSCRIBER_ID_CONFIRMED,
    eventName: 'marketplace:order-confirmed',
    queueName: SUBSCRIBER_ID_CONFIRMED,
    handler: handleMarketplaceOrderConfirmed,
    options: { attempts: 6, backoffDelay: 2000, startingCursor: 'latest' },
  });

  eventBusV2.subscribe({
    subscriberId: SUBSCRIBER_ID_REFUNDED,
    eventName: 'marketplace:order-refunded',
    queueName: SUBSCRIBER_ID_REFUNDED,
    handler: handleMarketplaceOrderRefunded,
    options: { attempts: 6, backoffDelay: 2000, startingCursor: 'latest' },
  });

  eventBusV2.subscribe({
    subscriberId: SUBSCRIBER_ID_CANCELLED,
    eventName: 'marketplace:order-cancelled',
    queueName: SUBSCRIBER_ID_CANCELLED,
    handler: handleMarketplaceOrderCancelled,
    options: { attempts: 6, backoffDelay: 2000, startingCursor: 'latest' },
  });

  eventBusV2.subscribe({
    subscriberId: SUBSCRIBER_ID_DELIVERED,
    eventName: 'marketplace:order-delivered',
    queueName: SUBSCRIBER_ID_DELIVERED,
    handler: handleMarketplaceOrderDelivered,
    options: { attempts: 6, backoffDelay: 2000, startingCursor: 'latest' },
  });

  log.info('Entitlement marketplace subscribers registered');
}

export function createEntitlementMarketplaceWorkers(): Worker[] {
  return [
    createSubscriberWorker({
      subscriberId: SUBSCRIBER_ID_CONFIRMED,
      queueName: SUBSCRIBER_ID_CONFIRMED,
      handler: handleMarketplaceOrderConfirmed,
      concurrency: 2,
      attempts: 6,
      backoffDelay: 2000,
    }),
    createSubscriberWorker({
      subscriberId: SUBSCRIBER_ID_REFUNDED,
      queueName: SUBSCRIBER_ID_REFUNDED,
      handler: handleMarketplaceOrderRefunded,
      concurrency: 2,
      attempts: 6,
      backoffDelay: 2000,
    }),
    createSubscriberWorker({
      subscriberId: SUBSCRIBER_ID_CANCELLED,
      queueName: SUBSCRIBER_ID_CANCELLED,
      handler: handleMarketplaceOrderCancelled,
      concurrency: 2,
      attempts: 6,
      backoffDelay: 2000,
    }),
    createSubscriberWorker({
      subscriberId: SUBSCRIBER_ID_DELIVERED,
      queueName: SUBSCRIBER_ID_DELIVERED,
      handler: handleMarketplaceOrderDelivered,
      concurrency: 2,
      attempts: 6,
      backoffDelay: 2000,
    }),
  ];
}

export async function handleMarketplaceOrderConfirmed(envelope: EventEnvelope): Promise<void> {
  const data = envelope.payload as any;
  if (!data?.orderId) return;

  const rows = await marketplaceRepository.findOrderById(data.orderId);
  if (!rows?.length) {
    log.error({ orderId: data.orderId }, 'Order not found for entitlement creation');
    return;
  }

  const order = rows[0] as any;
  if (order.status !== 'confirmed') {
    log.warn({ orderId: data.orderId, status: order.status }, 'Order not confirmed — skipping entitlement creation');
    return;
  }

  const itemIds: number[] = [];
  const items: any[] = [];
  for (const row of rows as any[]) {
    if (!row.item_id || !row.item_seller_id) continue;
    itemIds.push(row.item_id);
    items.push(row);
  }

  if (!itemIds.length) {
    log.warn({ orderId: data.orderId }, 'Order has no sellable items — skipping entitlements');
    return;
  }

  const existing = await financialEntitlementService.getEntitlementsBySourceIds('marketplace', itemIds);
  if (existing.length > 0) {
    log.info({ orderId: data.orderId }, 'Marketplace entitlements already exist — idempotent skip');
    return;
  }

  const inputs = buildEntitlementInputs(order, items, order.cash_holder === 'org' ? 'org' : 'courtzon');
  if (!inputs.length) {
    log.warn({ orderId: data.orderId }, 'No positive entitlement amounts computed — skipping');
    return;
  }

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const ids = await financialEntitlementService.createEntitlements(inputs, conn);
    await conn.commit();
    log.info({ orderId: data.orderId, entitlementIds: ids, count: ids.length }, 'Marketplace entitlements created');
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Activates marketplace financial entitlements immediately when an order is
 * marked delivered. Reuses the SAME canonical idempotent activation as the
 * periodic complaint-period worker (`activateMarketplaceEligible`): it scans
 * PENDING marketplace entitlements whose order is delivered and whose delivery
 * complaint window has passed, and transitions them to AVAILABLE.
 *
 * This removes the up-to-5-minute wait caused by the scheduled worker while
 * keeping the worker as an idempotent recovery fallback (batch activation only
 * touches PENDING rows, so a concurrent/duplicate run is always safe). Each
 * activated entitlement emits `entitlement:activated`, which the realtime
 * publisher forwards to the owning organisation + finance rooms.
 */
export async function handleMarketplaceOrderDelivered(envelope: EventEnvelope): Promise<void> {
  const data = envelope.payload as any;
  if (!data?.orderId) return;

  try {
    const periodDays = await getMarketplaceComplaintPeriodDays();
    const activated = await financialEntitlementService.activateMarketplaceEligible(periodDays, BATCH_SIZE);
    if (activated > 0) {
      log.info({ orderId: data.orderId, activated, periodDays }, 'Marketplace entitlements activated on order delivered');
    }
  } catch (err: any) {
    // Activation is idempotent and re-scanned by the periodic worker and the
    // BullMQ retry/outbox machinery — do not leave state half-handled by a
    // transient failure; let a later retry re-run it.
    log.error({ err, orderId: data.orderId }, 'Failed to activate marketplace entitlements on delivered');
    throw err;
  }
}

async function handleMarketplaceOrderRefunded(envelope: EventEnvelope): Promise<void> {
  await cancelEntitlementsForOrder(envelope, 'refunded');
}

async function handleMarketplaceOrderCancelled(envelope: EventEnvelope): Promise<void> {
  await cancelEntitlementsForOrder(envelope, 'cancelled');
}

async function cancelEntitlementsForOrder(envelope: EventEnvelope, action: 'refunded' | 'cancelled'): Promise<void> {
  const data = envelope.payload as any;
  if (!data?.orderId) return;

  const rows = await marketplaceRepository.findOrderById(data.orderId);
  const itemIds = (rows as any[] || [])
    .map((r: any) => r.item_id)
    .filter((id: any) => typeof id === 'number');

  const reason = data.reason || `Order #${data.orderId} ${action}`;
  const cancelled = await financialEntitlementService.cancelBySourceIds('marketplace', itemIds, reason);
  if (cancelled > 0) {
    log.info({ orderId: data.orderId, cancelled }, `Marketplace entitlements cancelled (${action})`);
  }
}