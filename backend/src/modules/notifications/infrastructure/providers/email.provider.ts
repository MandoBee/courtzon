import type { NotificationProvider, DeliveryResult } from './provider.interface.js';
import { sendEmail as sendEmailService } from '../../../../shared/services/mailer.service.js';
import type { ProcessNotificationJob, SendEmailJob } from '../../../../infrastructure/queue/queue.service.js';

export class EmailProvider implements NotificationProvider {
  readonly slug = 'email';
  readonly channel = 'email' as const;
  readonly priority = 30;
  private available: boolean = true;

  async isAvailable(): Promise<boolean> {
    try {
      return this.available;
    } catch {
      return false;
    }
  }

  async deliver(
    job: ProcessNotificationJob & { renderedTitle: string; renderedBody?: string },
  ): Promise<DeliveryResult> {
    try {
      const { getPool } = await import('../../../../database/mysql.js');
      const pool = getPool();
      const [rows] = await pool.execute(
        'SELECT email FROM users WHERE id = ? AND deleted_at IS NULL',
        [job.userId],
      );
      const rowData = rows as any[];
      if (!rowData.length || !rowData[0].email) {
        return { success: false, provider: this.slug, channel: this.channel, error: 'No email address' };
      }

      const emailJob: SendEmailJob = {
        to: rowData[0].email,
        subject: job.renderedTitle,
        body: job.renderedBody || job.renderedTitle,
        html: job.renderedBody
          ? `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2>${job.renderedTitle}</h2><p>${job.renderedBody}</p></div>`
          : undefined,
      };

      await sendEmailService(emailJob as any);
      return { success: true, provider: this.slug, channel: this.channel };
    } catch (err: any) {
      return { success: false, provider: this.slug, channel: this.channel, error: err.message };
    }
  }
}
