import { app } from "./app.js";

import { env } from "./config/env.js";
import { registerHandler, startWorker, closeWorker } from "./infrastructure/queue/worker.js";
import { setupRealtime } from "./realtime/index.js";
import { notificationEngine } from "./modules/notifications/application/notification-engine.js";
import { sendEmail } from "./shared/services/mailer.service.js";
import { handleCancelExpiredBookings } from "./modules/booking/infrastructure/booking-expiry.worker.js";
import { handleRunSettlements } from "./modules/settlement/infrastructure/settlement-cron.worker.js";
import { handleAutoCompleteBookings } from "./modules/booking/infrastructure/booking-auto-complete.worker.js";
import { handleSyncPendingPayments, handleExpireStalePayments, handleCleanupBookingIntents } from "./modules/payment/infrastructure/payment-cron.worker.js";
import { runDatabaseBackup } from "./infrastructure/backup/backup.service.js";
import { queueService } from "./infrastructure/queue/queue.service.js";
import { closePool } from "./database/mysql.js";
import { closeRedisClient } from "./infrastructure/redis/redis.client.js";
import { validateDatabaseSchema } from "./infrastructure/startup/startup-validator.js";

let worker: any;

async function shutdown(signal: string) {
  app.log.info(`${signal} received, shutting down...`);
  if (worker) await closeWorker(worker);
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
    registerHandler('run_settlements', handleRunSettlements);
    registerHandler('auto_complete_bookings', handleAutoCompleteBookings);
    registerHandler('sync_pending_payments', handleSyncPendingPayments);
    registerHandler('expire_stale_payments', handleExpireStalePayments);
    registerHandler('cleanup_booking_intents', handleCleanupBookingIntents);

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

    await app.listen({
      port: env.PORT,
      host: "0.0.0.0",
    });

    app.log.info(`Server running on port ${env.PORT}`);

    const io = setupRealtime(app);
    app.log.info('Socket.IO initialized');
    notificationEngine.start();
    app.log.info('Notification engine started');

    await queueService.add('cancel_expired_bookings', { cutoffMinutes: 30 }, {
      repeat: { every: 900_000 },
      removeOnComplete: true,
      removeOnFail: { age: 86400 },
    });

    await queueService.add('database_backup', {}, {
      repeat: { pattern: '0 0 * * *' },
      removeOnComplete: true,
      removeOnFail: { age: 604800 },
    });

    await queueService.add('run_settlements', {}, {
      repeat: { pattern: '0 2 * * *' },
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
    await queueService.add('expire_stale_payments', { timeoutMinutes: 15 }, {
      repeat: { every: 120_000 },
      removeOnComplete: true,
      removeOnFail: { age: 86400 },
    });

    // Intent cleanup — daily at 03:00 UTC
    await queueService.add('cleanup_booking_intents', {}, {
      repeat: { pattern: '0 3 * * *' },
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