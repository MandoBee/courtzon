import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';

interface RateLimitConfig {
  maxCount: number;
  windowSeconds: number;
}

const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  bookings: { maxCount: 10, windowSeconds: 60 },
  payments: { maxCount: 10, windowSeconds: 60 },
  reminders: { maxCount: 5, windowSeconds: 300 },
  system: { maxCount: 20, windowSeconds: 60 },
  marketplace: { maxCount: 15, windowSeconds: 60 },
  security: { maxCount: 3, windowSeconds: 300 },
  default: { maxCount: 30, windowSeconds: 60 },
};

function getConfig(categorySlug: string): RateLimitConfig {
  return DEFAULT_CONFIGS[categorySlug] ?? DEFAULT_CONFIGS.default;
}

export async function checkRateLimit(
  userId: number,
  categorySlug: string,
): Promise<{ allowed: boolean; retryAfter?: number; remaining?: number }> {
  const config = getConfig(categorySlug);
  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowSeconds * 1000);

  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(count), 0) as total FROM notification_rate_limits
     WHERE user_id = ? AND category_slug = ?
     AND window_start >= ?`,
    [userId, categorySlug, windowStart],
  );

  const total = rows[0]?.total ?? 0;
  const remaining = config.maxCount - total;

  if (remaining <= 0) {
    const retryAfter = await getEarliestWindowExpiry(userId, categorySlug, config.windowSeconds);
    return { allowed: false, retryAfter: Math.max(1, retryAfter), remaining: 0 };
  }

  return { allowed: true, remaining };
}

async function getEarliestWindowExpiry(
  userId: number,
  categorySlug: string,
  windowSeconds: number,
): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT window_start FROM notification_rate_limits
     WHERE user_id = ? AND category_slug = ?
     ORDER BY window_start ASC LIMIT 1`,
    [userId, categorySlug],
  );
  if (!rows.length) return windowSeconds;

  const windowStart = rows[0].window_start as Date;
  const expiresAt = new Date(windowStart.getTime() + windowSeconds * 1000);
  return Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
}

export async function incrementRateLimit(
  userId: number,
  categorySlug: string,
  eventName: string = 'default',
): Promise<void> {
  const config = getConfig(categorySlug);
  const now = new Date();
  const windowStart = new Date(now.getTime() - (now.getTime() % (config.windowSeconds * 1000)));

  const pool = getPool();
  await pool.execute(
    `INSERT INTO notification_rate_limits
     (user_id, category_slug, event_name, count, window_start)
     VALUES (?, ?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE count = count + 1`,
    [userId, categorySlug, eventName, windowStart],
  );
}
