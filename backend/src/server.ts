import { app } from "./app.js";

import { env } from "./config/env.js";
import { registerHandler, startWorker, closeWorker } from "./infrastructure/queue/worker.js";
import { NOTIFICATION_QUEUE_NAME } from "./infrastructure/queue/queue.service.js";
import { setupRealtime } from "./realtime/index.js";
import { attachSocketPublisher } from "./modules/realtime/index.js";
import { notificationEngine } from "./modules/notifications/application/notification-engine.js";
import { sendEmail } from "./shared/services/mailer.service.js";
import { handleCancelExpiredBookings } from "./modules/booking/infrastructure/booking-expiry.worker.js";
import { handleCancelAbandonedOrders } from "./modules/marketplace/infrastructure/marketplace-cleanup.worker.js";
import { handleExpireSubscriptions, handleSendExpirationReminders } from "./modules/organisations/infrastructure/subscription-lifecycle.worker.js";

import { handleAutoCompleteBookings } from "./modules/booking/infrastructure/booking-auto-complete.worker.js";
import { handleSyncPendingPayments, handleExpireStalePayments } from "./modules/payment/infrastructure/payment-cron.worker.js";
import { runDatabaseBackup } from "./infrastructure/backup/backup.service.js";
import {
  handleProcessNotification, handleSendNotificationBatch,
  handleProcessNotificationDigest, handleSendScheduledNotification,
  handleProcessDeadLetter,
} from "./modules/notifications/infrastructure/notification.worker.js";
import { processDueDigests } from "./modules/notifications/application/digest.service.js";
import { runCleanupPolicies } from "./modules/notifications/application/cleanup.service.js";
import { loadFeatureFlags } from "./modules/notifications/application/feature-flags.service.js";
import { queueService } from "./infrastructure/queue/queue.service.js";
import { registerProvider } from "./modules/notifications/infrastructure/providers/provider.interface.js";
import { InAppProvider } from "./modules/notifications/infrastructure/providers/in-app.provider.js";
import { PushProvider } from "./modules/notifications/infrastructure/providers/push.provider.js";
import { EmailProvider } from "./modules/notifications/infrastructure/providers/email.provider.js";
import { SMSProvider } from "./modules/notifications/infrastructure/providers/sms.provider.js";
import { WhatsAppProvider } from "./modules/notifications/infrastructure/providers/whatsapp.provider.js";
import { WebhookProvider } from "./modules/notifications/infrastructure/providers/webhook.provider.js";
import { bookingRepository } from "./modules/booking/infrastructure/repositories/booking.repository.js";
import { paymentRepository } from "./modules/payment/infrastructure/repositories/payment.repository.js";

import { registerCommandHandler } from "./shared/workflow/command-handler-registry.js";
import { workflowRegistry } from "./shared/workflow/workflow-registry.js";
import { confirmBookingHandler } from "./modules/booking/commands/confirm-booking.command.js";
import { cancelBookingHandler } from "./modules/booking/commands/cancel-booking.command.js";
import { expireBookingHandler } from "./modules/booking/commands/expire-booking.command.js";
import { completeBookingHandler } from "./modules/booking/commands/complete-booking.command.js";
import { processPaymentHandler } from "./modules/payment/commands/process-payment.command.js";
import { depositWalletHandler } from "./modules/wallet/commands/deposit-wallet.command.js";
import { withdrawWalletHandler } from "./modules/wallet/commands/withdraw-wallet.command.js";
import { bookingWorkflows } from "./modules/booking/infrastructure/booking-workflow.js";
import { paymentWorkflows } from "./modules/payment/infrastructure/payment-workflow.js";
import { closePool } from "./database/mysql.js";
import { closeRedisClient } from "./infrastructure/redis/redis.client.js";
import { validateDatabaseSchema } from "./infrastructure/startup/startup-validator.js";

let worker: any;
let notificationWorker: any;

async function shutdown(signal: string) {
  app.log.info(`${signal} received, shutting down...`);
  if (worker) await closeWorker(worker);
  if (notificationWorker) await closeWorker(notificationWorker);
  await queueService.close();
  await closeRedisClient();
  await closePool();
  try { const { getIO } = await import("./realtime/index.js"); getIO().close(); } catch {}
  await app.close();
  process.exit(0);
}

async function bootstrap() {
  try {
    registerHandler('send_email', sendEmail);
    registerHandler('cancel_expired_bookings', handleCancelExpiredBookings);
    registerHandler('database_backup', runDatabaseBackup);

    registerHandler('auto_complete_bookings', handleAutoCompleteBookings);
    registerHandler('sync_pending_payments', handleSyncPendingPayments);
    registerHandler('expire_stale_payments', handleExpireStalePayments);
    registerHandler('cancel_abandoned_orders', handleCancelAbandonedOrders);
    registerHandler('expire_subscriptions', handleExpireSubscriptions);
    registerHandler('send_subscription_reminders', handleSendExpirationReminders);

    registerHandler('process_notification', handleProcessNotification);
    registerHandler('send_notification_batch', handleSendNotificationBatch);
    registerHandler('process_notification_digest', handleProcessNotificationDigest);
    registerHandler('send_scheduled_notification', handleSendScheduledNotification);
    registerHandler('process_dead_letter', handleProcessDeadLetter);
    registerHandler('trigger_digest_processing', processDueDigests);
    registerHandler('run_cleanup', async (_data: Record<string, never>) => {
      await runCleanupPolicies();
    });

    registerCommandHandler('ConfirmBooking', confirmBookingHandler as any);
    registerCommandHandler('CancelBooking', cancelBookingHandler as any);
    registerCommandHandler('ExpireBooking', expireBookingHandler as any);
    registerCommandHandler('CompleteBooking', completeBookingHandler as any);
    registerCommandHandler('ProcessPayment', processPaymentHandler as any);
    registerCommandHandler('DepositWallet', depositWalletHandler as any);
    registerCommandHandler('WithdrawWallet', withdrawWalletHandler as any);

    for (const wf of bookingWorkflows) {
      await workflowRegistry.register(wf).catch((err: any) => app.log.warn({ err, type: wf.workflowType }, 'workflow.register_failed'));
    }
    for (const wf of paymentWorkflows) {
      await workflowRegistry.register(wf).catch((err: any) => app.log.warn({ err, type: wf.workflowType }, 'workflow.register_failed'));
    }

    registerProvider(new InAppProvider());
    registerProvider(new PushProvider());
    registerProvider(new EmailProvider());
    registerProvider(new SMSProvider());
    registerProvider(new WhatsAppProvider());
    registerProvider(new WebhookProvider());

    await loadFeatureFlags();

    const validation = await validateDatabaseSchema();
    if (!validation.ok) {
      app.log.error(
        `Startup validation — missing critical tables: ${validation.missing.join(', ')}. ` +
        'Some endpoints may not work until schema is imported. ' +
        'Import database/baseline/001_courtzon_v3.sql then run scripts/seed.sh'
      );
    } else if (validation.missing.length > 0) {
      app.log.warn(
        `Startup validation — non-critical tables missing: ${validation.missing.join(', ')}`
      );
    }

    worker = startWorker('default');
    notificationWorker = startWorker(NOTIFICATION_QUEUE_NAME);

    await app.listen({
      port: env.PORT,
      host: "0.0.0.0",
    });

    app.log.info(`Server running on port ${env.PORT}`);

    const io = setupRealtime(app);
    app.log.info('Socket.IO initialized');

    attachSocketPublisher(io);
    app.log.info('Socket.IO publisher attached');

    try {
      const { seedTemplates } = await import("./modules/notifications/application/template.service.js");
      await seedTemplates();
      app.log.info('Notification templates seeded');
    } catch (err: any) {
      app.log.warn(`Template seeding skipped: ${err.message}`);
    }

    notificationEngine.start();
    app.log.info('Notification engine started');

    const { startMatchModule } = await import('./modules/match/infrastructure/match.module.js');
    startMatchModule();
    app.log.info('Match module event handlers registered');

    const { registerMarketplacePaymentListeners } = await import('./modules/marketplace/application/marketplace-payment.listener.js');
    registerMarketplacePaymentListeners();

    const { registerBookingPaymentListeners } = await import('./modules/booking/application/booking-payment.listener.js');
    registerBookingPaymentListeners();

    await queueService.add('cancel_expired_bookings', { cutoffMinutes: 5 }, {
      repeat: { every: 120_000 },
      removeOnComplete: true,
      removeOnFail: { age: 86400 },
    });

    await queueService.add('database_backup', {}, {
      repeat: { pattern: '0 0 * * *' },
      removeOnComplete: true,
      removeOnFail: { age: 604800 },
    });

    await queueService.add('auto_complete_bookings', {}, {
      repeat: { every: 300_000 },
      removeOnComplete: true,
      removeOnFail: { age: 86400 },
    });

    // Payment sync — every 5 minutes
    await queueService.add('sync_pending_payments', {}, {
      repeat: { every: 300_000 },
      removeOnComplete: true,
      removeOnFail: { age: 86400 },
    });

    // Payment expiry — every 2 minutes
    await queueService.add('expire_stale_payments', { timeoutMinutes: 5 }, {
      repeat: { every: 120_000 },
      removeOnComplete: true,
      removeOnFail: { age: 86400 },
    });

    // Abandoned marketplace orders — every 5 minutes
    await queueService.add('cancel_abandoned_orders', { timeoutMinutes: 30 }, {
      repeat: { every: 300_000 },
      removeOnComplete: true,
      removeOnFail: { age: 86400 },
    });

    // Subscription expiry — daily at 00:15 UTC
    await queueService.add('expire_subscriptions', {}, {
      repeat: { pattern: '15 0 * * *' },
      removeOnComplete: true,
      removeOnFail: { age: 604800 },
    });

    // Subscription expiration reminders — daily at 08:00 UTC
    await queueService.add('send_subscription_reminders', {}, {
      repeat: { pattern: '0 8 * * *' },
      removeOnComplete: true,
      removeOnFail: { age: 604800 },
    });

    // Digest processing — every 2 minutes
    await queueService.add('trigger_digest_processing', {}, {
      repeat: { every: 120_000 },
      removeOnComplete: true,
      removeOnFail: { age: 86400 },
    });

    // Cleanup policies — daily at 04:00 UTC
    await queueService.add('run_cleanup', {}, {
      repeat: { pattern: '0 4 * * *' },
      removeOnComplete: true,
      removeOnFail: { age: 604800 },
    });

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    app.log.error(error);

    process.exit(1);
  }
}

bootstrap();