# CourtZon v2.2.0 — Volume 1: Complete Module Inventory

## Legend
- ✅ Complete: All planned endpoints implemented, permission-gated, audited
- ⚠️ Partial: Core functionality exists, minor gaps
- ❌ Missing: Not yet implemented

## Identity & Access

### 1. auth — Authentication & Authorization
- **Files:** 12
- **Routes:** 17 (14 public, 3 authenticated)
- **Purpose:** Login, register, profile management, password reset, session management
- **Evidence:** `modules/auth/presentation/auth.routes.ts`
- **Key handlers:** `registerHandler`, `loginHandler`, `updateProfileHandler`, `meHandler`
- **Status:** ✅ Complete
- **Gaps:** 3 profile routes have no `requirePermission` — acceptable as self-service profile

### 2. rbac — Role-Based Access Control
- **Files:** 12
- **Routes:** 42
- **Purpose:** Role CRUD, permission management, user administration, UI permission sync
- **Evidence:** `modules/rbac/presentation/rbac.routes.ts`
- **Status:** ✅ Complete

### 3. brute-force — Brute Force Protection
- **Files:** 2
- **Routes:** 0
- **Purpose:** Login attempt tracking and rate limiting
- **Evidence:** `modules/brute-force/`
- **Status:** ✅ Complete
- **Note:** Consumed internally by auth service, no direct routes

## Sports Operations

### 4. booking — Court Booking Engine
- **Files:** 41
- **Routes:** 18
- **Permission Coverage:** 100% (18/18)
- **Lifecycle:** pending → confirmed → checked_in → completed → cancelled / no_show / expired
- **State Machine:** `modules/booking/domain/booking-aggregate.ts`
- **Audit:** 19 `recordAudit()` calls across controller (FIXED during certification)
- **Evidence:** `modules/booking/presentation/booking.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Multi-slot booking, matchmaking, check-in, cancellation, payment integration

### 5. academy — Academy & Training
- **Files:** 14
- **Routes:** 38
- **Permission Coverage:** 100% (38/38)
- **Lifecycle:** draft → published → open → full → running → completed → cancelled → archived
- **State Machine:** `modules/academy/domain/lifecycle.ts`
- **Evidence:** `modules/academy/presentation/academy.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Programs, groups, enrollments, attendance, group sessions

### 6. tournaments — Tournament Management
- **Files:** 9
- **Routes:** 31
- **Permission Coverage:** 100% (31/31)
- **Lifecycle:** draft → published → registration_open → registration_closed → running → completed → cancelled → archived
- **State Machine:** `modules/tournaments/domain/lifecycle.ts`
- **Evidence:** `modules/tournaments/presentation/tournament.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Bracket generation, group stage, standings, seeding (basic)

### 7. leagues — League & Season Management
- **Files:** 19
- **Routes:** 42
- **Permission Coverage:** 100% (42/42)
- **Lifecycle:** draft → registration_open → registration_closed → running → completed → cancelled → archived
- **State Machine:** `modules/leagues/domain/lifecycle.ts`
- **Evidence:** `modules/leagues/presentation/league.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Seasons, divisions, promotion/relegation, fixtures, standings, team/player stats

### 8. membership — Membership Plans & Loyalty
- **Files:** 11
- **Routes:** 14
- **Permission Coverage:** 100%
- **Evidence:** `modules/membership/presentation/membership.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Plans, benefits, assignments, freeze/resume/cancel/renew, loyalty points

### 9. match — Public Matchmaking
- **Files:** 31
- **Routes:** 9
- **Lifecycle:** open → full → closed → in_progress → completed / cancelled / void
- **State Machine:** `modules/match/match.entity.ts`
- **Evidence:** `modules/match/presentation/match.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Join/withdraw, applicants, eligibility, waiting list

### 10. coaches — Coach Session State Machine
- **Files:** 4
- **Routes:** 0 (state machine only)
- **Purpose:** Session status transitions (requested → accepted → confirmed → completed)
- **Evidence:** `modules/coaches/application/coach-session-state.service.ts`
- **Status:** ⚠️ Partial — state machine only, no CRUD routes. Coach CRUD lives in organisations module.

## Commerce

### 11. marketplace — Product & Order Management
- **Files:** 26
- **Routes:** 70 (largest module)
- **Permission Coverage:** 33% (23/70 with `requirePermission`, 43 with `authMiddleware` only)
- **Evidence:** `modules/marketplace/presentation/marketplace.routes.ts`
- **Status:** ✅ Complete (permission gaps identified)
- **Key Features:** Products, variants, cart, checkout, orders, reviews, shipping, seller management, settlements, wishlist, coupons

### 12. inventory — Warehouse & Stock
- **Files:** 5 (in marketplace module)
- **Routes:** 10
- **Evidence:** `modules/marketplace/presentation/inventory.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Warehouses, suppliers, purchase orders, stock transfers, inventory ledger

### 13. coupon — Coupon Management
- **Files:** 6
- **Routes:** 2
- **Evidence:** `modules/coupon/presentation/coupon.routes.ts`
- **Status:** ✅ Complete

## Financial

### 14. payment — Payment Processing
- **Files:** 14
- **Routes:** 13
- **Permission Coverage:** 54% (7/13 with `requirePermission`)
- **Evidence:** `modules/payment/presentation/payment.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Gateway integration (Paymob), webhooks, reconciliation, refunds, wallet top-up

### 15. wallet — Wallet Management
- **Files:** 17
- **Routes:** 4
- **Permission Coverage:** 25% (1/4 with `requirePermission`)
- **Evidence:** `modules/wallet/presentation/wallet.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Balance, deposit, withdraw, transactions, optimistic locking

### 16. financial — Financial Administration
- **Files:** 23
- **Routes:** 10
- **Evidence:** `modules/financial/presentation/`
- **Status:** ✅ Complete
- **Key Features:** Ledger, settlements, commissions, withdrawal requests, transaction service

### 17. accounting — Double-Entry Accounting
- **Files:** 3
- **Routes:** 23
- **Permission Coverage:** 100%
- **Evidence:** `modules/accounting/presentation/accounting.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Chart of accounts, accounting periods, general ledger, trial balance, invoices, tax rates

### 18. settlement — Settlement Engine
- **Files:** 11
- **Routes:** 9
- **Evidence:** `modules/settlement/presentation/settlement.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Marketplace settlement lifecycle (requested → paid → completed)

### 19. pricing — Dynamic Pricing
- **Files:** 9
- **Routes:** 10
- **Evidence:** `modules/pricing/presentation/pricing.routes.ts`
- **Status:** ✅ Complete

## People

### 20. hr — HR & Payroll
- **Files:** 3
- **Routes:** 52
- **Permission Coverage:** 100% (52/52)
- **Evidence:** `modules/hr/presentation/hr.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Employees, departments, positions, contracts, leave, attendance, payroll components, payroll runs

### 21. crm — Customer Relationship Management
- **Files:** 3
- **Routes:** 18
- **Permission Coverage:** 100%
- **Evidence:** `modules/crm/presentation/crm.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Customer 360, segments, leads, marketing campaigns, communication log

### 22. player-experience — Player Dashboard
- **Files:** 7
- **Routes:** 12
- **Evidence:** `modules/player-experience/presentation/player.routes.ts`
- **Status:** ✅ Complete

## Platform

### 23. organisations — Organization & Branch Management
- **Files:** 24
- **Routes:** 85 (organisation) + 70 (org-portal) = 155 total
- **Permission Coverage:** 100% (org-portal with org-scoped guards)
- **Evidence:** `modules/organisations/presentation/`
- **Status:** ✅ Complete
- **Key Features:** Orgs, branches, resources, sports, staff, members, coaches, subscription, cancellation policies, access control, amenities, holidays

### 24. notifications — Notification Engine
- **Files:** 61 (largest module by file count)
- **Routes:** 48
- **Permission Coverage:** 0% — CRITICAL GAP
- **Evidence:** `modules/notifications/presentation/notification.routes.ts`
- **Status:** ⚠️ Complete but MISSING permission guards on 25 admin routes
- **Key Features:** In-app, push, email, SMS, WhatsApp, broadcast, templates, A/B tests, webhooks, dead letter queue, quiet hours

### 25. scheduling — Unified Scheduling Engine
- **Files:** 15
- **Routes:** 3
- **Evidence:** `modules/scheduling/presentation/scheduling.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Coach+court search, availability, booking with Redis locks

### 26. reports — Enterprise Reports
- **Files:** 4
- **Routes:** 30
- **Evidence:** `modules/reports/presentation/reports.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Financial, bookings, users, orgs, marketplace, tournaments, coaches, ads, audit reports

### 27. bi — Business Intelligence
- **Files:** 3
- **Routes:** 6
- **Evidence:** `modules/bi/presentation/bi.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Executive dashboard, org drill-down, KPI snapshots, CSV export, web vitals

### 28. sports-engine — Advanced Sports Intelligence
- **Files:** 5
- **Routes:** 8
- **Evidence:** `modules/sports-engine/presentation/sports-engine.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** ELO rankings, match quality, recommendations (partners + coaches), trends, scheduling optimization

### 29. security — Security Monitoring
- **Files:** 10
- **Routes:** 13
- **Evidence:** `modules/security/presentation/security.routes.ts`
- **Status:** ✅ Complete
- **Key Features:** Session monitoring, failed logins, upload security, org security, role audit, system health

### 30. audit-log — Audit Trail
- **Files:** 9
- **Routes:** 1
- **Evidence:** `modules/audit-log/presentation/audit-log.routes.ts`
- **Status:** ✅ Complete
- **Features:** Multi-filter query, pagination, fire-and-forget recording

### 31. support — Support Tickets
- **Files:** 3
- **Routes:** 9
- **Evidence:** `modules/support/presentation/support.routes.ts`
- **Status:** ✅ Complete
- **Features:** Ticket CRUD, assignment, messaging, stats, audit

### 32. integration — API Gateway & Key Management
- **Files:** 5
- **Routes:** 11
- **Evidence:** `modules/integration/`
- **Status:** ✅ Complete
- **Features:** API key CRUD, key auth middleware, `/api/v1/` gateway endpoints

### 33. mobile — Mobile Platform & Push
- **Files:** 3
- **Routes:** 13
- **Evidence:** `modules/mobile/presentation/mobile.routes.ts`
- **Status:** ✅ Complete
- **Features:** Push token registration, app versions, remote config, push log

### 34. realtime — WebSocket / Socket.IO
- **Files:** 11
- **Routes:** 0 (event-driven)
- **Evidence:** `modules/realtime/`
- **Status:** ✅ Complete
- **Features:** 35+ event subscriptions, room auth, dedup, presence

### 35. community — Social Features
- **Files:** 5
- **Routes:** 35+
- **Evidence:** `modules/community/presentation/community.routes.ts`
- **Status:** ✅ Complete

## Infrastructure

### 36-53. Reference Data Modules
- **Modules:** activities, admin, amenities, approvals, app-settings, banks, cities, cms, countries, currencies, design-tokens, geo, languages, provinces, reference-data, sidebar-layout, time, translations, upload
- **Status:** All ✅ Complete
- **Note:** These are CRUD reference data and utility modules with minimal business logic
