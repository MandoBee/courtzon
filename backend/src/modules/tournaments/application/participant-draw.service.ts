import { participantDrawRepository } from '../infrastructure/repositories/participant-draw.repository.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import type {
  Tournament,
  TournamentParticipant,
  TournamentSeed,
  TournamentDraw,
  TournamentDrawEntry,
} from '../domain/tournament-aggregate.js';
import { seededShuffle } from '../domain/tournament-aggregate.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { recordAudit } from '../../audit-log/index.js';
import { ratingRepository } from '../../match-result/infrastructure/rating.repository.js';
import { ratingService } from '../../match-result/application/rating/rating.service.js';

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
        participant_type: r.participant_type,
        status: r.status,
        member_user_ids: memberUserIds,
        player_id: playerId,
        display_name: r.display_name ?? null,
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

    eventBusV2.emit('tournament:seed-updated', {
      tournamentId,
      participantId,
      seedNumber,
      source: input.source,
    } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1,
    });
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
    eventBusV2.emit('tournament:draw-generated', {
      tournamentId,
      attemptNumber: attempt,
      drawSeed: seed,
      status: 'draft',
    } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1,
    });
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

    eventBusV2.emit('tournament:draw-updated', { tournamentId, drawId: draw.id } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1,
    });
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
    eventBusV2.emit('tournament:draw-updated', { tournamentId, drawId: draw.id, status: 'approved' } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1,
    });
    return this.getDrawWithEntries(draw.id!);
  }

  async lockDraw(tournamentId: number, actorId: number): Promise<TournamentDraw> {
    const draw = await participantDrawRepository.findCurrentDraw(tournamentId);
    if (!draw) throw new ConflictError('No draw has been generated yet', ErrorCodes.TOURNAMENT_DRAW_NOT_FOUND);
    if (draw.status !== 'approved') throw new ConflictError('The draw must be approved before it can be locked', ErrorCodes.TOURNAMENT_DRAW_INVALID);
    await participantDrawRepository.updateDraw(draw.id!, { status: 'locked' });
    await recordAudit({ actorId, action: 'TOURNAMENT.DRAW_LOCKED', entityType: 'tournament_draw', entityId: draw.id });
    eventBusV2.emit('tournament:draw-updated', { tournamentId, drawId: draw.id, status: 'locked' } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1,
    });
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