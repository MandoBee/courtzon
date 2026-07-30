import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { userMembershipService } from '../application/user-membership.service.js';

const log = createModuleLogger('membership-expiry');

type RowData = import('mysql2').RowDataPacket[];

export async function handleExpireMemberships(): Promise<void> {
  const pool = getPool();

  try {
    const [rows] = await pool.execute<RowData>(
      `SELECT id, user_id, end_date FROM user_memberships
       WHERE status = 'active' AND end_date IS NOT NULL AND end_date <= CURDATE()`,
    );

    if (rows.length === 0) {
      log.debug('No expired memberships found');
      return;
    }

    log.info({ count: rows.length }, 'Found expired memberships');

    for (const row of rows as any[]) {
      try {
        await userMembershipService.expire(row.id);
        eventBusV2.emit('membership:expired', {
          membershipId: row.id,
          userId: row.user_id,
          type: 'user',
        });
        log.info({ membershipId: row.id, userId: row.user_id }, 'Membership expired');
      } catch (err) {
        log.error({ err, membershipId: row.id, userId: row.user_id }, 'Failed to expire membership');
      }
    }

    log.info({ expired: rows.length }, 'Membership expiry complete');
  } catch (err) {
    log.error({ err }, 'Membership expiry job failed');
  }
}

export async function handleSendExpiringReminders(): Promise<void> {
  const pool = getPool();
  const reminderDays = [7, 3, 1];

  try {
    for (const days of reminderDays) {
      const [rows] = await pool.execute<RowData>(
        `SELECT id, user_id FROM user_memberships
         WHERE status = 'active' AND end_date IS NOT NULL
         AND end_date = DATE_ADD(CURDATE(), INTERVAL ? DAY)`,
        [days],
      );

      for (const row of rows as any[]) {
        eventBusV2.emit('membership:expiring', {
          membershipId: row.id,
          userId: row.user_id,
          daysLeft: days,
          type: 'user',
        });
      }
    }

    log.debug('Membership reminders dispatched');
  } catch (err) {
    log.error({ err }, 'Membership reminder job failed');
  }
}
