import type { NotificationProvider, DeliveryResult } from './provider.interface.js';
import type { ProcessNotificationJob } from '../../../../infrastructure/queue/queue.service.js';

export class PushProvider implements NotificationProvider {
  readonly slug = 'push';
  readonly channel = 'push' as const;
  readonly priority = 20;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async deliver(
    job: ProcessNotificationJob & { renderedTitle: string; renderedBody?: string },
  ): Promise<DeliveryResult> {
    try {
      const { getPool } = await import('../../../../database/mysql.js');
      const pool = getPool();
      const [rows] = await pool.execute(
        `SELECT token, platform FROM push_tokens
         WHERE user_id = ? AND is_active = TRUE
         ORDER BY last_used_at DESC LIMIT 10`,
        [job.userId],
      );
      const rowData = rows as any[];

      if (!rowData.length) {
        return { success: false, provider: this.slug, channel: this.channel, error: 'No push tokens' };
      }

      const results: DeliveryResult[] = [];
      for (const device of rowData) {
        try {
          results.push(await this.sendToDevice(device, job));
        } catch (err: any) {
          results.push({ success: false, provider: this.slug, channel: this.channel, error: err.message });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      if (successCount > 0) {
        return {
          success: true,
          provider: this.slug,
          channel: this.channel,
          metadata: { tokensDelivered: successCount, totalTokens: rowData.length },
        };
      }

      return {
        success: false,
        provider: this.slug,
        channel: this.channel,
        error: `All ${rowData.length} push deliveries failed`,
      };
    } catch (err: any) {
      return { success: false, provider: this.slug, channel: this.channel, error: err.message };
    }
  }

  private async sendToDevice(
    device: { token: string; platform: string },
    job: ProcessNotificationJob & { renderedTitle: string; renderedBody?: string },
  ): Promise<DeliveryResult> {
    const message = {
      token: device.token,
      notification: {
        title: job.renderedTitle,
        body: job.renderedBody || '',
      },
      data: {
        notificationId: String(job.notificationId),
        actionKey: job.actionKey || '',
        categorySlug: job.categorySlug || '',
        ...(job.actionPayload || {}),
      },
    };

    if (device.platform === 'ios') {
      return this.sendAPNs(message);
    }
    return this.sendFCM(message);
  }

  private async sendFCM(message: any): Promise<DeliveryResult> {
    return { success: true, provider: this.slug, channel: this.channel, metadata: { mock: 'fcm_ready' } };
  }

  private async sendAPNs(message: any): Promise<DeliveryResult> {
    return { success: true, provider: this.slug, channel: this.channel, metadata: { mock: 'apns_ready' } };
  }
}
