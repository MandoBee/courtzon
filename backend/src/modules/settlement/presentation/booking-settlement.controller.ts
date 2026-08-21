import type { FastifyRequest, FastifyReply } from 'fastify';
import { bookingSettlementService } from '../../financial/application/booking-settlement.service.js';
import { BookingSettleSchema, BookingRecoveryCollectSchema } from './settlement.dto.js';
import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import { formatZodErrorDetails } from '../../../shared/validation/zod-error.util.js';

type RowData = mysql.RowDataPacket[];

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

async function verifyOrgAccess(userId: number, orgId: number | null): Promise<boolean> {
  if (orgId == null) return false;
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT 1 FROM organisations WHERE id = ? AND owner_id = ? LIMIT 1`,
    [orgId, userId],
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

export async function listEligibleBookingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const userId = (request as any).userId;
  const organisationId = query.organisationId ? Number(query.organisationId) : null;
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);

  const admin = await isSuperAdmin(userId);
  if (!admin) {
    if (organisationId == null || !(await verifyOrgAccess(userId, organisationId))) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not have access to this organisation' });
    }
  }

  const result = await bookingSettlementService.listEligible(organisationId, page, limit);
  return reply.send(result);
}

export async function settleBookingHandler(request: FastifyRequest, reply: FastifyReply) {
  const { bookingId } = request.params as any;
  const parsed = BookingSettleSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', details: formatZodErrorDetails(parsed.error) });
  }
  const userId = (request as any).userId;

  const econ = await bookingSettlementService.getEconomics(Number(bookingId));
  if (!econ) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Booking not found' });
  }
  const admin = await isSuperAdmin(userId);
  if (!admin) {
    if (econ.organisationId == null || !(await verifyOrgAccess(userId, econ.organisationId))) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not have access to this booking' });
    }
  }
  if (econ.eligibility === 'NOT_ELIGIBLE') {
    return reply.status(409).send({ error: 'CONFLICT', message: `Booking not settlement-eligible: ${econ.eligibilityReason}` });
  }

  const result = await bookingSettlementService.settleBookingEconomics(
    Number(bookingId), parsed.data.coachAmount, parsed.data.orgAmount, userId,
  );
  return reply.send(result);
}

export async function collectBookingRecoveryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { bookingId } = request.params as any;
  const parsed = BookingRecoveryCollectSchema.safeParse(request.body || {});
  if (!parsed.success) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', details: formatZodErrorDetails(parsed.error) });
  }
  const userId = (request as any).userId;

  const econ = await bookingSettlementService.getEconomics(Number(bookingId));
  if (!econ) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Booking not found' });
  }
  const admin = await isSuperAdmin(userId);
  if (!admin) {
    if (econ.organisationId == null || !(await verifyOrgAccess(userId, econ.organisationId))) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not have access to this booking' });
    }
  }

  const result = await bookingSettlementService.collectBookingRecovery(
    Number(bookingId), parsed.data.party, parsed.data.amount, userId,
  );
  return reply.send(result);
}
