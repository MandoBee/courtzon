import { participantDrawRepository } from '../infrastructure/repositories/participant-draw.repository.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { tournamentService } from './tournament.service.js';
import type {
  Tournament,
  TournamentParticipant,
  TournamentParticipantMember,
  TournamentSeed,
  TournamentDraw,
  TournamentDrawEntry,
  DrawImpact,
} from '../domain/tournament-aggregate.js';
import { seededShuffle } from '../domain/tournament-aggregate.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { emitTournamentScoped } from './tournament-realtime-scope.js';
import { recordAudit } from '../../audit-log/index.js';
import { ratingRepository } from '../../match-result/infrastructure/rating.repository.js';
import { ratingService } from '../../match-result/application/rating/rating.service.js';
import { getPool } from '../../../database/mysql.js';

/**
 * Group 5 — Participant, Seeding & Draw foundation (approved continuation).
 *
 * Separates the three concepts that must never be conflated:
 *   GLOBAL RATING   — lives in the rating module; NEVER mutated from seeding.
 *   TOURNAMENT SEED — tournament-scoped, source rating|manual, authoritative,
 *                     preserved across Auto Re-Draws, never recalculated by a draw.
 *   DRAW POSITION   — placement in a specific draw attempt; may change on
 *                     re-draw / manual adjustment without touching the seed.
 *
 * Existing individual registrations map 1:1 into participants (compatibility);
 * historical matches/results keep their user-id references untouched.
 */
export class ParticipantDrawService {
  /**
   * Materialize the authoritative participant set for a tournament from its
   * individual registrations. Safe to call repeatedly (idempotent by the
   * (tournament_id, registration_id) unique key). Preserves legacy `seed_rank`
   * as an initial manual seed (source=manual, compatibility mapping) so the new
   * foundation does not lose historical seeding.
   */
  async syncParticipants(tournamentId: number): Promise<number> {
    const registrations = await tournamentRepository.findRegistrationsByTournament(tournamentId);
    let created = 0;
    for (const reg of registrations) {
      if (reg.status !== 'registered' && reg.status !== 'confirmed') continue;
      const playerId = reg.player_id ?? reg.user_id;
      if (playerId == null) continue;
      const existing = await participantDrawRepository.findParticipantByRegistration(tournamentId, reg.id!);
      if (existing) continue;
      const participantId = await participantDrawRepository.createParticipant({
        tournament_id: tournamentId,
        registration_id: reg.id,
        participant_type: 'individual',
        status: 'active',
        member_user_ids: [playerId],
      });
      created += 1;
      // Group 7 — the authoritative normalized member row (individual = 1 member).
      const { participantMemberRepository } = await import('../infrastructure/repositories/participant-member.repository.js');
      await participantMemberRepository.addMember({
        tournament_id: tournamentId,
        participant_id: participantId,
        user_id: playerId,
        member_order: 0,
      });
      // Legacy compatibility: the registration seed (seed_rank) becomes an
      // authoritative manual seed — never recalculated by a draw.
      if (reg.seed != null && !(await participantDrawRepository.findSeedByParticipant(participantId))) {
        await participantDrawRepository.createSeed({
          tournament_id: tournamentId,
          participant_id: participantId,
          seed_number: Number(reg.seed),
          source: 'manual',
          assigned_by: null,
          reason: 'legacy registration seed_rank',
        });
      }
    }
    return created;
  }

  /** Participants joined with their authoritative seed + current draw position + live global rating. */
  async listParticipants(tournamentId: number): Promise<Array<TournamentParticipant & { global_rating?: number | null; global_rating_matches?: number | null }>> {
    await this.syncParticipants(tournamentId);
    const t = await this.getTournament(tournamentId);
    const rows = await participantDrawRepository.listParticipantsByTournament(tournamentId);
    const { participantMemberRepository } = await import('../infrastructure/repositories/participant-member.repository.js');
    const members = await participantMemberRepository.listMembersByTournament(tournamentId);
    const membersByParticipant = new Map<number, Array<TournamentParticipantMember & { full_name?: string | null }>>();
    for (const m of members) {
      const pid = Number(m.participant_id);
      const arr = membersByParticipant.get(pid) ?? [];
      arr.push(m);
      membersByParticipant.set(pid, arr);
    }
    const out: Array<TournamentParticipant & { global_rating?: number | null; global_rating_matches?: number | null }> = [];
    for (const r of rows) {
      const seed = r.seed_number != null
        ? {
            tournament_id: tournamentId,
            participant_id: r.id!,
            seed_number: Number(r.seed_number),
            source: (r.seed_source ?? 'manual') as 'rating' | 'manual',
            assigned_by: r.seed_assigned_by ?? null,
            assigned_at: r.seed_assigned_at ?? undefined,
            rating_snapshot: r.rating_snapshot != null ? Number(r.rating_snapshot) : null,
            rating_matches_played: r.rating_matches_played != null ? Number(r.rating_matches_played) : null,
            reason: r.seed_reason ?? null,
          } as TournamentSeed
        : null;
      const memberUserIds = Array.isArray(r.member_user_ids) ? r.member_user_ids : [];
      const playerId = memberUserIds[0] ?? r.player_id ?? null;
      const participantMembers = membersByParticipant.get(Number(r.id)) ?? [];
      const participantType = r.participant_type ?? 'individual';
      const displayName = r.name ?? r.display_name ?? (participantType === 'individual' ? (participantMembers[0]?.full_name ?? `Player #${playerId}`) : `Participant #${r.id}`);
      let globalRating: number | null = null;
      let globalMatches: number | null = null;
      if (playerId != null && t.sport_id != null) {
        try {
          const rating = await ratingRepository.getRating(Number(playerId), t.sport_id);
          globalRating = rating ? Number(rating.overallPercent) : null;
          globalMatches = rating ? Number(rating.matchesCount) : null;
        } catch {
          // rating resolution is display-only — never fatal
        }
      }
      out.push({
        id: r.id,
        tournament_id: r.tournament_id,
        registration_id: r.registration_id,
        participant_type: participantType,
        status: r.status,
        member_user_ids: memberUserIds,
        name: r.name ?? null,
        player_id: playerId,
        display_name: displayName,
        members: participantMembers,
        seed,
        draw_position: r.draw_position != null ? Number(r.draw_position) : null,
        draw_placement_source: (r.draw_placement_source as 'auto' | 'manual' | null) ?? null,
        global_rating: globalRating,
        global_rating_matches: globalMatches,
      });
    }
    return out;
  }

  /**
   * Assign / change a participant's authoritative tournament seed.
   * Validation: duplicate seed number rejected, invalid number rejected, number
   * outside the active-participant range rejected, same participant cannot hold
   * multiple seeds (single authoritative row). Manual seeds need NO rating;
   * rating-derived seeds freeze the rating snapshot (never live, never mutated).
   */
  async assignSeed(
    tournamentId: number,
    participantId: number,
    input: { seedNumber: number; source: 'rating' | 'manual'; reason?: string },
    actorId: number,
  ): Promise<TournamentSeed> {
    await this.syncParticipants(tournamentId);
    const t = await this.getTournament(tournamentId);
    const participant = await this.assertParticipantBelongsToTournament(tournamentId, participantId);

    const seedNumber = Number(input.seedNumber);
    if (!Number.isInteger(seedNumber) || seedNumber < 1) {
      throw new ConflictError('Seed number must be a positive integer', ErrorCodes.TOURNAMENT_INVALID_SEED);
    }
    const participantCount = await participantDrawRepository.countParticipantsByTournament(tournamentId);
    if (seedNumber > participantCount) {
      throw new ConflictError(
        `Seed number ${seedNumber} is outside the valid range 1..${participantCount}`,
        ErrorCodes.TOURNAMENT_INVALID_SEED,
      );
    }

    // Duplicate seed number (another participant already holds it) → reject.
    const existingForNumber = await participantDrawRepository.findSeedByNumber(tournamentId, seedNumber);
    if (existingForNumber && Number(existingForNumber.participant_id) !== participantId) {
      throw new ConflictError(
        `Seed #${seedNumber} is already assigned to another participant`,
        ErrorCodes.TOURNAMENT_SEED_DUPLICATE,
      );
    }

    let ratingSnapshot: number | null = null;
    let ratingMatches: number | null = null;
    if (input.source === 'rating') {
      const memberUserIds = Array.isArray(participant.member_user_ids) ? participant.member_user_ids : [];
      const playerId = memberUserIds[0] ?? (participant as any).player_id ?? null;
      if (playerId == null || t.sport_id == null) {
        throw new ConflictError('Rating-derived seeding requires the participant user and tournament sport', ErrorCodes.TOURNAMENT_INVALID_SEED);
      }
      // Snapshot the authoritative rating (percent) — NEVER the live value later.
      const overall = await ratingService.resolveOverallPercent(Number(playerId), t.sport_id);
      ratingSnapshot = Math.round(overall * 10000) / 10000;
      try {
        const rating = await ratingRepository.getRating(Number(playerId), t.sport_id);
        ratingMatches = rating ? Number(rating.matchesCount) : null;
      } catch { /* non-fatal */ }
    }

    const existing = await participantDrawRepository.findSeedByParticipant(participantId);
    let seed: TournamentSeed;
    if (existing) {
      await participantDrawRepository.updateSeed(existing.id!, {
        seed_number: seedNumber,
        source: input.source,
        assigned_by: actorId,
        rating_snapshot: ratingSnapshot,
        rating_matches_played: ratingMatches,
        reason: input.reason ?? null,
      });
      seed = (await participantDrawRepository.findSeedByParticipant(participantId))!;
      await recordAudit({
        actorId,
        action: 'TOURNAMENT.SEED_CHANGED',
        entityType: 'tournament_seed',
        entityId: existing.id,
        beforeState: { seed_number: Number(existing.seed_number), source: existing.source },
        afterState: { seed_number: seedNumber, source: input.source, rating_snapshot: ratingSnapshot },
      });
    } else {
      const id = await participantDrawRepository.createSeed({
        tournament_id: tournamentId,
        participant_id: participantId,
        seed_number: seedNumber,
        source: input.source,
        assigned_by: actorId,
        rating_snapshot: ratingSnapshot,
        rating_matches_played: ratingMatches,
        reason: input.reason ?? null,
      });
      seed = (await participantDrawRepository.findSeedByParticipant(participantId))!;
      await recordAudit({
        actorId,
        action: 'TOURNAMENT.SEED_ASSIGNED',
        entityType: 'tournament_seed',
        entityId: id,
        afterState: { participant_id: participantId, seed_number: seedNumber, source: input.source, rating_snapshot: ratingSnapshot },
      });
    }

    const seedScopeUserIds = [
        ...(Array.isArray(participant.member_user_ids) ? participant.member_user_ids : []),
        (participant as any).player_id ?? null,
      ];
    await emitTournamentScoped('tournament:seed-updated', {
      tournamentId,
      participantId,
      seedNumber,
      source: input.source,
    } as Record<string, unknown>, t, seedScopeUserIds);
    return seed;
  }

  /**
   * Generate (or re-generate) the draw. Re-draw = regenerate PLACEMENT only —
   * seeds are NEVER regenerated. Each attempt is a new, auditable draw row.
   * Deterministic for the same participants + seeds + draw_seed.
   */
  async generateDraw(tournamentId: number, actorId: number, drawSeed?: number): Promise<TournamentDraw> {
    await this.syncParticipants(tournamentId);
    const current = await participantDrawRepository.findCurrentDraw(tournamentId);
    if (current && current.status === 'locked') {
      throw new ConflictError('The draw is locked and cannot be regenerated', ErrorCodes.TOURNAMENT_DRAW_LOCKED);
    }
    const participants = await participantDrawRepository.listParticipantsByTournament(tournamentId);
    if (participants.length < 2) {
      throw new ConflictError('At least 2 participants are required to generate a draw', ErrorCodes.TOURNAMENT_CAPACITY_EXCEEDED);
    }

    const attempt = await participantDrawRepository.getNextDrawAttempt(tournamentId);
    const seed = drawSeed ?? Date.now();

    // Placement rule (foundation): seeded participants hold the protected top
    // positions in ascending seed order; unseeded participants are seeded-
    // shuffled into the remaining positions. Re-draw with a different draw_seed
    // reshuffles unseeded placements while seeds stay authoritative.
    const seeded = participants
      .filter((p) => p.seed_number != null)
      .sort((a, b) => Number(a.seed_number) - Number(b.seed_number));
    const unseeded = participants.filter((p) => p.seed_number == null);
    const shuffledUnseeded = seededShuffle(unseeded, seed);
    const order = [...seeded, ...shuffledUnseeded];

    await participantDrawRepository.clearCurrentDraws(tournamentId);
    const drawId = await participantDrawRepository.createDraw({
      tournament_id: tournamentId,
      attempt_number: attempt,
      draw_seed: seed,
      generated_by: actorId,
    });
    for (let i = 0; i < order.length; i++) {
      await participantDrawRepository.createDrawEntry({
        draw_id: drawId,
        participant_id: order[i].id!,
        position: i,
        placement_source: 'auto',
      });
    }

    await recordAudit({
      actorId,
      action: attempt > 1 ? 'TOURNAMENT.DRAW_REGENERATED' : 'TOURNAMENT.DRAW_GENERATED',
      entityType: 'tournament_draw',
      entityId: drawId,
      afterState: { attempt_number: attempt, draw_seed: seed, participants: order.length },
    });

    const draw = await this.getDrawWithEntries(drawId);
    const t = await this.getTournament(tournamentId);
    const drawScopeUserIds = order.flatMap((p) => [
      ...(Array.isArray((p as any).member_user_ids) ? (p as any).member_user_ids : []),
      (p as any).player_id ?? null,
    ]);
    await emitTournamentScoped('tournament:draw-generated', {
      tournamentId,
      attemptNumber: attempt,
      drawSeed: seed,
      status: 'draft',
    } as Record<string, unknown>, t, drawScopeUserIds);
    return draw;
  }

  async listDraws(tournamentId: number): Promise<TournamentDraw[]> {
    const draws = await participantDrawRepository.listDrawsByTournament(tournamentId);
    return Promise.all(draws.map((d) => this.getDrawWithEntries(d.id!)));
  }

  async getCurrentDraw(tournamentId: number): Promise<TournamentDraw | null> {
    const draw = await participantDrawRepository.findCurrentDraw(tournamentId);
    if (!draw) return null;
    return this.getDrawWithEntries(draw.id!);
  }

  private async getDrawWithEntries(drawId: number): Promise<TournamentDraw> {
    const draw = await participantDrawRepository.findDrawById(drawId);
    if (!draw) throw new NotFoundError('Draw', ErrorCodes.TOURNAMENT_NOT_FOUND);
    const entries = await participantDrawRepository.findDrawEntries(drawId);
    return { ...draw, entries };
  }

  /**
   * Validate the current draw against the foundation seeding rule. Returns a
   * structured result the UI can show as a warning — never silently accepts a
   * violation.
   */
  async validateDraw(tournamentId: number): Promise<{ valid: boolean; reason?: string; seed?: number; message?: string }> {
    const draw = await participantDrawRepository.findCurrentDraw(tournamentId);
    if (!draw) return { valid: true };
    const entries = await participantDrawRepository.findDrawEntries(draw.id!);
    const participants = await participantDrawRepository.listParticipantsByTournament(tournamentId);
    return this.evaluateSeedingRule(entries, participants);
  }

  /**
   * Manual placement (swap) foundation. Moving a seeded participant in a way
   * that breaks the seeding rule is rejected with a structured violation UNLESS
   * the administrator explicitly overrides (override=true) — the seed is kept,
   * the entry is marked overridden, and the draw validation_status records it.
   */
  async moveParticipant(
    tournamentId: number,
    participantId: number,
    position: number,
    actorId: number,
    opts: { override?: boolean } = {},
  ): Promise<{ valid: boolean; reason?: string; seed?: number; message?: string; draw?: TournamentDraw }> {
    await this.syncParticipants(tournamentId);
    const draw = await participantDrawRepository.findCurrentDraw(tournamentId);
    if (!draw) throw new ConflictError('No draw has been generated yet', ErrorCodes.TOURNAMENT_DRAW_NOT_FOUND);
    if (draw.status === 'locked') throw new ConflictError('The draw is locked', ErrorCodes.TOURNAMENT_DRAW_LOCKED);

    const participants = await participantDrawRepository.listParticipantsByTournament(tournamentId);
    const target = Number(position);
    if (!Number.isInteger(target) || target < 0 || target >= participants.length) {
      throw new ConflictError(`Position ${position} is outside the valid range`, ErrorCodes.TOURNAMENT_INVALID_SEED);
    }
    await this.assertParticipantBelongsToTournament(tournamentId, participantId);

    const mover = await participantDrawRepository.findEntryByParticipant(draw.id!, participantId);
    if (!mover) throw new ConflictError('Participant is not placed in the current draw', ErrorCodes.TOURNAMENT_DRAW_NOT_FOUND);
    if (Number(mover.position) === target) {
      return { valid: true, draw: await this.getDrawWithEntries(draw.id!) };
    }

    // Simulate the swap and check the seeding rule.
    const entries = await participantDrawRepository.findDrawEntries(draw.id!);
    const simulated = entries.map((e) =>
      Number(e.participant_id) === participantId ? { ...e, position: target } : e,
    );
    const violation = this.evaluateSeedingRule(simulated as TournamentDrawEntry[], participants);
    if (!violation.valid && !opts.override) {
      return violation;
    }

    // Commit the swap.
    const occupant = await participantDrawRepository.findEntryByPosition(draw.id!, target);
    await participantDrawRepository.updateDrawEntry(mover.id!, {
      position: target,
      placement_source: 'manual',
      overridden: opts.override === true && !violation.valid,
      moved_by: actorId,
    });
    if (occupant && Number(occupant.id) !== Number(mover.id)) {
      await participantDrawRepository.updateDrawEntry(occupant.id!, {
        position: Number(mover.position),
        placement_source: 'manual',
        overridden: Number(occupant.overridden) === 1,
        moved_by: actorId,
      });
    }

    const anyManual = (await participantDrawRepository.findDrawEntries(draw.id!)).some((e) => e.placement_source === 'manual');
    const anyOverride = (await participantDrawRepository.findDrawEntries(draw.id!)).some((e) => Number(e.overridden) === 1);
    await participantDrawRepository.updateDraw(draw.id!, {
      validation_status: anyOverride ? 'seeding_violation' : anyManual ? 'manually_modified' : 'valid',
    });

    await recordAudit({
      actorId,
      action: opts.override === true && !violation.valid ? 'TOURNAMENT.SEEDING_VIOLATION_OVERRIDE' : 'TOURNAMENT.MANUAL_PLACEMENT',
      entityType: 'tournament_draw_entry',
      entityId: mover.id,
      afterState: { participant_id: participantId, position: target, override: opts.override === true && !violation.valid },
    });

    const t = await this.getTournament(tournamentId);
    const moverRow = participants.find((p) => Number(p.id) === participantId);
    await emitTournamentScoped('tournament:draw-updated', { tournamentId, drawId: draw.id } as Record<string, unknown>, t, [
      ...(Array.isArray((moverRow as any)?.member_user_ids) ? (moverRow as any).member_user_ids : []),
      (moverRow as any)?.player_id ?? null,
    ]);
    return { valid: true, draw: await this.getDrawWithEntries(draw.id!) };
  }

  async approveDraw(tournamentId: number, actorId: number): Promise<TournamentDraw> {
    const draw = await participantDrawRepository.findCurrentDraw(tournamentId);
    if (!draw) throw new ConflictError('No draw has been generated yet', ErrorCodes.TOURNAMENT_DRAW_NOT_FOUND);
    if (draw.status === 'locked') throw new ConflictError('The draw is already locked', ErrorCodes.TOURNAMENT_DRAW_LOCKED);
    const validation = await this.validateDraw(tournamentId);
    if (!validation.valid) {
      throw new ConflictError(
        validation.message ?? 'The draw has unresolved seeding-rule violations',
        ErrorCodes.TOURNAMENT_DRAW_INVALID,
      );
    }
    await participantDrawRepository.updateDraw(draw.id!, { status: 'approved' });
    await recordAudit({ actorId, action: 'TOURNAMENT.DRAW_APPROVED', entityType: 'tournament_draw', entityId: draw.id });
    const tApproved = await this.getTournament(tournamentId);
    await emitTournamentScoped('tournament:draw-updated', { tournamentId, drawId: draw.id, status: 'approved' } as Record<string, unknown>, tApproved);
    return this.getDrawWithEntries(draw.id!);
  }

  async lockDraw(tournamentId: number, actorId: number): Promise<TournamentDraw> {
    const draw = await participantDrawRepository.findCurrentDraw(tournamentId);
    if (!draw) throw new ConflictError('No draw has been generated yet', ErrorCodes.TOURNAMENT_DRAW_NOT_FOUND);
    if (draw.status !== 'approved') throw new ConflictError('The draw must be approved before it can be locked', ErrorCodes.TOURNAMENT_DRAW_INVALID);
    await participantDrawRepository.updateDraw(draw.id!, { status: 'locked' });
    await recordAudit({ actorId, action: 'TOURNAMENT.DRAW_LOCKED', entityType: 'tournament_draw', entityId: draw.id });
    const tLocked = await this.getTournament(tournamentId);
    await emitTournamentScoped('tournament:draw-updated', { tournamentId, drawId: draw.id, status: 'locked' } as Record<string, unknown>, tLocked);
    return this.getDrawWithEntries(draw.id!);
  }

  /**
   * Foundation seeding rule: seeded participants occupy positions
   * 0..seededCount-1 in ascending seed order; unseeded occupy the rest.
   * Returns a structured violation with the offending seed when broken.
   */
  private evaluateSeedingRule(
    entries: Array<TournamentDrawEntry & { display_name?: string | null; seed_number?: number | null; participant_type?: string | null }>,
    participants: Array<TournamentParticipant & { seed_number?: number | null; seed_source?: string | null; display_name?: string | null }>,
  ): { valid: boolean; reason?: string; seed?: number; message?: string } {
    const seedById = new Map<number, number>();
    for (const p of participants) {
      if (p.seed_number != null && p.id != null) seedById.set(p.id, Number(p.seed_number));
    }
    const seededCount = seedById.size;
    const positionByParticipant = new Map<number, number>();
    for (const e of entries) {
      if (e.participant_id != null) positionByParticipant.set(e.participant_id, Number(e.position));
    }

    // Build a seeded-ordered check: every seeded participant must be within
    // 0..seededCount-1 AND their positions must be in ascending seed order.
    const seededSorted = [...seedById.entries()].sort((a, b) => a[1] - b[1]);
    for (const [participantId, seedNumber] of seededSorted) {
      const pos = positionByParticipant.get(participantId);
      if (pos == null) {
        return { valid: false, reason: 'SEEDING_RULE_VIOLATION', seed: seedNumber, message: 'A seeded participant is not placed in the draw.' };
      }
      if (pos >= seededCount) {
        return {
          valid: false,
          reason: 'SEEDING_RULE_VIOLATION',
          seed: seedNumber,
          message: `Seed #${seedNumber} is outside the protected seeding zone (position ${pos} >= ${seededCount}).`,
        };
      }
    }
    for (let i = 0; i < seededSorted.length; i++) {
      const [pid, seedNumber] = seededSorted[i];
      if (positionByParticipant.get(pid) !== i) {
        return {
          valid: false,
          reason: 'SEEDING_RULE_VIOLATION',
          seed: seedNumber,
          message: `Seed #${seedNumber} must occupy the ${i}th protected position under the current seeding rules.`,
        };
      }
    }
    // Unseeded participants must not sit inside the protected zone.
    for (const [participantId, pos] of positionByParticipant) {
      if (!seedById.has(participantId) && pos < seededCount) {
        return {
          valid: false,
          reason: 'SEEDING_RULE_VIOLATION',
          seed: null as any,
          message: `An unseeded participant is placed inside the protected seeding zone (position ${pos}).`,
        };
      }
    }
    return { valid: true };
  }

  // ── Group 6 — Participant lifecycle: withdrawal / waitlist / promotion / replacement ──

  /** List the FIFO waitlist (earliest first). */
  async listWaitingParticipants(tournamentId: number): Promise<Array<TournamentParticipant & { display_name?: string | null }>> {
    await this.syncParticipants(tournamentId);
    return participantDrawRepository.listWaitingParticipants(tournamentId);
  }

  /**
   * Withdraw an ACTIVE participant. Pre-start → 'withdrawn' (waitlist replacement
   * allowed); post-start → 'withdrawn_after_start' (DISTINCT lifecycle state —
   * normal waitlist replacement is blocked). Registration + seed + draw history
   * are preserved; the active draw population is updated and the draw flagged.
   */
  async withdrawParticipant(
    tournamentId: number,
    participantId: number,
    actorId: number,
    reason?: string,
  ): Promise<{ status: string; drawImpact: DrawImpact; resolution?: { resolvedSlots: number; cancelledMatches: number; releasedCourts: number } }> {
    const participant = await this.assertParticipantBelongsToTournament(tournamentId, participantId);

    // G9-D2 — idempotent re-withdraw: a participant already in the post-start
    // state re-runs the resolution (it skips already-resolved slots), so a
    // retried request never produces duplicate progression/match/reservation effects.
    if (participant.status === 'withdrawn_after_start') {
      const resolution = await tournamentService.resolveWithdrawnSlots(tournamentId, participantId);
      return { status: 'withdrawn_after_start', drawImpact: await this.getDrawImpact(tournamentId, participantId), resolution };
    }
    if (participant.status !== 'active') {
      throw new ConflictError('Only an active participant can withdraw', ErrorCodes.TOURNAMENT_INVALID_TRANSITION);
    }
    const started = await this.hasTournamentStarted(tournamentId);

    if (started) {
      await participantDrawRepository.updateParticipantStatus(participantId, 'withdrawn_after_start');
      await recordAudit({
        actorId,
        action: 'TOURNAMENT.PARTICIPANT_WITHDRAWN_AFTER_START',
        entityType: 'tournament_participant',
        entityId: participantId,
        beforeState: { status: 'active' },
        afterState: { status: 'withdrawn_after_start', reason: reason ?? null },
      });
      await this.emitLifecycle('tournament:participant-updated', { tournamentId, participantId, status: 'withdrawn_after_start' });
      // G9-D2 — resolve affected future/unstarted bracket slots using the existing
      // lone-slot / bye progression semantics (M1). Never creates a Walkover (M2).
      const resolution = await tournamentService.resolveWithdrawnSlots(tournamentId, participantId);
      return { status: 'withdrawn_after_start', drawImpact: await this.getDrawImpact(tournamentId, participantId), resolution };
    }

    // Pre-start withdrawal.
    await participantDrawRepository.updateParticipantStatus(participantId, 'withdrawn');
    if (participant.registration_id != null) {
      await tournamentRepository.updateRegistrationStatus(participant.registration_id, 'withdrawn');
    }
    const impact = await this.getDrawImpact(tournamentId, participantId);
    if (impact.drawAffected && impact.drawId != null) {
      const draw = await participantDrawRepository.findDrawById(impact.drawId);
      if (draw?.status === 'draft') {
        // Draft draw — the participant leaves the active draw population.
        await participantDrawRepository.deleteDrawEntryByParticipant(impact.drawId, participantId);
        await participantDrawRepository.updateDraw(impact.drawId, { validation_status: 'manually_modified' });
      } else {
        // Approved / locked draw — never silently mutate entries; flag re-draw.
        await participantDrawRepository.markDrawRequiresRedraw(impact.drawId);
      }
    }
    await recordAudit({
      actorId,
      action: 'TOURNAMENT.PARTICIPANT_WITHDRAWN',
      entityType: 'tournament_participant',
      entityId: participantId,
      beforeState: { status: 'active' },
      afterState: { status: 'withdrawn', reason: reason ?? null, registration_id: participant.registration_id ?? null },
    });
    await this.emitLifecycle('tournament:participant-updated', { tournamentId, participantId, status: 'withdrawn' });
    // G9-D5-B — the withdrawn participant receives a processing confirmation for
    // EVERY withdrawal. A pre-start withdrawal resolves no future slots, so the
    // withdrawal-resolved event is emitted with zero counts (same payload shape
    // as the post-start resolution path). The notification engine dedups.
    await this.emitLifecycle('tournament:withdrawal-resolved', {
      tournamentId,
      withdrawnParticipantId: participantId,
      resolvedSlots: 0,
      cancelledMatches: 0,
      releasedCourts: 0,
      organisationId: (await this.getTournament(tournamentId)).organisation_id ?? null,
    });
    return { status: 'withdrawn', drawImpact: impact };
  }

  /**
   * Promote the earliest eligible waitlisted participant (FIFO). ATOMIC: the
   * tournament row is locked FOR UPDATE so two administrators can never promote
   * the same slot. Promotion produces an ACTIVE participant with a pending
   * (unpaid) registration; payment follows the existing Group 3 policy when a
   * payment method is supplied.
   */
  async promoteNextWaitlisted(
    tournamentId: number,
    actorId: number,
    paymentMethod?: string,
  ): Promise<(TournamentParticipant & { payment?: Record<string, unknown> | null }) | null> {
    const t = await this.getTournament(tournamentId);
    if (await this.hasTournamentStarted(tournamentId)) {
      throw new ConflictError('Tournament has started — waitlist promotion is not allowed', ErrorCodes.TOURNAMENT_INVALID_TRANSITION);
    }
    if (paymentMethod) {
      const effective = await tournamentService.resolveEffectiveRegistrationPaymentMethods(t);
      if (!effective.includes(paymentMethod)) {
        throw new ConflictError(`Payment method "${paymentMethod}" is not accepted`, ErrorCodes.TOURNAMENT_INVALID_PAYMENT_METHOD);
      }
    }

    const conn = await getPool().getConnection();
    let headId: number | null = null;
    let registrationId: number | null = null;
    let priorOrder: number | null = null;
    try {
      await conn.beginTransaction();
      await conn.query('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [tournamentId]);
      const head = await participantDrawRepository.findWaitlistHead(tournamentId, conn);
      if (!head) {
        await conn.rollback();
        return null;
      }
      if (head.status !== 'waiting') {
        await conn.rollback();
        return null;
      }
      await participantDrawRepository.updateParticipantStatus(head.id!, 'active', conn);
      await participantDrawRepository.updateParticipantWaitingOrder(head.id!, null, conn);
      if (head.registration_id != null) {
        await tournamentRepository.updateRegistrationStatus(head.registration_id, 'registered', undefined, conn);
        await tournamentRepository.updateRegistrationWaitingOrder(head.registration_id, null, conn);
      }
      headId = head.id ?? null;
      registrationId = head.registration_id ?? null;
      priorOrder = head.waiting_order ?? null;
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    if (headId == null) return null;
    const paymentRequired = Number(t.entry_fee ?? 0) > 0;
    const payment = paymentRequired && paymentMethod && registrationId != null
      ? await this.settleRegistrationPayment(registrationId, headId, t, paymentMethod)
      : null;

    await recordAudit({
      actorId,
      action: 'TOURNAMENT.WAITLIST_PROMOTED',
      entityType: 'tournament_participant',
      entityId: headId,
      beforeState: { status: 'waiting', waiting_order: priorOrder },
      afterState: { status: 'active', registration_id: registrationId },
    });
    await this.emitLifecycle('tournament:waitlist-updated', { tournamentId });
    await this.emitLifecycle('tournament:participant-updated', { tournamentId, participantId: headId, status: 'active' });
    await this.emitLifecycle('tournament:waitlist-promoted', { tournamentId, userId: (await this.participantUserId(headId)), participantId: headId, name: t.name });
    const promoted = await participantDrawRepository.findParticipantById(headId);
    return { ...promoted!, payment };
  }

  /**
   * Pre-start replacement: a withdrawn participant A is replaced by a waitlisted
   * participant B. B keeps its OWN participant identity (A's ID is never reused);
   * A's registration/seed/draw history is preserved; A's seed is NOT transferred.
   * Atomic promotion of B + draw impact reported.
   */
  async replaceParticipant(
    tournamentId: number,
    withdrawnParticipantId: number,
    replacementParticipantId: number,
    actorId: number,
    paymentMethod?: string,
  ): Promise<{ replacement: TournamentParticipant; payment?: Record<string, unknown> | null; drawImpact: DrawImpact }> {
    const t = await this.getTournament(tournamentId);
    if (await this.hasTournamentStarted(tournamentId)) {
      throw new ConflictError('Tournament has started — pre-start replacement is not allowed', ErrorCodes.TOURNAMENT_INVALID_TRANSITION);
    }
    const withdrawn = await this.assertParticipantBelongsToTournament(tournamentId, withdrawnParticipantId);
    if (withdrawn.status !== 'withdrawn') {
      throw new ConflictError('Only a pre-start withdrawn participant can be replaced', ErrorCodes.TOURNAMENT_INVALID_TRANSITION);
    }
    const replacement = await this.assertParticipantBelongsToTournament(tournamentId, replacementParticipantId);
    if (replacement.status !== 'waiting') {
      throw new ConflictError('The replacement participant must be on the waitlist', ErrorCodes.TOURNAMENT_INVALID_TRANSITION);
    }
    const userId = this.primaryUserId(replacement);
    if (userId != null) {
      const dup = await participantDrawRepository.findActiveParticipantByPlayer(tournamentId, userId);
      if (dup && Number(dup.id) !== Number(replacement.id)) {
        throw new ConflictError('The replacement participant is already active in this tournament', ErrorCodes.TOURNAMENT_REGISTRATION_EXISTS);
      }
    }
    if (paymentMethod) {
      const effective = await tournamentService.resolveEffectiveRegistrationPaymentMethods(t);
      if (!effective.includes(paymentMethod)) {
        throw new ConflictError(`Payment method "${paymentMethod}" is not accepted`, ErrorCodes.TOURNAMENT_INVALID_PAYMENT_METHOD);
      }
    }

    // Atomic promotion of B (new active participant identity is B's own row).
    const conn = await getPool().getConnection();
    let registrationId: number | null = null;
    try {
      await conn.beginTransaction();
      await conn.query('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [tournamentId]);
      await participantDrawRepository.updateParticipantStatus(replacement.id!, 'active', conn);
      await participantDrawRepository.updateParticipantWaitingOrder(replacement.id!, null, conn);
      if (replacement.registration_id != null) {
        await tournamentRepository.updateRegistrationStatus(replacement.registration_id, 'registered', undefined, conn);
        await tournamentRepository.updateRegistrationWaitingOrder(replacement.registration_id, null, conn);
        registrationId = replacement.registration_id;
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    // A's seed is preserved (never transferred). Draw impact on A's removal.
    const impact = await this.getDrawImpact(tournamentId, withdrawnParticipantId);
    if (impact.drawAffected && impact.drawId != null) {
      const draw = await participantDrawRepository.findDrawById(impact.drawId);
      if (draw?.status === 'draft') {
        await participantDrawRepository.deleteDrawEntryByParticipant(impact.drawId, withdrawnParticipantId);
        await participantDrawRepository.updateDraw(impact.drawId, { validation_status: 'manually_modified' });
      } else {
        await participantDrawRepository.markDrawRequiresRedraw(impact.drawId);
      }
    }

    const paymentRequired = Number(t.entry_fee ?? 0) > 0;
    const payment = paymentRequired && paymentMethod && registrationId != null
      ? await this.settleRegistrationPayment(registrationId, replacement.id!, t, paymentMethod)
      : null;

    await recordAudit({
      actorId,
      action: 'TOURNAMENT.PARTICIPANT_REPLACED',
      entityType: 'tournament_participant',
      entityId: replacement.id,
      beforeState: { withdrawn_participant_id: withdrawnParticipantId, status: 'waiting' },
      afterState: { replacement_participant_id: replacement.id, status: 'active', registration_id: registrationId },
    });
    await this.emitLifecycle('tournament:participant-replaced', { tournamentId, withdrawnParticipantId, replacementParticipantId: replacement.id });
    await this.emitLifecycle('tournament:waitlist-updated', { tournamentId });
    await this.emitLifecycle('tournament:participant-updated', { tournamentId, participantId: replacement.id, status: 'active' });
    const promoted = (await participantDrawRepository.findParticipantById(replacement.id!))!;
    return { replacement: promoted, payment, drawImpact: impact };
  }

  /** Structured draw-impact report for a participant lifecycle change. */
  async getDrawImpact(tournamentId: number, participantId: number): Promise<DrawImpact> {
    const seed = await participantDrawRepository.findSeedByParticipant(participantId);
    const seedAffected = seed != null;
    const draw = await participantDrawRepository.findCurrentDraw(tournamentId);
    if (!draw) {
      return { drawAffected: false, drawId: null, status: null, requiresRedraw: false, seedAffected };
    }
    const entry = await participantDrawRepository.findEntryByParticipant(draw.id!, participantId);
    return {
      drawAffected: true,
      drawId: draw.id ?? null,
      status: draw.status ?? null,
      requiresRedraw: entry != null || seedAffected,
      seedAffected,
    };
  }

  /**
   * Authoritative "has the tournament started": the tournament lifecycle
   * (running/completed/cancelled/archived) OR any bracket/round match actually
   * in progress or resolved — never the calendar start_date alone.
   */
  private async hasTournamentStarted(tournamentId: number): Promise<boolean> {
    const t = await this.getTournament(tournamentId);
    if (t.status && ['running', 'completed', 'cancelled', 'archived'].includes(t.status)) return true;
    try {
      return await tournamentRepository.hasAnyStartedMatch(tournamentId);
    } catch {
      return false;
    }
  }

  /**
   * Group 6 — settle a registration's entry fee through the EXISTING Group 3
   * shared-Payment policy (cash → paid offline row; card → shared
   * PaymentService.charge). Wallet remains unavailable. NOT a new payment flow.
   * Public so the Group 7 pair/team service reuses the SAME payment semantics
   * (one authoritative payment path — never two).
   */
  async settleRegistrationPayment(
    registrationId: number,
    participantId: number,
    t: Tournament,
    paymentMethod: string,
  ): Promise<Record<string, unknown> | null> {
    const memberUserIds = (await this.participantUserId(participantId));
    const userId = memberUserIds ?? 0;
    const amount = Math.round(Number(t.entry_fee ?? 0) * 100) / 100;
    if (paymentMethod === 'cash') {
      const paymentId = await tournamentRepository.createCashPaymentTransaction({ userId, registrationId, amount, currency: t.currency_code });
      await tournamentRepository.updateRegistrationPaymentStatus(registrationId, 'paid');
      eventBusV2.emit('payment:succeeded', {
        paymentId,
        referenceType: 'tournament',
        referenceId: registrationId,
        amount,
        metadata: { paymentMethod: 'cash', currency: t.currency_code, userId },
      } as Record<string, unknown>);
      return { method: 'cash', status: 'paid', paymentId };
    }
    if (paymentMethod === 'card') {
      const { paymentService } = await import('../../payment/application/payment.service.js');
      const gwResult: any = await paymentService.charge(userId, {
        referenceType: 'tournament' as any,
        referenceId: registrationId,
        amount,
        currency: t.currency_code,
        paymentMethod: 'card',
      });
      if (!gwResult?.success) {
        throw new ConflictError(
          (gwResult?.errorMessage as string) || 'Payment gateway rejected the transaction',
          ErrorCodes.TOURNAMENT_INVALID_PAYMENT_METHOD,
        );
      }
      return {
        method: 'card',
        status: gwResult.status ?? 'pending',
        paymentId: gwResult.paymentId ?? null,
        paymentUrl: gwResult.paymentUrl ?? null,
        clientSecret: gwResult.clientSecret ?? null,
        intentionId: gwResult.intentionId ?? null,
      };
    }
    return null;
  }

  private async participantUserId(participantId: number): Promise<number | null> {
    const p = await participantDrawRepository.findParticipantById(participantId);
    if (!p) return null;
    const memberUserIds = Array.isArray(p.member_user_ids) ? p.member_user_ids : [];
    return memberUserIds[0] ?? (p as any).player_id ?? null;
  }

  private primaryUserId(participant: TournamentParticipant): number | null {
    const memberUserIds = Array.isArray(participant.member_user_ids) ? participant.member_user_ids : [];
    return memberUserIds[0] ?? (participant as any).player_id ?? null;
  }

  private async emitLifecycle(eventName: string, payload: Record<string, unknown>): Promise<void> {
    eventBusV2.emit(eventName, payload as Record<string, unknown>, {
      aggregateType: 'tournament',
      aggregateId: String(payload.tournamentId),
      aggregateVersion: 1,
    });
  }

  private async getTournament(tournamentId: number): Promise<Tournament> {
    const t = await tournamentRepository.findById(tournamentId);
    if (!t) throw new NotFoundError('Tournament', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    return t;
  }

  private async assertParticipantBelongsToTournament(tournamentId: number, participantId: number): Promise<TournamentParticipant> {
    const participant = await participantDrawRepository.findParticipantById(participantId);
    if (!participant || Number(participant.tournament_id) !== tournamentId) {
      throw new NotFoundError('Participant', ErrorCodes.TOURNAMENT_NOT_FOUND);
    }
    return participant;
  }
}

export const participantDrawService = new ParticipantDrawService();