import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../../../database/mysql.js';
import { ledgerService } from '../application/ledger.service.js';
import { ledgerRepository } from '../infrastructure/repositories/ledger.repository.js';
import { RevenueQuerySchema, LedgerQuerySchema } from './ledger.dto.js';

export async function getRevenueHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = RevenueQuerySchema.parse(request.query);
  const data = await ledgerService.getRevenue(query.from, query.to);
  return reply.send({ data });
}

export async function getLedgerHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = LedgerQuerySchema.parse(request.query);
  const data = await ledgerRepository.findByDateRange(query.from, query.to, {
    accountType: query.accountType,
    accountCode: query.accountCode,
  });
  return reply.send({ data });
}

export async function getEntryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { sourceType, sourceId } = request.params as any;
  const data = await ledgerRepository.findBySource(sourceType, Number(sourceId));
  return reply.send({ data });
}

export async function getWalletSummaryHandler(_request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const [rows] = await pool.execute<any[]>(
    'SELECT COALESCE(SUM(balance), 0) AS total_balance, COUNT(*) AS total_wallets FROM user_wallets',
  );
  const r = rows[0];
  return reply.send({
    data: {
      totalBalance: Number(r.total_balance),
      totalWallets: Number(r.total_wallets),
      currencyCode: 'EGP',
    },
  });
}
