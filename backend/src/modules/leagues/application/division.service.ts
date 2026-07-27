import { divisionRepository } from '../infrastructure/repositories/division.repository.js';
import type { LeagueDivisionAttributes } from '../domain/league.types.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { getPool } from '../../../database/mysql.js';

type RowData = import('mysql2').RowDataPacket[];

export class DivisionService {
  async create(data: Partial<LeagueDivisionAttributes>): Promise<LeagueDivisionAttributes> {
    const id = await divisionRepository.create(data);
    const division = await divisionRepository.findById(id);
    return division!;
  }

  async update(id: number, data: Partial<LeagueDivisionAttributes>): Promise<LeagueDivisionAttributes> {
    const d = await divisionRepository.findById(id);
    if (!d) throw new NotFoundError('Division', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
    await divisionRepository.update(id, data);
    return (await divisionRepository.findById(id))!;
  }

  async promote(divisionId: number, teamCount: number): Promise<void> {
    const d = await divisionRepository.findById(divisionId);
    if (!d) throw new NotFoundError('Division', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);

    const teams = await divisionRepository.getTeamsWithStandings(divisionId);
    const top = teams
      .filter((t: any) => t.position !== null)
      .sort((a: any, b: any) => (a.position || 999) - (b.position || 999))
      .slice(0, teamCount);

    if (top.length === 0) throw new ConflictError('No ranked teams to promote', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);

    const pool = getPool();
    const [higherDivisions] = await pool.query<RowData>(
      'SELECT * FROM league_divisions WHERE league_id = (SELECT league_id FROM league_divisions WHERE id = ?) AND tier < ? ORDER BY tier DESC LIMIT 1',
      [divisionId, d.tier],
    );

    if (!higherDivisions.length) throw new ConflictError('No higher tier division to promote to', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
    const targetDivisionId = (higherDivisions[0] as any).id;

    for (const team of top) {
      await pool.query('UPDATE league_teams SET division_id = ? WHERE id = ?', [targetDivisionId, team.team_id]);
    }
  }

  async relegate(divisionId: number, teamCount: number): Promise<void> {
    const d = await divisionRepository.findById(divisionId);
    if (!d) throw new NotFoundError('Division', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);

    const teams = await divisionRepository.getTeamsWithStandings(divisionId);
    const bottom = teams
      .filter((t: any) => t.position !== null)
      .sort((a: any, b: any) => ((b.position || 0) - (a.position || 0)))
      .slice(0, teamCount);

    if (bottom.length === 0) throw new ConflictError('No ranked teams to relegate', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);

    const pool = getPool();
    const [lowerDivisions] = await pool.query<RowData>(
      'SELECT * FROM league_divisions WHERE league_id = (SELECT league_id FROM league_divisions WHERE id = ?) AND tier > ? ORDER BY tier ASC LIMIT 1',
      [divisionId, d.tier],
    );

    if (!lowerDivisions.length) throw new ConflictError('No lower tier division to relegate to', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
    const targetDivisionId = (lowerDivisions[0] as any).id;

    for (const team of bottom) {
      await pool.query('UPDATE league_teams SET division_id = ? WHERE id = ?', [targetDivisionId, team.team_id]);
    }
  }
}

export const divisionService = new DivisionService();
