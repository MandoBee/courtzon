import { getPool } from '../../../../database/mysql.js';
import { matchEventPublisher } from '../events/match-event-publisher.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { SessionStatus } from '../../domain/match.types.js';

type RowData = import('mysql2').RowDataPacket[];

export class SessionService {
  async start(matchId: number): Promise<void> {
    const pool = getPool();

    const [existing] = await pool.execute<RowData>(
      'SELECT id FROM match_sessions WHERE match_id = ?', [matchId]
    );
    if (existing.length) throw new AppError('Session already exists', 409, 'SESSION_EXISTS');

    const [matchRows] = await pool.execute<RowData>(
      "SELECT status FROM matches WHERE id = ?", [matchId]
    );
    if (!matchRows.length) throw new AppError('Match not found', 404, 'MATCH_NOT_FOUND');
    if ((matchRows[0] as any).status !== 'closed') {
      throw new AppError('Match must be closed before starting', 400, 'MATCH_NOT_CLOSED');
    }

    await pool.execute(
      `INSERT INTO match_sessions (match_id, status, started_at)
       VALUES (?, 'in_progress', NOW())`,
      [matchId]
    );

    await pool.execute(
      "UPDATE matches SET status = 'in_progress' WHERE id = ?",
      [matchId]
    );

    matchEventPublisher.publish({
      type: 'session:started',
      payload: { matchId, startedAt: new Date().toISOString(), timestamp: new Date().toISOString() },
    });
  }

  async complete(matchId: number, winnerId?: number, scores?: Record<string, unknown>): Promise<void> {
    const pool = getPool();

    const [sessRows] = await pool.execute<RowData>(
      "SELECT id FROM match_sessions WHERE match_id = ? AND status = 'in_progress'", [matchId]
    );
    if (!sessRows.length) throw new AppError('No active session', 404, 'NO_ACTIVE_SESSION');

    await pool.execute(
      `UPDATE match_sessions
       SET status = 'completed', ended_at = NOW(),
           duration_minutes = TIMESTAMPDIFF(MINUTE, started_at, NOW()),
           winner_id = ?, scores = ?
       WHERE match_id = ? AND status = 'in_progress'`,
      [winnerId || null, scores ? JSON.stringify(scores) : null, matchId]
    );

    await pool.execute(
      "UPDATE matches SET status = 'completed' WHERE id = ?",
      [matchId]
    );

    matchEventPublisher.publish({
      type: 'session:completed',
      payload: {
        matchId,
        durationMinutes: 0,
        winnerId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async void(matchId: number): Promise<void> {
    const pool = getPool();

    await pool.execute(
      "UPDATE match_sessions SET status = 'voided', ended_at = NOW() WHERE match_id = ? AND status = 'in_progress'",
      [matchId]
    );
  }
}

export const sessionService = new SessionService();
