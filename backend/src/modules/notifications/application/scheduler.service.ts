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

  if (!Number.isFinite(delay) || delay <= 0) return;

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

  if (!Number.isFinite(delay) || delay <= 0) return;

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

  if (!Number.isFinite(delay) || delay <= 0) return;

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

  if (!Number.isFinite(delay) || delay <= 0) return;

  await queueService.add('send_scheduled_notification', {
    templateId: 0,
    userId,
    scheduledAt: reminderTime,
    payload: { eventName: 'review:reminder', bookingId },
    locale: 'en',
  }, { delay, attempts: 3 });

  log.info({ bookingId, userId, reminderTime }, 'Review reminder scheduled');
}

/**
 * G5 — Academy session reminder (60 minutes before start). Idempotent per
 * (session, user): a deterministic BullMQ jobId prevents duplicate scheduling.
 */
export async function scheduleAcademySessionReminder(
  sessionId: number,
  userId: number,
  startTime: Date,
  academyName: string,
): Promise<void> {
  const reminderTime = new Date(startTime.getTime() - 60 * 60 * 1000);
  const delay = reminderTime.getTime() - Date.now();

  if (!Number.isFinite(delay) || delay <= 0) return;

  await queueService.add('send_scheduled_notification', {
    templateId: 0,
    userId,
    scheduledAt: reminderTime,
    payload: { eventName: 'academy:session-reminder', sessionId, startTime: startTime.toISOString(), academyName },
    locale: 'en',
  }, { jobId: `academy-reminder-${sessionId}-${userId}`, delay, attempts: 3 });

  log.info({ sessionId, userId, reminderTime }, 'Academy session reminder scheduled');
}

// ── G11.12 — Tournament start reminders (reuses the SAME delayed-job pattern
//    as booking/ academy reminders; no new scheduling architecture). ──

export const TOURNAMENT_START_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000; // 24 hours before start

/** Deterministic job id — remove/add always targets the same job. */
export function tournamentReminderJobId(tournamentId: number, userId: number): string {
  return `tournament-reminder-${tournamentId}-${userId}`;
}

/**
 * Deterministic UTC start instant for a tournament (R1).
 * - start_date (date part) + daily_start_time when daily_start_time is present,
 * - otherwise start_date at 00:00:00Z.
 * Never uses the server's local timezone. Returns null for an unusable input.
 */
export function tournamentStartUtc(
  startDate: string | Date | null | undefined,
  dailyStartTime?: string | null | undefined,
): Date | null {
  if (startDate == null) return null;
  const iso = startDate instanceof Date ? startDate.toISOString() : String(startDate);
  const datePart = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const daily = dailyStartTime && typeof dailyStartTime === 'string'
    ? dailyStartTime.trim().slice(0, 8)
    : '';
  const template = /^\d{2}:\d{2}:\d{2}$/.test(daily)
    ? `${datePart}T${daily}Z`
    : `${datePart}T00:00:00.000Z`;
  const d = new Date(template);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Schedule a tournament starting-soon reminder for one user (24h before the
 * UTC start instant). Never schedules when the reminder time is already in the
 * past (delay <= 0). Deterministic jobId prevents duplicate scheduling.
 */
export async function scheduleTournamentStartReminder(
  tournamentId: number,
  startUtc: Date,
  userId: number,
  name?: string,
): Promise<void> {
  if (!(startUtc instanceof Date) || Number.isNaN(startUtc.getTime())) return;
  const reminderTime = new Date(startUtc.getTime() - TOURNAMENT_START_REMINDER_LEAD_MS);
  const delay = reminderTime.getTime() - Date.now();
  if (!Number.isFinite(delay) || delay <= 0) return;

  await queueService.add('send_scheduled_notification', {
    templateId: 0,
    userId,
    scheduledAt: reminderTime,
    payload: {
      eventName: 'tournament:starting-soon',
      tournamentId,
      name: name ?? '',
      startDate: startUtc.toISOString(),
    },
    locale: 'en',
  }, { jobId: tournamentReminderJobId(tournamentId, userId), delay, attempts: 3 });

  log.info({ tournamentId, userId, reminderTime }, 'Tournament start reminder scheduled');
}

/** Remove a previously scheduled tournament start reminder (safe when missing). */
export async function removeTournamentStartReminder(tournamentId: number, userId: number): Promise<void> {
  await queueService.removeJob('send_scheduled_notification', tournamentReminderJobId(tournamentId, userId));
  log.info({ tournamentId, userId }, 'Tournament start reminder removed');
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
