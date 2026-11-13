import type { FastifyReply, FastifyRequest } from 'fastify';
import { ConflictError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { isPlatformAdmin } from '../../../shared/middleware/org-access.js';
import { assertOrgAccess } from '../../settlement/presentation/unified-settlement.controller.js';
import { refundCaseService } from '../application/refund-case.service.js';
import {
  CreateRefundCaseSchema,
  FailPayoutSchema,
  RecordPayoutSchema,
  RejectRefundCaseSchema,
} from './refund.dto.js';

const clean = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

export async function createRefundCaseHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateRefundCaseSchema.parse(request.body);
  const actorId = Number((request as any).userId);
  await assertOrgAccess(actorId, body.organisationId);
  const data = await refundCaseService.requestCase(clean({ ...body, requestedBy: actorId }));
  return reply.status(201).send({ data });
}

export async function listRefundCasesHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const actorId = Number((request as any).userId);
  const organisationId = query.organisationId ? Number(query.organisationId) : undefined;
  if (organisationId) {
    await assertOrgAccess(actorId, organisationId);
  } else if (!(await isPlatformAdmin(actorId))) {
    throw new ForbiddenError('organisationId is required to list refunds');
  }
  const data = await refundCaseService.list({
    organisationId,
    status: query.status,
    domain: query.domain,
    page: query.page,
    limit: query.limit,
  });
  return reply.send({ data: data.rows, total: data.total });
}

const csvCell = (value: unknown): string => {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export async function exportRefundCasesHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const actorId = Number((request as any).userId);
  const organisationId = query.organisationId ? Number(query.organisationId) : undefined;
  if (!organisationId) throw new ConflictError('organisationId is required to export refunds');
  await assertOrgAccess(actorId, organisationId);

  const { rows } = await refundCaseService.list({
    organisationId,
    status: query.status,
    domain: query.domain,
    page: 1,
    limit: 100,
  });

  const header = [
    'public_id',
    'domain',
    'source_type',
    'source_id',
    'status',
    'operational_status',
    'payout_status',
    'currency',
    'canceled_value_cents',
    'approved_refund_cents',
    'paid_cents',
    'approved_by',
    'created_at',
  ];
  const body = rows.map((row) =>
    [
      row.public_id,
      row.domain,
      row.source_type,
      row.source_id,
      row.status,
      row.operational_status,
      row.payout_status,
      row.currency,
      row.canceled_value_cents,
      row.approved_refund_cents,
      row.paid_cents,
      row.approved_by,
      row.created_at,
    ]
      .map(csvCell)
      .join(','),
  );

  return reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', 'attachment; filename="refunds.csv"')
    .send([header.join(','), ...body].join('\n'));
}

export async function getRefundCaseHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const actorId = Number((request as any).userId);
  const data = await refundCaseService.get(id);
  await assertOrgAccess(actorId, data.case.organisation_id);
  return reply.send({ data });
}

export async function approveRefundCaseHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const actorId = Number((request as any).userId);
  const existing = await refundCaseService.get(id);
  await assertOrgAccess(actorId, existing.case.organisation_id);
  const data = await refundCaseService.approve(existing.case.id, actorId);
  return reply.send({ data });
}

export async function rejectRefundCaseHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const actorId = Number((request as any).userId);
  const body = RejectRefundCaseSchema.parse(request.body);
  const existing = await refundCaseService.get(id);
  await assertOrgAccess(actorId, existing.case.organisation_id);
  const data = await refundCaseService.reject(existing.case.id, actorId, body.reason);
  return reply.send({ data });
}

export async function retryOperationalHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const actorId = Number((request as any).userId);
  const existing = await refundCaseService.get(id);
  await assertOrgAccess(actorId, existing.case.organisation_id);
  const data = await refundCaseService.retryOperational(existing.case.id, actorId);
  return reply.send({ data });
}

export async function recordPayoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const actorId = Number((request as any).userId);
  const body = RecordPayoutSchema.parse(request.body);
  const existing = await refundCaseService.get(id);
  await assertOrgAccess(actorId, existing.case.organisation_id);
  const data = await refundCaseService.recordPayout(existing.case.id, actorId, body);
  return reply.status(201).send({ data });
}

export async function confirmPayoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id, payoutId } = request.params as any;
  const actorId = Number((request as any).userId);
  const existing = await refundCaseService.get(id);
  await assertOrgAccess(actorId, existing.case.organisation_id);
  const data = await refundCaseService.confirmPayout(existing.case.id, Number(payoutId), actorId);
  return reply.send({ data });
}

export async function failPayoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id, payoutId } = request.params as any;
  const actorId = Number((request as any).userId);
  const body = FailPayoutSchema.parse(request.body);
  const existing = await refundCaseService.get(id);
  await assertOrgAccess(actorId, existing.case.organisation_id);
  const data = await refundCaseService.failPayout(existing.case.id, Number(payoutId), actorId, body.reason);
  return reply.send({ data });
}
