import { participantDrawRepository } from '../infrastructure/repositories/participant-draw.repository.js';
import { participantMemberRepository } from '../infrastructure/repositories/participant-member.repository.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { tournamentService } from './tournament.service.js';
import { matchService } from '../../match/application/services/match.service.js';
import { courtReservationService } from '../../booking/application/court-reservation.service.js';
import { courtReservationRepository } from '../../booking/infrastructure/repositories/court-reservation.repository.js';
import { getPool } from '../../../database/mysql.js';
import { runProvidedTransaction } from '../../../database/database.transaction.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { tournamentRealtimeScope } from './tournament-realtime-scope.js';
import { recordAudit } from '../../audit-log/index.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TimeEngine } from '../../time/index.js';
import type {
  Tournament,
  TournamentMatch,
  TournamentMatchScheduleInput,
  BracketSlot,
} from '../domain/tournament-aggregate.js';
import type { MatchFormatSnapshot } from '../../match/domain/match.types.js';
import { generateKnockoutBracket, generateRoundRobinMatches, normaliseBracketTargets, ENGINE_EXECUTABLE_FORMATS } from '../domain/tournament-aggregate.js';

type RowData = import('mysql2').RowDataPacket[];
type PoolConnection = import('mysql2/promise').PoolConnection;

/**
 * Group 8 — Match Generation + Scheduling + Shared Court Reservation.
 *
 * Architecture (ONE SHARED CAPABILITY → ONE SOURCE OF TRUTH):
 *   LOCKED DRAW  → the ONLY thing that may produce the authoritative match set.
 *   PARTICIPANT  → the competitive unit; a generated tournament match references
 *                  tournament_participants (participant1_id/participant2_id) AND
 *                  keeps the historical player1_id/player2_id (primary member) for
 *                  backward-compatible result/UI/bye handling. Doubles/team members
 *                  are written into the shared match_participants with explicit
 *                  side + team_index (never insertion-order half-splitting).
 *   MATCH        → the shared `matches` row (matchService.createForTournament) with
 *                  frozen format + rule snapshots.
 *   COURT        → reserved through the SHARED booking system
 *                  (courtReservationService → bookings + booking_slots +
 *                  checkSlotAvailability + redisLock + resources FOR UPDATE).
 *                  NON-FINANCIAL: no payment, no accounting, no wallet.
 */
export class MatchScheduleService {
  // ── Match generation (participant-based, locked-draw gated) ──

  /**
   * Generate the authoritative tournament matches from the LOCKED draw.
   * ATOMIC + RACE-SAFE: the whole generation runs in ONE transaction with the
   * tournament row locked FOR UPDATE and an in-lock re-count, so two concurrent
   * requests against the same locked draw can never both pass the existence
   * check — exactly ONE authoritative match set is produced. All inserts
   * (shared matches via createForTournament + bracket slots) share the same
   * connection, so a partial failure rolls back everything (no half-generated
   * bracket). Byes create bracket-slot rows WITHOUT a shared Match and WITHOUT
   * a court. Doubles/teams: every member becomes a match_participant with the
   * participant's side/team_index.
   */
  async generateMatchesFromLockedDraw(tournamentId: number, actorId: number): Promise<{ generated: number; byes: number }> {
    const t = await tournamentService.getByIdDetailed(tournamentId);
    const draw = await participantDrawRepository.findCurrentDraw(tournamentId);
    if (!draw) throw new ConflictError('No draw has been generated', ErrorCodes.TOURNAMENT_DRAW_NOT_FOUND);
    if (draw.status !== 'locked') {
      throw new ConflictError('The draw must be LOCKED before tournament matches can be generated', ErrorCodes.TOURNAMENT_DRAW_NOT_LOCKED);
    }

    const entries = await participantDrawRepository.findDrawEntries(draw.id!);
    const ordered = entries
      .filter((e) => e.participant_id != null)
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((e) => Number(e.participant_id));
    if (ordered.length < 2) {
      throw new ConflictError('At least 2 participants are required to generate matches', ErrorCodes.TOURNAMENT_CAPACITY_EXCEEDED);
    }

    const formatCtx = await tournamentService.resolveMatchFormatContext(t);
    const { slots, isKnockout } = this.buildSlots(t, ordered);

    let generated = 0;
    let byes = 0;
    const conn = await getPool().getConnection();
    try {
      // Group 6 — ALS transaction context: match:created events emitted by
      // createForTournament inside this manual transaction are flushed only
      // after the shared commit; a rollback never delivers a phantom Match.
      await runProvidedTransaction(conn, async () => {
        // Serialize generation for this tournament; the existence re-check MUST
        // run inside the locked transaction (race guard).
        await conn.query('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [tournamentId]);
        const existing = await tournamentRepository.countMatches(tournamentId, conn);
        if (existing > 0) {
          throw new ConflictError('Tournament matches are already generated', ErrorCodes.TOURNAMENT_MATCHES_ALREADY_GENERATED);
        }

        for (const slot of slots) {
          const p1Id = slot.player1Id != null ? Number(slot.player1Id) : null;
          const p2Id = slot.player2Id != null ? Number(slot.player2Id) : null;
          const meta = this.buildSlotMeta(slot, isKnockout);
          if (p1Id != null && p2Id != null) {
            const sharedMatch = await this.createParticipantMatch(t, formatCtx, p1Id, p2Id, conn);
            const p1 = await this.loadParticipant(p1Id);
            const p2 = await this.loadParticipant(p2Id);
            await tournamentRepository.createMatch({
              tournament_id: tournamentId,
              match_id: sharedMatch.id,
              round: slot.round,
              round_name: this.roundLabel(t, slot.round, isKnockout, ordered.length),
              bracket_position: slot.bracketPosition ?? 0,
              stage_id: slot.stageId ?? null,
              participant1_id: p1Id,
              participant2_id: p2Id,
              player1_id: this.primaryMember(p1),
              player2_id: this.primaryMember(p2),
              status: 'scheduled',
              progression_state: 'pending',
              progression_meta: meta as unknown as Record<string, unknown>,
            }, conn);
            generated += 1;
          } else {
            // NO shared Match, NO court. Three cases (knockout only — round-robin
            // slots always carry both participants):
            //  * round-1 lone BYE (one participant) — the participant advances once
            //    advanceByes consumes the (now-correct) target wiring;
            //  * round-1 empty padding BYE (no participant) — finalised in place so
            //    the virtual-bye cascade can recognise it;
            //  * later-round PLACEHOLDER (no participant) — the progression engine's
            //    target slot, created up front so a Round-1 winner can be seated.
            const presentId = p1Id ?? p2Id ?? null;
            const present = presentId != null ? await this.loadParticipant(presentId) : null;
            await tournamentRepository.createMatch({
              tournament_id: tournamentId,
              round: slot.round,
              round_name: this.roundLabel(t, slot.round, isKnockout, ordered.length),
              bracket_position: slot.bracketPosition ?? 0,
              stage_id: slot.stageId ?? null,
              match_number: slot.bye === true ? 0 : undefined,
              participant1_id: presentId,
              participant2_id: null,
              player1_id: presentId != null ? this.primaryMember(present!) : null,
              player2_id: null,
              status: 'scheduled',
              progression_state: 'pending',
              progression_meta: slot.bye === true ? { ...meta, bye: true } as unknown as Record<string, unknown> : meta as unknown as Record<string, unknown>,
            }, conn);
            if (presentId != null) byes += 1;
          }
        }
      });
    } finally {
      conn.release();
    }

    // Group 5B — propagate draw-time byes (existing engine semantics, not invented).
    // Runs AFTER commit (idempotent bye propagation; not part of the race guard).
    await tournamentService.advanceByes(tournamentId);

    await recordAudit({
      actorId,
      action: 'TOURNAMENT.MATCHES_GENERATED',
      entityType: 'tournament_match',
      entityId: tournamentId,
      afterState: { generated, byes, source: 'locked_draw', draw_id: draw.id },
    });
    await this.emit('tournament:matches-generated', {
      tournamentId,
      generated,
      byes,
      organisationId: t.organisation_id ?? null,
    }, t);
    return { generated, byes };
  }

  /** Build the bracket slots from the LOCKED DRAW order (draw position is authoritative). */
  private buildSlots(t: Tournament, participantIds: number[]): { slots: BracketSlot[]; isKnockout: boolean } {
    const format = t.format ?? 'knockout';
    if (format === 'knockout') {
      // Draw order is already the final seeded placement — generateKnockoutBracket
      // without a seed preserves the order and pairs consecutive positions.
      // G9-A — normalise the target wiring (single bracket-topology source of
      // truth shared with the legacy generateBracket path) so Round-1 slots carry
      // correct target_round / target_bracket_position / target_side for the
      // progression engine.
      return { slots: normaliseBracketTargets(generateKnockoutBracket(participantIds), participantIds.length), isKnockout: true };
    }
    if (format === 'round_robin') {
      const rr = generateRoundRobinMatches(participantIds);
      return {
        slots: rr.map((m) => ({ round: m.round, bracketPosition: 0, player1Id: m.player1Id, player2Id: m.player2Id, bye: m.bye })),
        isKnockout: false,
      };
    }
    throw new ConflictError(
      `Bracket type "${format}" is not implemented for match generation — only ${ENGINE_EXECUTABLE_FORMATS.join(' and ')} are supported`,
      ErrorCodes.TOURNAMENT_INVALID_FORMAT,
      { unsupported: format, supported: [...ENGINE_EXECUTABLE_FORMATS] },
    );
  }

  private roundLabel(t: Tournament, round: number, isKnockout: boolean, count: number): string {
    if (!isKnockout) return `Round ${round}`;
    const totalRounds = Math.max(1, Math.ceil(Math.log2(Math.max(count, 2))));
    const fromEnd = totalRounds - round;
    if (fromEnd === 0) return 'Final';
    if (fromEnd === 1) return 'Semi-final';
    if (fromEnd === 2) return 'Quarter-final';
    return `Round ${round}`;
  }

  private buildSlotMeta(slot: BracketSlot, isKnockout: boolean): Record<string, unknown> {
    if (!isKnockout) return { is_bracket: false };
    return {
      is_bracket: true,
      bye: slot.bye === true ? true : undefined,
      target_round: slot.targetRound != null ? slot.targetRound : null,
      target_bracket_position: slot.targetBracketPosition != null ? slot.targetBracketPosition : null,
      target_side: slot.targetSide ?? (((slot.bracketPosition ?? 0) % 2 === 0) ? 'player1' : 'player2'),
    };
  }

  /**
   * Create the shared Match for a participant vs participant slot. Every member
   * of each side participant is written into match_participants with the
   * authoritative side + team_index — doubles/team sides are NEVER guessed from
   * insertion order. When a `conn` is passed, the shared match participates in
   * the caller's transaction (atomic generation).
   */
  private async createParticipantMatch(
    t: Tournament,
    formatCtx: { formatId: number; ruleSetId: number; formatSnapshot: MatchFormatSnapshot; ruleSnapshot: Record<string, unknown> },
    participant1Id: number,
    participant2Id: number,
    conn?: PoolConnection,
  ) {
    const p1 = await this.loadParticipant(participant1Id);
    const p2 = await this.loadParticipant(participant2Id);
    const participants = [
      ...p1.memberUserIds.map((userId) => ({ userId, side: 'home' as const, teamIndex: 0, role: 'host' as const })),
      ...p2.memberUserIds.map((userId) => ({ userId, side: 'away' as const, teamIndex: 1, role: 'joiner' as const })),
    ];
    if (participants.length < 2) {
      throw new ConflictError('A tournament match requires two participants', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
    return matchService.createForTournament({
      tournamentId: t.id!,
      sportId: t.sport_id!,
      formatId: formatCtx.formatId,
      ruleSetId: formatCtx.ruleSetId,
      formatSnapshot: formatCtx.formatSnapshot,
      ruleSnapshot: formatCtx.ruleSnapshot,
      participants,
      conn,
    });
  }

  // ── Schedule read + court selection ──

  /** Enriched tournament matches (schedule + participant names + reservation state). */
  async listMatches(tournamentId: number): Promise<Array<TournamentMatch & { shared_status?: string | null; resource_name?: string | null; participant1_name?: string | null; participant2_name?: string | null }>> {
    return tournamentRepository.findMatchesDetailed(tournamentId);
  }

  /** Eligible courts for the tournament (active resources of its branch + sport). */
  async listEligibleCourts(tournamentId: number): Promise<Array<{ id: number; name: string; branch_id: number; sport_id: number | null; opening_time: string | null; closing_time: string | null; slot_duration: number | null }>> {
    await tournamentService.getByIdDetailed(tournamentId);
    return tournamentRepository.findEligibleCourts(tournamentId);
  }

  // ── Scheduling + reservation ──

  /**
   * Schedule a generated match: validate the tournament window (dates, daily
   * playing window, branch hours, timezone), verify court eligibility, and
   * reserve the court atomically through the SHARED booking capability. A bye /
   * unscheduled placeholder can never be scheduled or reserved.
   */
  async scheduleMatch(
    tournamentId: number,
    matchId: number,
    input: TournamentMatchScheduleInput,
    actorId: number,
  ): Promise<TournamentMatch & { bookingId?: number | null }> {
    const t = await tournamentService.getByIdDetailed(tournamentId);
    const match = await tournamentRepository.findMatchById(matchId);
    if (!match || Number(match.tournament_id) !== tournamentId) {
      throw new NotFoundError('Match', ErrorCodes.TOURNAMENT_MATCH_NOT_FOUND);
    }
    if (match.match_id == null) {
      throw new ConflictError('A bye / placeholder match cannot be scheduled or reserve a court', ErrorCodes.TOURNAMENT_BYE_MATCH);
    }

    // Court eligibility.
    const eligibleCourts = await tournamentRepository.findEligibleCourts(tournamentId);
    const court = eligibleCourts.find((c) => c.id === Number(input.resource_id));
    if (!court) {
      throw new ConflictError(`Court #${input.resource_id} is not eligible for this tournament`, ErrorCodes.TOURNAMENT_COURT_NOT_ELIGIBLE);
    }

    // Tournament window (dates).
    this.assertDateInWindow(t, input.date);
    // Daily playing window + branch hours.
    this.assertTimeInWindow(t, court, input.start_time, input.end_time);

    const timezone = String((t as any).branch_timezone ?? 'UTC');
    const date = input.date;
    let endDate = date;
    let endTime = input.end_time;
    if (endTime === '24:00') {
      const [y, m, d] = date.split('-').map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      endDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
      endTime = '00:00';
    }
    const startAtUtc = TimeEngine.localToUtc(date, input.start_time, timezone);
    const endAtUtc = TimeEngine.localToUtc(endDate, endTime, timezone);
    const businessDate = TimeEngine.getBusinessDate(startAtUtc, court.opening_time ?? '00:00', court.closing_time ?? '23:59', timezone);

    // Shared non-financial court reservation. RESCHEDULE SAFETY: a match has
    // EXACTLY ONE authoritative reservation. Identical slot → idempotent;
    // different slot → atomic swap (old released + new created in one transaction);
    // no reservation → fresh reserveCourt.
    const reservationInput = {
      userId: Number(t.creator_id),
      organisationId: Number(t.organisation_id ?? (t as any).organisation_id),
      branchId: Number((t as any).branch_id),
      resourceId: Number(input.resource_id),
      date,
      startTime: input.start_time,
      endTime: input.end_time,
      startAtUtc,
      endAtUtc,
      businessDate,
      matchId: Number(match.match_id),
    };
    const existing = await courtReservationRepository.findTournamentBooking(Number(match.match_id));
    let reservation: { bookingId: number; alreadyReserved?: boolean; released?: boolean };
    if (!existing) {
      reservation = await courtReservationService.reserveCourt(reservationInput);
    } else {
      const sameSlot =
        Number(existing.resource_id) === Number(input.resource_id) &&
        String(existing.booking_date) === date &&
        String(existing.start_time).slice(0, 5) === String(input.start_time).slice(0, 5) &&
        String(existing.end_time).slice(0, 5) === String(input.end_time).slice(0, 5);
      if (sameSlot) {
        // Idempotent: identical reservation — no duplicate booking, keep it.
        reservation = { bookingId: Number(existing.id), alreadyReserved: true };
      } else {
        // Atomic swap: release the OLD reservation + create the NEW one in one
        // transaction (old slot freed, new slot blocked, never two actives).
        try {
          reservation = await courtReservationService.rescheduleCourt(reservationInput, Number(existing.id));
        } catch (err: any) {
          if (err?.code === ErrorCodes.COURT_SLOT_UNAVAILABLE) {
            throw new ConflictError('One or more court slots are no longer available — the existing reservation was left intact', ErrorCodes.TOURNAMENT_COURT_UNAVAILABLE);
          }
          throw err;
        }
      }
    }

    // Persist the schedule on the bracket slot (branch-local datetime).
    const localStart = `${date} ${input.start_time}`;
    const localEnd = `${endDate} ${endTime === '00:00' && endDate === date ? '23:59' : endTime}`;
    await tournamentRepository.updateMatch(matchId, {
      resource_id: Number(input.resource_id),
      start_time: localStart,
      end_time: localEnd,
      status: 'scheduled',
    });

    await recordAudit({
      actorId,
      action: existing ? 'TOURNAMENT.MATCH_RESCHEDULED' : 'TOURNAMENT.MATCH_SCHEDULED',
      entityType: 'tournament_match',
      entityId: matchId,
      afterState: {
        resource_id: input.resource_id,
        date,
        start_time: input.start_time,
        end_time: input.end_time,
        booking_id: reservation.bookingId,
        released_old_booking: reservation.released ?? false,
        already_reserved: reservation.alreadyReserved ?? false,
      },
    });
    await this.emit('tournament:schedule-updated', {
      tournamentId,
      matchId,
      resourceId: Number(input.resource_id),
      date,
      startTime: input.start_time,
      endTime: input.end_time,
      bookingId: reservation.bookingId,
      organisationId: t.organisation_id ?? null,
    }, t, [match.player1_id, match.player2_id]);
    if (!existing || !reservation.alreadyReserved) {
      await this.emit('tournament:court-reserved', {
        tournamentId,
        matchId,
        resourceId: Number(input.resource_id),
        bookingId: reservation.bookingId,
        organisationId: t.organisation_id ?? null,
      }, t, [match.player1_id, match.player2_id]);
    }

    const updated = (await tournamentRepository.findMatchById(matchId))!;
    return { ...updated, bookingId: reservation.bookingId };
  }

  /**
   * Release a match's court reservation (idempotent). Clears the shared
   * matches.booking_id link + frees booking_slots; the schedule fields stay for
   * audit/history (status returns to 'scheduled' without a court until re-scheduled).
   */
  async releaseMatchCourt(tournamentId: number, matchId: number, actorId: number): Promise<{ released: boolean; bookingId: number | null }> {
    const match = await tournamentRepository.findMatchById(matchId);
    if (!match || Number(match.tournament_id) !== tournamentId) {
      throw new NotFoundError('Match', ErrorCodes.TOURNAMENT_MATCH_NOT_FOUND);
    }
    if (match.match_id == null) {
      throw new ConflictError('A bye / placeholder match has no court reservation', ErrorCodes.TOURNAMENT_BYE_MATCH);
    }
    const result = await courtReservationService.releaseCourt(Number(match.match_id));
    if (result.released) {
      await tournamentRepository.updateMatch(matchId, { resource_id: null });
      await recordAudit({
        actorId,
        action: 'TOURNAMENT.MATCH_COURT_RELEASED',
        entityType: 'tournament_match',
        entityId: matchId,
        afterState: { booking_id: result.bookingId, released: true },
      });
      const t = await tournamentService.getByIdDetailed(tournamentId);
      await this.emit('tournament:court-released', {
        tournamentId,
        matchId,
        bookingId: result.bookingId,
        organisationId: t.organisation_id ?? null,
      }, t, [match.player1_id, match.player2_id]);
    }
    return result;
  }

  /**
   * Auto-schedule all unscheduled generated matches onto eligible courts within
   * the tournament window (greedy first-available).
   *
   * SEMANTICS (documented decision — RESUMABLE PARTIAL, explicit + recoverable):
   *   * each match is an INDEPENDENT reservation (validated + reserved atomically);
   *   * successful reservations remain AUTHORITATIVE (a retry skips already
   *     scheduled matches and reserveCourt is idempotent → never double-booked);
   *   * a failed match stays in its clear unscheduled state (resource_id NULL);
   *   * OCCUPIED (slot unavailable) is counted as `conflicts`;
   *   * VALIDATION (court/time/window/bye) is counted as `skipped`;
   *   * a SYSTEM error (DB/Redis/locking failure) ABORTS the run (throws) — it is
   *     NEVER interpreted as AVAILABLE, and further matches are not scheduled on
   *     unverifiable availability.
   */
  async autoSchedule(tournamentId: number, actorId: number): Promise<{ scheduled: number; conflicts: number; skipped: number }> {
    const t = await tournamentService.getByIdDetailed(tournamentId);
    const formatCtx = await tournamentService.resolveMatchFormatContext(t);
    const ruleDuration = Number(formatCtx.ruleSnapshot?.match_duration_minutes) || null;
    const matches = await tournamentRepository.findMatches(tournamentId);
    const courts = await tournamentRepository.findEligibleCourts(tournamentId);
    if (courts.length === 0) {
      throw new ConflictError('No eligible courts are configured for this tournament', ErrorCodes.TOURNAMENT_COURT_NOT_ELIGIBLE);
    }
    const real = matches.filter((m) => m.match_id != null && m.resource_id == null && m.status === 'scheduled');
    let scheduled = 0;
    let conflicts = 0;
    let skipped = 0;
    for (const m of real) {
      const found = await this.findFirstAvailableSlot(t, courts, m, ruleDuration);
      if (!found) {
        conflicts += 1; // all candidate slots are occupied / exhausted
        continue;
      }
      try {
        await this.scheduleMatch(tournamentId, m.id!, found, actorId);
        scheduled += 1;
      } catch (err: any) {
        const code = err?.code ?? err?.errorCode;
        if (code === ErrorCodes.TOURNAMENT_COURT_UNAVAILABLE || code === ErrorCodes.COURT_SLOT_UNAVAILABLE) {
          conflicts += 1;
        } else if (code === ErrorCodes.TOURNAMENT_COURT_NOT_ELIGIBLE || code === ErrorCodes.TOURNAMENT_SCHEDULE_INVALID || code === ErrorCodes.TOURNAMENT_BYE_MATCH) {
          skipped += 1;
        } else {
          // SYSTEM_ERROR (DB/Redis/locking) — fail safely, never treat as available.
          throw err;
        }
      }
    }
    await this.emit('tournament:schedule-updated', {
      tournamentId,
      scheduled,
      conflicts,
      skipped,
      organisationId: t.organisation_id ?? null,
    }, t);
    return { scheduled, conflicts, skipped };
  }

  /**
   * Greedy: earliest eligible slot (date asc, start asc) across eligible courts.
   * Duration is derived from AUTHORITATIVE existing sources (no invented value):
   *   1. sport/rule-set `match_duration_minutes` (e.g. football 90) when present;
   *   2. the court's `slot_duration` (shared booking slot interval);
   *   3. the shared booking default of 60 minutes.
   * Availability infrastructure errors PROPAGATE (never interpreted as available).
   */
  private async findFirstAvailableSlot(
    t: any,
    courts: Array<{ id: number; name: string; opening_time: string | null; closing_time: string | null; slot_duration: number | null }>,
    match: TournamentMatch,
    ruleDuration: number | null,
  ): Promise<TournamentMatchScheduleInput | null> {
    const startDate = new Date(t.start_date ?? new Date().toISOString().slice(0, 10));
    const endDate = t.end_date ? new Date(t.end_date) : startDate;
    const dailyStart = String(t.daily_start_time ?? '08:00').slice(0, 5);
    const dailyEnd = String(t.daily_end_time ?? '22:00').slice(0, 5);

    const cursor = new Date(startDate);
    const last = new Date(endDate);
    for (let d = new Date(cursor); d <= last; d.setDate(d.getDate() + 1)) {
      const date = d.toISOString().slice(0, 10);
      for (const court of courts) {
        const opening = court.opening_time ? String(court.opening_time).slice(0, 5) : dailyStart;
        const closing = court.closing_time ? String(court.closing_time).slice(0, 5) : dailyEnd;
        const slotMinutes = ruleDuration ?? (court.slot_duration != null ? Number(court.slot_duration) : null) ?? 60;
        let s = opening;
        while (s < closing) {
          const candidate = { date, start_time: s, end_time: this.addMinutes(s, slotMinutes), resource_id: court.id };
          if (candidate.end_time > closing) break;
          if (this.withinWindow(date, candidate.start_time, candidate.end_time, dailyStart, dailyEnd)) {
            // Shared availability check (best-effort placement hint). An
            // infrastructure failure PROPAGATES — it is never 'available'.
            if (await this.slotAvailable(court.id, date, candidate.start_time, candidate.end_time)) {
              return candidate;
            }
          }
          s = this.addMinutes(s, slotMinutes);
        }
      }
    }
    return null;
  }

  /**
   * Shared availability probe for auto-scheduling. Returns true ONLY when the
   * authoritative check reports AVAILABLE. An OCCUPIED slot returns false. A
   * database/Redis/locking failure is PROPAGATED (thrown) — it is NEVER
   * interpreted as AVAILABLE (fail-safe).
   */
  private async slotAvailable(resourceId: number, date: string, start: string, end: string): Promise<boolean> {
    const { bookingRepository } = await import('../../booking/infrastructure/repositories/booking.repository.js');
    return bookingRepository.checkSlotAvailability(resourceId, date, [{ start, end, date }]);
  }

  private withinWindow(date: string, start: string, end: string, dailyStart: string, dailyEnd: string): boolean {
    return start >= dailyStart && end <= dailyEnd;
  }

  private addMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + minutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  // ── Validation helpers ──

  private assertDateInWindow(t: any, date: string): void {
    const d = new Date(date);
    if (t.start_date) {
      const start = new Date(String(t.start_date).slice(0, 10));
      if (d < start) {
        throw new ConflictError(`Schedule date ${date} is before the tournament start date`, ErrorCodes.TOURNAMENT_SCHEDULE_INVALID);
      }
    }
    if (t.end_date) {
      const end = new Date(String(t.end_date).slice(0, 10));
      if (d > end) {
        throw new ConflictError(`Schedule date ${date} is after the tournament end date`, ErrorCodes.TOURNAMENT_SCHEDULE_INVALID);
      }
    }
  }

  private assertTimeInWindow(
    t: any,
    court: { opening_time: string | null; closing_time: string | null },
    start: string,
    end: string,
  ): void {
    const dailyStart = String(t.daily_start_time ?? '00:00').slice(0, 5);
    const dailyEnd = String(t.daily_end_time ?? '23:59').slice(0, 5);
    if (start < dailyStart) {
      throw new ConflictError(`Start time ${start} is before the tournament daily window (${dailyStart})`, ErrorCodes.TOURNAMENT_SCHEDULE_INVALID);
    }
    if (end > dailyEnd) {
      throw new ConflictError(`End time ${end} is after the tournament daily window (${dailyEnd})`, ErrorCodes.TOURNAMENT_SCHEDULE_INVALID);
    }
    const opening = court.opening_time ? String(court.opening_time).slice(0, 5) : '00:00';
    const closing = court.closing_time ? String(court.closing_time).slice(0, 5) : '23:59';
    if (start < opening || end > closing) {
      throw new ConflictError(
        `Match time (${start}–${end}) is outside the court hours (${opening}–${closing})`,
        ErrorCodes.TOURNAMENT_SCHEDULE_INVALID,
      );
    }
  }

  // ── Participant helpers ──

  private async loadParticipant(participantId: number): Promise<{ memberUserIds: number[] }> {
    const p = await participantDrawRepository.findParticipantById(participantId);
    if (!p) throw new NotFoundError('Participant', ErrorCodes.TOURNAMENT_NOT_FOUND);
    let memberUserIds = Array.isArray(p.member_user_ids) ? p.member_user_ids.map(Number) : [];
    if (memberUserIds.length === 0) {
      const members = await participantMemberRepository.listMembersByParticipant(participantId);
      memberUserIds = members.filter((m) => m.status === 'active').map((m) => Number(m.user_id));
    }
    return { memberUserIds };
  }

  private primaryMember(p: { memberUserIds: number[] }): number | null {
    return p.memberUserIds[0] ?? null;
  }

  private async emit(
    eventName: string,
    payload: Record<string, unknown>,
    t?: Tournament,
    participantUserIds: ReadonlyArray<number | null | undefined> = [],
  ): Promise<void> {
    const scope = t ? tournamentRealtimeScope(t, participantUserIds) : {};
    void eventBusV2.emit(eventName, { ...payload, ...scope } as Record<string, unknown>, {
      aggregateType: 'tournament',
      aggregateId: String(payload.tournamentId),
      aggregateVersion: 1,
    });
  }
}

export const matchScheduleService = new MatchScheduleService();