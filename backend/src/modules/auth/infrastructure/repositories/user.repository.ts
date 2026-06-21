import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export interface UserRecord {
  id: number;
  public_id: string;
  country_id: number;
  phone_number: string;
  full_phone: string;
  email: string;
  password_hash: string;
  full_name: string;
  avatar_url: string | null;
  gender: 'male' | 'female';
  birth_date: string | null;
  language_id: number | null;
  timezone: string;
  dark_mode: 'light' | 'dark' | 'system';
  account_status: string;
  is_phone_verified: boolean;
  is_email_verified: boolean;
  last_login_at: string | null;
  last_login_ip: string | null;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  main_sport_id: number | null;
  main_level_id: number | null;
  is_coach: boolean;
  is_seller: boolean;
  language_code?: string | null;
  coach_status?: string;
}

export class UserRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async findByPhoneWithStatus(fullPhone: string): Promise<{ id: number; account_status: string; deleted_at: string | null } | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT id, account_status, deleted_at FROM users WHERE full_phone = ?`,
      [fullPhone]
    );
    return rows.length ? rows[0] as any : null;
  }

  async findByEmailWithStatus(email: string): Promise<{ id: number; account_status: string; deleted_at: string | null } | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT id, account_status, deleted_at FROM users WHERE email = ?`,
      [email]
    );
    return rows.length ? rows[0] as any : null;
  }

  async setAccountSuspended(id: number): Promise<void> {
    await this.pool.execute(
      `UPDATE users SET account_status = 'suspended', deleted_at = NULL WHERE id = ?`,
      [id]
    );
  }

  async findByPhone(fullPhone: string): Promise<UserRecord | null> {
    const [rows] = await this.pool.execute<(UserRecord & { main_sport_id: number | null; main_level_id: number | null; is_coach: number; is_seller: number })[]>(
      `SELECT u.*, pp.main_sport_id, pp.main_level_id, pp.is_seller,
              (cp.status = 'approved') AS is_coach, COALESCE(cp.status, 'none') AS coach_status,
              c.default_currency, c.currency_symbol, l.code AS language_code
       FROM users u
       LEFT JOIN player_profiles pp ON pp.user_id = u.id
       LEFT JOIN coach_profiles cp ON cp.user_id = u.id AND cp.deleted_at IS NULL
       LEFT JOIN countries c ON c.id = u.country_id
       LEFT JOIN languages l ON l.id = u.language_id
       WHERE u.full_phone = ? AND u.deleted_at IS NULL`,
      [fullPhone]
    );
    return rows.length ? this.mapUser(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT u.*, pp.main_sport_id, pp.main_level_id, pp.is_seller,
              (cp.status = 'approved') AS is_coach, COALESCE(cp.status, 'none') AS coach_status,
              c.default_currency, c.currency_symbol, l.code AS language_code
       FROM users u
       LEFT JOIN player_profiles pp ON pp.user_id = u.id
       LEFT JOIN coach_profiles cp ON cp.user_id = u.id AND cp.deleted_at IS NULL
       LEFT JOIN countries c ON c.id = u.country_id
       LEFT JOIN languages l ON l.id = u.language_id
       WHERE u.email = ? AND u.deleted_at IS NULL`,
      [email]
    );
    return rows.length ? this.mapUser(rows[0]) : null;
  }

  async findById(id: number): Promise<UserRecord | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT u.*, pp.main_sport_id, pp.main_level_id, pp.is_seller,
              (cp.status = 'approved') AS is_coach, COALESCE(cp.status, 'none') AS coach_status,
              c.default_currency, c.currency_symbol, l.code AS language_code
       FROM users u
       LEFT JOIN player_profiles pp ON pp.user_id = u.id
       LEFT JOIN coach_profiles cp ON cp.user_id = u.id AND cp.deleted_at IS NULL
       LEFT JOIN countries c ON c.id = u.country_id
       LEFT JOIN languages l ON l.id = u.language_id
       WHERE u.id = ? AND u.deleted_at IS NULL`,
      [id]
    );
    return rows.length ? this.mapUser(rows[0]) : null;
  }

  async create(data: {
    publicId: string;
    countryId: number;
    phoneNumber: string;
    fullPhone: string;
    email: string;
    passwordHash: string;
    fullName: string;
    gender: 'male' | 'female';
    birthDate: string | null;
    languageId: number | null;
    timezone: string;
    darkMode: 'light' | 'dark' | 'system';
  }): Promise<number> {
    const [result] = await this.pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash,
        full_name, gender, birth_date, language_id, timezone, dark_mode, is_phone_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [data.publicId, data.countryId, data.phoneNumber, data.fullPhone, data.email,
       data.passwordHash, data.fullName, data.gender, data.birthDate,
       data.languageId, data.timezone, data.darkMode]
    );
    return result.insertId;
  }

  async createPlayerProfile(userId: number, mainSportId: number | null, mainLevelId: number | null): Promise<void> {
    await this.pool.execute(
      `INSERT INTO player_profiles (user_id, main_sport_id, main_level_id)
       VALUES (?, ?, ?)`,
      [userId, mainSportId, mainLevelId]
    );
  }

  async createWallet(userId: number, currencyCode?: string): Promise<void> {
    let code: string;
    if (!currencyCode) {
      const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
        `SELECT c.default_currency FROM users u
         JOIN countries c ON c.id = u.country_id
         WHERE u.id = ?`,
        [userId]
      );
      code = (rows[0] as any)?.default_currency || 'EGP';
    } else {
      code = currencyCode;
    }
    await this.pool.execute(
      `INSERT INTO user_wallets (user_id, balance, currency_code)
       VALUES (?, 0.00, ?)`,
      [userId, code]
    );
  }

  async updateLastLogin(id: number, ip: string | null): Promise<void> {
    await this.pool.execute(
      `UPDATE users SET last_login_at = NOW(), last_login_ip = ? WHERE id = ?`,
      [ip, id]
    );
  }

  async update(id: number, data: Record<string, any>): Promise<void> {
    const allowed = ['full_name', 'email', 'gender', 'birth_date', 'timezone', 'dark_mode', 'language_id', 'avatar_url', 'is_public'];
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (allowed.includes(k) && v !== undefined) {
        sets.push(`${k} = ?`);
        vals.push(v);
      }
    }
    if (!sets.length) return;
    vals.push(id);
    await this.pool.execute(
      `UPDATE users SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      vals
    );
  }

  async updatePlayerProfile(userId: number, data: { mainSportId?: number | null; mainLevelId?: number | null }): Promise<void> {
    const cols: string[] = ['user_id'];
    const vals: any[] = [userId];
    const updates: string[] = [];
    if (data.mainSportId !== undefined) { cols.push('main_sport_id'); vals.push(data.mainSportId); updates.push('main_sport_id = VALUES(main_sport_id)'); }
    if (data.mainLevelId !== undefined) { cols.push('main_level_id'); vals.push(data.mainLevelId); updates.push('main_level_id = VALUES(main_level_id)'); }
    if (!updates.length) return;
    const placeholders = cols.map(() => '?').join(', ');
    await this.pool.execute(
      `INSERT INTO player_profiles (${cols.join(', ')})
       VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE ${updates.join(', ')}`,
      vals
    );
  }

  async createResetToken(userId: number, token: string, expiresAt: Date): Promise<void> {
    await this.pool.execute(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
      [userId, token, expiresAt]
    );
  }

  async findResetToken(token: string): Promise<{ user_id: number; expires_at: string; used_at: string | null } | null> {
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT user_id, expires_at, used_at FROM password_reset_tokens WHERE token = ?`,
      [token]
    );
    return rows.length ? (rows[0] as any) : null;
  }

  async markResetTokenUsed(token: string): Promise<void> {
    await this.pool.execute(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE token = ?`,
      [token]
    );
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    await this.pool.execute(
      `UPDATE users SET password_hash = ?, version = version + 1 WHERE id = ? AND deleted_at IS NULL`,
      [passwordHash, userId]
    );
  }

  async assignPlayerRole(userId: number): Promise<void> {
    await this.pool.execute(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES (?, (SELECT id FROM roles WHERE slug = 'player' LIMIT 1))
       ON DUPLICATE KEY UPDATE is_active = TRUE`,
      [userId]
    );
  }

  async countryHasPhoneCode(countryId: number, phoneCode: string): Promise<boolean> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT COUNT(*) as cnt FROM countries WHERE id = ? AND phone_code = ?`,
      [countryId, phoneCode]
    );
    return rows[0].cnt > 0;
  }

  async getCountryPhoneCode(countryId: number): Promise<string | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT phone_code FROM countries WHERE id = ?`,
      [countryId]
    );
    return rows.length ? rows[0].phone_code : null;
  }

  async getSportInterestIds(userId: number): Promise<number[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT sport_id FROM player_sport_interests WHERE user_id = ? ORDER BY sport_id`,
      [userId]
    );
    return (rows as { sport_id: number }[]).map((r) => r.sport_id);
  }

  async setSportInterestIds(userId: number, sportIds: number[]): Promise<void> {
    await this.pool.execute(`DELETE FROM player_sport_interests WHERE user_id = ?`, [userId]);
    if (!sportIds.length) return;
    const values = sportIds.map(() => '(?, ?)').join(', ');
    const params = sportIds.flatMap((sportId) => [userId, sportId]);
    await this.pool.execute(
      `INSERT INTO player_sport_interests (user_id, sport_id) VALUES ${values}`,
      params
    );
  }

  async markWelcomeSeen(userId: number): Promise<void> {
    await this.pool.execute(
      `UPDATE users SET has_seen_welcome = 1 WHERE id = ?`,
      [userId]
    );
  }

  async getPlayerProfileFull(userId: number) {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT pp.main_sport_id, s.name AS main_sport_name, pp.main_level_id,
              pp.is_seller, pp.coach_status
       FROM player_profiles pp
       LEFT JOIN sports s ON s.id = pp.main_sport_id
       WHERE pp.user_id = ?`,
      [userId]
    );
    if (!rows.length) return null;
    const profile = rows[0] as any;
    const interestedSportIds = await this.getSportInterestIds(userId);
    const interestedSports: { id: number; name: string }[] = [];
    if (interestedSportIds.length) {
      const placeholders = interestedSportIds.map(() => '?').join(', ');
      const [sportRows] = await this.pool.execute<RowData>(
        `SELECT id, name FROM sports WHERE id IN (${placeholders}) AND is_active = TRUE AND deleted_at IS NULL`,
        interestedSportIds
      );
      for (const row of sportRows as any[]) {
        interestedSports.push({ id: row.id, name: row.name });
      }
    }
    return {
      mainSportId: profile.main_sport_id,
      mainSportName: profile.main_sport_name || null,
      mainLevelId: profile.main_level_id,
      isSeller: Boolean(profile.is_seller),
      coachStatus: profile.coach_status || 'none',
      interestedSports,
    };
  }

  private mapUser(row: any): UserRecord {
    return {
      ...row,
      is_coach: Boolean(row.is_coach),
      is_seller: Boolean(row.is_seller),
      is_phone_verified: Boolean(row.is_phone_verified),
      is_email_verified: Boolean(row.is_email_verified),
    };
  }
}

export const userRepository = new UserRepository();
