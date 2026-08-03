import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

export interface ServiceInput {
  professionalProfileId: number;
  actorType: string;
  actorId: number;
  serviceKey: string;
  label?: string | null;
  pricingModel: 'hourly' | 'session' | 'match' | 'fixed' | 'package' | 'consultation';
  price: number;
  currencyCode: string;
  durationMinutes?: number | null;
  isActive?: boolean;
  sortOrder?: number;
}

/** SQL fragment exposing pricing data under backwards-compatible column aliases
 *  (hourly_rate, currency_code) so existing Coach queries keep working. */
export const PROFESSIONAL_SERVICE_PRICE_SELECT = `
  ps.price AS hourly_rate,
  ps.currency_code`;

export const professionalServiceRepository = {
  async upsertService(input: ServiceInput): Promise<number> {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO professional_services
         (professional_profile_id, actor_type, actor_id, service_key, label,
          pricing_model, price, currency_code, duration_minutes, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         label = VALUES(label),
         pricing_model = VALUES(pricing_model),
         price = VALUES(price),
         currency_code = VALUES(currency_code),
         duration_minutes = VALUES(duration_minutes),
         is_active = VALUES(is_active),
         sort_order = VALUES(sort_order)`,
      [
        input.professionalProfileId, input.actorType, input.actorId,
        input.serviceKey, input.label ?? null, input.pricingModel,
        input.price, input.currencyCode, input.durationMinutes ?? null,
        input.isActive !== false ? 1 : 0, input.sortOrder ?? 0,
      ],
    );
    return (result as any).insertId;
  },

  /** Upsert the 'default' hourly service — used by the legacy coach profile
   *  update/create paths for backward compatibility. */
  async upsertDefaultCoachService(professionalProfileId: number, coachId: number, data: {
    price?: number; currencyCode?: string; sessionDurations?: number[];
  }): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO professional_services
         (professional_profile_id, actor_type, actor_id, service_key, pricing_model,
          price, currency_code, duration_minutes, is_active)
       VALUES (?, 'coach', ?, 'default', 'hourly', ?, ?, NULL, ?)
       ON DUPLICATE KEY UPDATE
         price = VALUES(price),
         currency_code = VALUES(currency_code),
         is_active = VALUES(is_active)`,
      [
        professionalProfileId, coachId,
        data.price ?? 0,
        data.currencyCode ?? 'EGP',
        data.price !== undefined && data.price > 0 ? 1 : 0,
      ],
    );
    // Store individual session-duration services alongside the default
    if (data.sessionDurations?.length) {
      for (const duration of data.sessionDurations) {
        await pool.execute(
          `INSERT INTO professional_services
             (professional_profile_id, actor_type, actor_id, service_key, pricing_model,
              price, currency_code, duration_minutes, is_active, label)
           VALUES (?, 'coach', ?, ?, 'session', ?, ?, ?, 1, ?)
           ON DUPLICATE KEY UPDATE
             price = VALUES(price),
             currency_code = VALUES(currency_code),
             duration_minutes = VALUES(duration_minutes),
             is_active = 1`,
          [
            professionalProfileId, coachId,
            `session_${duration}min`,
            data.price ? Math.round(data.price * duration / 60 * 100) / 100 : 0,
            data.currencyCode ?? 'EGP',
            duration,
            `${duration}-min Session`,
          ],
        );
      }
    }
  },

  async getDefaultService(actorType: string, actorId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM professional_services
       WHERE actor_type = ? AND actor_id = ? AND service_key = 'default' AND is_active = 1
       LIMIT 1`,
      [actorType, actorId],
    );
    return rows[0] || null;
  },

  async getSessionDurations(actorType: string, actorId: number): Promise<number[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT duration_minutes FROM professional_services
       WHERE actor_type = ? AND actor_id = ? AND pricing_model = 'session' AND is_active = 1
       ORDER BY duration_minutes`,
      [actorType, actorId],
    );
    return rows.map((r: any) => r.duration_minutes).filter(Boolean);
  },
};
