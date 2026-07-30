---
document_id: "TECH-MOD-25"
document_name: "BI Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect", "analyst"]
difficulty: "intermediate"
reading_time: 10
business_owner: "Data Analyst"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02"]
  related: ["TECH-MOD-03", "TECH-MOD-01", "TECH-MOD-13", "TECH-MOD-14"]
---

# BI Module (TECH-MOD-25)

**Source:** `backend/src/modules/bi/` (3 files: index.ts, presentation/bi.controller.ts, presentation/bi.routes.ts)

## 1. Purpose

Business Intelligence & executive dashboard: aggregated revenue, bookings, users, organisations, trends. Org-scoped drill-down. KPI snapshot historical tracking. CSV export for any report. Web Vitals (LCP, CLS, FCP, TTFB) and client error viewer. 6 routes.

## 2. Architecture

```
presentation/
  bi.routes.ts       — 6 endpoints (18 lines)
  bi.controller.ts   — Request handlers
index.ts             — Barrel export
```

**Evidence:** `bi.routes.ts` (18 lines) defines all 6 routes.

## 3. Routes (6)

Defined in `bi.routes.ts:8-18`:

| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 1 | GET | `/bi/dashboard` | `bi.dashboard.view` | Executive dashboard |
| 2 | GET | `/bi/dashboard/org/:orgId` | `bi.dashboard.view` | Org-scoped dashboard |
| 3 | GET | `/bi/kpi-snapshots` | `bi.kpi.view` | KPI historical snapshots |
| 4 | GET | `/bi/export/:reportType` | `bi.export` | CSV export |
| 5 | GET | `/bi/web-vitals` | `bi.observability.view` | Web Vitals metrics |
| 6 | GET | `/bi/client-errors` | `bi.observability.view` | Client error reports |

## 4. Permissions

- `bi.dashboard.view` — Dashboard access (executive + org)
- `bi.kpi.view` — KPI snapshot history
- `bi.export` — CSV export
- `bi.observability.view` — Web Vitals + client errors

## 5. Dashboard

**Executive Dashboard** (`GET /bi/dashboard`):
- Revenue metrics (total, by period, by source)
- Booking metrics (total, by status, by period)
- User metrics (total, new, active)
- Organisation metrics (total, by type, new)
- Trend data (day-over-day, week-over-week)

**Org Dashboard** (`GET /bi/dashboard/org/:orgId`):
- Filtered to single organisation
- Same metrics scoped to org's data

## 6. KPI Snapshots

`GET /bi/kpi-snapshots` provides historical KPI snapshots stored in `kpi_snapshots` table:
- Timestamped records of key business metrics
- Enables trend analysis and comparison
- Snapshot frequency: daily (scheduled job)

## 7. CSV Export

`GET /bi/export/:reportType` exports any report as CSV:
- `reportType` parameter selects the report
- Returns CSV content with appropriate Content-Type header

## 8. Web Vitals Viewer

`GET /bi/web-vitals` (`bi.observability.view`):
- LCP (Largest Contentful Paint)
- CLS (Cumulative Layout Shift)
- FCP (First Contentful Paint)
- TTFB (Time to First Byte)
- Data from `web_vitals_metrics` table
- Submitted via `POST /client/web-vitals` (notifications module)

## 9. Client Errors Viewer

`GET /bi/client-errors` (`bi.observability.view`):
- Aggregated client-side JS errors
- Stack traces, frequency, affected users, URLs
- Data from `client_error_reports` table
- Submitted via `POST /client/errors` (notifications module)

## 10. Events

- `bi:dashboard_viewed` — Dashboard accessed
- `bi:report_exported` — CSV report downloaded
