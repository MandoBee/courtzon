import { createModuleLogger } from '../../../shared/utils/logger.js';
import { queueService } from '../../../infrastructure/queue/queue.service.js';
import { getPool } from '../../../database/mysql.js';

const log = createModuleLogger('digest-scheduler');

export type DigestFrequency = 'hourly' | 'daily' | 'weekly';

export interface DigestJob {
  frequency: DigestFrequency;
}

export async function processDigest(frequency: DigestFrequency): Promise<void> {
  const pool = getPool();
  const since = new Date();

  if (frequency === 'hourly') since.setHours(since.getHours() - 1);
  else if (frequency === 'daily') since.setDate(since.getDate() - 1);
  else if (frequency === 'weekly') since.setDate(since.getDate() - 7);

  const [rows] = await pool.execute<any[]>(
    `SELECT n.user_id,
            COUNT(*) as notification_count,
            GROUP_CONCAT(DISTINCT nc.slug) as categories
     FROM notifications n
     LEFT JOIN notification_categories nc ON nc.id = n.category_id
     WHERE n.created_at >= ? AND n.is_read = 0
     GROUP BY n.user_id
     HAVING notification_count > 0
     LIMIT 500`,
    [since.toISOString()],
  );

  for (const row of rows) {
    try {
      await queueService.add('process_notification_digest' as any, {
        userId: row.user_id,
        frequency,
        notificationCount: row.notification_count,
        categories: row.categories,
      } as any, { attempts: 3, backoff: { type: 'fixed' as any, delay: 5000 } });
    } catch (err) {
      log.error({ err, userId: row.user_id }, 'digest.enqueue_failed');
    }
  }

  log.info({ frequency, users: rows.length }, 'digest.processed');
}

export async function handleHourlyDigest(): Promise<void> {
  await processDigest('hourly');
}

export async function handleDailyDigest(): Promise<void> {
  await processDigest('daily');
}

export async function handleWeeklyDigest(): Promise<void> {
  await processDigest('weekly');
}
