import type { ProcessNotificationJob } from '../../../../infrastructure/queue/queue.service.js';
import { createModuleLogger } from '../../../../shared/utils/logger.js';

const log = createModuleLogger('provider');

export type DeliveryChannel = 'in_app' | 'push' | 'email' | 'sms' | 'whatsapp' | 'webhook';

export interface DeliveryResult {
  success: boolean;
  provider: string;
  channel: DeliveryChannel;
  error?: string;
  metadata?: Record<string, any>;
}

export interface NotificationProvider {
  readonly slug: string;
  readonly channel: DeliveryChannel;
  readonly priority: number;
  isAvailable(): Promise<boolean>;
  deliver(job: ProcessNotificationJob & { renderedTitle: string; renderedBody?: string }): Promise<DeliveryResult>;
}

const providers = new Map<string, NotificationProvider>();

export function getProvider(slug: string): NotificationProvider | undefined {
  return providers.get(slug);
}

export function registerProvider(provider: NotificationProvider): void {
  providers.set(provider.slug, provider);
  log.info({ slug: provider.slug, channel: provider.channel }, 'Provider registered');
}

export function getProvidersForChannel(channel: DeliveryChannel): NotificationProvider[] {
  return Array.from(providers.values())
    .filter((p) => p.channel === channel)
    .sort((a, b) => b.priority - a.priority);
}

export function getEnabledProviders(): NotificationProvider[] {
  return Array.from(providers.values())
    .sort((a, b) => b.priority - a.priority);
}

export async function deliverToChannel(
  channel: DeliveryChannel,
  job: ProcessNotificationJob & { renderedTitle: string; renderedBody?: string },
): Promise<DeliveryResult> {
  const channelProviders = getProvidersForChannel(channel);
  for (const provider of channelProviders) {
    try {
      const available = await provider.isAvailable();
      if (!available) continue;

      const result = await provider.deliver(job);
      if (result.success) return result;

      log.warn({ provider: provider.slug, channel, error: result.error }, 'Provider delivery failed');
    } catch (err: any) {
      log.error({ err, provider: provider.slug, channel }, 'Provider delivery error');
    }
  }

  return { success: false, provider: 'none', channel, error: 'No available provider' };
}
