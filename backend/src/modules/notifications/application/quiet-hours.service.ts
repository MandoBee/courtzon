import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('quiet-hours');

const DAY_MAP: Record<number, string> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
};

export async function isInQuietHours(userId: number): Promise<{
  inQuietHours: boolean;
  resumeAt?: number;
}> {
  const pool = getPool();
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
  const currentDay = DAY_MAP[now.getDay()];

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM user_quiet_hours
     WHERE user_id = ? AND is_active = TRUE
     AND (weekday IS NULL OR weekday = ?)
     AND start_time <= ? AND end_time > ?
     LIMIT 1`,
    [userId, currentDay, currentTime, currentTime],
  );

  if (!rows.length) {
    return { inQuietHours: false };
  }

  const quiet = rows[0] as any;
  const endParts = quiet.end_time.split(':');
  const resumeHour = parseInt(endParts[0], 10);
  const resumeMinute = parseInt(endParts[1], 10);

  const resumeDate = new Date(now);
  resumeDate.setHours(resumeHour, resumeMinute, 0, 0);

  if (resumeDate.getTime() <= now.getTime()) {
    resumeDate.setDate(resumeDate.getDate() + 1);
  }

  return {
    inQuietHours: true,
    resumeAt: resumeDate.getTime() - now.getTime(),
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
