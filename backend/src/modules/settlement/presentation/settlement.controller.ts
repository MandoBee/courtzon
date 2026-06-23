import type { FastifyRequest, FastifyReply } from 'fastify';
import { settlementService } from '../application/settlement.service.js';
import {
  RequestSettlementSchema, ApproveSettlementSchema, MarkPaidSchema,
  RejectSettlementSchema, CancelSettlementSchema,
} from './settlement.dto.js';
import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import { isZodError, formatZodErrorDetails } from '../../../shared/validation/zod-error.util.js';
import { AppError } from '../../../shared/errors/app-error.js';

type RowData = mysql.RowDataPacket[];

async function getUserRoleInOrg(userId: number, orgId: number): Promise<string> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT r.slug FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND ur.is_active = TRUE
       AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
     ORDER BY CASE r.slug
       WHEN 'super_admin' THEN 1
       WHEN 'admin' THEN 2
       WHEN 'org_admin' THEN 3
       WHEN 'seller' THEN 4
       ELSE 5
     END LIMIT 1`,
    [userId],
  );
  return rows.length ? (rows[0] as any).slug : 'user';
}

async function verifyOrgOwnership(userId: number, orgId: number): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT 1 FROM organisations WHERE id = ? AND (owner_id = ? OR ? IN (
       SELECT user_id FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.slug IN ('super_admin', 'super-admin', 'admin')
     )) LIMIT 1`,
    [orgId, userId, userId, userId],
  );
  if (rows.length) return true;
  const [scopeRows] = await pool.execute<RowData>(
    `SELECT 1 FROM user_role_scopes urs
     JOIN user_roles ur ON ur.id = urs.user_role_id
     WHERE ur.user_id = ? AND urs.scope_type = 'organisation' AND urs.scope_id = ?
       AND ur.is_active = TRUE LIMIT 1`,
    [userId, orgId],
  );
  return scopeRows.length > 0;
}

async function isSuperAdmin(userId: number): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT 1 FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.slug IN ('super_admin', 'super-admin')
       AND ur.is_active = TRUE LIMIT 1`,
    [userId],
  );
  return rows.length > 0;
}

export async function requestSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const parsed = RequestSettlementSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', details: formatZodErrorDetails(parsed.error) });
  }
  const { organisationId, branchId } = parsed.data;
  const userId = (request as any).userId;

  const admin = await isSuperAdmin(userId);
  if (!admin) {
    const owns = await verifyOrgOwnership(userId, organisationId);
    if (!owns) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not have access to this organisation' });
    }
  }

  const userRole = await getUserRoleInOrg(userId, organisationId);
  const result = await settlementService.requestSettlement({
    organisationId,
    branchId,
    requestedBy: userId,
    requestedByRole: userRole,
  });
  return reply.status(201).send(result);
}

export async function approveSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const parsed = ApproveSettlementSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', details: formatZodErrorDetails(parsed.error) });
  }
  const userId = (request as any).userId;
  const result = await settlementService.approveSettlement(Number(id), userId, parsed.data.notes);
  return reply.send(result);
}

export async function markPaidHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const parsed = MarkPaidSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', details: formatZodErrorDetails(parsed.error) });
  }
  const result = await settlementService.markPaid(Number(id), parsed.data.bankAccountId, parsed.data.transferReference);
  return reply.send(result);
}

export async function completeSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const result = await settlementService.completeSettlement(Number(id));
  return reply.send(result);
}

export async function rejectSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const parsed = RejectSettlementSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', details: formatZodErrorDetails(parsed.error) });
  }
  const result = await settlementService.rejectSettlement(Number(id), parsed.data.reason);
  return reply.send(result);
}

export async function cancelSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const parsed = CancelSettlementSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', details: formatZodErrorDetails(parsed.error) });
  }
  const result = await settlementService.cancelSettlement(Number(id), parsed.data.reason);
  return reply.send(result);
}

export async function getSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const detail = await settlementService.getSettlementDetail(Number(id));
  const admin = await isSuperAdmin(userId);
  if (!admin) {
    const owns = await verifyOrgOwnership(userId, detail.organisation_id);
    if (!owns) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not have access to this settlement' });
    }
  }
  return reply.send(detail);
}

export async function getSettlementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const userId = (request as any).userId;
  const admin = await isSuperAdmin(userId);

  const result = await settlementService.getSettlements({
    status: query.status,
    orgId: query.orgId ? Number(query.orgId) : undefined,
    branchId: query.branchId ? Number(query.branchId) : undefined,
    from: query.from,
    to: query.to,
    page: Number(query.page || 1),
    limit: Number(query.limit || 20),
  });

  if (!admin) {
    const filtered = { ...result, data: [] as any[] };
    for (const s of result.data as any[]) {
      const owns = await verifyOrgOwnership(userId, s.organisation_id);
      if (owns) filtered.data.push(s);
    }
    filtered.total = filtered.data.length;
    return reply.send(filtered);
  }
  return reply.send(result);
}

export async function getOrgSettlementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { organisationId } = request.params as any;
  const { page = 1, limit = 20 } = request.query as any;
  const userId = (request as any).userId;

  const admin = await isSuperAdmin(userId);
  if (!admin) {
    const owns = await verifyOrgOwnership(userId, Number(organisationId));
    if (!owns) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not have access to this organisation' });
    }
  }

  const result = await settlementService.getOrganisationSettlements(
    Number(organisationId), Number(page), Number(limit),
  );
  return reply.send(result);
}
