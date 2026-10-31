import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('failover');

/** Preference JSON can be corrupted by manual edits; never let that break dispatch. */
function parseChannelList(value: unknown): string[] | null {
  if (!value) return null;
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as string[]) : null;
    } catch {
      log.warn({ value }, 'Malformed channel preference JSON ignored');
      return null;
    }
  }
  return null;
}

export async function getFailoverChain(
  userId: number,
  categorySlug: string,
): Promise<string[] | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT failover_enabled, failover_chain FROM user_channel_preferences
     WHERE user_id = ? AND category_slug = ? AND is_active = TRUE
     LIMIT 1`,
    [userId, categorySlug],
  );

  if (!rows.length) return null;

  const pref = rows[0] as any;
  if (!pref.failover_enabled) return null;

  return parseChannelList(pref.failover_chain);
}

export async function getChannelPreferences(
  userId: number,
  categorySlug: string,
): Promise<{ channels: string[]; failoverEnabled: boolean; failoverChain: string[] | null }> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT channels, failover_enabled, failover_chain FROM user_channel_preferences
     WHERE user_id = ? AND category_slug = ? AND is_active = TRUE
     LIMIT 1`,
    [userId, categorySlug],
  );

  if (!rows.length) {
    return { channels: ['in_app'], failoverEnabled: false, failoverChain: null };
  }

  const pref = rows[0] as any;
  const parsedChannels = parseChannelList(pref.channels);
  const channels: string[] = parsedChannels && parsedChannels.length ? parsedChannels : ['in_app'];

  const failoverChain: string[] | null = pref.failover_enabled
    ? parseChannelList(pref.failover_chain)
    : null;

  return { channels, failoverEnabled: !!pref.failover_enabled, failoverChain };
}

export async function getEffectiveChannels(
  userId: number,
  categorySlug: string,
  fallbackChannels: string[] = ['in_app'],
): Promise<string[]> {
  const prefs = await getChannelPreferences(userId, categorySlug);

  const channels = prefs.channels.length ? prefs.channels : fallbackChannels;

  if (!prefs.failoverEnabled || !prefs.failoverChain?.length) {
    return channels;
  }

  const merged = new Set<string>([...channels, ...prefs.failoverChain]);
  return Array.from(merged);
}
