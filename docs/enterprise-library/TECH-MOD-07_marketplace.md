---
document_id: "TECH-MOD-07"
document_name: "Marketplace Module"
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
  references: ["TECH-ARCH-02", "TECH-MOD-09"]
  related: ["TECH-MOD-10", "TECH-MOD-13"]
---

# Marketplace Module (TECH-MOD-07)

**Source:** `backend/src/modules/marketplace/` (7 entries: domain/, application/, commands/, infrastructure/, presentation/, index.ts, __tests__/)

## 1. Purpose

E-commerce marketplace: products, variants, cart, checkout, orders, reviews, wishlist, shipping rates, coupons, seller management, settlements, inventory management. 132 routes total (90 marketplace + 40 inventory + admin brand/tag routes). Order lifecycle with 7 statuses.

## 2. Architecture

```
domain/
  order-aggregate.ts     — Order state machine
  order-constants.ts     — ORDER_STATUSES, TERMINAL_STATUSES
application/
  (service layer)
commands/
  (order commands)
infrastructure/
  (repositories)
presentation/
  marketplace.routes.ts      — 132 lines, 90+ endpoints
  marketplace.controller.ts  — Request handlers
  marketplace.dto.ts         — Zod schemas
  inventory.routes.ts        — 40 lines, 18 endpoints
  inventory.controller.ts
  admin-brand.routes.ts / controller.ts
  admin-categories.routes.ts / controller.ts
  admin-tag.routes.ts / controller.ts
```

**Evidence:** `marketplace.routes.ts` (132 lines), `inventory.routes.ts` (40 lines), `domain/order-constants.ts` (2 lines).

## 3. Routes (90+ marketplace + 40 inventory)

**Marketplace routes** (`marketplace.routes.ts`):

**Categories (2):** List, get
**Products (3):** List, get, create (seller), update, delete
**Variants (3):** Create, update, delete (per product)
**Wishlist (3):** Get, add, remove
**Cart (5):** Get, get seller info, add, update item, remove item
**Geo (2):** Provinces, cities
**Shipping (2):** Get seller rates, check shipping
**Coupons (1):** Validate
**Addresses (4):** CRUD
**Orders (6):** Checkout, list, counts, get, update status, cancel
**Seller (5):** Orders, stats, plans, upgrade, shop settings
**Player sell (5):** Activate, status, products CRUD + mark sold
**Settlements (3):** List, balance, request
**Reviews (2):** List, create
**Admin marketplace (11):** Products list/update/delete/status, orders, sellers, upgrade requests, reviews
**Brands & Tags (2):** List brands, list tags
**Public shop (1):** Seller profile

**Inventory routes** (`inventory.routes.ts`):
**Warehouses (4):** CRUD
**Suppliers (4):** CRUD
**Purchase Orders (8):** CRUD + submit, approve, receive, cancel
**Stock Transfers (3):** Create, list, complete
**Stock Adjustment (1):** Adjust stock
**Inventory Logs (1):** View logs

## 4. Permissions

`marketplace.sell` — Create/update products (requires approved org)
`marketplace.moderate` — Admin management
`marketplace.seller.settlements`, `marketplace.seller.request-settlement`
`inventory.warehouses.view`, `inventory.warehouses.manage`
`inventory.suppliers.view`, `inventory.suppliers.manage`
`inventory.purchase-orders.view`, `inventory.purchase-orders.manage`
`inventory.stock.view`, `inventory.stock.manage`

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Product | `marketplace_products` | `id, seller_id, name, description, price, status, category_id` |
| Variant | `product_variants` | `id, product_id, name, price, stock, sku` |
| Cart | `carts` | `id, user_id, session_id` |
| Cart Item | `cart_items` | `id, cart_id, variant_id, quantity` |
| Order | `orders` | `id, user_id, status, total, shipping_address_id` |
| Order Item | `order_items` | `id, order_id, variant_id, quantity, price` |
| Review | `product_reviews` | `id, product_id, user_id, rating, comment` |
| Wishlist | `wishlists` | `id, user_id, product_id` |
| Settlement | `settlements` | `id, seller_id, amount, status, period_start, period_end` |
| Shipping Rate | `seller_shipping_rates` | `id, seller_id, province_id, city_id, rate` |
| Coupon | `coupons` | `id, code, discount_type, discount_value, usage_limit` |
| Warehouse | `warehouses` | `id, name, location, is_active` |
| Purchase Order | `purchase_orders` | `id, supplier_id, status, total, notes` |
| Stock Transfer | `stock_transfers` | `id, from_warehouse_id, to_warehouse_id, status` |

## 6. Order Lifecycle

Defined in `order-constants.ts:1`:
```
pending → confirmed → processing → shipped → delivered → cancelled | refunded
```

**Terminal statuses** (`order-constants.ts:2`): `cancelled`, `refunded`

**Evidence:** Source at `domain/order-constants.ts:1-2`.

## 7. Events

- `marketplace:product_created` / `marketplace:product_updated` / `marketplace:product_deleted`
- `marketplace:order_created` / `marketplace:order_status_changed`
- `marketplace:settlement_requested` / `marketplace:settlement_processed`
- `marketplace:review_created`
- `marketplace:seller_upgrade_requested`

## 8. Audit Events

- `MARKETPLACE.PRODUCT_CREATE` / `MARKETPLACE.PRODUCT_UPDATE` / `MARKETPLACE.PRODUCT_DELETE`
- `MARKETPLACE.ORDER_STATUS`

**Evidence:** `audit-log.types.ts` lines 31-34.

## 9. Configuration

| Feature Flag | Effect |
|-------------|--------|
| `app.marketplace_enabled` | Gates all marketplace routes |
