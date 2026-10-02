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

  // ── G11.20 — Competition Category Management ───────────────────────────────
  // Until G11.20 a tournament could ONLY ever hold the single auto-created
  // default competition, so every competition-scoped read/write added by G11.18
  // (P2/P3), G11.19 (seeds) and C1/C2 (prizes/matches) was unreachable in the
  // product. These methods make a second category reachable WITHOUT any schema
  // change: the table already carries every configuration column and
  // `uk_comp_tournament_default (tournament_id, default_flag)` — where
  // `default_flag` is the STORED GENERATED column IF(is_default=1,'D',NULL) —
  // already permits exactly ONE default and UNLIMITED non-defaults.

  /**
   * G11.20 — create an ADDITIONAL (non-default) competition category.
   * `is_default` is always 0: the default is created once at tournament
   * creation and is immutable, which is what keeps the "exactly one default"
   * invariant true without any extra write.
   */
  async create(data: {
    tournament_id: number;
    competition_type: TournamentCompetitionCategory;
    name: string;
    match_format_id?: number | null;
    rule_set_id?: number | null;
    bracket_type_id?: number | null;
    sport_id?: number | null;
    entry_fee?: number | null;
    registration_fee?: number | null;
    currency_code: string;
    price_type?: 'FREE' | 'FIXED' | 'MEMBERS_ONLY' | null;
    max_participants?: number | null;
    min_participants?: number;
    registration_payment_methods?: string[] | string | null;
    waitlist_enabled?: boolean | number;
    age_mode?: 'open' | 'categories' | null;
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
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        data.tournament_id,
        data.competition_type,
        data.name,
        data.match_format_id ?? null,
        data.rule_set_id ?? null,
        data.bracket_type_id ?? null,
        data.sport_id ?? null,
        data.entry_fee ?? 0,
        data.registration_fee ?? 0,
        data.currency_code,
        // price_type is NOT NULL ENUM — an explicit null would abort the insert.
        data.price_type ?? 'FIXED',
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

  /**
   * G11.20 — partial update of a competition category.
   * Only the caller-supplied keys are written (a real PATCH), and `tournament_id`
   * / `is_default` are deliberately NOT updatable so a category can never be
   * moved between tournaments nor lose its default status.
   */
  async update(
    competitionId: number,
    data: Partial<{
      name: string;
      competition_type: TournamentCompetitionCategory;
      match_format_id: number | null;
      rule_set_id: number | null;
      bracket_type_id: number | null;
      sport_id: number | null;
      entry_fee: number | null;
      registration_fee: number | null;
      currency_code: string;
      price_type: 'FREE' | 'FIXED' | 'MEMBERS_ONLY';
      max_participants: number | null;
      min_participants: number;
      registration_payment_methods: string[] | string | null;
      waitlist_enabled: boolean | number;
      age_mode: 'open' | 'categories' | null;
      age_category_ids: any | null;
      gender_categories: any | null;
      level_ids: any | null;
    }>,
    conn?: import('mysql2/promise').PoolConnection,
  ): Promise<boolean> {
    const db = conn ?? getPool();
    const sets: string[] = [];
    const vals: unknown[] = [];
    const jsonKeys = new Set(['registration_payment_methods', 'age_category_ids', 'gender_categories', 'level_ids']);
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue; // absent key = leave untouched
      sets.push(`${key} = ?`);
      vals.push(jsonKeys.has(key) ? toJson(value as any) : value);
    }
    if (sets.length === 0) return false;
    vals.push(competitionId);
    const [result] = await db.query<ResultSet>(
      `UPDATE tournament_competitions SET ${sets.join(', ')} WHERE id = ?`,
      vals as any[],
    );
    return (result as any).affectedRows > 0;
  }

  /**
   * G11.20 — "deactivate" a competition category.
   *
   * `tournament_competitions` has NO `is_active`/`status` column and G11.20 is
   * explicitly schema-free, so deactivation is modelled as a guarded REMOVAL of
   * the category. Nine descendant tables FK to `tournament_competitions` with
   * ON DELETE CASCADE (draws, groups, matches, participants, placements,
   * prizes, registrations, seeds, stages), so an unguarded DELETE would silently
   * destroy real registrations, seeds and match history.
   *
   * Every guard therefore lives in `CompetitionService.deactivateCompetition`
   * (default protection, last-competition protection, dependency protection)
   * and MUST run before this method is reached. This method is intentionally the
   * only DELETE in the repository so the guard cannot be bypassed by accident.
   */
  async setActive(
    competitionId: number,
    isActive: boolean,
    conn?: import('mysql2/promise').PoolConnection,
  ): Promise<boolean> {
    const db = conn ?? getPool();
    if (isActive) {
      // Re-activation is impossible without a persisted flag: a removed category
      // is gone. Callers must reject this (service level) rather than pretend.
      return false;
    }
    const [result] = await db.query<ResultSet>('DELETE FROM tournament_competitions WHERE id = ?', [competitionId]);
    return (result as any).affectedRows > 0;
  }

  /**
   * G11.20 — validate the configuration FK targets (`match_format_id`,
   * `rule_set_id`, `bracket_type_id`, `sport_id`) BEFORE writing.
   *
   * These are real foreign keys, so an unknown id would otherwise surface as a
   * raw MySQL 1452 driver error (HTTP 500 with a leaked SQL fragment). Validating
   * them here turns that into a clean 422 naming the offending reference.
   */
  async missingReferences(
    refs: Partial<{
      match_format_id: number | null;
      rule_set_id: number | null;
      bracket_type_id: number | null;
      sport_id: number | null;
    }>,
    conn?: import('mysql2/promise').PoolConnection,
  ): Promise<string[]> {
    const db = conn ?? getPool();
    const targets: Record<string, string> = {
      match_format_id: 'sport_formats',
      rule_set_id: 'sport_rule_sets',
      bracket_type_id: 'tournament_bracket_types',
      sport_id: 'sports',
    };
    const missing: string[] = [];
    for (const [column, table] of Object.entries(targets)) {
      const value = (refs as Record<string, number | null | undefined>)[column];
      if (value == null) continue;
      const [rows] = await db.query<RowData>(`SELECT 1 AS ok FROM \`${table}\` WHERE id = ? LIMIT 1`, [Number(value)]);
      if (rows.length === 0) missing.push(column);
    }
    return missing;
  }

  /** G11.20 — how many competitions a tournament currently owns. */
  async countByTournament(tournamentId: number, conn?: import('mysql2/promise').PoolConnection): Promise<number> {
    const db = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      'SELECT COUNT(*) AS c FROM tournament_competitions WHERE tournament_id = ?',
      [tournamentId],
    );
    return Number(rows[0]?.c ?? 0);
  }

  /**
   * G11.20 — every descendant row that would be CASCADE-deleted together with
   * this competition. Used to refuse deactivation while real business data
   * still references the category.
   */
  async countDependents(
    competitionId: number,
    conn?: import('mysql2/promise').PoolConnection,
  ): Promise<Record<string, number>> {
    const db = conn ?? getPool();
    const tables = [
      'tournament_registrations',
      'tournament_participants',
      'tournament_seeds',
      'tournament_draws',
      'tournament_groups',
      'tournament_matches',
      'tournament_stages',
      'tournament_placements',
      'tournament_prizes',
      'tournament_prize_awards',
    ] as const;
    const out: Record<string, number> = {};
    for (const table of tables) {
      const [rows] = await db.query<RowData>(
        `SELECT COUNT(*) AS c FROM \`${table}\` WHERE competition_id = ?`,
        [competitionId],
      );
      out[table] = Number(rows[0]?.c ?? 0);
    }
    return out;
  }
}

export const competitionRepository = new CompetitionRepository();