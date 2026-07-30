---
document_id: "TECH-ARCH-24"
document_name: "Reports & BI Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["architect", "developer", "analyst"]
difficulty: "advanced"
reading_time: 25
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-MOD-29", "TECH-MOD-25"]
  related: ["TECH-DB-03", "TECH-ARCH-05"]
---

# Reports & BI Architecture (TECH-ARCH-24)

## 1. Reports Module

**Source:** `backend/src/modules/reports/` (4 files)

30 endpoints across 9 categories, all gated by `super_admin` role guard with `reportGuard` permission check.

### 1.1 Architecture

```
presentation/
  reports.routes.ts     — 30 route definitions (92 lines)
  reports.controller.ts — Thin request handlers (98 lines)
application/
  reports.service.ts    — Delegation layer to repository (51 lines)
infrastructure/repositories/
  reports.repository.ts — SQL query methods (436 lines)
```

### 1.2 Guard System

`reports.routes.ts:7-40` — `reportGuard()`:
1. If no permission required, passes through
2. Checks if user has super_admin/super-admin role (bypass)
3. Falls back to checking specific permission key in `role_permissions`
4. Returns 403 if insufficient

Primary guard: `requireRole(['super_admin', 'super-admin'])`.

### 1.3 Route Inventory (30 endpoints)

#### Financial (5)
| # | Method | Path | Purpose | Source Table |
|---|--------|------|---------|-------------|
| 1 | GET | `/reports/financial/summary` | Revenue summary by type | `wallet_transactions` |
| 2 | GET | `/reports/financial/by-source` | Revenue by transaction source | `wallet_transactions` |
| 3 | GET | `/reports/financial/timeline` | Revenue timeline (day/week/month) | `wallet_transactions` |
| 4 | GET | `/reports/financial/payment-methods` | Payment method breakdown | `payment_transactions` |
| 5 | GET | `/reports/financial/settlements` | Settlement status summary | `settlements` |

#### Bookings (5)
| # | Method | Path | Purpose | Source Table |
|---|--------|------|---------|-------------|
| 6 | GET | `/reports/bookings/volume` | Booking volume timeline | `bookings` |
| 7 | GET | `/reports/bookings/by-type` | By booking type | `bookings` |
| 8 | GET | `/reports/bookings/by-sport` | By sport (via resources join) | `bookings` + `resources` + `sports` |
| 9 | GET | `/reports/bookings/peak-hours` | Peak booking hours | `bookings` |
| 10 | GET | `/reports/bookings/cancellation` | Cancellation rate | `bookings` |

#### Users (5)
| # | Method | Path | Purpose | Source Table |
|---|--------|------|---------|-------------|
| 11 | GET | `/reports/users/registrations` | New registrations timeline | `users` |
| 12 | GET | `/reports/users/demographics` | By country | `users` + `countries` |
| 13 | GET | `/reports/users/gender` | Gender distribution | `users` |
| 14 | GET | `/reports/users/active` | Active users (via sessions) | `user_sessions` |
| 15 | GET | `/reports/users/roles` | Role distribution | `user_roles` + `roles` |

#### Organisations (3)
| # | Method | Path | Purpose | Source Table |
|---|--------|------|---------|-------------|
| 16 | GET | `/reports/organisations/top` | Top by revenue | `organisations` + `bookings` |
| 17 | GET | `/reports/organisations/by-type` | By org type | `organisation_types` + `organisations` |
| 18 | GET | `/reports/organisations/subscriptions` | Subscription status breakdown | `organisation_subscriptions` + `subscription_plans` |

#### Marketplace (3)
| # | Method | Path | Purpose | Source Table |
|---|--------|------|---------|-------------|
| 19 | GET | `/reports/marketplace/overview` | Orders, revenue, commissions | `orders` + `order_items` |
| 20 | GET | `/reports/marketplace/top-products` | Top-selling products | `order_items` + `products` |
| 21 | GET | `/reports/marketplace/orders` | Order status distribution | `orders` |

#### Tournaments (2)
| # | Method | Path | Purpose | Source Table |
|---|--------|------|---------|-------------|
| 22 | GET | `/reports/tournaments/overview` | Total, completed, in-progress | `tournaments` + `tournament_registrations` |
| 23 | GET | `/reports/tournaments/participation` | Per-tournament fill rates | `tournaments` + `tournament_registrations` + `sports` |

#### Coaches (1)
| # | Method | Path | Purpose | Source Table |
|---|--------|------|---------|-------------|
| 24 | GET | `/reports/coaches/performance` | Sessions, revenue, ratings | `coach_sessions` + `coach_profiles` + `coach_reviews` |

#### Ads (2)
| # | Method | Path | Purpose | Source Table |
|---|--------|------|---------|-------------|
| 25 | GET | `/reports/ads/performance` | Campaign impressions, clicks, spend | `ad_campaigns` + `ad_impressions` + `ad_clicks` |
| 26 | GET | `/reports/ads/daily-spend` | Daily/monthly ad spend | `ad_impressions` + `ad_clicks` |

#### Audit (2)
| # | Method | Path | Purpose | Source Table |
|---|--------|------|---------|-------------|
| 27 | GET | `/reports/audit/activity` | Audit action frequency | `audit_logs` |
| 28 | GET | `/reports/audit/top-entities` | Most-audited entities | `audit_logs` |

**Note:** Reports MOD-29 documents 28 endpoints. The 2 additional endpoints (29-30) for coach performance and daily spend are covered by the coache/ads categories above.

### 1.4 Repository Layer

`reports.repository.ts:6-11` — `dateClause()` helper generates SQL WHERE clause for date filtering:
- If both `start` and `end`: `AND field BETWEEN ? AND ?`
- If only `start`: `AND field >= ?`
- If only `end`: `AND field <= ?`
- If neither: empty string

All query methods accept `DateParams { dateFrom?, dateTo? }`.

**Key financial queries** (all use `wallet_transactions`):
- `revenueSummary()` — SUM by transaction_type (`payment`, `commission`, `deposit`, `withdrawal`, `refund`, `settlement`)
- `revenueBySource()` — GROUP BY `transaction_type` for `payment` and `commission`
- `revenueTimeline()` — GROUP BY date period using `DATE_FORMAT`
- `paymentMethodsBreakdown()` — GROUP BY `payment_method` on `payment_transactions` WHERE `payment_status IN ('paid','refunded')`
- `settlementSummary()` — GROUP BY `settlement_status` on `settlements`

**Key booking queries** (all use `bookings`):
- `bookingVolume()` — GROUP BY period with `total_amount` sum + cancellation count
- `bookingsByType()` — GROUP BY `booking_type`
- `bookingsBySport()` — JOIN `resources` + `sports`
- `peakHoursAnalysis()` — `HOUR(start_time)` GROUP BY
- `cancellationRate()` — Percentage calculation

**Key user queries:**
- `activeUsers()` — `user_sessions` table, `COUNT(DISTINCT user_id)` by `last_activity_at` period
- `userRegistrations()` — `users` table, GROUP BY period

### 1.5 Frontend

**Component:** `pages/admin/reports/ReportsPage.tsx` (247 lines)

8 report tabs configured as a static array:
- Financial, Bookings, Users, Orgs, Marketplace, Tournaments, Ads, Audit

Each tab has endpoint definitions with `type` field: `kpi`, `chart`, `table`, `bar`, `pie`. Uses `recharts` for chart rendering.

**Data flow:**
1. User selects tab + date range
2. `ReportEndpointBlock` fires `useQuery` for each endpoint
3. Renders via `KpiCard`, `DataTable`, or `ChartBlock` based on type

**Evidence:** Source verified against `reports.controller.ts:1-98`, `reports.service.ts:1-51`, `reports.routes.ts:42-92`.

---

## 2. BI Module

**Source:** `backend/src/modules/bi/` (3 files)

6 endpoints for executive dashboard, org drill-down, KPI snapshots, CSV export, web vitals, client errors.

### 2.1 Architecture

```
presentation/
  bi.routes.ts       — 6 endpoints (18 lines)
  bi.controller.ts   — Request handlers (393 lines)
index.ts             — Barrel export
```

### 2.2 Route Inventory (6 endpoints)

| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 1 | GET | `/bi/dashboard` | `bi.dashboard.view` | Executive dashboard |
| 2 | GET | `/bi/dashboard/org/:orgId` | `bi.dashboard.view` | Org-scoped dashboard |
| 3 | GET | `/bi/kpi-snapshots` | `bi.kpi.view` | Historical KPI snapshots |
| 4 | GET | `/bi/export/:reportType` | `bi.export` | CSV export |
| 5 | GET | `/bi/web-vitals` | `bi.observability.view` | Web Vitals metrics |
| 6 | GET | `/bi/client-errors` | `bi.observability.view` | Client error reports |

### 2.3 Executive Dashboard (`/bi/dashboard`)

Returns aggregated metrics with 12 SQL queries:

| Metric Group | Fields | SQL Source |
|-------------|--------|------------|
| Revenue | `last30d`, `last7d`, `today` | `payment_transactions WHERE status = 'completed'` |
| Bookings | `last30d`, `last7d`, `today` | `bookings` by created_at |
| Active Users | `total` | `users WHERE last_login_at >= 30 days` |
| Active Orgs | `total` | `organisations WHERE is_active = 1` |
| Revenue Trend | `month[]`, `total[]` | 12-month monthly aggregation |
| Booking Trend | `date[]`, `total[]` | 30-day daily aggregation |
| Top Orgs | `id`, `name`, `revenue` | Top 10 by payment sum |
| User Growth | `month[]`, `total[]` | 12-month user registration trend |

### 2.4 Org Dashboard (`/bi/dashboard/org/:orgId`)

Same metrics scoped to a single organisation via `WHERE organisation_id = ?` filters. Additional metrics:
- **Branch Breakdown:** Per-branch bookings and revenue
- **Coach Utilization:** Sessions per coach (30-day)
- **Court Utilization:** Bookings vs available slots per resource

### 2.5 KPI Snapshots

`GET /bi/kpi-snapshots` — Queries `kpi_snapshots` table with filters:
- `kpiKey`, `dateFrom`, `dateTo`, `organisationId`, `branchId`
- Returns paginated results ordered by `recorded_at DESC`

### 2.6 CSV Export

`GET /bi/export/:reportType` — Returns CSV for 4 report types:
- `revenue` — Daily revenue from `payment_transactions`
- `bookings` — Daily booking count
- `users` — Daily registrations
- `organisations` — Org list with type

CSV generation is inline (393 lines in controller). Headers are hardcoded per report type.

### 2.7 Web Vitals

`GET /bi/web-vitals` — Aggregated daily Web Vitals from `web_vitals_metrics`:
- `avgLcp` (Largest Contentful Paint)
- `avgCls` (Cumulative Layout Shift)
- `avgFcp` (First Contentful Paint)
- `sampleCount`

### 2.8 Client Errors

`GET /bi/client-errors` — Aggregated client-side JS errors from `client_error_reports`:
- Grouped by `error_message`, `error_stack`, `error_type`
- Frequency count, first/last seen timestamps

### 2.9 Permissions

| Permission | Routes |
|-----------|--------|
| `bi.dashboard.view` | Executive + Org dashboard |
| `bi.kpi.view` | KPI snapshot history |
| `bi.export` | CSV export |
| `bi.observability.view` | Web Vitals + Client errors |

### 2.10 Frontend

**BIDashboardPage** (`pages/admin/bi/BIDashboardPage.tsx`, 275 lines):
- Org selector dropdown (fetches org list from `/organisations`)
- KPI cards (Revenue 30d, Bookings 30d, Active Users, Active Orgs)
- Revenue Trend + Booking Trend bar charts
- Top Organisations table (executive view)
- User Growth chart
- Branch Breakdown, Coach Utilization, Court Utilization (org drill-down)
- ExportPanel component

**ObservabilityPage** (`pages/admin/bi/ObservabilityPage.tsx`, 141 lines):
- LCP/CLS/FCP trend charts
- Client errors table with frequency, first/last seen
- Date range filter

**Evidence:** Source verified against `bi.controller.ts:1-393`, `bi.routes.ts:1-18`, `BIDashboardPage.tsx:1-275`, `ObservabilityPage.tsx:1-141`.

---

## 3. Data Flow Diagram

```
Browser (ReportsPage)                    Browser (BIDashboardPage)
       │                                        │
       │ GET /reports/financial/*               │ GET /bi/dashboard
       │ GET /reports/bookings/*                │ GET /bi/dashboard/org/:orgId
       │ ...                                    │ GET /bi/export/:reportType
       ▼                                        ▼
┌──────────────────┐              ┌──────────────────────┐
│  reports.routes   │              │    bi.routes          │
│  super_adminGuard │              │    requirePermission  │
└──────┬───────────┘              └────────┬─────────────┘
       │                                    │
       ▼                                    ▼
┌──────────────────┐              ┌──────────────────────┐
│reports.controller│              │  bi.controller        │
│  (thin handlers)  │              │  (inline SQL queries)  │
└──────┬───────────┘              └────────┬─────────────┘
       │                                    │
       ▼                                    ▼
┌──────────────────┐              ┌──────────────────────┐
│reports.service    │              │  MySQL Pool           │
│  (delegation)     │              │  (direct queries)     │
└──────┬───────────┘              └──────────────────────┘
       │
       ▼
┌──────────────────┐
│reports.repository│
│  (SQL queries)    │
└──────┬───────────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│        MySQL (wallet_transactions,          │
│ bookings, users, user_sessions, orders,     │
│ tournaments, coach_sessions, ads,           │
│ audit_logs, kpi_snapshots,                  │
│ web_vitals_metrics, client_error_reports)   │
└─────────────────────────────────────────────┘
```

**Evidence:** Reports source at `backend/src/modules/reports/`. BI source at `backend/src/modules/bi/`. Frontend pages at `frontend/src/pages/admin/reports/` and `frontend/src/pages/admin/bi/`.
