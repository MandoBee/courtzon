import { getPool } from '../../../database/mysql.js';
import type { ResourceProvider, TimeSlot, ResourceCapabilities, LocationInfo } from '../types.js';

type RowData = import('mysql2').RowDataPacket[];

const TERMINAL_STATUSES = ['completed', 'cancelled', 'walkover'];

export class RefereeProvider implements ResourceProvider {
  readonly resourceType = 'referee';
  readonly entityId: number;

  /** @param refereeId identity of the `referees` row (independent of Coach). */
  constructor(refereeId: number) {
    this.entityId = refereeId;
  }

  async getAvailableSlots(date: string, dayOfWeek: number): Promise<TimeSlot[]> {
    const pool = getPool();
    const [availRows] = await pool.execute<RowData>(
      'SELECT * FROM referee_availability WHERE referee_id = ? AND day_of_week = ? ORDER BY start_time',
      [this.entityId, dayOfWeek],
    );
    if (!availRows.length) return [];

    const [blackoutRows] = await pool.execute<RowData>(
      'SELECT 1 FROM referee_availability_blackouts WHERE referee_id = ? AND blackout_date = ? LIMIT 1',
      [this.entityId, date],
    );
    if (blackoutRows.length) return [];

    const [tournamentMatches] = await pool.execute<RowData>(
      `SELECT start_time, end_time FROM tournament_matches
       WHERE referee_id = ? AND DATE(start_time) = ? AND status NOT IN (${TERMINAL_STATUSES.map(() => '?').join(',')})`,
      [this.entityId, date, ...TERMINAL_STATUSES],
    );
    const [leagueMatches] = await pool.execute<RowData>(
      `SELECT start_time, end_time FROM league_matches
       WHERE referee_id = ? AND match_date = ? AND status NOT IN (${TERMINAL_STATUSES.map(() => '?').join(',')})`,
      [this.entityId, date, ...TERMINAL_STATUSES],
    );
    const existingSlots = [...tournamentMatches, ...leagueMatches];

    const available: TimeSlot[] = [];
    for (const slot of availRows) {
      const slotStart = String(slot.start_time).slice(0, 5);
      const slotEnd = String(slot.end_time).slice(0, 5);
      const hasConflict = existingSlots.some((s: any) => {
        const sStart = String(s.start_time).slice(11, 16);
        const sEnd = String(s.end_time).slice(11, 16);
        return sStart < slotEnd && sEnd > slotStart;
      });
      if (!hasConflict) {
        available.push({ startTime: slotStart, endTime: slotEnd });
      }
    }
    return available;
  }

  async hasConflict(startTime: string, endTime: string, date: string): Promise<boolean> {
    const existingSlots = await this.getExistingMatchesOnDate(date);
    return existingSlots.some((s: any) => {
      const sStart = String(s.start_time).slice(11, 16);
      const sEnd = String(s.end_time).slice(11, 16);
      return sStart < endTime && sEnd > startTime;
    });
  }

  async getCapabilities(): Promise<ResourceCapabilities> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT pp.sports, pp.experience_years, pp.certifications,
              ps.price AS hourly_rate, ps.currency_code
       FROM referees r
       LEFT JOIN professional_profiles pp ON pp.user_id = r.user_id
       LEFT JOIN professional_services ps ON ps.professional_profile_id = pp.id
         AND ps.service_key = 'referee_default' AND ps.is_active = 1
       WHERE r.id = ?`,
      [this.entityId],
    );
    if (!rows.length) return { sportIds: [] };
    const p = rows[0];
    let sportIds: number[] = [];
    if (p.sports) {
      try { sportIds = typeof p.sports === 'string' ? JSON.parse(p.sports) : p.sports; }
      catch { sportIds = []; }
    }
    return {
      sportIds,
      experienceYears: p.experience_years ?? undefined,
      hourlyRate: p.hourly_rate ? Number(p.hourly_rate) : undefined,
      currencyCode: p.currency_code ?? undefined,
    };
  }

  async getLocation(): Promise<LocationInfo | null> {
    return null;
  }

  async isAvailable(): Promise<boolean> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT pp.is_available
       FROM referees r
       LEFT JOIN professional_profiles pp ON pp.user_id = r.user_id
       WHERE r.id = ? AND r.status = ?`,
      [this.entityId, 'approved'],
    );
    return rows.length > 0 && rows[0].is_available === 1;
  }

  private async getExistingMatchesOnDate(date: string): Promise<any[]> {
    const pool = getPool();
    const [tournamentMatches] = await pool.execute<RowData>(
      `SELECT start_time, end_time FROM tournament_matches
       WHERE referee_id = ? AND DATE(start_time) = ? AND status NOT IN (${TERMINAL_STATUSES.map(() => '?').join(',')})`,
      [this.entityId, date, ...TERMINAL_STATUSES],
    );
    const [leagueMatches] = await pool.execute<RowData>(
      `SELECT start_time, end_time FROM league_matches
       WHERE referee_id = ? AND match_date = ? AND status NOT IN (${TERMINAL_STATUSES.map(() => '?').join(',')})`,
      [this.entityId, date, ...TERMINAL_STATUSES],
    );
    return [...tournamentMatches, ...leagueMatches];
  }
}
