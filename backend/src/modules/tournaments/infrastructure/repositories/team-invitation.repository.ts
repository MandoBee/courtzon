import { getPool } from '../../../../database/mysql.js';
import type { TournamentTeamInvitation, TeamInvitationStatus } from '../../domain/tournament-aggregate.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

/**
 * G11.17 — persistence for the PLAYER team invitation lifecycle.
 * All pending/rejected/expired invitations live EXCLUSIVELY in
 * `tournament_team_invitations` (migration 186). An invited user is NOT a
 * member until the invitation is accepted (active member rows are never
 * used for invitations). Status transitions are one-way:
 *   pending → accepted | rejected | expired
 */
export class TeamInvitationRepository {
  async create(data: {
    tournament_id: number;
    participant_id: number;
    inviter_user_id: number;
    invitee_user_id: number;
    expires_at?: string | null;
    conn?: import('mysql2/promise').PoolConnection;
  }): Promise<number> {
    const db = data.conn ?? getPool();
    const [result] = await db.query<ResultSet>(
      `INSERT INTO tournament_team_invitations
         (tournament_id, participant_id, inviter_user_id, invitee_user_id, status, expires_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [data.tournament_id, data.participant_id, data.inviter_user_id, data.invitee_user_id, data.expires_at ?? null],
    );
    return (result as any).insertId;
  }

  async findById(id: number, conn?: import('mysql2/promise').PoolConnection): Promise<TournamentTeamInvitation | null> {
    const db = conn ?? getPool();
    const [rows] = await db.query<RowData>('SELECT * FROM tournament_team_invitations WHERE id = ? LIMIT 1', [id]);
    return rows.length ? (rows[0] as TournamentTeamInvitation) : null;
  }

  /** Lock an invitation row for an accept/reject decision (caller transaction). */
  async lockById(id: number, conn: import('mysql2/promise').PoolConnection): Promise<TournamentTeamInvitation | null> {
    const [rows] = await conn.query<RowData>(
      'SELECT * FROM tournament_team_invitations WHERE id = ? FOR UPDATE', [id],
    );
    return rows.length ? (rows[0] as TournamentTeamInvitation) : null;
  }

  /** Any invitation from a participant to a player (UNIQUE(participant_id, invitee_user_id)). */
  async findByParticipantAndInvitee(
    participantId: number,
    inviteeUserId: number,
    conn?: import('mysql2/promise').PoolConnection,
  ): Promise<TournamentTeamInvitation | null> {
    const db = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      'SELECT * FROM tournament_team_invitations WHERE participant_id = ? AND invitee_user_id = ? LIMIT 1',
      [participantId, inviteeUserId],
    );
    return rows.length ? (rows[0] as TournamentTeamInvitation) : null;
  }

  /** Invitations SENT by a participant (captain view), joined with invitee name. */
  async listByParticipant(participantId: number): Promise<Array<TournamentTeamInvitation & { invitee_name?: string | null }>> {
    const [rows] = await getPool().query<RowData>(
      `SELECT i.*, u.full_name AS invitee_name
       FROM tournament_team_invitations i
       LEFT JOIN users u ON u.id = i.invitee_user_id
       WHERE i.participant_id = ?
       ORDER BY i.status = 'pending' DESC, i.id DESC`,
      [participantId],
    );
    return rows as Array<TournamentTeamInvitation & { invitee_name?: string | null }>;
  }

  /** Invitations RECEIVED by a player (joined with team + tournament names). */
  async listByInvitee(inviteeUserId: number): Promise<Array<TournamentTeamInvitation & { team_name?: string | null; tournament_name?: string | null }>> {
    const [rows] = await getPool().query<RowData>(
      `SELECT i.*,
              COALESCE(p.name, (SELECT u.full_name FROM users u
                WHERE u.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(p.member_user_ids, '$[0]')) AS UNSIGNED))) AS team_name,
              t.name AS tournament_name
       FROM tournament_team_invitations i
       JOIN tournament_participants p ON p.id = i.participant_id
       JOIN tournaments t ON t.id = i.tournament_id
       WHERE i.invitee_user_id = ?
       ORDER BY i.status = 'pending' DESC, i.id DESC`,
      [inviteeUserId],
    );
    return rows as Array<TournamentTeamInvitation & { team_name?: string | null; tournament_name?: string | null }>;
  }

  async updateStatus(
    id: number,
    status: TeamInvitationStatus,
    extra?: { acceptedAt?: boolean; rejectedAt?: boolean; expiredAt?: boolean },
    conn?: import('mysql2/promise').PoolConnection,
  ): Promise<void> {
    const db = conn ?? getPool();
    const sets: string[] = ['status = ?'];
    const params: any[] = [status];
    if (extra?.acceptedAt) { sets.push('accepted_at = NOW()'); }
    if (extra?.rejectedAt) { sets.push('rejected_at = NOW()'); }
    if (extra?.expiredAt) { sets.push('expired_at = NOW()'); }
    params.push(id);
    await db.query(`UPDATE tournament_team_invitations SET ${sets.join(', ')} WHERE id = ?`, params);
  }
}

export const teamInvitationRepository = new TeamInvitationRepository();