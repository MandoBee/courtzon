import { getPool } from '../../../database/mysql.js';
import { withTransaction } from '../../../database/database.transaction.js';
import type { PoolConnection } from 'mysql2/promise';
import { AppError, ConflictError, NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { recordAudit } from '../../audit-log/index.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { tournamentRefundRequestRepository } from '../infrastructure/repositories/tournament-refund-request.repository.js';
import { emitTournamentScoped } from './tournament-realtime-scope.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('tournament-refund');

/**
 * G11.3 — TOURNAMENT FULL REFUND (player-request → organisation-approval).
 *
 * Business rules (authoritative):
 *  - FULL refunds only — no partial refunds, never the R5-D2 allocation engine.
 *  - Cutoff = the current draw (`tournament_draws WHERE is_current=1`) reaching
 *    status 'locked'. draft/approved → allowed; locked → rejected. The check is
 *    enforced AT EXECUTION TIME under a row lock on the current draw row (which
 *    `lockDraw` also locks via `updateDraw`), so a refund can never race past
 *    draw locking. `tournaments.status` is NOT the cutoff.
 *  - CARD refunds go through the hardened `PaymentService.refund()` (T1/T2/T3,
 *    exactly-once). CASH refunds are GATEWAY-FREE: the proven academy
 *    offline-cash-refund primitive (conditional paid→refunded + canonical
 *    payment:refunded with paymentMethod='cash').
 *  - Refund-after-settlement is allowed before draw lock via a PAYMENT-SCOPED
 *    detach (gateway_settlement_id=NULL on THIS payment only) — never the whole
 *    settlement batch.
 *  - G11 Phase 3 — creation is organisation-only, so an org-less tournament can
 *    only be a LEGACY row. It has no owning organisation and no recognised
 *    revenue source to refund against: fail-closed (no request, no execution).
 *  - Entitlement revocation reuses the existing tournament withdrawal
 *    architecture (withdrawParticipant) as the consequence of a successful
 *    refund — refund is its own financial domain operation, not an alias.
 */

function isRegistrationOwner(registration: any, playerId: number, participant: Record<string, any> | null): boolean {
  if (Number(registration.player_id ?? registration.user_id ?? 0) === playerId) return true;
  if (!participant) return false;
  const members = participant.member_user_ids;
  if (Array.isArray(members)) return members.some((u: any) => Number(u) === playerId);
  if (typeof members === 'string' && members.trim()) {
    try { return (JSON.parse(members) as number[]).some((u) => Number(u) === playerId); } catch { return false; }
  }
  return false;
}

/** Row-lock the CURRENT draw row and report whether it is LOCKED. */
async function currentDrawIsLocked(tournamentId: number, conn?: PoolConnection): Promise<boolean> {
  const db = conn ?? getPool();
  const [rows] = await db.execute(
    `SELECT status FROM tournament_draws WHERE tournament_id = ? AND is_current = 1 FOR UPDATE`,
    [tournamentId],
  );
  return (rows as any[])[0]?.status === 'locked';
}

async function assertDrawNotLockedAtExecution(tournamentId: number, conn: PoolConnection): Promise<void> {
  if (await currentDrawIsLocked(tournamentId, conn)) {
    throw new ConflictError(
      'The tournament draw is LOCKED — registration refunds are no longer allowed',
      ErrorCodes.TOURNAMENT_DRAW_LOCKED,
    );
  }
}

interface ApprovalOutcome {
  alreadyHandled: boolean;
  alreadyRefunded: boolean;
  requestId: number;
  paymentId: number;
  amount: number;
  method: string;
  currency: string;
  registration: any;
  tournament: any;
  cashEmit: { paymentId: number; userId: number; amount: number; reason?: string; currency: string } | null;
  participantId: number | null;
}

class TournamentRefundService {
  /**
   * Shared financial execution core (G11.3 + G11.8). Runs INSIDE the caller's
   * open transaction (serialization via the draw row FOR UPDATE and the payment
   * row FOR UPDATE). Performs draw-lock check, registration+payment resolution,
   * payment-state guard, payment-scoped settlement detach, the accounting
   * recognition prerequisite, the exactly-once cash mark, and returns an
   * execution outcome for the post-commit payment-layer step.
   *
   * Caller responsibilities (unchanged):
   *  - G11.3 approval: request row lock + org ownership first, then this core.
   *  - G11.8 self-service: ownership + org-less fail-closed checks first.
   */
  private async executeFullRefundCore(
    conn: PoolConnection,
    opts: { tournament: any; registrationId: number; actorId: number; reason?: string | null },
  ): Promise<ApprovalOutcome> {
    const { tournament, registrationId, actorId, reason } = opts;
    const tournamentId = Number(tournament.id);

    // AUTHORITATIVE execution-time draw-lock check (row lock serializes with lockDraw).
    await assertDrawNotLockedAtExecution(tournamentId, conn);

    const registration = await tournamentRepository.getRegistrationById(registrationId);
    if (!registration) throw new NotFoundError('Tournament registration', ErrorCodes.TOURNAMENT_REGISTRATION_NOT_FOUND);

    const payment = await tournamentRepository.findPaymentByRegistration(registrationId, conn);
    if (!payment) throw new ConflictError('No tournament payment found for this registration');
    const paymentId = Number(payment.id);
    const paymentRow = await tournamentRepository.lockPaymentRow(paymentId, conn);
    if (!paymentRow) throw new NotFoundError('Payment transaction');

    const method = String(paymentRow.payment_method || 'card');
    if (method !== 'card' && method !== 'cash') {
      throw new ConflictError(`Tournament refunds do not support payment method '${method}'`);
    }

    const alreadyRefunded = String(paymentRow.payment_status) === 'refunded';
    if (!alreadyRefunded && String(paymentRow.payment_status) !== 'paid') {
      throw new ConflictError(`Payment is ${paymentRow.payment_status} — only 'paid' payments can be refunded`);
    }

    const amount = Math.round(Number(payment.amount ?? paymentRow.amount ?? 0) * 100) / 100;
    if (amount <= 0) throw new ConflictError('Refund amount must be positive');
    const currencyCode = String(payment.currency || tournament.currency_code || 'EGP');

    // Refund-after-settlement: PAYMENT-SCOPED dismantle (never the whole batch
    // reversal). G11.4 completes it: the active settlement line is released,
    // the batch header is reduced, the payment is detached, nothing is deleted.
    if (paymentRow.gateway_settlement_id != null && Number(paymentRow.gateway_settlement_id) !== 0) {
      const dismantle = await tournamentRepository.detachPaymentSettlement(paymentId, conn);
      log.info({ paymentId, registrationId, settlementId: dismantle.settlementId, lineId: dismantle.lineId, lineReleased: dismantle.lineReleased }, 'Tournament refund: payment-scoped settlement dismantle performed');
      await recordAudit({
        actorId,
        action: 'TOURNAMENT.SETTLEMENT_DISMANTLED',
        entityType: 'gateway_settlement',
        entityId: dismantle.settlementId ?? 0,
        beforeState: dismantle.before
          ? { paymentId, lineId: dismantle.lineId, gross: dismantle.before.gross, fee: dismantle.before.fee, net: dismantle.before.net, transactionCount: dismantle.before.transactionCount }
          : null,
        afterState: {
          paymentId,
          settlementId: dismantle.settlementId,
          lineId: dismantle.lineId,
          lineReleased: dismantle.lineReleased,
          paymentDetached: dismantle.paymentDetached,
          releasedGross: dismantle.releasedAmounts?.gross ?? null,
          releasedFee: dismantle.releasedAmounts?.fee ?? null,
          releasedNet: dismantle.releasedAmounts?.net ?? null,
          gross: dismantle.after?.gross ?? null,
          fee: dismantle.after?.fee ?? null,
          net: dismantle.after?.net ?? null,
          transactionCount: dismantle.after?.transactionCount ?? null,
          reason: reason ?? null,
          source: 'tournament.full_refund',
        },
      });
    }

    const participant = await tournamentRepository.findParticipantByRegistration(registrationId);

    // Accounting recognition must exist (financially consistent refund).
    const recognitionEvent = method === 'cash' ? 'tournament_cash_commission_receivable' : 'tournament_registration_card_payment';
    const { ledgerRepository } = await import('../../financial/infrastructure/repositories/ledger.repository.js');
    if (!(await ledgerRepository.hasPosting('tournament', paymentId, recognitionEvent))) {
      throw new ConflictError(`Tournament ${method} accounting recognition is missing — cannot refund a financially inconsistent registration`);
    }

    // Exactly-once CASH mark (conditional paid→refunded; no-op when already refunded).
    if (!alreadyRefunded && method === 'cash') {
      const cashApplied = await tournamentRepository.markPaymentRefundedIfPaid(paymentId, conn);
      if (!cashApplied) throw new ConflictError('Cash payment is no longer in paid state — cannot be refunded');
    }

    return {
      alreadyHandled: false,
      alreadyRefunded,
      requestId: 0,
      paymentId,
      amount,
      method,
      currency: currencyCode,
      registration,
      tournament,
      cashEmit: !alreadyRefunded && method === 'cash'
        ? { paymentId, userId: Number(payment.user_id ?? registration.player_id ?? actorId), amount, reason: reason ?? undefined, currency: currencyCode }
        : null,
      participantId: participant ? Number(participant.id) : null,
    };
  }

  /**
   * Player requests a refund for their OWN registration. Request-time draw check
   * is ADVISORY only — the authoritative lock check happens at execution.
   * G11 Phase 3 — creation is organisation-only, so an org-less tournament can
   * only be a LEGACY row. It has no owning organisation, hence no recognised
   * revenue source to refund against → fail closed (unchanged behaviour).
   */
  async requestRefund(registrationId: number, playerId: number, reason?: string | null) {
    const registration = await tournamentRepository.getRegistrationById(registrationId);
    if (!registration) throw new NotFoundError('Tournament registration', ErrorCodes.TOURNAMENT_REGISTRATION_NOT_FOUND);

    const tournament = await tournamentRepository.findById(Number(registration.tournament_id));
    if (!tournament) throw new NotFoundError('Tournament', ErrorCodes.TOURNAMENT_NOT_FOUND);
    if (tournament.organisation_id == null) {
      throw new ConflictError('This tournament has no owning organisation, so it has no recognised revenue source to refund against');
    }

    const participant = await tournamentRepository.findParticipantByRegistration(registrationId);
    if (!isRegistrationOwner(registration as any, playerId, participant)) {
      throw new ConflictError('You can only request a refund for your own registration');
    }

    // Advisory: no request accepted once the draw is locked (execution re-checks).
    if (await currentDrawIsLocked(Number(registration.tournament_id))) {
      throw new ConflictError('The tournament draw is LOCKED — refund requests are no longer accepted', ErrorCodes.TOURNAMENT_DRAW_LOCKED);
    }

    try {
      const created = await tournamentRefundRequestRepository.create({
        tournamentId: Number(registration.tournament_id),
        registrationId,
        requestedBy: playerId,
        reason: reason ?? null,
      });
      await recordAudit({
        actorId: playerId,
        action: 'TOURNAMENT.REFUND_REQUESTED',
        entityType: 'tournament_registration_refund_request',
        entityId: created.id,
        afterState: { tournamentId: created.tournamentId, registrationId, status: 'pending', reason: reason ?? null },
      });
      emitTournamentScoped('tournament:refund-requested', {
        tournamentId: created.tournamentId,
        registrationId,
        userId: playerId,
        requestId: created.id,
        status: 'pending',
      } as Record<string, unknown>, tournament as any);
      return created;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new ConflictError('A refund request is already open for this registration');
      }
      throw err;
    }
  }

  async listRequestsForOrganisation(orgId: number, status?: string) {
    return tournamentRefundRequestRepository.listForOrganisation(orgId, status);
  }

  /** Player reads their own registration's refund request (latest) — returns null when none/not owner. */
  async getMyRefundRequest(registrationId: number, playerId: number): Promise<any | null> {
    const registration = await tournamentRepository.getRegistrationById(registrationId);
    if (!registration) return null;
    const participant = await tournamentRepository.findParticipantByRegistration(registrationId);
    if (!isRegistrationOwner(registration as any, playerId, participant)) return null;
    const [rows] = await getPool().execute(
      `SELECT * FROM tournament_registration_refund_requests
       WHERE registration_id = ? ORDER BY id DESC LIMIT 1`,
      [registrationId],
    );
    return (rows as any[])[0] ?? null;
  }

  /**
   * Organisation official approves a pending request → EXECUTES the full refund.
   * Cross-org approval rejected; player-approval prevented by the financial.reconcile
   * RBAC guard plus the org-ownership checks below. Exactly-once across duplicate
   * approvals / crashes via the request row lock + idempotent payment primitives.
   */
  async approveRefundRequest(requestId: number, orgId: number, officialId: number) {
    const outcome = await withTransaction(async (conn) => {
      const req = await tournamentRefundRequestRepository.findByIdForUpdate(requestId, conn);
      if (!req) throw new NotFoundError('Refund request not found');
      if (req.status === 'rejected') throw new ConflictError('This refund request has already been rejected');
      if (req.status === 'executed') {
        return { alreadyHandled: true, alreadyRefunded: false, requestId: req.id, paymentId: 0, amount: 0, method: '', currency: '', registration: null, tournament: await tournamentRepository.findById(req.tournamentId), cashEmit: null, participantId: null } as ApprovalOutcome;
      }

      const tournament = await tournamentRepository.findById(req.tournamentId);
      if (!tournament) throw new NotFoundError('Tournament', ErrorCodes.TOURNAMENT_NOT_FOUND);
      if (tournament.organisation_id == null || Number(tournament.organisation_id) !== orgId) {
        throw new ConflictError('This refund request does not belong to your organisation');
      }

      // Shared financial execution core (draw-lock, payment lock, settlement
      // detach, recognition prerequisite, cash mark) — pure extraction of the
      // original G11.3 body; identical primitives, ordering and side effects.
      const executed = await this.executeFullRefundCore(conn, {
        tournament,
        registrationId: req.registrationId,
        actorId: officialId,
        reason: req.reason ?? null,
      });

      // Mark the request reviewed/approved under the request row lock — a
      // second concurrent approval blocks here and enters the recovery branch
      // (payment already refunded → finalize only) instead of re-executing.
      await tournamentRefundRequestRepository.updateStatus(req.id, { status: 'approved', reviewedBy: officialId, reviewedAt: true }, conn);

      return { ...executed, requestId: req.id };
    });

    if (outcome.alreadyHandled) return { success: true, refunded: false, alreadyHandled: true };

    // ── post-commit: execute at the payment layer (idempotent) ─────────────
    let executedMethod = '';
    if (outcome.method === 'card') {
      const { paymentService } = await import('../../payment/application/payment.service.js');
      const current = await tournamentRepository.findPaymentByRegistration(Number((outcome.registration as any).id));
      if (String(current?.payment_status ?? '') !== 'refunded') {
        const result = await paymentService.refund(outcome.paymentId, outcome.amount, 'Tournament registration full refund');
        if (!result?.success) {
          throw new Error(`Tournament card refund failed: ${(result as any)?.errorMessage || 'unknown error'}`);
        }
      }
      executedMethod = 'paid';
    }

    if (outcome.cashEmit) {
      const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
      await eventBusV2.emit('payment:refunded', {
        paymentId: outcome.cashEmit.paymentId,
        userId: outcome.cashEmit.userId,
        amount: outcome.cashEmit.amount,
        reason: outcome.cashEmit.reason,
        traceId: `tournament_cash_${outcome.cashEmit.paymentId}_${Date.now().toString(36)}`,
        referenceType: 'tournament',
        referenceId: Number((outcome.registration as any).id),
        metadata: { paymentMethod: 'cash', currency: outcome.cashEmit.currency },
      } as any);
    }
    void executedMethod;

    // ── finalize: registration/participant/request state (idempotent) ─────
    await this.finalizeExecution(outcome, officialId);
    return { success: true, refunded: true, alreadyHandled: false, paymentId: outcome.paymentId, amount: outcome.amount, method: outcome.method };
  }

  /** Idempotent post-refund state — safe to rerun after a crash (recovery). */
  private async finalizeExecution(outcome: ApprovalOutcome, officialId: number) {
    const registration = outcome.registration;
    if (!registration) return;
    const tournamentId = Number(outcome.tournament?.id ?? registration.tournament_id ?? 0);
    const actor = officialId || Number(registration.player_id ?? 0) || 0;

    await tournamentRepository.updateRegistrationPaymentStatus(Number(registration.id), 'refunded');
    // The request lifecycle closes when the refund has been executed.
    await tournamentRefundRequestRepository.updateStatus(outcome.requestId, { status: 'executed', reviewedAt: true, executedAt: true });

    if (outcome.participantId != null && tournamentId) {
      const participant = await tournamentRepository.findParticipantByRegistration(Number(registration.id));
      if (participant && String(participant.status) === 'active') {
        try {
          const { participantDrawService } = await import('./participant-draw.service.js');
          await participantDrawService.withdrawParticipant(tournamentId, Number(participant.id), actor, 'registration_refund');
        } catch (err: any) {
          log.warn({ err, registrationId: registration.id }, 'Tournament refund: entitlement withdrawal skipped');
        }
      }
    }

    await recordAudit({
      actorId: actor,
      action: 'TOURNAMENT.REFUND_EXECUTED',
      entityType: 'tournament_registration',
      entityId: Number(registration.id),
      afterState: { paymentId: outcome.paymentId, amount: outcome.amount, method: outcome.method, paymentStatus: 'refunded' },
    });

    const tournament = await tournamentRepository.findById(tournamentId);
    if (tournament) {
      emitTournamentScoped('tournament:registration-refunded', {
        tournamentId,
        registrationId: Number(registration.id),
        paymentId: outcome.paymentId,
        userId: registration.player_id ?? null,
        status: 'refunded',
      } as Record<string, unknown>, tournament as any);
      emitTournamentScoped('tournament:refund-request-updated', {
        tournamentId,
        registrationId: Number(registration.id),
        paymentId: outcome.paymentId,
        status: 'executed',
      } as Record<string, unknown>, tournament as any);
    }
  }

  /**
   * G11.8 — PLAYER SELF-SERVICE registration cancellation (own registration,
   * PRE-draw-lock). Automatic 100% full refund with NO fee. Reuses the EXACT
   * G11.3 execution core (draw-lock row check, payment row lock, settlement
   * detach, accounting recognition prerequisite, cash mark / card
   * `PaymentService.refund`, `payment:refunded`, entitlement withdrawal, audit
   * `TOURNAMENT.REFUND_EXECUTED`). NO `tournament_registration_refund_requests`
   * row is created. Org-less (Phase 3) tournaments fail closed. Idempotent:
   * an already-withdrawn registration or an already-refunded payment returns
   * `alreadyHandled:true` with no side effects.
   */
  async cancelRegistrationSelfService(
    registrationId: number,
    playerId: number,
    reason?: string | null,
  ): Promise<{ success: boolean; alreadyHandled: boolean; paymentId?: number; amount?: number; method?: string }> {
    const registration = await tournamentRepository.getRegistrationById(registrationId);
    if (!registration) throw new NotFoundError('Tournament registration', ErrorCodes.TOURNAMENT_REGISTRATION_NOT_FOUND);

    const tournament = await tournamentRepository.findById(Number(registration.tournament_id));
    if (!tournament) throw new NotFoundError('Tournament', ErrorCodes.TOURNAMENT_NOT_FOUND);

    // Phase 3 — org-less legacy tournaments fail closed (no recognised revenue
    // source to refund against). Never relaxed for self-service. 422 per the
    // approved G11.8 API contract (the G11.3 approval path keeps its own 409).
    if (tournament.organisation_id == null) {
      throw new AppError(
        'This tournament has no owning organisation, so it has no recognised revenue source to refund against',
        422,
        ErrorCodes.TOURNAMENT_ORGANISATION_REQUIRED,
        { code: ErrorCodes.TOURNAMENT_ORGANISATION_REQUIRED },
      );
    }

    // IDOR — the player may only cancel their OWN registration (solo/pair/team).
    const participant = await tournamentRepository.findParticipantByRegistration(registrationId);
    if (!isRegistrationOwner(registration as any, playerId, participant)) {
      // 404 (approved decision) — avoid leaking registration-id existence.
      throw new NotFoundError('Tournament registration');
    }

    // Idempotent fast path: registration already withdrawn → done.
    if (String(registration.status) === 'withdrawn') {
      return { success: true, alreadyHandled: true };
    }

    const outcome = await withTransaction(async (conn) => {
      const executed = await this.executeFullRefundCore(conn, {
        tournament,
        registrationId,
        actorId: playerId,
        reason: reason ?? null,
      });
      // Payment already refunded (e.g., a concurrent G11.3 organisation refund
      // completed first): idempotent, nothing further to execute.
      if (executed.alreadyRefunded) {
        return { ...executed, alreadyHandled: true } as ApprovalOutcome;
      }
      return { ...executed, alreadyHandled: false } as ApprovalOutcome;
    });

    if (outcome.alreadyHandled) {
      return { success: true, alreadyHandled: true };
    }

    // ── post-commit: execute at the payment layer (idempotent) ─────────────
    if (outcome.method === 'card') {
      const { paymentService } = await import('../../payment/application/payment.service.js');
      const current = await tournamentRepository.findPaymentByRegistration(Number((outcome.registration as any).id));
      if (String(current?.payment_status ?? '') !== 'refunded') {
        const result = await paymentService.refund(outcome.paymentId, outcome.amount, 'Tournament registration self-service cancellation refund');
        if (!result?.success) {
          throw new Error(`Tournament card refund failed: ${(result as any)?.errorMessage || 'unknown error'}`);
        }
      }
    }

    if (outcome.cashEmit) {
      const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
      await eventBusV2.emit('payment:refunded', {
        paymentId: outcome.cashEmit.paymentId,
        userId: outcome.cashEmit.userId,
        amount: outcome.cashEmit.amount,
        reason: outcome.cashEmit.reason,
        traceId: `tournament_cash_self_${outcome.cashEmit.paymentId}_${Date.now().toString(36)}`,
        referenceType: 'tournament',
        referenceId: Number((outcome.registration as any).id),
        metadata: { paymentMethod: 'cash', currency: outcome.cashEmit.currency },
      } as any);
    }

    // ── finalize: registration / participant state (idempotent) ────────────
    await this.finalizeSelfService(outcome, playerId);
    return { success: true, alreadyHandled: false, paymentId: outcome.paymentId, amount: outcome.amount, method: outcome.method };
  }

  /** Idempotent post-refund state for PLAYER SELF-SERVICE (no request row). */
  private async finalizeSelfService(outcome: ApprovalOutcome, playerId: number) {
    const registration = outcome.registration;
    if (!registration) return;
    const tournamentId = Number(outcome.tournament?.id ?? registration.tournament_id ?? 0);
    const actor = playerId || Number(registration.player_id ?? 0) || 0;

    await tournamentRepository.updateRegistrationPaymentStatus(Number(registration.id), 'refunded');
    // registration.status → 'withdrawn' is performed by `withdrawParticipant`
    // (existing primitive, idempotent active-only) — do NOT double-transition.

    if (outcome.participantId != null && tournamentId) {
      const participant = await tournamentRepository.findParticipantByRegistration(Number(registration.id));
      if (participant && String(participant.status) === 'active') {
        try {
          const { participantDrawService } = await import('./participant-draw.service.js');
          await participantDrawService.withdrawParticipant(tournamentId, Number(participant.id), actor, 'registration_cancellation_refund');
        } catch (err: any) {
          log.warn({ err, registrationId: registration.id }, 'Tournament self-cancellation: entitlement withdrawal skipped');
        }
      }
    }

    await recordAudit({
      actorId: actor,
      action: 'TOURNAMENT.REFUND_EXECUTED',
      entityType: 'tournament_registration',
      entityId: Number(registration.id),
      afterState: { paymentId: outcome.paymentId, amount: outcome.amount, method: outcome.method, paymentStatus: 'refunded', source: 'player_self_service' },
    });

    const tournament = await tournamentRepository.findById(tournamentId);
    if (tournament) {
      emitTournamentScoped('tournament:registration-refunded', {
        tournamentId,
        registrationId: Number(registration.id),
        paymentId: outcome.paymentId,
        userId: registration.player_id ?? null,
        status: 'refunded',
      } as Record<string, unknown>, tournament as any);
      emitTournamentScoped('registration.received', {
        tournamentId,
        registrationId: Number(registration.id),
        userId: registration.player_id ?? null,
        status: 'withdrawn',
      } as Record<string, unknown>, tournament as any);
    }
  }

  async rejectRefundRequest(requestId: number, orgId: number, officialId: number, reason?: string | null) {
    await withTransaction(async (conn) => {
      const req = await tournamentRefundRequestRepository.findByIdForUpdate(requestId, conn);
      if (!req) throw new NotFoundError('Refund request not found');
      if (req.status !== 'pending') {
        throw new ConflictError(`Refund request is already '${req.status}' — cannot be rejected`);
      }
      const tournament = await tournamentRepository.findById(req.tournamentId);
      if (!tournament || tournament.organisation_id == null || Number(tournament.organisation_id) !== orgId) {
        throw new ConflictError('This refund request does not belong to your organisation');
      }
      await tournamentRefundRequestRepository.updateStatus(req.id, { status: 'rejected', reviewedBy: officialId, reviewedAt: true, rejectionReason: reason ?? null }, conn);
      await recordAudit({
        actorId: officialId,
        action: 'TOURNAMENT.REFUND_REJECTED',
        entityType: 'tournament_registration_refund_request',
        entityId: req.id,
        beforeState: { status: 'pending' },
        afterState: { status: 'rejected', reason: reason ?? null },
      });
      emitTournamentScoped('tournament:refund-request-updated', {
        tournamentId: req.tournamentId,
        registrationId: req.registrationId,
        requestId: req.id,
        status: 'rejected',
      } as Record<string, unknown>, tournament as any);
    });
    return { success: true, status: 'rejected' };
  }
}

export const tournamentRefundService = new TournamentRefundService();