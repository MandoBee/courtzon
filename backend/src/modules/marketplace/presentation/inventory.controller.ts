import type { FastifyRequest, FastifyReply } from 'fastify';
import mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';
import {
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/app-error.js';

type RowData = mysql.RowDataPacket[];

/**
 * Platform-admin scope: the canonical `super_admin` / `super-admin` role.
 * Mirrors shared/middleware/org-access.ts `isPlatformAdmin` — never inferred
 * from a client-supplied id.
 */
async function isPlatformAdminUser(userId: number): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT 1 FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.slug IN ('super_admin', 'super-admin') AND ur.is_active = TRUE
     LIMIT 1`,
    [userId],
  );
  return rows.length > 0;
}

/**
 * Tenant authority for Inventory, composing the established models:
 *   • organisation owner (`organisations.owner_id`)
 *   • explicit `user_organisations` membership (as used by accounting)
 *   • active organisation role scope (`user_role_scopes`, as used by
 *     `requireOrganisationAccess` / marketplace seller resolution)
 *   • platform administrator (`super_admin` role)
 * A client-supplied organisation id is only ever a *request*; it is accepted
 * only when it passes this check.
 */
async function userCanAccessOrganisation(userId: number, orgId: number): Promise<boolean> {
  if (!userId || !orgId) return false;
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT 1 FROM organisations o
     LEFT JOIN user_organisations uo
       ON uo.organisation_id = o.id AND uo.user_id = ?
     WHERE o.id = ? AND o.deleted_at IS NULL
       AND (
         o.owner_id = ?
         OR uo.id IS NOT NULL
         OR EXISTS (
           SELECT 1 FROM user_role_scopes urs
           JOIN user_roles ur ON ur.id = urs.user_role_id
           WHERE ur.user_id = ? AND urs.scope_type = 'organisation'
             AND urs.scope_id = o.id AND ur.is_active = TRUE
         )
         OR EXISTS (
           SELECT 1 FROM user_roles ur2
           JOIN roles r ON r.id = ur2.role_id
           WHERE ur2.user_id = ? AND r.slug IN ('super_admin', 'super-admin')
             AND ur2.is_active = TRUE
         )
       )
     LIMIT 1`,
    [userId, orgId, userId, userId, userId],
  );
  return rows.length > 0;
}

/** Organisations the actor may operate on (owner ∪ membership ∪ org role scope). */
interface PermittedOrganisation {
  id: number;
  name: string;
}

/**
 * Single source of truth for Inventory organisation scope. Used by both
 * `resolveOrgId` (authorization) and `GET /admin/inventory/organisations`
 * (selector), so the UI can never disagree with the backend.
 *
 * Deliberately excludes `roles.organisation_id` role clones: the canonical
 * organisation-access policy (`canAccessOrganisation`, accounting's
 * `validateOrgAccess`, marketplace seller resolution) does not treat a role
 * clone alone as organisation membership.
 */
async function findPermittedOrganisations(userId: number): Promise<PermittedOrganisation[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT DISTINCT o.id, o.name
     FROM organisations o
     LEFT JOIN user_organisations uo
       ON uo.organisation_id = o.id AND uo.user_id = ?
     WHERE o.is_active = TRUE AND o.deleted_at IS NULL
       AND (
         o.owner_id = ?
         OR uo.id IS NOT NULL
         OR EXISTS (
           SELECT 1 FROM user_role_scopes urs
           JOIN user_roles ur ON ur.id = urs.user_role_id
           WHERE ur.user_id = ? AND urs.scope_type = 'organisation'
             AND urs.scope_id = o.id AND ur.is_active = TRUE
         )
       )
     ORDER BY o.name ASC`,
    [userId, userId, userId],
  );
  return (rows as any[]).map((row) => ({ id: Number(row.id), name: String(row.name ?? '') }));
}

/**
 * Resolve the organisation scope of the current request.
 *
 * `?orgId=` is treated as a request for an organisation, never as authority:
 * the actor must pass `userCanAccessOrganisation`. Without `orgId`, the scope
 * is derived from the actor's membership records. Platform administrators have
 * no implicit tenant (their access spans organisations), so they must name one.
 */
async function resolveOrgId(request: FastifyRequest): Promise<number> {
  const userId = (request as any).userId;
  if (!userId) throw new AuthenticationError();

  const query = request.query as any;
  const raw = query?.orgId;
  let requestedOrgId: number | null = null;
  if (raw !== undefined && raw !== null && raw !== '') {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ValidationError('Invalid organisation id');
    }
    requestedOrgId = parsed;
  }

  if (requestedOrgId !== null) {
    if (!(await userCanAccessOrganisation(userId, requestedOrgId))) {
      throw new ForbiddenError('You do not have access to this organisation');
    }
    return requestedOrgId;
  }

  if (await isPlatformAdminUser(userId)) {
    throw new ValidationError('organisationId is required for platform administrators');
  }

  const permitted = await findPermittedOrganisations(userId);
  if (!permitted.length) throw new ForbiddenError('No organisation access');
  if (permitted.length > 1) {
    throw new ValidationError('organisationId is required when multiple organisations are accessible');
  }
  return permitted[0].id;
}

/** Reject a referenced supplier that is not owned by the resolved organisation. */
async function assertSupplierOwned(conn: mysql.PoolConnection, supplierId: number, orgId: number): Promise<void> {
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    throw new ValidationError('Invalid supplier for this organisation');
  }
  const [rows] = await conn.execute<RowData>(
    'SELECT id FROM suppliers WHERE id = ? AND organisation_id = ? LIMIT 1',
    [supplierId, orgId],
  );
  if (!rows.length) throw new ValidationError('Invalid supplier for this organisation');
}

/** Reject a referenced warehouse that is not owned by the resolved organisation. */
async function assertWarehouseOwned(conn: mysql.PoolConnection, warehouseId: number, orgId: number): Promise<void> {
  if (!Number.isInteger(warehouseId) || warehouseId <= 0) {
    throw new ValidationError('Invalid warehouse for this organisation');
  }
  const [rows] = await conn.execute<RowData>(
    'SELECT id FROM warehouses WHERE id = ? AND organisation_id = ? LIMIT 1',
    [warehouseId, orgId],
  );
  if (!rows.length) throw new ValidationError('Invalid warehouse for this organisation');
}

/** Reject a referenced variant whose owning product (`products.seller_id`) is
 * not the resolved organisation. `FOR UPDATE` is applied by callers that are
 * about to mutate stock inside a transaction.
 */
async function assertVariantOwned(
  conn: mysql.PoolConnection,
  variantId: number,
  orgId: number,
  forUpdate = false,
): Promise<void> {
  if (!Number.isInteger(variantId) || variantId <= 0) {
    throw new ValidationError('Invalid variant for this organisation');
  }
  const [rows] = await conn.execute<RowData>(
    `SELECT pv.id FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
     WHERE pv.id = ? AND p.seller_id = ? AND p.deleted_at IS NULL
     ${forUpdate ? 'FOR UPDATE' : ''}`,
    [variantId, orgId],
  );
  if (!rows.length) throw new ValidationError('Invalid variant for this organisation');
}

/** Safe pagination bounds shared by the admin Inventory list endpoints. */
function parsePagination(query: any, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, Number(query?.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(query?.limit) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Normalise the purchase-order body once at the API boundary so the secured
 * business logic below only ever sees camelCase fields.
 */
function normalizePurchaseOrderBody(raw: any) {
  const body = raw ?? {};
  return {
    supplierId: body.supplierId ?? body.supplier_id,
    warehouseId: body.warehouseId ?? body.warehouse_id,
    notes: body.notes,
    items: Array.isArray(body.items)
      ? body.items.map((item: any) => ({
          variantId: item.variantId ?? item.variant_id,
          quantity: item.quantity,
          unitCost: item.unitCost ?? item.unit_cost ?? 0,
        }))
      : [],
  };
}

// ── Stock levels & variant search (frontend contracts) ──

/**
 * GET /admin/inventory/organisations
 *
 * Returns exactly the organisations the Phase A resolver will authorise for
 * this actor, so the UI can never offer an organisation the backend rejects
 * and never omits a valid membership. Canonical policy (mirrors
 * `resolveOrgId` / `userCanAccessOrganisation`):
 *   • organisation owner
 *   • explicit `user_organisations` membership
 *   • active organisation role scope (`user_role_scopes`)
 *   • platform administrator → all active organisations
 * Role-clone organisations (`roles.organisation_id`) are intentionally NOT
 * part of the established organisation-access policy and are excluded.
 */
export async function listInventoryOrganisationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  if (!userId) throw new AuthenticationError();
  const pool = getPool();

  if (await isPlatformAdminUser(userId)) {
    const [rows] = await pool.execute<RowData>(
      `SELECT id, name FROM organisations
       WHERE is_active = TRUE AND deleted_at IS NULL
       ORDER BY name ASC
       LIMIT 500`,
    );
    return reply.send({ data: rows, requiresExplicitSelection: true });
  }

  const orgs = await findPermittedOrganisations(userId);
  return reply.send({
    data: orgs,
    requiresExplicitSelection: orgs.length > 1,
  });
}

/**
 * GET /admin/inventory/stock
 * Canonical stock is `product_variants.quantity`; products belong to the
 * organisation through `products.seller_id`.
 */
export async function listStockLevelsHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrgId(request);
  const pool = getPool();
  const query = request.query as any;
  const { page, limit, offset } = parsePagination(query, 20, 100);

  const conditions = ['p.seller_id = ?', 'p.deleted_at IS NULL'];
  const params: any[] = [orgId];
  if (query.search) {
    conditions.push('(pv.variant_name LIKE ? OR pv.sku LIKE ? OR p.name LIKE ?)');
    const pattern = `%${query.search}%`;
    params.push(pattern, pattern, pattern);
  }
  const where = 'WHERE ' + conditions.join(' AND ');
  const from = `FROM product_variants pv
    JOIN products p ON p.id = pv.product_id`;

  const [countRows] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total ${from} ${where}`,
    params,
  );
  const [rows] = await pool.query<RowData>(
    `SELECT pv.id, pv.variant_name, pv.sku, pv.quantity AS current_stock,
       pv.min_stock_level, pv.max_stock_level, pv.cost_price,
       p.name AS product_name
     ${from}
     ${where}
     ORDER BY pv.variant_name ASC, pv.id ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return reply.send({ data: rows, total: Number(countRows?.[0]?.total ?? 0), page, limit });
}

/** GET /admin/inventory/variants/search?q= — capped at 20 rows. */
export async function searchInventoryVariantsHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrgId(request);
  const pool = getPool();
  const query = request.query as any;
  const term = String(query.q ?? '').trim();
  if (term.length < 2) return reply.send({ data: [] });

  const pattern = `%${term}%`;
  const [rows] = await pool.execute<RowData>(
    `SELECT pv.id, pv.variant_name AS name, pv.sku, pv.quantity AS current_stock
     FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
     WHERE p.seller_id = ? AND p.deleted_at IS NULL
       AND (pv.variant_name LIKE ? OR pv.sku LIKE ?)
     ORDER BY pv.variant_name ASC
     LIMIT 20`,
    [orgId, pattern, pattern],
  );
  return reply.send({ data: rows });
}

/**
 * POST /admin/inventory/stock/adjust
 * Thin adapter over the Phase A-secured `adjustStockHandler`: the UI sends
 * `variant_id` / `new_quantity`, the secured handler expects the variant in the
 * path and `quantity` in the body. No second adjustment implementation exists.
 */
export async function adjustStockFromFrontendHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = (request.body as any) ?? {};
  const variantId = Number(body.variant_id ?? body.variantId);
  if (!Number.isInteger(variantId) || variantId <= 0) {
    throw new ValidationError('variant_id must be a positive integer');
  }
  const newQuantity = Number(body.new_quantity ?? body.newQuantity);
  if (!Number.isInteger(newQuantity) || newQuantity < 0) {
    throw new ValidationError('new_quantity must be a non-negative integer');
  }
  (request as any).params = { ...((request as any).params ?? {}), variantId: String(variantId) };
  (request as any).body = {
    quantity: newQuantity,
    reason: body.reason,
    warehouseId: body.warehouse_id ?? body.warehouseId,
  };
  return adjustStockHandler(request, reply);
}

/**
 * POST /admin/inventory/stock/transfer
 * Thin adapter over the Phase A-secured `createStockTransferHandler`.
 */
export async function createStockTransferFromFrontendHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = (request.body as any) ?? {};
  const variantId = Number(body.variant_id ?? body.variantId);
  const quantity = Number(body.quantity);
  const fromWarehouseId = body.from_warehouse_id ?? body.fromWarehouseId ?? null;
  const toWarehouseId = body.to_warehouse_id ?? body.toWarehouseId ?? null;

  if (!Number.isInteger(variantId) || variantId <= 0) {
    throw new ValidationError('variant_id must be a positive integer');
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ValidationError('quantity must be a positive integer');
  }
  for (const [label, value] of [['from_warehouse_id', fromWarehouseId], ['to_warehouse_id', toWarehouseId]] as const) {
    if (value !== null && value !== undefined && (!Number.isInteger(Number(value)) || Number(value) <= 0)) {
      throw new ValidationError(`${label} must be a positive integer`);
    }
  }

  (request as any).body = {
    variantId,
    quantity,
    fromWarehouseId: fromWarehouseId === null || fromWarehouseId === undefined ? null : Number(fromWarehouseId),
    toWarehouseId: toWarehouseId === null || toWarehouseId === undefined ? null : Number(toWarehouseId),
  };
  return createStockTransferHandler(request, reply);
}

// ── Warehouses ──
export async function listWarehousesHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrgId(request);
  const pool = getPool();
  const query = request.query as any;
  const { page, limit, offset } = parsePagination(query, 20, 500);
  const conditions = ['organisation_id = ?'];
  const params: any[] = [orgId];
  if (query.search) {
    conditions.push('(name LIKE ? OR location LIKE ?)');
    const pattern = `%${query.search}%`;
    params.push(pattern, pattern);
  }
  const where = 'WHERE ' + conditions.join(' AND ');
  const [countRows] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total FROM warehouses ${where}`,
    params,
  );
  const [rows] = await pool.query<RowData>(
    `SELECT * FROM warehouses ${where} ORDER BY name ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return reply.send({ data: rows, total: Number(countRows[0]?.total ?? 0), page, limit });
}

export async function createWarehouseHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrgId(request);
  const body = request.body as any;
  const pool = getPool();
  const [result] = await pool.execute<RowData>(
    'INSERT INTO warehouses (organisation_id, name, location, status) VALUES (?, ?, ?, ?)',
    [orgId, body.name, body.location ?? null, body.status ?? 'active'],
  );
  const id = (result as any).insertId;
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'WAREHOUSE.CREATE',
    entityType: 'warehouse',
    entityId: id,
    afterState: { name: body.name, organisationId: orgId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ id });
}

export async function updateWarehouseHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const orgId = await resolveOrgId(request);
  const body = request.body as any;
  const pool = getPool();

  // Partial updates are supported so the UI's archive action (status only)
  // keeps working. Status semantics are unchanged.
  const fields: string[] = [];
  const params: any[] = [];
  if (body.name !== undefined) { fields.push('name = ?'); params.push(body.name); }
  if (body.location !== undefined) { fields.push('location = ?'); params.push(body.location); }
  if (body.status !== undefined) { fields.push('status = ?'); params.push(body.status); }
  if (!fields.length) throw new ValidationError('No warehouse fields to update');

  const [result] = await pool.execute<RowData>(
    `UPDATE warehouses SET ${fields.join(', ')} WHERE id = ? AND organisation_id = ?`,
    [...params, Number(id), orgId],
  );
  if (!(result as any).affectedRows) return reply.status(404).send({ error: 'Warehouse not found' });
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'WAREHOUSE.UPDATE',
    entityType: 'warehouse',
    entityId: Number(id),
    afterState: { name: body.name, status: body.status },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function deleteWarehouseHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const orgId = await resolveOrgId(request);
  const pool = getPool();
  const [result] = await pool.execute<RowData>(
    'DELETE FROM warehouses WHERE id = ? AND organisation_id = ?',
    [Number(id), orgId],
  );
  if (!(result as any).affectedRows) return reply.status(404).send({ error: 'Warehouse not found' });
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'WAREHOUSE.DELETE',
    entityType: 'warehouse',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

// ── Suppliers ──
export async function listSuppliersHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrgId(request);
  const pool = getPool();
  const query = request.query as any;
  const { page, limit, offset } = parsePagination(query, 20, 500);
  const conditions = ['organisation_id = ?'];
  const params: any[] = [orgId];
  if (query.search) {
    conditions.push('(name LIKE ? OR contact_name LIKE ? OR email LIKE ?)');
    const pattern = `%${query.search}%`;
    params.push(pattern, pattern, pattern);
  }
  const where = 'WHERE ' + conditions.join(' AND ');
  const [countRows] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total FROM suppliers ${where}`,
    params,
  );
  const [rows] = await pool.query<RowData>(
    `SELECT *, contact_name AS contact_person FROM suppliers ${where} ORDER BY name ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return reply.send({ data: rows, total: Number(countRows[0]?.total ?? 0), page, limit });
}

/** Accept both the UI's snake_case payload and the legacy camelCase payload. */
function normalizeSupplierBody(raw: any) {
  const body = raw ?? {};
  return {
    name: body.name,
    contactName: body.contact_person ?? body.contactName ?? null,
    email: body.email ?? null,
    phone: body.phone ?? null,
    paymentTerms: body.payment_terms ?? body.paymentTerms ?? null,
    leadTimeDays: body.lead_time_days ?? body.leadTimeDays ?? 0,
    status: body.status ?? 'active',
  };
}

export async function createSupplierHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrgId(request);
  const body = normalizeSupplierBody(request.body);
  const pool = getPool();
  const [result] = await pool.execute<RowData>(
    `INSERT INTO suppliers (organisation_id, name, contact_name, email, phone, payment_terms, lead_time_days, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [orgId, body.name, body.contactName, body.email, body.phone,
     body.paymentTerms, body.leadTimeDays, body.status],
  );
  const id = (result as any).insertId;
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SUPPLIER.CREATE',
    entityType: 'supplier',
    entityId: id,
    afterState: { name: body.name, organisationId: orgId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ id });
}

export async function updateSupplierHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const orgId = await resolveOrgId(request);
  const body = normalizeSupplierBody(request.body);
  const pool = getPool();
  const [result] = await pool.execute<RowData>(
    `UPDATE suppliers SET name = ?, contact_name = ?, email = ?, phone = ?, payment_terms = ?,
     lead_time_days = ?, status = ? WHERE id = ? AND organisation_id = ?`,
    [body.name, body.contactName, body.email, body.phone,
     body.paymentTerms, body.leadTimeDays, body.status, Number(id), orgId],
  );
  if (!(result as any).affectedRows) return reply.status(404).send({ error: 'Supplier not found' });
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SUPPLIER.UPDATE',
    entityType: 'supplier',
    entityId: Number(id),
    afterState: { name: body.name },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function deleteSupplierHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const orgId = await resolveOrgId(request);
  const pool = getPool();
  const [result] = await pool.execute<RowData>(
    'DELETE FROM suppliers WHERE id = ? AND organisation_id = ?',
    [Number(id), orgId],
  );
  if (!(result as any).affectedRows) return reply.status(404).send({ error: 'Supplier not found' });
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'SUPPLIER.DELETE',
    entityType: 'supplier',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

// ── Purchase Orders ──
export async function listPurchaseOrdersHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrgId(request);
  const pool = getPool();
  const query = request.query as any;
  const { page, limit, offset } = parsePagination(query, 20, 100);
  const conditions = ['po.organisation_id = ?'];
  const params: any[] = [orgId];
  if (query.status) {
    conditions.push('po.status = ?');
    params.push(query.status);
  }
  if (query.search) {
    conditions.push('(s.name LIKE ? OR po.notes LIKE ? OR CAST(po.id AS CHAR) LIKE ?)');
    const pattern = `%${query.search}%`;
    params.push(pattern, pattern, pattern);
  }
  const where = 'WHERE ' + conditions.join(' AND ');
  const baseFrom = `FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN warehouses w ON w.id = po.warehouse_id`;
  const [countRows] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total ${baseFrom} ${where}`,
    params,
  );
  const [rows] = await pool.query<RowData>(
    `SELECT po.*, s.name AS supplier_name, w.name AS warehouse_name,
       (SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id = po.id) AS items_count
     ${baseFrom}
     ${where}
     ORDER BY po.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return reply.send({ data: rows, total: Number(countRows[0]?.total ?? 0), page, limit });
}

export async function createPurchaseOrderHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrgId(request);
  const body = normalizePurchaseOrderBody(request.body);
  const userId = (request as any).userId;
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Ownership of every referenced entity is validated inside this
    // transaction so a foreign organisation id can never reach the inserts.
    const supplierId = Number(body.supplierId);
    await assertSupplierOwned(conn, supplierId, orgId);
    const warehouseId = body.warehouseId !== undefined && body.warehouseId !== null && body.warehouseId !== ''
      ? Number(body.warehouseId)
      : null;
    if (warehouseId !== null) await assertWarehouseOwned(conn, warehouseId, orgId);
    if (body.items?.length) {
      const checkedVariants = new Set<number>();
      for (const item of body.items) {
        const variantId = Number(item.variantId);
        if (!checkedVariants.has(variantId)) {
          await assertVariantOwned(conn, variantId, orgId);
          checkedVariants.add(variantId);
        }
      }
    }

    const [poResult] = await conn.execute<RowData>(
      `INSERT INTO purchase_orders (organisation_id, supplier_id, warehouse_id, status, total_cost, notes, created_by)
       VALUES (?, ?, ?, 'draft', 0, ?, ?)`,
      [orgId, body.supplierId, body.warehouseId ?? null, body.notes ?? null, userId],
    );
    const poId = (poResult as any).insertId;
    let totalCost = 0;
    if (body.items?.length) {
      for (const item of body.items) {
        const total = Number(item.unitCost || 0) * Number(item.quantity || 0);
        totalCost += total;
        await conn.execute<RowData>(
          `INSERT INTO purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost, total_cost)
           VALUES (?, ?, ?, ?, ?)`,
          [poId, item.variantId, item.quantity, item.unitCost ?? 0, total],
        );
      }
    }
    await conn.execute<RowData>('UPDATE purchase_orders SET total_cost = ? WHERE id = ?', [totalCost, poId]);
    await conn.commit();
    recordAudit({
      actorId: userId ?? null,
      action: 'PURCHASE_ORDER.CREATE',
      entityType: 'purchase_order',
      entityId: poId,
      afterState: { supplierId: body.supplierId, totalCost },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.status(201).send({ id: poId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function getPurchaseOrderHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const orgId = await resolveOrgId(request);
  const pool = getPool();
  const [poRows] = await pool.execute<RowData>(
    'SELECT po.*, s.name AS supplier_name, w.name AS warehouse_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id LEFT JOIN warehouses w ON w.id = po.warehouse_id WHERE po.id = ? AND po.organisation_id = ?',
    [Number(id), orgId],
  );
  if (!poRows.length) return reply.status(404).send({ error: 'Purchase order not found' });
  const [items] = await pool.execute<RowData>(
    `SELECT poi.*, pv.variant_name, pv.sku, p.name AS product_name
     FROM purchase_order_items poi
     JOIN product_variants pv ON pv.id = poi.variant_id
     JOIN products p ON p.id = pv.product_id
     WHERE poi.purchase_order_id = ?`,
    [Number(id)],
  );
  return reply.send({ ...poRows[0], items, data: { ...poRows[0], items } });
}

export async function updatePurchaseOrderHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const orgId = await resolveOrgId(request);
  const body = normalizePurchaseOrderBody(request.body);
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [poRows] = await conn.execute<RowData>(
      'SELECT id, status FROM purchase_orders WHERE id = ? AND organisation_id = ? FOR UPDATE',
      [Number(id), orgId],
    );
    if (!poRows.length) return reply.status(404).send({ error: 'Purchase order not found' });
    if (poRows[0].status !== 'draft') return reply.status(400).send({ error: 'Can only update draft orders' });

    // Referenced entities must belong to the resolved organisation.
    await assertSupplierOwned(conn, Number(body.supplierId), orgId);
    const updateWarehouseId = body.warehouseId !== undefined && body.warehouseId !== null && body.warehouseId !== ''
      ? Number(body.warehouseId)
      : null;
    if (updateWarehouseId !== null) await assertWarehouseOwned(conn, updateWarehouseId, orgId);
    if (body.items?.length) {
      const checkedVariants = new Set<number>();
      for (const item of body.items) {
        const variantId = Number(item.variantId);
        if (!checkedVariants.has(variantId)) {
          await assertVariantOwned(conn, variantId, orgId);
          checkedVariants.add(variantId);
        }
      }
    }

    await conn.execute<RowData>(
      'UPDATE purchase_orders SET supplier_id = ?, warehouse_id = ?, notes = ? WHERE id = ?',
      [body.supplierId, body.warehouseId ?? null, body.notes ?? null, Number(id)],
    );
    await conn.execute<RowData>('DELETE FROM purchase_order_items WHERE purchase_order_id = ?', [Number(id)]);
    let totalCost = 0;
    if (body.items?.length) {
      for (const item of body.items) {
        const total = Number(item.unitCost || 0) * Number(item.quantity || 0);
        totalCost += total;
        await conn.execute<RowData>(
          `INSERT INTO purchase_order_items (purchase_order_id, variant_id, quantity, unit_cost, total_cost)
           VALUES (?, ?, ?, ?, ?)`,
          [Number(id), item.variantId, item.quantity, item.unitCost ?? 0, total],
        );
      }
    }
    await conn.execute<RowData>('UPDATE purchase_orders SET total_cost = ? WHERE id = ?', [totalCost, Number(id)]);
    await conn.commit();
    recordAudit({
      actorId: (request as any).userId ?? null,
      action: 'PURCHASE_ORDER.UPDATE',
      entityType: 'purchase_order',
      entityId: Number(id),
      afterState: { supplierId: body.supplierId, totalCost },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.send({ success: true });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function transitionPurchaseOrder(poId: number, orgId: number, newStatus: string, request: FastifyRequest): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    'SELECT id, status FROM purchase_orders WHERE id = ? AND organisation_id = ?',
    [poId, orgId],
  );
  if (!rows.length) return false;
  const transitions: Record<string, string[]> = {
    draft: ['submitted'],
    submitted: ['approved', 'cancelled'],
    approved: ['received', 'cancelled'],
    received: [],
    cancelled: [],
  };
  const current = rows[0].status;
  if (!transitions[current]?.includes(newStatus)) {
    throw new Error(`Cannot transition from ${current} to ${newStatus}`);
  }
  await pool.execute<RowData>('UPDATE purchase_orders SET status = ? WHERE id = ?', [newStatus, poId]);
  return true;
}

export async function submitPurchaseOrderHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const orgId = await resolveOrgId(request);
  try {
    const found = await transitionPurchaseOrder(Number(id), orgId, 'submitted', request);
    if (!found) return reply.status(404).send({ error: 'Purchase order not found' });
  } catch (e: any) {
    return reply.status(400).send({ error: e.message });
  }
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PURCHASE_ORDER.SUBMIT',
    entityType: 'purchase_order',
    entityId: Number(id),
    afterState: { status: 'submitted' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function approvePurchaseOrderHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const orgId = await resolveOrgId(request);
  try {
    const found = await transitionPurchaseOrder(Number(id), orgId, 'approved', request);
    if (!found) return reply.status(404).send({ error: 'Purchase order not found' });
  } catch (e: any) {
    return reply.status(400).send({ error: e.message });
  }
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PURCHASE_ORDER.APPROVE',
    entityType: 'purchase_order',
    entityId: Number(id),
    afterState: { status: 'approved' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function receivePurchaseOrderHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const orgId = await resolveOrgId(request);
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [poRows] = await conn.execute<RowData>(
      'SELECT id, status, warehouse_id FROM purchase_orders WHERE id = ? AND organisation_id = ? FOR UPDATE',
      [Number(id), orgId],
    );
    if (!poRows.length) return reply.status(404).send({ error: 'Purchase order not found' });
    if (poRows[0].status !== 'approved') return reply.status(400).send({ error: 'Purchase order must be approved before receiving' });
    const warehouseId = poRows[0].warehouse_id;
    const [items] = await conn.execute<RowData>(
      'SELECT * FROM purchase_order_items WHERE purchase_order_id = ?',
      [Number(id)],
    );
    for (const item of items) {
      const pendingQty = item.quantity - (item.received_qty || 0);
      if (pendingQty <= 0) continue;
      const [varRows] = await conn.execute<RowData>(
        `SELECT pv.id, pv.quantity FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.id = ? AND p.seller_id = ? AND p.deleted_at IS NULL
         FOR UPDATE`,
        [item.variant_id, orgId],
      );
      if (!varRows.length) continue;
      const stockBefore = Number(varRows[0].quantity);
      const stockAfter = stockBefore + pendingQty;
      await conn.execute<RowData>(
        'INSERT INTO inventory_logs (variant_id, warehouse_id, movement_type, quantity, stock_before, stock_after, reason, reference_type, reference_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [item.variant_id, warehouseId, 'in', pendingQty, stockBefore, stockAfter, 'Purchase order received', 'purchase_order', Number(id), (request as any).userId],
      );
      await conn.execute<RowData>('UPDATE product_variants SET quantity = ? WHERE id = ?', [stockAfter, item.variant_id]);
      await conn.execute<RowData>('UPDATE purchase_order_items SET received_qty = received_qty + ? WHERE id = ?', [pendingQty, item.id]);
    }
    await conn.execute<RowData>(
      "UPDATE purchase_orders SET status = 'received', received_at = NOW() WHERE id = ?",
      [Number(id)],
    );
    await conn.commit();
    recordAudit({
      actorId: (request as any).userId ?? null,
      action: 'PURCHASE_ORDER.RECEIVE',
      entityType: 'purchase_order',
      entityId: Number(id),
      afterState: { status: 'received' },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.send({ success: true });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function cancelPurchaseOrderHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const orgId = await resolveOrgId(request);
  try {
    const found = await transitionPurchaseOrder(Number(id), orgId, 'cancelled', request);
    if (!found) return reply.status(404).send({ error: 'Purchase order not found' });
  } catch (e: any) {
    return reply.status(400).send({ error: e.message });
  }
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PURCHASE_ORDER.CANCEL',
    entityType: 'purchase_order',
    entityId: Number(id),
    afterState: { status: 'cancelled' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

/**
 * Frontend-compatible status endpoint: maps a requested status onto the
 * existing guarded transition handlers. No new transitions are introduced —
 * unsupported targets are rejected before any state change.
 */
const PURCHASE_ORDER_STATUS_ACTIONS: Record<
  string,
  (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>
> = {
  submitted: submitPurchaseOrderHandler,
  approved: approvePurchaseOrderHandler,
  received: receivePurchaseOrderHandler,
  cancelled: cancelPurchaseOrderHandler,
};

export async function updatePurchaseOrderStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const status = (request.body as any)?.status;
  if (typeof status !== 'string' || !PURCHASE_ORDER_STATUS_ACTIONS[status]) {
    throw new ValidationError(`Unsupported purchase order status '${String(status ?? '')}'`);
  }
  return PURCHASE_ORDER_STATUS_ACTIONS[status](request, reply);
}

// ── Stock Transfers ──
export async function createStockTransferHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const userId = (request as any).userId;
  const orgId = await resolveOrgId(request);
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const variantId = Number(body.variantId);
    const qty = Number(body.quantity);
    const fromWhId = body.fromWarehouseId ? Number(body.fromWarehouseId) : null;
    const toWhId = body.toWarehouseId ? Number(body.toWarehouseId) : null;

    // Referenced warehouses and the variant must belong to the actor's org.
    if (fromWhId !== null) await assertWarehouseOwned(conn, fromWhId, orgId);
    if (toWhId !== null) await assertWarehouseOwned(conn, toWhId, orgId);

    const [varRows] = await conn.execute<RowData>(
      `SELECT pv.id, pv.quantity FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       WHERE pv.id = ? AND p.seller_id = ? AND p.deleted_at IS NULL
       FOR UPDATE`,
      [variantId, orgId],
    );
    if (!varRows.length) throw new ValidationError('Invalid variant for this organisation');
    const stockBefore = Number(varRows[0].quantity);
    if (fromWhId && stockBefore < qty) return reply.status(400).send({ error: 'Insufficient stock' });
    const [result] = await conn.execute<RowData>(
      'INSERT INTO stock_transfers (variant_id, from_warehouse_id, to_warehouse_id, quantity, status, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [variantId, fromWhId, toWhId, qty, 'pending', userId],
    );
    const transferId = (result as any).insertId;
    if (fromWhId) {
      const stockAfter = stockBefore - qty;
      await conn.execute<RowData>(
        'INSERT INTO inventory_logs (variant_id, warehouse_id, movement_type, quantity, stock_before, stock_after, reason, reference_type, reference_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [variantId, fromWhId, 'out', -qty, stockBefore, stockAfter, 'Stock transfer out', 'stock_transfer', transferId, userId],
      );
      await conn.execute<RowData>('UPDATE product_variants SET quantity = ? WHERE id = ?', [stockAfter, variantId]);
    }
    await conn.commit();
    recordAudit({
      actorId: userId ?? null,
      action: 'STOCK_TRANSFER.CREATE',
      entityType: 'stock_transfer',
      entityId: transferId,
      afterState: { variantId, quantity: qty, fromWarehouseId: fromWhId, toWarehouseId: toWhId },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.status(201).send({ id: transferId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function listStockTransfersHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrgId(request);
  const pool = getPool();
  const query = request.query as any;
  let sql = `SELECT st.*, pv.variant_name, pv.sku, p.name AS product_name,
    fw.name AS from_warehouse_name, tw.name AS to_warehouse_name
    FROM stock_transfers st
    JOIN product_variants pv ON pv.id = st.variant_id
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN warehouses fw ON fw.id = st.from_warehouse_id
    LEFT JOIN warehouses tw ON tw.id = st.to_warehouse_id
    WHERE p.seller_id = ?`;
  const params: any[] = [orgId];
  if (query.status) {
    sql += ' AND st.status = ?';
    params.push(query.status);
  }
  sql += ' ORDER BY st.created_at DESC';
  const [rows] = await pool.execute<RowData>(sql, params);
  return reply.send({ data: rows });
}

export async function completeStockTransferHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const orgId = await resolveOrgId(request);
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [trRows] = await conn.execute<RowData>(
      `SELECT st.* FROM stock_transfers st
       JOIN product_variants pv ON pv.id = st.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE st.id = ? AND st.status = ? AND p.seller_id = ? AND p.deleted_at IS NULL
       FOR UPDATE`,
      [Number(id), 'pending', orgId],
    );
    if (!trRows.length) throw new NotFoundError('Pending stock transfer');
    const transfer = trRows[0];
    if (transfer.to_warehouse_id) {
      await assertWarehouseOwned(conn, Number(transfer.to_warehouse_id), orgId);
      const [varRows] = await conn.execute<RowData>(
        `SELECT pv.id, pv.quantity FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.id = ? AND p.seller_id = ? AND p.deleted_at IS NULL
         FOR UPDATE`,
        [transfer.variant_id, orgId],
      );
      if (!varRows.length) throw new NotFoundError('Variant');
      const stockBefore = Number(varRows[0].quantity);
      const stockAfter = stockBefore + Number(transfer.quantity);
      await conn.execute<RowData>(
        'INSERT INTO inventory_logs (variant_id, warehouse_id, movement_type, quantity, stock_before, stock_after, reason, reference_type, reference_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [transfer.variant_id, transfer.to_warehouse_id, 'in', Number(transfer.quantity), stockBefore, stockAfter, 'Stock transfer in', 'stock_transfer', Number(id), userId],
      );
      await conn.execute<RowData>('UPDATE product_variants SET quantity = ? WHERE id = ?', [stockAfter, transfer.variant_id]);
    }
    await conn.execute<RowData>(
      "UPDATE stock_transfers SET status = 'completed', completed_at = NOW() WHERE id = ?",
      [Number(id)],
    );
    await conn.commit();
    recordAudit({
      actorId: userId ?? null,
      action: 'STOCK_TRANSFER.COMPLETE',
      entityType: 'stock_transfer',
      entityId: Number(id),
      afterState: { status: 'completed' },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.send({ success: true });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── Stock Adjustment ──
export async function adjustStockHandler(request: FastifyRequest, reply: FastifyReply) {
  const { variantId } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;
  const orgId = await resolveOrgId(request);
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // The variant is loaded together with its owning product and only when the
    // product belongs to the resolved organisation. The ownership predicate is
    // part of the locked read, so a foreign variant can never be updated.
    const [varRows] = await conn.execute<RowData>(
      `SELECT pv.id, pv.quantity, pv.product_id, p.seller_id AS organisation_id
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       WHERE pv.id = ? AND p.seller_id = ? AND p.deleted_at IS NULL
       FOR UPDATE`,
      [Number(variantId), orgId],
    );
    if (!varRows.length) throw new NotFoundError('Variant');
    const stockBefore = Number(varRows[0].quantity);
    const newQuantity = Number(body.quantity);
    const delta = newQuantity - stockBefore;
    const warehouseId = body.warehouseId ? Number(body.warehouseId) : null;
    if (warehouseId !== null) await assertWarehouseOwned(conn, warehouseId, orgId);
    await conn.execute<RowData>(
      'INSERT INTO inventory_logs (variant_id, warehouse_id, movement_type, quantity, stock_before, stock_after, reason, reference_type, reference_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [Number(variantId), warehouseId, 'adjustment', delta, stockBefore, newQuantity, body.reason ?? 'Manual adjustment', 'adjustment', null, userId],
    );
    await conn.execute<RowData>('UPDATE product_variants SET quantity = ? WHERE id = ?', [newQuantity, Number(variantId)]);
    await conn.commit();
    recordAudit({
      actorId: userId ?? null,
      action: 'STOCK.ADJUST',
      entityType: 'product_variant',
      entityId: Number(variantId),
      afterState: { quantityBefore: stockBefore, quantityAfter: newQuantity, reason: body.reason },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.send({ success: true, stockBefore, stockAfter: newQuantity });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── Inventory Logs ──
export async function getInventoryLogsHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrgId(request);
  const pool = getPool();
  const query = request.query as any;
  const { page, limit, offset } = parsePagination(query, 20, 100);

  const conditions = ['p.seller_id = ?', 'p.deleted_at IS NULL'];
  const params: any[] = [orgId];
  const variantId = query.variantId ?? query.variant_id;
  const warehouseId = query.warehouseId ?? query.warehouse_id;
  if (variantId) {
    conditions.push('il.variant_id = ?');
    params.push(Number(variantId));
  }
  if (warehouseId) {
    conditions.push('il.warehouse_id = ?');
    params.push(Number(warehouseId));
  }
  if (query.from) {
    conditions.push('il.created_at >= ?');
    params.push(query.from);
  }
  if (query.to) {
    conditions.push('il.created_at <= ?');
    params.push(query.to);
  }
  const where = 'WHERE ' + conditions.join(' AND ');
  const from = `FROM inventory_logs il
    JOIN product_variants pv ON pv.id = il.variant_id
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN warehouses w ON w.id = il.warehouse_id`;

  const [countRows] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total ${from} ${where}`,
    params,
  );
  const [rows] = await pool.query<RowData>(
    `SELECT il.*, pv.variant_name, pv.sku, p.name AS product_name,
       il.quantity AS quantity_change, il.stock_before AS quantity_before,
       il.stock_after AS quantity_after, w.name AS warehouse_name
     ${from}
     ${where}
     ORDER BY il.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return reply.send({ data: rows, total: Number(countRows[0]?.total ?? 0), page, limit });
}
