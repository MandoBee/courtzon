import { getPool } from '../../../database/mysql.js';
import { ConflictError, NotFoundError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { tournamentRealtimeScope } from './tournament-realtime-scope.js';
import { participantMemberService } from './participant-member.service.js';
import { participantDrawRepository } from '../infrastructure/repositories/participant-draw.repository.js';
import { participantMemberRepository } from '../infrastructure/repositories/participant-member.repository.js';
import { teamInvitationRepository } from '../infrastructure/repositories/team-invitation.repository.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { recordAudit } from '../../audit-log/index.js';
import type { Tournament, TournamentParticipant, TournamentTeamInvitation } from '../domain/tournament-aggregate.js';

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

export function isExpired(inv: TournamentTeamInvitation, now = Date.now()): boolean {
  return inv.expires_at != null && new Date(inv.expires_at).getTime() <= now;
}

export function invitationTtlMs(): number {
  return INVITATION_TTL_MS;
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

  /** Is this a TEAM-format tournament? Reject singles/doubles for team flows. */
  private async assertTeamFormat(t: Tournament): Promise<void> {
    const fmt = await participantMemberService.resolveFormatConfig(t);
    if (fmt.formatType !== 'team') {
      throw new ConflictError('Team flows require a team-format tournament', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
  }

  // ── Player team creation ──

  async createTeamForPlayer(
    tournamentId: number,
    actorId: number,
    input: { name?: string; memberUserIds?: number[] },
  ): Promise<TournamentParticipant & { members?: Array<any> }> {
    const t = await this.getTournament(tournamentId);
    await this.assertTeamFormat(t);
    await this.assertTeamWindowOpen(t);
    // THE creator must be the team captain (primary member): never allow a
    // player to create a team they are not part of.
    const members = Array.from(new Set([Number(actorId), ...(Array.isArray(input.memberUserIds) ? input.memberUserIds.map((id) => Number(id)) : [])]));
    // Existing tournament rule (reused, NOT relaxed): a team participant must
    // start with at least 2 active members — a lone player cannot create one.
    if (members.length < 2) {
      throw new ConflictError(
        'A team needs at least 2 members — invite a teammate to create it',
        ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_COUNT_INVALID,
        { min: 2, actual: members.length },
      );
    }
    const created = await participantMemberService.createTeamParticipant(tournamentId, { name: input.name, memberUserIds: members }, actorId);
    return created;
  }

  // ── Roster / join ──

  async listMyTeams(tournamentId: number, actorId: number): Promise<TournamentParticipant[]> {
    const participants = await participantDrawRepository.listParticipantsByTournament(tournamentId);
    const mine = participants.filter((p) => p.participant_type === 'team' && participantMemberIds(p).includes(Number(actorId)));
    return mine.map((p) => ({ ...p, members: p.member_user_ids }) as TournamentParticipant);
  }

  async listTeamsForJoin(tournamentId: number): Promise<Array<{ id: number; name: string | null; memberCount: number; rosterSize: number | null }>> {
    const t = await this.getTournament(tournamentId);
    await this.assertTeamFormat(t);
    const fmt = await participantMemberService.resolveFormatConfig(t);
    const rosterSize = fmt.rosterSize ?? 2;
    const participants = (await participantDrawRepository.listParticipantsByTournament(tournamentId)).filter((p) => p.participant_type === 'team');
    const out: Array<{ id: number; name: string | null; memberCount: number; rosterSize: number | null }> = [];
    for (const p of participants) {
      const count = await participantMemberRepository.countActiveMembers(Number(p.id));
      out.push({ id: Number(p.id), name: (p as any).name ?? null, memberCount: count, rosterSize });
    }
    return out;
  }

  /** An eligible player joins a team themselves (immediate, pre-start). */
  async joinTeam(tournamentId: number, participantId: number, actorId: number): Promise<void> {
    const t = await this.getTournament(tournamentId);
    await this.assertTeamFormat(t);
    await this.assertTeamWindowOpen(t);
    const participant = await this.getParticipant(tournamentId, participantId);

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
    await this.assertTeamFormat(t);
    await this.assertTeamWindowOpen(t);
    const participant = await this.getParticipant(tournamentId, participantId);
    await this.assertCaptain(tournamentId, participantId, actorId);

    if (Number(inviteeUserId) === Number(actorId)) {
      throw new ConflictError('You cannot invite yourself to your own team', ErrorCodes.TOURNAMENT_TEAM_INVITATION_DUPLICATE);
    }
    // The invitee must be an eligible player and not already an active member of
    // any participant in this tournament (uk_active_user_tournament semantics).
    const eligible = await participantMemberRepository.findEligiblePlayer(Number(inviteeUserId));
    if (!eligible) {
      throw new ConflictError('Invitee is not an eligible player', ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_NOT_ELIGIBLE);
    }
    const alreadyActive = await participantMemberRepository.findActiveMemberByUser(Number(t.id), Number(inviteeUserId));
    if (alreadyActive) {
      throw new ConflictError('Invitee is already an active participant in this tournament', ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_ACTIVE_DUPLICATE);
    }
    const duplicate = await teamInvitationRepository.findByParticipantAndInvitee(participantId, Number(inviteeUserId));
    if (duplicate) {
      throw new ConflictError('An invitation to this player already exists for this team', ErrorCodes.TOURNAMENT_TEAM_INVITATION_DUPLICATE);
    }

    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const id = await teamInvitationRepository.create({
      tournament_id: Number(t.id),
      participant_id: participantId,
      inviter_user_id: Number(actorId),
      invitee_user_id: Number(inviteeUserId),
      expires_at: expiresAt.toISOString().slice(0, 19).replace('T', ' '),
    });

    await recordAudit({
      actorId,
      action: 'TOURNAMENT.TEAM_INVITE_SENT',
      entityType: 'tournament_team_invitation',
      entityId: id,
      afterState: { tournament_id: Number(t.id), participant_id: participantId, invitee_user_id: inviteeUserId },
    });

    this.emitInvitation(t, participantId, id, Number(inviteeUserId), Number(actorId), 'sent', participant);

    const created = await teamInvitationRepository.findById(id);
    if (!created) throw new ConflictError('Failed to create team invitation');
    return created;
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
    status: 'sent' | 'accepted' | 'rejected',
    _participant: TournamentParticipant,
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