import { getPool } from '../../../../database/mysql.js';
import { withTransaction } from '../../../../database/database.transaction.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import { normalizeEligibility, buildDiscoveryAudienceSql, resolveDiscoveryAgeFilter, resolveDiscoveryGenderFilter } from '../../domain/tournament-eligibility.js';
import { computeStandings } from '../../domain/tournament-aggregate.js';
import type { Tournament, TournamentRegistration, TournamentMatch, TournamentMatchResult, TournamentGroup, TournamentGroupMember, TournamentStandingRow, TournamentStage, TournamentPrize, TournamentPrizeInput } from '../../domain/tournament-aggregate.js';
import type { PoolConnection } from 'mysql2/promise';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

export interface BracketTypeRow {
  id: number;
  name: string;
  slug: string;
  is_active: boolean | number;
  config_schema: string | null;
  created_at?: string;
}

export class TournamentRepository {
  async listBracketTypes(activeOnly = false): Promise<BracketTypeRow[]> {
    const pool = getPool();
    const where = activeOnly ? 'WHERE bt.is_active = 1' : '';
    const [rows] = await pool.query<RowData>(
      `SELECT bt.id, bt.name, bt.slug, bt.is_active, bt.config_schema, bt.created_at
       FROM tournament_bracket_types bt ${where}
       ORDER BY bt.id ASC`,
    );
    return rows as BracketTypeRow[];
  }

  async findBracketTypeById(id: number): Promise<BracketTypeRow | null> {
    const [rows] = await getPool().query<RowData>(
      `SELECT bt.id, bt.name, bt.slug, bt.is_active, bt.config_schema, bt.created_at
       FROM tournament_bracket_types bt WHERE bt.id = ? LIMIT 1`,
      [id],
    );
    return rows.length ? (rows[0] as BracketTypeRow) : null;
  }

  async setBracketTypeActive(id: number, isActive: boolean): Promise<void> {
    await getPool().query('UPDATE tournament_bracket_types SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
  }

  /** Count tournaments referencing a bracket type (guard against destructive deletion). */
  async countBracketTypeReferences(bracketTypeId: number): Promise<number> {
    const [rows] = await getPool().query<RowData>(
      'SELECT COUNT(*) AS total FROM tournaments WHERE bracket_type_id = ?', [bracketTypeId],
    );
    return Number(rows[0]?.total ?? 0);
  }

  async list(filters: {
    page?: number; limit?: number; search?: string; status?: string; format?: string; category?: string; sport_id?: number;
  }): Promise<{ data: Tournament[]; total: number; page: number; limit: number }> {
    const pool = getPool();
    const where: string[] = ['1 = 1'];
    const params: any[] = [];

    if (filters.search) {
      where.push('(t.name LIKE ? OR t.code LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.status) { where.push('t.status = ?'); params.push(filters.status); }
    if (filters.format) { where.push('t.format = ?'); params.push(filters.format); }
    if (filters.category) { where.push('t.category = ?'); params.push(filters.category); }
    if (filters.sport_id) { where.push('t.sport_id = ?'); params.push(filters.sport_id); }

    const pag = buildPagination(filters.page, filters.limit);

    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) AS total FROM tournaments t WHERE ${where.join(' AND ')}`, params,
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await pool.query<RowData>(
      `SELECT t.*,
              s.name AS sport_name,
              bt.name AS bracket_type_name,
              o.name AS organisation_name,
              t.max_participants AS max_players,
              t.tournament_type AS type,
              t.registration_closes AS registration_deadline
       FROM tournaments t
       LEFT JOIN sports s ON s.id = t.sport_id
       LEFT JOIN tournament_bracket_types bt ON bt.id = t.bracket_type_id
       LEFT JOIN organisations o ON o.id = t.organisation_id
       WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC${paginationClause(pag)}`,
      params,
    );

    return { data: rows as Tournament[], total, page: pag.page, limit: pag.limit };
  }

  /** Organisation-scoped list — tenant isolation is enforced in SQL, never in JS. */
  async listForOrg(orgId: number, filters: {
    page?: number; limit?: number; search?: string; status?: string; format?: string; category?: string; sport_id?: number;
  }): Promise<{ data: Tournament[]; total: number; page: number; limit: number }> {
    const pool = getPool();
    const where: string[] = ['t.organisation_id = ?'];
    const params: any[] = [orgId];

    if (filters.search) {
      where.push('(t.name LIKE ? OR t.code LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.status) { where.push('t.status = ?'); params.push(filters.status); }
    if (filters.format) { where.push('t.format = ?'); params.push(filters.format); }
    if (filters.category) { where.push('t.category = ?'); params.push(filters.category); }
    if (filters.sport_id) { where.push('t.sport_id = ?'); params.push(filters.sport_id); }

    const pag = buildPagination(filters.page, filters.limit);

    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) AS total FROM tournaments t WHERE ${where.join(' AND ')}`, params,
    );
    const total = countRows[0]?.total ?? 0;

    const [rows] = await pool.query<RowData>(
      `SELECT t.*,
              s.name AS sport_name,
              bt.name AS bracket_type_name,
              o.name AS organisation_name,
              t.max_participants AS max_players,
              t.tournament_type AS type,
              t.registration_closes AS registration_deadline
       FROM tournaments t
       LEFT JOIN sports s ON s.id = t.sport_id
       LEFT JOIN tournament_bracket_types bt ON bt.id = t.bracket_type_id
       LEFT JOIN organisations o ON o.id = t.organisation_id
       WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC${paginationClause(pag)}`,
      params,
    );

    return { data: rows as Tournament[], total, page: pag.page, limit: pag.limit };
  }

  /** Tenant owner of a tournament (null when platform-owned). */
  async getOrganisationId(tournamentId: number): Promise<number | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT organisation_id FROM tournaments WHERE id = ?', [tournamentId],
    );
    return rows.length ? Number(rows[0].organisation_id) ?? null : null;
  }

  /** Tenant owner of a tournament registration (null when platform-owned). */
  async getRegistrationOrganisationId(regId: number): Promise<number | null> {
    const [rows] = await getPool().query<RowData>(
      `SELECT t.organisation_id FROM tournament_registrations r
       JOIN tournaments t ON t.id = r.tournament_id WHERE r.id = ?`, [regId],
    );
    return rows.length ? Number(rows[0].organisation_id) ?? null : null;
  }

  /** Tenant owner of a tournament match. */
  async getMatchOrganisationId(matchId: number): Promise<number | null> {
    const [rows] = await getPool().query<RowData>(
      `SELECT t.organisation_id FROM tournament_matches m
       JOIN tournaments t ON t.id = m.tournament_id WHERE m.id = ?`, [matchId],
    );
    return rows.length ? Number(rows[0].organisation_id) ?? null : null;
  }

  /**
   * G8-D-KO-CORRECTION — `conn` above is OPTIONAL and purely additive: when
   * supplied the read is served from the caller's transaction connection, so a
   * knockout correction re-verifies the tournament status against the SAME
   * snapshot it reseats the bracket in. Callers that omit it are unchanged.
   */
  async findById(id: number, conn?: PoolConnection): Promise<Tournament | null> {
    const db = conn ?? getPool();
    const [rows] = await db.query<RowData>('SELECT * FROM tournaments WHERE id = ?', [id]);
    return rows.length ? (rows[0] as Tournament) : null;
  }

  /**
   * Authoritative tournament detail — the raw row PLUS the display aliases the
   * management detail screens (Super Admin + Org) render (sport_name,
   * organisation_name, max_players, type, registration_deadline). This is the
   * SINGLE shared shape for the admin and org detail endpoints; the raw
   * `findById` remains the internal logic view.
   *
   * Group 4 — also resolves the venue from the organisation branch (branches
   * table) and the sport icon, so player-facing details can expose venue
   * name/address/map without a second location system.
   */
  async findByIdDetailed(id: number): Promise<any | null> {
    const [rows] = await getPool().query<RowData>(
      `SELECT t.*,
              s.name AS sport_name,
              s.icon AS sport_icon,
              bt.name AS bracket_type_name,
              o.name AS organisation_name,
              b.name AS branch_name,
              b.address_line1 AS branch_address_line1,
              b.address_line2 AS branch_address_line2,
              b.city AS branch_city,
              b.state AS branch_state,
              b.postal_code AS branch_postal_code,
              b.country_id AS branch_country_id,
              b.latitude AS branch_latitude,
              b.longitude AS branch_longitude,
              b.timezone AS branch_timezone,
              b.opening_time AS branch_opening_time,
              b.closing_time AS branch_closing_time,
              t.max_participants AS max_players,
              t.tournament_type AS type,
              t.registration_closes AS registration_deadline
       FROM tournaments t
       LEFT JOIN sports s ON s.id = t.sport_id
       LEFT JOIN tournament_bracket_types bt ON bt.id = t.bracket_type_id
       LEFT JOIN organisations o ON o.id = t.organisation_id
       LEFT JOIN branches b ON b.id = t.branch_id
       WHERE t.id = ?`,
      [id],
    );
    return rows.length ? rows[0] : null;
  }

  /**
   * Group 4 — the player audience for a Tournament's sport: users whose PRIMARY
   * sport (`player_profiles.main_sport_id`) equals the tournament sport OR who
   * listed the sport in their interests (`player_sport_interests`). Dynamic by
   * sport — never hardcoded to any one sport.
   */
  async findPlayerIdsForSport(sportId: number): Promise<number[]> {
    const [rows] = await getPool().query<RowData>(
      `SELECT DISTINCT user_id FROM (
         SELECT user_id FROM player_sport_interests WHERE sport_id = ?
         UNION
         SELECT user_id FROM player_profiles WHERE main_sport_id = ?
       ) AS audience`,
      [sportId, sportId],
    );
    return rows.map((r) => Number(r.user_id));
  }

  /**
   * Group 7-C — Tournament discovery audience.
   *
   * Sport (interests ∪ main sport) THEN age (YEAR-only) THEN gender THEN branch
   * (only when the tournament has an authoritative branch). LEVEL is NEVER an
   * exclusion predicate. Set-based, deduplicated — no per-user queries.
   */
  async findEligibleDiscoveryAudience(t: Tournament): Promise<number[]> {
    const eligibility = normalizeEligibility(t);
    const tournamentYear = Number(String(t.start_date ?? '').slice(0, 4));

    let categories: Array<{ type: 'youth' | 'masters'; min_age: number | null; max_age: number | null }> = [];
    if (eligibility.ageMode === 'categories' && eligibility.ageCategoryIds.length > 0) {
      const [catRows] = await getPool().query<RowData>(
        'SELECT type, min_age, max_age FROM tournament_age_categories WHERE id IN (?) AND is_active = 1',
        [eligibility.ageCategoryIds],
      );
      categories = (catRows as Record<string, unknown>[]).map((c) => ({
        type: c.type as 'youth' | 'masters',
        min_age: c.min_age != null ? Number(c.min_age) : null,
        max_age: c.max_age != null ? Number(c.max_age) : null,
      }));
    }

    const { sql, params } = buildDiscoveryAudienceSql({
      sportId: t.sport_id as number,
      age: resolveDiscoveryAgeFilter(categories, tournamentYear),
      gender: resolveDiscoveryGenderFilter(eligibility.genderCategories),
      branchId: t.branch_id ?? null,
    });
    const [rows] = await getPool().query<RowData>(sql, params);
    return Array.from(new Set(rows.map((r) => Number((r as Record<string, unknown>).id))));
  }

  async findByCode(code: string): Promise<Tournament | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM tournaments WHERE code = ? LIMIT 1', [code]);
    return rows.length ? (rows[0] as Tournament) : null;
  }

  async create(data: Partial<Tournament>): Promise<number> {
    const sql = `INSERT INTO tournaments (public_id, creator_id, organisation_id, branch_id, bracket_type_id, format, category, season, sport_id, match_format_id, rule_set_id, draw_seed, name, code, description, tournament_type, max_participants, max_teams, min_participants, entry_fee, registration_fee, currency_code, price_type, registration_payment_methods, waitlist_enabled, commission_rate, prize_description, status, is_public, registration_opens, registration_closes, start_date, end_date, daily_start_time, daily_end_time, rules, is_featured, image_url, age_mode, age_category_ids, gender_categories, level_ids)
                 VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await getPool().query<ResultSet>(sql, [
      data.creator_id, data.organisation_id ?? null, data.branch_id ?? null,
      data.bracket_type_id, data.format ?? null, data.category ?? null, data.season ?? null,
      data.sport_id ?? null, data.match_format_id ?? null, data.rule_set_id ?? null,
      data.draw_seed ?? null,
      data.name, data.code ?? null, data.description ?? null,
      data.tournament_type ?? 'platform',
      data.max_participants, data.max_teams ?? null, data.min_participants ?? 2,
      data.entry_fee ?? 0, data.registration_fee ?? 0,
      data.currency_code, data.price_type ?? null,
      this.stringifyPaymentMethods(data.registration_payment_methods),
      data.waitlist_enabled ? 1 : 0,
      data.commission_rate ?? 0,
      data.prize_description ?? null, data.status ?? 'draft',
      data.is_public ?? true, data.registration_opens ?? null, data.registration_closes ?? null,
      data.start_date ?? null, data.end_date ?? null,
      data.daily_start_time ?? null, data.daily_end_time ?? null,
      data.rules ?? null,
      data.is_featured ?? false, data.image_url ?? null,
      data.age_mode ?? null,
      this.stringifyEligibilityArray(data.age_category_ids),
      this.stringifyEligibilityArray(data.gender_categories as unknown as string[]),
      this.stringifyEligibilityArray(data.level_ids),
    ]);
    return (result as any).insertId;
  }

  async update(id: number, data: Partial<Tournament>): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    const updatable: (keyof Tournament)[] = [
      'organisation_id', 'branch_id', 'bracket_type_id', 'format', 'category', 'season',
      'sport_id', 'match_format_id', 'rule_set_id', 'name', 'code', 'description', 'tournament_type',
      'max_participants', 'max_teams', 'min_participants', 'entry_fee', 'registration_fee',
      'currency_code', 'price_type', 'registration_payment_methods', 'waitlist_enabled', 'prize_description',
      'status', 'is_public', 'registration_opens', 'registration_closes',
      'start_date', 'end_date', 'daily_start_time', 'daily_end_time',
      'rules', 'is_featured', 'image_url',
      'age_mode', 'age_category_ids', 'gender_categories', 'level_ids',
    ];
    for (const f of updatable) {
      if (data[f] !== undefined) {
        fields.push(`${f} = ?`);
        params.push(f === 'registration_payment_methods' ? this.stringifyPaymentMethods(data[f]) : f === 'age_category_ids' || f === 'gender_categories' || f === 'level_ids' ? this.stringifyEligibilityArray(data[f] as unknown as string[]) : data[f]);
      }
    }
    if (!fields.length) return;
    params.push(id);
    await getPool().query(
      `UPDATE tournaments SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, params,
    );
  }

  /** Group 3 — the JSON allowlist is always persisted as a JSON string (or NULL). */
  private stringifyPaymentMethods(methods: string[] | string | undefined | null): string | null {
    if (methods == null) return null;
    if (typeof methods === 'string') return methods;
    return JSON.stringify(methods);
  }

  /** Group 7-A — eligibility JSON columns are always persisted as a canonical JSON string (or NULL). */
  private stringifyEligibilityArray(values: string[] | number[] | string | undefined | null): string | null {
    if (values == null) return null;
    if (typeof values === 'string') return values;
    return JSON.stringify(values);
  }

  /**
   * Group 5 — normalize a raw `tournament_registrations` row into the domain
   * shape: the authoritative seed is stored in the `seed_rank` column, and the
   * domain reads it as `seed`. This mapping makes seeding work end-to-end (the
   * draw consumes `reg.seed`). The participant seed is read-only from the draw
   * path — it is never recomputed or overwritten by a draw/re-draw operation.
   */
  private mapRegistrationRow<T extends Record<string, unknown>>(row: T): TournamentRegistration & T {
    const seed = row.seed_rank != null ? Number(row.seed_rank) : undefined;
    return { ...(row as unknown as TournamentRegistration), seed } as TournamentRegistration & T;
  }

  /**
   * Group 3 — the organisation's ACTIVE payment methods from its own payment
   * configuration (`payment_gateway_config`, the existing org × payment-method
   * × gateway-provider allowlist). Empty when the org has no explicit rows
   * (no org-level restriction — the global policy applies).
   */
  async getOrgActivePaymentMethodSlugs(orgId: number): Promise<string[]> {
    const [rows] = await getPool().query<RowData>(
      `SELECT pm.slug
       FROM payment_gateway_config pgc
       JOIN payment_methods pm ON pm.id = pgc.payment_method_id
       WHERE pgc.organisation_id = ? AND pgc.is_active = 1`,
      [orgId],
    );
    return rows.map((r) => r.slug);
  }

  /**
   * Group 3 — record an offline (Cash) registration payment as a PAID row in
   * the SHARED `payment_transactions` table (reference_type='tournament').
   * Mirrors the academy offline-cash pattern; `uk_idempotency_key` makes
   * concurrent duplicate acks safe. No gateway fields are written.
   */
  async createCashPaymentTransaction(
    params: { userId: number; registrationId: number; amount: number; currency: string },
  ): Promise<number> {
    const idempotencyKey = `tournament_cash_payment_${params.registrationId}`;
    const [result] = await getPool().execute<ResultSet>(
      `INSERT INTO payment_transactions
        (user_id, reference_id, idempotency_key, reference_type, payment_method,
         amount, currency, payment_status, paid_at, trace_id, aggregate_version)
       VALUES (?, ?, ?, 'tournament', 'cash', ?, ?, 'paid', NOW(), UUID(), 1)`,
      [params.userId, params.registrationId, idempotencyKey, params.amount, params.currency],
    );
    return Number(result.insertId);
  }

  async updateStatus(id: number, status: string, conn?: PoolConnection): Promise<void> {
    const db = conn ?? getPool();
    const extras: string[] = ['status = ?'];
    const params: any[] = [status];
    if (status === 'archived') { extras.push('archived_at = NOW()'); }
    params.push(id);
    await db.query(
      `UPDATE tournaments SET ${extras.join(', ')}, updated_at = NOW() WHERE id = ?`, params,
    );
  }

  async deleteArchive(id: number): Promise<void> {
    await this.updateStatus(id, 'archived');
  }

  async findOpen(limit: number = 50): Promise<Tournament[]> {
    const [rows] = await getPool().query<RowData>(
      `SELECT * FROM tournaments WHERE status IN ('published','registration_open') AND registration_closes > NOW() ORDER BY start_date LIMIT ?`,
      [limit],
    );
    return rows as Tournament[];
  }

  // ── Registrations (tournament_registrations) ──

  async findRegistrationsByTournament(tournamentId: number): Promise<TournamentRegistration[]> {
    const [rows] = await getPool().query<RowData>(
      `SELECT r.*, u.full_name AS player_name
       FROM tournament_registrations r
       LEFT JOIN users u ON u.id = r.player_id
       WHERE r.tournament_id = ? ORDER BY r.seed_rank`,
      [tournamentId],
    );
    return (rows as Record<string, unknown>[]).map((r) => this.mapRegistrationRow(r));
  }

  async findRegistrationsByPlayer(userId: number): Promise<TournamentRegistration[]> {
    const [rows] = await getPool().query<RowData>(
      `SELECT r.*, u.full_name AS player_name
       FROM tournament_registrations r
       LEFT JOIN users u ON u.id = r.player_id
       WHERE r.player_id = ? ORDER BY r.registered_at DESC`,
      [userId],
    );
    return (rows as Record<string, unknown>[]).map((r) => this.mapRegistrationRow(r));
  }

  async createRegistration(data: Partial<TournamentRegistration>, conn?: PoolConnection): Promise<number> {
    const db = conn ?? getPool();
    const sql = `INSERT INTO tournament_registrations (tournament_id, player_id, team_id, seed_rank, status, payment_status, waiting_order, eligibility_snapshot, registered_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`;
    const [result] = await db.query<ResultSet>(sql, [
      data.tournament_id, data.player_id ?? data.user_id ?? null, data.team_id ?? null,
      data.seed ?? null, data.status ?? 'registered', data.payment_status ?? 'unpaid',
      data.waiting_order ?? null,
      data.eligibility_snapshot ? JSON.stringify(data.eligibility_snapshot) : null,
    ]);
    return (result as any).insertId;
  }

  async updateRegistrationPaymentStatus(id: number, paymentStatus: string, conn?: PoolConnection): Promise<void> {
    const db = conn ?? getPool();
    await db.query(
      'UPDATE tournament_registrations SET payment_status = ? WHERE id = ?', [paymentStatus, id],
    );
  }

  async findRegistrationsByPlayerUserId(userId: number): Promise<TournamentRegistration[]> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_registrations WHERE player_id = ? ORDER BY registered_at DESC',
      [userId],
    );
    return (rows as Record<string, unknown>[]).map((r) => this.mapRegistrationRow(r));
  }

  async updateRegistrationStatus(id: number, status: string, waitingOrder?: number, conn?: PoolConnection): Promise<void> {
    const db = conn ?? getPool();
    const extras: string[] = ['status = ?'];
    const params: any[] = [status];
    if (status === 'withdrawn' || status === 'disqualified') { extras.push('cancelled_at = NOW()'); }
    if (waitingOrder !== undefined) { extras.push('waiting_order = ?'); params.push(waitingOrder); }
    params.push(id);
    await db.query(
      `UPDATE tournament_registrations SET ${extras.join(', ')} WHERE id = ?`, params,
    );
  }

  /** Group 6 — set/clear the FIFO waiting_order on a registration (mirror of the participant). */
  async updateRegistrationWaitingOrder(id: number, waitingOrder: number | null, conn?: PoolConnection): Promise<void> {
    const db = conn ?? getPool();
    await db.query('UPDATE tournament_registrations SET waiting_order = ? WHERE id = ?', [waitingOrder, id]);
  }

  /** Group 6 — authoritative "has the tournament started" signal: any bracket/round match actually in progress or resolved. */
  async hasAnyStartedMatch(tournamentId: number): Promise<boolean> {
    const [rows] = await getPool().query<RowData>(
      `SELECT 1 FROM tournament_matches
       WHERE tournament_id = ? AND status IN ('in_progress','completed','walkover')
       LIMIT 1`,
      [tournamentId],
    );
    return rows.length > 0;
  }

  async getNextWaitingOrder(tournamentId: number): Promise<number> {
    const [rows] = await getPool().query<RowData>(
      "SELECT COALESCE(MAX(waiting_order), 0) + 1 AS next_order FROM tournament_registrations WHERE tournament_id = ? AND status = 'waiting'",
      [tournamentId],
    );
    return rows[0]?.next_order ?? 1;
  }

  async getConfirmedCount(tournamentId: number): Promise<number> {
    const [rows] = await getPool().query<RowData>(
      "SELECT COUNT(*) AS c FROM tournament_registrations WHERE tournament_id = ? AND status = 'confirmed'",
      [tournamentId],
    );
    return rows[0]?.c ?? 0;
  }

  async getRegistrationById(id: number): Promise<TournamentRegistration | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM tournament_registrations WHERE id = ?', [id]);
    return rows.length ? this.mapRegistrationRow(rows[0] as Record<string, unknown>) : null;
  }

  // ── Prizes (tournament_prizes — Group 2) ──

  async findPrizesByTournament(tournamentId: number): Promise<TournamentPrize[]> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_prizes WHERE tournament_id = ? ORDER BY display_order ASC, id ASC',
      [tournamentId],
    );
    return rows as TournamentPrize[];
  }

  /**
   * Replace the full prize set of a Tournament in one transaction. This is the
   * authoritative write path for structured prizes (delete-all + insert), so the
   * stored set always matches the submitted order exactly.
   */
  async replacePrizes(tournamentId: number, prizes: TournamentPrizeInput[], conn?: PoolConnection): Promise<void> {
    const db = conn ?? getPool();
    await db.query('DELETE FROM tournament_prizes WHERE tournament_id = ?', [tournamentId]);
    for (let i = 0; i < prizes.length; i++) {
      const p = prizes[i];
      await db.query(
        `INSERT INTO tournament_prizes (tournament_id, placement, prize_type, description, amount, currency_code, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          tournamentId,
          p.placement ?? null,
          p.prize_type,
          p.description ?? null,
          p.amount ?? null,
          p.currency_code ?? null,
          p.display_order ?? i,
        ],
      );
    }
  }

  // ── Matches ──

  async createMatch(data: Partial<TournamentMatch>, conn?: PoolConnection): Promise<number> {
    const db = conn ?? getPool();
    const [existing] = await db.query<RowData>(
      'SELECT COALESCE(MAX(match_number), 0) + 1 AS next_num FROM tournament_matches WHERE tournament_id = ?',
      [data.tournament_id],
    );
    const matchNumber = data.match_number ?? existing[0]?.next_num ?? 1;
    const sql = `INSERT INTO tournament_matches (tournament_id, match_id, round, match_number, round_name, group_id, stage_id, bracket_position, player1_id, player2_id, participant1_id, participant2_id, winner_id, status, progression_state, progression_meta, resource_id, referee_id, start_time, score_summary)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await db.query<ResultSet>(sql, [
      data.tournament_id, data.match_id ?? null, data.round, matchNumber, data.round_name ?? null,
      data.group_id ?? null, data.stage_id ?? null, data.bracket_position ?? 0,
      data.player1_id ?? null, data.player2_id ?? null, data.participant1_id ?? null, data.participant2_id ?? null,
      data.winner_id ?? null,
      data.status ?? 'scheduled', data.progression_state ?? 'pending',
      data.progression_meta ? (typeof data.progression_meta === 'object' ? JSON.stringify(data.progression_meta) : data.progression_meta) : null,
      data.resource_id ?? null, data.referee_id ?? null,
      data.start_time ?? null, data.score_summary ?? null,
    ]);
    return (result as any).insertId;
  }

  async findMatches(tournamentId: number): Promise<TournamentMatch[]> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY round, bracket_position',
      [tournamentId],
    );
    return rows as TournamentMatch[];
  }

  /**
   * G8-D — count REQUIRED tournament matches that are still UNRESOLVED.
   *
   * A match is REQUIRED when it is a REAL generated match (shared `match_id`
   * present — byes/padding/placeholders are created without a shared Match and
   * are NOT required). A required match is UNRESOLVED when it is still
   * `scheduled` / `in_progress` in the slot, OR its authoritative shared result
   * is `disputed`. Terminal states (approved result incl. draw/walkover/forfeit,
   * no_result, cancelled) never count as unresolved.
   *
   * Cancelled slots are excluded (a cancelled projection must not block a valid
   * tournament). Non-required projections (bye, placeholder, no shared match)
   * are excluded by the `match_id IS NOT NULL` guard.
   */
  async countUnresolvedRequiredMatches(tournamentId: number): Promise<number> {
    const [rows] = await getPool().query<RowData>(
      `SELECT COUNT(*) AS c
       FROM tournament_matches tm
       LEFT JOIN match_result_records mrr ON mrr.match_id = tm.match_id
       WHERE tm.tournament_id = ?
         AND tm.match_id IS NOT NULL
         AND tm.status <> 'cancelled'
         AND tm.progression_state <> 'bye'
         AND (
           tm.status IN ('scheduled', 'in_progress')
           OR mrr.submission_status = 'disputed'
         )`,
      [tournamentId],
    );
    return Number(rows[0]?.c ?? 0);
  }

  /**
   * Group 5B / T-B — tournament bracket slots joined to their shared Match so the
   * admin/org result screen can render the authoritative shared lifecycle state
   * (shared_status, frozen format/rule snapshots) and drive start/result actions.
   * The shared Match remains the single source of truth; `tournament_matches` is
   * only the bracket slot pointer.
   */
  async findMatchesDetailed(tournamentId: number): Promise<Array<TournamentMatch & {
    shared_status?: string | null;
    format_snapshot?: unknown;
    rule_snapshot?: unknown;
    player1_name?: string | null;
    player2_name?: string | null;
    resource_name?: string | null;
    referee_name?: string | null;
  }>> {
    const [rows] = await getPool().query<RowData>(
      `SELECT tm.*, m.status AS shared_status, m.format_snapshot, m.rule_snapshot, m.booking_id,
              p1.full_name AS player1_name,
              p2.full_name AS player2_name,
              tp1.name AS participant1_name,
              tp2.name AS participant2_name,
              r.name AS resource_name,
              refu.full_name AS referee_name
       FROM tournament_matches tm
       LEFT JOIN matches m ON m.id = tm.match_id
       LEFT JOIN users p1 ON p1.id = tm.player1_id
       LEFT JOIN users p2 ON p2.id = tm.player2_id
       LEFT JOIN tournament_participants tp1 ON tp1.id = tm.participant1_id
       LEFT JOIN tournament_participants tp2 ON tp2.id = tm.participant2_id
       LEFT JOIN resources r ON r.id = tm.resource_id
       LEFT JOIN referees ref ON ref.id = tm.referee_id
       LEFT JOIN users refu ON refu.id = ref.user_id
       WHERE tm.tournament_id = ?
       ORDER BY tm.round, tm.bracket_position`,
      [tournamentId],
    );
    return rows as Array<TournamentMatch & { shared_status?: string | null; format_snapshot?: unknown; rule_snapshot?: unknown; player1_name?: string | null; player2_name?: string | null; resource_name?: string | null; referee_name?: string | null }>;
  }

  /** G8 — how many bracket slots (matches) already exist for the tournament. */
  async countMatches(tournamentId: number, conn?: PoolConnection): Promise<number> {
    const db = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      'SELECT COUNT(*) AS c FROM tournament_matches WHERE tournament_id = ?',
      [tournamentId],
    );
    return Number(rows[0]?.c ?? 0);
  }

  /** G8 — eligible courts: active resources of the tournament branch + sport. */
  async findEligibleCourts(tournamentId: number): Promise<Array<{ id: number; name: string; branch_id: number; sport_id: number | null; opening_time: string | null; closing_time: string | null; slot_duration: number | null }>> {
    const [rows] = await getPool().query<RowData>(
      `SELECT r.id, r.name, r.branch_id, r.sport_id, r.opening_time, r.closing_time, r.slot_duration
       FROM resources r
       JOIN tournaments t ON t.branch_id = r.branch_id
       WHERE t.id = ? AND r.is_active = 1 AND r.deleted_at IS NULL
         AND (r.sport_id IS NULL OR r.sport_id = t.sport_id)
       ORDER BY r.name`,
      [tournamentId],
    );
    return rows as Array<{ id: number; name: string; branch_id: number; sport_id: number | null; opening_time: string | null; closing_time: string | null; slot_duration: number | null }>;
  }

  async findMatchesByGroup(groupId: number): Promise<TournamentMatch[]> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_matches WHERE group_id = ? ORDER BY round, bracket_position',
      [groupId],
    );
    return rows as TournamentMatch[];
  }

  async findMatchById(id: number): Promise<TournamentMatch | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM tournament_matches WHERE id = ?', [id]);
    return rows.length ? (rows[0] as TournamentMatch) : null;
  }

  async updateMatch(id: number, data: Partial<TournamentMatch>, conn?: PoolConnection): Promise<void> {
    const db = conn ?? getPool();
    const fields: string[] = [];
    const params: any[] = [];
    const updatable: (keyof TournamentMatch)[] = [
      'round', 'match_number', 'round_name', 'group_id', 'bracket_position',
      'player1_id', 'player2_id', 'participant1_id', 'participant2_id', 'winner_id', 'status', 'resource_id',
      'referee_id', 'start_time', 'end_time', 'score_summary',
      'match_id', 'stage_id', 'progression_state',
    ];
    for (const f of updatable) {
      if (data[f] !== undefined) { fields.push(`${f} = ?`); params.push(data[f]); }
    }
    if (data.progression_meta !== undefined) {
      fields.push('progression_meta = ?');
      params.push(typeof data.progression_meta === 'object' ? JSON.stringify(data.progression_meta) : data.progression_meta);
    }
    if (!fields.length) return;
    fields.push('updated_at = NOW()');
    params.push(id);
    await db.query(
      `UPDATE tournament_matches SET ${fields.join(', ')} WHERE id = ?`, params,
    );
  }

  async updateMatchStatus(id: number, status: string, winnerId?: number, conn?: PoolConnection): Promise<void> {
    const db = conn ?? getPool();
    await db.query(
      `UPDATE tournament_matches SET status = ?, winner_id = COALESCE(?, winner_id),
       end_time = IF(? IN ('completed','walkover','forfeit'), NOW(), end_time)
       WHERE id = ?`,
      [status, winnerId ?? null, status, id],
    );
  }

  /** Group 5B — the tournament_matches slot linked to a shared `matches` row. */
  async findMatchBySharedMatchId(matchId: number): Promise<TournamentMatch | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_matches WHERE match_id = ? ORDER BY id ASC LIMIT 1',
      [matchId],
    );
    return rows.length ? (rows[0] as TournamentMatch) : null;
  }

  /**
   * G9-C — lock a tournament match slot row FOR UPDATE within the caller's
   * transaction. This is the authoritative serialisation point for shared-Match
   * materialisation: two concurrent progression deliveries against the same
   * target block on this lock, and exactly one proceeds to create the shared
   * Match (the loser re-reads an already-linked match_id).
   */
  async lockMatchById(id: number, conn: PoolConnection): Promise<TournamentMatch | null> {
    const [rows] = await conn.query<RowData>('SELECT * FROM tournament_matches WHERE id = ? FOR UPDATE', [id]);
    return rows.length ? (rows[0] as TournamentMatch) : null;
  }

  /** Group 5B — a specific bracket slot for a round + position. */
  async findBracketSlot(tournamentId: number, round: number, bracketPosition: number): Promise<TournamentMatch | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_matches WHERE tournament_id = ? AND round = ? AND bracket_position = ? ORDER BY id ASC LIMIT 1',
      [tournamentId, round, bracketPosition],
    );
    return rows.length ? (rows[0] as TournamentMatch) : null;
  }

  /** Group 5B — match rows sharing a (round, bracket_position) (round-robin discriminator). */
  async countMatchesAtPosition(tournamentId: number, round: number, bracketPosition: number): Promise<number> {
    const [rows] = await getPool().query<RowData>(
      'SELECT COUNT(*) AS c FROM tournament_matches WHERE tournament_id = ? AND round = ? AND bracket_position = ?',
      [tournamentId, round, bracketPosition],
    );
    return rows[0]?.c ?? 0;
  }

  /**
   * Group 5B — how many bracket slots of a stage are not yet resolved. A stage
   * is complete when every slot is `completed` (or `bye`). Nullable group_id
   * rows (round-robin) are tallied per stage too.
   */
  async countIncompleteStageMatches(stageId: number, conn?: PoolConnection): Promise<number> {
    const db = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      `SELECT COUNT(*) AS c FROM tournament_matches
       WHERE stage_id = ? AND progression_state NOT IN ('completed', 'bye')`,
      [stageId],
    );
    return rows[0]?.c ?? 0;
  }

  /** Group 5B — stage lifecycle transition (uses the caller's connection when inside a transaction). */
  async updateStageStatus(stageId: number, status: string, conn?: PoolConnection): Promise<void> {
    const db = conn ?? getPool();
    await db.query(
      'UPDATE tournament_stages SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, stageId],
    );
  }

  async assignCourt(matchId: number, resourceId: number): Promise<void> {
    await getPool().query('UPDATE tournament_matches SET resource_id = ? WHERE id = ?', [resourceId, matchId]);
  }

  async assignReferee(matchId: number, refereeId: number): Promise<void> {
    await getPool().query('UPDATE tournament_matches SET referee_id = ? WHERE id = ?', [refereeId, matchId]);
  }

  // ── Match Results ──

  async createMatchResult(data: Partial<TournamentMatchResult>): Promise<number> {
    const sql = `INSERT INTO tournament_match_results (match_id, winner_id, home_score, away_score, score_details, result_status, entered_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await getPool().query<ResultSet>(sql, [
      data.match_id, data.winner_id ?? null, data.home_score ?? null, data.away_score ?? null,
      data.score_details ?? null, data.result_status ?? 'submitted', data.entered_by,
    ]);
    return (result as any).insertId;
  }

  async getMatchResult(matchId: number): Promise<TournamentMatchResult | null> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_match_results WHERE match_id = ? ORDER BY created_at DESC LIMIT 1',
      [matchId],
    );
    return rows.length ? (rows[0] as TournamentMatchResult) : null;
  }

  // ── Groups ──

  async createGroup(data: Partial<TournamentGroup>): Promise<number> {
    const sql = 'INSERT INTO tournament_groups (tournament_id, name, advance_count) VALUES (?, ?, ?)';
    const [result] = await getPool().query<ResultSet>(sql, [
      data.tournament_id, data.name, data.advance_count ?? 1,
    ]);
    return (result as any).insertId;
  }

  async findGroups(tournamentId: number): Promise<TournamentGroup[]> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_groups WHERE tournament_id = ? ORDER BY name',
      [tournamentId],
    );
    return rows as TournamentGroup[];
  }

  async findGroupById(id: number): Promise<TournamentGroup | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM tournament_groups WHERE id = ?', [id]);
    return rows.length ? (rows[0] as TournamentGroup) : null;
  }

  async addGroupMember(data: Partial<TournamentGroupMember>): Promise<number> {
    const sql = 'INSERT INTO tournament_group_members (group_id, registration_id, seed) VALUES (?, ?, ?)';
    const [result] = await getPool().query<ResultSet>(sql, [
      data.group_id, data.registration_id, data.seed ?? 0,
    ]);
    return (result as any).insertId;
  }

  async findGroupMembers(groupId: number): Promise<TournamentGroupMember[]> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_group_members WHERE group_id = ? ORDER BY seed',
      [groupId],
    );
    return rows as TournamentGroupMember[];
  }

  async findGroupMembersByTournament(tournamentId: number): Promise<any[]> {
    const [rows] = await getPool().query<RowData>(
      `SELECT gm.*, g.name AS group_name, g.advance_count
       FROM tournament_group_members gm
       JOIN tournament_groups g ON g.id = gm.group_id
       WHERE g.tournament_id = ?
       ORDER BY g.name, gm.seed`,
      [tournamentId],
    );
    return rows;
  }

  // ── Stages (Group 5A — MIXED tournaments) ──

  async createStage(data: Partial<TournamentStage>): Promise<number> {
    const sql = `INSERT INTO tournament_stages (tournament_id, stage_order, name, progression_format, match_format_id, rule_set_id, advance_count, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await getPool().query<ResultSet>(sql, [
      data.tournament_id, data.stage_order ?? 1, data.name ?? null,
      data.progression_format ?? 'round_robin', data.match_format_id ?? null,
      data.rule_set_id ?? null, data.advance_count ?? 1, data.status ?? 'pending',
    ]);
    return (result as any).insertId;
  }

  async findStages(tournamentId: number): Promise<TournamentStage[]> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_stages WHERE tournament_id = ? ORDER BY stage_order',
      [tournamentId],
    );
    return rows as TournamentStage[];
  }

  // ── Standings ──

  async getStandings(tournamentId: number, groupId?: number): Promise<TournamentStandingRow[]> {
    const where: string[] = ['s.tournament_id = ?'];
    const params: any[] = [tournamentId];
    if (groupId !== undefined) { where.push('s.group_id = ?'); params.push(groupId); }
    const [rows] = await getPool().query<RowData>(
      `SELECT s.*, u.full_name AS player_name
       FROM tournament_standings s
       LEFT JOIN tournament_registrations r ON r.id = s.registration_id
       LEFT JOIN users u ON u.id = r.player_id
       WHERE ${where.join(' AND ')} ORDER BY s.rank_position ASC`,
      params,
    );
    return rows as TournamentStandingRow[];
  }

  async upsertStanding(data: Partial<TournamentStandingRow>): Promise<void> {
    await getPool().query(
      `INSERT INTO tournament_standings (tournament_id, group_id, registration_id, points, wins, losses, draws, games_won, games_lost, sets_won, sets_lost, rank_position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       points = VALUES(points), wins = VALUES(wins), losses = VALUES(losses), draws = VALUES(draws),
       games_won = VALUES(games_won), games_lost = VALUES(games_lost),
       sets_won = VALUES(sets_won), sets_lost = VALUES(sets_lost),
       rank_position = VALUES(rank_position)`,
      [data.tournament_id, data.group_id ?? null, data.registration_id,
       data.points, data.wins, data.losses, data.draws,
       data.games_won, data.games_lost, data.sets_won ?? 0, data.sets_lost ?? 0, data.rank_position ?? null],
    );
  }

  /**
   * Group 8-A + G8-D — standings recalculation (ONE authoritative implementation).
   *
   * The approved shared-result projection (`tournament_matches.winner_id`) is
   * ALWAYS mirrored by the result listener, so completing Round-Robin AND
   * knockout matches land here the same way. Calculation itself delegates to the
   * domain `computeStandings` — the repository never implements a second ranking.
   *
   * G8-D — contributing rows now also classify the authoritative OUTCOME
   * (`win` / `draw` / `no_result`) and carry the FROZEN standings points from the
   * versioned, immutable `sport_rule_sets.standings_rules` referenced by the
   * result's rule_set_id (never today's active rules). Draws (winner_id null but
   * approved `final_result.winner='draw'`) are included and scored with
   * points.draw; no_result rows contribute nothing. Legacy rows without a result
   * record keep the historical fallback (3/0, winner-based).
   *
   * The delete+reinsert is atomic (transactional) so partial failures cannot
   * leave a half-written table.
   */
  async recalculateStandings(tournamentId: number, groupId?: number, conn?: PoolConnection): Promise<void> {
    const db = conn ?? getPool();

    const matchWhere: string[] = ['tm.tournament_id = ?', "tm.status = 'completed'"];
    const matchParams: any[] = [tournamentId];
    if (groupId !== undefined) { matchWhere.push('(tm.group_id = ? OR tm.player1_id IN (SELECT registration_id FROM tournament_group_members WHERE group_id = ?))'); matchParams.push(groupId, groupId); }

    const [rows] = await db.query<RowData>(
      `SELECT tm.player1_id, tm.player2_id, tm.winner_id, tm.status, tm.match_id,
              mrr.submission_status AS result_status,
              mrr.final_result AS result_final,
              srs.standings_rules AS standings_rules
       FROM tournament_matches tm
       LEFT JOIN match_result_records mrr ON mrr.match_id = tm.match_id
       LEFT JOIN sport_rule_sets srs ON srs.id = mrr.rule_set_id
       WHERE ${matchWhere.join(' AND ')}`,
      matchParams,
    );

    const matches = (rows as unknown[]).map((r) => {
      const row = r as any;
      const match = {
        player1_id: row.player1_id,
        player2_id: row.player2_id,
        winner_id: row.winner_id,
        status: row.status,
        match_id: row.match_id,
      } as TournamentMatch;
      // G8-D — classify the authoritative outcome from the result record.
      const resultStatus: string | null = row.result_status ?? null;
      let resultFinal: any = row.result_final;
      if (typeof resultFinal === 'string') { try { resultFinal = JSON.parse(resultFinal); } catch { resultFinal = null; } }
      let standingsRules: any = row.standings_rules;
      if (typeof standingsRules === 'string') { try { standingsRules = JSON.parse(standingsRules); } catch { standingsRules = null; } }

      const points = standingsRules?.points ?? null;
      const hasWinner = match.winner_id != null;
      const isDraw = !hasWinner && resultStatus === 'approved' && resultFinal?.winner === 'draw';

      if (hasWinner) {
        // Authoritative winner or legacy winner-based row.
        match.standingsOutcome = 'win';
      } else if (isDraw) {
        // Approved draw — winner projection is null, but the result is a draw.
        match.standingsOutcome = 'draw';
      } else {
        // completed + null winner: no_result / abandoned / legacy null-winner row.
        // Point-neutral by contract (G8-D) — counts for completion eligibility only.
        match.standingsOutcome = 'no_result';
      }
      match.standingsPoints = points ?? { win: 3, draw: 0, loss: 0 };
      return match;
    });

    const contributing = matches.filter((m) => m.standingsOutcome === 'win' || m.standingsOutcome === 'draw');
    const participantIds = [...new Set(
      contributing.flatMap((m) => [Number(m.player1_id), Number(m.player2_id)]).filter((id) => Number.isSafeInteger(id) && id > 0),
    )];
    const standings = computeStandings(matches, participantIds);

    const persist = async (executor: typeof db, gid: number | null) => {
      await executor.query(
        'DELETE FROM tournament_standings WHERE tournament_id = ? AND (group_id = ? OR (? IS NULL AND group_id IS NULL))',
        [tournamentId, gid, gid],
      );
      for (const s of standings) {
        await executor.query(
          `INSERT INTO tournament_standings (tournament_id, group_id, registration_id, points, wins, losses, draws, games_won, games_lost, sets_won, sets_lost, rank_position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tournamentId, gid, s.registration_id, s.points, s.wins, s.losses, s.draws, s.games_won, s.games_lost, s.sets_won, s.sets_lost, s.rank_position],
        );
      }
    };

    if (conn) {
      await persist(conn, groupId ?? null);
      return;
    }
    await withTransaction(async (c) => persist(c, groupId ?? null));
  }

  // ── Dashboard ──

  async getDashboard(): Promise<{
    total_tournaments: number;
    active_tournaments: number;
    running_tournaments: number;
    total_registrations: number;
    total_matches: number;
    completed_matches: number;
    upcoming_tournaments: number;
    status_breakdown: Record<string, number>;
  }> {
    const pool = getPool();
    const [[totalT]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM tournaments WHERE status != 'archived'");
    const [[activeT]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM tournaments WHERE status IN ('published','registration_open','registration_closed')");
    const [[runT]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM tournaments WHERE status = 'running'");
    const [[totalReg]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM tournament_registrations");
    const [[totalM]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM tournament_matches");
    const [[compM]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM tournament_matches WHERE status = 'completed'");
    const [[upcomingT]] = await pool.execute<RowData>("SELECT COUNT(*) AS c FROM tournaments WHERE status IN ('published','registration_open') AND start_date > NOW()");
    const [statusRows] = await pool.execute<RowData>("SELECT status, COUNT(*) AS c FROM tournaments GROUP BY status");

    const status_breakdown: Record<string, number> = {};
    for (const r of statusRows) { status_breakdown[r.status] = r.c; }

    return {
      total_tournaments: totalT.c,
      active_tournaments: activeT.c,
      running_tournaments: runT.c,
      total_registrations: totalReg.c,
      total_matches: totalM.c,
      completed_matches: compM.c,
      upcoming_tournaments: upcomingT.c,
      status_breakdown,
    };
  }
}

export const tournamentRepository = new TournamentRepository();
