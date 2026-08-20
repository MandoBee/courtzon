import type mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { getPool } from '../../../../database/mysql.js';
import { ConflictError } from '../../../../shared/errors/app-error.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import type {
  ComplaintStatus, ComplaintType, ResolutionType, CollectionStatus, ApprovalStatus,
} from '../../domain/complaint-aggregate.js';

type RowData = mysql.RowDataPacket[];
type Executor = mysql.Pool | mysql.PoolConnection;

function resolvePool(conn?: mysql.PoolConnection): Executor {
  return conn ?? getPool();
}

export interface ComplaintRecord {
  id: number;
  public_id: string;
  order_id: number;
  order_item_id: number;
  product_id: number;
  buyer_id: number;
  seller_org_id: number;
  complaint_type: ComplaintType;
  reason: string;
  images: string[] | null;
  attempt_number: number;
  status: ComplaintStatus;
  resolution_type: ResolutionType | null;
  disputed_value: number;
  refund_amount: number | null;
  refund_ratio: number | null;
  refund_reason: string | null;
  needs_return: boolean;
  collection_status: CollectionStatus;
  collection_due_at: Date | null;
  collection_completed_at: Date | null;
  replacement_sent_at: Date | null;
  reshipment_sent_at: Date | null;
  receipt_awaited: boolean;
  receipt_due_at: Date | null;
  receipt_confirmed_at: Date | null;
  admin_approval_required: boolean;
  approval_status: ApprovalStatus;
  approved_by: number | null;
  approved_at: Date | null;
  approval_reason: string | null;
  rejected_reason: string | null;
  resolved_by: number | null;
  resolved_at: Date | null;
  entitlement_ids: number[] | null;
  aggregate_version: number;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
}

export class ComplaintVersionConflict extends ConflictError {
  constructor(id: number, expectedVersion: number, actualVersion: number) {
    super(`Complaint ${id} version conflict: expected ${expectedVersion}, actual ${actualVersion}`);
  }
}

function mapRow(row: any): ComplaintRecord {
  return {
    id: row.id,
    public_id: row.public_id,
    order_id: row.order_id,
    order_item_id: row.order_item_id,
    product_id: row.product_id,
    buyer_id: row.buyer_id,
    seller_org_id: row.seller_org_id,
    complaint_type: row.complaint_type,
    reason: row.reason,
    images: row.images ? (typeof row.images === 'string' ? JSON.parse(row.images) : row.images) : null,
    attempt_number: row.attempt_number,
    status: row.status,
    resolution_type: row.resolution_type,
    disputed_value: Number(row.disputed_value),
    refund_amount: row.refund_amount == null ? null : Number(row.refund_amount),
    refund_ratio: row.refund_ratio == null ? null : Number(row.refund_ratio),
    refund_reason: row.refund_reason,
    needs_return: !!row.needs_return,
    collection_status: row.collection_status,
    collection_due_at: row.collection_due_at,
    collection_completed_at: row.collection_completed_at,
    replacement_sent_at: row.replacement_sent_at,
    reshipment_sent_at: row.reshipment_sent_at,
    receipt_awaited: !!row.receipt_awaited,
    receipt_due_at: row.receipt_due_at,
    receipt_confirmed_at: row.receipt_confirmed_at,
    admin_approval_required: !!row.admin_approval_required,
    approval_status: row.approval_status,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    approval_reason: row.approval_reason,
    rejected_reason: row.rejected_reason,
    resolved_by: row.resolved_by,
    resolved_at: row.resolved_at,
    entitlement_ids: row.entitlement_ids
      ? (typeof row.entitlement_ids === 'string' ? JSON.parse(row.entitlement_ids) : row.entitlement_ids)
      : null,
    aggregate_version: row.aggregate_version,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const marketplaceComplaintRepository = {
  async create(data: {
    orderId: number; orderItemId: number; productId: number; buyerId: number; sellerOrgId: number;
    complaintType: ComplaintType; reason: string; images?: string[]; attemptNumber: number;
    disputedValue: number; createdBy: number;
  }, conn?: mysql.PoolConnection): Promise<number> {
    const db = resolvePool(conn);
    const [result] = await db.execute<mysql.ResultSetHeader>(
      `INSERT INTO marketplace_complaints
        (public_id, order_id, order_item_id, product_id, buyer_id, seller_org_id,
         complaint_type, reason, images, attempt_number, disputed_value, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(), data.orderId, data.orderItemId, data.productId, data.buyerId, data.sellerOrgId,
        data.complaintType, data.reason, data.images ? JSON.stringify(data.images) : null,
        data.attemptNumber, data.disputedValue, data.createdBy,
      ],
    );
    return result.insertId;
  },

  async findById(id: number, conn?: mysql.PoolConnection): Promise<ComplaintRecord | null> {
    const db = resolvePool(conn);
    const [rows] = await db.execute<RowData>(
      'SELECT * FROM marketplace_complaints WHERE id = ?',
      [id],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async findByPublicId(publicId: string): Promise<ComplaintRecord | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM marketplace_complaints WHERE public_id = ?',
      [publicId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async findByBuyer(buyerId: number, filters: { status?: ComplaintStatus; page: number; limit: number }): Promise<{ data: ComplaintRecord[]; total: number; page: number; limit: number }> {
    const pool = getPool();
    const conditions = ['buyer_id = ?'];
    const params: any[] = [buyerId];
    if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [countRows] = await pool.execute<RowData>(`SELECT COUNT(*) as total FROM marketplace_complaints ${where}`, params);
    const total = Number((countRows[0] as any).total);
    const pag = buildPagination(filters.page, filters.limit);
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM marketplace_complaints ${where} ORDER BY created_at DESC${paginationClause(pag)}`,
      params,
    );
    return { data: rows.map(mapRow), total, page: pag.page, limit: pag.limit };
  },

  async findBySeller(sellerOrgId: number, filters: { status?: ComplaintStatus; page: number; limit: number }): Promise<{ data: ComplaintRecord[]; total: number; page: number; limit: number }> {
    const pool = getPool();
    const conditions = ['seller_org_id = ?'];
    const params: any[] = [sellerOrgId];
    if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [countRows] = await pool.execute<RowData>(`SELECT COUNT(*) as total FROM marketplace_complaints ${where}`, params);
    const total = Number((countRows[0] as any).total);
    const pag = buildPagination(filters.page, filters.limit);
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM marketplace_complaints ${where} ORDER BY created_at DESC${paginationClause(pag)}`,
      params,
    );
    return { data: rows.map(mapRow), total, page: pag.page, limit: pag.limit };
  },

  async findPendingApprovals(filters: { status?: ComplaintStatus; page: number; limit: number }): Promise<{ data: ComplaintRecord[]; total: number; page: number; limit: number }> {
    const pool = getPool();
    const conditions: string[] = ["approval_status = 'pending'"];
    const params: any[] = [];
    if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [countRows] = await pool.execute<RowData>(`SELECT COUNT(*) as total FROM marketplace_complaints ${where}`, params);
    const total = Number((countRows[0] as any).total);
    const pag = buildPagination(filters.page, filters.limit);
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM marketplace_complaints ${where} ORDER BY created_at DESC${paginationClause(pag)}`,
      params,
    );
    return { data: rows.map(mapRow), total, page: pag.page, limit: pag.limit };
  },

  /** Count of prior complaint attempts for an order_item (transaction-safe when called inside a locked transaction). */
  async countByOrderItem(orderItemId: number, conn?: mysql.PoolConnection): Promise<number> {
    const db = resolvePool(conn);
    const [rows] = await db.execute<RowData>(
      'SELECT COUNT(*) as total FROM marketplace_complaints WHERE order_item_id = ?',
      [orderItemId],
    );
    return Number((rows[0] as any).total);
  },

  async countByOrder(orderId: number): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT COUNT(*) as total FROM marketplace_complaints WHERE order_id = ?',
      [orderId],
    );
    return Number((rows[0] as any).total);
  },

  async updateStatus(
    id: number,
    status: ComplaintStatus,
    expectedVersion: number,
    extra?: Record<string, any>,
    conn?: mysql.PoolConnection,
  ): Promise<void> {
    const db = resolvePool(conn);
    const fields: string[] = ['status = ?', 'aggregate_version = aggregate_version + 1'];
    const params: any[] = [status];
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    }
    params.push(id, expectedVersion);
    const [result] = await db.execute<mysql.ResultSetHeader>(
      `UPDATE marketplace_complaints SET ${fields.join(', ')} WHERE id = ? AND aggregate_version = ?`,
      params,
    );
    if (result.affectedRows === 0) {
      const [rows] = await db.execute<RowData>(
        'SELECT aggregate_version, status FROM marketplace_complaints WHERE id = ?',
        [id],
      );
      const actual = (rows[0] as any);
      throw new ComplaintVersionConflict(id, expectedVersion, actual?.aggregate_version ?? 0);
    }
  },

  async updateFields(id: number, fields: Record<string, any>): Promise<void> {
    const pool = getPool();
    const keys = Object.keys(fields);
    if (!keys.length) return;
    const set = keys.map((k) => `${k} = ?`).join(', ');
    const params = keys.map((k) => fields[k]);
    params.push(id);
    await pool.execute(`UPDATE marketplace_complaints SET ${set}, aggregate_version = aggregate_version + 1 WHERE id = ?`, params);
  },
};