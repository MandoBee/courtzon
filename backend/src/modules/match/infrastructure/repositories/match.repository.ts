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
      `SELECT id, type, status, booking_id, sport_id, version, created_at, updated_at
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
      `SELECT id, match_id, user_id, role, joined_at
       FROM match_participants WHERE match_id = ?`, [id]
    );
    match.setParticipants(
      (partRows as any[]).map((r: any) => new Participant({
        id: r.id, matchId: r.match_id, userId: r.user_id, role: r.role,
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
}

export const matchRepository: MatchRepository = new MysqlMatchRepository();
