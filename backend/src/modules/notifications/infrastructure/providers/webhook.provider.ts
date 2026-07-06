import { createHmac } from 'node:crypto';
import type { NotificationProvider, DeliveryResult } from './provider.interface.js';
import { getPool } from '../../../../database/mysql.js';
import type { ProcessNotificationJob } from '../../../../infrastructure/queue/queue.service.js';
import { createModuleLogger } from '../../../../shared/utils/logger.js';

const log = createModuleLogger('webhook-provider');

export class WebhookProvider implements NotificationProvider {
  readonly slug = 'webhook';
  readonly channel = 'webhook' as const;
  readonly priority = 60;

  async isAvailable(): Promise<boolean> {
    try {
      const pool = getPool();
      const [rows] = await pool.execute(
        `SELECT COUNT(*) as cnt FROM notification_webhooks
         WHERE is_active = TRUE`,
      );
      return (rows as any[])[0]?.cnt > 0;
    } catch {
      return false;
    }
  }

  async deliver(
    job: ProcessNotificationJob & { renderedTitle: string; renderedBody?: string },
  ): Promise<DeliveryResult> {
    try {
      const pool = getPool();
      const orgId = job.organisationId;
      if (!orgId) {
        return { success: false, provider: this.slug, channel: this.channel, error: 'No organisation context' };
      }

      const [webhooks] = await pool.execute(
        `SELECT * FROM notification_webhooks
         WHERE organisation_id = ? AND is_active = TRUE
         AND JSON_CONTAINS(events, JSON_QUOTE(?), '$.events')`,
        [orgId, job.eventName || ''],
      );
      const hooks = (webhooks as any[]) || [];

      if (!hooks || !hooks.length) {
        return { success: true, provider: this.slug, channel: this.channel, metadata: { delivered: 0, reason: 'No matching webhooks' } };
      }

      const payload = {
        event: job.eventName,
        notificationId: job.notificationId,
        userId: job.userId,
        title: job.renderedTitle,
        body: job.renderedBody,
        categorySlug: job.categorySlug,
        timestamp: new Date().toISOString(),
        data: job.actionPayload || {},
      };

      let delivered = 0;
      for (const hook of hooks) {
        try {
          await this.deliverWebhook(hook, payload);
          await pool.execute(
            'UPDATE notification_webhooks SET last_triggered_at = NOW(), failed_count = 0 WHERE id = ?',
            [hook.id],
          );
          delivered++;
        } catch (err: any) {
          log.error({ err, webhookId: hook.id }, 'Webhook delivery failed');
          await pool.execute(
            'UPDATE notification_webhooks SET failed_count = failed_count + 1 WHERE id = ?',
            [hook.id],
          );
        }
      }

      return { success: delivered > 0, provider: this.slug, channel: this.channel, metadata: { delivered, total: hooks.length } };
    } catch (err: any) {
      return { success: false, provider: this.slug, channel: this.channel, error: err.message };
    }
  }

  private async deliverWebhook(hook: any, payload: Record<string, any>): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', hook.secret).update(body).digest('hex');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-CourtZon-Signature': signature,
      'X-CourtZon-Event': payload.event,
      'User-Agent': 'CourtZon-Webhook/1.0',
    };

    if (hook.headers) {
      const customHeaders = typeof hook.headers === 'string' ? JSON.parse(hook.headers) : hook.headers;
      Object.assign(headers, customHeaders);
    }

    const response = await fetch(hook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Webhook responded with ${response.status}`);
    }
  }
}
