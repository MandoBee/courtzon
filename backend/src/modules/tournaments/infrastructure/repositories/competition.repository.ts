import { getPool } from '../../../../database/mysql.js';
import type { TournamentCompetition, TournamentCompetitionCategory } from '../../domain/tournament-aggregate.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

/** JSON allowlists are always persisted as a canonical JSON string (or NULL). */
function toJson(value: string[] | number[] | string | undefined | null): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * G11.18 — persistence for Competition Categories.
 * One tournament hosts one or more `tournament_competitions` (Singles/Doubles/
 * Teams); every competition owns its fee, currency, capacity, eligibility,
 * bracket configuration and prizes. `is_default` marks the auto-created
 * competition that preserves legacy single-competition behavior (at most ONE
 * default per tournament, enforced by `uk_comp_tournament_default`).
 */
export class CompetitionRepository {
  async createDefault(data: {
    tournament_id: number;
    competition_type: TournamentCompetitionCategory;
    name?: string;
    match_format_id?: number | null;
    rule_set_id?: number | null;
    bracket_type_id?: number | null;
    sport_id?: number | null;
    entry_fee?: number | null;
    registration_fee?: number | null;
    currency_code: string;
    price_type?: string | null;
    max_participants?: number | null;
    min_participants?: number;
    registration_payment_methods?: string[] | string | null;
    waitlist_enabled?: boolean | number;
    age_mode?: string | null;
    age_category_ids?: any | null;
    gender_categories?: any | null;
    level_ids?: any | null;
    conn?: import('mysql2/promise').PoolConnection;
  }): Promise<number> {
    const db = data.conn ?? getPool();
    const [result] = await db.query<ResultSet>(
      `INSERT INTO tournament_competitions
        (public_id, tournament_id, competition_type, name, match_format_id, rule_set_id, bracket_type_id, sport_id,
         entry_fee, registration_fee, currency_code, price_type, max_participants, min_participants,
         registration_payment_methods, waitlist_enabled, age_mode, age_category_ids, gender_categories, level_ids, is_default)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        data.tournament_id,
        data.competition_type,
        data.name ?? 'Default',
        data.match_format_id ?? null,
        data.rule_set_id ?? null,
        data.bracket_type_id ?? null,
        data.sport_id ?? null,
        data.entry_fee ?? 0,
        data.registration_fee ?? 0,
        data.currency_code,
        data.price_type ?? null,
        data.max_participants ?? null,
        data.min_participants ?? 2,
        toJson(data.registration_payment_methods as any),
        data.waitlist_enabled ? 1 : 0,
        data.age_mode ?? null,
        toJson(data.age_category_ids),
        toJson(data.gender_categories),
        toJson(data.level_ids),
      ],
    );
    return (result as any).insertId;
  }

  async findById(id: number, conn?: import('mysql2/promise').PoolConnection): Promise<TournamentCompetition | null> {
    const db = conn ?? getPool();
    const [rows] = await db.query<RowData>('SELECT * FROM tournament_competitions WHERE id = ? LIMIT 1', [id]);
    return rows.length ? (rows[0] as TournamentCompetition) : null;
  }

  async findDefaultByTournament(tournamentId: number, conn?: import('mysql2/promise').PoolConnection): Promise<TournamentCompetition | null> {
    const db = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      'SELECT * FROM tournament_competitions WHERE tournament_id = ? AND is_default = 1 LIMIT 1',
      [tournamentId],
    );
    return rows.length ? (rows[0] as TournamentCompetition) : null;
  }

  async findByTournament(tournamentId: number): Promise<TournamentCompetition[]> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_competitions WHERE tournament_id = ? ORDER BY is_default DESC, id ASC',
      [tournamentId],
    );
    return rows as TournamentCompetition[];
  }

  /** G11.18 Phase 3 — set/clear a competition's venue override (NULL → inherit the tournament venue). */
  async setVenueOverride(competitionId: number, override: Record<string, unknown> | null): Promise<void> {
    await getPool().query(
      'UPDATE tournament_competitions SET venue_override = ? WHERE id = ?',
      [override ? JSON.stringify(override) : null, competitionId],
    );
  }
}

export const competitionRepository = new CompetitionRepository();