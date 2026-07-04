import { paymentService } from '../../payment/application/payment.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import type { SyncPendingPaymentsJob, ExpireStalePaymentsJob } from '../../../infrastructure/queue/queue.service.js';

const log = createModuleLogger('payment-cron');

export async function handleSyncPendingPayments(_data: SyncPendingPaymentsJob): Promise<void> {
  try {
    const result = await paymentService.syncPendingPayments();
    log.info({ synced: result.synced, total: result.total }, 'Payment sync job completed');
  } catch (err) {
    log.error({ error: String(err) }, 'Payment sync job failed');
  }
}

export async function handleExpireStalePayments(data: ExpireStalePaymentsJob): Promise<void> {
  try {
    const timeoutMinutes = data.timeoutMinutes || 15;
    const result = await paymentService.expireStalePayments(timeoutMinutes);
    log.info({ expired: result.expired, total: result.total, timeoutMinutes }, 'Payment expiry job completed');
  } catch (err) {
    log.error({ error: String(err), timeoutMinutes: data.timeoutMinutes }, 'Payment expiry job failed');
  }
}

export async function handleCleanupBookingIntents(): Promise<void> {
  try {
    const { getPool } = await import('../../../database/mysql.js');
    const pool = getPool();
    const fulfilledDays = parseInt(process.env.INTENT_RETENTION_FULFILLED_DAYS || '90', 10);
    const terminalDays = parseInt(process.env.INTENT_RETENTION_TERMINAL_DAYS || '30', 10);

    let cleaned = 0;
    for (const [status, days] of [['fulfilled', fulfilledDays], ['failed', terminalDays], ['expired', terminalDays], ['cancelled', terminalDays]] as [string, number][]) {
      const [result] = await pool.execute(
        `DELETE FROM booking_intents WHERE intent_status = ? AND updated_at < NOW() - INTERVAL ? DAY LIMIT 1000`,
        [status, days]
      );
      cleaned += (result as any).affectedRows || 0;
    }
    log.info({ cleaned }, 'Booking intent cleanup completed');
  } catch (err) {
    log.error({ error: String(err) }, 'Booking intent cleanup failed');
  }
}
