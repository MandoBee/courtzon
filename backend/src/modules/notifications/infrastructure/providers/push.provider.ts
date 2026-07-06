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
        `SELECT push_token, push_provider FROM user_devices
         WHERE user_id = ? AND is_active = TRUE AND push_token IS NOT NULL
         ORDER BY last_seen_at DESC LIMIT 10`,
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
    device: any,
    job: ProcessNotificationJob & { renderedTitle: string; renderedBody?: string },
  ): Promise<DeliveryResult> {
    const provider = device.push_provider;

    const message = {
      token: device.push_token,
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

    switch (provider) {
      case 'fcm':
        return this.sendFCM(message);
      case 'apns':
        return this.sendAPNs(message);
      case 'onesignal':
        return this.sendOneSignal(message);
      case 'huawei':
        return this.sendHuawei(message);
      default:
        return { success: false, provider: this.slug, channel: this.channel, error: `Unknown push provider: ${provider}` };
    }
  }

  private async sendFCM(message: any): Promise<DeliveryResult> {
    return { success: true, provider: this.slug, channel: this.channel, metadata: { mock: 'fcm_ready' } };
  }

  private async sendAPNs(message: any): Promise<DeliveryResult> {
    return { success: true, provider: this.slug, channel: this.channel, metadata: { mock: 'apns_ready' } };
  }

  private async sendOneSignal(message: any): Promise<DeliveryResult> {
    return { success: true, provider: this.slug, channel: this.channel, metadata: { mock: 'onesignal_ready' } };
  }

  private async sendHuawei(message: any): Promise<DeliveryResult> {
    return { success: true, provider: this.slug, channel: this.channel, metadata: { mock: 'huawei_ready' } };
  }
}
