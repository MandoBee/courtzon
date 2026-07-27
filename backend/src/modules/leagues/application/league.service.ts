import { leagueRepository } from '../infrastructure/repositories/league.repository.js';
import { validateLeagueTransition, validateTeamTransition } from '../domain/lifecycle.js';
import type { LeagueAttributes, LeagueTeamAttributes, LeagueDashboard } from '../domain/league.types.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { getPool } from '../../../database/mysql.js';

type RowData = import('mysql2').RowDataPacket[];

export class LeagueService {
  async create(data: Partial<LeagueAttributes>): Promise<LeagueAttributes> {
    const existing = await leagueRepository.findByCode(data.code!);
    if (existing) throw new ConflictError('League code already exists', ErrorCodes.ACADEMY_PROGRAM_CODE_EXISTS);
    const id = await leagueRepository.create(data);
    const league = await leagueRepository.findById(id);
    eventBusV2.emit('league.created', { leagueId: id, name: data.name } as Record<string, unknown>, {
      aggregateType: 'league', aggregateId: String(id), aggregateVersion: 1,
    });
    return league!;
  }

  async list(filters: {
    page?: number; limit?: number; search?: string; status?: string;
    sport_id?: number; season_id?: number; is_public?: boolean;
  }) {
    return leagueRepository.list(filters);
  }

  async getById(id: number): Promise<LeagueAttributes> {
    const l = await leagueRepository.findById(id);
    if (!l) throw new NotFoundError('League', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    return l;
  }

  async update(id: number, data: Partial<LeagueAttributes>): Promise<LeagueAttributes> {
    await this.getById(id);
    if (data.code) {
      const existing = await leagueRepository.findByCode(data.code);
      if (existing && existing.id !== id) throw new ConflictError('League code already exists', ErrorCodes.ACADEMY_PROGRAM_CODE_EXISTS);
    }
    await leagueRepository.update(id, data);
    return this.getById(id);
  }

  async updateStatus(id: number, status: string): Promise<LeagueAttributes> {
    const l = await this.getById(id);
    validateLeagueTransition(l.status, status as any);
    await leagueRepository.updateStatus(id, status);
    return this.getById(id);
  }

  async publish(id: number) { return this.updateStatus(id, 'registration_open'); }
  async openRegistration(id: number) { return this.updateStatus(id, 'registration_open'); }
  async closeRegistration(id: number) { return this.updateStatus(id, 'registration_closed'); }
  async start(id: number) { return this.updateStatus(id, 'running'); }
  async complete(id: number) { return this.updateStatus(id, 'completed'); }
  async cancel(id: number) { return this.updateStatus(id, 'cancelled'); }
  async archive(id: number) { return this.updateStatus(id, 'archived'); }

  async getDashboard(): Promise<LeagueDashboard> {
    return leagueRepository.getDashboard();
  }

  async registerTeam(leagueId: number, teamName: string, captainId?: number, playerIds?: number[]): Promise<LeagueTeamAttributes> {
    const l = await this.getById(leagueId);
    if (l.status !== 'registration_open' && l.status !== 'registration_closed') {
      throw new ConflictError('Registration is not open for this league', ErrorCodes.ACADEMY_CAPACITY_EXCEEDED);
    }

    const pool = getPool();
    const [divisions] = await pool.query<RowData>(
      'SELECT * FROM league_divisions WHERE league_id = ? ORDER BY tier ASC LIMIT 1',
      [leagueId],
    );

    if (!divisions.length) throw new NotFoundError('No divisions found for this league', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
    const divisionId = (divisions[0] as any).id;
    const capacity = (divisions[0] as any).capacity || l.max_teams;

    const [existing] = await pool.query<RowData>(
      'SELECT * FROM league_teams WHERE division_id = ? AND team_name = ?',
      [divisionId, teamName],
    );
    if (existing.length) throw new ConflictError('Team name already registered in this division', ErrorCodes.ACADEMY_ENROLLMENT_EXISTS);

    const [confirmedRows] = await pool.query<RowData>(
      "SELECT COUNT(*) AS c FROM league_teams WHERE division_id = ? AND status = 'confirmed'",
      [divisionId],
    );
    const confirmedCount = (confirmedRows[0] as any)?.c ?? 0;
    const isFull = capacity > 0 && confirmedCount >= capacity;

    const status = isFull ? 'waiting' : 'pending';
    let waitingOrder: number | undefined;
    if (isFull) {
      const [waitRows] = await pool.query<RowData>(
        "SELECT COALESCE(MAX(waiting_order), 0) + 1 AS next_order FROM league_teams WHERE division_id = ? AND status = 'waiting'",
        [divisionId],
      );
      waitingOrder = (waitRows[0] as any)?.next_order ?? 1;
    }

    const [seedRows] = await pool.query<RowData>(
      'SELECT COUNT(*) AS c FROM league_teams WHERE division_id = ?',
      [divisionId],
    );
    const seed = ((seedRows[0] as any)?.c ?? 0) + 1;

    const [result] = await pool.query<any>(
      `INSERT INTO league_teams (division_id, team_name, captain_id, player_ids, status, waiting_order, seed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [divisionId, teamName, captainId ?? null, playerIds ? JSON.stringify(playerIds) : null, status, waitingOrder ?? null, seed],
    );
    const teamId = (result as any).insertId;

    const [teamRow] = await pool.query<RowData>('SELECT * FROM league_teams WHERE id = ?', [teamId]);
    return (teamRow[0] as LeagueTeamAttributes);
  }

  async cancelRegistration(teamId: number): Promise<void> {
    const pool = getPool();
    const [rows] = await pool.query<RowData>('SELECT * FROM league_teams WHERE id = ?', [teamId]);
    if (!rows.length) throw new NotFoundError('Team registration', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
    const team = rows[0] as LeagueTeamAttributes;
    validateTeamTransition(team.status, 'cancelled');
    await pool.query("UPDATE league_teams SET status = 'cancelled' WHERE id = ?", [teamId]);
  }

  async confirmRegistration(teamId: number): Promise<void> {
    const pool = getPool();
    const [rows] = await pool.query<RowData>('SELECT * FROM league_teams WHERE id = ?', [teamId]);
    if (!rows.length) throw new NotFoundError('Team registration', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
    const team = rows[0] as LeagueTeamAttributes;
    validateTeamTransition(team.status, 'confirmed');
    await pool.query("UPDATE league_teams SET status = 'confirmed' WHERE id = ?", [teamId]);

    const divisionId = team.division_id;
    const [waitingRows] = await pool.query<RowData>(
      "SELECT * FROM league_teams WHERE division_id = ? AND status = 'waiting' ORDER BY waiting_order ASC LIMIT 1",
      [divisionId],
    );
    if (waitingRows.length) {
      const [divRows] = await pool.query<RowData>('SELECT capacity FROM league_divisions WHERE id = ?', [divisionId]);
      const capacity = (divRows[0] as any)?.capacity ?? 0;
      const [confirmedRows] = await pool.query<RowData>(
        "SELECT COUNT(*) AS c FROM league_teams WHERE division_id = ? AND status = 'confirmed'",
        [divisionId],
      );
      const confirmedCount = (confirmedRows[0] as any)?.c ?? 0;
      if (capacity === 0 || confirmedCount < capacity) {
        const waiting = waitingRows[0] as any;
        await pool.query("UPDATE league_teams SET status = 'confirmed' WHERE id = ?", [waiting.id]);
      }
    }
  }
}

export const leagueService = new LeagueService();
