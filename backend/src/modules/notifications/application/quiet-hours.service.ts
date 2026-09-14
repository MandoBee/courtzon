import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { TimeEngine } from '../../time/index.js';
import { getPlatformTimezone } from '../../../shared/utils/business-date.js';

const log = createModuleLogger('quiet-hours');

const DAY_MAP: Record<number, string> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
};

/**
 * Evaluate whether the user is inside a quiet-hours window RIGHT NOW.
 *
 * Timezone semantics: `user_quiet_hours.timezone` (persisted by the
 * communication-preference service) is the authoritative zone the user's
 * window wall-clock times are expressed in. It was previously ignored — the
 * evaluation used server-local getters, which resolve to UTC inside the Docker
 * container and silently shift Cairo windows by 2-3h. We now convert the UTC
 * instant into the stored timezone via TimeEngine (DST-safe) before comparing
 * weekday + wall-clock windows, and compute `resumeAt` (the delay in ms until
 * the window ends) by converting the local end time back to UTC.
 *
 * The overnight-wrap policy is preserved: a window whose end_time is not after
 * start_time does not match (same-day windows only, unchanged from prior code).
 */
export async function isInQuietHours(userId: number): Promise<{
  inQuietHours: boolean;
  resumeAt?: number;
}> {
  const pool = getPool();

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM user_quiet_hours
     WHERE user_id = ? AND is_active = TRUE`,
    [userId],
  );
  if (!rows.length) return { inQuietHours: false };

  // Resolve the timezone: per-row timezone wins, else platform default.
  const tz: string = (rows[0] as any)?.timezone || (await getPlatformTimezone());
  const now = new Date();

  let localDate: string;
  let localTime: string;
  try {
    const local = TimeEngine.utcToLocal(now.toISOString(), tz);
    localDate = local.date;
    localTime = local.time; // "HH:mm"
  } catch {
    // Invalid timezone — fall back to server-local evaluation (no tz data lost).
    localDate = now.toISOString().slice(0, 10);
    localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  const [y, m, d] = localDate.split('-').map(Number);
  const currentDay = DAY_MAP[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const currentTime = `${localTime}:00`;

  const quiet = (rows as any[]).find((r) =>
    (!r.weekday || r.weekday === currentDay) &&
    String(r.start_time).slice(0, 8) <= currentTime &&
    String(r.end_time).slice(0, 8) > currentTime
  );

  if (!quiet) return { inQuietHours: false };

  const endParts = String(quiet.end_time).split(':');
  const resumeHour = parseInt(endParts[0], 10);
  const resumeMinute = parseInt(endParts[1], 10);
  const resumeTime = `${String(resumeHour).padStart(2, '0')}:${String(resumeMinute).padStart(2, '0')}`;

  const toUtc = (datePart: string): number => {
    try {
      return new Date(TimeEngine.localToUtc(datePart, resumeTime, tz)).getTime();
    } catch {
      // DST gap at the end time — push past the gap by one hour.
      return now.getTime() + 3_600_000;
    }
  };

  let resumeUtc = toUtc(localDate);
  if (resumeUtc <= now.getTime()) {
    const [ry, rm, rd] = localDate.split('-').map(Number);
    const next = new Date(Date.UTC(ry, rm - 1, rd + 1));
    const nextDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
    resumeUtc = toUtc(nextDate);
  }

  return {
    inQuietHours: true,
    resumeAt: Math.max(60_000, resumeUtc - now.getTime()),
  };
}

export async function shouldBypassQuietHours(priority: string): Promise<boolean> {
  return priority === 'critical';
}

export async function getQuietHours(userId: number): Promise<any[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM user_quiet_hours
     WHERE user_id = ? AND is_active = TRUE
     ORDER BY FIELD(weekday, 'mon','tue','wed','thu','fri','sat','sun')`,
    [userId],
  );
  return rows;
}

export async function upsertQuietHours(
  userId: number,
  weekday: string | null,
  startTime: string,
  endTime: string,
  timezone: string = 'UTC',
): Promise<void> {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO user_quiet_hours (user_id, weekday, start_time, end_time, timezone)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE start_time = VALUES(start_time), end_time = VALUES(end_time), timezone = VALUES(timezone)`,
    [userId, weekday, startTime, endTime, timezone],
  );
}

export async function deleteQuietHours(id: number, userId: number): Promise<void> {
  const pool = getPool();
  await pool.execute(
    'DELETE FROM user_quiet_hours WHERE id = ? AND user_id = ?',
    [id, userId],
  );
}
