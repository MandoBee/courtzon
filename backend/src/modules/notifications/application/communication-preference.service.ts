import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export const communicationPreferenceService = {
  async get(userId: number) {
    const pool = getPool();

    const [types] = await pool.execute<RowDataPacket[]>(
      `SELECT id, code, event_key, name, category, priority, default_channels
       FROM notification_types
       WHERE enabled = 1
       ORDER BY sort_order`,
    );

    const [prefs] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM user_notification_preferences WHERE user_id = ?`,
      [userId],
    );

    const prefMap = new Map<number, any>();
    for (const p of prefs) {
      prefMap.set(p.category_id, p);
    }

    const [channelPrefs] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM user_channel_preferences WHERE user_id = ?`,
      [userId],
    );

    const channelPrefMap = new Map<string, any>();
    for (const cp of channelPrefs) {
      const channels = typeof cp.channels === 'string' ? JSON.parse(cp.channels) : cp.channels;
      channelPrefMap.set(cp.category_slug, {
        ...cp,
        channels,
      });
    }

    const preferences = types.map((type: any) => {
      const userPref = prefMap.get(type.id);
      const defaultChannels = typeof type.default_channels === 'string'
        ? JSON.parse(type.default_channels)
        : type.default_channels;

      return {
        notification_type_id: type.id,
        code: type.code,
        event_key: type.event_key,
        name: type.name,
        category: type.category,
        priority: type.priority,
        channels: channelPrefMap.get(type.category)?.channels ?? defaultChannels,
        is_allowed: userPref ? Boolean(userPref.is_allowed) : true,
        push_enabled: userPref ? Boolean(userPref.push_enabled) : defaultChannels.includes('push'),
        email_enabled: userPref ? Boolean(userPref.email_enabled) : defaultChannels.includes('email'),
        sms_enabled: userPref ? Boolean(userPref.sms_enabled) : defaultChannels.includes('sms'),
      };
    });

    const [quietHours] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM user_quiet_hours WHERE user_id = ? AND is_active = 1 ORDER BY weekday`,
      [userId],
    );

    return {
      preferences,
      quiet_hours: quietHours,
    };
  },

  async update(
    userId: number,
    preferences: Array<{
      notification_type_id: number;
      is_allowed?: boolean;
      push_enabled?: boolean;
      email_enabled?: boolean;
      sms_enabled?: boolean;
      channels?: string[];
    }>,
  ) {
    const pool = getPool();

    for (const pref of preferences) {
      if (pref.channels) {
        const [typeRows] = await pool.execute<RowDataPacket[]>(
          'SELECT category FROM notification_types WHERE id = ?',
          [pref.notification_type_id],
        );
        if (typeRows.length) {
          const category = (typeRows[0] as any).category;
          await pool.execute(
            `INSERT INTO user_channel_preferences (user_id, category_slug, channels, is_active)
             VALUES (?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE channels = VALUES(channels)`,
            [userId, category, JSON.stringify(pref.channels)],
          );
        }
      }

      await pool.execute(
        `INSERT INTO user_notification_preferences (user_id, category_id, is_allowed, push_enabled, email_enabled, sms_enabled)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE is_allowed = VALUES(is_allowed), push_enabled = VALUES(push_enabled),
         email_enabled = VALUES(email_enabled), sms_enabled = VALUES(sms_enabled)`,
        [
          userId,
          pref.notification_type_id,
          pref.is_allowed !== undefined ? (pref.is_allowed ? 1 : 0) : 1,
          pref.push_enabled !== undefined ? (pref.push_enabled ? 1 : 0) : 1,
          pref.email_enabled !== undefined ? (pref.email_enabled ? 1 : 0) : 0,
          pref.sms_enabled !== undefined ? (pref.sms_enabled ? 1 : 0) : 0,
        ],
      );
    }

    return this.get(userId);
  },

  async getQuietHours(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM user_quiet_hours WHERE user_id = ? AND is_active = 1 ORDER BY weekday`,
      [userId],
    );
    return rows;
  },

  async upsertQuietHours(
    userId: number,
    data: {
      weekday?: string | null;
      start_time: string;
      end_time: string;
      timezone?: string;
    },
  ) {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO user_quiet_hours (user_id, weekday, start_time, end_time, timezone, is_active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE start_time = VALUES(start_time), end_time = VALUES(end_time),
       timezone = VALUES(timezone), is_active = 1`,
      [
        userId,
        data.weekday ?? null,
        data.start_time,
        data.end_time,
        data.timezone ?? 'UTC',
      ],
    );

    return this.getQuietHours(userId);
  },
};
