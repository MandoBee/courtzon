import { participantDrawRepository } from '../infrastructure/repositories/participant-draw.repository.js';
import { participantMemberRepository } from '../infrastructure/repositories/participant-member.repository.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { matchResultRepository } from '../../match-result/infrastructure/match-result.repository.js';
import { getPool } from '../../../database/mysql.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { tournamentRealtimeScope } from './tournament-realtime-scope.js';
import { recordAudit } from '../../audit-log/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import type {
  Tournament,
  TournamentParticipant,
  TournamentParticipantMember,
  TournamentReplacementRequest,
  ReplacementDrawImpact,
} from '../domain/tournament-aggregate.js';

type RowData = import('mysql2').RowDataPacket[];

/**
 * Group 7 — Doubles / Team participant management.
 *
 * G5 is authoritative: the Tournament Participant is the entity placed in the
 * Draw. For pair/team tournaments the participant holds MULTIPLE members; the
 * Draw NEVER reverts to treating each user as the participant.
 *
 * Concepts enforced here (single source of truth):
 *   FORMAT         — the tournament's sport_format is authoritative. singles →
 *                    individual (roster 1); doubles → pair (roster = players_
 *                    per_side, normally 2); team → team (roster = roster_size
 *                    ?? players_per_side). No fixed team sizes are invented.
 *   MEMBER MODEL   — tournament_participant_members is the normalized,
 *                    queryable + DB-enforced membership relation; member_user_ids
 *                    JSON is kept in sync ONLY as a compatibility cache.
 *   ELIGIBILITY    — user active + player profile exists + not already an
 *                    active member of another participant in the SAME tournament.
 *   UNIQUENESS     — enforced in-domain AND in-schema
 *                    (UNIQUE(user_id, active_tournament_id) generated column).
 *   REPLACEMENT    — durable request lifecycle pending → approved|rejected|
 *                    cancelled; the outgoing member row becomes 'replaced'
 *                    (never silently deleted/updated); seed + draw position are
 *                    preserved for the PARTICIPANT; a locked draw is never
 *                    silently mutated.
 *   CONCURRENCY    — the tournament row is locked FOR UPDATE for member changes;
 *                    the replacement request row is locked FOR UPDATE for review
 *                    (a request can never be approved twice; the same player can
 *                    never join two teams).
 */
export class ParticipantMemberService {
  // ── Format / roster resolution ──

  /**
   * The authoritative format config for a tournament. Derived from the
   * tournament's configured Match Format (or the sport's active default) —
   * NEVER invented. rosterSize distinguishes the active side size
   * (players_per_side) from the roster size (roster_size; NULL = players_per_side).
   */
  async resolveFormatConfig(t: Tournament): Promise<{ formatType: 'singles' | 'doubles' | 'team'; rosterSize: number | null; formatId: number | null }> {
    let format: { formatType: 'singles' | 'doubles' | 'team'; playersPerSide: number | null; rosterSize: number | null } | null = null;
    if (t.match_format_id != null) {
      const fmt = await matchResultRepository.findFormatById(t.match_format_id);
      if (fmt) format = { formatType: fmt.formatType, playersPerSide: fmt.playersPerSide, rosterSize: fmt.rosterSize };
    }
    if (!format && t.sport_id != null) {
      const def = await matchResultRepository.resolveDefaultFormatForSport(t.sport_id);
      if (def) format = { formatType: def.formatType, playersPerSide: def.playersPerSide, rosterSize: def.rosterSize };
    }
    if (!format) {
      throw new ConflictError('Tournament has no active sport format configured', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
    return {
      formatType: format.formatType,
      rosterSize: format.rosterSize ?? format.playersPerSide,
      formatId: t.match_format_id ?? null,
    };
  }

  /** Format type → required participant type (authoritative mapping). */
  expectedParticipantType(formatType: 'singles' | 'doubles' | 'team'): 'individual' | 'pair' | 'team' {
    if (formatType === 'singles') return 'individual';
    if (formatType === 'doubles') return 'pair';
    return 'team';
  }

  /** Roster size for a participant type. individuals = 1; pairs = players_per_side; teams = configured roster. */
  requiredMemberCount(formatType: 'singles' | 'doubles' | 'team', participantType: 'individual' | 'pair' | 'team', rosterSize: number | null): number {
    if (participantType === 'individual') return 1;
    if (participantType === 'pair') return rosterSize ?? 2;
    return rosterSize ?? 2;
  }

  // ── Participant type validation ──

  private assertParticipantTypeMatchesFormat(
    fmt: { formatType: 'singles' | 'doubles' | 'team'; rosterSize: number | null },
    participantType: 'individual' | 'pair' | 'team',
  ): { formatType: 'singles' | 'doubles' | 'team'; rosterSize: number | null } {
    const expected = this.expectedParticipantType(fmt.formatType);
    if (expected !== participantType) {
      throw new ValidationError(
        `Participant type "${participantType}" is invalid for a ${fmt.formatType} tournament`,
        ErrorCodes.TOURNAMENT_PARTICIPANT_TYPE_INVALID,
        { expected, actual: participantType, formatType: fmt.formatType },
      );
    }
    return fmt;
  }

  // ── Eligibility ──

  /** One source of truth for member eligibility (minimum for this group). */
  private async assertMemberEligible(
    tournamentId: number,
    userId: number,
    opts: { excludeParticipantId?: number; conn?: import('mysql2/promise').PoolConnection } = {},
  ): Promise<{ id: number; full_name: string | null }> {
    const player = await participantMemberRepository.findEligiblePlayer(userId, opts.conn);
    if (!player) {
      throw new ConflictError(
        `Player #${userId} is not eligible (must be an active user with a player profile)`,
        ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_NOT_ELIGIBLE,
      );
    }
    const active = await participantMemberRepository.findActiveMemberByUser(tournamentId, userId, opts.conn);
    if (active && (opts.excludeParticipantId == null || Number(active.participant_id) !== opts.excludeParticipantId)) {
      throw new ConflictError(
        `Player #${userId} is already an active member of another participant in this tournament`,
        ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_ACTIVE_DUPLICATE,
      );
    }
    return player;
  }

  private assertMemberCount(participantType: 'individual' | 'pair' | 'team', formatType: 'singles' | 'doubles' | 'team', rosterSize: number | null, activeCount: number, required: number): void {
    const requiredCount = required;
    if (participantType === 'pair' && activeCount !== requiredCount) {
      throw new ConflictError(
        `A ${formatType} participant requires exactly ${requiredCount} active members (currently ${activeCount})`,
        ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_COUNT_INVALID,
        { expected: requiredCount, actual: activeCount, participantType },
      );
    }
    if (participantType === 'team' && (activeCount < 2 || activeCount > requiredCount)) {
      throw new ConflictError(
        `A team participant requires between 2 and ${requiredCount} active members (currently ${activeCount})`,
        ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_COUNT_INVALID,
        { min: 2, max: requiredCount, actual: activeCount },
      );
    }
    if (participantType === 'individual' && activeCount !== 1) {
      throw new ConflictError(
        'An individual participant requires exactly 1 active member',
        ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_COUNT_INVALID,
        { expected: 1, actual: activeCount },
      );
    }
  }

  // ── Pair / Team creation ──

  /** Create a PAIR participant (exactly the configured pair size of active members). */
  async createPairParticipant(
    tournamentId: number,
    input: { name?: string; memberUserIds: number[]; paymentMethod?: string },
    actorId: number,
  ): Promise<TournamentParticipant & { payment?: Record<string, unknown> | null }> {
    return this.createParticipant(tournamentId, { ...input, participantType: 'pair' }, actorId);
  }

  /** Create a TEAM participant (roster from the sport format config; 2..rosterSize active members). */
  async createTeamParticipant(
    tournamentId: number,
    input: { name?: string; memberUserIds: number[]; paymentMethod?: string },
    actorId: number,
  ): Promise<TournamentParticipant & { payment?: Record<string, unknown> | null }> {
    return this.createParticipant(tournamentId, { ...input, participantType: 'team' }, actorId);
  }

  /**
   * Transactional participant creation for pair/team. One authoritative
   * Tournament registration (the participant's entry — NOT one per member),
   * one Tournament participant, N normalized member rows. A partially created
   * team can never appear as a valid active participant: the whole insert is
   * atomic on the tournament row lock FOR UPDATE.
   */
  async createParticipant(
    tournamentId: number,
    input: { participantType: 'pair' | 'team'; name?: string; memberUserIds: number[]; paymentMethod?: string },
    actorId: number,
  ): Promise<TournamentParticipant & { payment?: Record<string, unknown> | null }> {
    const t = await this.getTournament(tournamentId);
    if (t.status !== 'registration_open' && t.status !== 'published') {
      throw new ConflictError('Registration is not open for this tournament', ErrorCodes.TOURNAMENT_REGISTRATION_CLOSED);
    }
    if (t.registration_closes) {
      const deadline = new Date(t.registration_closes);
      if (!Number.isNaN(deadline.getTime()) && Date.now() >= deadline.getTime()) {
        throw new ConflictError('Registration has closed for this tournament', ErrorCodes.TOURNAMENT_REGISTRATION_CLOSED);
      }
    }
    // Resolve the authoritative format config (async DB lookups).
    const fmt = await this.resolveFormatConfig(t);
    this.assertParticipantTypeMatchesFormat(fmt, input.participantType);

    const members = Array.from(new Set(input.memberUserIds.map((id) => Number(id))));
    if (members.length === 0) {
      throw new ConflictError('A participant requires at least one member', ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_COUNT_INVALID);
    }
    const requiredCount = this.requiredMemberCount(fmt.formatType, input.participantType, fmt.rosterSize);
    this.assertMemberCount(input.participantType, fmt.formatType, fmt.rosterSize, members.length, requiredCount);

    const displayName = input.name?.trim() || (input.participantType === 'pair' ? 'Unnamed Pair' : 'Unnamed Team');

    const conn = await getPool().getConnection();
    let participantId: number;
    let registrationId: number | null = null;
    try {
      await conn.beginTransaction();
      await conn.query('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [tournamentId]);

      // Capacity checked INSIDE the tournament row lock (no race on the slot).
      const activeCount = await participantDrawRepository.countParticipantsByTournament(tournamentId, conn);
      const cap = Number(t.max_participants ?? 0);
      if (cap > 0 && activeCount + 1 > cap) {
        throw new ConflictError('Tournament is at full capacity', ErrorCodes.TOURNAMENT_CAPACITY_FULL);
      }

      // Eligibility + uniqueness for EVERY member (single source of truth).
      for (const userId of members) {
        await this.assertMemberEligible(tournamentId, userId, { conn });
      }

      // One authoritative registration (the participant entry). Payment stays
      // tied to this single entry — never a separate payment per team member.
      const primaryUserId = members[0];
      registrationId = await tournamentRepository.createRegistration({
        tournament_id: tournamentId,
        user_id: primaryUserId,
        player_id: primaryUserId,
        seed: activeCount + 1,
        status: 'registered',
        payment_status: 'unpaid',
      });

      participantId = await participantDrawRepository.createParticipant({
        tournament_id: tournamentId,
        registration_id: registrationId,
        participant_type: input.participantType,
        status: 'active',
        member_user_ids: members,
      });

      let order = 0;
      for (const userId of members) {
        await participantMemberRepository.addMember({
          tournament_id: tournamentId,
          participant_id: participantId,
          user_id: userId,
          member_order: order,
          conn,
        });
        order += 1;
      }
      await participantMemberRepository.updateParticipantName(participantId, displayName, conn);

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    // Payment follows the EXISTING Group 3 policy (single entry fee).
    const paymentRequired = Number(t.entry_fee ?? 0) > 0;
    const payment = paymentRequired && input.paymentMethod && registrationId != null
      ? await this.settlePayment(registrationId, participantId, t, input.paymentMethod)
      : null;

    await recordAudit({
      actorId,
      action: `TOURNAMENT.PARTICIPANT_CREATED_${input.participantType.toUpperCase()}`,
      entityType: 'tournament_participant',
      entityId: participantId,
      afterState: {
        tournament_id: tournamentId,
        registration_id: registrationId,
        participant_type: input.participantType,
        name: displayName,
        member_user_ids: members,
        payment_method: input.paymentMethod ?? null,
      },
    });
    await this.emit('tournament:participant-created', {
      tournamentId,
      participantId,
      participantType: input.participantType,
      memberUserIds: members,
      organisationId: t.organisation_id ?? null,
    }, t, members);
    await this.emit('tournament:participant-members-updated', {
      tournamentId,
      participantId,
      memberUserIds: members,
      organisationId: t.organisation_id ?? null,
    }, t, members);

    const participant = (await participantDrawRepository.findParticipantById(participantId))!;
    const memberRows = await participantMemberRepository.listMembersByParticipant(participantId);
    return { ...participant, name: displayName, members: memberRows, payment };
  }

  // ── Member management ──

  /** Authoritative member list of a participant (joined with user names). */
  async listParticipantMembers(tournamentId: number, participantId: number): Promise<Array<TournamentParticipantMember & { full_name?: string | null }>> {
    await this.assertParticipantBelongsToTournament(tournamentId, participantId);
    return participantMemberRepository.listMembersByParticipant(participantId);
  }

  /**
   * Add a member to an existing pair/team participant (pre-start only).
   * Enforces eligibility, uniqueness and the format's roster limit.
   */
  async addParticipantMember(tournamentId: number, participantId: number, userId: number, actorId: number): Promise<Array<TournamentParticipantMember & { full_name?: string | null }>> {
    const t = await this.getTournament(tournamentId);
    const participant = await this.assertParticipantBelongsToTournament(tournamentId, participantId);
    if (participant.participant_type === 'individual') {
      throw new ConflictError('Individual participants have exactly one member', ErrorCodes.TOURNAMENT_PARTICIPANT_TYPE_INVALID);
    }
    if (await this.hasTournamentStarted(tournamentId)) {
      throw new ConflictError('Tournament has started — members cannot be added', ErrorCodes.TOURNAMENT_INVALID_TRANSITION);
    }
    const fmt = await this.resolveFormatConfig(t);
    const requiredCount = this.requiredMemberCount(fmt.formatType, participant.participant_type, fmt.rosterSize);

    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [tournamentId]);
      await this.assertMemberEligible(tournamentId, userId, { excludeParticipantId: participantId, conn });
      const existing = await participantMemberRepository.findMember(participantId, userId, conn);
      if (existing) {
        throw new ConflictError('Player is already a member of this participant', ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_DUPLICATE);
      }
      const activeCount = await participantMemberRepository.countActiveMembers(participantId, conn);
      if (activeCount + 1 > requiredCount) {
        throw new ConflictError(
          `This ${participant.participant_type} participant is already at its roster size (${requiredCount})`,
          ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_COUNT_INVALID,
          { max: requiredCount, actual: activeCount + 1 },
        );
      }
      await participantMemberRepository.addMember({
        tournament_id: tournamentId,
        participant_id: participantId,
        user_id: userId,
        member_order: activeCount,
        conn,
      });
      await this.syncMemberCache(participantId, conn);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await recordAudit({
      actorId,
      action: 'TOURNAMENT.MEMBER_ADDED',
      entityType: 'tournament_participant_member',
      entityId: participantId,
      afterState: { participant_id: participantId, user_id: userId },
    });
    await this.emit('tournament:participant-members-updated', {
      tournamentId,
      participantId,
      addedUserId: userId,
      organisationId: t.organisation_id ?? null,
    }, t, [
      userId,
      ...(Array.isArray(participant.member_user_ids) ? participant.member_user_ids : []),
    ]);
    return participantMemberRepository.listMembersByParticipant(participantId);
  }

  /**
   * Remove an active member (pre-start only). Never a destructive delete — the
   * member row becomes 'left' (history preserved). Cannot drop below the
   * format's minimum active size (1 for pairs, 2 for teams).
   */
  async removeParticipantMember(tournamentId: number, participantId: number, userId: number, actorId: number): Promise<Array<TournamentParticipantMember & { full_name?: string | null }>> {
    const t = await this.getTournament(tournamentId);
    const participant = await this.assertParticipantBelongsToTournament(tournamentId, participantId);
    if (participant.participant_type === 'individual') {
      throw new ConflictError('Individual participants cannot lose their only member — withdraw the participant instead', ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_COUNT_INVALID);
    }
    if (await this.hasTournamentStarted(tournamentId)) {
      throw new ConflictError('Tournament has started — members cannot be removed', ErrorCodes.TOURNAMENT_INVALID_TRANSITION);
    }

    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [tournamentId]);
      const member = await participantMemberRepository.findMember(participantId, userId, conn);
      if (!member || member.status !== 'active') {
        throw new NotFoundError('Member', ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_NOT_FOUND);
      }
      const activeCount = await participantMemberRepository.countActiveMembers(participantId, conn);
      const minActive = 2;
      if (activeCount <= minActive) {
        throw new ConflictError(
          `Cannot remove the only member(s) of a ${participant.participant_type} participant (minimum ${minActive} active)`,
          ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_COUNT_INVALID,
          { min: minActive, actual: activeCount },
        );
      }
      await participantMemberRepository.updateMemberLeft(member.id!, conn);
      await this.syncMemberCache(participantId, conn);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await recordAudit({
      actorId,
      action: 'TOURNAMENT.MEMBER_REMOVED',
      entityType: 'tournament_participant_member',
      entityId: participantId,
      beforeState: { participant_id: participantId, user_id: userId, status: 'active' },
      afterState: { participant_id: participantId, user_id: userId, status: 'left' },
    });
    await this.emit('tournament:participant-members-updated', {
      tournamentId,
      participantId,
      removedUserId: userId,
      organisationId: t.organisation_id ?? null,
    }, t, [
      userId,
      ...(Array.isArray(participant.member_user_ids) ? participant.member_user_ids : []),
    ]);
    return participantMemberRepository.listMembersByParticipant(participantId);
  }

  /** Keep the G5 JSON cache in sync with the authoritative members table. */
  private async syncMemberCache(participantId: number, conn?: import('mysql2/promise').PoolConnection): Promise<number[]> {
    const rows = await participantMemberRepository.listMembersByParticipant(participantId, conn);
    const active = rows.filter((m) => m.status === 'active').sort((a, b) => a.member_order - b.member_order).map((m) => Number(m.user_id));
    await participantMemberRepository.updateParticipantMemberUserIds(participantId, active, conn);
    return active;
  }

  // ── Replacement request workflow ──

  /**
   * Create a durable player-replacement request. The outgoing member row is NOT
   * touched; the request records the full before/after intent and a draw-impact
   * snapshot. One open request per participant (DB-unique open_flag).
   */
  async createReplacementRequest(
    tournamentId: number,
    participantId: number,
    input: { outgoingUserId: number; replacementUserId: number; reason?: string },
    actorId: number,
  ): Promise<TournamentReplacementRequest & { drawImpact: ReplacementDrawImpact }> {
    const t = await this.getTournament(tournamentId);
    const participant = await this.assertParticipantBelongsToTournament(tournamentId, participantId);
    if (participant.participant_type === 'individual') {
      throw new ConflictError('Individual participants have no members to replace', ErrorCodes.TOURNAMENT_PARTICIPANT_TYPE_INVALID);
    }
    if (await this.hasTournamentStarted(tournamentId)) {
      throw new ConflictError(
        'Post-start player replacement is blocked — the current rule configuration does not permit it',
        ErrorCodes.TOURNAMENT_REPLACEMENT_POST_START_BLOCKED,
      );
    }
    if (input.outgoingUserId === input.replacementUserId) {
      throw new ConflictError('The replacement player cannot be the outgoing member', ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_DUPLICATE);
    }

    const conn = await getPool().getConnection();
    let requestId: number;
    const impact = await this.getReplacementDrawImpact(tournamentId, participantId);
    try {
      await conn.beginTransaction();
      await conn.query('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [tournamentId]);
      const existingPending = await participantMemberRepository.findPendingReplacementRequest(participantId, conn);
      if (existingPending) {
        throw new ConflictError('A replacement request is already pending for this participant', ErrorCodes.TOURNAMENT_REPLACEMENT_REQUEST_EXISTS);
      }
      const member = await participantMemberRepository.findMember(participantId, input.outgoingUserId, conn);
      if (!member || member.status !== 'active') {
        throw new NotFoundError('Outgoing member', ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_NOT_FOUND);
      }
      await this.assertMemberEligible(tournamentId, input.replacementUserId, { excludeParticipantId: participantId, conn });
      requestId = await participantMemberRepository.createReplacementRequest({
        tournament_id: tournamentId,
        participant_id: participantId,
        outgoing_member_user_id: input.outgoingUserId,
        replacement_user_id: input.replacementUserId,
        requested_by: actorId,
        reason: input.reason ?? null,
        draw_impact: impact as unknown as Record<string, unknown>,
        conn,
      });
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const request = (await participantMemberRepository.findReplacementRequest(requestId))!;
    await recordAudit({
      actorId,
      action: 'TOURNAMENT.REPLACEMENT_REQUESTED',
      entityType: 'tournament_replacement_request',
      entityId: requestId,
      afterState: {
        tournament_id: tournamentId,
        participant_id: participantId,
        outgoing_member_user_id: input.outgoingUserId,
        replacement_user_id: input.replacementUserId,
        reason: input.reason ?? null,
      },
    });
    await this.emit('tournament:replacement-request-updated', {
      tournamentId,
      participantId,
      requestId,
      status: 'pending',
      organisationId: t.organisation_id ?? null,
    }, t, [
      input.outgoingUserId,
      input.replacementUserId,
      ...(Array.isArray(participant.member_user_ids) ? participant.member_user_ids : []),
    ]);
    return { ...request, drawImpact: impact };
  }

  async listReplacementRequests(tournamentId: number, status?: string): Promise<Array<TournamentReplacementRequest & { participant_name?: string | null; outgoing_member_name?: string | null; replacement_user_name?: string | null; requested_by_name?: string | null }>> {
    return participantMemberRepository.listReplacementRequests(tournamentId, status);
  }

  /**
   * Approve a replacement request (admin). ATOMIC: the request row is locked
   * FOR UPDATE so two admins can never approve the same request twice. The
   * outgoing member becomes 'replaced' (history preserved), the replacement
   * becomes an active member, the participant SEED + DRAW POSITION are
   * preserved, and a locked draw is never silently mutated.
   */
  async approveReplacementRequest(tournamentId: number, requestId: number, actorId: number): Promise<{ request: TournamentReplacementRequest; drawImpact: ReplacementDrawImpact }> {
    const t = await this.getTournament(tournamentId);
    if (await this.hasTournamentStarted(tournamentId)) {
      throw new ConflictError(
        'Post-start player replacement is blocked — the current rule configuration does not permit it',
        ErrorCodes.TOURNAMENT_REPLACEMENT_POST_START_BLOCKED,
      );
    }
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [tournamentId]);
      const request = await this.lockRequest(tournamentId, requestId, conn);
      if (request.status !== 'pending') {
        throw new ConflictError(
          `Replacement request is already ${request.status}`,
          ErrorCodes.TOURNAMENT_REPLACEMENT_INVALID_STATE,
        );
      }
      // Replacement eligibility re-validated AT APPROVAL TIME (never assumed).
      await this.assertMemberEligible(tournamentId, Number(request.replacement_user_id), { excludeParticipantId: Number(request.participant_id), conn });

      const participantId = Number(request.participant_id);
      const participant = await participantDrawRepository.findParticipantById(participantId);
      if (!participant) throw new NotFoundError('Participant', ErrorCodes.TOURNAMENT_NOT_FOUND);

      const outgoing = await participantMemberRepository.findMember(participantId, Number(request.outgoing_member_user_id), conn);
      if (!outgoing || outgoing.status !== 'active') {
        throw new NotFoundError('Outgoing member', ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_NOT_FOUND);
      }

      const activeCount = await participantMemberRepository.countActiveMembers(participantId, conn);
      const replacement = await participantMemberRepository.addMember({
        tournament_id: tournamentId,
        participant_id: participantId,
        user_id: Number(request.replacement_user_id),
        member_order: activeCount,
        conn,
      });
      await participantMemberRepository.markMemberReplaced(outgoing.id!, replacement, conn);
      const activeUserIds = await this.syncMemberCache(participantId, conn);

      // Participant identity/seed/draw position all preserved. The draw only
      // requires re-validation (never silent regeneration; locked draws stay).
      const impact = await this.getReplacementDrawImpact(tournamentId, participantId);
      await participantMemberRepository.updateReplacementRequest(requestId, {
        status: 'approved',
        reviewed_by: actorId,
        reviewed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        draw_impact: impact as unknown as Record<string, unknown>,
        conn,
      });
      await conn.commit();

      await recordAudit({
        actorId,
        action: 'TOURNAMENT.REPLACEMENT_APPROVED',
        entityType: 'tournament_replacement_request',
        entityId: requestId,
        beforeState: { participant_id: participantId, outgoing_member_user_id: request.outgoing_member_user_id, replacement_user_id: request.replacement_user_id, status: 'pending' },
        afterState: { status: 'approved', active_member_user_ids: activeUserIds, seed_preserved: true, draw_preserved: true },
      });
      await this.emit('tournament:replacement-request-updated', {
        tournamentId,
        participantId,
        requestId,
        status: 'approved',
        organisationId: t.organisation_id ?? null,
      }, t, activeUserIds);
      await this.emit('tournament:participant-members-updated', {
        tournamentId,
        participantId,
        memberUserIds: activeUserIds,
        organisationId: t.organisation_id ?? null,
      }, t, activeUserIds);
      const updated = (await participantMemberRepository.findReplacementRequest(requestId))!;
      return { request: updated, drawImpact: impact };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** Reject a pending replacement request (admin). */
  async rejectReplacementRequest(tournamentId: number, requestId: number, actorId: number, reason?: string): Promise<TournamentReplacementRequest> {
    const t = await this.getTournament(tournamentId);
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [tournamentId]);
      const request = await this.lockRequest(tournamentId, requestId, conn);
      if (request.status !== 'pending') {
        throw new ConflictError(
          `Replacement request is already ${request.status}`,
          ErrorCodes.TOURNAMENT_REPLACEMENT_INVALID_STATE,
        );
      }
      await participantMemberRepository.updateReplacementRequest(requestId, {
        status: 'rejected',
        reviewed_by: actorId,
        reviewed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        rejection_reason: reason ?? null,
        conn,
      });
      await conn.commit();
      await recordAudit({
        actorId,
        action: 'TOURNAMENT.REPLACEMENT_REJECTED',
        entityType: 'tournament_replacement_request',
        entityId: requestId,
        beforeState: { participant_id: request.participant_id, status: 'pending' },
        afterState: { status: 'rejected', reason: reason ?? null },
      });
      await this.emit('tournament:replacement-request-updated', {
        tournamentId,
        participantId: request.participant_id,
        requestId,
        status: 'rejected',
        organisationId: t.organisation_id ?? null,
      }, t, [request.outgoing_member_user_id, request.replacement_user_id]);
      return (await participantMemberRepository.findReplacementRequest(requestId))!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** Cancel a pending replacement request (requester or admin). */
  async cancelReplacementRequest(tournamentId: number, requestId: number, actorId: number): Promise<TournamentReplacementRequest> {
    const t = await this.getTournament(tournamentId);
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [tournamentId]);
      const request = await this.lockRequest(tournamentId, requestId, conn);
      if (request.status !== 'pending') {
        throw new ConflictError(
          `Replacement request is already ${request.status}`,
          ErrorCodes.TOURNAMENT_REPLACEMENT_INVALID_STATE,
        );
      }
      await participantMemberRepository.updateReplacementRequest(requestId, {
        status: 'cancelled',
        reviewed_by: actorId,
        reviewed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        conn,
      });
      await conn.commit();
      await recordAudit({
        actorId,
        action: 'TOURNAMENT.REPLACEMENT_CANCELLED',
        entityType: 'tournament_replacement_request',
        entityId: requestId,
        beforeState: { participant_id: request.participant_id, status: 'pending' },
        afterState: { status: 'cancelled' },
      });
      await this.emit('tournament:replacement-request-updated', {
        tournamentId,
        participantId: request.participant_id,
        requestId,
        status: 'cancelled',
        organisationId: t.organisation_id ?? null,
      }, t, [request.outgoing_member_user_id, request.replacement_user_id]);
      return (await participantMemberRepository.findReplacementRequest(requestId))!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** Lock a replacement request row inside the caller's transaction. */
  private async lockRequest(tournamentId: number, requestId: number, conn: import('mysql2/promise').PoolConnection): Promise<TournamentReplacementRequest> {
    const [rows] = await conn.query<RowData>(
      'SELECT * FROM tournament_replacement_requests WHERE id = ? AND tournament_id = ? FOR UPDATE',
      [requestId, tournamentId],
    );
    if (!rows.length) throw new NotFoundError('Replacement request', ErrorCodes.TOURNAMENT_REPLACEMENT_REQUEST_NOT_FOUND);
    return rows[0] as TournamentReplacementRequest;
  }

  // ── Draw impact ──

  /**
   * Group 7 structured replacement draw impact. The Participant identity, its
   * Tournament Seed and its Draw position are preserved by definition; the draw
   * only ever requires re-VALIDATION (never silent regeneration, never moving a
   * locked draw).
   */
  async getReplacementDrawImpact(tournamentId: number, participantId: number): Promise<ReplacementDrawImpact> {
    const seed = await participantDrawRepository.findSeedByParticipant(participantId);
    const draw = await participantDrawRepository.findCurrentDraw(tournamentId);
    const entry = draw ? await participantDrawRepository.findEntryByParticipant(draw.id!, participantId) : null;
    return {
      participantId,
      drawAffected: draw != null && entry != null,
      requiresValidation: draw != null && entry != null,
      requiresRedraw: false,
      seedPreserved: true,
    };
  }

  // ── Shared helpers ──

  /** Authoritative "has the tournament started": lifecycle OR any started match. */
  private async hasTournamentStarted(tournamentId: number): Promise<boolean> {
    const t = await this.getTournament(tournamentId);
    if (t.status && ['running', 'completed', 'cancelled', 'archived'].includes(t.status)) return true;
    try {
      return await tournamentRepository.hasAnyStartedMatch(tournamentId);
    } catch {
      return false;
    }
  }

  /** One authoritative Group 3 settlement path (delegates to the G5/G6 service). */
  private async settlePayment(
    registrationId: number,
    participantId: number,
    t: Tournament,
    paymentMethod: string,
  ): Promise<Record<string, unknown> | null> {
    const { participantDrawService } = await import('./participant-draw.service.js');
    return participantDrawService.settleRegistrationPayment(registrationId, participantId, t, paymentMethod);
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

  private async getTournament(tournamentId: number): Promise<Tournament> {
    const t = await tournamentRepository.findById(tournamentId);
    if (!t) throw new NotFoundError('Tournament', ErrorCodes.TOURNAMENT_NOT_FOUND);
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

export const participantMemberService = new ParticipantMemberService();