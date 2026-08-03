import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

export interface ProfessionalProfileInput {
  bio?: string | null;
  experienceYears?: number | null;
  certifications?: string[] | null;
  sports?: number[] | null;
  isAvailable?: boolean;
}

// Canonical shared professional attributes — truly universal across all
// professional actors (Coach, Referee, Trainer, Physiotherapist, …).
// Pricing and service configuration lives in `professional_services`;
// actor-specific lifecycle lives in each actor's identity table.
export const PROFESSIONAL_PROFILE_COLUMNS = [
  'professional_bio',
  'experience_years',
  'certifications',
  'sports',
  'rating_avg',
  'rating_count',
  'is_available',
] as const;

// SELECT fragment aliasing `professional_bio` → `bio` for backwards
// compatibility with all existing Coach/Referee response shapes.
export const PROFESSIONAL_PROFILE_SELECT = `
  pp.professional_bio AS bio,
  pp.experience_years, pp.certifications, pp.sports,
  pp.rating_avg, pp.rating_count, pp.is_available`;

const INPUT_TO_COLUMN: Record<keyof ProfessionalProfileInput, string> = {
  bio: 'professional_bio',
  experienceYears: 'experience_years',
  certifications: 'certifications',
  sports: 'sports',
  isAvailable: 'is_available',
};

function serialize(value: any, column: string): any {
  if (['certifications', 'sports'].includes(column)) {
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
  async upsertByUserId(userId: number, data: Partial<ProfessionalProfileInput>): Promise<boolean> {
    const entries = Object.entries(data).filter(([, v]) => v !== undefined);
    if (!entries.length) return false;
    const fields = entries.map(([k, v]) => ({
      column: INPUT_TO_COLUMN[k as keyof ProfessionalProfileInput],
      value: serialize(v, INPUT_TO_COLUMN[k as keyof ProfessionalProfileInput]),
    }));
    const { setSql, params } = buildSet(fields);
    const pool = getPool();
    const values = [userId, ...params, ...params];
    const [result] = await pool.execute(
      `INSERT INTO professional_profiles (user_id, ${fields.map((f) => f.column).join(', ')})
       VALUES (?, ${fields.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${setSql}`,
      values,
    );
    return (result as any).affectedRows > 0;
  },

  async findByUserId(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT id, user_id, professional_bio AS bio, experience_years, certifications, sports,
              rating_avg, rating_count, is_available, created_at, updated_at
       FROM professional_profiles WHERE user_id = ? LIMIT 1`,
      [userId],
    );
    return rows[0] || null;
  },

  async findByCoachProfileId(coachId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT professional_bio AS bio, pp.experience_years, pp.certifications, pp.sports,
              pp.rating_avg, pp.rating_count, pp.is_available
       FROM professional_profiles pp
       JOIN coach_profiles cp ON cp.user_id = pp.user_id
       WHERE cp.id = ? LIMIT 1`,
      [coachId],
    );
    return rows[0] || null;
  },

  async getProfileIdByCoachProfileId(coachId: number): Promise<number | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT pp.id FROM professional_profiles pp
       JOIN coach_profiles cp ON cp.user_id = pp.user_id
       WHERE cp.id = ? LIMIT 1`,
      [coachId],
    );
    return rows.length ? (rows[0] as any).id : null;
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
    const values = [...params, coachId];
    const [result] = await pool.execute(
      `UPDATE professional_profiles pp
       JOIN coach_profiles cp ON cp.user_id = pp.user_id
       SET ${setSql}
       WHERE cp.id = ?`,
      values,
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
