import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { queueService } from '../../../infrastructure/queue/queue.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('digest');

type RowData = RowDataPacket[];

const DIGEST_WINDOW_SECONDS = 300;

export async function accumulateDigest(
  userId: number,
  categorySlug: string,
  eventName: string,
): Promise<boolean> {
  const pool = getPool();
  const now = new Date();
  const windowClosesAt = new Date(now.getTime() + DIGEST_WINDOW_SECONDS * 1000);

  const [existing] = await pool.execute<RowData>(
    `SELECT * FROM notification_digest_windows
     WHERE user_id = ? AND category_slug = ? AND event_name = ? AND is_aggregated = 0 AND window_closes_at > NOW()
     LIMIT 1`,
    [userId, categorySlug, eventName],
  );

  if (existing.length) {
    await pool.execute(
      'UPDATE notification_digest_windows SET count = count + 1 WHERE id = ?',
      [existing[0].id],
    );
    return true;
  }

  await pool.execute(
    `INSERT INTO notification_digest_windows
     (user_id, category_slug, event_name, count, window_opens_at, window_closes_at, is_aggregated)
     VALUES (?, ?, ?, 1, NOW(), ?, 0)`,
    [userId, categorySlug, eventName, windowClosesAt],
  );

  return true;
}

export async function processDueDigests(): Promise<void> {
  const pool = getPool();
  const [windows] = await pool.execute<RowData>(
    `SELECT * FROM notification_digest_windows
     WHERE is_aggregated = 0 AND window_closes_at <= NOW()
     ORDER BY window_closes_at ASC LIMIT 50`,
  );

  for (const w of windows) {
    try {
      await queueService.add('process_notification_digest', {
        userId: w.user_id,
        categorySlug: w.category_slug,
        eventName: w.event_name,
        windowId: w.id,
        count: w.count,
      }, { delay: 0, attempts: 3 });

      await pool.execute(
        'UPDATE notification_digest_windows SET is_aggregated = 1 WHERE id = ?',
        [w.id],
      );
    } catch (err) {
      log.error({ err, windowId: w.id }, 'Failed to process digest window');
    }
  }
}
