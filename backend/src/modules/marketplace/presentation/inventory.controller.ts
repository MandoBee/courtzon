import type { FastifyRequest, FastifyReply } from 'fastify';
import mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';

type RowData = mysql.RowDataPacket[];

async function resolveOrgId(request: FastifyRequest): Promise<number> {
  const query = request.query as any;
  if (query?.orgId) return Number(query.orgId);
  const userId = (request as any).userId;
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    'SELECT id FROM organisations WHERE owner_id = ? AND is_active = TRUE AND deleted_at IS NULL LIMIT 1',
    [userId],
  );
  if (!rows.length) throw new Error('No organisation found for user');
  return rows[0].id;
}

// ── Warehouses ──
export async function listWarehousesHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrgId(request);
  const pool = getPool();
  const [rows] = await pool.execute<RowData>('SELECT * FROM warehouses WHERE organisation_id = ? ORDER BY name ASC', [orgId]);
  return reply.send({ data: rows });
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
  const [result] = await pool.execute<RowData>(
    'UPDATE warehouses SET name = ?, location = ?, status = ? WHERE id = ? AND organisation_id = ?',
    [body.name, body.location ?? null, body.status ?? 'active', Number(id), orgId],
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
  const [rows] = await pool.execute<RowData>('SELECT * FROM suppliers WHERE organisation_id = ? ORDER BY name ASC', [orgId]);
  return reply.send({ data: rows });
}

export async function createSupplierHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrgId(request);
  const body = request.body as any;
  const pool = getPool();
  const [result] = await pool.execute<RowData>(
    `INSERT INTO suppliers (organisation_id, name, contact_name, email, phone, payment_terms, lead_time_days, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [orgId, body.name, body.contactName ?? null, body.email ?? null, body.phone ?? null,
     body.paymentTerms ?? null, body.leadTimeDays ?? 0, body.status ?? 'active'],
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
  const body = request.body as any;
  const pool = getPool();
  const [result] = await pool.execute<RowData>(
    `UPDATE suppliers SET name = ?, contact_name = ?, email = ?, phone = ?, payment_terms = ?,
     lead_time_days = ?, status = ? WHERE id = ? AND organisation_id = ?`,
    [body.name, body.contactName ?? null, body.email ?? null, body.phone ?? null,
     body.paymentTerms ?? null, body.leadTimeDays ?? 0, body.status ?? 'active', Number(id), orgId],
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
  let sql = `SELECT po.*, s.name AS supplier_name,
    (SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id = po.id) AS items_count
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.organisation_id = ?`;
  const params: any[] = [orgId];
  if (query.status) {
    sql += ' AND po.status = ?';
    params.push(query.status);
  }
  sql += ' ORDER BY po.created_at DESC';
  const [rows] = await pool.execute<RowData>(sql, params);
  return reply.send({ data: rows });
}

export async function createPurchaseOrderHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = await resolveOrgId(request);
  const body = request.body as any;
  const userId = (request as any).userId;
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
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
  return reply.send({ ...poRows[0], items });
}

export async function updatePurchaseOrderHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const orgId = await resolveOrgId(request);
  const body = request.body as any;
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
        'SELECT id, quantity FROM product_variants WHERE id = ? FOR UPDATE',
        [item.variant_id],
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

// ── Stock Transfers ──
export async function createStockTransferHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const userId = (request as any).userId;
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const variantId = Number(body.variantId);
    const qty = Number(body.quantity);
    const fromWhId = body.fromWarehouseId ? Number(body.fromWarehouseId) : null;
    const toWhId = body.toWarehouseId ? Number(body.toWarehouseId) : null;
    const [varRows] = await conn.execute<RowData>(
      'SELECT id, quantity FROM product_variants WHERE id = ? FOR UPDATE',
      [variantId],
    );
    if (!varRows.length) return reply.status(404).send({ error: 'Variant not found' });
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
    WHERE st.created_by IN (SELECT id FROM users WHERE id IN (
      SELECT owner_id FROM organisations WHERE id = ?
    ))`;
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
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [trRows] = await conn.execute<RowData>(
      'SELECT * FROM stock_transfers WHERE id = ? AND status = ? FOR UPDATE',
      [Number(id), 'pending'],
    );
    if (!trRows.length) return reply.status(404).send({ error: 'Pending stock transfer not found' });
    const transfer = trRows[0];
    if (transfer.to_warehouse_id) {
      const [varRows] = await conn.execute<RowData>(
        'SELECT id, quantity FROM product_variants WHERE id = ? FOR UPDATE',
        [transfer.variant_id],
      );
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
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [varRows] = await conn.execute<RowData>(
      'SELECT id, quantity FROM product_variants WHERE id = ? FOR UPDATE',
      [Number(variantId)],
    );
    if (!varRows.length) return reply.status(404).send({ error: 'Variant not found' });
    const stockBefore = Number(varRows[0].quantity);
    const newQuantity = Number(body.quantity);
    const delta = newQuantity - stockBefore;
    const warehouseId = body.warehouseId ? Number(body.warehouseId) : null;
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
  const pool = getPool();
  const query = request.query as any;
  let sql = `SELECT il.*, pv.variant_name, pv.sku, p.name AS product_name
    FROM inventory_logs il
    JOIN product_variants pv ON pv.id = il.variant_id
    JOIN products p ON p.id = pv.product_id
    WHERE 1=1`;
  const params: any[] = [];
  if (query.variantId) {
    sql += ' AND il.variant_id = ?';
    params.push(Number(query.variantId));
  }
  if (query.warehouseId) {
    sql += ' AND il.warehouse_id = ?';
    params.push(Number(query.warehouseId));
  }
  if (query.from) {
    sql += ' AND il.created_at >= ?';
    params.push(query.from);
  }
  if (query.to) {
    sql += ' AND il.created_at <= ?';
    params.push(query.to);
  }
  sql += ' ORDER BY il.created_at DESC LIMIT 200';
  const [rows] = await pool.execute<RowData>(sql, params);
  return reply.send({ data: rows });
}
