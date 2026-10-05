# 01 — EXECUTIVE SYSTEM OVERVIEW

**Audit date:** 2026-10-04
**Git:** `master` @ `aa9e3d1895e849691f145d409c12b997435536b2`
**Database audited:** MySQL `courtzon_v3` — 330 tables, migration chain applied through `194_membership_entitlements.sql` (202 rows in `migration_history`, latest = 194).
**Docker stack audited:** `backend :3000`, `frontend :5173`, `mysql :3307`, `redis :6379`, `prometheus :9090`, `grafana :3001` — all healthy.
**Method:** read-only inspection of repo, live DB (SELECT-only), Docker containers, Redis keys, migrations, tests, config. Nothing modified.

---

## 1. What CourtZon is

CourtZon is a **multi-tenant SaaS platform** for sports clubs / facilities (tennis, padel, squash-centric, currency EGP). It lets clubs and players run their full operational cycle on one platform:

- Clubs (organisations) → branches → courts/resources → pricing → bookings
- Players → register → book courts → pay (cash/card/wallet) → join tournaments, academies, coaching, marketplace
- CourtZon platform takes commissions and operates a **financial custody engine**: entitlements → settlements

## 2. Business purpose

Replace fragmented club-management tooling with a single, permission-aware, multi-tenant platform that handles:
booking lifecycle, membership lifecycle (new G11.22 versioned model), payments, accounting/ledger, marketplace orders, tournament registration & prizes, academy/coaching, wallet, notifications, and settlement. CourtZon controls the money flow (commission), while each organisation controls its branches, courts, prices and staff.

## 3. Target users / user roles

- Platform operators: `super_admin`, `master-admin`, `auditor`, `read-only-admin`
- Club staff: `org-admin`, `branch-mgr`, `resource-mgr`, `court-manager`, `receptionist`, `accountant`, `finance-manager`, `operations-manager`, `shop-admin`, `marketplace-manager`, `tournament-manager`, `academy-manager`, `event-manager`, `customer-service`, `support-agent`
- Service providers: `coach`, `independent_coach`, `resident_coach`, `referee`
- End customers: `player`
- Marketing/content/CRM: `marketing-manager`, `content-manager`

**Verified:** 26 global roles in `roles` table (`organisation_id IS NULL`); 92 roles total (per-org copies).

## 4. Organisations / clubs / tenancy model

- `organisations` (slug UNIQUE, `access_model` ENUM PUBLIC_CLUB | MEMBERSHIP_CLUB)
- `branches` under org; `resources` (courts) under branches
- User↔org via `user_organisations`, `user_branches`, `user_role_scopes` (organisation/branch/resource scope)
- Route guards: `requireOrganisationAccess(orgId)`, `requireOrgManageAccess(orgId)`, `requireOrgPermission(orgId, key)` — owner-first + super-admin exception + role-scope checks

## 5. Main modules

Auth · Users · Roles/Permissions (RBAC) · Organisations/Branches/Resources · Memberships (legacy + G11.22 versioned) · Bookings + recurring series · Scheduling/Time engine · Matches & results · Tournaments (incl. competitions, teams, prizes) · Academies · Coaches · Leagues · Marketplace (+ inventory, complaints) · Wallet · Payments (Paymob sandbox) · Financial/Accounting/Ledger · Settlements (unified + gateway) · Entitlements · Notifications platform · CMS · Community · CRM · HR · BI · Support · Translations · Theme/design tokens · Audit log · Admin/Security.

## 6. Technology stack (verified)

| Layer | Technology |
|---|---|
| Frontend | React 19.2.6, Vite, TypeScript, React Router 7.15.1, TanStack Query 5.100.10, Zustand 5.0.13, axios, socket.io-client, react-hook-form + zod, vite-plugin-pwa |
| Backend | Node 22 (alpine), Fastify 5, TypeScript ESM (`dist/server.js`) |
| Database | MySQL 8.0 (Docker), db name `courtzon_v3`, utf8mb4 |
| Redis | 7.4.9 standalone (512MB maxmemory noeviction, appendonly) |
| Queues | BullMQ 5.76 — queues: `default`, `notifications` (workers in-process) |
| Realtime | Socket.IO 4.8.3 |
| Payments | Paymob — `PAYMENT_GATEWAY_PROVIDER=paymob`, `PAYMOB_SANDBOX=true` |
| Monitoring | Prometheus :9090, Grafana :3001 (local) |
| Deploy | Docker Compose; Hostinger/Coolify in production (per docs) |

## 7. Current architecture (one-paragraph)

Browser SPA (nginx) → Fastify API (all routes auth-protected by default via global `authMiddleware`) → MySQL + Redis. In-process BullMQ workers handle cron (30 job handlers). Domain events flow through EventBusV2 → in-process subscribers + durable outbox relay → per-subscriber BullMQ queues (`bul:entitlement-*`, `bull:accounting-replay`, `bull:notifications`). Notification Engine subscribes 130+ domain events and dispatches by channel.

## 8. Current maturity summary

**What is functionally present and exercised (live data exists):**
- Auth, RBAC, organisations/branches/resources, booking (25 bookings), payments (1,086 payment_transactions, 1,080 paid in sandbox), wallet (254 wallets, 409 tx), accounting postings for bookings (`ledger_entries` 34,816 rows, `general_ledger` 45,890), notification engine (2,571 notifications), tournaments (3 with 15 pending entitlements), products catalog (58 products).

**What exists in code but has ZERO live data (never exercised end-to-end):**
- New membership G11.22: `membership_plan_versions` 0, `membership_subscriptions` 0, `membership_installments` 0
- Settlements: `settlements` 0, `settlement_entitlements` 0, `gateway_settlements` 0
- Marketplace orders: `orders` 0
- Academies: `academies` 0; coaching: `coach_profiles` 0; sellers: `seller_profiles` 0
- Invoices: `invoices` 0

## 9. Production readiness — CONDITIONALLY READY (NOT READY for real money)

Real payment handling is unproven (sandbox only), settlement has never run, marketplace checkout has never completed, the new membership billing has never been purchased, and the baseline SQL is missing the `payment_allocations` table (fresh-install drift). Full verdict in `35_PRODUCTION_READINESS.md`.

## 10. Major risks (top-level)

1. Baseline <> live DB drift (`payment_allocations`) — fresh installs break recurring payments
2. Zero real financial flows ran end-to-end (payments/settlements/orders/memberships)
3. SMS & Push notification providers are mocks (delivery is fake "success")
4. Frontend `/admin` guard uses hardcoded role slug list, inconsistent with permission-first policy
5. `gitCommit: unknown` in the backend image — no supply-chain traceability
6. Concurrency for double-booking / stock purchase relies on optimistic checks (FOR UPDATE not verified)

## 11. Major unfinished areas (see `27_MISSING_FEATURES.md`)

Real gateway · settlement validation · marketplace order-to-settlement exercise · membership G11.22 purchase path UAT · Push/SMS integration · trial/grace UX for org subscriptions · CSRF token · phone OTP verification · single-ledger consolidation decision.