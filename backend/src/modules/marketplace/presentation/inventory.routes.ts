import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './inventory.controller.js';

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Warehouses
  app.get('/admin/warehouses', { preHandler: [requirePermission(['inventory.warehouses.view'])] }, ctrl.listWarehousesHandler);
  app.post('/admin/warehouses', { preHandler: [requirePermission(['inventory.warehouses.manage'])] }, ctrl.createWarehouseHandler);
  app.put('/admin/warehouses/:id', { preHandler: [requirePermission(['inventory.warehouses.manage'])] }, ctrl.updateWarehouseHandler);
  app.delete('/admin/warehouses/:id', { preHandler: [requirePermission(['inventory.warehouses.manage'])] }, ctrl.deleteWarehouseHandler);

  // Suppliers
  app.get('/admin/suppliers', { preHandler: [requirePermission(['inventory.suppliers.view'])] }, ctrl.listSuppliersHandler);
  app.post('/admin/suppliers', { preHandler: [requirePermission(['inventory.suppliers.manage'])] }, ctrl.createSupplierHandler);
  app.put('/admin/suppliers/:id', { preHandler: [requirePermission(['inventory.suppliers.manage'])] }, ctrl.updateSupplierHandler);
  app.delete('/admin/suppliers/:id', { preHandler: [requirePermission(['inventory.suppliers.manage'])] }, ctrl.deleteSupplierHandler);

  // Purchase Orders
  app.get('/admin/purchase-orders', { preHandler: [requirePermission(['inventory.purchase-orders.view'])] }, ctrl.listPurchaseOrdersHandler);
  app.post('/admin/purchase-orders', { preHandler: [requirePermission(['inventory.purchase-orders.manage'])] }, ctrl.createPurchaseOrderHandler);
  app.get('/admin/purchase-orders/:id', { preHandler: [requirePermission(['inventory.purchase-orders.view'])] }, ctrl.getPurchaseOrderHandler);
  app.put('/admin/purchase-orders/:id', { preHandler: [requirePermission(['inventory.purchase-orders.manage'])] }, ctrl.updatePurchaseOrderHandler);
  app.post('/admin/purchase-orders/:id/submit', { preHandler: [requirePermission(['inventory.purchase-orders.manage'])] }, ctrl.submitPurchaseOrderHandler);
  app.post('/admin/purchase-orders/:id/approve', { preHandler: [requirePermission(['inventory.purchase-orders.manage'])] }, ctrl.approvePurchaseOrderHandler);
  app.post('/admin/purchase-orders/:id/receive', { preHandler: [requirePermission(['inventory.purchase-orders.manage'])] }, ctrl.receivePurchaseOrderHandler);
  app.post('/admin/purchase-orders/:id/cancel', { preHandler: [requirePermission(['inventory.purchase-orders.manage'])] }, ctrl.cancelPurchaseOrderHandler);

  // Stock Transfers
  app.post('/admin/stock-transfers', { preHandler: [requirePermission(['inventory.stock.manage'])] }, ctrl.createStockTransferHandler);
  app.get('/admin/stock-transfers', { preHandler: [requirePermission(['inventory.stock.view'])] }, ctrl.listStockTransfersHandler);
  app.post('/admin/stock-transfers/:id/complete', { preHandler: [requirePermission(['inventory.stock.manage'])] }, ctrl.completeStockTransferHandler);

  // Stock Adjustment
  app.put('/admin/inventory/variants/:variantId/stock', { preHandler: [requirePermission(['inventory.stock.manage'])] }, ctrl.adjustStockHandler);

  // Inventory Logs
  app.get('/admin/inventory/logs', { preHandler: [requirePermission(['inventory.stock.view'])] }, ctrl.getInventoryLogsHandler);
}
