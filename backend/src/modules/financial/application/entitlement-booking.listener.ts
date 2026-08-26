import type mysql from 'mysql2/promise';
import type { EventEnvelope } from '../../../shared/event-bus/event-envelope.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { createSubscriberWorker } from '../../../shared/event-bus/subscriber.worker.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getPool } from '../../../database/mysql.js';
import { bookingRepository } from '../../booking/infrastructure/repositories/booking.repository.js';
import { commissionService } from './commission.service.js';
import { financialEntitlementService } from './financial-entitlement.service.js';
import type { Worker } from 'bullmq';

const log = createModuleLogger('entitlement-booking-listener');

type RowData = mysql.RowDataPacket[];

const SUBSCRIBER_ID_CONFIRMED = 'entitlement-booking-confirmed';
const SUBSCRIBER_ID_REFUNDED = 'entitlement-booking-refunded';

/**
 * Creates financial entitlements when a booking is confirmed (payment collected).
 *
 * For each confirmed booking, two entitlements are created:
 *   1. ORGANIZATION_EARNING — the org's net share (gross - commission - tax)
 *   2. COURTZON_COMMISSION — the platform's commission
 *
 * Entitlements are created in PENDING status with `available_at` calculated from the
 * org's cancellation policy window, so they cannot be activated (and thus settled)
 * before the booking's cancellation period has expired.
 *
 * Registered as a BullMQ subscriber (not in-memory handler) so that:
 *   - Failed entitlement creation is automatically retried (6 attempts, exponential backoff)
 *   - Server crashes between booking confirmation and entitlement creation are recovered
 *     by the outbox poller
 *   - Duplicate processing is prevented by the processed_events idempotency table
 */
export function registerEntitlementBookingSubscribers(): void {
  eventBusV2.subscribe({
    subscriberId: SUBSCRIBER_ID_CONFIRMED,
    eventName: 'booking:confirmed',
    queueName: SUBSCRIBER_ID_CONFIRMED,
    handler: handleBookingConfirmed,
    options: { attempts: 6, backoffDelay: 2000, startingCursor: 'latest' },
  });

  eventBusV2.subscribe({
    subscriberId: SUBSCRIBER_ID_REFUNDED,
    eventName: 'booking:refunded',
    queueName: SUBSCRIBER_ID_REFUNDED,
    handler: handleBookingRefunded,
    options: { attempts: 6, backoffDelay: 2000, startingCursor: 'latest' },
  });

  log.info('Entitlement booking subscribers registered');
}

export function createEntitlementBookingWorkers(): Worker[] {
  return [
    createSubscriberWorker({
      subscriberId: SUBSCRIBER_ID_CONFIRMED,
      queueName: SUBSCRIBER_ID_CONFIRMED,
      handler: handleBookingConfirmed,
      concurrency: 2,
      attempts: 6,
      backoffDelay: 2000,
    }),
    createSubscriberWorker({
      subscriberId: SUBSCRIBER_ID_REFUNDED,
      queueName: SUBSCRIBER_ID_REFUNDED,
      handler: handleBookingRefunded,
      concurrency: 2,
      attempts: 6,
      backoffDelay: 2000,
    }),
  ];
}

export async function handleBookingConfirmed(envelope: EventEnvelope): Promise<void> {
  const data = envelope.payload as any;
  if (!data?.bookingId) return;

  const booking = await bookingRepository.findById(data.bookingId);
  if (!booking) {
    log.error({ bookingId: data.bookingId }, 'Booking not found for entitlement creation');
    return;
  }

  const existing = await financialEntitlementService.getEntitlementsBySource('booking', booking.id);
  if (existing.length > 0) {
    log.info({ bookingId: booking.id }, 'Entitlements already exist — idempotent skip');
    return;
  }

  const orgId = booking.organisation_id;
  if (!orgId) {
    log.warn({ bookingId: booking.id }, 'Booking has no organisation_id — skipping entitlements');
    return;
  }

  const totalAmount = Number(booking.total_amount || 0);
  const taxAmount = Number(booking.tax_amount || 0);
  const grossPayable = totalAmount + taxAmount;

  if (grossPayable <= 0) {
    log.warn({ bookingId: booking.id, grossPayable }, 'Booking has zero/negative gross — skipping entitlements');
    return;
  }

  let commissionAmount = 0;
  try {
    const commResult = await commissionService.calculate(orgId, 'booking', grossPayable);
    commissionAmount = commResult.commissionAmount;
  } catch (err: any) {
    log.error({ err, bookingId: booking.id, orgId }, 'Commission calculation failed — aborting entitlement creation');
    return;
  }

  const orgNetAmount = grossPayable - commissionAmount;

  const availableAt = await resolveCancellationWindow(booking);

  // Determine who collected the money: cash/COD is collected by the org;
  // card/online/wallet is collected by CourtZon.
  const collector: 'courtzon' | 'org' = ['cash', 'cod'].includes(booking.payment_method) ? 'org' : 'courtzon';

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const inputs: any[] = [];

    if (orgNetAmount > 0) {
      inputs.push({
        organisationId: orgId,
        branchId: booking.branch_id ?? null,
        entitlementType: 'ORGANIZATION_EARNING',
        sourceType: 'booking',
        sourceId: booking.id,
        collector,
        amount: orgNetAmount,
        currency: booking.currency || 'EGP',
        availableAt,
        description: `Booking #${booking.id} — org earning`,
        metadata: {
          bookingId: booking.id,
          userId: booking.user_id,
          grossPayable,
          taxAmount,
          commissionAmount,
          orgNetAmount,
        },
      });
    }

    if (commissionAmount > 0) {
      inputs.push({
        organisationId: orgId,
        branchId: booking.branch_id ?? null,
        entitlementType: 'COURTZON_COMMISSION',
        sourceType: 'booking',
        sourceId: booking.id,
        collector,
        amount: commissionAmount,
        currency: booking.currency || 'EGP',
        availableAt,
        description: `Booking #${booking.id} — CourtZon commission`,
        metadata: {
          bookingId: booking.id,
          userId: booking.user_id,
          grossPayable,
          commissionAmount,
        },
      });
    }

    if (inputs.length === 0) {
      await conn.rollback();
      log.info({ bookingId: booking.id }, 'No entitlements to create (zero amounts)');
      return;
    }

    const ids = await financialEntitlementService.createEntitlements(inputs, conn);
    await conn.commit();

    log.info({ bookingId: booking.id, entitlementIds: ids, availableAt }, 'Entitlements created for booking');
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function handleBookingRefunded(envelope: EventEnvelope): Promise<void> {
  const data = envelope.payload as any;
  if (!data?.bookingId) return;

  const cancelled = await financialEntitlementService.cancelBySource(
    'booking',
    data.bookingId,
    `Booking #${data.bookingId} refunded — amount ${data.refundAmount}`,
  );
  if (cancelled > 0) {
    log.info({ bookingId: data.bookingId, cancelled }, 'Entitlements cancelled for refunded booking');
  }
}

/**
 * Resolves the available_at timestamp for a booking's entitlements based on the
 * organisation's cancellation policy window. The entitlement cannot be activated
 * (AVAILABLE) until the cancellation window has passed.
 *
 * Returns null if no policy exists (immediate activation).
 */
async function resolveCancellationWindow(booking: any): Promise<Date | null> {
  const pool = getPool();
  try {
    const [orgRows] = await pool.execute<RowData>(
      `SELECT cancellation_policy_level FROM organisations WHERE id = ?`,
      [booking.organisation_id],
    );

    if (!orgRows.length) return null;

    const org = orgRows[0] as any;
    const policyCol = org.cancellation_policy_level === 'branch' ? 'branch_id' : 'organisation_id';
    const policyId = org.cancellation_policy_level === 'branch' ? booking.branch_id : booking.organisation_id;

    const [polRows] = await pool.execute<RowData>(
      `SELECT MAX(cancellation_window_minutes) as max_window
       FROM cancellation_policies
       WHERE ${policyCol} = ? AND is_active = 1`,
      [policyId],
    );

    const maxWindow = (polRows[0] as any)?.max_window;
    if (!maxWindow) return null;

    const bookingStart = new Date(`${booking.booking_date}T${booking.start_time}`);
    const availableAt = new Date(bookingStart.getTime() - maxWindow * 60 * 1000);

    const now = new Date();
    if (availableAt <= now) return null;

    return availableAt;
  } catch (err) {
    log.warn({ err, bookingId: booking.id, orgId: booking.organisation_id }, 'Failed to resolve cancellation window — defaulting to immediate activation');
    return null;
  }
}
