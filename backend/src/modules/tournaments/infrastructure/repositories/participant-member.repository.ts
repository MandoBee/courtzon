import { getPool } from '../../../../database/mysql.js';
import type {
  TournamentParticipantMember,
  TournamentReplacementRequest,
} from '../../domain/tournament-aggregate.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

/**
 * Group 7 — persistence for the AUTHORITATIVE participant-membership relation
 * and the durable player-replacement-request workflow. The G5 `member_user_ids`
 * JSON on `tournament_participants` is kept in sync as a CACHE (SQL draw reads
 * still use `$[0]`); these tables are the source of truth.
 */
export class ParticipantMemberRepository {
  // ── Members ──

  async addMember(data: {
    tournament_id: number;
    participant_id: number;
    user_id: number;
    member_order?: number;
    conn?: import('mysql2/promise').PoolConnection;
  }): Promise<number> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = data.conn ?? getPool();
    const [result] = await db.query<ResultSet>(
      `INSERT INTO tournament_participant_members (tournament_id, participant_id, user_id, member_order, active_tournament_id)
       VALUES (?, ?, ?, ?, ?)`,
      [data.tournament_id, data.participant_id, data.user_id, data.member_order ?? 0, data.tournament_id],
    );
    return (result as any).insertId;
  }

  async findMember(participantId: number, userId: number, conn?: import('mysql2/promise').PoolConnection): Promise<TournamentParticipantMember | null> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      'SELECT * FROM tournament_participant_members WHERE participant_id = ? AND user_id = ? LIMIT 1',
      [participantId, userId],
    );
    return rows.length ? (rows[0] as TournamentParticipantMember) : null;
  }

  async findMemberById(id: number, conn?: import('mysql2/promise').PoolConnection): Promise<TournamentParticipantMember | null> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      'SELECT * FROM tournament_participant_members WHERE id = ? LIMIT 1',
      [id],
    );
    return rows.length ? (rows[0] as TournamentParticipantMember) : null;
  }

  /** Any ACTIVE member row for a user in a tournament (any participant). */
  async findActiveMemberByUser(tournamentId: number, userId: number, conn?: import('mysql2/promise').PoolConnection): Promise<TournamentParticipantMember | null> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      "SELECT * FROM tournament_participant_members WHERE tournament_id = ? AND user_id = ? AND status = 'active' LIMIT 1",
      [tournamentId, userId],
    );
    return rows.length ? (rows[0] as TournamentParticipantMember) : null;
  }

  /**
   * G9-B — the ACTIVE member rows for a set of users within a tournament.
   * Used to resolve the winning TOURNAMENT PARTICIPANT (never a single user)
   * from the approved result's winning-side users. Ambiguity (users mapped to
   * different participants) is detected by the caller via distinct participant ids.
   */
  async findActiveMembersByUserIds(tournamentId: number, userIds: number[], conn?: import('mysql2/promise').PoolConnection): Promise<Array<{ participant_id: number; user_id: number }>> {
    if (userIds.length === 0) return [];
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    const placeholders = userIds.map(() => '?').join(', ');
    const [rows] = await db.query<RowData>(
      `SELECT participant_id, user_id FROM tournament_participant_members
       WHERE tournament_id = ? AND user_id IN (${placeholders}) AND status = 'active'`,
      [tournamentId, ...userIds],
    );
    return rows.map((r) => ({ participant_id: Number(r.participant_id), user_id: Number(r.user_id) }));
  }

  async countActiveMembers(participantId: number, conn?: import('mysql2/promise').PoolConnection): Promise<number> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      "SELECT COUNT(*) AS c FROM tournament_participant_members WHERE participant_id = ? AND status = 'active'",
      [participantId],
    );
    return Number(rows[0]?.c ?? 0);
  }

  /** Group 7 — minimal eligibility: the user must exist, be active and have a player profile. */
  async findEligiblePlayer(userId: number, conn?: import('mysql2/promise').PoolConnection): Promise<{ id: number; full_name: string | null } | null> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      `SELECT u.id, u.full_name
       FROM users u
       JOIN player_profiles pp ON pp.user_id = u.id
       WHERE u.id = ? AND u.account_status = 'active'
       LIMIT 1`,
      [userId],
    );
    return rows.length ? { id: Number(rows[0].id), full_name: rows[0].full_name ?? null } : null;
  }

  /** Members of a participant joined with their user display name. */
  async listMembersByParticipant(participantId: number, conn?: import('mysql2/promise').PoolConnection): Promise<Array<TournamentParticipantMember & { full_name?: string | null }>> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      `SELECT m.*, u.full_name
       FROM tournament_participant_members m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.participant_id = ?
       ORDER BY m.member_order ASC, m.id ASC`,
      [participantId],
    );
    return rows as Array<TournamentParticipantMember & { full_name?: string | null }>;
  }

  /** All members of a tournament keyed by participant_id (used to enrich participant lists). */
  async listMembersByTournament(tournamentId: number): Promise<Array<TournamentParticipantMember & { full_name?: string | null }>> {
    const [rows] = await getPool().query<RowData>(
      `SELECT m.*, u.full_name
       FROM tournament_participant_members m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.tournament_id = ?
       ORDER BY m.participant_id ASC, m.member_order ASC, m.id ASC`,
      [tournamentId],
    );
    return rows as Array<TournamentParticipantMember & { full_name?: string | null }>;
  }

  async updateMemberLeft(id: number, conn?: import('mysql2/promise').PoolConnection): Promise<void> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    await db.query(
      "UPDATE tournament_participant_members SET status = 'left', left_at = NOW(), active_tournament_id = NULL WHERE id = ? AND status = 'active'",
      [id],
    );
  }

  async markMemberReplaced(id: number, replacedByMemberId: number, conn?: import('mysql2/promise').PoolConnection): Promise<void> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    await db.query(
      "UPDATE tournament_participant_members SET status = 'replaced', left_at = NOW(), replaced_by_member_id = ?, active_tournament_id = NULL WHERE id = ? AND status = 'active'",
      [replacedByMemberId, id],
    );
  }

  // ── Participant member_user_ids cache sync (keeps G5 SQL compatible) ──

  async updateParticipantMemberUserIds(participantId: number, userIds: number[], conn?: import('mysql2/promise').PoolConnection): Promise<void> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    await db.query('UPDATE tournament_participants SET member_user_ids = ? WHERE id = ?', [
      userIds.length ? JSON.stringify(userIds) : null,
      participantId,
    ]);
  }

  async updateParticipantName(participantId: number, name: string | null, conn?: import('mysql2/promise').PoolConnection): Promise<void> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    await db.query('UPDATE tournament_participants SET name = ? WHERE id = ?', [name, participantId]);
  }

  // ── Replacement requests ──

  async createReplacementRequest(data: {
    tournament_id: number;
    participant_id: number;
    outgoing_member_user_id: number;
    replacement_user_id: number;
    requested_by: number;
    reason?: string | null;
    draw_impact?: Record<string, unknown> | null;
    conn?: import('mysql2/promise').PoolConnection;
  }): Promise<number> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = data.conn ?? getPool();
    const [result] = await db.query<ResultSet>(
      `INSERT INTO tournament_replacement_requests
         (tournament_id, participant_id, outgoing_member_user_id, replacement_user_id, requested_by, reason, draw_impact)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.tournament_id, data.participant_id, data.outgoing_member_user_id, data.replacement_user_id,
        data.requested_by, data.reason ?? null,
        data.draw_impact ? JSON.stringify(data.draw_impact) : null,
      ],
    );
    return (result as any).insertId;
  }

  async findReplacementRequest(id: number, conn?: import('mysql2/promise').PoolConnection): Promise<TournamentReplacementRequest | null> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      'SELECT * FROM tournament_replacement_requests WHERE id = ? LIMIT 1',
      [id],
    );
    return rows.length ? (rows[0] as TournamentReplacementRequest) : null;
  }

  async findPendingReplacementRequest(participantId: number, conn?: import('mysql2/promise').PoolConnection): Promise<TournamentReplacementRequest | null> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      "SELECT * FROM tournament_replacement_requests WHERE participant_id = ? AND status = 'pending' LIMIT 1",
      [participantId],
    );
    return rows.length ? (rows[0] as TournamentReplacementRequest) : null;
  }

  async listReplacementRequests(tournamentId: number, status?: string): Promise<Array<TournamentReplacementRequest & { participant_name?: string | null; outgoing_member_name?: string | null; replacement_user_name?: string | null; requested_by_name?: string | null }>> {
    const where = status ? 'AND r.status = ?' : '';
    const params: any[] = [tournamentId];
    if (status) params.push(status);
    const [rows] = await getPool().query<RowData>(
      `SELECT r.*,
              COALESCE(p.name, (SELECT u.full_name FROM users u
                WHERE u.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(p.member_user_ids, '$[0]')) AS UNSIGNED))) AS participant_name,
              (SELECT u.full_name FROM users u WHERE u.id = r.outgoing_member_user_id) AS outgoing_member_name,
              (SELECT u.full_name FROM users u WHERE u.id = r.replacement_user_id) AS replacement_user_name,
              (SELECT u.full_name FROM users u WHERE u.id = r.requested_by) AS requested_by_name
       FROM tournament_replacement_requests r
       JOIN tournament_participants p ON p.id = r.participant_id
       WHERE r.tournament_id = ? ${where}
       ORDER BY r.status = 'pending' DESC, r.requested_at DESC, r.id DESC`,
      params,
    );
    return rows as Array<TournamentReplacementRequest & { participant_name?: string | null; outgoing_member_name?: string | null; replacement_user_name?: string | null; requested_by_name?: string | null }>;
  }

  async updateReplacementRequest(id: number, data: {
    status?: string;
    reviewed_by?: number | null;
    reviewed_at?: string | null;
    rejection_reason?: string | null;
    draw_impact?: Record<string, unknown> | null;
    conn?: import('mysql2/promise').PoolConnection;
  }): Promise<void> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = data.conn ?? getPool();
    const fields: string[] = [];
    const params: any[] = [];
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.reviewed_by !== undefined) { fields.push('reviewed_by = ?'); params.push(data.reviewed_by); }
    if (data.reviewed_at !== undefined) { fields.push('reviewed_at = ?'); params.push(data.reviewed_at); }
    if (data.rejection_reason !== undefined) { fields.push('rejection_reason = ?'); params.push(data.rejection_reason); }
    if (data.draw_impact !== undefined) { fields.push('draw_impact = ?'); params.push(data.draw_impact ? JSON.stringify(data.draw_impact) : null); }
    if (!fields.length) return;
    params.push(id);
    await db.query(`UPDATE tournament_replacement_requests SET ${fields.join(', ')} WHERE id = ?`, params);
  }
}

export const participantMemberRepository = new ParticipantMemberRepository();