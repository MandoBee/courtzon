import type { FastifyRequest, FastifyReply } from 'fastify';
import { walletService } from '../application/wallet.service.js';
import { DepositSchema, WithdrawSchema, WalletQuerySchema } from './wallet.dto.js';
import { recordAudit } from '../../audit-log/index.js';

export async function getMyWalletHandler(_request: FastifyRequest, reply: FastifyReply) {
  const userId = (_request as any).userId;
  const wallet = await walletService.getMyWallet(userId);
  return reply.send(wallet);
}

export async function depositHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = DepositSchema.parse(request.body);
  const { isPaymentMethodAllowedForWalletTopup } = await import('../../../shared/constants/payment-methods.js');
  if (!isPaymentMethodAllowedForWalletTopup(body.paymentMethod)) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'This payment method cannot be used to top up your wallet',
    });
  }
  const result = await walletService.deposit(userId, body.amount, body.paymentMethod, body.returnUrl);
  recordAudit({
    actorId: userId ?? null,
    action: 'WALLET.DEPOSIT',
    entityType: 'wallet',
    entityId: userId,
    afterState: { amount: body.amount, paymentMethod: body.paymentMethod },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function withdrawHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = WithdrawSchema.parse(request.body);
  const result = await walletService.withdraw(userId, body.amount, body.notes, body.branchFinancialDetailsId);
  recordAudit({
    actorId: userId ?? null,
    action: 'WALLET.WITHDRAW',
    entityType: 'wallet',
    entityId: userId,
    afterState: { amount: body.amount, branchFinancialDetailsId: body.branchFinancialDetailsId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(result);
}

export async function getTransactionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const query = WalletQuerySchema.parse(request.query);
  const result = await walletService.getTransactions(userId, query);
  return reply.send(result);
}
