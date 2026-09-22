import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
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

  async findById(id: number): Promise<Tournament | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM tournaments WHERE id = ?', [id]);
    return rows.length ? (rows[0] as Tournament) : null;
  }

  /**
   * Authoritative tournament detail — the raw row PLUS the display aliases the
   * management detail screens (Super Admin + Org) render (sport_name,
   * organisation_name, max_players, type, registration_deadline). This is the
   * SINGLE shared shape for the admin and org detail endpoints; the raw
   * `findById` remains the internal logic view.
   */
  async findByIdDetailed(id: number): Promise<any | null> {
    const [rows] = await getPool().query<RowData>(
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
       WHERE t.id = ?`,
      [id],
    );
    return rows.length ? rows[0] : null;
  }

  async findByCode(code: string): Promise<Tournament | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM tournaments WHERE code = ? LIMIT 1', [code]);
    return rows.length ? (rows[0] as Tournament) : null;
  }

  async create(data: Partial<Tournament>): Promise<number> {
    const sql = `INSERT INTO tournaments (public_id, creator_id, organisation_id, branch_id, bracket_type_id, format, category, season, sport_id, match_format_id, rule_set_id, name, code, description, tournament_type, max_participants, max_teams, min_participants, entry_fee, registration_fee, currency_code, price_type, registration_payment_methods, commission_rate, prize_description, status, is_public, registration_opens, registration_closes, start_date, end_date, rules, is_featured, image_url)
                 VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await getPool().query<ResultSet>(sql, [
      data.creator_id, data.organisation_id ?? null, data.branch_id ?? null,
      data.bracket_type_id, data.format ?? null, data.category ?? null, data.season ?? null,
      data.sport_id ?? null, data.match_format_id ?? null, data.rule_set_id ?? null,
      data.name, data.code ?? null, data.description ?? null,
      data.tournament_type ?? 'platform',
      data.max_participants, data.max_teams ?? null, data.min_participants ?? 2,
      data.entry_fee ?? 0, data.registration_fee ?? 0,
      data.currency_code, data.price_type ?? null,
      this.stringifyPaymentMethods(data.registration_payment_methods),
      data.commission_rate ?? 0,
      data.prize_description ?? null, data.status ?? 'draft',
      data.is_public ?? true, data.registration_opens ?? null, data.registration_closes ?? null,
      data.start_date ?? null, data.end_date ?? null, data.rules ?? null,
      data.is_featured ?? false, data.image_url ?? null,
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
      'currency_code', 'price_type', 'registration_payment_methods', 'prize_description',
      'status', 'is_public', 'registration_opens', 'registration_closes',
      'start_date', 'end_date', 'rules', 'is_featured', 'image_url',
    ];
    for (const f of updatable) {
      if (data[f] !== undefined) {
        fields.push(`${f} = ?`);
        params.push(f === 'registration_payment_methods' ? this.stringifyPaymentMethods(data[f]) : data[f]);
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
    return rows as TournamentRegistration[];
  }

  async findRegistrationsByPlayer(userId: number): Promise<TournamentRegistration[]> {
    const [rows] = await getPool().query<RowData>(
      `SELECT r.*, u.full_name AS player_name
       FROM tournament_registrations r
       LEFT JOIN users u ON u.id = r.player_id
       WHERE r.player_id = ? ORDER BY r.registered_at DESC`,
      [userId],
    );
    return rows as TournamentRegistration[];
  }

  async createRegistration(data: Partial<TournamentRegistration>): Promise<number> {
    const sql = `INSERT INTO tournament_registrations (tournament_id, player_id, team_id, seed_rank, status, payment_status, waiting_order, registered_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`;
    const [result] = await getPool().query<ResultSet>(sql, [
      data.tournament_id, data.player_id ?? data.user_id ?? null, data.team_id ?? null,
      data.seed ?? null, data.status ?? 'registered', data.payment_status ?? 'unpaid',
      data.waiting_order ?? null,
    ]);
    return (result as any).insertId;
  }

  async updateRegistrationPaymentStatus(id: number, paymentStatus: string): Promise<void> {
    await getPool().query(
      'UPDATE tournament_registrations SET payment_status = ? WHERE id = ?', [paymentStatus, id],
    );
  }

  async findRegistrationsByPlayerUserId(userId: number): Promise<TournamentRegistration[]> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_registrations WHERE player_id = ? ORDER BY registered_at DESC',
      [userId],
    );
    return rows as TournamentRegistration[];
  }

  async updateRegistrationStatus(id: number, status: string, waitingOrder?: number): Promise<void> {
    const extras: string[] = ['status = ?'];
    const params: any[] = [status];
    if (status === 'withdrawn' || status === 'disqualified') { extras.push('cancelled_at = NOW()'); }
    if (waitingOrder !== undefined) { extras.push('waiting_order = ?'); params.push(waitingOrder); }
    params.push(id);
    await getPool().query(
      `UPDATE tournament_registrations SET ${extras.join(', ')} WHERE id = ?`, params,
    );
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
    return rows.length ? (rows[0] as TournamentRegistration) : null;
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

  async createMatch(data: Partial<TournamentMatch>): Promise<number> {
    const pool = getPool();
    const [existing] = await pool.query<RowData>(
      'SELECT COALESCE(MAX(match_number), 0) + 1 AS next_num FROM tournament_matches WHERE tournament_id = ?',
      [data.tournament_id],
    );
    const matchNumber = data.match_number ?? existing[0]?.next_num ?? 1;
    const sql = `INSERT INTO tournament_matches (tournament_id, match_id, round, match_number, round_name, group_id, stage_id, bracket_position, player1_id, player2_id, winner_id, status, progression_state, progression_meta, resource_id, referee_id, start_time, score_summary)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await pool.query<ResultSet>(sql, [
      data.tournament_id, data.match_id ?? null, data.round, matchNumber, data.round_name ?? null,
      data.group_id ?? null, data.stage_id ?? null, data.bracket_position ?? 0,
      data.player1_id ?? null, data.player2_id ?? null, data.winner_id ?? null,
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
      `SELECT tm.*, m.status AS shared_status, m.format_snapshot, m.rule_snapshot,
              p1.full_name AS player1_name,
              p2.full_name AS player2_name,
              r.name AS resource_name,
              refu.full_name AS referee_name
       FROM tournament_matches tm
       LEFT JOIN matches m ON m.id = tm.match_id
       LEFT JOIN users p1 ON p1.id = tm.player1_id
       LEFT JOIN users p2 ON p2.id = tm.player2_id
       LEFT JOIN resources r ON r.id = tm.resource_id
       LEFT JOIN referees ref ON ref.id = tm.referee_id
       LEFT JOIN users refu ON refu.id = ref.user_id
       WHERE tm.tournament_id = ?
       ORDER BY tm.round, tm.bracket_position`,
      [tournamentId],
    );
    return rows as Array<TournamentMatch & { shared_status?: string | null; format_snapshot?: unknown; rule_snapshot?: unknown; player1_name?: string | null; player2_name?: string | null; resource_name?: string | null; referee_name?: string | null }>;
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
      'player1_id', 'player2_id', 'winner_id', 'status', 'resource_id',
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

  async recalculateStandings(tournamentId: number, groupId?: number, conn?: PoolConnection): Promise<void> {
    const pool = conn ?? getPool();
    await pool.query('DELETE FROM tournament_standings WHERE tournament_id = ? AND (group_id = ? OR (? IS NULL AND group_id IS NULL))',
      [tournamentId, groupId ?? null, groupId ?? null]);

    const matchWhere: string[] = ['m.tournament_id = ?', "m.status = 'completed'", 'm.winner_id IS NOT NULL'];
    const matchParams: any[] = [tournamentId];
    if (groupId !== undefined) { matchWhere.push('(m.group_id = ? OR m.player1_id IN (SELECT registration_id FROM tournament_group_members WHERE group_id = ?))'); matchParams.push(groupId, groupId); }

    const [rows] = await pool.query<RowData>(
      `SELECT m.player1_id, m.player2_id, m.winner_id FROM tournament_matches m WHERE ${matchWhere.join(' AND ')}`,
      matchParams,
    );

    const stats = new Map<number, { points: number; wins: number; losses: number; draws: number; games_won: number; games_lost: number }>();

    for (const m of rows) {
      const p1 = m.player1_id;
      const p2 = m.player2_id;
      if (!p1 || !p2) continue;
      if (!stats.has(p1)) stats.set(p1, { points: 0, wins: 0, losses: 0, draws: 0, games_won: 0, games_lost: 0 });
      if (!stats.has(p2)) stats.set(p2, { points: 0, wins: 0, losses: 0, draws: 0, games_won: 0, games_lost: 0 });

      const winner = stats.get(m.winner_id)!;
      const loser = stats.get(m.winner_id === p1 ? p2 : p1)!;
      winner.wins++;
      winner.games_won++;
      winner.points += 3;
      loser.losses++;
      loser.games_lost++;
    }

    let rank = 1;
    const sorted = [...stats.entries()].sort((a, b) => b[1].points - a[1].points);
    for (const [registrationId, s] of sorted) {
      await pool.query(
        `INSERT INTO tournament_standings (tournament_id, group_id, registration_id, points, wins, losses, draws, games_won, games_lost, sets_won, sets_lost, rank_position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tournamentId, groupId ?? null, registrationId, s.points, s.wins, s.losses, s.draws, s.games_won, s.games_lost, 0, 0, rank],
      );
      rank++;
    }
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
