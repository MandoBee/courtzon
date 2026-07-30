---
document_id: "TECH-ARCH-18"
document_name: "Inventory Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
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
  references: ["TECH-ARCH-02", "TECH-MOD-08"]
  related: ["TECH-ARCH-17", "GOV-ADR-006"]
---

# Inventory Architecture (TECH-ARCH-18)

**Source:** `backend/src/modules/marketplace/presentation/inventory.routes.ts` (40 lines), `inventory.controller.ts` (642 lines), `database/migrations/067_marketplace_inventory.sql` (94 lines)

## 1. Warehouse System

### Overview
Per-organization warehouses manage physical stock locations. Each warehouse belongs to an organisation and tracks stock for product variants. Warehouses enable multi-location inventory management.

### Warehouse Table (`warehouses`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint(20) unsigned | PK |
| `organisation_id` | bigint(20) unsigned | FK to organisations |
| `name` | varchar(255) | Warehouse name |
| `location` | varchar(255) | Physical location |
| `status` | enum('active','inactive') | Operational status |

### Routes
- `GET /admin/warehouses` — List (permission: `inventory.warehouses.view`)
- `POST /admin/warehouses` — Create (permission: `inventory.warehouses.manage`)
- `PUT /admin/warehouses/:id` — Update
- `DELETE /admin/warehouses/:id` — Delete

**Evidence:** `inventory.routes.ts:46-49`, `inventory.controller.ts` (warehouse handlers).

---

## 2. Supplier Management

### Overview
Suppliers provide products for purchase orders. Each supplier has contact information, payment terms, and lead time for procurement planning.

### Supplier Table (`suppliers`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint(20) unsigned | PK |
| `organisation_id` | bigint(20) unsigned | FK to organisations |
| `name` | varchar(255) | Supplier name |
| `contact_name` | varchar(255) | Primary contact person |
| `email` | varchar(255) | Contact email |
| `phone` | varchar(50) | Contact phone |
| `payment_terms` | varchar(100) | e.g. "Net 30", "COD" |
| `lead_time_days` | int(11) | Estimated days from order to delivery |
| `status` | enum('active','inactive') | Operational status |

### Routes
- `GET /admin/suppliers` — List
- `POST /admin/suppliers` — Create
- `PUT /admin/suppliers/:id` — Update
- `DELETE /admin/suppliers/:id` — Delete

**Evidence:** `inventory.routes.ts:50-53`, `inventory.controller.ts` (supplier handlers).

---

## 3. Purchase Order Lifecycle

### 5-State Lifecycle

Defined in `inventory.controller.ts:311-317`:

```
draft → submitted → approved → received → [terminal]
  ↓         ↓           ↓
  └─── cancelled ───────┘
```

### Transitions

| From | To |
|------|----|
| `draft` | `submitted` |
| `submitted` | `approved`, `cancelled` |
| `approved` | `received`, `cancelled` |
| `received` | *(terminal)* |
| `cancelled` | *(terminal)* |

### Purchase Order Table (`purchase_orders`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint(20) unsigned | PK |
| `organisation_id` | bigint(20) unsigned | FK to organisations |
| `supplier_id` | bigint(20) unsigned | FK to suppliers |
| `warehouse_id` | bigint(20) unsigned | FK to warehouses |
| `status` | enum('draft','submitted','approved','received','cancelled') | Current state |
| `total_cost` | decimal(12,2) | Total PO cost |
| `created_by` | bigint(20) unsigned | FK to users |
| `received_at` | timestamp | When fully received |

### Purchase Order Items (`purchase_order_items`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint(20) unsigned | PK |
| `purchase_order_id` | bigint(20) unsigned | FK to purchase_orders |
| `variant_id` | bigint(20) unsigned | FK to product_variants |
| `quantity` | int(11) | Ordered quantity |
| `unit_cost` | decimal(12,2) | Cost per unit |
| `total_cost` | decimal(12,2) | quantity × unit_cost |
| `received_qty` | int(11) | Quantity received so far |

### State Enforcement
- Only `draft` POs can be edited (`controller.ts:266`)
- Submit: `draft → submitted`
- Approve: `submitted → approved`
- Receive: `approved → received` (creates stock entries)
- Cancel: `draft/submitted/approved → cancelled`

### Routes
- `GET /admin/purchase-orders` — List
- `POST /admin/purchase-orders` — Create
- `GET /admin/purchase-orders/:id` — Get detail
- `PUT /admin/purchase-orders/:id` — Update (draft only)
- `POST /admin/purchase-orders/:id/submit` — Submit
- `POST /admin/purchase-orders/:id/approve` — Approve
- `POST /admin/purchase-orders/:id/receive` — Receive (stock in)
- `POST /admin/purchase-orders/:id/cancel` — Cancel

**Evidence:** `inventory.controller.ts:304-324` (state machine), `inventory.controller.ts:368-424` (receive handler).

---

## 4. Stock Transfers

### Overview
Move stock between warehouses within the same organisation. Transfer creates an `out` movement from source warehouse and an `in` movement to destination warehouse.

### Stock Transfer Table (`stock_transfers`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint(20) unsigned | PK |
| `variant_id` | bigint(20) unsigned | FK to product_variants |
| `from_warehouse_id` | bigint(20) unsigned | Source warehouse |
| `to_warehouse_id` | bigint(20) unsigned | Destination warehouse |
| `quantity` | int(11) | Transfer quantity |
| `status` | enum('pending','completed','cancelled') | Current state |
| `created_by` | bigint(20) unsigned | FK to users |
| `completed_at` | timestamp | When completed |

### Transfer Flow
1. Create transfer (`POST /admin/stock-transfers`) — status = `pending`
2. Complete transfer (`POST /admin/stock-transfers/:id/complete`):
   - Deducts from source warehouse (`movement_type = 'out'`)
   - Adds to destination warehouse (`movement_type = 'in'`)
   - Both create `inventory_logs` entries with before/after snapshots

### Routes
- `POST /admin/stock-transfers` — Create
- `GET /admin/stock-transfers` — List
- `POST /admin/stock-transfers/:id/complete` — Complete

**Evidence:** `inventory.controller.ts:460-557` (transfer handlers).

---

## 5. Inventory Ledger

### Overview
All inventory movements are recorded immutably in the `inventory_logs` table. This provides a complete audit trail with before/after snapshots.

### Inventory Logs Table (`inventory_logs`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint(20) unsigned | PK |
| `variant_id` | bigint(20) unsigned | FK to product_variants |
| `warehouse_id` | bigint(20) unsigned | FK to warehouses |
| `movement_type` | enum('in','out','adjustment','reservation','release','return') | Type of movement |
| `quantity` | int(11) | Movement quantity |
| `stock_before` | int(11) | Stock level before movement |
| `stock_after` | int(11) | Stock level after movement |
| `reason` | varchar(255) | Reason for movement |
| `reference_type` | varchar(50) | Source document type (PO, transfer, adjustment, order) |
| `reference_id` | bigint(20) unsigned | Source document ID |
| `created_by` | bigint(20) unsigned | FK to users |

### Movement Types

| Type | Description | Source |
|------|-------------|--------|
| `in` | Stock received | Purchase order receive, transfer complete (in) |
| `out` | Stock deducted | Order checkout, transfer complete (out) |
| `adjustment` | Manual stock correction | Stock adjust endpoint |
| `reservation` | Reserved for pending order | Future use |
| `release` | Reservation released | Future use |
| `return` | Returned by customer | Future use |

### Stock Fields on Product Variants
The `product_variants` table tracks current stock levels:
- `quantity` (int) — Current available stock
- `cost_price` (decimal) — Cost per unit for margin calculation
- `min_stock_level` (int) — Low-stock threshold
- `max_stock_level` (int) — Reorder point

### Stock Adjustment
`PUT /admin/inventory/variants/:variantId/stock` — Creates adjustment entry with `movement_type = 'adjustment'`, records before/after snapshots.

### View Logs
`GET /admin/inventory/logs` — Returns inventory log entries with filters (variant, warehouse, movement type, date range).

**Evidence:** `inventory.controller.ts:397-401` (receive creates logs), `:473-477` (transfer out), `:543-546` (transfer in), `:590-593` (adjustment), `:570-612` (stock adjust handler).

---

## 6. Stock Deduction on Order Checkout

When an order is placed (`checkout` in marketplace.service.ts):
1. Each order item deducts `quantity` from `product_variants.quantity`
2. Creates `inventory_logs` entry with `movement_type = 'out'`
3. Reference type = `'order'`, reference_id = `orderId`

**Evidence:** `marketplace.service.ts` checkout flow.

---

## 7. Permissions

| Permission | Routes Guarded |
|------------|----------------|
| `inventory.warehouses.view` | List warehouses |
| `inventory.warehouses.manage` | Create/Update/Delete warehouses |
| `inventory.suppliers.view` | List suppliers |
| `inventory.suppliers.manage` | Create/Update/Delete suppliers |
| `inventory.purchase-orders.view` | List/Get purchase orders |
| `inventory.purchase-orders.manage` | CRUD + Submit/Approve/Receive/Cancel |
| `inventory.stock.view` | List stock transfers, view logs |
| `inventory.stock.manage` | Create/Complete transfers, adjust stock |

**Evidence:** `inventory.routes.ts:8-39`.

---

## 8. Audit Events

Every mutation records an audit event:

| Event | Trigger |
|-------|---------|
| `WAREHOUSE.CREATE` | Warehouse created |
| `WAREHOUSE.UPDATE` | Warehouse updated |
| `WAREHOUSE.DELETE` | Warehouse deleted |
| `SUPPLIER.CREATE` | Supplier created |
| `SUPPLIER.UPDATE` | Supplier updated |
| `SUPPLIER.DELETE` | Supplier deleted |
| `PURCHASE_ORDER.CREATE` | PO created |
| `PURCHASE_ORDER.UPDATE` | PO updated |
| `PURCHASE_ORDER.SUBMIT` | PO submitted |
| `PURCHASE_ORDER.APPROVE` | PO approved |
| `PURCHASE_ORDER.RECEIVE` | PO received |
| `PURCHASE_ORDER.CANCEL` | PO cancelled |
| `STOCK_TRANSFER.CREATE` | Transfer created |
| `STOCK_TRANSFER.COMPLETE` | Transfer completed |
| `STOCK.ADJUST` | Stock adjusted manually |

**Evidence:** `inventory.controller.ts` — `recordAudit()` calls throughout.
