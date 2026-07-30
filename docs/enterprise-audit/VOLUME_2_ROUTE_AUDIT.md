# CourtZon v2.2.0 — Volume 2: Complete Route Audit

## Total Routes Analyzed: 619 across 53 modules

## Modules with 100% Permission Coverage (All endpoints gated)

| Module | Routes | Permissions Used |
|--------|--------|-----------------|
| **booking** | 18 | `bookings.create`, `bookings.view`, `bookings.cancel`, `bookings.check-in`, `admin.bookings.update-status`, `org.bookings.manage`, `bookings.matchmaking` |
| **academy** | 38 | `academy.dashboard.view`, `academy.view`, `academy.create`, `academy.update`, `academy.publish`, `academy.delete`, `academy.manage`, `academy.enroll`, `attendance.manage` |
| **tournaments** | 31 | `tournament.dashboard.view`, `tournament.view`, `tournament.create`, `tournament.update`, `tournament.publish`, `tournament.delete`, `tournament.register`, `tournament.manage`, `tournament.result.manage` |
| **leagues** | 42 | `league.dashboard.view`, `season.view/create/update/publish/delete`, `league.view/create/update/manage/delete`, `league.result.manage` |
| **hr** | 52 | `hr.departments.view/manage`, `hr.positions.view/manage`, `hr.employees.view/manage`, `hr.contracts.view/manage`, `hr.leaves.types/requests/balances.*`, `hr.attendance.view/manage`, `hr.payroll.components/runs.*`, `hr.dashboard.view` |
| **accounting** | 23 | `accounting.coa.view/manage`, `accounting.periods.view/manage`, `accounting.gl.view`, `accounting.journal.view/create`, `accounting.invoices.view/manage`, `accounting.tax.view/manage` |
| **crm** | 18 | `crm.dashboard.view`, `crm.customers.view`, `crm.segments.view/manage`, `crm.leads.view/manage`, `crm.campaigns.view/manage`, `crm.communications.view` |
| **org-portal** | 70 | `orgAccessGuard`, `orgManageGuard`, `org.announcements.manage`, `org.documents.manage`, `org.gallery.manage`, `org.branches.manage`, `org.settings.edit` |
| **organisations** | 85 | Mix of adminGuard, branchGuard, `marketplace.moderate`, `financial.reconcile` |

## Modules with Permission Gaps

### notifications — 48 routes, 0 with requirePermission (CRITICAL)
**Evidence:** `modules/notifications/presentation/notification.routes.ts:13-46`  
**Affected routes:**
- 25 admin routes including: broadcast (create/list/cancel), analytics, dead letters, feature flags, A/B tests, cleanup policies, event replay, templates (list/update/version/rollback), webhooks (CRUD), audit trail
- **Impact:** Any authenticated user can access admin notification management
- **Fix Required:** Add `requirePermission` guards. Recommended keys: `notifications.broadcast`, `notifications.analytics`, `notifications.templates.manage`, `notifications.webhooks.manage`, `notifications.feature-flags.manage`

### marketplace — 43/70 routes with authMiddleware only (MEDIUM)
**Evidence:** `modules/marketplace/presentation/marketplace.routes.ts`  
**Affected routes:** Product listing, cart operations, wishlist, addresses, orders, brands, tags, provinces/cities
- **Mitigation:** Most are read-only or self-service (user's own cart, orders, addresses)
- **Recommended fix:** Add `marketplace.view` for browse routes, `marketplace.orders.view` for order routes

### wallet — 3/4 routes with authMiddleware only (MEDIUM)
**Evidence:** `modules/wallet/presentation/wallet.routes.ts`  
**Affected routes:** `GET /wallets/me`, `POST /wallets/deposit`, `GET /wallets/transactions`
- **Mitigation:** These are self-service (user's own wallet). Only withdraw is permission-gated.
- **Recommended fix:** Add `wallet.view`, `wallet.deposit` permissions for consistency

### payment — 5/13 routes with authMiddleware only (MEDIUM)
**Evidence:** `modules/payment/presentation/payment.routes.ts`  
**Affected routes:** `POST /payments/charge`, `POST /payments/confirm`, `GET /payments/status/:id`, `GET /payments/transactions`
- **Mitigation:** Self-service payment operations
- **Recommended fix:** Add `payment.charge`, `payment.confirm` permissions

## Permission Coverage by Module Type

| Module Type | Routes | Gated | Coverage |
|-------------|--------|-------|----------|
| **Sports** (booking, academy, tournament, league, match) | 137 | 137 | **100%** |
| **Business** (marketplace, inventory, crm, hr, accounting) | 178 | 160 | **90%** |
| **Financial** (payment, wallet, financial, settlement) | 37 | 21 | **57%** |
| **Platform** (notifications, security, audit, support, org-portal) | 180 | 112 | **62%** |
| **Identity** (auth, rbac) | 59 | 1 | **2%** (intentionally role-guarded) |
| **Infrastructure** (bi, sports-engine, integration, mobile, community) | 80 | 80 | **100%** |
| **TOTAL** | **619** | **546** | **88%** |

## Authentication Coverage

| Auth Type | Total | Public | Authenticated |
|-----------|-------|--------|---------------|
| Public (no auth) | 30 | — | — |
| authMiddleware only | 113 | — | ✓ |
| authMiddleware + permission/role | 476 | — | ✓ |
| **TOTAL** | **619** | 30 | 589 |

## Recommendations

1. **IMMEDIATE (Critical):** Add `requirePermission` to all 25 notification admin routes
2. **HIGH:** Add wallet/payment self-service permissions for audit consistency
3. **MEDIUM:** Add marketplace read permission keys
4. **LOW:** Consider adding permission keys to auth self-service profile routes
