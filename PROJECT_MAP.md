# COURTZON-V2 — PROJECT MAP

> Last Updated: 04/06/2026
> Status: Phase 5–6 Complete — RBAC Wired, Docker Stable, Baseline DB Snapshot for Resets

---

## [TECH_STACK]

### Backend
| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Runtime | Node.js | 22.14.0 | Server runtime |
| Framework | Fastify | ^5.8.5 | HTTP server, routing, middleware |
| Language | TypeScript | ^5.8.3 | Type safety |
| Database | MariaDB/MySQL | — | Primary data store |
| DB Driver | mysql2 | ^3.22.3 | Raw SQL queries with promise |
| Validation | Zod | ^4.x | Schema validation (env, request, response) |
| Redis | ioredis | ^5.8.2 | Distributed locks, caching, pub/sub |
| Realtime | Socket.IO | — | Bidirectional real-time events |
| Logging | Pino | ^10.x | Structured logging |
| Testing | Vitest | ^3.2.4 | Unit/integration tests |
| Container Tests | testcontainers | ^11.4.0 | Integration test containers |
| Dev Runner | tsx | ^4.x | TypeScript execution with watch |

### Frontend
| Layer | Technology | Version | Purpose |
|---|---|---|---|
| UI Library | React | ^19.2.6 | Component-based UI |
| Build | Vite | ^8.0.12 | Fast dev/build tool |
| Styling | TailwindCSS | ^3.4.17 | Utility-first CSS |
| State (Client) | Zustand | ^5.0.13 | Client-side state stores |
| State (Server) | TanStack React Query | ^5.100.10 | Server cache & sync |
| Routing | React Router DOM | ^7.15.1 | Client-side routing |
| Forms | React Hook Form | ^7.75.0 | Form state & validation |
| Form Resolvers | @hookform/resolvers | ^5.2.2 | Zod integration with RHF |
| HTTP | Axios | ^1.16.1 | API client |
| PWA | vite-plugin-pwa | — | Progressive Web App support |
| i18n | i18next | — | Internationalization |
| Charts | Recharts / chart.js | — | Analytics dashboards |

### DevOps / Tooling
| Tool | Purpose |
|---|---|
| ESLint | Code linting |
| TypeScript | Type checking |
| Docker | Containerization (active) |
| GitHub Actions | CI/CD (planned) |

---

## [ARCHITECTURE]

### High-Level System Design

```
┌─────────────────────────────────────────────────────────┐
│                    Player PWA (Mobile)                    │
│  React + Tailwind + Zustand + TanStack Query + i18next   │
│  Offline QR viewing · Push notifications · Camera · GPS  │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS / REST + Socket.IO
┌──────────────────────▼──────────────────────────────────┐
│              Employee Dashboard (Web + Mobile)            │
│  Same React SPA, role-based layout (sidebar for staff)   │
│  Super Admin: full control panel                         │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS / REST
┌──────────────────────▼──────────────────────────────────┐
│                    Fastify API Server                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Auth     │ │ RBAC     │ │ Booking  │ │ Payment  │   │
│  │ Module   │ │ Module   │ │ Module   │ │ Module   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │Marketpl. │ │Tournament│ │ Academy  │ │Community │   │
│  │ Module   │ │ Module   │ │ Module   │ │ Module   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Ads      │ │ Notific. │ │ Audit    │ │ i18n     │   │
│  │ Module   │ │ Module   │ │ Module   │ │ Module   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
└──────┬──────────────────────────────┬───────────────────┘
       │                              │
┌──────▼──────┐              ┌───────▼──────────┐
│   MySQL /   │              │      Redis       │
│   MariaDB   │              │ • Locks          │
│ • 60+ tables│              │ • Cache          │
│ • EAV       │              │ • Pub/Sub        │
│ • Triggers  │              └──────────────────┘
│ • Events    │
└─────────────┘
```

### Module Architecture (per domain)

```
modules/{domain}/
├── presentation/       # HTTP layer (controller, routes, DTOs)
│   ├── {domain}.controller.ts
│   ├── {domain}.routes.ts
│   └── {domain}.dto.ts        (Zod schemas for request/response)
├── application/        # Use cases (orchestration, no I/O)
│   ├── {domain}-application.service.ts
│   ├── {domain}-application.errors.ts
│   └── {domain}-application.types.ts
├── domain/             # Business logic, value objects
│   ├── value-objects/
│   └── services/
├── infrastructure/     # I/O (repositories, external APIs)
│   ├── repositories/
│   └── services/
├── contracts/          # Ports / interfaces
└── __tests__/
```

### Design Patterns
- **Modular Monolith** (DDD with layer separation)
- **Repository Pattern** (data access abstraction)
- **Service Layer** (business logic orchestration)
- **Dependency Injection** (manual constructor injection → planned container)
- **Distributed Locking** (Redis SET NX + Lua scripts)
- **Unit of Work** (MySQL transactions)
- **Domain Events** (planned for async workflows)
- **CQRS-lite** (separate read/write models where beneficial)

### Settings Cascade Engine

```
Organisation Settings  ← highest priority (broadest scope)
    ↓ (child cannot override parent's value)
Branch Settings
    ↓ (child cannot override parent's value)
Resource Settings     ← lowest priority (most specific)
```

Rule: A setting defined at a higher level acts as a **max/min bound** for the lower level. Lower can only tighten, not loosen.

### Scope Enforcement

Every query filters through the authenticated user's scope:
```
User → Role → Permissions + Scope
                       ├── organisation_id
                       ├── branch_id(s)
                       └── resource_id(s)
```

Scope is injected at the **repository level**. If a user's scope excludes a record, the WHERE clause naturally returns empty — no error, no data leak.

---

## [SYSTEM_FLOW]

### Core User Journeys

#### Player Registration → Booking
```
1. Open PWA → Splash/Landing
2. Select Country → Enter Phone → Enter Password → Full Name → Email → DOB → Gender → Main Sport → Level
3. Auto-login → Device fingerprint saved → Session created
4. Browse (nearby orgs by GPS) → Select Branch
5. If restricted: Request Access → Wait for approval
6. If open: Browse Resources → Select Time Slot → Confirm Booking
7. Receive QR (stored offline in PWA)
8. Arrive → Scan QR at branch → Check-in confirmed
9. Rate & Review experience
```

#### Employee Login → Manage
```
1. Open Dashboard (web or mobile) → Enter Phone + Password
2. System detects role → loads sidebar menu (role-based)
3. Scoped access applied (can only see assigned org/branch/resource)
4. Manage bookings, check-ins, reports within scope
```

#### Super Admin — Full Control
```
1. Login → Full sidebar → Dashboard
2. Manage: Orgs | Branches | Resources | Users | Roles | Permissions
3. Settings: Global | Per-org | Translations | Sports | Resource Types
4. Financial: Commissions | Payouts | Reconciliations
5. Content: Ads | Notifications | CMS
6. Audit: Activity Log | Revert any action with reason
```

### Booking Engine Flow
```
Request: courtId, date, startTime, endTime
  ↓
1. Validate input (Zod)
2. Check settings cascade (operating hours, advance window, cancellation policy)
3. Check player access (approved for this branch?)
4. Generate slots (configurable duration from resource type)
5. Acquire Redis locks (per slot)
6. Begin MySQL transaction
7.   INSERT booking
8.   INSERT booking_slots (with ER_DUP_ENTRY → conflict)
9.   INSERT payment_transaction (if pre-paid)
10. Commit transaction
11. Release Redis locks (finally block)
12. Return QR + booking confirmation
```

---

## [ORPHANS & PENDING]

### Subscription & Revenue Model (3-Tier)
| Plan | Monthly Price | Yearly Price | Commission Rate |
|---|---|---|---|
| **Premium** | Highest | Higher (discounted) | Lowest % |
| **Standard** | Medium | N/A (monthly only) | Medium % |
| **Freemium** | 0 | N/A | Highest % |

Commission applies to all activities: bookings, tournaments, marketplace, coach sessions, academies.

### Schema Alignment Session (16/05 Session 3)

**Problem:** The incremental schema files (`003_booking.sql`, `007_financial.sql`) had drifted toward a complex org/branch/resource model, but the production database (`courtzon.sql` dump) uses a simpler club/court architecture. Code SQL queries referenced columns/tables that didn't exist in the actual DB.

**Scope:** 14 files changed across schema, backend, and frontend.

**Schema files aligned to dump:**
- `007_financial.sql` — 8 tables rewritten: user_wallets (added is_locked), wallet_transactions (added public_id/direction), payment_transactions, commission_rules, settlements (club_id/settlement_period_*), settlement_items, financial_journal_entries. Removed commission_transactions, payouts, payout_items, invoices (not in dump).
- `003_booking.sql` — Rewritten to club/court model. Removed branches/resources/resource_types/QR codes/pricing_rules.
- `004_marketplace.sql` — Added missing columns (coupon_id, discount_amount, tax_amount, payment_method, shipping_carrier, tracking_number, variant_id, changed_by_role, digital_download_url, video_url) + 5 tables (product_variants, wishlist_items, coupons, coupon_usage, user_addresses).
- `009_court_amenities.sql` — NEW: master amenity catalog (20 seeded items bilingual) + court_amenity_assignments bridge.

**Backend code fixed:**
- `booking.repository.ts` — club_id/court_id, JOINs use courts/clubs, removed checkIn/checkInByQR/createQRCode
- `settlement.repository.ts` — club_id, settlement_period_*, settlement_status
- `commission.service.ts` — removed getOrgIdByBranch (no branches table), uses club_id, commission_rules columns: amount/rule_type/applicable_entity
- `booking.service.ts` — simplified for club/court model, removed QR/resource query
- `pricing-engine.ts` — uses courts.hourly_price instead of pricing_rules/branches/currencies
- `booking.dto.ts` — clubId/courtId, updated booking types
- `booking.controller.ts` — removed checkIn/QR handlers
- `booking.routes.ts` — /clubs/:clubId/bookings instead of /branches/:branchId/bookings
- `marketplace.repository.ts` — getCommissionRate uses amount/applicable_entity

**Frontend:**
- Removed empty courts/ directory
- ForgotPasswordPage + ResetPasswordPage — added t() imports, wrapped all hardcoded strings with i18n keys
- Added 16 new translation keys (en + ar) for forgot/reset flows

### Phase Completion Tracker
| Phase | Status | Last Verified | Notes |
|---|---|---|---|
| Phase 0: Documentation Foundation | ✅ Complete | 16/05/2026 | |
| Phase 1: Core Identity & Auth | ✅ Complete | 16/05/2026 | Forgot/reset flows + i18n done |
| Phase 2: Organizations & RBAC (Multi-Tenant) | ⬜ Pending | — | Schema uses clubs (not orgs/branches); RBAC still being built |
| Phase 3: Booking Engine & Check-in | ⬜ Pending | — | Schema aligned (club/court model); code rewritten; no QR/check-in yet |
| Phase 4: Subscription & Revenue Model | ✅ Complete | 16/05/2026 | Commission service aligned with dump columns |
| Phase 5: Financial Engine & Payment Gateway | ✅ Complete | 16/05/2026 | Repos aligned with dump; settlement engine fixed |
| Phase 6: Marketplace | ✅ Complete | 16/05/2026 | Schema columns fixed; commission query aligned |
| Phase 7: Tournaments, Academies, Coaches | ⬜ Pending | — | |
| Phase 8: Community & Social | ⬜ Pending | — | |
| Phase 9: Advertising & CMS | ⬜ Pending | — | |
| Phase 10: Realtime (Socket.IO), Deployment & Scaling | ⬜ Pending | — | |
| Court Amenities | ✅ Complete | 16/05/2026 | Master catalog (20 seeded) + bridge table |
| Seed Data (comprehensive demo) | ✅ Complete | 16/05/2026 | |

### Phase 0: Documentation Foundation
**Docs:**
- [x] 01-domain-map.md — all bounded contexts, subdomains, events
- [x] 02-erd-planning.md — entity relationships, index strategy, concurrency, multi-tenancy
- [x] 03-rbac-design.md — role hierarchy, scope enforcement, permission modules
- [x] 04-event-architecture.md — current (polling) → target (Socket.IO) event flow
- [x] 05-financial-system.md — 3-tier revenue model, wallet, payment, settlements, journal
- [x] 06-realtime-system.md — Socket.IO rooms, events, authorization, fallback
- [x] 07-api-standards.md — response envelope, status codes, pagination, rate limiting
- [x] 08-multi-tenancy.md — DB-per-tenant strategy, routing, shared vs tenant DBs
- [x] 09-deployment.md — Docker compose, Nginx, CI/CD, health checks
- [x] 10-scaling-roadmap.md — 3-level scaling (production → high traffic → enterprise)

---

### Phase 4: Subscription & Revenue Model (✅ Complete)

**DB Migration (004_subscription_plan_rates.sql):**
- [x] Created `subscription_plan_rates` table (plan_id + entity + rate)
- [x] Updated 3 plans to match revenue model: Premium (highest price, 5% booking), Standard (medium price, 10%), Freemium (0 price, 18%)
- [x] Added Premium Yearly plan (16% discount)
- [x] Added commission columns to bookings (commission_rate, commission_amount, net_amount, plan_name)
- [x] Seeded 18 plan-specific rates (3 plans × 5 entities + yearly)

**Backend:**
- [x] `shared/services/commission.service.ts` — plan-aware commission calculator
- [x] `commissionService.calculate(orgId, entity, amount)` — 3 levels: plan rate → global rule → 10% default
- [x] `commissionService.calculateByBranch(branchId, entity, amount)` — resolves org from branch
- [x] Added subscription API to organisations module:
  - `GET /subscription-plans` — lists plans with commission rates
  - `GET /organisations/:id/subscription` — current subscription
  - `PUT /organisations/:id/subscription` — change plan (handles switch/cancel/renew)
- [x] Booking flow: calculates commission on creation, stores breakdown per booking
- [x] Coach sessions: uses plan-based commission instead of hardcoded 10%

**Frontend:**
- [x] `SubscriptionPage.tsx` — admin UI: select org → view current plan → browse plans → apply
- [x] Plan card component showing: name, price, per-entity commission rates, features
- [x] `CoachDetailPage.tsx` — public coach profile (/coaches/:id)
- [x] `CoachBookingPage.tsx` — session booking form (/coaches/:id/book)
- [x] Added subscription nav item to AdminSidebar
- [x] Fixed audit-log route bug (/admin/audit → /admin/audit-logs)

---

### Phase 6: Marketplace — Amazon Model (✅ Complete)

**DB Migration (006_marketplace_amazon.sql):**
- [x] `product_variants` — size/color/SKU with own inventory, pricing, sort order
- [x] `wishlist_items` — user favorites with unique product constraint
- [x] `user_addresses` — saved shipping/billing addresses with defaults
- [x] `coupons` — percentage/fixed discount, min order, usage limits, expiry
- [x] `coupon_usage` — tracks usage per user/order
- [x] `order_status_history` — audit trail per transition with role tracking
- [x] Enhanced `orders`: coupon_id, discount_amount, tax_amount, tracking_number, shipping_carrier
- [x] Enhanced `cart_items`: variant_id support
- [x] Enhanced `products`: digital_download_url, video_url
- [x] Indexes for seller order queries (order_items.seller_id)

**Backend — Existing Modules Upgraded:**
- [x] Product CRUD: variants support (create/update/list), variant-aware stock checking
- [x] Cart: variant-aware pricing (base + adjustment), variant stock validation
- [x] Checkout: coupon validation & application, address resolution, discount calculation, pro-rata commission on discounted subtotals
- [x] Order status transitions: full lifecycle engine with role-based rules (buyer cancels, seller ships, buyer confirms, refund requested)
- [x] Payment integration: wallet auto-debit on checkout, gateway redirect with returnUrl

**Backend — New Features:**
- [x] Variant management (POST/PUT/DELETE `/marketplace/products/:id/variants`, `/marketplace/variants/:id`)
- [x] Wishlist (GET/POST/DELETE `/marketplace/wishlist/:productId`)
- [x] Address book (CRUD `/marketplace/addresses`)
- [x] Coupon validation (POST `/marketplace/coupons/validate`)
- [x] Seller orders (GET `/marketplace/seller/orders`) with status filter
- [x] Seller stats (GET `/marketplace/seller/stats`) — revenue, commissions, pending, active listings
- [x] Order status transitions (PUT `/marketplace/orders/:id/status`) with role validation
- [x] Public seller shop profiles (GET `/marketplace/shops/:sellerId`)

**Status Transition Engine:**
```
pending    → buyer:cancelled   seller:processing   admin:confirmed/cancelled
confirmed  → buyer:cancelled   seller:processing   admin:processing/cancelled
processing → seller:shipped    admin:shipped/cancelled
shipped    → buyer:delivered   admin:delivered/cancelled
delivered  → buyer:refunded    admin:refunded
cancelled  → (terminal)
refunded   → (terminal)
```

**Frontend — Pages Upgraded:**
- [x] `MarketplacePage.tsx` — wishlist heart toggle per product card, discount badge, search/filter/sort
- [x] `ProductDetailPage.tsx` — variant selectors (size/color buttons with price adjustment), image gallery, video player, wishlist heart, verified-purchase review system
- [x] `CartPage.tsx` — coupon code input with validation, address selection, payment method selector, variant display per item
- [x] `OrderListPage.tsx` — status filter pills, cancel (pending), confirm delivery (shipped) buttons, color-coded status badges
- [x] `OrderDetailPage.tsx` — tracking info display, status transition buttons (cancel/ship/confirm/refund), payment summary with discount/tax

**Frontend — Seller Dashboard Upgraded:**
- [x] 3-tab layout: Stats / Products / Orders
- [x] Stats: total orders, completed, revenue, commission, pending, active listings
- [x] Products: create form with category selector, product grid with status badges, delete
- [x] Orders: filter by status, process/ship buttons, buyer info display
- [x] "Become a Seller" registration form for non-sellers

**TypeScript:**
- [x] Backend: `tsc --noEmit` passes clean
- [x] Frontend: `tsc --noEmit` passes clean

---

### Phase 5: Financial Engine & Payment Gateway (✅ Complete)

**DB Migration (005_payment_gateway.sql):**
- [x] `bank_accounts` — branch bank accounts for manual withdrawals
- [x] `payment_gateway_config` — per-org gateway provider settings
- [x] `withdrawal_requests` — admin approval workflow for wallet withdrawals
- [x] `invoices` — formal invoicing with tax support
- [x] Enhanced settlement/settlement_items with approval tracking

**Payment Gateway Abstraction:**
- [x] `PaymentGateway` interface with charge, refund, verifyWebhook methods
- [x] Mock gateway — always succeeds (dev/test)
- [x] Paymob gateway — full HMAC-verified integration (auth → order → payment_key → checkout URL)
- [x] Gateway factory — env-based selection (`PAYMENT_GATEWAY_PROVIDER`)

**Wallet Module (Backend):**
- [x] `GET /wallets/me` — returns balance, auto-creates if missing
- [x] `POST /wallets/deposit` — credit balance via gateway or direct
- [x] `POST /wallets/withdraw` — debit balance with optimistic locking
- [x] `GET /wallets/transactions` — paginated history with type/date filters
- [x] `walletRepository` — FOR UPDATE locking, version-based optimistic concurrency

**Payment Module (Backend):**
- [x] `POST /payments/charge` — charge by wallet (direct debit) or gateway (redirect URL)
- [x] `POST /payments/:id/refund` — refund with journal entry
- [x] `POST /payments/webhook` — HMAC-verified gateway callback
- [x] `GET /payments/transactions` — user payment history

**Settlement Engine (Backend):**
- [x] `POST /settlements/run` — aggregate completed bookings → create settlement + items + journal
- [x] `POST /settlements/approve` — admin approval workflow
- [x] `GET /settlements` + `GET /settlements/organisation/:orgId` — listing with filters

**Booking Payment Integration:**
- [x] Wallet payment: check balance inside booking transaction → debit on confirm
- [x] Gateway payment: booking created as `pending_payment` → gateway URL returned
- [x] Journal entry written for wallet-based booking payments
- [x] `payment_method` stored per booking

**Frontend:**
- [x] `WalletPage.tsx` — balance card, quick-amount buttons, deposit form, transaction history
- [x] `SettlementListPage.tsx` — run form, filter by status, approve pending settlements
- [x] Wallet link in navbar
- [x] Settlements link in AdminSidebar
- [x] Routes: `/wallet`, `/admin/settlements`

**Docs:**
- [x] `05-financial-system.md` — full rewrite with all module details, API table, config

---

### Phase 1: Core Identity & Auth (✅ Completed in v1)

**Backend:**
- [x] Auth module (register, login, logout, refresh, me)
- [x] Password hashing (PBKDF2-SHA512)
- [x] Session management with persistent login
- [x] Device fingerprinting & tracking
- [x] Token-based auth middleware
- [x] Zod request validation
- [x] Global error handler with AppError classes
- [x] CORS configuration
- [x] MySQL connection pool (getPool pattern)
- [x] @fastify/cors installed
- [x] Forgot password (`POST /auth/forgot-password`) — verifies email, issues reset token
- [x] Reset password (`POST /auth/reset-password`) — validates token, updates password, revokes sessions
- [x] `password_reset_tokens` table migration
- [x] Upload endpoint (`POST /upload/avatar`) — sharp resize to 400×400 webp, magic byte validation

**Frontend:**
- [x] Register page (3-step wizard) — sends `countryCode` directly to prevent DB mismatch
- [x] Login page with "Forgot password?" link
- [x] ForgotPasswordPage — email input, auto-redirects to reset with token
- [x] ResetPasswordPage — new password form with token from URL param
- [x] ProfilePage — `AvatarDisplay` component with fallback initial letter, live preview on upload
- [x] Dashboard page with quick actions + recent activity + ad placeholder
- [x] Protected/Public route guards
- [x] Navbar with nav links + profile + logout
- [x] Design token system (CSS custom properties)
- [x] Dark/Light/System theme with persistence
- [x] i18n framework (en/ar with RTL support, 80+ translation keys)

### Translation Keys System (i18n catalog)

CourtZon uses a **two-table translation model**:

| Table | Purpose |
|-------|---------|
| `translation_keys` | Master catalog: every UI string key + **English default** (`default_value`) + metadata (module, element type, label) |
| `translations` | Locale-specific overrides only (`locale` ≠ `en`) |

**Fallback chain at runtime:** `translations[locale][key]` → `translation_keys.default_value` → key string.

**Scope:** Static UI (labels, buttons, nav, placeholders, validation, CMS admin chrome, landing chrome). Excluded: user-generated content (product names, org names) and App Settings branding fields.

**Key naming:** `{module}.{screen}.{element}` — e.g. `auth.login.submit`, `landing.nav.home`.

**Code registry:** `frontend/src/i18n/translation-keys.registry.ts` — add a new entry whenever you introduce a `t('...')` key.

**Sync (insert missing keys only — never updates existing English defaults):**
```bash
node backend/scripts/sync-translation-keys.js
```
Or click **Sync Keys** in Admin → Translations.

**Admin → Translation Manager:**
- Paginated grid (50 keys/page) with English + up to 5 language columns
- **Sync Keys** — imports new keys from the code registry into `translation_keys`
- **New Translation** — pick a locale with no pack yet; creates empty rows for all keys, then opens bulk editor
- Inline grid + bulk modal: save on **blur**, subtle per-row Saved / Save failed status

**Public API:** `GET /public/translations/:locale` — merged bundle for the app (cached in Zustand i18n store).

**When adding UI strings:** register the key in `translation-keys.registry.ts`, run sync, then translate in the manager.

### Database baseline seed (resets)

| Artifact | Purpose |
|----------|---------|
| `database/seed/003_baseline_snapshot.sql` | Snapshot of configured DB (`INSERT IGNORE`) |
| `database/seed/baseline-manifest.json` | Export metadata (tables, row counts, date) |
| `backend/scripts/export-baseline-seed.mjs` | Regenerate snapshot from live MySQL |

**Reset to baseline:** `node backend/scripts/migrate.js --fresh --seed`

**Refresh snapshot** after admin changes (plans, permissions, CMS, countries): `node backend/scripts/export-baseline-seed.mjs`

Details: `database/seed/README.md`. Soft-delete cascades: `docs/data-cascade.md`.

- [x] Zustand auth store with auto-refresh
- [x] TanStack Query provider
- [x] Axios interceptor for token refresh
