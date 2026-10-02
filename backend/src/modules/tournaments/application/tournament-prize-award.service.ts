import { getPool } from '../../../database/mysql.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { tournamentPrizeAwardRepository } from '../infrastructure/repositories/tournament-prize-award.repository.js';
import { participantDrawRepository } from '../infrastructure/repositories/participant-draw.repository.js';
import type {
  Tournament,
  TournamentPrize,
  TournamentPrizeAward,
  TournamentPlacement,
  PrizeFundingSource,
  PrizeCollectionMethod,
  PrizeBindSource,
  PrizeAwardStatus,
  TournamentStandingRow,
} from '../domain/tournament-aggregate.js';
import { validatePrizeAwardAmount, assertValidPrizeAwardTransition, isEligiblePrizeRegistration } from '../domain/tournament-aggregate.js';
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

    // G11 Phase 3 (LOCKED PRODUCT RULE) — prize funding is ORGANIZATION-ONLY.
    // `PrizeFundingSource` is no longer a runtime choice: the CourtZon platform
    // never funds a prize, so the funding source is always the owning
    // organisation. An org-less tournament is a LEGACY row only (creation has been
    // organisation-scoped since Phase 3) — it is skipped fail-closed because the
    // platform-funded prize concepts no longer exist.
    if (t.organisation_id == null) {
      log.warn({ tournamentId }, 'Award bind skipped — tournament has no owning organisation; the platform never funds a prize (fail-closed)');
      return [];
    }
    const fundingSource: PrizeFundingSource = 'organization';
    const collectionMethod = resolveCollectionMethod(t);

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

      // G11.18 C1 — standings binding is competition-scoped too: the prize's
      // competition must match the winning registration's competition.
      const competitionId = prize.competition_id != null ? Number(prize.competition_id) : null;
      if (competitionId != null && reg.competition_id != null && Number(reg.competition_id) !== competitionId) {
        log.warn({ tournamentId, placement, competitionId, regCompetitionId: reg.competition_id }, 'Award bind — registration belongs to a different competition, skipped');
        continue;
      }

      if (await tournamentPrizeAwardRepository.hasAward(tournamentId, competitionId, placement, winnerUserId)) {
        log.info({ tournamentId, placement, competitionId, winnerUserId }, 'Award bind — award already exists in this competition, skipped (idempotent)');
        continue;
      }

      try {
        const award = await this.createAwardWithCredit(
          t, prize, placement, competitionId, row.registration_id, winnerUserId,
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
   * G11.7 B2 / G11.15 — Bind prize awards for bracket/knockout tournaments on
   * `tournament:completed`.
   *
   * G11.15 — the AUTHORITATIVE payout identity is `tournament_placements` (the
   * G11.14 fail-closed placement resolver). When authoritative placements exist
   * (placement 1..N), every placement with a configured CASH prize is bound
   * through the SAME pipeline as placement 1 today:
   *   placement 2 auto-binds when the placements table holds placement=2;
   *   placement 3 auto-binds ONLY when the placements table holds placement=3
   *   (standard 8/16/32 brackets typically resolve only 1 and 2 — placement 3
   *   stays absent and nothing is paid; NEVER guessed).
   *
   * Backward compatibility: when the placements table is EMPTY (a tournament
   * completed before placement capture, e.g. legacy/G11.5-era data), the pre-G11.15
   * champion path (`tournament:completed.winnerId` → placement 1) is preserved
   * exactly, now ALSO guarded by registration eligibility.
   *
   * Reuses the ENTIRE financial pipeline: funding/collection resolvers, the
   * atomic `createAwardWithCredit` (award → wallet credit → accounting → org
   * adjustment → audit → `tournament:prize-awarded`) and `hasAward` idempotency.
   */
  async bindAwardsForBracket(
    tournamentId: number,
    winnerUserId: number | null | undefined,
    opts: { createdBy?: number | null } = {},
  ): Promise<TournamentPrizeAward[]> {
    const t = await tournamentRepository.findById(tournamentId);
    if (!t || !t.id) {
      log.warn({ tournamentId }, 'Bracket bind skipped — tournament not found');
      return [];
    }
    if (t.status !== 'completed') {
      log.info({ tournamentId, status: t.status }, 'Bracket bind skipped — tournament not completed');
      return [];
    }

    // G11 Phase 3 — same organization-only rule as standings binding: the
    // platform never funds a prize, so an org-less (LEGACY) tournament is skipped
    // fail-closed.
    if (t.organisation_id == null) {
      log.warn({ tournamentId }, 'Bracket bind skipped — tournament has no owning organisation; the platform never funds a prize (fail-closed)');
      return [];
    }
    const fundingSource: PrizeFundingSource = 'organization';
    const collectionMethod = resolveCollectionMethod(t);
    const prizes = await tournamentRepository.findPrizesByTournament(tournamentId);

    // ── G11.15 authoritative path: consume tournament_placements. ──────────
    const placements = await tournamentRepository.findPlacements(tournamentId);
    if (placements.length > 0) {
      const created: TournamentPrizeAward[] = [];
      for (const pl of placements) {
        // G11.18 C1 — the competition comes from the AUTHORITATIVE placement row.
        // A cash prize for the placement is only eligible within that competition
        // (Singles 1st never selects the Teams 1st prize and vice versa).
        const competitionId = pl.competition_id != null ? Number(pl.competition_id) : null;
        const prize = this.cashPrizeAtPlacement(prizes, Number(pl.placement), competitionId);
        if (!prize || !prize.id) {
          log.info({ tournamentId, placement: pl.placement, competitionId }, 'Bracket bind — no cash prize for placement in this competition, skipped');
          continue;
        }
        const recipient = await this.resolveEligiblePlacementRecipient(tournamentId, pl);
        if (!recipient) {
          log.warn({ tournamentId, placement: pl.placement, competitionId, participantId: pl.participant_id }, 'Bracket bind — placed winner has no provable eligible registration, skipped (fail-closed)');
          continue;
        }
        const placement = Number(pl.placement);
        if (await tournamentPrizeAwardRepository.hasAward(tournamentId, competitionId, placement, recipient.winnerUserId)) {
          log.info({ tournamentId, placement, competitionId, winnerUserId: recipient.winnerUserId }, 'Bracket bind — award already exists for this competition, skipped (idempotent)');
          continue;
        }
        try {
          const award = await this.createAwardWithCredit(
            t, prize, placement, competitionId, recipient.registrationId, recipient.winnerUserId,
            fundingSource, collectionMethod, 'bracket', opts.createdBy ?? null,
          );
          if (award) created.push(award);
        } catch (err) {
          if (isDuplicateKeyError(err)) {
            log.warn({ tournamentId, placement, competitionId, winnerUserId: recipient.winnerUserId }, 'Bracket bind — concurrent duplicate award, skipped');
            continue;
          }
          throw err;
        }
      }
      return created;
    }

    // ── Legacy champion path (placements table empty) — unchanged semantics. ──
    if (!winnerUserId) {
      log.warn({ tournamentId }, 'Bracket bind skipped — no winnerUserId (missing/invalid champion) and no authoritative placements');
      return [];
    }
    // Champion registration (same lookup manualGrant uses for bracket winners).
    const reg = await tournamentRepository.findRegistrationForTournamentPlayer(tournamentId, winnerUserId);
    if (!reg || !reg.id) {
      log.warn({ tournamentId, winnerUserId }, 'Bracket bind skipped — champion registration not found');
      return [];
    }
    // G11.15 — eligibility guard also protects the legacy champion path.
    if (!isEligiblePrizeRegistration(reg.status, reg.payment_status)) {
      log.warn({ tournamentId, winnerUserId, status: reg.status, paymentStatus: reg.payment_status }, 'Bracket bind skipped — champion registration is not eligible');
      return [];
    }

    // Placement-1 cash prize, deterministic first by catalog order, scoped to the
    // champion registration's COMPETITION (G11.18 C1 — never guesses another comp).
    const competitionId = reg.competition_id != null ? Number(reg.competition_id) : null;
    const prize = this.cashPrizeAtPlacement(prizes, 1, competitionId);
    if (!prize || !prize.id) {
      log.info({ tournamentId, winnerUserId, competitionId }, 'Bracket bind skipped — no eligible placement-1 cash prize in this competition');
      return [];
    }

    if (await tournamentPrizeAwardRepository.hasAward(tournamentId, competitionId, 1, winnerUserId)) {
      log.info({ tournamentId, winnerUserId, competitionId }, 'Bracket bind skipped — placement-1 award already exists in this competition (idempotent/manual-granted)');
      return [];
    }

    try {
      const award = await this.createAwardWithCredit(
        t, prize, 1, competitionId, reg.id, winnerUserId,
        fundingSource, collectionMethod, 'bracket', opts.createdBy ?? null,
      );
      return award ? [award] : [];
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        log.warn({ tournamentId, winnerUserId, competitionId }, 'Bracket bind — concurrent duplicate award, skipped');
        return [];
      }
      throw err;
    }
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

    // G11.15 — PLACEMENT INTEGRITY: the authoritative `tournament_placements`
    // table is the ONLY source of payout identity. A manual grant can NEVER pay
    // an arbitrary registered player, and it can NEVER bypass bracket outcomes.
    const placement = prize.placement ?? null;
    if (placement == null) {
      throw new ConflictError(
        'Prize has no ranked placement — manual grant requires an authoritative tournament placement',
        ErrorCodes.TOURNAMENT_PLACEMENT_MISSING,
      );
    }
    const authoritativePlacement = (await tournamentRepository.findPlacements(tournamentId))
      .find((p) => Number(p.placement) === placement
        && (prize.competition_id == null || Number(p.competition_id) === Number(prize.competition_id)));
    if (!authoritativePlacement) {
      throw new ConflictError(
        `No authoritative placement ${placement} in this competition exists — manual grant rejected (placement integrity)`,
        ErrorCodes.TOURNAMENT_PLACEMENT_MISSING,
      );
    }
    if (Number(authoritativePlacement.user_id) !== Number(input.winnerUserId)) {
      throw new ConflictError(
        `Placement ${placement} belongs to a different player — manual grant rejected (placement integrity)`,
        ErrorCodes.TOURNAMENT_PLACEMENT_MISMATCH,
      );
    }
    const recipient = await this.resolveEligiblePlacementRecipient(tournamentId, authoritativePlacement);
    if (!recipient) {
      throw new ConflictError(
        'The placed winner has no eligible (registered/confirmed, not refunded) registration — manual grant rejected',
        ErrorCodes.TOURNAMENT_REGISTRATION_NOT_ELIGIBLE,
      );
    }

    // G11 Phase 3 — prize funding is organization-only, so a tournament with no
    // owning organisation can never have a prize granted (fail-closed).
    if (t.organisation_id == null) {
      throw new ConflictError('Tournament has no owning organisation — the CourtZon platform never funds a prize');
    }
    const fundingSource: PrizeFundingSource = 'organization';
    const collectionMethod = resolveCollectionMethod(t);

    // G11.18 C1 — the competition comes from the AUTHORITATIVE placement row (or
    // the selected prize's own competition); a grant in Competition A never
    // blocks the same player in Competition B.
    const competitionId = authoritativePlacement.competition_id != null
      ? Number(authoritativePlacement.competition_id)
      : (prize.competition_id != null ? Number(prize.competition_id) : null);

    if (await tournamentPrizeAwardRepository.hasAward(tournamentId, competitionId, placement, input.winnerUserId)) {
      throw new ConflictError(`Prize placement ${placement} is already awarded to this player in this competition`);
    }

    const award = await this.createAwardWithCredit(
      t, prize, placement, competitionId, recipient.registrationId, input.winnerUserId,
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

  /** The single eligible CASH prize for a placement WITHIN ONE COMPETITION (G11.18 C1 — competition-scoped; ambiguous/missing context fails closed). */
  private cashPrizeAtPlacement(prizes: TournamentPrize[], placement: number, competitionId: number | null | undefined): TournamentPrize | undefined {
    return prizes.filter(
      (p) => Number(p.placement) === placement
        && p.prize_type === 'cash'
        && p.amount != null && Number(p.amount) > 0
        && (competitionId == null || Number(p.competition_id) === Number(competitionId)),
    ).sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || (a.id ?? 0) - (b.id ?? 0),
    )[0];
  }

  /**
   * G11.15 — resolve the PAYABLE recipient for an authoritative placement row.
   *
   * FAIL-CLOSED (returns null on ANY unprovable step — nothing is ever paid on
   * a guess):
   *   1. the placed participant must exist and be ACTIVE (never withdrawn /
   *      disqualified / waiting);
   *   2. the placement's `user_id` (primary member mirror) must be a member of
   *      that participant AND its unique ACTIVE participant in the tournament;
   *   3. the registration resolved from the participant (its own
   *      `registration_id`, or the user's tournament registration for pair/team
   *      participants) must be ELIGIBLE: status registered/confirmed, payment
   *      not refunded (withdrawn -> reject, disqualified -> reject, waiting ->
   *      reject);
   *   4. provable identity: the paid `player_id` of the selected registration
   *      must equal the placement `user_id`.
   */
  private async resolveEligiblePlacementRecipient(
    tournamentId: number,
    placementRow: TournamentPlacement,
  ): Promise<{ registrationId: number; winnerUserId: number } | null> {
    if (placementRow.participant_id == null || placementRow.user_id == null) return null;
    const participant = await participantDrawRepository.findParticipantById(Number(placementRow.participant_id));
    if (!participant) return null;
    if (String(participant.status) !== 'active') return null;

    const payee = Number(placementRow.user_id);
    const members = Array.isArray(participant.member_user_ids) ? participant.member_user_ids : [];
    if (!members.some((m) => m != null && Number(m) === payee)) return null;

    // Prove the placed participant is the user's UNIQUE ACTIVE participant IN THE
    // PLACEMENT'S COMPETITION (uk_active_user_competition is the DB backstop;
    // G11.18 C1 — a user active in two competitions of one tournament resolves
    // independently in each; tournament-wide uniqueness falls back for legacy).
    const competitionId = placementRow.competition_id != null ? Number(placementRow.competition_id) : null;
    const active = competitionId != null
      ? await participantDrawRepository.findActiveParticipantByPlayerInCompetition(tournamentId, competitionId, payee)
      : await participantDrawRepository.findActiveParticipantByPlayer(tournamentId, payee);
    if (!active || Number(active.id) !== Number(participant.id)) return null;

    // Registration: prefer the participant's own registration (individual),
    // else the user's tournament registration (pair/team participants carry
    // registration_id NULL and each member registers under their own player row).
    const reg = participant.registration_id != null
      ? await tournamentRepository.getRegistrationById(Number(participant.registration_id))
      : await tournamentRepository.findRegistrationForTournamentPlayer(tournamentId, payee);
    if (!reg || !reg.id) return null;
    if (!isEligiblePrizeRegistration(reg.status, reg.payment_status)) return null;
    if (Number(reg.player_id ?? reg.user_id) !== payee) return null;

    return { registrationId: Number(reg.id), winnerUserId: payee };
  }

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
    competitionId: number | null,
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
        competitionId,
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