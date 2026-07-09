import { registerProvider } from '../../modules/notifications/infrastructure/providers/provider.interface.js';
import { InAppProvider } from '../../modules/notifications/infrastructure/providers/in-app.provider.js';
import { PushProvider } from '../../modules/notifications/infrastructure/providers/push.provider.js';
import { EmailProvider } from '../../modules/notifications/infrastructure/providers/email.provider.js';
import { SMSProvider } from '../../modules/notifications/infrastructure/providers/sms.provider.js';
import { WhatsAppProvider } from '../../modules/notifications/infrastructure/providers/whatsapp.provider.js';
import { WebhookProvider } from '../../modules/notifications/infrastructure/providers/webhook.provider.js';

export function registerAllProviders(): void {
  registerProvider(new InAppProvider());
  registerProvider(new PushProvider());
  registerProvider(new EmailProvider());
  registerProvider(new SMSProvider());
  registerProvider(new WhatsAppProvider());
  registerProvider(new WebhookProvider());
}
