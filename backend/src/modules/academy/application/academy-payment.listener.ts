import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { academyPaymentService } from './academy-payment.service.js';
import { academyPaymentRepository } from '../infrastructure/repositories/academy-payment.repository.js';

const log = createModuleLogger('academy-payment-listener');

// Idempotency guard — registering twice would duplicate every in-memory handler
// and fire each domain event multiple times. Called once at app startup, and
// once per test file. Guarded so repeated calls are a no-op.
let academyPaymentListenersRegistered = false;

/** Test-only: clear the guard so registerAcademyPaymentListeners() can run again. */
export function resetAcademyPaymentListenersForTest(): void {
  academyPaymentListenersRegistered = false;
}

/**
 * G8 — turns a successful academy payment (card/wallet, online) into the
 * durable snapshot + acknowledgment and emits `academy:enrollment-paid`.
 *
 * The snapshot creation is idempotent (`uk_sep_enrollment`) and safe to run
 * after the offline cash flow already created one. Accounting is NOT posted
 * here — the financial module's `payment:succeeded` handler posts the
 * academy_* entries (guarded by hasPosting), and the durable entitlement
 * subscriber consumes `academy:enrollment-paid`.
 */
export function registerAcademyPaymentListeners(): void {
  if (academyPaymentListenersRegistered) {
    log.info('Academy payment listeners already registered — skip');
    return;
  }
  academyPaymentListenersRegistered = true;

  eventBusV2.on('payment:succeeded', async (data) => {
    if (data.referenceType !== 'academy') return;

    const enrollmentId = data.referenceId;
    const paymentId = data.paymentId;
    if (!enrollmentId) {
      log.error({ paymentId }, 'Academy payment succeeded but no enrollment referenceId');
      return;
    }

    try {
      const paymentMethod: string = data.metadata?.paymentMethod || 'card';
      const { snapshotId, created } = await academyPaymentService.ensureSnapshotForPayment(
        enrollmentId,
        paymentId ? Number(paymentId) : null,
        paymentMethod,
      );

      const snapshot = await academyPaymentRepository.getSnapshotByEnrollment(enrollmentId);
      if (!snapshot?.id) {
        log.error({ enrollmentId }, 'Academy snapshot missing after payment succeeded');
        return;
      }

      log.info(
        { enrollmentId, snapshotId, created },
        'Academy enrollment paid — emitting academy:enrollment-paid',
      );

      eventBusV2.emit('academy:enrollment-paid', {
        enrollmentId,
        programId: snapshot.program_id,
        groupId: snapshot.group_id ?? null,
        playerId: snapshot.player_id,
        organisationId: snapshot.organisation_id ?? null,
        branchId: snapshot.branch_id ?? null,
        paymentTransactionId: snapshot.payment_transaction_id ?? null,
        amount: Number(snapshot.gross_amount),
        currency: snapshot.currency,
        paymentMethod: snapshot.payment_method,
        collector: snapshot.collector,
      } as any);
    } catch (err: any) {
      log.error(
        { err, paymentId, enrollmentId },
        'Academy payment succeeded handler failed (snapshot/ack)',
      );
    }
  });

  log.info('Academy payment listeners registered');
}