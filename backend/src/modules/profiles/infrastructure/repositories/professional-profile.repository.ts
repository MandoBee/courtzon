import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

export interface ProfessionalProfileInput {
  bio?: string | null;
  experienceYears?: number | null;
  certifications?: string[] | null;
  sports?: number[] | null;
  hourlyRate?: number | null;
  currencyCode?: string | null;
  sessionDurations?: number[] | null;
  isAvailable?: boolean;
}

// Shared professional attributes — the single source of truth for every
// professional actor (coach, referee, …). Actor identity lives in the
// actor-specific table (coach_profiles / referees); these columns are shared.
export const PROFESSIONAL_PROFILE_COLUMNS = [
  'bio',
  'experience_years',
  'certifications',
  'sports',
  'hourly_rate',
  'currency_code',
  'session_durations',
  'rating_avg',
  'rating_count',
  'is_available',
] as const;

export type ProfessionalProfileColumn = (typeof PROFESSIONAL_PROFILE_COLUMNS)[number];

// SELECT fragment exposing shared profile columns under their canonical names
// (used when joining professional_profiles onto an actor table).
export const PROFESSIONAL_PROFILE_SELECT = `
  pp.bio, pp.experience_years, pp.certifications, pp.sports,
  pp.hourly_rate, pp.currency_code, pp.session_durations,
  pp.rating_avg, pp.rating_count, pp.is_available`;

const INPUT_TO_COLUMN: Record<keyof ProfessionalProfileInput, string> = {
  bio: 'bio',
  experienceYears: 'experience_years',
  certifications: 'certifications',
  sports: 'sports',
  hourlyRate: 'hourly_rate',
  currencyCode: 'currency_code',
  sessionDurations: 'session_durations',
  isAvailable: 'is_available',
};

function serialize(value: any, column: string): any {
  if (['certifications', 'sports', 'session_durations'].includes(column)) {
    if (value === undefined || value === null) return null;
    return JSON.stringify(value);
  }
  return value ?? null;
}

function buildSet(fields: { column: string; value: any }[]): { setSql: string; params: any[] } {
  const setSql = fields.map((f) => `${f.column} = ?`).join(', ');
  const params = fields.map((f) => f.value);
  return { setSql, params };
}

export function isProfessionalProfileKey(key: string): key is keyof ProfessionalProfileInput {
  return key in INPUT_TO_COLUMN;
}

export const professionalProfileRepository = {
  /** Upsert the shared professional attributes for a user (identity stays in the actor table). */
  async upsertByUserId(userId: number, data: Partial<ProfessionalProfileInput>): Promise<boolean> {
    const entries = Object.entries(data).filter(([, v]) => v !== undefined);
    if (!entries.length) return false;
    const fields = entries.map(([k, v]) => ({
      column: INPUT_TO_COLUMN[k as keyof ProfessionalProfileInput],
      value: serialize(v, INPUT_TO_COLUMN[k as keyof ProfessionalProfileInput]),
    }));
    const { setSql, params } = buildSet(fields);
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO professional_profiles (user_id, ${fields.map((f) => f.column).join(', ')})
       VALUES (?, ${fields.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${setSql}`,
      [userId, ...params, ...params],
    );
    return (result as any).affectedRows > 0;
  },

  async findByUserId(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM professional_profiles WHERE user_id = ? LIMIT 1`,
      [userId],
    );
    return rows[0] || null;
  },

  async findByCoachProfileId(coachId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT pp.* FROM professional_profiles pp
       JOIN coach_profiles cp ON cp.user_id = pp.user_id
       WHERE cp.id = ? LIMIT 1`,
      [coachId],
    );
    return rows[0] || null;
  },

  async updateByCoachProfileId(coachId: number, data: Partial<ProfessionalProfileInput>): Promise<boolean> {
    const entries = Object.entries(data).filter(([, v]) => v !== undefined);
    if (!entries.length) return false;
    const fields = entries.map(([k, v]) => ({
      column: INPUT_TO_COLUMN[k as keyof ProfessionalProfileInput],
      value: serialize(v, INPUT_TO_COLUMN[k as keyof ProfessionalProfileInput]),
    }));
    const { setSql, params } = buildSet(fields);
    const pool = getPool();
    const [result] = await pool.execute(
      `UPDATE professional_profiles pp
       JOIN coach_profiles cp ON cp.user_id = pp.user_id
       SET ${setSql}
       WHERE cp.id = ?`,
      [...params, coachId],
    );
    return (result as any).affectedRows > 0;
  },

  async setAvailabilityByUserId(userId: number, isAvailable: boolean): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO professional_profiles (user_id, is_available)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE is_available = VALUES(is_available)`,
      [userId, isAvailable ? 1 : 0],
    );
  },

  async setAvailabilityByCoachProfileId(coachId: number, isAvailable: boolean): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `UPDATE professional_profiles pp
       JOIN coach_profiles cp ON cp.user_id = pp.user_id
       SET pp.is_available = ?
       WHERE cp.id = ?`,
      [isAvailable ? 1 : 0, coachId],
    );
  },
};
