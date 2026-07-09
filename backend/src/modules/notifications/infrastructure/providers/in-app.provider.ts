import type { NotificationProvider, DeliveryResult } from './provider.interface.js';
import { realtimeService } from '../../../../platform/realtime/index.js';
import type { ProcessNotificationJob } from '../../../../infrastructure/queue/queue.service.js';

export class InAppProvider implements NotificationProvider {
  readonly slug = 'in_app';
  readonly channel = 'in_app' as const;
  readonly priority = 10;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async deliver(
    job: ProcessNotificationJob & { renderedTitle: string; renderedBody?: string },
  ): Promise<DeliveryResult> {
    try {
      const payload: Record<string, any> = {
        id: job.notificationId,
        user_id: job.userId,
        title: job.renderedTitle,
        body: job.renderedBody,
        type: job.templateId ? 'info' : job.categorySlug,
        priority: job.priority,
        is_read: false,
        created_at: new Date().toISOString(),
        category_slug: job.categorySlug,
        action_key: job.actionKey,
        action_payload: job.actionPayload,
        actions: job.actions ? (typeof job.actions === 'string' ? JSON.parse(job.actions) : job.actions) : null,
        image_urls: job.imageUrls,
        organisation_id: job.organisationId,
        branch_id: job.branchId,
        related_entity_type: job.relatedEntityType,
        related_entity_id: job.relatedEntityId,
        sender_id: job.senderId,
      };

      realtimeService.emitToUser(job.userId, 'notification:new', payload);
      realtimeService.emitToUser(job.userId, 'notification:unread-count');

      return { success: true, provider: this.slug, channel: this.channel };
    } catch (err: any) {
      return { success: false, provider: this.slug, channel: this.channel, error: err.message };
    }
  }
}
