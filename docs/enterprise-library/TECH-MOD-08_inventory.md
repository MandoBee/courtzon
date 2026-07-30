---
document_id: "TECH-MOD-08"
document_name: "Inventory Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 25
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-07"]
  related: ["TECH-MOD-09", "TECH-MOD-30"]
---

# Inventory Module (TECH-MOD-08)

**Source:** `backend/src/modules/marketplace/presentation/inventory.routes.ts` (40 lines), `inventory.controller.ts` (642 lines), `database/migrations/067_marketplace_inventory.sql` (94 lines)

## 1. Purpose

Warehouse, supplier, purchase order, stock transfer, and inventory ledger management. Tracks stock movements via immutable `inventory_logs` entries with before/after snapshots. Purchase orders follow a 5-state lifecycle. All state-changing operations record audit events.

## 2. Architecture

```
presentation/
  inventory.routes.ts      — 18 endpoints
  inventory.controller.ts  — Request handlers (642 lines)
```

No dedicated domain or application layer — controller directly uses `mysql2/promise` with `getPool()`.

## 3. Routes (18)

Defined in `inventory.routes.ts:8-39`:

| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 1 | GET | `/admin/warehouses` | `inventory.warehouses.view` | List warehouses |
| 2 | POST | `/admin/warehouses` | `inventory.warehouses.manage` | Create warehouse |
| 3 | PUT | `/admin/warehouses/:id` | `inventory.warehouses.manage` | Update warehouse |
| 4 | DELETE | `/admin/warehouses/:id` | `inventory.warehouses.manage` | Delete warehouse |
| 5 | GET | `/admin/suppliers` | `inventory.suppliers.view` | List suppliers |
| 6 | POST | `/admin/suppliers` | `inventory.suppliers.manage` | Create supplier |
| 7 | PUT | `/admin/suppliers/:id` | `inventory.suppliers.manage` | Update supplier |
| 8 | DELETE | `/admin/suppliers/:id` | `inventory.suppliers.manage` | Delete supplier |
| 9 | GET | `/admin/purchase-orders` | `inventory.purchase-orders.view` | List purchase orders |
| 10 | POST | `/admin/purchase-orders` | `inventory.purchase-orders.manage` | Create purchase order |
| 11 | GET | `/admin/purchase-orders/:id` | `inventory.purchase-orders.view` | Get purchase order |
| 12 | PUT | `/admin/purchase-orders/:id` | `inventory.purchase-orders.manage` | Update purchase order |
| 13 | POST | `/admin/purchase-orders/:id/submit` | `inventory.purchase-orders.manage` | Submit PO |
| 14 | POST | `/admin/purchase-orders/:id/approve` | `inventory.purchase-orders.manage` | Approve PO |
| 15 | POST | `/admin/purchase-orders/:id/receive` | `inventory.purchase-orders.manage` | Receive PO (stock in) |
| 16 | POST | `/admin/purchase-orders/:id/cancel` | `inventory.purchase-orders.manage` | Cancel PO |
| 17 | POST | `/admin/stock-transfers` | `inventory.stock.manage` | Create stock transfer |
| 18 | GET | `/admin/stock-transfers` | `inventory.stock.view` | List stock transfers |
| 19 | POST | `/admin/stock-transfers/:id/complete` | `inventory.stock.manage` | Complete transfer |
| 20 | PUT | `/admin/inventory/variants/:variantId/stock` | `inventory.stock.manage` | Adjust stock |
| 21 | GET | `/admin/inventory/logs` | `inventory.stock.view` | View inventory logs |

**Evidence:** `inventory.routes.ts:8-39`, `inventory.controller.ts:304-324` (state machine).

## 4. Purchase Order 5-State Lifecycle

Defined in `inventory.controller.ts:311-317`:

```
draft → submitted → approved → received → [terminal]
  ↓         ↓           ↓
  └─── cancelled ───────┘
```

**Transitions:**
| From | To |
|------|----|
| `draft` | `submitted` |
| `submitted` | `approved`, `cancelled` |
| `approved` | `received`, `cancelled` |
| `received` | *(terminal)* |
| `cancelled` | *(terminal)* |

**Evidence:** `inventory.controller.ts:311-317` defines `transitions` map. Line 266 enforces `draft`-only updates.

## 5. Stock In/Out on Receive

On `receivePurchaseOrderHandler` (`inventory.controller.ts:368-424`):
1. Validates PO is `approved`
2. For each item, calculates `pendingQty = quantity - received_qty`
3. Creates `inventory_logs` entry with `movement_type = 'in'`, `stock_before`, `stock_after`
4. Updates `product_variants.quantity`
5. Updates `purchase_order_items.received_qty`
6. Sets PO to `received` with `received_at = NOW()`

## 6. Inventory Ledger

**Table:** `inventory_logs`

Every stock movement records:
- `variant_id`, `warehouse_id`, `movement_type` (`in`, `out`, `adjustment`)
- `quantity`, `stock_before`, `stock_after`
- `reason`, `reference_type`, `reference_id`
- `created_by`

**Evidence:** `inventory.controller.ts:397-401` (receive creates logs), `:473-477` (transfer out), `:543-546` (transfer in), `:590-593` (adjustment).

## 7. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Warehouse | `warehouses` | `id, organisation_id, name, location, status` |
| Supplier | `suppliers` | `id, organisation_id, name, contact_name, email, phone, payment_terms, lead_time_days, status` |
| Purchase Order | `purchase_orders` | `id, organisation_id, supplier_id, warehouse_id, status (draft/submitted/approved/received/cancelled), total_cost, created_by, received_at` |
| PO Item | `purchase_order_items` | `id, purchase_order_id, variant_id, quantity, unit_cost, total_cost, received_qty` |
| Stock Transfer | `stock_transfers` | `id, variant_id, from_warehouse_id, to_warehouse_id, quantity, status (pending/completed/cancelled), created_by, completed_at` |
| Inventory Log | `inventory_logs` | `id, variant_id, warehouse_id, movement_type, quantity, stock_before, stock_after, reason, reference_type, reference_id` |

**Evidence:** `database/migrations/067_marketplace_inventory.sql` defines all table schemas.

## 8. Permissions

- `inventory.warehouses.view` / `inventory.warehouses.manage`
- `inventory.suppliers.view` / `inventory.suppliers.manage`
- `inventory.purchase-orders.view` / `inventory.purchase-orders.manage`
- `inventory.stock.view` / `inventory.stock.manage`

## 9. Audit Events

Controller calls `recordAudit()` on every mutation:
- `WAREHOUSE.CREATE` / `WAREHOUSE.UPDATE` / `WAREHOUSE.DELETE`
- `SUPPLIER.CREATE` / `SUPPLIER.UPDATE` / `SUPPLIER.DELETE`
- `PURCHASE_ORDER.CREATE` / `PURCHASE_ORDER.UPDATE` / `PURCHASE_ORDER.SUBMIT` / `PURCHASE_ORDER.APPROVE` / `PURCHASE_ORDER.RECEIVE` / `PURCHASE_ORDER.CANCEL`
- `STOCK_TRANSFER.CREATE` / `STOCK_TRANSFER.COMPLETE`
- `STOCK.ADJUST`

## 10. Configuration

| Env Var | Description |
|---------|-------------|
| None | No dedicated env vars — uses DB pool defaults. Org-scoped via `resolveOrgId()` from request. |
