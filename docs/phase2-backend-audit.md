# PHASE 2 — BACKEND AUDIT

**Date:** 2026-06-05
**Source:** `backend/src/` — 33 modules, ~15,000+ lines TypeScript

---

## MODULE-BY-MODULE REVIEW

| # | Module | Files | Purpose | Auth Layer | DTO | Tests | Health |
|---|--------|-------|---------|-----------|-----|-------|--------|
| 1 | **activities** | 5 | Tournaments, academies, coaches | Permission-gated + feature flags | ✅ | ❌ | Good |
| 2 | **amenities** | 5 | Amenity CRUD | adminGuard | ✅ | ❌ | Good |
| 3 | **app-settings** | 6 | Global settings & brand images | Permission-gated | ✅ | 1 spec | ✅ Good |
| 4 | **approvals** | 4 | Org registration approval | adminGuard | ❌ | ❌ | **No DTO** |
| 5 | **audit-log** | 5 | Audit trail logging | Permission-gated | ❌ | ❌ | **No DTO** |
| 6 | **auth** | 10 | Registration, login, tokens, passwords | Mixed (public + auth) | ✅ | 2 specs | ✅ Best |
| 7 | **banks** | 5 | Bank & branch ref data | adminGuard | ✅ | ❌ | Good |
| 8 | **booking** | 11 | Court booking engine | Permission + auth | ✅ | 2 specs | ✅ Best |
| 9 | **brute-force** | 2 | Login rate limiting | — | — | ❌ | Good |
| 10 | **cities** | 5 | City ref data CRUD | adminGuard | ✅ | ❌ | Good |
| 11 | **cms** | 6 | Pages, blogs, media, contacts | Mixed (public + admin) | ✅ | ❌ | Good |
| 12 | **community** | 5 | Social, chat, events, ads | Permission-gated + flags | ✅ | ❌ | Good |
| 13 | **countries** | 5 | Country ref data CRUD | adminGuard | ✅ | ❌ | Good |
| 14 | **coupon** | 6 | Discount coupon management | Permission-gated | ✅ | ❌ | Good |
| 15 | **currencies** | 5 | Currency ref data CRUD | adminGuard | ✅ | ❌ | Good |
| 16 | **design-tokens** | 5 | Theme studio, role themes | Permission-gated | ✅ | ❌ | Good |
| 17 | **financial** | 9 | Withdrawals, transactions | Permission-gated | ✅ | ❌ | Good |
| 18 | **geo** | 3 | Geo-IP currency detection | Public | ❌ | ❌ | Minimal |
| 19 | **languages** | 5 | Language ref data CRUD | adminGuard | ✅ | ❌ | Good |
| 20 | **marketplace** | 19 | E-commerce (largest module) | Permission-gated + flags | ✅ | ❌ | **Needs split** |
| 21 | **notifications** | 5 | User notification inbox | Auth | ✅ | ❌ | Good |
| 22 | **organisations** | 17 | Orgs, branches, resources (2nd largest) | Mixed | ✅ | 1 spec | **Needs split** |
| 23 | **payment** | 5 | Charge, refund, webhooks | Mixed (webhook = none) | ✅ | ❌ | Good |
| 24 | **provinces** | 5 | Province ref data CRUD | adminGuard | ✅ | ❌ | Good |
| 25 | **rbac** | 6 | Roles, perms, users, dashboard | Permission-gated | ✅ | ❌ | **Needs split** |
| 26 | **redis-lock** | 1 | Lua types only | — | — | — | Types-only |
| 27 | **reports** | 4 | 28 analytics endpoints | superAdminGuard | ❌ | ❌ | **No DTO** |
| 28 | **security** | 5 | Security dashboard | superAdminGuard | ❌ | ❌ | **No DTO** |
| 29 | **settlement** | 6 | Financial settlement engine | Permission-gated | ✅ | ❌ | Good |
| 30 | **sidebar-layout** | 4 | Per-user sidebar config | Auth | ❌ | ❌ | **No DTO** |
| 31 | **translations** | 7 | Multi-language management | adminGuard | ✅ | ❌ | Good |
| 32 | **upload** | 10 | File upload with storage strategy pattern | Auth | ✅ | ❌ | ✅ Best |
| 33 | **wallet** | 6 | User wallet & withdrawals | Permission-gated | ✅ | ❌ | Good |

---

## CRITICAL FINDINGS

### 1. Monolithic Files (need decomposition)

| File | Lines | What it does | Should be split into |
|------|-------|-------------|---------------------|
| `marketplace.repository.ts` | **1,014** | Products, orders, cart, addresses, coupons, reviews | 6 files: `product.repo.ts`, `order.repo.ts`, `cart.repo.ts`, `address.repo.ts`, `coupon.repo.ts`, `review.repo.ts` |
| `organisation.controller.ts` | **958** | Sports, org types, orgs, branches, resources, subscriptions, cancellations | 5+ controllers |
| `marketplace.service.ts` | **855** | Products, cart, orders, addresses, coupons, reviews | 6 services |
| `organisation.service.ts` | **808** | Sports, org types, orgs, branches, resources, subscriptions, cancellations | 5+ services |
| `rbac.repository.ts` | **748** | Roles, perms, users, feature flags, coach actions, dashboard analytics | 4 files |
| `activities.repository.ts` | **705** | Tournaments, academies, coaches, player profiles | 3 files |
| `auth.service.ts` | **552** | 4 registration flows + login + refresh + profile + password reset | 3-4 files |

### 2. Duplicated Business Logic

| Pattern | Occurrences | Impact |
|---------|------------|--------|
| Phone/email uniqueness checks | 4x in `auth.service.ts` | 4 registration flows → could be 1 shared method |
| Pagination `LIMIT/OFFSET + COUNT` | 12+ repositories | Extract into `shared/utils/pagination.ts` |
| Dynamic update builder `SET field=?` | 6+ repositories | Extract into `shared/utils/query-builder.ts` |
| Existence check `SELECT 1 ... LIMIT 1` | 15+ locations | Could use shared helper |

### 3. Inconsistent Architecture Patterns

**3 instantiation styles coexist:**

- **Class + singleton export** (good): `authService`, `rbacService`, `commissionService`
- **Object literal export** (not mockable): `marketplaceService`, `activitiesRepository`, `communityRepository`
- **Direct `new`** (tight coupling): `new DeviceRepository()` inside `auth.service.ts`, `getPool()` in `pricing-engine.ts`

**Domain layer missing in 26/33 modules** — most business logic directly uses DB row types.

### 4. Missing DTOs

5 modules lack DTO/Zod validation files:
- `approvals`, `audit-log`, `geo`, `reports`, `security`, `sidebar-layout`

### 5. Console.log Instead of Logger

| File | Line | Code |
|------|------|------|
| `organisation.controller.ts` | 197 | `console.error(...)` |
| `booking.service.ts` | 167, 182, 184 | `console.log(...)` / `console.error(...)` |
| `audit-log.service.ts` | 9 | `console.error(...)` — most critical (audit silent failure) |

---

## ARCHITECTURE SCORES

| Criterion | Score | Rationale |
|-----------|-------|-----------|
| **Domain Boundaries** | 6/10 | Clean module structure, but 26/33 modules lack domain layer |
| **Service Layer** | 6/10 | Business logic well-organized, but 3+ instantiation patterns |
| **Repository Pattern** | 7/10 | Well-separated, but 2 styles (class vs object literal) |
| **Validation Consistency** | 7/10 | Zod at controller boundaries, but 5 modules lack DTOs |
| **Error Handling** | 6/10 | Good global handler, but generic `Error` thrown in places, silent catches |
| **Test Coverage** | 2/10 | Only 9 test files across entire ~15K LOC project |
| **Separation of Concerns** | 5/10 | Monolithic files violate SRP (1K+ line repo files) |
| **Dependency Management** | 7/10 | No circular deps found, but cross-module coupling is high |

### Overall Scores

| Score | Value |
|-------|-------|
| **Architecture Score** | **6.5/10** |
| **Maintainability Score** | **5.5/10** |
| **Scalability Score** | **6.5/10** |

---

## CLEANUP PLAN (Priority Order)

### P0 — Immediate (1-2 days)

| # | Task | Effort | Risk | Files Affected |
|---|------|--------|------|---------------|
| 1 | Replace `console.log/error` with Pino logger | 2 hours | Low | 4 files |
| 2 | Add auth middleware to `/auth/me` route for consistency | 15 min | Low | 1 file |
| 3 | Fix generic `Error` throws → typed errors | 1 hour | Low | 3 files |

### P1 — High (3-5 days)

| # | Task | Effort | Risk | Files Affected |
|---|------|--------|------|---------------|
| 4 | Split `marketplace.repository.ts` (1014→~200 each) | 1 day | Medium | 1→6 files |
| 5 | Extract shared pagination utility | 4 hours | Low | 12+ repositories |
| 6 | Extract shared update query builder | 2 hours | Low | 6+ repositories |
| 7 | Consolidate 4 registration flows → shared `createUser` | 1 day | Medium | `auth.service.ts` |

### P2 — Medium (5-7 days)

| # | Task | Effort | Risk | Files Affected |
|---|------|--------|------|---------------|
| 8 | Split `organisation.controller.ts` (958 lines) | 1 day | Medium | 1→5 files |
| 9 | Split `rbac.repository.ts` (748 lines) | 1 day | Medium | 1→4 files |
| 10 | Add DTOs to 5 missing modules | 1 day | Low | 5 files |
| 11 | Convert object-literal repos → class-based | 2 days | Medium | 6 modules |

### P3 — Low (future sprints)

| # | Task | Effort | Risk | Files Affected |
|---|------|--------|------|---------------|
| 12 | Extract domain layers for 26 modules | 5 days | Medium | 26+ modules |
| 13 | Add test coverage to all modules | 10 days | Low | 33 modules |
| 14 | Add OpenAPI/Swagger docs | 3 days | Low | 27 route files |

---

## KEY METRICS

| Metric | Value |
|--------|-------|
| Total modules | 33 |
| Total API endpoints | ~320 |
| Total backend files (src/) | ~180 |
| Lines of code (approx) | ~15,000 |
| Test files | 9 |
| Test coverage | <5% |
| Monolithic files (>500 lines) | 12 |
| Modules with DTOs | 28/33 |
| Modules with domain layer | 7/33 |
| console.log/error calls | 5 |
| Generic Error throws | 4 |
