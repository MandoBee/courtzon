import type { FastifyRequest, FastifyReply } from 'fastify';
import { marketplaceComplaintService as svc } from '../application/marketplace-complaint.service.js';
import { marketplaceRepository } from '../infrastructure/repositories/marketplace.repository.js';
import { recordAudit } from '../../audit-log/index.js';
import type { ComplaintStatus, ComplaintType } from '../domain/complaint-aggregate.js';
import {
  CreateComplaintSchema, ResolveComplaintSchema, ComplaintQuerySchema,
  ApproveRefundSchema, RejectComplaintSchema, CollectReturnSchema,
} from './marketplace-complaint.dto.js';

// ── Player ──

export async function submitComplaintHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateComplaintSchema.parse(request.body);
  const userId = (request as any).userId;
  const complaint = await svc.submitComplaint(userId, { ...body, complaintType: body.complaintType as ComplaintType });
  recordAudit({ actorId: userId, action: 'MARKETPLACE.COMPLAINT.CREATE', entityType: 'complaint', entityId: complaint.id, afterState: { orderId: complaint.order_id, itemId: complaint.order_item_id } });
  return reply.status(201).send(complaint);
}

export async function getMyComplaintsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ComplaintQuerySchema.parse(request.query);
  const userId = (request as any).userId;
  const result = await svc.getMyComplaints(userId, { ...query, status: query.status as ComplaintStatus | undefined });
  return reply.send(result);
}

export async function getComplaintHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const complaint = await svc.getComplaintDetail(Number(id));
  if (complaint.buyer_id === userId) return reply.send(complaint);
  // Organisation owners may view complaints on their shop.
  const org = await marketplaceRepository.findOrgByUserId(userId, 'seller')
    || await marketplaceRepository.findOrgByUserId(userId, 'player')
    || await marketplaceRepository.findOrgByUserScope(userId);
  if (org && org.id === complaint.seller_org_id) return reply.send(complaint);
  // CourtZon admins may view any complaint.
  if (await isSuperAdmin(userId)) return reply.send(complaint);
  return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });
}

async function isSuperAdmin(userId: number): Promise<boolean> {
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();
  const [rows] = await pool.execute<any[]>(
    `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.slug IN ('super_admin','super-admin','admin') AND ur.is_active = TRUE LIMIT 1`,
    [userId],
  );
  return (rows as any[]).length > 0;
}

export async function confirmReceiptHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const complaint = await svc.confirmReceipt(userId, Number(id));
  recordAudit({ actorId: userId, action: 'MARKETPLACE.COMPLAINT.CONFIRM_RECEIPT', entityType: 'complaint', entityId: complaint.id });
  return reply.send(complaint);
}

// ── Organisation ──

export async function getOrgComplaintsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ComplaintQuerySchema.parse(request.query);
  const userId = (request as any).userId;
  const result = await svc.getOrgComplaints(userId, { ...query, status: query.status as ComplaintStatus | undefined });
  return reply.send(result);
}

export async function getOrgComplaintHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const complaint = await svc.getComplaintDetail(Number(id));
  await svc.assertOrgAccess(complaint, userId);
  return reply.send(complaint);
}

export async function reviewComplaintHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const complaint = await svc.reviewComplaint(userId, Number(id));
  recordAudit({ actorId: userId, action: 'MARKETPLACE.COMPLAINT.REVIEW', entityType: 'complaint', entityId: complaint.id, afterState: { status: complaint.status } });
  return reply.send(complaint);
}

export async function resolveComplaintHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = ResolveComplaintSchema.parse(request.body);
  const userId = (request as any).userId;
  const complaint = await svc.resolveComplaint(userId, Number(id), body);
  recordAudit({ actorId: userId, action: 'MARKETPLACE.COMPLAINT.RESOLVE', entityType: 'complaint', entityId: complaint.id, afterState: { status: complaint.status, resolutionType: complaint.resolution_type, refundAmount: complaint.refund_amount } });
  return reply.send(complaint);
}

export async function collectReturnHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = CollectReturnSchema.parse(request.body);
  const userId = (request as any).userId;
  const complaint = await svc.markCollected(userId, Number(id), body.status);
  recordAudit({ actorId: userId, action: 'MARKETPLACE.COMPLAINT.COLLECT', entityType: 'complaint', entityId: complaint.id, afterState: { collectionStatus: complaint.collection_status } });
  return reply.send(complaint);
}

export async function recordShipmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { kind } = request.params as any;
  const userId = (request as any).userId;
  const complaint = await svc.recordShipment(userId, Number(id), kind as 'replacement' | 'reshipment');
  recordAudit({ actorId: userId, action: 'MARKETPLACE.COMPLAINT.SHIP', entityType: 'complaint', entityId: complaint.id, afterState: { status: complaint.status, resolutionType: complaint.resolution_type } });
  return reply.send(complaint);
}

export async function rejectComplaintHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = RejectComplaintSchema.parse(request.body);
  const userId = (request as any).userId;
  const complaint = await svc.resolveComplaint(userId, Number(id), { resolutionType: 'rejected', rejectionReason: body.reason });
  recordAudit({ actorId: userId, action: 'MARKETPLACE.COMPLAINT.REJECT', entityType: 'complaint', entityId: complaint.id, afterState: { status: complaint.status } });
  return reply.send(complaint);
}

// ── Admin ──

export async function getAdminApprovalsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ComplaintQuerySchema.parse(request.query);
  const result = await svc.getAdminApprovals({ ...query, status: query.status as ComplaintStatus | undefined });
  return reply.send(result);
}

export async function approveRefundHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = ApproveRefundSchema.parse(request.body ?? {});
  const userId = (request as any).userId;
  const complaint = await svc.approveRefund(userId, Number(id), body.reason);
  recordAudit({ actorId: userId, action: 'MARKETPLACE.COMPLAINT.APPROVE', entityType: 'complaint', entityId: complaint.id, afterState: { status: complaint.status, approvalStatus: complaint.approval_status } });
  return reply.send(complaint);
}

export async function rejectApprovalHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = RejectComplaintSchema.parse(request.body);
  const userId = (request as any).userId;
  const complaint = await svc.rejectApproval(userId, Number(id), body.reason);
  recordAudit({ actorId: userId, action: 'MARKETPLACE.COMPLAINT.APPROVAL_REJECT', entityType: 'complaint', entityId: complaint.id, afterState: { status: complaint.status, approvalStatus: complaint.approval_status } });
  return reply.send(complaint);
}