import { getPool } from '../../../database/mysql.js';
import { ConflictError, NotFoundError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { tournamentRealtimeScope } from './tournament-realtime-scope.js';
import { participantMemberService } from './participant-member.service.js';
import { competitionService } from './competition.service.js';
import { competitionRepository } from '../infrastructure/repositories/competition.repository.js';
import { participantDrawRepository } from '../infrastructure/repositories/participant-draw.repository.js';
import { participantMemberRepository } from '../infrastructure/repositories/participant-member.repository.js';
import { teamInvitationRepository } from '../infrastructure/repositories/team-invitation.repository.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { recordAudit } from '../../audit-log/index.js';
import type { Tournament, TournamentCompetition, TournamentParticipant, TournamentTeamInvitation, TeamInvitationStatus } from '../domain/tournament-aggregate.js';

/**
 * G11.17 — PLAYER team self-service: creation, join, invitations (invite →
 * accept / reject), roster management within the existing tournament rules.
 *
 * NON-FINANCIAL: it reuses the existing participant/member pipeline only.
 * G11.15 team-prize eligibility stays fail-closed (nothing here participates in
 * prize payout identity). Invitations live EXCLUSIVELY in
 * `tournament_team_invitations`; `tournament_participant_members.status` is
 * never extended and an invited user is NOT a member until accepted.
 *
 * Security rules enforced here (server-authoritative, beyond route permission):
 *   - invitations/management require the TEAM CAPTAIN (primary active member);
 *   - every operation is scoped to the tournament + participant (cross-tournament
 *     and cross-tenant requests fail with not-found);
 *   - accept/join re-validate eligibility, tournament state, roster capacity,
 *     duplicate membership and active-member uniqueness inside a transaction
 *     with row locks;
 *   - duplicate invitations are impossible (UNIQUE(participant_id, invitee_user_id));
 *   - expired invitations fail safely.
 */
const INVITATION_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours; lazy + explicit expiry.

export function isExpired(inv: Pick<TournamentTeamInvitation, 'expires_at'>, now = Date.now()): boolean {
  return inv.expires_at != null && new Date(inv.expires_at).getTime() <= now;
}

export function invitationTtlMs(): number {
  return INVITATION_TTL_MS;
}

/**
 * Phase 3 — normalise a phone number supplied for an invitation to the
 * digits-with-optional-leading-'+' form stored in `users.full_phone` /
 * `users.phone_number`. Presentational only: the actual match (full_phone OR
 * phone_number) is performed by the repository.
 */
export function normalizeInvitePhone(phone: string): string {
  const trimmed = String(phone ?? '').trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Phase 3 — a TERMINAL invitation (rejected or expired) may be safely re-opened
 * on a re-invitation. Pending (live) and accepted invitations must never be
 * re-sent: a pending one already stands, an accepted one means the player is
 * already a member.
 */
export function reinvitableStatus(status: TeamInvitationStatus): boolean {
  return status === 'rejected' || status === 'expired';
}

/**
 * Phase 3 fix (F2) — whether an EXISTING invitation row may be re-opened by a
 * re-invitation. True for a TERMINAL row (rejected / expired) and ALSO for a
 * still-PENDING row whose `expires_at` is already overdue: expiry is applied
 * lazily (`expireOverdue` / reads), so without this an overdue invitation could
 * not be re-sent until some unrelated read happened to expire it first (it would
 * be rejected as a duplicate). A live (non-overdue) pending invitation and an
 * accepted one are never re-sendable.
 */
export function isReinvitable(
  inv: Pick<TournamentTeamInvitation, 'status' | 'expires_at'> | null | undefined,
  now = Date.now(),
): boolean {
  if (!inv) return false;
  return reinvitableStatus(inv.status) || (inv.status === 'pending' && isExpired(inv, now));
}

function participantMemberIds(p: TournamentParticipant): number[] {
  return Array.isArray(p.member_user_ids) ? p.member_user_ids.map((id) => Number(id)) : [];
}

export class TeamInvitationService {
  // ── Shared guards ──

  private async getTournament(tournamentId: number): Promise<Tournament> {
    const t = await tournamentRepository.findById(tournamentId);
    if (!t) throw new NotFoundError('Tournament', ErrorCodes.TOURNAMENT_NOT_FOUND);
    return t;
  }

  private async getParticipant(tournamentId: number, participantId: number): Promise<TournamentParticipant> {
    const p = await participantDrawRepository.findParticipantById(participantId);
    if (!p || Number(p.tournament_id) !== Number(tournamentId) || p.participant_type !== 'team') {
      throw new NotFoundError('Team participant', ErrorCodes.TOURNAMENT_NOT_FOUND);
    }
    return p;
  }

  /** Registration must still be open and the tournament not started. */
  private async assertTeamWindowOpen(t: Tournament): Promise<void> {
    if (t.status !== 'published' && t.status !== 'registration_open') {
      throw new ConflictError('Team changes are only allowed while registration is open', ErrorCodes.TOURNAMENT_REGISTRATION_CLOSED);
    }
    if (t.registration_closes) {
      const deadline = new Date(t.registration_closes);
      if (!Number.isNaN(deadline.getTime()) && Date.now() >= deadline.getTime()) {
        throw new ConflictError('Registration has closed for this tournament', ErrorCodes.TOURNAMENT_REGISTRATION_CLOSED);
      }
    }
    let started = ['running', 'completed', 'cancelled', 'archived'].includes(String(t.status));
    if (!started) {
      try { started = await tournamentRepository.hasAnyStartedMatch(Number(t.id)); } catch { /* keep */ }
    }
    if (started) {
      throw new ConflictError('Tournament has started — team changes are not allowed', ErrorCodes.TOURNAMENT_INVALID_TRANSITION);
    }
  }

  /** The team captain is the primary ACTIVE member (member_order 0). */
  private async assertCaptain(tournamentId: number, participantId: number, actorId: number): Promise<void> {
    const participant = await this.getParticipant(tournamentId, participantId);
    const members = await participantMemberRepository.listMembersByParticipant(participantId);
    const primary = members.find((m) => Number(m.member_order) === 0 && m.status === 'active');
    const isCaptain = primary ? Number(primary.user_id) === Number(actorId)
      : participantMemberIds(participant).length > 0 && participantMemberIds(participant)[0] === Number(actorId);
    if (!isCaptain) {
      throw new ForbiddenError('Only the team captain can invite or manage team members', ErrorCodes.TOURNAMENT_TEAM_CAPTAIN_REQUIRED);
    }
    void tournamentId;
  }

  /** Is this a TEAM-format competition? Reject singles/doubles for team flows. */
  private async assertTeamFormat(t: Tournament, competition?: TournamentCompetition | null): Promise<void> {
    const fmt = await participantMemberService.resolveFormatConfig(t, competition ?? null);
    if (fmt.formatType !== 'team') {
      throw new ConflictError('Team flows require a team-format competition', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
  }

  /** The competition of an existing participant (null when unset/legacy). */
  private async competitionOfParticipant(participant: TournamentParticipant): Promise<TournamentCompetition | null> {
    if (participant.competition_id == null) return null;
    return competitionRepository.findById(Number(participant.competition_id)).catch(() => null);
  }

  // ── Player team creation ──

  async createTeamForPlayer(
    tournamentId: number,
    actorId: number,
    input: { name?: string; memberUserIds?: number[]; competitionId?: number | null },
  ): Promise<TournamentParticipant & { members?: Array<any> }> {
    const t = await this.getTournament(tournamentId);
    // G11.18 Phase 2 — the team is created IN a competition (explicit, or the
    // single/default competition); the format gate uses THAT competition.
    const competition = await competitionService.resolveRegistrationCompetition(tournamentId, input.competitionId ?? null);
    await this.assertTeamFormat(t, competition);
    await this.assertTeamWindowOpen(t);
    // THE creator must be the team captain (primary member): never allow a
    // player to create a team they are not part of.
    const members = Array.from(new Set([Number(actorId), ...(Array.isArray(input.memberUserIds) ? input.memberUserIds.map((id) => Number(id)) : [])]));
    // Phase 3 — a player team may be created FORMING with the captain as its first
    // (and initially only) active member; the partner is added through the
    // invitation lifecycle and the team is completed on acceptance. Admin /
    // management creation keeps the strict 2-member minimum.
    const created = await participantMemberService.createTeamParticipant(
      tournamentId,
      { name: input.name, memberUserIds: members, competitionId: competition?.id ?? null, allowFormingTeam: true },
      actorId,
    );
    return created;
  }

  // ── Roster / join ──

  async listMyTeams(tournamentId: number, actorId: number): Promise<TournamentParticipant[]> {
    const participants = await participantDrawRepository.listParticipantsByTournament(tournamentId);
    const mine = participants.filter((p) => p.participant_type === 'team' && participantMemberIds(p).includes(Number(actorId)));
    return mine.map((p) => ({ ...p, members: p.member_user_ids }) as TournamentParticipant);
  }

  async listTeamsForJoin(tournamentId: number): Promise<Array<{ id: number; name: string | null; memberCount: number; rosterSize: number | null }>> {
    await this.getTournament(tournamentId);
    const defaultFmt = await participantMemberService.resolveFormatConfig(await this.getTournament(tournamentId)).catch(() => null);
    const participants = (await participantDrawRepository.listParticipantsByTournament(tournamentId)).filter((p) => p.participant_type === 'team');
    const out: Array<{ id: number; name: string | null; memberCount: number; rosterSize: number | null }> = [];
    for (const p of participants) {
      const count = await participantMemberRepository.countActiveMembers(Number(p.id));
      // G11.18 Phase 2 — the roster limit comes from the team's OWN competition format.
      const comp = await this.competitionOfParticipant(p).catch(() => null);
      const fmt = comp ? await participantMemberService.resolveFormatConfig(await this.getTournament(tournamentId), comp).catch(() => null) : null;
      out.push({ id: Number(p.id), name: (p as any).name ?? null, memberCount: count, rosterSize: fmt?.rosterSize ?? defaultFmt?.rosterSize ?? 2 });
    }
    return out;
  }

  /** An eligible player joins a team themselves (immediate, pre-start). */
  async joinTeam(tournamentId: number, participantId: number, actorId: number): Promise<void> {
    const t = await this.getTournament(tournamentId);
    const participant = await this.getParticipant(tournamentId, participantId);
    const competition = await this.competitionOfParticipant(participant);
    await this.assertTeamFormat(t, competition);
    await this.assertTeamWindowOpen(t);

    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [tournamentId]);
      await participantMemberService.addMemberTransactional(tournamentId, participantId, actorId, conn);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await recordAudit({
      actorId,
      action: 'TOURNAMENT.TEAM_JOINED',
      entityType: 'tournament_participant',
      entityId: participantId,
      afterState: { tournament_id: tournamentId, participant_id: participantId, user_id: actorId },
    });
    this.emitMembersUpdated(t, participantId, actorId, participant);
  }

  // ── Invitations ──

  async invitePlayer(
    tournamentId: number,
    participantId: number,
    inviteeUserId: number,
    actorId: number,
  ): Promise<TournamentTeamInvitation> {
    const t = await this.getTournament(tournamentId);
    const participant = await this.getParticipant(tournamentId, participantId);
    const competition = await this.competitionOfParticipant(participant);
    await this.assertTeamFormat(t, competition);
    await this.assertTeamWindowOpen(t);
    await this.assertCaptain(tournamentId, participantId, actorId);

    if (Number(inviteeUserId) === Number(actorId)) {
      throw new ConflictError('You cannot invite yourself to your own team', ErrorCodes.TOURNAMENT_TEAM_INVITATION_DUPLICATE);
    }
    // The invitee must be an eligible player and not already an active member of
    // any participant in THIS competition (uk_active_user_competition semantics —
    // the same player MAY be active in another competition of the tournament).
    const eligible = await participantMemberRepository.findEligiblePlayer(Number(inviteeUserId));
    if (!eligible) {
      throw new ConflictError('Invitee is not an eligible player', ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_NOT_ELIGIBLE);
    }
    const alreadyActive = competition
      ? await participantMemberRepository.findActiveMemberByCompetition(Number(competition.id), Number(inviteeUserId))
      : await participantMemberRepository.findActiveMemberByUser(Number(t.id), Number(inviteeUserId));
    if (alreadyActive) {
      throw new ConflictError(
        competition ? 'Invitee is already an active member in this competition' : 'Invitee is already an active participant in this tournament',
        ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_ACTIVE_DUPLICATE,
      );
    }
    const existing = await teamInvitationRepository.findByParticipantAndInvitee(participantId, Number(inviteeUserId));
    if (existing && !isReinvitable(existing)) {
      // A live (non-overdue) pending invitation already stands; an accepted one
      // means the player is a member (caught above). Rejected/expired rows and
      // OVERDUE-pending rows may be re-sent (F2) — the row is re-activated, not
      // duplicated.
      throw new ConflictError('An invitation to this player already exists for this team', ErrorCodes.TOURNAMENT_TEAM_INVITATION_DUPLICATE);
    }

    const expiresAtSql = new Date(Date.now() + INVITATION_TTL_MS).toISOString().slice(0, 19).replace('T', ' ');
    let id: number;
    if (existing) {
      // Phase 3 — RE-INVITATION: the DB allows at most ONE invitation per
      // (participant, invitee), so the existing terminal row is REUSED and
      // re-opened to pending. Invitation history is retained (the row is not
      // destroyed) and the prior terminal status is captured in the audit log.
      await teamInvitationRepository.reactivate(existing.id, { inviterUserId: Number(actorId), expiresAt: expiresAtSql });
      id = Number(existing.id);
    } else {
      id = await teamInvitationRepository.create({
        tournament_id: Number(t.id),
        participant_id: participantId,
        inviter_user_id: Number(actorId),
        invitee_user_id: Number(inviteeUserId),
        expires_at: expiresAtSql,
      });
    }

    await recordAudit({
      actorId,
      action: existing ? 'TOURNAMENT.TEAM_INVITE_RE_SENT' : 'TOURNAMENT.TEAM_INVITE_SENT',
      entityType: 'tournament_team_invitation',
      entityId: id,
      beforeState: existing ? { invitation_id: id, previous_status: existing.status } : undefined,
      afterState: { tournament_id: Number(t.id), participant_id: participantId, invitee_user_id: Number(inviteeUserId), status: 'pending' },
    });

    this.emitInvitation(t, participantId, id, Number(inviteeUserId), Number(actorId), 'sent', participant);

    const created = await teamInvitationRepository.findById(id);
    if (!created) throw new ConflictError('Failed to create team invitation');
    return created;
  }

  /**
   * Phase 3 — invite a partner by PHONE NUMBER. The number is normalised (digits
   * with an optional leading '+') and resolved to an ELIGIBLE player; every
   * authorization / eligibility / isolation / duplicate rule of the id-based path
   * is then reused unchanged (the id path stays the single source of truth).
   */
  async invitePlayerByPhone(
    tournamentId: number,
    participantId: number,
    phone: string,
    actorId: number,
  ): Promise<TournamentTeamInvitation> {
    const normalized = normalizeInvitePhone(phone);
    // A usable phone has at least a country code + subscriber number. Resolve
    // against full_phone OR the local phone_number before delegating.
    if (normalized.replace(/\D/g, '').length < 6) {
      throw new ConflictError('A valid phone number is required', ErrorCodes.TOURNAMENT_TEAM_INVITATION_INVITEE_NOT_FOUND);
    }
    const invitee = await participantMemberRepository.findEligiblePlayerByPhone(normalized);
    if (!invitee) {
      throw new ConflictError('No eligible player found for that phone number', ErrorCodes.TOURNAMENT_TEAM_INVITATION_INVITEE_NOT_FOUND);
    }
    return this.invitePlayer(tournamentId, participantId, Number(invitee.id), actorId);
  }

  /**
   * Phase 3 — CANCEL a pending invitation. Only the inviting captain may cancel,
   * and only while the invitation is still pending; a resolved (accepted /
   * rejected / expired) invitation can never be cancelled. The transient row is
   * deleted (the DB enforces at most one invitation per pair, so this frees the
   * slot for a future re-invitation) and the action is captured in the audit log;
   * the invitee is notified so their pending invite disappears across devices.
   */
  async cancelInvitation(tournamentId: number, invitationId: number, actorId: number): Promise<{ id: number; status: 'cancelled' }> {
    const conn = await getPool().getConnection();
    let invitation: TournamentTeamInvitation;
    try {
      await conn.beginTransaction();
      const locked = await teamInvitationRepository.lockById(Number(invitationId), conn);
      if (!locked || Number(locked.tournament_id) !== Number(tournamentId)) {
        throw new NotFoundError('Team invitation', ErrorCodes.TOURNAMENT_TEAM_INVITATION_NOT_FOUND);
      }
      invitation = locked;
      // Authorization: only the inviter (the team captain who sent it) may
      // withdraw the invitation. Cross-team cancellation fails here.
      if (Number(invitation.inviter_user_id) !== Number(actorId)) {
        throw new ForbiddenError('Only the captain who sent an invitation can cancel it', ErrorCodes.TOURNAMENT_TEAM_CAPTAIN_REQUIRED);
      }
      if (invitation.status !== 'pending') {
        throw new ConflictError(`Invitation is already ${invitation.status}`, ErrorCodes.TOURNAMENT_TEAM_INVITATION_DUPLICATE);
      }
      await teamInvitationRepository.deleteById(Number(invitation.id), conn);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await recordAudit({
      actorId,
      action: 'TOURNAMENT.TEAM_INVITE_CANCELLED',
      entityType: 'tournament_team_invitation',
      entityId: Number(invitation.id),
      beforeState: {
        tournament_id: Number(invitation.tournament_id),
        invitation_id: Number(invitation.id),
        participant_id: Number(invitation.participant_id),
        invitee_user_id: Number(invitation.invitee_user_id),
        status: 'pending',
      },
    });
    const t = await this.getTournament(Number(invitation.tournament_id));
    this.emitInvitation(t, Number(invitation.participant_id), Number(invitation.id), Number(invitation.invitee_user_id), Number(invitation.inviter_user_id), 'cancelled');
    return { id: Number(invitation.id), status: 'cancelled' };
  }

  async listSentInvitations(tournamentId: number, participantId: number, actorId: number): Promise<Array<TournamentTeamInvitation & { invitee_name?: string | null }>> {
    await this.getParticipant(tournamentId, participantId);
    await this.assertCaptain(tournamentId, participantId, actorId);
    await this.expireOverdue(participantId);
    return teamInvitationRepository.listByParticipant(participantId);
  }

  async listMyInvitations(actorId: number): Promise<Array<TournamentTeamInvitation & { team_name?: string | null; tournament_name?: string | null }>> {
    const list = await teamInvitationRepository.listByInvitee(Number(actorId));
    // Lazy expiration: an overdue pending invitation is expired on read.
    for (const inv of list.filter((i) => i.status === 'pending' && isExpired(i))) {
      await teamInvitationRepository.updateStatus(Number(inv.id), 'expired', { expiredAt: true });
    }
    return teamInvitationRepository.listByInvitee(Number(actorId));
  }

  async acceptInvitation(tournamentId: number, invitationId: number, actorId: number): Promise<TournamentTeamInvitation> {
    const conn = await getPool().getConnection();
    let updated: TournamentTeamInvitation;
    try {
      await conn.beginTransaction();
      const invitation = await teamInvitationRepository.lockById(Number(invitationId), conn);
      if (!invitation || Number(invitation.tournament_id) !== Number(tournamentId)) {
        throw new NotFoundError('Team invitation', ErrorCodes.TOURNAMENT_TEAM_INVITATION_NOT_FOUND);
      }
      if (Number(invitation.invitee_user_id) !== Number(actorId)) {
        throw new ForbiddenError('You can only accept your own invitation', ErrorCodes.TOURNAMENT_TEAM_INVITATION_NOT_FOUND);
      }
      if (invitation.status !== 'pending') {
        throw new ConflictError(`Invitation is already ${invitation.status}`, ErrorCodes.TOURNAMENT_TEAM_INVITATION_DUPLICATE);
      }
      if (isExpired(invitation)) {
        await teamInvitationRepository.updateStatus(Number(invitation.id), 'expired', { expiredAt: true }, conn);
        await conn.commit();
        throw new ConflictError('This invitation has expired', ErrorCodes.TOURNAMENT_TEAM_INVITATION_EXPIRED);
      }

      const t = await this.getTournament(Number(tournamentId));
      await this.assertTeamFormat(t);
      await this.assertTeamWindowOpen(t);
      const participant = await this.getParticipant(Number(tournamentId), Number(invitation.participant_id));

      // Serialise ALL roster changes for this tournament: accepts of different
      // invitations to the same team must not race on capacity/uniqueness.
      await conn.query('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [Number(tournamentId)]);

      // Atomic membership add + invitation acceptance (same transaction).
      await participantMemberService.addMemberTransactional(Number(tournamentId), Number(invitation.participant_id), Number(actorId), conn);
      await teamInvitationRepository.updateStatus(Number(invitation.id), 'accepted', { acceptedAt: true }, conn);
      await conn.commit();

      updated = (await teamInvitationRepository.findById(Number(invitation.id)))!;
      await recordAudit({
        actorId,
        action: 'TOURNAMENT.TEAM_INVITE_ACCEPTED',
        entityType: 'tournament_team_invitation',
        entityId: Number(invitation.id),
        afterState: { tournament_id: Number(t.id), participant_id: participant.id, invitee_user_id: actorId },
      });
      this.emitInvitation(t, Number(invitation.participant_id), Number(invitation.id), Number(actorId), Number(invitation.inviter_user_id), 'accepted', participant);
      this.emitMembersUpdated(t, Number(invitation.participant_id), Number(actorId), participant);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return updated;
  }

  async rejectInvitation(tournamentId: number, invitationId: number, actorId: number): Promise<TournamentTeamInvitation> {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const invitation = await teamInvitationRepository.lockById(Number(invitationId), conn);
      if (!invitation || Number(invitation.tournament_id) !== Number(tournamentId)) {
        throw new NotFoundError('Team invitation', ErrorCodes.TOURNAMENT_TEAM_INVITATION_NOT_FOUND);
      }
      if (Number(invitation.invitee_user_id) !== Number(actorId)) {
        throw new ForbiddenError('You can only reject your own invitation', ErrorCodes.TOURNAMENT_TEAM_INVITATION_NOT_FOUND);
      }
      if (invitation.status !== 'pending') {
        throw new ConflictError(`Invitation is already ${invitation.status}`, ErrorCodes.TOURNAMENT_TEAM_INVITATION_DUPLICATE);
      }
      if (isExpired(invitation)) {
        await teamInvitationRepository.updateStatus(Number(invitation.id), 'expired', { expiredAt: true }, conn);
        await conn.commit();
        throw new ConflictError('This invitation has expired', ErrorCodes.TOURNAMENT_TEAM_INVITATION_EXPIRED);
      }
      await teamInvitationRepository.updateStatus(Number(invitation.id), 'rejected', { rejectedAt: true }, conn);
      await conn.commit();

      await recordAudit({
        actorId,
        action: 'TOURNAMENT.TEAM_INVITE_REJECTED',
        entityType: 'tournament_team_invitation',
        entityId: Number(invitation.id),
        afterState: { tournament_id: Number(tournamentId), invitation_id: Number(invitation.id) },
      });
      // Phase 3 — notify the captain that the invitation was declined. The
      // notification engine already maps the `rejected` status to the inviter;
      // this call completes that (previously unwired) path.
      const t = await this.getTournament(Number(tournamentId));
      this.emitInvitation(t, Number(invitation.participant_id), Number(invitation.id), Number(invitation.invitee_user_id), Number(invitation.inviter_user_id), 'rejected');
      const updated = await teamInvitationRepository.findById(Number(invitationId));
      return updated!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** Explicit/lazy: mark overdue pending invitations of a team as expired. */
  async expireOverdue(participantId?: number): Promise<number> {
    const [rows] = await getPool().query<any[]>(
      `SELECT id FROM tournament_team_invitations
       WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= NOW()
       ${participantId != null ? 'AND participant_id = ?' : ''}`,
      participantId != null ? [participantId] : [],
    );
    for (const r of rows) {
      await teamInvitationRepository.updateStatus(Number(r.id), 'expired', { expiredAt: true });
    }
    return rows.length;
  }

  // ── Events / notifications (reuse existing tournament realtime conventions) ──

  private emitMembersUpdated(t: Tournament, participantId: number, userId: number, participant: TournamentParticipant): void {
    const scope = tournamentRealtimeScope(t, [
      userId,
      ...participantMemberIds(participant),
    ]);
    void eventBusV2.emit('tournament:participant-members-updated', {
      tournamentId: Number(t.id),
      participantId,
      addedUserId: userId,
      ...scope,
    } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(t.id), aggregateVersion: 1,
    });
  }

  private emitInvitation(
    t: Tournament,
    participantId: number,
    invitationId: number,
    inviteeUserId: number,
    inviterUserId: number,
    status: 'sent' | 'accepted' | 'rejected' | 'cancelled',
    _participant?: TournamentParticipant,
  ): void {
    const scope = tournamentRealtimeScope(t, [inviteeUserId, inviterUserId]);
    void eventBusV2.emit('tournament:team-invitation', {
      tournamentId: Number(t.id),
      participantId,
      invitationId,
      inviteeUserId,
      inviterUserId,
      status,
      ...scope,
    } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(t.id), aggregateVersion: 1,
    });
  }
}

export const teamInvitationService = new TeamInvitationService();