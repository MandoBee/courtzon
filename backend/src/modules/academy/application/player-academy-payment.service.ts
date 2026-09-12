// ============================================================================
// Academy G8.4 — Player self-service Academy payment
// ============================================================================
// Provides the player-facing payment experience ON TOP of the approved G8.3A
// financial contract:
//   player → pay → wallet/card charge (reference_type='academy') →
//   payment:succeeded → immutable snapshot → academy:enrollment-paid →
//   entitlements → accounting → settlement
//
// The backend is authoritative for EVERYTHING financial:
//   - player identity comes from the session (never client-supplied)
//   - ownership = academy_enrollment.player_id === authenticated player
//   - amount/currency/eligibility/collector are derived ONLY from the immutable
//     Academy economics path (resolveEconomics) — the client cannot influence
//     them (PlayerAcademyPaymentSchema is `.strict()` and carries no amounts).
// ============================================================================

import { ConflictError, NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { paymentService } from '../../payment/application/payment.service.js';
import { enrollmentRepository } from '../infrastructure/repositories/enrollment.repository.js';
import { programRepository } from '../infrastructure/repositories/program.repository.js';
import { academyPaymentRepository } from '../infrastructure/repositories/academy-payment.repository.js';
import { academyPaymentService } from './academy-payment.service.js';

export type PlayerAcademyPaymentState = 'free' | 'unpaid' | 'paid' | 'processing' | 'unavailable';
export type PlayerAcademyPaymentMethod = 'wallet' | 'card';

export interface PlayerAcademyPaymentStateDto {
  enrollmentId: number;
  programId: number;
  programName: string;
  groupId: number | null;
  groupName: string | null;
  enrollmentStatus: string;
  /** 'free' | 'unpaid' | 'paid' | 'processing' | 'unavailable' */
  paymentState: PlayerAcademyPaymentState;
  /** Authoritative payable amount (gross), only when applicable. */
  amount: number | null;
  currency: string;
  paid: boolean;
  paymentConfirmedAt: string | null;
  /** Player self-service methods — never cash/offline. */
  availableMethods: PlayerAcademyPaymentMethod[];
}

export interface PlayerAcademyChargeResult {
  status: 'paid' | 'pending' | 'already_paid' | 'no_payment_required';
  paymentId?: number;
  paymentStatus?: string;
  paymentUrl?: string;
  clientSecret?: string;
  intentionId?: string;
  transactionId?: string;
  amount?: number;
  currency?: string;
  balance?: number;
}

/** Player self-service methods only (wallet + card). Cash/offline is admin-only. */
const PLAYER_METHODS: PlayerAcademyPaymentMethod[] = ['wallet', 'card'];

const PENDING_STATUSES = new Set(['created', 'pending', 'processing']);

class PlayerAcademyPaymentService {
  /**
   * Authoritative payment state for the player's own enrollment.
   * Non-revealing 404 when the enrollment does not exist or belongs to another
   * player (IDOR-safe).
   */
  async getPaymentState(playerId: number, enrollmentId: number): Promise<PlayerAcademyPaymentStateDto> {
    const enrollment = await enrollmentRepository.getById(enrollmentId);
    if (!enrollment || Number(enrollment.player_id) !== playerId) {
      throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
    }

    const program = await programRepository.getById(Number(enrollment.program_id));
    const currency = program?.currency || 'EGP';
    const groupName = await this.resolveGroupName(enrollment);

    const base: PlayerAcademyPaymentStateDto = {
      enrollmentId,
      programId: Number(enrollment.program_id),
      programName: program?.name ?? '',
      groupId: enrollment.group_id ?? null,
      groupName,
      enrollmentStatus: enrollment.status,
      paymentState: 'unavailable',
      amount: null,
      currency,
      paid: false,
      paymentConfirmedAt: enrollment.payment_confirmed_at ?? null,
      availableMethods: [],
    };

    // FREE programs require no payment.
    if (!program || Number(program.price ?? 0) <= 0 || program.price_type === 'FREE') {
      return { ...base, paymentState: 'free' };
    }

    // Already paid (acknowledged or snapshot committed).
    if (enrollment.payment_confirmed_at) {
      return { ...base, paymentState: 'paid', paid: true };
    }
    const snapshot = await academyPaymentRepository.getSnapshotByEnrollment(enrollmentId);
    if (snapshot?.id) {
      return { ...base, paymentState: 'paid', paid: true, amount: Math.round(Number(snapshot.gross_amount || 0) * 100) / 100, currency: snapshot.currency || currency };
    }

    // Pending gateway transaction → processing.
    if (await academyPaymentRepository.hasPendingPaymentTransaction(enrollmentId)) {
      return { ...base, paymentState: 'processing' };
    }

    // Unpaid — but only if the player is actually eligible to pay.
    const eligible = await this.isEligible(enrollment, program);
    if (!eligible) {
      return { ...base, paymentState: 'unavailable' };
    }

    // Resolve the authoritative payable amount — FAILS CLOSED (missing Academy
    // commission rate → 'unavailable', never a fabricated 0% amount).
    try {
      const econ = await academyPaymentService.resolveEconomics(enrollmentId, 'card');
      return {
        ...base,
        paymentState: 'unpaid',
        amount: Math.round(Number(econ.gross_amount || 0) * 100) / 100,
        currency: econ.currency || currency,
        availableMethods: [...PLAYER_METHODS],
      };
    } catch (err: any) {
      if (err?.code === ErrorCodes.ACADEMY_PAYMENT_NOT_ELIGIBLE) throw err;
      return { ...base, paymentState: 'unavailable' };
    }
  }

  /**
   * Initiate a player self-service Academy payment.
   * The amount/currency are derived server-side; the client only picks the
   * method. Idempotent: an already-paid enrollment returns a safe result.
   */
  async charge(
    playerId: number,
    enrollmentId: number,
    paymentMethod: PlayerAcademyPaymentMethod,
    idempotencyKey?: string,
  ): Promise<PlayerAcademyChargeResult> {
    const enrollment = await enrollmentRepository.getById(enrollmentId);
    if (!enrollment || Number(enrollment.player_id) !== playerId) {
      throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
    }

    const program = await programRepository.getById(Number(enrollment.program_id));
    if (!program || Number(program.price ?? 0) <= 0 || program.price_type === 'FREE') {
      throw new ConflictError('Free programs do not require payment', ErrorCodes.ACADEMY_PAYMENT_NOT_ELIGIBLE);
    }

    // Already paid → safe idempotent result (no duplicate charge).
    if (enrollment.payment_confirmed_at) {
      return { status: 'already_paid', paymentStatus: 'paid' };
    }
    const snapshot = await academyPaymentRepository.getSnapshotByEnrollment(enrollmentId);
    if (snapshot?.id) {
      return { status: 'already_paid', paymentStatus: 'paid' };
    }

    if (!(await this.isEligible(enrollment, program))) {
      throw new ConflictError('Academy enrollment is not eligible for payment', ErrorCodes.ACADEMY_PAYMENT_NOT_ELIGIBLE);
    }

    // FAIL-CLOSED: missing Academy commission rate → payment rejected with a
    // clear, non-sensitive error (never a fabricated 0% commission).
    let economics;
    try {
      economics = await academyPaymentService.resolveEconomics(enrollmentId, paymentMethod);
    } catch (err: any) {
      if (err?.code === ErrorCodes.ACADEMY_PAYMENT_NOT_ELIGIBLE) throw err;
      throw new ConflictError(
        'Payment is temporarily unavailable. Please try again later.',
        ErrorCodes.ACADEMY_PAYMENT_UNAVAILABLE,
      );
    }

    const result = await paymentService.charge(playerId, {
      referenceType: 'academy',
      referenceId: enrollmentId,
      amount: Math.round(Number(economics.gross_amount || 0) * 100) / 100,
      currency: economics.currency || 'EGP',
      paymentMethod,
      idempotencyKey,
    }) as any;

    return {
      status: result.status === 'paid' ? 'paid' : 'pending',
      paymentId: result.paymentId,
      paymentStatus: result.status,
      paymentUrl: result.paymentUrl,
      clientSecret: result.clientSecret,
      intentionId: result.intentionId,
      transactionId: result.transactionId,
      amount: Math.round(Number(economics.gross_amount || 0) * 100) / 100,
      currency: economics.currency || 'EGP',
      balance: result.balance,
    };
  }

  private async isEligible(enrollment: any, program: any): Promise<boolean> {
    // Confirmation happens FIRST; players pay only confirmed enrollments.
    if (enrollment.status !== 'confirmed') return false;
    // Payment only after the program has been confirmed (G3 lifecycle).
    if (program?.lifecycle_state !== 'confirmed') return false;
    // The program must not be cancelled/archived.
    if (program?.status === 'cancelled' || program?.status === 'archived') return false;
    return true;
  }

  private async resolveGroupName(enrollment: any): Promise<string | null> {
    if (enrollment.group_id == null) return null;
    const { groupRepository } = await import('../infrastructure/repositories/group.repository.js');
    const group = await groupRepository.getById(Number(enrollment.group_id));
    return group?.name ?? null;
  }
}

export const playerAcademyPaymentService = new PlayerAcademyPaymentService();