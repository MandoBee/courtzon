import { getPool } from '../../../../database/mysql.js';
import { generateUUID } from '../../../../shared/utils/token.js';
import type {
  TournamentPrizeAward,
  CreatePrizeAwardInput,
  PrizeAwardStatus,
} from '../../domain/tournament-aggregate.js';
import type { PoolConnection } from 'mysql2/promise';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

/**
 * G11.5 — Tournament Prize Award persistence.
 *
 * The award ledger is FINANCIAL HISTORY: reads only, plus the single
 * authoritative create + the status transitions awarded→credited→refunded.
 * No record is ever deleted or edited in place (immutability by design).
 */
export class TournamentPrizeAwardRepository {
  async create(input: CreatePrizeAwardInput, conn?: PoolConnection): Promise<number> {
    const db = conn ?? getPool();
    const [result] = await db.execute<ResultSet>(
      `INSERT INTO tournament_prize_awards
        (public_id, tournament_id, prize_id, placement, registration_id, winner_user_id,
         amount, currency_code, funding_source, collection_method, status, bind_source, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awarded', ?, ?)`,
      [
        generateUUID(),
        input.tournamentId,
        input.prizeId,
        input.placement ?? null,
        input.registrationId,
        input.winnerUserId,
        input.amount,
        input.currencyCode,
        input.fundingSource,
        input.collectionMethod,
        input.bindSource,
        input.createdBy ?? null,
      ],
    );
    return result.insertId;
  }

  async findById(id: number, conn?: PoolConnection): Promise<TournamentPrizeAward | null> {
    const db = conn ?? getPool();
    const [rows] = await db.execute<RowData>(
      'SELECT * FROM tournament_prize_awards WHERE id = ? LIMIT 1',
      [id],
    );
    return (rows as any[])[0] as TournamentPrizeAward | undefined ?? null;
  }

  async findByTournament(tournamentId: number): Promise<TournamentPrizeAward[]> {
    const [rows] = await getPool().query<RowData>(
      `SELECT a.*, u.full_name AS winner_name
       FROM tournament_prize_awards a
       LEFT JOIN users u ON u.id = a.winner_user_id
       WHERE a.tournament_id = ? ORDER BY a.placement ASC, a.id ASC`,
      [tournamentId],
    );
    return rows as TournamentPrizeAward[];
  }

  async findByWinner(userId: number): Promise<TournamentPrizeAward[]> {
    const [rows] = await getPool().execute<RowData>(
      `SELECT a.*, u.full_name AS winner_name
       FROM tournament_prize_awards a
       LEFT JOIN users u ON u.id = a.winner_user_id
       WHERE a.winner_user_id = ? ORDER BY a.id DESC`,
      [userId],
    );
    return rows as TournamentPrizeAward[];
  }

  async findByWinnerAndTournament(userId: number, tournamentId: number): Promise<TournamentPrizeAward[]> {
    const [rows] = await getPool().execute<RowData>(
      'SELECT * FROM tournament_prize_awards WHERE winner_user_id = ? AND tournament_id = ? ORDER BY id ASC',
      [userId, tournamentId],
    );
    return rows as TournamentPrizeAward[];
  }

  /** Idempotency check — has this exact (tournament, placement, winner) award been bound? */
  async hasAward(tournamentId: number, placement: number | null, winnerUserId: number): Promise<boolean> {
    const [rows] = await getPool().execute<RowData>(
      `SELECT id FROM tournament_prize_awards
       WHERE tournament_id = ? AND placement <=> ? AND winner_user_id = ? LIMIT 1`,
      [tournamentId, placement ?? null, winnerUserId],
    );
    return (rows as any[]).length > 0;
  }

  async countByTournament(tournamentId: number): Promise<number> {
    const [rows] = await getPool().execute<RowData>(
      'SELECT COUNT(*) AS n FROM tournament_prize_awards WHERE tournament_id = ?',
      [tournamentId],
    );
    return Number((rows as any[])[0]?.n ?? 0);
  }

  /**
   * Status transition. `extra` holds the transition-only timestamps/actor fields
   * (credited_at / refunded_at / refunded_by / refund_reason). The DB-level
   * transition guard is enforced in the aggregate via assertValidPrizeAwardTransition.
   */
  async updateStatus(
    id: number,
    status: PrizeAwardStatus,
    extra?: { creditedAt?: boolean; refundedAt?: boolean; refundedBy?: number | null; refundReason?: string | null },
    conn?: PoolConnection,
  ): Promise<void> {
    const db = conn ?? getPool();
    const sets: string[] = ['status = ?'];
    const params: any[] = [status];
    if (extra?.creditedAt) {
      sets.push('credited_at = NOW()');
    }
    if (extra?.refundedAt) {
      sets.push('refunded_at = NOW()');
    }
    if (extra?.refundedBy !== undefined) {
      sets.push('refunded_by = ?');
      params.push(extra.refundedBy);
    }
    if (extra?.refundReason !== undefined) {
      sets.push('refund_reason = ?');
      params.push(extra.refundReason);
    }
    params.push(id);
    await db.execute<ResultSet>(
      `UPDATE tournament_prize_awards SET ${sets.join(', ')} WHERE id = ?`,
      params,
    );
  }
}

export const tournamentPrizeAwardRepository = new TournamentPrizeAwardRepository();