import type { FastifyRequest, FastifyReply } from 'fastify';
import { paymentService } from '../application/payment.service.js';
import { recordAudit } from '../../audit-log/index.js';
import { ChargeSchema, RefundPaymentSchema } from './payment.dto.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('payment-controller');

export async function chargeHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = ChargeSchema.parse(request.body);
  const result = await paymentService.charge(userId, body);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PAYMENT.PROCESS',
    entityType: 'payment',
    entityId: (result as any)?.id,
    afterState: { referenceType: body.referenceType, referenceId: body.referenceId, amount: body.amount },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(result);
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
    const signature = (request.headers['x-paymob-signature'] || request.headers['x-fawry-signature'] || '') as string;
    const result = await paymentService.handleWebhook(request.body, signature);
    recordAudit({
      actorId: (request as any).userId ?? null,
      action: 'PAYMENT.WEBHOOK',
      entityType: 'payment',
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
