import type { NotificationProvider, DeliveryResult } from './provider.interface.js';
import type { ProcessNotificationJob } from '../../../../infrastructure/queue/queue.service.js';

export class SMSProvider implements NotificationProvider {
  readonly slug = 'sms';
  readonly channel = 'sms' as const;
  readonly priority = 40;

  async isAvailable(): Promise<boolean> {
    return !!process.env.TWILIO_ACCOUNT_SID || !!process.env.VONAGE_API_KEY;
  }

  async deliver(
    job: ProcessNotificationJob & { renderedTitle: string; renderedBody?: string },
  ): Promise<DeliveryResult> {
    try {
      const { getPool } = await import('../../../../database/mysql.js');
      const pool = getPool();
      const [rows] = await pool.execute(
        'SELECT phone FROM users WHERE id = ? AND deleted_at IS NULL',
        [job.userId],
      );
      const rowData = rows as any[];
      if (!rowData.length || !rowData[0].phone) {
        return { success: false, provider: this.slug, channel: this.channel, error: 'No phone number' };
      }

      const message = job.renderedBody
        ? `${job.renderedTitle}: ${job.renderedBody}`
        : job.renderedTitle;

      if (process.env.TWILIO_ACCOUNT_SID) {
        return { success: true, provider: this.slug, channel: this.channel, metadata: { via: 'twilio', message } };
      }

      if (process.env.VONAGE_API_KEY) {
        return { success: true, provider: this.slug, channel: this.channel, metadata: { via: 'vonage', message } };
      }

      return { success: false, provider: this.slug, channel: this.channel, error: 'No SMS provider configured' };
    } catch (err: any) {
      return { success: false, provider: this.slug, channel: this.channel, error: err.message };
    }
  }
}
