import type { FastifyInstance } from 'fastify';
import {
  authMiddleware,
  requirePermission,
  requirePlatformAdmin,
} from '../../../shared/middleware/auth.middleware.js';
import {
  requireOrgInventoryAccess,
  requireOrgInventoryPermission,
} from '../application/inventory-access.js';
import * as ctrl from './inventory.controller.js';

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  const platformAdminGuard = requirePlatformAdmin();
  // Legacy `/admin/*` Inventory is a platform-administration surface. It must
  // never be reachable with an organisation-bound Inventory permission, so the
  // platform-admin guard runs before the granular `requirePermission(...)`
  // checks below. Organisation users must use `/org/:orgId/inventory/*`.
  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0];
    if (path === '/admin' || path.startsWith('/admin/')) {
      return platformAdminGuard(request, reply);
    }
  });

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
  app.post('/admin/stock-transfers/:id/cancel', { preHandler: [requirePermission(['inventory.stock.manage'])] }, ctrl.cancelStockTransferHandler);

  // Stock Adjustment
  app.put('/admin/inventory/variants/:variantId/stock', { preHandler: [requirePermission(['inventory.stock.manage'])] }, ctrl.adjustStockHandler);

  // Inventory Logs
  app.get('/admin/inventory/logs', { preHandler: [requirePermission(['inventory.stock.view'])] }, ctrl.getInventoryLogsHandler);

  // ── Frontend-compatible aliases (/admin/inventory/*) ───────────────────────
  // The admin SPA calls a nested /admin/inventory/* namespace. These routes
  // reuse the same handlers (and therefore the same tenant/ownership checks and
  // permission keys) as the legacy /admin/* endpoints above.

  // Stock levels, variant search, adjustment and transfer
  app.get(
    '/admin/inventory/organisations',
    {
      preHandler: [requirePermission([
        'inventory.stock.view',
        'inventory.stock.manage',
        'inventory.warehouses.view',
        'inventory.warehouses.manage',
        'inventory.suppliers.view',
        'inventory.suppliers.manage',
        'inventory.purchase-orders.view',
        'inventory.purchase-orders.manage',
      ])],
    },
    ctrl.listInventoryOrganisationsHandler,
  );
  app.get('/admin/inventory/stock', { preHandler: [requirePermission(['inventory.stock.view'])] }, ctrl.listStockLevelsHandler);
  app.get(
    '/admin/inventory/variants/search',
    { preHandler: [requirePermission(['inventory.stock.view', 'inventory.stock.manage', 'inventory.purchase-orders.manage'])] },
    ctrl.searchInventoryVariantsHandler,
  );
  app.post('/admin/inventory/stock/adjust', { preHandler: [requirePermission(['inventory.stock.manage'])] }, ctrl.adjustStockFromFrontendHandler);
  app.post('/admin/inventory/stock/transfer', { preHandler: [requirePermission(['inventory.stock.manage'])] }, ctrl.createStockTransferFromFrontendHandler);
  app.get('/admin/inventory/stock/logs', { preHandler: [requirePermission(['inventory.stock.view'])] }, ctrl.getInventoryLogsHandler);

  // Warehouses
  app.get('/admin/inventory/warehouses', { preHandler: [requirePermission(['inventory.warehouses.view'])] }, ctrl.listWarehousesHandler);
  app.post('/admin/inventory/warehouses', { preHandler: [requirePermission(['inventory.warehouses.manage'])] }, ctrl.createWarehouseHandler);
  app.put('/admin/inventory/warehouses/:id', { preHandler: [requirePermission(['inventory.warehouses.manage'])] }, ctrl.updateWarehouseHandler);

  // Suppliers
  app.get('/admin/inventory/suppliers', { preHandler: [requirePermission(['inventory.suppliers.view'])] }, ctrl.listSuppliersHandler);
  app.post('/admin/inventory/suppliers', { preHandler: [requirePermission(['inventory.suppliers.manage'])] }, ctrl.createSupplierHandler);
  app.put('/admin/inventory/suppliers/:id', { preHandler: [requirePermission(['inventory.suppliers.manage'])] }, ctrl.updateSupplierHandler);

  // Purchase orders
  app.get('/admin/inventory/purchase-orders', { preHandler: [requirePermission(['inventory.purchase-orders.view'])] }, ctrl.listPurchaseOrdersHandler);
  app.post('/admin/inventory/purchase-orders', { preHandler: [requirePermission(['inventory.purchase-orders.manage'])] }, ctrl.createPurchaseOrderHandler);
  app.get('/admin/inventory/purchase-orders/:id', { preHandler: [requirePermission(['inventory.purchase-orders.view'])] }, ctrl.getPurchaseOrderHandler);
  app.put('/admin/inventory/purchase-orders/:id/status', { preHandler: [requirePermission(['inventory.purchase-orders.manage'])] }, ctrl.updatePurchaseOrderStatusHandler);

  // ── Organisation workspace (/org/:orgId/inventory/*) ───────────────────────
  // Same handlers, same tenant checks, but the organisation comes from the
  // route and the permission must be granted by a role bound to THAT
  // organisation. Platform administrators keep their platform-wide access.
  // The legacy `/admin/*` route definitions stay the same; they are now
  // restricted to platform administrators by the hook above.

  const orgBase = '/org/:orgId/inventory';

  // Effective capabilities for the route organisation (page/tab/button gating).
  app.get(`${orgBase}/access`, { preHandler: [requireOrgInventoryAccess()] }, ctrl.getOrgInventoryAccessHandler);

  // Stock levels, variant search, adjustment, transfer and logs.
  app.get(`${orgBase}/stock`, { preHandler: [requireOrgInventoryPermission(['inventory.stock.view'])] }, ctrl.listStockLevelsHandler);
  app.get(
    `${orgBase}/variants/search`,
    { preHandler: [requireOrgInventoryPermission(['inventory.stock.view'])] },
    ctrl.searchInventoryVariantsHandler,
  );
  app.post(
    `${orgBase}/stock/adjust`,
    { preHandler: [requireOrgInventoryPermission(['inventory.stock.adjust', 'inventory.stock.manage'])] },
    ctrl.adjustStockFromFrontendHandler,
  );
  app.post(
    `${orgBase}/stock/transfer`,
    { preHandler: [requireOrgInventoryPermission(['inventory.transfers.create', 'inventory.stock.manage'])] },
    ctrl.createStockTransferFromFrontendHandler,
  );
  app.get(
    `${orgBase}/stock/logs`,
    { preHandler: [requireOrgInventoryPermission(['inventory.logs.view'])] },
    ctrl.getInventoryLogsHandler,
  );

  // Stock transfers (list / complete / cancel).
  app.get(
    `${orgBase}/stock-transfers`,
    { preHandler: [requireOrgInventoryPermission(['inventory.transfers.view', 'inventory.stock.view'])] },
    ctrl.listStockTransfersHandler,
  );
  app.post(
    `${orgBase}/stock-transfers/:id/complete`,
    { preHandler: [requireOrgInventoryPermission(['inventory.transfers.complete', 'inventory.stock.manage'])] },
    ctrl.completeStockTransferHandler,
  );
  app.post(
    `${orgBase}/stock-transfers/:id/cancel`,
    { preHandler: [requireOrgInventoryPermission(['inventory.transfers.cancel', 'inventory.stock.manage'])] },
    ctrl.cancelStockTransferHandler,
  );

  // Warehouses.
  app.get(
    `${orgBase}/warehouses`,
    { preHandler: [requireOrgInventoryPermission(['inventory.warehouses.view'])] },
    ctrl.listWarehousesHandler,
  );
  app.post(
    `${orgBase}/warehouses`,
    { preHandler: [requireOrgInventoryPermission(['inventory.warehouses.manage'])] },
    ctrl.createWarehouseHandler,
  );
  app.put(
    `${orgBase}/warehouses/:id`,
    { preHandler: [requireOrgInventoryPermission(['inventory.warehouses.manage'])] },
    ctrl.updateWarehouseHandler,
  );
  app.delete(
    `${orgBase}/warehouses/:id`,
    { preHandler: [requireOrgInventoryPermission(['inventory.warehouses.manage'])] },
    ctrl.deleteWarehouseHandler,
  );

  // Suppliers.
  app.get(
    `${orgBase}/suppliers`,
    { preHandler: [requireOrgInventoryPermission(['inventory.suppliers.view'])] },
    ctrl.listSuppliersHandler,
  );
  app.post(
    `${orgBase}/suppliers`,
    { preHandler: [requireOrgInventoryPermission(['inventory.suppliers.manage'])] },
    ctrl.createSupplierHandler,
  );
  app.put(
    `${orgBase}/suppliers/:id`,
    { preHandler: [requireOrgInventoryPermission(['inventory.suppliers.manage'])] },
    ctrl.updateSupplierHandler,
  );
  app.delete(
    `${orgBase}/suppliers/:id`,
    { preHandler: [requireOrgInventoryPermission(['inventory.suppliers.manage'])] },
    ctrl.deleteSupplierHandler,
  );

  // Purchase orders.
  app.get(
    `${orgBase}/purchase-orders`,
    { preHandler: [requireOrgInventoryPermission(['inventory.purchase-orders.view'])] },
    ctrl.listPurchaseOrdersHandler,
  );
  app.post(
    `${orgBase}/purchase-orders`,
    { preHandler: [requireOrgInventoryPermission(['inventory.purchase-orders.manage'])] },
    ctrl.createPurchaseOrderHandler,
  );
  app.get(
    `${orgBase}/purchase-orders/:id`,
    { preHandler: [requireOrgInventoryPermission(['inventory.purchase-orders.view'])] },
    ctrl.getPurchaseOrderHandler,
  );
  app.put(
    `${orgBase}/purchase-orders/:id`,
    { preHandler: [requireOrgInventoryPermission(['inventory.purchase-orders.manage'])] },
    ctrl.updatePurchaseOrderHandler,
  );
  app.put(
    `${orgBase}/purchase-orders/:id/status`,
    { preHandler: [requireOrgInventoryPermission(['inventory.purchase-orders.manage'])] },
    ctrl.updatePurchaseOrderStatusHandler,
  );
}
