import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import type { Tournament, TournamentRegistration, TournamentMatch, TournamentMatchResult, TournamentGroup, TournamentGroupMember, TournamentStandingRow } from '../../domain/tournament-aggregate.js';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

export class TournamentRepository {
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
      `SELECT t.* FROM tournaments t WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC${paginationClause(pag)}`,
      params,
    );

    return { data: rows as Tournament[], total, page: pag.page, limit: pag.limit };
  }

  async findById(id: number): Promise<Tournament | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM tournaments WHERE id = ?', [id]);
    return rows.length ? (rows[0] as Tournament) : null;
  }

  async findByCode(code: string): Promise<Tournament | null> {
    const [rows] = await getPool().query<RowData>('SELECT * FROM tournaments WHERE code = ? LIMIT 1', [code]);
    return rows.length ? (rows[0] as Tournament) : null;
  }

  async create(data: Partial<Tournament>): Promise<number> {
    const sql = `INSERT INTO tournaments (public_id, creator_id, organisation_id, branch_id, bracket_type_id, format, category, season, sport_id, name, code, description, tournament_type, max_participants, max_teams, min_participants, entry_fee, registration_fee, currency_code, price_type, commission_rate, prize_description, status, is_public, registration_opens, registration_closes, start_date, end_date, rules, is_featured, image_url)
                 VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await getPool().query<ResultSet>(sql, [
      data.creator_id, data.organisation_id ?? null, data.branch_id ?? null,
      data.bracket_type_id, data.format ?? null, data.category ?? null, data.season ?? null,
      data.sport_id ?? null, data.name, data.code ?? null, data.description ?? null,
      data.tournament_type ?? 'platform',
      data.max_participants, data.max_teams ?? null, data.min_participants ?? 2,
      data.entry_fee ?? 0, data.registration_fee ?? null,
      data.currency_code, data.price_type ?? null, data.commission_rate ?? 0,
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
      'sport_id', 'name', 'code', 'description', 'tournament_type',
      'max_participants', 'max_teams', 'min_participants', 'entry_fee', 'registration_fee',
      'currency_code', 'price_type', 'commission_rate', 'prize_description',
      'status', 'is_public', 'registration_opens', 'registration_closes',
      'start_date', 'end_date', 'rules', 'is_featured', 'image_url',
    ];
    for (const f of updatable) {
      if (data[f] !== undefined) { fields.push(`${f} = ?`); params.push(data[f]); }
    }
    if (!fields.length) return;
    params.push(id);
    await getPool().query(
      `UPDATE tournaments SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, params,
    );
  }

  async updateStatus(id: number, status: string): Promise<void> {
    const extras: string[] = ['status = ?'];
    const params: any[] = [status];
    if (status === 'archived') { extras.push('archived_at = NOW()'); }
    params.push(id);
    await getPool().query(
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
      'SELECT * FROM tournament_registrations WHERE tournament_id = ? ORDER BY seed',
      [tournamentId],
    );
    return rows as TournamentRegistration[];
  }

  async findRegistrationsByPlayer(userId: number): Promise<TournamentRegistration[]> {
    const [rows] = await getPool().query<RowData>(
      'SELECT * FROM tournament_registrations WHERE user_id = ? ORDER BY registered_at DESC',
      [userId],
    );
    return rows as TournamentRegistration[];
  }

  async createRegistration(data: Partial<TournamentRegistration>): Promise<number> {
    const sql = `INSERT INTO tournament_registrations (tournament_id, user_id, team_id, team_name, seed, status, waiting_order, registered_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`;
    const [result] = await getPool().query<ResultSet>(sql, [
      data.tournament_id, data.user_id ?? null, data.team_id ?? null, data.team_name ?? null,
      data.seed ?? 0, data.status ?? 'pending', data.waiting_order ?? null,
    ]);
    return (result as any).insertId;
  }

  async updateRegistrationStatus(id: number, status: string, waitingOrder?: number): Promise<void> {
    const extras: string[] = ['status = ?'];
    const params: any[] = [status];
    if (status === 'confirmed') { extras.push('confirmed_at = NOW()'); }
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

  // ── Matches ──

  async createMatch(data: Partial<TournamentMatch>): Promise<number> {
    const pool = getPool();
    const [existing] = await pool.query<RowData>(
      'SELECT COALESCE(MAX(match_number), 0) + 1 AS next_num FROM tournament_matches WHERE tournament_id = ?',
      [data.tournament_id],
    );
    const matchNumber = existing[0]?.next_num ?? 1;
    const sql = `INSERT INTO tournament_matches (tournament_id, round, match_number, round_name, group_id, bracket_position, player1_id, player2_id, winner_id, status, resource_id, referee_id, start_time, score_summary)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await pool.query<ResultSet>(sql, [
      data.tournament_id, data.round, matchNumber, data.round_name ?? null,
      data.group_id ?? null, data.bracket_position ?? 0,
      data.player1_id ?? null, data.player2_id ?? null, data.winner_id ?? null,
      data.status ?? 'scheduled', data.resource_id ?? null, data.referee_id ?? null,
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

  async updateMatch(id: number, data: Partial<TournamentMatch>): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    const updatable: (keyof TournamentMatch)[] = [
      'round', 'match_number', 'round_name', 'group_id', 'bracket_position',
      'player1_id', 'player2_id', 'winner_id', 'status', 'resource_id',
      'referee_id', 'start_time', 'end_time', 'score_summary',
    ];
    for (const f of updatable) {
      if (data[f] !== undefined) { fields.push(`${f} = ?`); params.push(data[f]); }
    }
    if (!fields.length) return;
    fields.push('updated_at = NOW()');
    params.push(id);
    await getPool().query(
      `UPDATE tournament_matches SET ${fields.join(', ')} WHERE id = ?`, params,
    );
  }

  async updateMatchStatus(id: number, status: string, winnerId?: number): Promise<void> {
    await getPool().query(
      `UPDATE tournament_matches SET status = ?, winner_id = COALESCE(?, winner_id),
       end_time = IF(? IN ('completed','walkover','forfeit'), NOW(), end_time)
       WHERE id = ?`,
      [status, winnerId ?? null, status, id],
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

  // ── Standings ──

  async getStandings(tournamentId: number, groupId?: number): Promise<TournamentStandingRow[]> {
    const where: string[] = ['s.tournament_id = ?'];
    const params: any[] = [tournamentId];
    if (groupId !== undefined) { where.push('s.group_id = ?'); params.push(groupId); }
    const [rows] = await getPool().query<RowData>(
      `SELECT s.* FROM tournament_standings s WHERE ${where.join(' AND ')} ORDER BY s.rank_position ASC`,
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

  async recalculateStandings(tournamentId: number, groupId?: number): Promise<void> {
    const pool = getPool();
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
