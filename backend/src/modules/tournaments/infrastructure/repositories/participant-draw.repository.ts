import { getPool } from '../../../../database/mysql.js';
import type {
  TournamentParticipant,
  TournamentSeed,
  TournamentDraw,
  TournamentDrawEntry,
} from '../../domain/tournament-aggregate.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

function parseJson<T>(v: string | null | undefined): T | null {
  if (v == null) return null;
  try { return JSON.parse(v) as T; } catch { return null; }
}

/**
 * Group 5 — persistence for the authoritative Tournament Participant, Seed and
 * Draw foundation. New tables (tournament_participants, tournament_seeds,
 * tournament_draws, tournament_draw_entries) are additive and do NOT touch the
 * existing user-id-based match/result model.
 */
export class ParticipantDrawRepository {
  // ── Participants ──

  async createParticipant(data: {
    tournament_id: number;
    registration_id?: number | null;
    participant_type?: string;
    status?: string;
    member_user_ids?: number[] | null;
    waiting_order?: number | null;
  }): Promise<number> {
    const [result] = await getPool().query<ResultSet>(
      `INSERT INTO tournament_participants (tournament_id, registration_id, participant_type, status, member_user_ids, waiting_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.tournament_id,
        data.registration_id ?? null,
        data.participant_type ?? 'individual',
        data.status ?? 'active',
        data.member_user_ids ? JSON.stringify(data.member_user_ids) : null,
        data.waiting_order ?? null,
      ],
    );
    return (result as any).insertId;
  }

  async findParticipantByRegistration(tournamentId: number, registrationId: number): Promise<TournamentParticipant | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_participants WHERE tournament_id = ? AND registration_id = ? LIMIT 1',
      [tournamentId, registrationId],
    );
    return rows.length ? (rows[0] as TournamentParticipant) : null;
  }

  async findParticipantById(id: number): Promise<TournamentParticipant | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM tournament_participants WHERE id = ? LIMIT 1', [id]);
    return rows.length ? (rows[0] as TournamentParticipant) : null;
  }

  /**
   * Participants of a tournament joined with their authoritative seed and their
   * position in the CURRENT draw attempt. The draw is NEVER dependent on the
   * user-id match model — participants are the draw entities.
   */
  async listParticipantsByTournament(tournamentId: number): Promise<Array<TournamentParticipant & {
    display_name?: string | null;
    seed_number?: number | null;
    seed_source?: string | null;
    rating_snapshot?: number | null;
    rating_matches_played?: number | null;
    seed_assigned_by?: number | null;
    seed_assigned_at?: string | null;
    seed_reason?: string | null;
    draw_position?: number | null;
    draw_placement_source?: string | null;
  }>> {
    const [rows] = await getPool().query<RowData>(
      `SELECT p.*,
              (SELECT u.full_name FROM users u
                WHERE u.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(p.member_user_ids, '$[0]')) AS UNSIGNED)) AS display_name,
              s.seed_number, s.source AS seed_source, s.rating_snapshot, s.rating_matches_played,
              s.assigned_by AS seed_assigned_by, s.assigned_at AS seed_assigned_at, s.reason AS seed_reason,
              de.position AS draw_position, de.placement_source AS draw_placement_source
       FROM tournament_participants p
       LEFT JOIN tournament_seeds s ON s.participant_id = p.id
       LEFT JOIN tournament_draws d ON d.tournament_id = p.tournament_id AND d.is_current = 1
       LEFT JOIN tournament_draw_entries de ON de.draw_id = d.id AND de.participant_id = p.id
       WHERE p.tournament_id = ? AND p.status = 'active'
       ORDER BY p.id`,
      [tournamentId],
    );
    return rows as Array<TournamentParticipant & {
      display_name?: string | null; seed_number?: number | null; seed_source?: string | null;
      rating_snapshot?: number | null; rating_matches_played?: number | null; seed_assigned_by?: number | null;
      seed_assigned_at?: string | null; seed_reason?: string | null; draw_position?: number | null; draw_placement_source?: string | null;
    }>;
  }

  async countParticipantsByTournament(tournamentId: number): Promise<number> {
    const [rows] = await getPool().query<RowData>(
      "SELECT COUNT(*) AS c FROM tournament_participants WHERE tournament_id = ? AND status = 'active'",
      [tournamentId],
    );
    return Number(rows[0]?.c ?? 0);
  }

  // ── Group 6 — Participant lifecycle / waitlist ──

  /** Next FIFO waiting order (monotonic, unique per tournament, never renumbered). */
  async getNextWaitingOrderByTournament(tournamentId: number, conn?: import('mysql2/promise').PoolConnection): Promise<number> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      "SELECT COALESCE(MAX(waiting_order), 0) + 1 AS next_order FROM tournament_participants WHERE tournament_id = ? AND status = 'waiting'",
      [tournamentId],
    );
    return Number(rows[0]?.next_order ?? 1);
  }

  /** Earliest eligible waiting participant (FIFO head). */
  async findWaitlistHead(tournamentId: number, conn?: import('mysql2/promise').PoolConnection): Promise<TournamentParticipant | null> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      "SELECT * FROM tournament_participants WHERE tournament_id = ? AND status = 'waiting' ORDER BY waiting_order ASC, id ASC LIMIT 1",
      [tournamentId],
    );
    return rows.length ? (rows[0] as TournamentParticipant) : null;
  }

  async listWaitingParticipants(tournamentId: number): Promise<Array<TournamentParticipant & { display_name?: string | null }>> {
    const [rows] = await getPool().query<RowData>(
      `SELECT p.*,
              (SELECT u.full_name FROM users u
                WHERE u.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(p.member_user_ids, '$[0]')) AS UNSIGNED)) AS display_name
       FROM tournament_participants p
       WHERE p.tournament_id = ? AND p.status = 'waiting'
       ORDER BY p.waiting_order ASC, p.id ASC`,
      [tournamentId],
    );
    return rows as Array<TournamentParticipant & { display_name?: string | null }>;
  }

  async countWaitingParticipants(tournamentId: number): Promise<number> {
    const [rows] = await getPool().query<RowData>(
      "SELECT COUNT(*) AS c FROM tournament_participants WHERE tournament_id = ? AND status = 'waiting'",
      [tournamentId],
    );
    return Number(rows[0]?.c ?? 0);
  }

  async updateParticipantStatus(id: number, status: string, conn?: import('mysql2/promise').PoolConnection): Promise<void> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    await db.query('UPDATE tournament_participants SET status = ? WHERE id = ?', [status, id]);
  }

  async updateParticipantWaitingOrder(id: number, waitingOrder: number | null, conn?: import('mysql2/promise').PoolConnection): Promise<void> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    await db.query('UPDATE tournament_participants SET waiting_order = ? WHERE id = ?', [waitingOrder, id]);
  }

  /** Is a user already represented by an ACTIVE (non-withdrawn, non-waiting) participant in this tournament? */
  async findActiveParticipantByPlayer(tournamentId: number, userId: number): Promise<TournamentParticipant | null> {
    const [rows] = await getPool().query<RowData>(
      `SELECT * FROM tournament_participants
       WHERE tournament_id = ? AND status = 'active'
         AND JSON_CONTAINS(member_user_ids, CAST(? AS JSON)) = 1
       LIMIT 1`,
      [tournamentId, userId],
    );
    return rows.length ? (rows[0] as TournamentParticipant) : null;
  }

  // ── Seeds ──

  async createSeed(data: {
    tournament_id: number;
    participant_id: number;
    seed_number: number;
    source: string;
    assigned_by?: number | null;
    rating_snapshot?: number | null;
    rating_matches_played?: number | null;
    reason?: string | null;
  }): Promise<number> {
    const [result] = await getPool().query<ResultSet>(
      `INSERT INTO tournament_seeds (tournament_id, participant_id, seed_number, source, assigned_by, rating_snapshot, rating_matches_played, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.tournament_id, data.participant_id, data.seed_number, data.source,
        data.assigned_by ?? null, data.rating_snapshot ?? null, data.rating_matches_played ?? null,
        data.reason ?? null,
      ],
    );
    return (result as any).insertId;
  }

  async findSeedByParticipant(participantId: number): Promise<TournamentSeed | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM tournament_seeds WHERE participant_id = ? LIMIT 1', [participantId]);
    return rows.length ? (rows[0] as TournamentSeed) : null;
  }

  async findSeedByNumber(tournamentId: number, seedNumber: number): Promise<TournamentSeed | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_seeds WHERE tournament_id = ? AND seed_number = ? LIMIT 1',
      [tournamentId, seedNumber],
    );
    return rows.length ? (rows[0] as TournamentSeed) : null;
  }

  async listSeedsByTournament(tournamentId: number): Promise<TournamentSeed[]> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_seeds WHERE tournament_id = ? ORDER BY seed_number',
      [tournamentId],
    );
    return rows as TournamentSeed[];
  }

  async updateSeed(id: number, data: {
    seed_number?: number;
    source?: string;
    assigned_by?: number | null;
    rating_snapshot?: number | null;
    rating_matches_played?: number | null;
    reason?: string | null;
  }): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    const updatable: Record<string, unknown> = {
      seed_number: data.seed_number,
      source: data.source,
      assigned_by: data.assigned_by,
      rating_snapshot: data.rating_snapshot,
      rating_matches_played: data.rating_matches_played,
      reason: data.reason,
    };
    for (const [f, v] of Object.entries(updatable)) {
      if (v !== undefined) { fields.push(`${f} = ?`); params.push(v); }
    }
    if (!fields.length) return;
    params.push(id);
    await getPool().query(`UPDATE tournament_seeds SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  // ── Draws ──

  async clearCurrentDraws(tournamentId: number): Promise<void> {
    await getPool().query('UPDATE tournament_draws SET is_current = 0 WHERE tournament_id = ? AND is_current = 1', [tournamentId]);
  }

  async createDraw(data: {
    tournament_id: number;
    attempt_number: number;
    draw_seed: number;
    generated_by?: number | null;
  }): Promise<number> {
    const [result] = await getPool().query<ResultSet>(
      `INSERT INTO tournament_draws (tournament_id, attempt_number, draw_seed, generated_by, status, validation_status, is_current)
       VALUES (?, ?, ?, ?, 'draft', 'valid', 1)`,
      [data.tournament_id, data.attempt_number, data.draw_seed, data.generated_by ?? null],
    );
    return (result as any).insertId;
  }

  async getNextDrawAttempt(tournamentId: number): Promise<number> {
    const [rows] = await getPool().query<RowData>(
      'SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_attempt FROM tournament_draws WHERE tournament_id = ?',
      [tournamentId],
    );
    return Number(rows[0]?.next_attempt ?? 1);
  }

  async findCurrentDraw(tournamentId: number): Promise<TournamentDraw | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_draws WHERE tournament_id = ? AND is_current = 1 LIMIT 1',
      [tournamentId],
    );
    return rows.length ? (rows[0] as TournamentDraw) : null;
  }

  async findDrawById(id: number): Promise<TournamentDraw | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM tournament_draws WHERE id = ? LIMIT 1', [id]);
    return rows.length ? (rows[0] as TournamentDraw) : null;
  }

  async listDrawsByTournament(tournamentId: number): Promise<TournamentDraw[]> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_draws WHERE tournament_id = ? ORDER BY attempt_number DESC',
      [tournamentId],
    );
    return rows as TournamentDraw[];
  }

  async updateDraw(id: number, data: { status?: string; validation_status?: string; is_current?: number }): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.validation_status !== undefined) { fields.push('validation_status = ?'); params.push(data.validation_status); }
    if (data.is_current !== undefined) { fields.push('is_current = ?'); params.push(data.is_current); }
    if (!fields.length) return;
    params.push(id);
    await getPool().query(`UPDATE tournament_draws SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  // ── Draw entries ──

  async createDrawEntry(data: {
    draw_id: number;
    participant_id: number;
    position: number;
    placement_source?: string;
    overridden?: boolean;
    moved_by?: number | null;
  }): Promise<number> {
    const [result] = await getPool().query<ResultSet>(
      `INSERT INTO tournament_draw_entries (draw_id, participant_id, position, placement_source, overridden, moved_by, moved_at)
       VALUES (?, ?, ?, ?, ?, ?, ${data.moved_by != null ? 'NOW()' : 'NULL'})`,
      [
        data.draw_id, data.participant_id, data.position,
        data.placement_source ?? 'auto', data.overridden ? 1 : 0, data.moved_by ?? null,
      ],
    );
    return (result as any).insertId;
  }

  async findDrawEntries(drawId: number): Promise<Array<TournamentDrawEntry & {
    display_name?: string | null; seed_number?: number | null; participant_type?: string | null;
  }>> {
    const [rows] = await getPool().query<RowData>(
      `SELECT de.*,
              p.participant_type,
              (SELECT u.full_name FROM users u
                WHERE u.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(p.member_user_ids, '$[0]')) AS UNSIGNED)) AS display_name,
              s.seed_number
       FROM tournament_draw_entries de
       JOIN tournament_participants p ON p.id = de.participant_id
       LEFT JOIN tournament_seeds s ON s.participant_id = p.id
       WHERE de.draw_id = ? ORDER BY de.position`,
      [drawId],
    );
    return rows as Array<TournamentDrawEntry & { display_name?: string | null; seed_number?: number | null; participant_type?: string | null }>;
  }

  async findEntryByPosition(drawId: number, position: number): Promise<TournamentDrawEntry | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_draw_entries WHERE draw_id = ? AND position = ? LIMIT 1',
      [drawId, position],
    );
    return rows.length ? (rows[0] as TournamentDrawEntry) : null;
  }

  async findEntryByParticipant(drawId: number, participantId: number): Promise<TournamentDrawEntry | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_draw_entries WHERE draw_id = ? AND participant_id = ? LIMIT 1',
      [drawId, participantId],
    );
    return rows.length ? (rows[0] as TournamentDrawEntry) : null;
  }

  async updateDrawEntry(id: number, data: {
    position?: number;
    placement_source?: string;
    overridden?: boolean;
    moved_by?: number | null;
  }): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    if (data.position !== undefined) { fields.push('position = ?'); params.push(data.position); }
    if (data.placement_source !== undefined) { fields.push('placement_source = ?'); params.push(data.placement_source); }
    if (data.overridden !== undefined) { fields.push('overridden = ?'); params.push(data.overridden ? 1 : 0); }
    if (data.moved_by !== undefined) {
      fields.push('moved_by = ?');
      params.push(data.moved_by);
      fields.push('moved_at = NOW()');
    }
    if (!fields.length) return;
    params.push(id);
    await getPool().query(`UPDATE tournament_draw_entries SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  /** Group 6 — remove a participant's placement from a DRAFT draw (withdrawal leaves the active draw population). */
  async deleteDrawEntryByParticipant(drawId: number, participantId: number, conn?: import('mysql2/promise').PoolConnection): Promise<boolean> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    const [result] = await db.query<ResultSet>(
      'DELETE FROM tournament_draw_entries WHERE draw_id = ? AND participant_id = ?',
      [drawId, participantId],
    );
    return (result as any).affectedRows > 0;
  }

  /** Group 6 — flag the current draw as requiring re-validation/re-generation. */
  async markDrawRequiresRedraw(drawId: number, conn?: import('mysql2/promise').PoolConnection): Promise<void> {
    const db: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection = conn ?? getPool();
    await db.query("UPDATE tournament_draws SET validation_status = 'seeding_violation' WHERE id = ?", [drawId]);
  }
}

export const participantDrawRepository = new ParticipantDrawRepository();

export { parseJson };