import type { FastifyRequest, FastifyReply } from 'fastify';
import { settlementService } from '../application/settlement.service.js';
import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

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