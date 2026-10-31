import { createModuleLogger } from '../../../shared/utils/logger.js';
import { queueService } from '../../../infrastructure/queue/queue.service.js';
import { getPool } from '../../../database/mysql.js';
import { toMySqlDateTime } from '../../../shared/utils/mysql-date.js';

const log = createModuleLogger('digest-scheduler');

export type DigestFrequency = 'hourly' | 'daily' | 'weekly';

export interface DigestJob {
  frequency: DigestFrequency;
}

export async function processDigest(frequency: DigestFrequency): Promise<void> {
  const pool = getPool();
  const since = new Date();

  // Pure millisecond arithmetic — never mutate local date/hour components
  // before formatting UTC. (Local getters resolve to UTC inside the container,
  // but relying on that coupling silently corrupts the window if the container
  // ever runs with a non-UTC TZ.)
  const lookbackMs = frequency === 'hourly' ? 3_600_000 : frequency === 'daily' ? 24 * 3_600_000 : 7 * 24 * 3_600_000;
  since.setTime(since.getTime() - lookbackMs);

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
    [toMySqlDateTime(since)],
  );

  for (const row of rows) {
    try {
      // Payload MUST match ProcessNotificationDigestJob: the digest worker renders
      // `count` and files under `categorySlug`. A different shape silently produced
      // "undefined" digests filed under an undefined category.
      await queueService.add('process_notification_digest', {
        userId: Number(row.user_id),
        categorySlug: 'system',
        eventName: 'system:digest',
        windowId: 0,
        count: Number(row.notification_count),
      }, { attempts: 3, backoff: { type: 'fixed', delay: 5000 } });
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
