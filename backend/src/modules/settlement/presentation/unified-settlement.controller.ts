import type { FastifyRequest, FastifyReply } from 'fastify';
import { unifiedSettlementService as svc } from '../application/unified-settlement.service.js';
import { unifiedSettlementRepository } from '../infrastructure/repositories/unified-settlement.repository.js';
import { recordAudit } from '../../audit-log/index.js';
import { canAccessOrganisation, isPlatformAdmin, findAccessibleOrgIds } from '../../../shared/middleware/org-access.js';
import { ForbiddenError, NotFoundError } from '../../../shared/errors/app-error.js';
import { toCsv, csvFilename } from '../../../shared/utils/csv.js';
import {
  SettlementPreviewQuerySchema, CreateSettlementSchema, RecordPaymentSchema,
  CancelSettlementSchema, SettlementListQuerySchema,
} from './unified-settlement.dto.js';

export async function previewSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = SettlementPreviewQuerySchema.parse(request.query);
  const userId = (request as any).userId;
  await assertOrgAccess(userId, query.orgId);
  const result = await svc.preview(query.orgId, query.exclude);
  return reply.send(result);
}

export async function createSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateSettlementSchema.parse(request.body);
  const userId = (request as any).userId;
  await assertOrgAccess(userId, body.orgId);
  const detail = await svc.create({
    orgId: body.orgId,
    excludeEntitlementIds: body.excludeEntitlementIds,
    selectedEntitlementIds: body.selectedEntitlementIds,
    batchCode: body.batchCode,
    requestedBy: userId,
    requestedByRole: 'admin',
    notes: body.notes,
  });
  recordAudit({ actorId: userId, action: 'SETTLEMENT.CREATE', entityType: 'settlement', entityId: detail.settlement.id, afterState: { orgId: body.orgId, net: detail.settlement.net_amount, direction: detail.settlement.settlement_direction } });
  return reply.status(201).send(detail);
}

/**
 * A settlement is scoped to a single organisation. The org id comes from the
 * client, so it must be validated server-side: the actor must be a platform
 * admin or have access to that organisation. Denied before any settlement data
 * is exposed or any settlement action executes.
 */
async function assertOrgAccess(userId: number, orgId: number): Promise<void> {
  if (!userId) throw new ForbiddenError('Access to this organisation denied');
  if (await isPlatformAdmin(userId)) return;
  if (await canAccessOrganisation(userId, orgId)) return;
  throw new ForbiddenError('Access to this organisation denied');
}

/**
 * Resolve the organisation that owns a settlement from the canonical
 * settlement record (never from a client-supplied id) and assert the actor may
 * operate on it. Throws 404 when the settlement does not exist and 403 when the
 * actor is not authorised for its organisation. Must run BEFORE any protected
 * financial operation on the settlement.
 */
async function assertSettlementOrgAccess(userId: number, settlementId: number): Promise<void> {
  if (!userId) throw new ForbiddenError('Access to this organisation denied');
  const settlement = await unifiedSettlementRepository.findBySettlementId(settlementId);
  if (!settlement) throw new NotFoundError('Settlement not found');
  await assertOrgAccess(userId, Number(settlement.organisation_id));
}

/**
 * Resolve the organisation-scope filter for list/export. Returns null for
 * platform admins (no tenant restriction — all organisations). For all other
 * users returns the array of organisations they are authorised for; a
 * client-supplied orgId query filter is honoured only when the caller is
 * authorised for it (otherwise the intersection is empty, never trusted).
 */
async function resolveOrgScope(userId: number, clientOrgId?: number): Promise<number[] | null> {
  if (await isPlatformAdmin(userId)) return null;
  const accessible = await findAccessibleOrgIds(userId);
  if (!clientOrgId) return accessible;
  return accessible.includes(clientOrgId) ? [clientOrgId] : [];
}

export async function getSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  await assertSettlementOrgAccess(userId, Number(id));
  const detail = await svc.get(Number(id));
  return reply.send(detail);
}

export async function recordSettlementPaymentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = RecordPaymentSchema.parse(request.body ?? {});
  const userId = (request as any).userId;
  await assertSettlementOrgAccess(userId, Number(id));
  const detail = await svc.recordPayment(Number(id), { ...body, paidBy: userId });
  recordAudit({ actorId: userId, action: 'SETTLEMENT.PAY', entityType: 'settlement', entityId: detail.settlement.id, afterState: { status: detail.settlement.settlement_status } });
  return reply.send(detail);
}

export async function cancelSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = CancelSettlementSchema.parse(request.body ?? {});
  const userId = (request as any).userId;
  await assertSettlementOrgAccess(userId, Number(id));
  const detail = await svc.cancel(Number(id), userId, body.reason);
  recordAudit({ actorId: userId, action: 'SETTLEMENT.CANCEL', entityType: 'settlement', entityId: detail.settlement.id, afterState: { status: detail.settlement.settlement_status } });
  return reply.send(detail);
}

export async function listSettlementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = SettlementListQuerySchema.parse(request.query);
  const userId = (request as any).userId;
  const scope = await resolveOrgScope(userId, query.orgId);
  const result = await svc.list({
    status: query.status,
    batchCode: query.batchCode,
    page: query.page,
    limit: query.limit,
    ...(scope === null
      ? { orgId: query.orgId }
      : { orgIds: scope }),
  });
  return reply.send(result);
}

/** Read-only CSV export of unified settlements with canonical financials. */
export async function exportSettlementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = SettlementListQuerySchema.parse(request.query);
  const userId = (request as any).userId;
  const scope = await resolveOrgScope(userId, query.orgId);
  const rows = await svc.listForExport({
    status: query.status,
    batchCode: query.batchCode,
    ...(scope === null
      ? { orgId: query.orgId }
      : { orgIds: scope }),
  });

  const headers = [
    'Settlement ID', 'Organisation', 'Status', 'Requested Date', 'Paid Date',
    'Final Amount', 'Org Earnings', 'CourtZon Commission', 'Org Adjustments',
    'CourtZon Adjustments', 'Entitlement Count',
  ];
  const data = rows.map((r: any) => {
    const s = r.settlement;
    const f = r.financials || {};
    return [
      s.id,
      s.organisation_name || s.organisation_id,
      s.settlement_status,
      s.requested_at ? new Date(s.requested_at).toISOString() : '',
      s.paid_at ? new Date(s.paid_at).toISOString() : '',
      s.final_amount ?? f.finalAmount ?? 0,
      f.totalOrgEarnings ?? 0,
      f.totalCommission ?? 0,
      f.totalOrgAdjustments ?? 0,
      f.totalCourtZonAdjustments ?? 0,
      r.entitlements?.length ?? s.entitlement_count ?? 0,
    ];
  });

  const csv = toCsv(headers, data);
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="${csvFilename('settlements')}"`);
  return reply.send(csv);
}