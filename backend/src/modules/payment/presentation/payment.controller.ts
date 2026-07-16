import type { FastifyRequest, FastifyReply } from 'fastify';
import { paymentService } from '../application/payment.service.js';
import { recordAudit } from '../../audit-log/index.js';
import { ChargeSchema, RefundPaymentSchema, ConfirmPaymentSchema } from './payment.dto.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { emitPaymentCompleted, failPayment } from '../../../platform/payment/PaymentSaga.js';

const log = createModuleLogger('payment-controller');

export async function chargeHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = ChargeSchema.parse(request.body);
  const result = await paymentService.charge(userId, body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PAYMENT.PROCESS',
    entityType: 'payment',
    entityId: (result as any)?.paymentId,
    afterState: {
      referenceType: body.referenceType,
      referenceId: body.referenceId,
      amount: body.amount,
      traceId: (result as any)?.traceId,
      paymentMethod: body.paymentMethod,
    },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(result);
}

export async function confirmPaymentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = ConfirmPaymentSchema.parse(request.body);
  const result = await paymentService.confirmPayment(body.paymentId);
  recordAudit({
    actorId: userId ?? null,
    action: 'PAYMENT.CONFIRM',
    entityType: 'payment',
    entityId: body.paymentId,
    afterState: { confirmed: result.confirmed, paymentStatus: result.paymentStatus },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  if (result.confirmed && result.paymentStatus === 'paid') {
    await emitPaymentCompleted(body.paymentId).catch(() => {});
  } else if (result.paymentStatus === 'failed') {
    await failPayment(body.paymentId).catch(() => {});
  }

  return reply.send(result);
}

export async function getPaymentStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const result = await paymentService.getPaymentStatus(Number(id));
  return reply.send(result);
}

export async function refundHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = RefundPaymentSchema.parse(request.body);
  const result = await paymentService.refund(Number(id), body.amount, body.reason);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PAYMENT.REFUND',
    entityType: 'payment',
    entityId: Number(id),
    afterState: { amount: body.amount },
    reason: body.reason,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function webhookHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Intention API: HMAC is in query param; Accept API: HMAC is in header.
    // Prioritize query param for Intention API webhooks, fall back to header.
    const signature = ((request.query as any)?.hmac || request.headers['x-paymob-signature'] || request.headers['x-fawry-signature'] || '') as string;
    const result = await paymentService.handleWebhook(request.body, signature);
    const data = (request.body as any) || {};
    const gatewayRef = data.obj?.intention_order_id || data.obj?.order?.id || data.order?.id || data.id || '';
    recordAudit({
      actorId: (request as any).userId ?? null,
      action: 'PAYMENT.WEBHOOK',
      entityType: 'payment',
      afterState: { gatewayRef, idempotent: (result as any)?.idempotent },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.send(result);
  } catch (err: any) {
    const msg = err?.message || String(err);
    // HMAC / signature rejection → 401
    if (msg.includes('Invalid webhook signature') || msg.includes('HMAC')) {
      log.warn({ msg }, 'Webhook signature rejected');
      return reply.status(401).send({ error: 'Invalid signature' });
    }
    // Missing gateway reference in payload → 400
    if (msg.includes('Missing gateway reference')) {
      return reply.status(400).send({ error: 'Missing gateway reference' });
    }
    // Transaction not found → 200 (idempotent; gateway may retry, don't trigger error alert)
    if (err instanceof NotFoundError) {
      log.warn({ msg }, 'Webhook received for unknown transaction');
      return reply.send({ received: true, note: 'transaction not found' });
    }
    log.error({ err: msg }, 'Webhook processing error');
    return reply.status(500).send({ error: 'Webhook processing failed' });
  }
}

export async function getTransactionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { page = 1, limit = 20 } = request.query as any;
  const result = await paymentService.getTransactions(userId, Number(page), Number(limit));
  return reply.send(result);
}

export async function syncHandler(_request: FastifyRequest, reply: FastifyReply) {
  const result = await paymentService.syncPendingPayments();
  return reply.send({ message: 'Payment sync completed', ...result });
}

export async function expireHandler(_request: FastifyRequest, reply: FastifyReply) {
  const timeout = Number((_request.query as any)?.timeoutMinutes || 15);
  const result = await paymentService.expireStalePayments(timeout);
  return reply.send({ message: 'Payment expiry completed', timeoutMinutes: timeout, ...result });
}

export async function recoverHandler(request: FastifyRequest, reply: FastifyReply) {
  const { gatewayReference } = request.params as { gatewayReference: string };
  const userId = (request as any).userId;
  const result = await paymentService.recoverPayment(gatewayReference, userId);
  recordAudit({
    actorId: userId,
    action: 'PAYMENT.RECOVER',
    entityType: 'payment',
    entityId: gatewayReference,
    afterState: { recovered: result.recovered, idempotent: result.idempotent, paymentStatus: result.paymentStatus },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function healthHandler(_request: FastifyRequest, reply: FastifyReply) {
  const pool = await import('../../../database/mysql.js').then(m => m.getPool());
  const [pendingRows] = await pool.execute<any[]>(
    `SELECT payment_status, COUNT(*) as cnt
     FROM payment_transactions
     WHERE payment_status IN ('created','pending','processing')
     GROUP BY payment_status`
  );
  const [staleRows] = await pool.execute<any[]>(
    `SELECT COUNT(*) as cnt FROM payment_transactions
     WHERE payment_status IN ('created','pending','processing')
       AND created_at < NOW() - INTERVAL 15 MINUTE`
  );
  const [recentFailed] = await pool.execute<any[]>(
    `SELECT COUNT(*) as cnt FROM payment_transactions
     WHERE payment_status = 'failed' AND created_at > NOW() - INTERVAL 1 HOUR`
  );
  const [lastWebhook] = await pool.execute<any[]>(
    `SELECT source, MAX(created_at) as last_at FROM financial_journal_entries
     WHERE reference_type = 'gateway_webhook' GROUP BY source LIMIT 1`
  );
  const [intentFailedByCategory] = await pool.execute<any[]>(
    `SELECT COALESCE(failure_category, 'unknown') as category, COUNT(*) as cnt
     FROM booking_intents
     WHERE intent_status = 'failed' AND created_at > NOW() - INTERVAL 24 HOUR
     GROUP BY failure_category`
  );
  const [successRate] = await pool.execute<any[]>(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as paid,
       SUM(CASE WHEN payment_status = 'failed' THEN 1 ELSE 0 END) as failed,
       SUM(CASE WHEN payment_status = 'refunded' THEN 1 ELSE 0 END) as refunded
     FROM payment_transactions
     WHERE created_at > NOW() - INTERVAL 7 DAY`
  );
  const [migrationRows] = await pool.execute<any[]>(
    `SELECT filename FROM migration_history ORDER BY id DESC LIMIT 1`
  );

  const provider = process.env.PAYMENT_GATEWAY_PROVIDER || 'mock';
  let gatewayConnectivity: 'ok' | 'dns_failed' | 'unreachable' | 'unknown' = 'unknown';
  if (provider === 'paymob') {
    const baseUrl = 'https://accept.paymob.com';
    try {
      const { default: https } = await import('node:https');
      const reachable = await new Promise<boolean>((resolve) => {
        const req = https.get(baseUrl, { timeout: 5000 }, (res) => {
          res.resume();
          resolve(res.statusCode != null);
        });
        req.on('error', () => resolve(false));
      });
      gatewayConnectivity = reachable ? 'ok' : 'unreachable';
    } catch {
      gatewayConnectivity = 'dns_failed';
    }
  }
  const gatewayConfigured = provider === 'mock'
    ? true
    : !!(process.env.PAYMOB_API_KEY && process.env.PAYMOB_SECRET && process.env.PAYMOB_HMAC_SECRET);

  const { readFileSync } = await import('node:fs');
  const read = (path: string, envKey: string) => {
    try { return readFileSync(path, 'utf-8').trim(); }
    catch { return process.env[envKey] || 'unknown'; }
  };
  const expectedMigration = read('/app/expected-migration.txt', 'EXPECTED_MIGRATION');
  const dbMigration = migrationRows[0]?.filename || 'none';
  const migrationSynced = expectedMigration !== 'unknown' ? dbMigration.includes(expectedMigration) || dbMigration === expectedMigration : null;

  const sr = successRate[0] || {};
  const totalPayments = Number(sr.total) || 0;
  const successCount = Number(sr.paid) || 0;
  const failedCount = Number(sr.failed) || 0;

  return reply.send({
    status: 'ok',
    applicationVersion: read('/app/version.txt', 'APP_VERSION'),
    gitCommit: read('/app/git-commit.txt', 'GIT_COMMIT'),
    provider,
    gatewayConfigured,
    gatewayConnectivity,
    pending: Object.fromEntries(pendingRows.map((r: any) => [r.payment_status, r.cnt])),
    staleOver15min: staleRows[0]?.cnt || 0,
    failedLastHour: recentFailed[0]?.cnt || 0,
    intentFailedByCategory: Object.fromEntries(intentFailedByCategory.map((r: any) => [r.category, r.cnt])),
    lastWebhookAt: lastWebhook[0]?.last_at || null,
    metrics: {
      totalPayments7d: totalPayments,
      successCount7d: successCount,
      failedCount7d: failedCount,
      successRate7d: totalPayments > 0 ? Number((successCount / totalPayments * 100).toFixed(1)) : null,
      refundedCount7d: Number(sr.refunded) || 0,
    },
    databaseMigrationVersion: dbMigration,
    expectedMigrationVersion: expectedMigration,
    migrationSynced,
    timestamp: new Date().toISOString(),
  });
}
