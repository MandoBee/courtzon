import type mysql from 'mysql2/promise';
import { withTransaction } from '../../../database/database.transaction.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { recordAudit } from '../../audit-log/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('subscription-lifecycle');
type RowData = mysql.RowDataPacket[];

const REMINDER_INTERVALS = [30, 14, 7, 5, 3, 1] as const;

/**
 * Daily job (runs BEFORE expireSubscriptions): promote scheduled renewals.
 *
 * A renewal approved/paid before the current period ends is stored as a
 * future-dated row with status 'pending' (chained to start on the day after
 * the previous period ends). When that start date arrives this job flips it
 * to 'active', closes the superseded periods, and announces it so screens
 * update without a manual refresh. There is NO automatic renewal anywhere —
 * this only activates periods an organisation explicitly paid for.
 */
export async function activateDueRenewals(): Promise<{ promoted: number }> {
  let promoted = 0;
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute<RowData>(
      `SELECT id, organisation_id, plan_id, start_date, end_date,
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(plan_snapshot, '$.planName')), 'Unknown') as plan_name
       FROM organisation_subscriptions
       WHERE subscription_status = 'pending' AND start_date IS NOT NULL AND start_date <= CURDATE()
       FOR UPDATE`,
    );

    for (const sub of rows as any[]) {
      await conn.execute(
        `UPDATE organisation_subscriptions SET subscription_status = 'active', updated_at = NOW() WHERE id = ?`,
        [sub.id],
      );
      // Exactly one effective subscription: close earlier periods this row supersedes.
      await conn.execute(
        `UPDATE organisation_subscriptions SET subscription_status = 'expired', updated_at = NOW()
         WHERE organisation_id = ? AND id <> ?
           AND subscription_status IN ('active', 'suspended', 'pending')
           AND (end_date IS NULL OR end_date < ?)`,
        [sub.organisation_id, sub.id, sub.start_date],
      );

      eventBusV2.emit('organisation:subscription-status-changed', {
        organisationId: sub.organisation_id,
        subscriptionStatus: 'active',
      });

      recordAudit({
        actorId: 0,
        action: 'SUBSCRIPTION.RENEWAL.STARTED',
        entityType: 'organisation_subscription',
        entityId: sub.id,
        afterState: { organisationId: sub.organisation_id, planId: sub.plan_id, startDate: sub.start_date, endDate: sub.end_date },
      });

      promoted++;
      log.info({ subscriptionId: sub.id, organisationId: sub.organisation_id }, 'Scheduled renewal promoted to active');
    }

    if (promoted > 0) {
      const { clearSubscriptionCache } = await import('./current-subscription.service.js');
      clearSubscriptionCache();
    }
  });
  log.info({ promoted }, 'Due-renewal promotion completed');
  return { promoted };
}

/**
 * Daily job: expire active subscriptions where end_date < CURDATE()
 */
export async function expireSubscriptions(): Promise<{ expired: number }> {
  let expired = 0;
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute<RowData>(
      `SELECT s.id, s.organisation_id, s.plan_id, s.end_date,
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(s.plan_snapshot, '$.planName')), sp.plan_name, 'Unknown') as plan_name
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

      eventBusV2.emit('organisation:subscription-expired', {
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

    // Clear resolver cache so stale data is not served
    const { clearSubscriptionCache } = await import('./current-subscription.service.js');
    clearSubscriptionCache();
  });
  log.info({ expired }, 'Subscription expiry job completed');
  return { expired };
}

/**
 * Daily job: send expiration reminders at specific intervals before end_date.
 * Uses withTransaction + FOR UPDATE to prevent race conditions.
 * Uses atomic CONCAT NOT LIKE guard to prevent duplicate sends.
 */
export async function sendExpirationReminders(): Promise<{ notified: number }> {
  let notified = 0;
  const today = new Date();

  await withTransaction(async (conn) => {
    const [rows] = await conn.execute<RowData>(
      `SELECT s.id, s.organisation_id, s.end_date,
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(s.plan_snapshot, '$.planName')), sp.plan_name, 'Unknown') as plan_name
       FROM organisation_subscriptions s
       LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.subscription_status = 'active' AND s.end_date IS NOT NULL AND s.end_date > CURDATE()
         -- A scheduled renewal already secures the next period: the expiry
         -- reminders for the current period are no longer actionable.
         AND NOT EXISTS (
           SELECT 1 FROM organisation_subscriptions f
           WHERE f.organisation_id = s.organisation_id
             AND f.id <> s.id
             AND f.subscription_status IN ('pending', 'active')
             AND f.start_date IS NOT NULL AND f.start_date > s.end_date
         )
       FOR UPDATE`,
    );

    for (const sub of rows as any[]) {
      const daysLeft = Math.ceil(
        (new Date(sub.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      for (const interval of REMINDER_INTERVALS) {
        if (daysLeft !== interval) continue;

        // Atomic UPDATE: only marks interval as sent if not already marked
        // Prevents duplicate notifications even if two workers run concurrently
        const likePattern = `%${interval}%`;
        const [result] = await conn.execute<mysql.ResultSetHeader>(
          `UPDATE organisation_subscriptions
           SET last_reminder_sent = CONCAT(
             COALESCE(last_reminder_sent, ''), 
             CASE WHEN last_reminder_sent IS NULL OR last_reminder_sent = '' THEN ? ELSE CONCAT(',', ?) END
           ), updated_at = NOW()
           WHERE id = ? AND (last_reminder_sent IS NULL OR last_reminder_sent NOT LIKE ?)`,
          [String(interval), String(interval), sub.id, likePattern],
        );

        if (result.affectedRows === 0) continue; // Already sent — skip

        eventBusV2.emit('organisation:subscription-expiring', {
          organisationId: sub.organisation_id,
          daysLeft: interval,
          planName: sub.plan_name,
        });

        notified++;
        log.info({ subscriptionId: sub.id, organisationId: sub.organisation_id, daysLeft: interval }, 'Expiration reminder sent');
      }
    }
  });

  log.info({ notified }, 'Expiration reminders sent');
  return { notified };
}
