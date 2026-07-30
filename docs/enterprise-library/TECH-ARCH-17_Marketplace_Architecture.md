---
document_id: "TECH-ARCH-17"
document_name: "Marketplace Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 30
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-07", "TECH-MOD-08", "TECH-MOD-30", "TECH-MOD-31"]
  related: ["TECH-ARCH-18", "GOV-ADR-007"]
---

# Marketplace Architecture (TECH-ARCH-17)

**Source:** `backend/src/modules/marketplace/` (domain/, application/, commands/, infrastructure/, presentation/)

## 1. Product Catalog

### Categories
Products are organized into a hierarchical category tree via `product_categories` table. Each product belongs to one category. Categories have `name`, `slug`, `parent_id` (self-referential for hierarchy), `image`, and `sort_order`.

### Brands
Products optionally belong to a brand. The `brands` table stores `name`, `slug`, `logo`, and `description`. Brands are managed via admin routes (`admin-brand.routes.ts`).

### Tags
Products can have multiple tags via the `product_tags` join table (`tags` + `product_tags`). Tags are managed via admin routes (`admin-tag.routes.ts`).

### Product Images
Products and player-listed items support multiple images stored as JSON array in the `images` column (type `longtext`). The `ImageGallery` component renders them. Images are parsed via `parseProductImages()` utility.

### Variants
Products support multiple variants (size, color, etc.) via `product_variants` table. Each variant has:
- `variant_type`, `variant_name`, `variant_color` (optional)
- `price_adjustment` (delta from base price)
- `quantity` (stock per variant), `sku`
- `cost_price`, `min_stock_level`, `max_stock_level`

The frontend groups variants by `variant_type` and renders them as selectable buttons.

### Specifications
Product specifications are stored in `product_specifications` as key-value pairs per product: `spec_key`, `spec_value`.

### Related Products
Cross-sell relationships stored in `related_products` with `product_id`, `related_product_id`, `relation_type`.

### Product Status Lifecycle
```
draft → pending → active → [terminal: sold_out | archived]
```
Admin can approve/reject pending products. Sellers can edit draft/pending. Active products appear in marketplace.

**Evidence:** `marketplace.routes.ts:15-19`, `ProductDetailPage.tsx:71-77`, `SellerDashboardPage.tsx:255-268`, `database/baseline/001_courtzon_v3.sql` (products/variants tables).

---

## 2. Cart System

### Architecture
Cart is per-user (authenticated), stored in `carts` and `cart_items` tables. Each cart item references a `product_variant` or product directly.

### Operations
| Operation | Endpoint | Validation |
|-----------|----------|------------|
| Get cart | `GET /marketplace/cart` | Auth required, returns items grouped by seller |
| Add item | `POST /marketplace/cart` | Validates product exists, stock available |
| Update qty | `PUT /marketplace/cart/:itemId` | Validates new qty <= stock |
| Remove item | `DELETE /marketplace/cart/:productId` | Deletes cart item |
| Seller info | `GET /marketplace/cart/seller-info` | Returns seller contact details for free-plan sellers |

### Stock Validation
- Add to cart checks `product_variants.quantity` >= requested qty
- Cart page shows "Out of Stock" for zero-stock items
- Variants require selection before add-to-cart

### Coupon Application
- `POST /marketplace/coupons/validate` with `{ code, subtotal }`
- Returns `{ valid, discount, message }`
- Discount applied at checkout, stored on order as `discount_amount`
- Validation: code must exist, be active, not expired, not exceed usage limits, meet min order

### Cart Merging
Cart page merges duplicate entries (same product_id) by summing quantities. Seller info resolves org types — items from free-plan (player) sellers show Call/WhatsApp buttons instead of online checkout.

**Evidence:** `CartPage.tsx:120-138` (cart merging), `marketplace.routes.ts:31-36`, `CartPage.tsx:150-162` (seller info).

---

## 3. Checkout Flow

### Step-by-step Process
1. **Address Selection** — User selects or creates a shipping address from saved addresses
2. **Shipping Validation** — `POST /marketplace/cart/check-shipping` validates per-seller shipping rates for the selected address
3. **Coupon Application** — Optional coupon code validation
4. **Payment Method Selection** — Card or Cash
5. **Order Creation** — `POST /marketplace/orders` creates the order

### Checkout Handler (`marketplace.service.ts checkout`)
1. Loads cart items with `FOR UPDATE` lock
2. Validates stock for all items
3. Resolves per-seller commission rates from subscription plan
4. Validates coupon (if provided)
5. Validates shipping availability
6. Creates `orders` + `order_items` records
7. Deducts stock from `product_variants.quantity`
8. Processes payment (wallet/card/cash)
9. Calls `_recordOrderFinancials()` to record financial breakdown
10. Creates `order_status_history` entry
11. Clears cart
12. Emits `marketplace:order_created` event

### Payment Methods
- **Cash:** Order created as `confirmed`, payment pending collection
- **Card:** Paymob Pixel card iframe opens, order waits for webhook confirmation. Polling with `PaymentStatusPoller` (1.5s interval, 90s timeout)

### Address Selection
Addresses managed via CRUD at `/marketplace/addresses`. Address form supports label, full name, phone, street, province, city (loaded from geo endpoints). Shipping cost calculated per-seller from `seller_shipping_rates` table.

**Evidence:** `marketplace.routes.ts:54-66`, `CartPage.tsx:177-208`, `marketplace.service.ts:860-904` (checkout).

---

## 4. Order Lifecycle

### State Machine

Defined in `order-constants.ts:1` and implemented in `order-aggregate.ts:5-37`:

```
pending → confirmed → processing → shipped → delivered → cancelled | refunded
```

### Allowed Transitions by Role

| From | Buyer | Seller | Admin |
|------|-------|--------|-------|
| `pending` | cancelled | processing, cancelled | confirmed, cancelled |
| `confirmed` | cancelled | processing, cancelled | processing, cancelled |
| `processing` | cancelled | shipped | shipped, cancelled |
| `shipped` | delivered | delivered | delivered, cancelled |
| `delivered` | refunded | — | refunded |
| `cancelled` | — | — | — |
| `refunded` | — | — | — |

### Terminal Statuses (`order-constants.ts:2`)
`cancelled`, `refunded`

### Implementation
`_validateStatusTransition()` in `marketplace.service.ts:1077-1089` mirrors `order-aggregate.ts`. The `updateOrderStatusHandler` resolves the user's role (`buyer` | `seller` | `admin`) via `_getUserRoleInOrder()` and validates the transition.

### Financial Recording per Transition

| Transition | Financial Effect |
|------------|-----------------|
| `pending → confirmed` | `_recordOrderFinancials()` — records courtzon fee, org net, cash holder |
| `shipped → delivered` | `_recordDeliveryFinancials()` — updates cash collection, creates transaction + entries |
| Any → `cancelled`/`refunded` | `_recordReversalFinancials()` — reverses entries, resets financial columns |

### Order Status History
Every transition creates an `order_status_history` record with `from_status`, `to_status`, `changed_by`, `changed_by_role`, `note`.

### Order Cancellation
- Buyer can cancel pending/confirmed orders
- Admin can cancel most non-terminal statuses
- Cancellation triggers financial reversal and emits `marketplace:order_cancelled`

**Evidence:** `order-aggregate.ts:5-37`, `order-constants.ts:1-2`, `marketplace.service.ts:720-760` (updateStatus), `marketplace.service.ts:1026-1063` (reversal).

---

## 5. Seller Management

### Seller Types

**Player Sellers (Free Plan):**
- Max 5 products
- No subscription cost
- Direct contact via phone/WhatsApp
- No online checkout — buyer contacts seller directly
- Activation via `POST /marketplace/player/activate`
- Products managed at `/marketplace/player/products`
- Mark as sold via `PATCH /marketplace/player/products/:productId/sold`

**Organisation Sellers (Subscription-based):**
- Unlimited products (subject to subscription plan)
- Subscription-based with commission rates
- Full online checkout (card + cash)
- Shop settings, shipping rates
- Products managed via `seller/products` endpoints
- Branch-scoped product management

### Seller Dashboard
Tabs: Stats, Products, Orders, Settlements, Shop Settings
- **Stats:** Total orders, completed, revenue, commission, pending orders, active listings
- **Products:** List, create, edit, delete (with branch filter, status tabs)
- **Orders:** Filter by status, update order status (process, ship), view buyer info
- **Settlements:** View balance, request settlement, settlement history
- **Settings:** Edit org profile via `OrganisationForm`

### Upgrade Flow
1. Player activates free selling
2. Can upgrade to paid seller plan via `/marketplace/seller/upgrade`
3. Admin approves via `/marketplace/admin/approve-upgrade/:orgId`
4. On approval, org gets subscription plan with marketplace commission rates

### Permissions
- `marketplace.sell` — Create/update products (requires approved org)
- `marketplace.moderate` — Admin marketplace management
- `marketplace.seller.settlements` — View settlements
- `marketplace.seller.request-settlement` — Request settlement
- `marketplace.seller.manage-orders` — Update order status as seller
- `marketplace.seller.create-product` — Add product
- `marketplace.seller.delete-product` — Delete product
- Various UI permission keys for tabs

**Evidence:** `SellerDashboardPage.tsx:150-174` (activation), `PlayerProductsPage.tsx:53-55` (max 5 limit), `marketplace.routes.ts:68-89` (seller/player routes).

---

## 6. Settlement System

### Marketplace Settlement Orders

Settlements are managed by the Settlement module (TECH-MOD-30). The marketplace exposes seller-facing endpoints:

- `GET /marketplace/seller/settlements` — List seller's settlements
- `GET /marketplace/seller/settlements/balance` — Get available balance
- `POST /marketplace/seller/settlements` — Request settlement

### Settlement Transfer Flow
1. Seller requests settlement via `/marketplace/seller/settlements`
2. Settlement module locks unsettled delivered orders (`FOR UPDATE`)
3. Calculates financials: gross, commission, shipping, net
4. Creates settlement record + `settlement_orders` entries
5. Marks order items as `settled`
6. Marks orders as `settled` when ALL items settled
7. Follows 8-state lifecycle: `requested → calculating → pending_approval → approved → paid → completed`

**Evidence:** `marketplace.routes.ts:91-94`, TECH-MOD-30.

---

## 7. Financial Recording

Three private methods in `marketplace.service.ts` handle financial recording at order lifecycle milestones:

### _recordOrderFinancials (line 911)
Called on `pending → confirmed`:
- Aggregates per-seller commission from `order_items`
- `courtzon_fee` = fee on products only (shipping is 100% org)
- `organization_net` = (products × (1-rate)) + shipping
- `cash_holder` = `org` if COD, `courtzon` if card
- `cash_collection_status` = `expected_from_customer` (COD) or `under_collection` (card)

### _recordDeliveryFinancials (line 943)
Called on `shipped → delivered`:
- Updates `cash_collection_status` to `held_by_org` (COD) or `held_by_courtzon` (card)
- Creates `transaction` record with `type = 'marketplace_order'`
- Creates `transaction_entries`: credit CourtZon fee to platform_account, credit net amount to branch
- Creates ledger entries (`due_to_courtzon`) per seller

### _recordReversalFinancials (line 1026)
Called on any → `cancelled` / `refunded`:
- Finds existing delivery transactions
- Creates reversal entries (opposite side for each entry)
- Resets financial columns to zero

**Evidence:** `marketplace.service.ts:911-1063`.

---

## 8. Reviews System

- `GET /marketplace/products/:id/reviews` — List reviews for a product
- `POST /marketplace/products/:id/reviews` — Create review (authenticated user)
- Admin delete via `DELETE /marketplace/admin/reviews/:id`
- Reviews stored in `product_reviews`: `rating` (1-5), `review_text`, `user_id`
- Product detail page shows star ratings, review text, user name
- Review form with star selector (1-5) and textarea

**Evidence:** `marketplace.routes.ts:100-101`, `ProductDetailPage.tsx:189-224`.

---

## 9. Wishlist

- `GET /marketplace/wishlist` — List wishlist items
- `POST /marketplace/wishlist/:productId` — Add to wishlist
- `DELETE /marketplace/wishlist/:productId` — Remove from wishlist
- Wishlist heart toggle on product cards in MarketplacePage and ProductDetailPage
- Dedicated WishlistPage shows items with add-to-cart and remove actions
- Badge count on marketplace header

**Evidence:** `marketplace.routes.ts:27-29`, `WishlistPage.tsx`, `MarketplacePage.tsx:76-77`.

---

## 10. Key Events

| Event | Trigger |
|-------|---------|
| `marketplace:product_created` | Product created |
| `marketplace:product_updated` | Product updated |
| `marketplace:product_deleted` | Product deleted |
| `marketplace:order_created` | Checkout completed |
| `marketplace:order_confirmed` | Payment confirmed |
| `marketplace:order_status_changed` | Any status transition |
| `marketplace:settlement_requested` | Settlement requested |
| `marketplace:settlement_processed` | Settlement completed |
| `marketplace:review_created` | Review submitted |
| `marketplace:seller_upgrade_requested` | Seller upgrade submitted |

---

## 11. Key Routes Summary

| Area | Count | Source |
|------|-------|--------|
| Categories | 2 | `marketplace.routes.ts:11-12` |
| Products | 5 | `marketplace.routes.ts:15-19` |
| Variants | 3 | `marketplace.routes.ts:22-24` |
| Wishlist | 3 | `marketplace.routes.ts:27-29` |
| Cart | 5 | `marketplace.routes.ts:32-36` |
| Geo | 2 | `marketplace.routes.ts:39-40` |
| Shipping | 5 | `marketplace.routes.ts:43-49` |
| Coupons | 1 | `marketplace.routes.ts:52` |
| Addresses | 4 | `marketplace.routes.ts:55-58` |
| Orders | 6 | `marketplace.routes.ts:61-66` |
| Seller | 5 | `marketplace.routes.ts:68-89` |
| Player sell | 4 | `marketplace.routes.ts:73-80` |
| Settlements | 3 | `marketplace.routes.ts:91-94` |
| Reviews | 2 | `marketplace.routes.ts:100-101` |
| Admin marketplace | 11 | `marketplace.routes.ts:104-131` |
| Brands & Tags | 2 | `marketplace.routes.ts:130-131` |

**Evidence:** `marketplace.routes.ts:1-132` (132 lines, 90+ endpoints total).
