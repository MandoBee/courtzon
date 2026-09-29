import { getPool } from '../../../database/mysql.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { tournamentPrizeAwardRepository } from '../infrastructure/repositories/tournament-prize-award.repository.js';
import type {
  Tournament,
  TournamentPrize,
  TournamentPrizeAward,
  PrizeFundingSource,
  PrizeCollectionMethod,
  PrizeBindSource,
  PrizeAwardStatus,
  TournamentStandingRow,
} from '../domain/tournament-aggregate.js';
import { validatePrizeAwardAmount, assertValidPrizeAwardTransition } from '../domain/tournament-aggregate.js';
import { financialEntitlementService } from '../../financial/application/financial-entitlement.service.js';
import { financialEntitlementRepository } from '../../financial/infrastructure/repositories/financial-entitlement.repository.js';
import { walletRepository } from '../../wallet/infrastructure/repositories/wallet.repository.js';
import { recordAudit } from '../../audit-log/index.js';
import type { PoolConnection } from 'mysql2/promise';

const log = createModuleLogger('tournament-prize-award');

/** Cent-precision money rounding. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Normalize the stored `registration_payment_methods` value (NULL | JSON string |
 * | array). Defaults behave as the migration guard: NULL = both methods allowed.
 */
function resolvePaymentMethods(t: Tournament): string[] {
  const raw = (t as unknown as Record<string, unknown>).registration_payment_methods;
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Org-book accounting leg selection: a cash-only registration allowlist selects
 * the org CASH topology (Cr org MKT-CZ-PAY, cleared by settlement_org_cash_pay);
 * anything else (card-only, both, or unrestricted) uses the org CARD topology
 * (Cr org 1161 marketplace receivable). Platform-funded awards never read this.
 */
function resolveCollectionMethod(t: Tournament): PrizeCollectionMethod {
  const methods = resolvePaymentMethods(t).map((m) => m.toLowerCase());
  if (methods.length === 1 && methods[0] === 'cash') return 'cash';
  return 'card';
}

function isDuplicateKeyError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'ER_DUP_ENTRY';
}

class TournamentPrizeAwardService {
  /**
   * G11.5 — Bind prize awards for a completed tournament (Q1b/Q2b/Q5).
   *
   * Auto path (standings): resolves winners from the finalized standings
   * (rank_position → registration.player_id) when rank buckets are UNIQUE.
   * Bracket tournaments materialize no standings rows → auto bind is a natural
   * no-op; their winners are awarded via `manualGrant` (Phase-1 gap, documented
   * in the G11.5 report).
   *
   * Idempotent: awards are keyed by (tournament, placement, winner) and wallet
   * credits by UNIQUE(reference_type, reference_id). Replays of the completion
   * signals are no-ops.
   */
  async bindAwardsForTournament(
    tournamentId: number,
    opts: { bindSource?: PrizeBindSource; createdBy?: number | null } = {},
  ): Promise<TournamentPrizeAward[]> {
    const bindSource: PrizeBindSource = opts.bindSource ?? 'standings';
    const t = await tournamentRepository.findById(tournamentId);
    if (!t || !t.id) {
      log.warn({ tournamentId }, 'Award bind skipped — tournament not found');
      return [];
    }
    if (t.status !== 'completed') {
      log.info({ tournamentId, status: t.status }, 'Award bind skipped — tournament not completed');
      return [];
    }

    const prizes = (
      await tournamentRepository.findPrizesByTournament(tournamentId)
    ).filter(
      (p) =>
        p.prize_type === 'cash' &&
        p.placement != null &&
        p.placement > 0 &&
        p.amount != null &&
        Number(p.amount) > 0,
    ).sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0));

    if (!prizes.length) {
      log.info({ tournamentId }, 'Award bind — no cash prizes with placements');
      return [];
    }

    const fundingSource: PrizeFundingSource = t.organisation_id != null ? 'organization' : 'platform';
    const collectionMethod = resolveCollectionMethod(t);

    // Phase-1 eligibility guard (locked Q5 + G11.4 gap): platform/community
    // tournaments collected via CASH have no recognized revenue source to draw
    // the prize from, so they are excluded until a CASH recognition concept
    // exists. Org-owned tournaments (CARD or CASH collection) and card-collected
    // platform tournaments are eligible.
    if (fundingSource === 'platform' && collectionMethod === 'cash') {
      log.warn({ tournamentId }, 'Award bind skipped — platform cash-collected tournament has no recognized revenue source (Phase 1 guard)');
      return [];
    }

    const standings = await tournamentRepository.getStandings(tournamentId);
    const buckets = new Map<number, TournamentStandingRow[]>();
    for (const s of standings) {
      if (s.rank_position == null) continue;
      const arr = buckets.get(s.rank_position) ?? [];
      arr.push(s);
      buckets.set(s.rank_position, arr);
    }

    const created: TournamentPrizeAward[] = [];
    for (const prize of prizes) {
      const placement = prize.placement!;
      const candidates = buckets.get(placement) ?? [];
      if (candidates.length !== 1) {
        if (candidates.length === 0) {
          log.warn({ tournamentId, placement }, 'Award bind — no standings row at rank, award skipped');
        } else {
          log.warn({ tournamentId, placement, rows: candidates.length }, 'Award bind — ambiguous rank (multi-group standings), award skipped (fail-closed)');
        }
        continue;
      }
      const row = candidates[0];
      const reg = await tournamentRepository.getRegistrationById(row.registration_id);
      if (!reg) {
        log.warn({ tournamentId, placement, registrationId: row.registration_id }, 'Award bind — registration not found, award skipped');
        continue;
      }
      const winnerUserId = Number(reg.player_id ?? reg.user_id);
      if (!winnerUserId) {
        log.warn({ tournamentId, placement, registrationId: row.registration_id }, 'Award bind — registration has no player, award skipped');
        continue;
      }

      if (await tournamentPrizeAwardRepository.hasAward(tournamentId, placement, winnerUserId)) {
        log.info({ tournamentId, placement, winnerUserId }, 'Award bind — award already exists, skipped (idempotent)');
        continue;
      }

      try {
        const award = await this.createAwardWithCredit(
          t, prize, placement, row.registration_id, winnerUserId,
          fundingSource, collectionMethod, bindSource, opts.createdBy ?? null,
        );
        if (award) created.push(award);
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          log.warn({ tournamentId, placement, winnerUserId }, 'Award bind — concurrent duplicate award, skipped');
          continue;
        }
        throw err;
      }
    }

    return created;
  }

  /**
   * G11.5 — Manual grant for a specific winner (bracket/knockout tournaments,
   * or any confirmed winner without standings rows). Runs the identical
   * pipeline as the auto path: award row → wallet credit → org adjustment →
   * audit → domain event.
   */
  async manualGrant(
    tournamentId: number,
    input: { prizeId: number; winnerUserId: number; createdBy?: number | null },
  ): Promise<TournamentPrizeAward> {
    const t = await tournamentRepository.findById(tournamentId);
    if (!t || !t.id) throw new NotFoundError('Tournament not found');
    if (t.status !== 'completed') {
      throw new ConflictError('Prizes can only be granted after the tournament is completed');
    }

    const prize = (await tournamentRepository.findPrizesByTournament(tournamentId)).find((p) => p.id === input.prizeId);
    if (!prize || !prize.id) throw new NotFoundError('Prize not found in this tournament');
    if (prize.prize_type !== 'cash') throw new ConflictError('Only cash prizes can be granted as wallet payouts');
    if (prize.amount == null || Number(prize.amount) <= 0) throw new ConflictError('Prize has no positive cash amount');

    const reg = await tournamentRepository.findRegistrationForTournamentPlayer(tournamentId, input.winnerUserId);
    if (!reg) throw new NotFoundError('No confirmed registration found for this player in the tournament');

    const fundingSource: PrizeFundingSource = t.organisation_id != null ? 'organization' : 'platform';
    const collectionMethod = resolveCollectionMethod(t);
    if (fundingSource === 'platform' && collectionMethod === 'cash') {
      throw new ConflictError('Platform cash-collected tournaments have no recognized revenue source — prize grants are not supported (Phase 1 guard)');
    }

    const placement = prize.placement ?? null;
    if (placement != null && await tournamentPrizeAwardRepository.hasAward(tournamentId, placement, input.winnerUserId)) {
      throw new ConflictError(`Prize placement ${placement} is already awarded to this player`);
    }

    const award = await this.createAwardWithCredit(
      t, prize, prize.placement ?? null, reg.id!, input.winnerUserId,
      fundingSource, collectionMethod, 'manual', input.createdBy ?? null,
    );
    if (!award) throw new ConflictError('Failed to create prize award');
    return award;
  }

  /**
   * G11.5 — FULL-ONLY prize clawback while the funds are still inside the
   * winner's wallet custody (Q10b). Post-payout recovery is OUT OF SCOPE: an
   * award whose money has already been withdrawn cannot be clawed back in
   * Phase 1 (no debt/recovery system).
   */
  async refundAward(awardId: number, actorId: number | null, reason?: string): Promise<TournamentPrizeAward> {
    const award = await tournamentPrizeAwardRepository.findById(awardId);
    if (!award) throw new NotFoundError('Prize award not found');
    if (award.status !== 'credited') {
      throw new ConflictError(`Award refund requires 'credited' status (current: ${award.status})`);
    }
    assertValidPrizeAwardTransition(award.status, 'refunded');

    const amount = Number(award.amount);
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const wallet = await walletRepository.findByUserId(award.winner_user_id);
      if (!wallet) throw new ConflictError('Winner wallet not found');
      const state = await walletRepository.lockAndGetBalance(wallet.id, conn);
      if (!state) throw new ConflictError('Winner wallet is locked');
      // G11.6 — clawback must respect the canonical AVAILABLE balance
      // (balance − reserved_balance) so it can NEVER consume funds reserved by an
      // active withdrawal. The lock (FOR UPDATE) is held for the full transaction;
      // on insufficient available balance the throw rolls back every write and no
      // accounting reversal ever occurs. Clawback remains FULL-ONLY.
      if (state.balance - state.reserved_balance < amount) {
        throw new ConflictError('Insufficient available balance for full prize clawback (funds may be reserved by an active withdrawal)');
      }

      const newBalance = round2(state.balance - amount);
      await walletRepository.updateBalance(wallet.id, newBalance, state.version, conn);
      await walletRepository.createTransaction({
        walletId: wallet.id,
        type: 'prize',
        amount,
        direction: 'debit',
        referenceType: 'tournament_prize_refund',
        referenceId: awardId,
        description: `Tournament #${award.tournament_id} prize refund (full clawback)`,
      }, conn);

      await tournamentPrizeAwardRepository.updateStatus(
        awardId, 'refunded',
        { refundedAt: true, refundedBy: actorId ?? null, refundReason: reason ?? null },
        conn,
      );

      if (award.funding_source === 'organization') {
        await this.cancelAdjustmentForAward(awardId, reason ?? 'Prize full clawback (refunded)', conn);
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await recordAudit({
      actorId,
      action: 'tournament.prize.refunded',
      entityType: 'tournament_prize_award',
      entityId: awardId,
      afterState: { tournamentId: award.tournament_id, amount, currency: award.currency_code, reason: reason ?? null },
      reason: reason ?? undefined,
    });

    eventBusV2.emit('tournament:prize-refunded', {
      tournamentId: award.tournament_id,
      awardId,
      winnerUserId: award.winner_user_id,
      amount,
      currency: award.currency_code,
      organisationId: null,
      reason: reason ?? null,
    } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(award.tournament_id), aggregateVersion: 1,
    });

    const updated = await tournamentPrizeAwardRepository.findById(awardId);
    if (!updated) throw new NotFoundError('Prize award not found after refund');
    return updated;
  }

  async listAwards(tournamentId: number): Promise<TournamentPrizeAward[]> {
    return tournamentPrizeAwardRepository.findByTournament(tournamentId);
  }

  async listMyAwards(userId: number, tournamentId?: number): Promise<TournamentPrizeAward[]> {
    if (tournamentId != null) {
      return tournamentPrizeAwardRepository.findByWinnerAndTournament(userId, tournamentId);
    }
    return tournamentPrizeAwardRepository.findByWinner(userId);
  }

  async listAwardablePrizes(tournamentId: number): Promise<TournamentPrize[]> {
    const t = await tournamentRepository.findById(tournamentId);
    if (!t) throw new NotFoundError('Tournament not found');
    const prizes = await tournamentRepository.findPrizesByTournament(tournamentId);
    return prizes.filter(
      (p) => p.prize_type === 'cash' && p.amount != null && Number(p.amount) > 0,
    );
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /**
   * Atomic award creation: INSERT award (AWARDED) → wallet credit (idempotent
   * UNIQUE(reference_type, reference_id)) → status CREDITED → negative
   * ORGANIZATION_ADJUSTMENT (org-funded only) → audit → domain event emitted
   * only AFTER the transaction commits (Q12b: award finalized before
   * settlement; the accounting listener posts idempotently from the event).
   */
  private async createAwardWithCredit(
    t: Tournament,
    prize: TournamentPrize,
    placement: number | null,
    registrationId: number,
    winnerUserId: number,
    fundingSource: PrizeFundingSource,
    collectionMethod: PrizeCollectionMethod,
    bindSource: PrizeBindSource,
    createdBy: number | null,
  ): Promise<TournamentPrizeAward | null> {
    const amount = Number(prize.amount);
    const currency = (prize.currency_code ?? t.currency_code ?? 'EGP').toUpperCase();
    validatePrizeAwardAmount(amount);

    const pool = getPool();
    const conn = await pool.getConnection();
    let awardId: number | null = null;
    try {
      await conn.beginTransaction();

      awardId = await tournamentPrizeAwardRepository.create({
        tournamentId: t.id!,
        prizeId: prize.id!,
        placement,
        registrationId,
        winnerUserId,
        amount,
        currencyCode: currency,
        fundingSource,
        collectionMethod,
        bindSource,
        createdBy,
      }, conn);

      await this.creditWinnerWallet(winnerUserId, amount, awardId, t.id!, placement, conn);

      await tournamentPrizeAwardRepository.updateStatus(awardId, 'credited', { creditedAt: true }, conn);

      if (fundingSource === 'organization' && t.organisation_id != null) {
        await this.createNegativeAdjustment(t, prize.id!, awardId, placement, amount, currency, createdBy, conn);
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await recordAudit({
      actorId: createdBy,
      action: 'tournament.prize.awarded',
      entityType: 'tournament_prize_award',
      entityId: awardId!,
      afterState: {
        tournamentId: t.id, placement, winnerUserId, amount, currency,
        fundingSource, collectionMethod, bindSource,
      },
    });

    eventBusV2.emit('tournament:prize-awarded', {
      tournamentId: t.id,
      awardId: awardId!,
      winnerUserId,
      amount,
      currency,
      placement,
      fundingSource,
      collectionMethod,
      organisationId: t.organisation_id ?? null,
      bindSource,
      name: t.name,
    } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(t.id), aggregateVersion: 1,
    });

    return tournamentPrizeAwardRepository.findById(awardId!);
  }

  private async creditWinnerWallet(
    winnerUserId: number,
    amount: number,
    awardId: number,
    tournamentId: number,
    placement: number | null,
    conn: PoolConnection,
  ): Promise<void> {
    const wallet = await walletRepository.findByUserId(winnerUserId);
    if (!wallet) throw new ConflictError(`Winner wallet not found (user ${winnerUserId})`);
    const state = await walletRepository.lockAndGetBalance(wallet.id, conn);
    if (!state) throw new ConflictError('Winner wallet is locked');
    const newBalance = round2(state.balance + amount);
    await walletRepository.updateBalance(wallet.id, newBalance, state.version, conn);
    await walletRepository.createTransaction({
      walletId: wallet.id,
      type: 'prize',
      amount,
      direction: 'credit',
      referenceType: 'tournament_prize',
      referenceId: awardId,
      description: `Tournament #${tournamentId} prize (placement ${placement ?? 'special'})`,
    }, conn);
  }

  private async createNegativeAdjustment(
    t: Tournament,
    prizeId: number,
    awardId: number,
    placement: number | null,
    amount: number,
    currency: string,
    createdBy: number | null,
    conn: PoolConnection,
  ): Promise<void> {
    await financialEntitlementService.createEntitlements([{
      organisationId: t.organisation_id!,
      branchId: t.branch_id ?? null,
      entitlementType: 'ORGANIZATION_ADJUSTMENT',
      sourceType: 'tournament',
      sourceId: awardId,
      collector: 'courtzon',
      amount: -amount,
      currency,
      availableAt: new Date(),
      description: `Tournament prize award #${awardId} (org-funded, placement ${placement ?? 'special'})`,
      metadata: { awardId, tournamentId: t.id, prizeId, placement, direction: 'debit' },
      createdBy: createdBy ?? null,
    }], conn);
  }

  /**
   * On full clawback, cancel the org's negative adjustment so the organization's
   * payable position returns to zero for this award (no double-cancel, no
   * touching SETTLED rows — marked for Phase-2 recovery only).
   */
  private async cancelAdjustmentForAward(awardId: number, reason: string, conn: PoolConnection): Promise<void> {
    const ents = await financialEntitlementRepository.findBySource('tournament', awardId);
    for (const ent of ents) {
      if (ent.entitlement_type !== 'ORGANIZATION_ADJUSTMENT' || ent.collector !== 'courtzon') continue;
      if (ent.status === 'CANCELLED' || ent.status === 'SETTLED') continue;
      await financialEntitlementRepository.persistTransition(
        ent.id, 'CANCELLED', ent.aggregate_version,
        { cancelled_reason: reason },
        conn,
      );
    }
  }
}

export const tournamentPrizeAwardService = new TournamentPrizeAwardService();