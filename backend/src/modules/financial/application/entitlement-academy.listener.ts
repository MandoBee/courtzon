import type mysql from 'mysql2/promise';
import type { EventEnvelope } from '../../../shared/event-bus/event-envelope.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { createSubscriberWorker } from '../../../shared/event-bus/subscriber.worker.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getPool } from '../../../database/mysql.js';
import { academyPaymentRepository } from '../../academy/infrastructure/repositories/academy-payment.repository.js';
import { financialEntitlementService } from './financial-entitlement.service.js';
import type { Worker } from 'bullmq';

const log = createModuleLogger('entitlement-academy-listener');

type RowData = mysql.RowDataPacket[];

const SUBSCRIBER_ID = 'entitlement-academy-paid';

/**
 * Creates financial entitlements when an academy enrollment is paid.
 *
 * The economics are read EXCLUSIVELY from the immutable `academy_enrollment_payments`
 * snapshot (G8) — never recomputed from live data:
 *   1. ORGANIZATION_EARNING — the org's net share (gross − commission)
 *   2. COURTZON_COMMISSION — the platform's commission
 *
 * Entitlements are created in PENDING status with `available_at` derived from
 * the org's cancellation policy window (mirroring booking), so they cannot be
 * activated/settled before the program's cancellation period has expired.
 *
 * Registered as a BullMQ subscriber (not in-memory handler) so that:
 *   - Failed entitlement creation is automatically retried (6 attempts, backoff)
 *   - Server crashes between payment and entitlement creation are recovered by
 *     the outbox poller
 *   - Duplicate processing is prevented by the processed_events idempotency table
 */
export function registerEntitlementAcademySubscribers(): void {
  eventBusV2.subscribe({
    subscriberId: SUBSCRIBER_ID,
    eventName: 'academy:enrollment-paid',
    queueName: SUBSCRIBER_ID,
    handler: handleAcademyEnrollmentPaid,
    options: { attempts: 6, backoffDelay: 2000, startingCursor: 'latest' },
  });

  log.info('Entitlement academy subscriber registered');
}

export function createEntitlementAcademyWorkers(): Worker[] {
  return [
    createSubscriberWorker({
      subscriberId: SUBSCRIBER_ID,
      queueName: SUBSCRIBER_ID,
      handler: handleAcademyEnrollmentPaid,
      concurrency: 2,
      attempts: 6,
      backoffDelay: 2000,
    }),
  ];
}

export async function handleAcademyEnrollmentPaid(envelope: EventEnvelope): Promise<void> {
  const data = envelope.payload as any;
  if (!data?.enrollmentId) return;

  const snapshot = await academyPaymentRepository.getSnapshotByEnrollment(data.enrollmentId);
  if (!snapshot?.id) {
    // The snapshot is the single source of academy economics. If it is missing
    // the payment is not yet fully recorded — rethrow so the durable subscriber
    // retries; if it is permanently absent the job dead-letters for inspection.
    log.error({ enrollmentId: data.enrollmentId }, 'Academy snapshot missing for entitlement creation');
    throw new Error(`Academy snapshot missing for enrollment ${data.enrollmentId}`);
  }

  const existing = await financialEntitlementService.getEntitlementsBySource('academy', snapshot.enrollment_id);
  if (existing.length > 0) {
    log.info({ enrollmentId: snapshot.enrollment_id }, 'Academy entitlements already exist — idempotent skip');
    return;
  }

  const orgId = snapshot.organisation_id;
  if (!orgId) {
    log.error({ enrollmentId: snapshot.enrollment_id }, 'Academy snapshot has no organisation_id — skipping entitlements');
    return;
  }

  const gross = Number(snapshot.gross_amount || 0);
  const commissionAmount = Number(snapshot.commission_amount || 0);
  const orgNetAmount = Number(snapshot.organization_earning_amount || 0);

  if (gross <= 0) {
    log.warn({ enrollmentId: snapshot.enrollment_id, gross }, 'Academy payment has zero/negative gross — skipping entitlements');
    return;
  }

  const availableAt = await resolveAcademyCancellationWindow(snapshot);

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const inputs: any[] = [];

    if (orgNetAmount > 0) {
      inputs.push({
        organisationId: orgId,
        branchId: snapshot.branch_id ?? null,
        entitlementType: 'ORGANIZATION_EARNING',
        sourceType: 'academy',
        sourceId: snapshot.enrollment_id,
        collector: snapshot.collector,
        amount: orgNetAmount,
        currency: snapshot.currency || 'EGP',
        availableAt,
        description: `Academy enrollment #${snapshot.enrollment_id} — org earning`,
        metadata: {
          enrollmentId: snapshot.enrollment_id,
          programId: snapshot.program_id,
          groupId: snapshot.group_id ?? null,
          playerId: snapshot.player_id,
          grossAmount: gross,
          commissionAmount,
          orgNetAmount,
          courtRentalAmount: Number(snapshot.court_rental_amount || 0),
          coachCompAmount: Number(snapshot.coach_comp_amount || 0),
          snapshotId: snapshot.id,
        },
      });
    }

    if (commissionAmount > 0) {
      inputs.push({
        organisationId: orgId,
        branchId: snapshot.branch_id ?? null,
        entitlementType: 'COURTZON_COMMISSION',
        sourceType: 'academy',
        sourceId: snapshot.enrollment_id,
        collector: snapshot.collector,
        amount: commissionAmount,
        currency: snapshot.currency || 'EGP',
        availableAt,
        description: `Academy enrollment #${snapshot.enrollment_id} — CourtZon commission`,
        metadata: {
          enrollmentId: snapshot.enrollment_id,
          programId: snapshot.program_id,
          groupId: snapshot.group_id ?? null,
          playerId: snapshot.player_id,
          grossAmount: gross,
          commissionAmount,
          snapshotId: snapshot.id,
        },
      });
    }

    if (inputs.length === 0) {
      await conn.rollback();
      log.info({ enrollmentId: snapshot.enrollment_id }, 'No academy entitlements to create (zero amounts)');
      return;
    }

    const ids = await financialEntitlementService.createEntitlements(inputs, conn);
    await conn.commit();

    log.info(
      { enrollmentId: snapshot.enrollment_id, entitlementIds: ids, availableAt },
      'Entitlements created for academy enrollment',
    );
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Resolves `available_at` for academy entitlements from the SNAPSHOTTED
 * cancellation window (never the live policy) anchored to the enrollment's
 * group earliest session. Returns null when no window was snapshotted or when
 * the window has already passed (immediate activation).
 */
export async function resolveAcademyCancellationWindow(snapshot: any): Promise<Date | null> {
  const windowMinutes = snapshot.cancellation_window_minutes;
  if (!windowMinutes || windowMinutes <= 0) return null;

  const groupId = snapshot.group_id;
  if (!groupId) return null;

  try {
    const totals = await academyPaymentRepository.getConfirmedSessionTotals(groupId);
    if (!totals.earliestStart) return null;
    const anchor = new Date(String(totals.earliestStart).replace(' ', 'T'));
    const availableAt = new Date(anchor.getTime() - windowMinutes * 60 * 1000);
    return availableAt <= new Date() ? null : availableAt;
  } catch (err) {
    log.warn({ err, enrollmentId: snapshot.enrollment_id }, 'Failed to resolve academy cancellation window — defaulting to immediate activation');
    return null;
  }
}