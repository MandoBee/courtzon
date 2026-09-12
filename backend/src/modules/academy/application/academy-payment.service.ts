import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { ConflictError } from '../../../shared/errors/app-error.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { commissionService } from '../../financial/application/commission.service.js';
import { academyPaymentRepository } from '../infrastructure/repositories/academy-payment.repository.js';
import type { AcademyEnrollmentPaymentAttributes } from '../domain/academy.types.js';

const log = createModuleLogger('academy-payment');

export type AcademySnapshotInput = Omit<
  AcademyEnrollmentPaymentAttributes,
  'id' | 'payment_transaction_id' | 'created_by' | 'snapshot_created_at' | 'status'
>;

export interface RecordOfflinePaymentResult {
  snapshotId: number;
  paymentTransactionId: number;
  created: boolean;
}

/** cash is collected by the org; every digital method is collected by CourtZon. */
export function collectorForMethod(method: string): 'courtzon' | 'org' {
  return method === 'cash' ? 'org' : 'courtzon';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

class AcademyPaymentService {
  /**
   * Resolves the immutable economics of an enrollment payment from the LIVE
   * domain at payment time. This is the ONLY place these values are computed —
   * downstream (accounting, entitlements, refunds) always read the snapshot.
   *
   * FAIL-CLOSED: if the organisation has no applicable academy commission rate
   * this throws (commissionService enforces it) so the payment is rejected
   * rather than posted with a fabricated 0% commission.
   */
  async resolveEconomics(
    enrollmentId: number,
    paymentMethod: string,
    conn?: mysql.PoolConnection,
  ): Promise<AcademySnapshotInput> {
    const ctx = await academyPaymentRepository.getPaymentContext(enrollmentId, conn);
    if (!ctx) throw new ConflictError(`Enrollment ${enrollmentId} not found`);

    const gross = round2(ctx.programPrice);
    if (gross <= 0 || ctx.priceType === 'FREE') {
      throw new ConflictError('Academy program is free — no payment snapshot is created');
    }
    if (ctx.organisationId == null) {
      throw new ConflictError('Academy program has no organisation — cannot resolve payment economics');
    }

    const comm = await commissionService.calculate(ctx.organisationId, 'academy', gross);
    const commissionAmount = round2(comm.commissionAmount);
    const orgEarning = round2(gross - commissionAmount);

    const totals = ctx.groupId
      ? await academyPaymentRepository.getConfirmedSessionTotals(ctx.groupId, conn)
      : { sessionCount: 0, courtRentalAmount: 0, courtRentalCurrency: null, earliestStart: null };

    const coachCompAmount = this.computeCoachComp(
      ctx.coachCompType, ctx.coachCompValue, totals.sessionCount, gross,
    );

    const windowMinutes = await this.resolveCancellationWindowMinutes(
      ctx.organisationId, ctx.branchId,
    );

    return {
      enrollment_id: ctx.enrollmentId,
      program_id: ctx.programId,
      group_id: ctx.groupId,
      organisation_id: ctx.organisationId,
      branch_id: ctx.branchId,
      player_id: ctx.playerId,
      gross_amount: gross,
      currency: ctx.currency || 'EGP',
      program_price: gross,
      price_type: ctx.priceType,
      session_count: totals.sessionCount,
      court_rental_amount: round2(totals.courtRentalAmount),
      court_rental_currency: totals.courtRentalCurrency,
      commission_rate: comm.rate,
      commission_amount: commissionAmount,
      organization_earning_amount: orgEarning,
      coach_comp_type: ctx.coachCompType,
      coach_comp_value: ctx.coachCompValue,
      coach_comp_amount: round2(coachCompAmount),
      collector: collectorForMethod(paymentMethod) as 'courtzon' | 'org',
      payment_method: paymentMethod as AcademyEnrollmentPaymentAttributes['payment_method'],
      cancellation_window_minutes: windowMinutes,
    };
  }

  private computeCoachComp(
    compType: string | null,
    compValue: number | null,
    sessionCount: number,
    gross: number,
  ): number {
    if (!compType || compValue == null) return 0;
    switch (compType) {
      case 'fixed_total':
        return compValue;
      case 'fixed_per_session':
        return compValue * sessionCount;
      case 'percent_gross':
        return (gross * compValue) / 100;
      default:
        return 0;
    }
  }

  /**
   * Mirrors the booking cancellation-window resolution: the MAX active
   * cancellation policy window for the org (or branch-level policy). Stored in
   * the snapshot so the entitlement `available_at` is stable even if the policy
   * later changes. Returns null when no policy exists (immediate activation).
   */
  async resolveCancellationWindowMinutes(
    organisationId: number,
    branchId: number | null,
  ): Promise<number | null> {
    try {
      return await academyPaymentRepository.getCancellationWindowMinutes(organisationId, branchId);
    } catch (err) {
      log.warn({ err, organisationId }, 'Failed to resolve academy cancellation window — defaulting to immediate');
      return null;
    }
  }

  /**
   * G8 offline flow — atomically records the admin cash acknowledgment:
   *   1. payment_transactions row (paid, cash) for the enrollment
   *   2. the immutable economics snapshot (write-once)
   *   3. the enrollment payment acknowledgment
   *
   * Commits once; callers emit `payment:succeeded` after commit so the
   * accounting + entitlement chain runs against durable state. Idempotent:
   * a re-acknowledgment returns the existing snapshot/payment.
   */
  async recordOfflineCashPayment(
    enrollmentId: number,
    actorId: number,
  ): Promise<RecordOfflinePaymentResult> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const ctx = await academyPaymentRepository.getPaymentContext(enrollmentId, conn, true);
      if (!ctx) throw new ConflictError(`Enrollment ${enrollmentId} not found`);

      const existing = await academyPaymentRepository.getSnapshotByEnrollment(enrollmentId);
      if (existing?.id && existing.payment_transaction_id) {
        await academyPaymentRepository.markEnrollmentPaymentConfirmed(enrollmentId, actorId, conn);
        await conn.commit();
        return {
          snapshotId: Number(existing.id),
          paymentTransactionId: Number(existing.payment_transaction_id),
          created: false,
        };
      }

      const economics = await this.resolveEconomics(enrollmentId, 'cash', conn);

      const paymentTransactionId = await academyPaymentRepository.createCashPaymentTransaction(
        {
          userId: ctx.playerId,
          enrollmentId,
          amount: economics.gross_amount,
          currency: economics.currency,
        },
        conn,
      );

      const { id: snapshotId, created } = await academyPaymentRepository.createSnapshot(
        { ...economics, payment_transaction_id: paymentTransactionId, created_by: actorId },
        conn,
      );

      await academyPaymentRepository.markEnrollmentPaymentConfirmed(enrollmentId, actorId, conn);

      await conn.commit();
      log.info(
        { enrollmentId, snapshotId, paymentTransactionId, created, gross: economics.gross_amount },
        'Academy enrollment offline cash payment recorded',
      );
      return { snapshotId, paymentTransactionId, created };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Online flow (card/wallet) — creates the snapshot + acknowledgment for a
   * captured payment. Idempotent via `uk_sep_enrollment`. Used by the
   * payment:succeeded listener.
   */
  async ensureSnapshotForPayment(
    enrollmentId: number,
    paymentTransactionId: number | null,
    paymentMethod: string,
  ): Promise<{ snapshotId: number; created: boolean }> {
    const existing = await academyPaymentRepository.getSnapshotByEnrollment(enrollmentId);
    if (existing?.id) {
      await academyPaymentRepository.markEnrollmentPaymentConfirmed(enrollmentId, null);
      return { snapshotId: Number(existing.id), created: false };
    }

    const economics = await this.resolveEconomics(enrollmentId, paymentMethod);
    const { id, created } = await academyPaymentRepository.createSnapshot({
      ...economics,
      payment_transaction_id: paymentTransactionId,
      created_by: null,
    });
    await academyPaymentRepository.markEnrollmentPaymentConfirmed(enrollmentId, null);
    log.info({ enrollmentId, snapshotId: id, created, paymentMethod }, 'Academy enrollment payment snapshot ensured');
    return { snapshotId: id, created };
  }
}

export const academyPaymentService = new AcademyPaymentService();
