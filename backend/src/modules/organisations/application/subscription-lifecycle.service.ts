import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { withTransaction } from '../../../database/database.transaction.js';
import { eventBus } from '../../../shared/event-bus/index.js';
import { recordAudit } from '../../audit-log/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('subscription-lifecycle');
type RowData = mysql.RowDataPacket[];

const REMINDER_INTERVALS = [30, 14, 7, 3, 1] as const;

/**
 * Daily job: expire active subscriptions where end_date < CURDATE()
 */
export async function expireSubscriptions(): Promise<{ expired: number }> {
  let expired = 0;
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute<RowData>(
      `SELECT s.id, s.organisation_id, s.plan_id, s.end_date, COALESCE(sp.plan_name, 'Unknown') as plan_name
       FROM organisation_subscriptions s
       LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.subscription_status = 'active' AND s.end_date IS NOT NULL AND s.end_date < CURDATE()
       FOR UPDATE`,
    );

    for (const sub of rows as any[]) {
      await conn.execute(
        `UPDATE organisation_subscriptions SET subscription_status = 'expired', updated_at = NOW() WHERE id = ?`,
        [sub.id],
      );

      eventBus.emit('organisation:subscription-expired', {
        organisationId: sub.organisation_id,
        planName: sub.plan_name,
      });

      recordAudit({
        actorId: 0,
        action: 'SUBSCRIPTION.EXPIRED',
        entityType: 'organisation_subscription',
        entityId: sub.id,
        afterState: { organisationId: sub.organisation_id, planId: sub.plan_id, endDate: sub.end_date },
      });

      expired++;
      log.info({ subscriptionId: sub.id, organisationId: sub.organisation_id }, 'Subscription expired');
    }
  });
  log.info({ expired }, 'Subscription expiry job completed');
  return { expired };
}

/**
 * Daily job: send expiration reminders at specific intervals before end_date.
 * Uses last_reminder_sent column to prevent duplicate reminders.
 */
export async function sendExpirationReminders(): Promise<{ notified: number }> {
  const pool = getPool();
  let notified = 0;

  const [rows] = await pool.execute<RowData>(
    `SELECT s.id, s.organisation_id, s.plan_id, s.end_date, s.last_reminder_sent,
            COALESCE(sp.plan_name, 'Unknown') as plan_name
     FROM organisation_subscriptions s
     LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
     WHERE s.subscription_status = 'active' AND s.end_date IS NOT NULL AND s.end_date > CURDATE()`,
  );

  for (const sub of rows as any[]) {
    const daysLeft = Math.ceil(
      (new Date(sub.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    const sent = (sub.last_reminder_sent || '').split(',').filter(Boolean);

    for (const interval of REMINDER_INTERVALS) {
      if (daysLeft === interval && !sent.includes(String(interval))) {
        const newSent = sent.length ? `${sent.join(',')},${interval}` : String(interval);

        await pool.execute(
          'UPDATE organisation_subscriptions SET last_reminder_sent = ? WHERE id = ?',
          [newSent, sub.id],
        );

        eventBus.emit('organisation:subscription-expiring', {
          organisationId: sub.organisation_id,
          daysLeft: interval,
          planName: sub.plan_name,
        });

        notified++;
        log.info({ subscriptionId: sub.id, organisationId: sub.organisation_id, daysLeft: interval }, 'Expiration reminder sent');
      }
    }
  }

  log.info({ notified }, 'Expiration reminders sent');
  return { notified };
}
