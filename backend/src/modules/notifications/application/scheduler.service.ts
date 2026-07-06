import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { queueService } from '../../../infrastructure/queue/queue.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { dispatchToAll, dispatchByRole, dispatchByOrg, dispatchByBranch, dispatchByUserIdsBulk, dispatchToUser } from './dispatcher.service.js';

const log = createModuleLogger('notification-scheduler');

type RowData = RowDataPacket[];

export async function scheduleBookingReminder(
  bookingId: number,
  userId: number,
  startTime: Date,
): Promise<void> {
  const reminderTime = new Date(startTime.getTime() - 30 * 60 * 1000);
  const delay = reminderTime.getTime() - Date.now();

  if (delay <= 0) return;

  await queueService.add('send_scheduled_notification', {
    templateId: 0,
    userId,
    scheduledAt: reminderTime,
    payload: { eventName: 'booking:reminder', bookingId, startTime: startTime.toISOString() },
    locale: 'en',
  }, { delay, attempts: 3 });

  log.info({ bookingId, userId, reminderTime }, 'Booking reminder scheduled');
}

export async function scheduleMembershipReminder(
  userId: number,
  type: string,
  expiryDate: Date,
  daysBefore: number = 7,
): Promise<void> {
  const reminderTime = new Date(expiryDate.getTime() - daysBefore * 86400 * 1000);
  const delay = reminderTime.getTime() - Date.now();

  if (delay <= 0) return;

  await queueService.add('send_scheduled_notification', {
    templateId: 0,
    userId,
    scheduledAt: reminderTime,
    payload: { eventName: 'membership:expiring', type, daysLeft: daysBefore },
    locale: 'en',
  }, { delay, attempts: 3 });

  log.info({ userId, type, reminderTime }, 'Membership reminder scheduled');
}

export async function scheduleBirthdayGreeting(
  userId: number,
  birthDate: Date,
): Promise<void> {
  const now = new Date();
  const nextBirthday = new Date(
    now.getFullYear(),
    birthDate.getMonth(),
    birthDate.getDate(),
    8, 0, 0,
  );

  if (nextBirthday.getTime() < now.getTime()) {
    nextBirthday.setFullYear(nextBirthday.getFullYear() + 1);
  }

  const delay = nextBirthday.getTime() - now.getTime();

  await queueService.add('send_scheduled_notification', {
    templateId: 0,
    userId,
    scheduledAt: nextBirthday,
    payload: { eventName: 'system:birthday' },
    locale: 'en',
  }, { delay, attempts: 3 });

  log.info({ userId, nextBirthday }, 'Birthday greeting scheduled');
}

export async function scheduleReviewReminder(
  bookingId: number,
  userId: number,
  completionTime: Date,
): Promise<void> {
  const reminderTime = new Date(completionTime.getTime() + 24 * 60 * 60 * 1000);
  const delay = reminderTime.getTime() - Date.now();

  if (delay <= 0) return;

  await queueService.add('send_scheduled_notification', {
    templateId: 0,
    userId,
    scheduledAt: reminderTime,
    payload: { eventName: 'review:reminder', bookingId },
    locale: 'en',
  }, { delay, attempts: 3 });

  log.info({ bookingId, userId, reminderTime }, 'Review reminder scheduled');
}

export async function processScheduledBroadcasts(): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM notification_broadcasts
     WHERE is_active = 1 AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC LIMIT 50`,
  );

  for (const broadcast of rows) {
    try {
      const payload = {
        title: (broadcast as any).title,
        body: (broadcast as any).body,
        type: (broadcast as any).type,
        priority: (broadcast as any).priority,
        actionKey: (broadcast as any).action_key,
        imageUrls: safeParse((broadcast as any).image_urls),
        actions: safeParse((broadcast as any).actions),
      };

      const scope = (broadcast as any).target_scope;
      const value = (broadcast as any).target_value;

      const options = {
        eventName: 'system:announcement' as const,
        categorySlug: 'system' as const,
        data: { title: payload.title, body: payload.body, broadcastId: (broadcast as any).id },
        type: payload.type,
        priority: payload.priority,
        actionKey: payload.actionKey,
        imageUrls: payload.imageUrls,
        actions: payload.actions,
        locale: 'en',
      };

      switch (scope) {
        case 'all': await dispatchToAll(options); break;
        case 'role': await dispatchByRole(value, options); break;
        case 'organisation': await dispatchByOrg(Number(value), options); break;
        case 'branch': await dispatchByBranch(Number(value), options); break;
        case 'users': await dispatchByUserIdsBulk(value.split(',').map(Number), options); break;
      }

      await pool.execute(
        'UPDATE notification_broadcasts SET is_active = 0 WHERE id = ?',
        [(broadcast as any).id],
      );
    } catch (err) {
      log.error({ err, broadcastId: (broadcast as any).id }, 'Failed to process scheduled broadcast');
    }
  }
}

function safeParse(v: any): any {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}
