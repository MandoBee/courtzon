import { getPool } from '../../../../database/mysql.js';
import { matchEventPublisher } from '../events/match-event-publisher.js';
import { AppError } from '../../../../shared/errors/app-error.js';

type RowData = import('mysql2').RowDataPacket[];

export class ParticipantService {
  async remove(matchId: number, userId: number): Promise<void> {
    const pool = getPool();

    const [rows] = await pool.execute<RowData>(
      'SELECT role FROM match_participants WHERE match_id = ? AND user_id = ?',
      [matchId, userId]
    );
    if (!rows.length) throw new AppError('Participant not found', 404, 'PARTICIPANT_NOT_FOUND');
    if ((rows[0] as any).role === 'host') {
      throw new AppError('Host cannot leave the match', 400, 'HOST_CANNOT_LEAVE');
    }

    await pool.execute(
      'DELETE FROM match_participants WHERE match_id = ? AND user_id = ?',
      [matchId, userId]
    );

    await pool.execute(
      "UPDATE matches SET status = 'open' WHERE id = ? AND status = 'full'",
      [matchId]
    );

    matchEventPublisher.publish({
      type: 'participant:removed',
      payload: { matchId, userId, timestamp: new Date().toISOString() },
    });
  }

  async countByMatchId(matchId: number): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT COUNT(*) as cnt FROM match_participants WHERE match_id = ?', [matchId]
    );
    return Number((rows[0] as any).cnt);
  }
}

export const participantService = new ParticipantService();
