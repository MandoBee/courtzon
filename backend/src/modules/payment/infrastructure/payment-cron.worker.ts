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
