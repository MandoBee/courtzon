import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import { Match } from '../../domain/match.entity.js';
import { Invitation } from '../../domain/invitation.entity.js';
import { JoinRequest } from '../../domain/join-request.entity.js';
import { Participant } from '../../domain/participant.entity.js';
import { WaitingListEntry } from '../../domain/waiting-list-entry.entity.js';
import { MatchSession } from '../../domain/match-session.vo.js';
import { NotFoundError } from '../../../../shared/errors/app-error.js';

type RowData = mysql.RowDataPacket[];
type Executor = mysql.Pool | mysql.PoolConnection;

export interface MatchRepository {
  findById(id: number, conn?: mysql.PoolConnection): Promise<Match | null>;
  save(match: Match, conn?: mysql.PoolConnection): Promise<void>;
  /** Matches whose authoritative scheduled end (bookings.end_at_utc) has passed. */
  findScheduledMatchesPastEnd(): Promise<Array<{ id: number; status: string; startAtUtc: string | null; endAtUtc: string }>>;
  /** Closed matches whose scheduled start (bookings.start_at_utc) has arrived but have no session — candidates for auto-start. */
  findClosedMatchesPastStart(): Promise<Array<{ id: number; startAtUtc: string }>>;
  /** Latest session row for a match (if any). */
  findActiveSessionForMatch(matchId: number): Promise<{ id: number; status: string } | null>;
  /** Complete an in-progress session at the authoritative scheduled end. */
  completeMatchSessionAtScheduledEnd(matchId: number, sessionId: number, startedAt: string, endedAt: string): Promise<void>;
  /** Create a completed session spanning the scheduled start→end for a match that was never started. */
  createCompletedSessionForMatch(matchId: number, startedAt: string, endedAt: string): Promise<void>;
  /** Advance a match to `completed`. */
  markMatchCompleted(matchId: number): Promise<void>;
}

export class MysqlMatchRepository implements MatchRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  private resolve(conn?: mysql.PoolConnection): Executor {
    return conn ?? this.pool;
  }

  async findById(id: number, conn?: mysql.PoolConnection): Promise<Match | null> {
    const db = this.resolve(conn);

    const [matchRows] = await db.execute<RowData>(
      `SELECT id, type, status, booking_id, sport_id, format_id, format_snapshot, version, created_at, updated_at
       FROM matches WHERE id = ?`, [id]
    );
    if (!matchRows.length) return null;
    const row = matchRows[0] as any;

    const match = new Match({
      id: row.id,
      type: row.type,
      status: row.status,
      bookingId: row.booking_id,
      sportId: row.sport_id,
      formatId: row.format_id != null ? Number(row.format_id) : null,
      formatSnapshot: row.format_snapshot ? (typeof row.format_snapshot === 'string' ? JSON.parse(row.format_snapshot) : row.format_snapshot) : null,
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });

    const [invRows] = await db.execute<RowData>(
      `SELECT id, match_id, user_id, status, sent_at, read_at, responded_at, expires_at
       FROM invitations WHERE match_id = ?`, [id]
    );
    match.setInvitations(
      (invRows as any[]).map((r: any) => new Invitation({
        id: r.id, matchId: r.match_id, userId: r.user_id, status: r.status,
        sentAt: new Date(r.sent_at), readAt: r.read_at ? new Date(r.read_at) : null,
        respondedAt: r.responded_at ? new Date(r.responded_at) : null,
        expiresAt: r.expires_at ? new Date(r.expires_at) : null,
      }))
    );

    const [jrRows] = await db.execute<RowData>(
      `SELECT id, match_id, user_id, status, submitted_at, responded_at, responder_id, rejection_reason
       FROM join_requests WHERE match_id = ?`, [id]
    );
    match.setJoinRequests(
      (jrRows as any[]).map((r: any) => new JoinRequest({
        id: r.id, matchId: r.match_id, userId: r.user_id, status: r.status,
        submittedAt: new Date(r.submitted_at),
        respondedAt: r.responded_at ? new Date(r.responded_at) : null,
        responderId: r.responder_id, rejectionReason: r.rejection_reason,
      }))
    );

    const [partRows] = await db.execute<RowData>(
      `SELECT id, match_id, user_id, role, side, team_index, joined_at
       FROM match_participants WHERE match_id = ?`, [id]
    );
    match.setParticipants(
      (partRows as any[]).map((r: any) => new Participant({
        id: r.id, matchId: r.match_id, userId: r.user_id, role: r.role,
        side: r.side ?? null, teamIndex: r.team_index != null ? Number(r.team_index) : null,
        joinedAt: new Date(r.joined_at),
      }))
    );

    const [wlRows] = await db.execute<RowData>(
      `SELECT id, match_id, user_id, position, created_at
       FROM waiting_list WHERE match_id = ? ORDER BY position ASC`, [id]
    );
    match.setWaitingList(
      (wlRows as any[]).map((r: any) => new WaitingListEntry({
        id: r.id, matchId: r.match_id, userId: r.user_id,
        position: r.position, createdAt: new Date(r.created_at),
      }))
    );

    const [sessRows] = await db.execute<RowData>(
      `SELECT id, match_id, status, started_at, ended_at, duration_minutes,
              winner_id, participants_confirmed, no_show_user_ids, scores, metadata
       FROM match_sessions WHERE match_id = ?`, [id]
    );
    if (sessRows.length) {
      const s = sessRows[0] as any;
      match.setSession(new MatchSession({
        status: s.status,
        startedAt: new Date(s.started_at),
        endedAt: s.ended_at ? new Date(s.ended_at) : null,
        durationMinutes: s.duration_minutes,
        winnerId: s.winner_id,
        participantsConfirmed: s.participants_confirmed,
        noShowUserIds: s.no_show_user_ids,
        scores: s.scores,
        metadata: s.metadata,
      }));
    }

    return match;
  }

  async save(match: Match, conn?: mysql.PoolConnection): Promise<void> {
    const db = this.resolve(conn);

    const [result] = await db.execute<mysql.ResultSetHeader>(
      `UPDATE matches SET status = ?, version = ?, updated_at = NOW()
       WHERE id = ? AND version = ?`,
      [match.status, match.version + 1, match.id, match.version]
    );

    if (result.affectedRows === 0) {
      throw new Error(`Optimistic lock failed for match ${match.id}. Please retry.`);
    }

    match.incrementVersion();
  }

  async findScheduledMatchesPastEnd(): Promise<Array<{ id: number; status: string; startAtUtc: string | null; endAtUtc: string }>> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT m.id, m.status, b.start_at_utc, b.end_at_utc
       FROM matches m
       JOIN bookings b ON b.id = m.booking_id
       WHERE m.status IN ('closed', 'in_progress')
         AND b.end_at_utc IS NOT NULL
         AND b.end_at_utc <= UTC_TIMESTAMP()
         AND (SELECT COUNT(*) FROM match_participants WHERE match_id = m.id) >= 2
       LIMIT 500`
    );
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      status: r.status,
      startAtUtc: r.start_at_utc ?? null,
      endAtUtc: r.end_at_utc,
    }));
  }

  async findClosedMatchesPastStart(): Promise<Array<{ id: number; startAtUtc: string }>> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT m.id, b.start_at_utc
       FROM matches m
       JOIN bookings b ON b.id = m.booking_id
       WHERE m.status = 'closed'
         AND b.start_at_utc IS NOT NULL
         AND b.start_at_utc <= UTC_TIMESTAMP()
         AND (SELECT COUNT(*) FROM match_participants WHERE match_id = m.id) >= 2
         AND NOT EXISTS (SELECT 1 FROM match_sessions WHERE match_id = m.id)
       LIMIT 500`
    );
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      startAtUtc: r.start_at_utc,
    }));
  }

  async findActiveSessionForMatch(matchId: number): Promise<{ id: number; status: string } | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT id, status FROM match_sessions WHERE match_id = ? ORDER BY id DESC LIMIT 1`,
      [matchId]
    );
    return rows.length ? (rows[0] as any) : null;
  }

  async completeMatchSessionAtScheduledEnd(matchId: number, sessionId: number, startedAt: string, endedAt: string): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `UPDATE match_sessions
       SET status = 'completed', ended_at = ?,
           duration_minutes = TIMESTAMPDIFF(MINUTE, COALESCE(started_at, ?), ?)
       WHERE id = ?`,
      [endedAt, startedAt, endedAt, sessionId]
    );
  }

  async createCompletedSessionForMatch(matchId: number, startedAt: string, endedAt: string): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO match_sessions (match_id, status, started_at, ended_at, duration_minutes)
       VALUES (?, 'completed', ?, ?, TIMESTAMPDIFF(MINUTE, ?, ?))`,
      [matchId, startedAt, endedAt, startedAt, endedAt]
    );
  }

  async markMatchCompleted(matchId: number): Promise<void> {
    const pool = getPool();
    await pool.execute(
      "UPDATE matches SET status = 'completed', updated_at = NOW() WHERE id = ?",
      [matchId]
    );
  }
}

export const matchRepository: MatchRepository = new MysqlMatchRepository();
