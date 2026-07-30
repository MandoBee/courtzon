---
document_id: "TECH-MOD-29"
document_name: "Reports Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02"]
  related: ["TECH-MOD-25"]
---

# Reports Module (TECH-MOD-29)

**Source:** `backend/src/modules/reports/` (4 files: routes, controller, service, infrastructure)

## 1. Purpose

30 report endpoints across 9 categories: financial, bookings, users, organisations, marketplace, tournaments, coaches, ads, audit. All endpoints gated by `super_admin` role guard with custom `reportGuard` permission check.

## 2. Routes (30)

Defined in `reports.routes.ts:48-91`:

**Financial (5):**
| # | Path | Purpose |
|---|------|---------|
| 1 | `/reports/financial/summary` | Revenue summary |
| 2 | `/reports/financial/by-source` | Revenue by source |
| 3 | `/reports/financial/timeline` | Revenue timeline |
| 4 | `/reports/financial/payment-methods` | Payment method breakdown |
| 5 | `/reports/financial/settlements` | Settlement reports |

**Bookings (5):**
| # | Path | Purpose |
|---|------|---------|
| 6 | `/reports/bookings/volume` | Booking volume |
| 7 | `/reports/bookings/by-type` | By booking type |
| 8 | `/reports/bookings/by-sport` | By sport |
| 9 | `/reports/bookings/peak-hours` | Peak booking hours |
| 10 | `/reports/bookings/cancellation` | Cancellation rate |

**Users (5):**
| # | Path | Purpose |
|---|------|---------|
| 11 | `/reports/users/registrations` | User registrations |
| 12 | `/reports/users/demographics` | Demographics |
| 13 | `/reports/users/gender` | Gender distribution |
| 14 | `/reports/users/active` | Active users |
| 15 | `/reports/users/roles` | Role distribution |

**Organisations (3):**
| # | Path | Purpose |
|---|------|---------|
| 16 | `/reports/organisations/top` | Top organisations |
| 17 | `/reports/organisations/by-type` | By org type |
| 18 | `/reports/organisations/subscriptions` | Subscription status |

**Marketplace (3):**
| # | Path | Purpose |
|---|------|---------|
| 19 | `/reports/marketplace/overview` | Marketplace overview |
| 20 | `/reports/marketplace/top-products` | Top products |
| 21 | `/reports/marketplace/orders` | Order status distribution |

**Tournaments (2):**
| # | Path | Purpose |
|---|------|---------|
| 22 | `/reports/tournaments/overview` | Tournament overview |
| 23 | `/reports/tournaments/participation` | Participation stats |

**Coaches (1):**
| # | Path | Purpose |
|---|------|---------|
| 24 | `/reports/coaches/performance` | Coach performance |

**Ads (2):**
| # | Path | Purpose |
|---|------|---------|
| 25 | `/reports/ads/performance` | Ad performance |
| 26 | `/reports/ads/daily-spend` | Daily ad spend |

**Audit (2):**
| # | Path | Purpose |
|---|------|---------|
| 27 | `/reports/audit/activity` | Audit activity |
| 28 | `/reports/audit/top-entities` | Top audited entities |

## 3. Guard System

`reports.routes.ts:7-40` — `reportGuard()`:
1. If no permission required, passes through
2. Checks if user has super_admin/super-admin role (bypass)
3. Falls back to checking specific permission key in `role_permissions`
4. Returns 403 if insufficient

Primary guard: `super_admin` role via `requireRole(['super_admin', 'super-admin'])`.

## 4. Controller

`reports.controller.ts:1-98` — Thin handlers that pass date filter params to `reportsService`:
- `filters()` extracts `dateFrom`, `dateTo`, `groupBy`, `limit`, `action` from query

## 5. Service

`reports.service.ts` (in `application/`) provides all 28 report methods:
- `financialSummary()`, `revenueBySource()`, `revenueTimeline()`, `paymentMethods()`, `settlements()`
- `bookingVolume()`, `bookingsByType()`, `bookingsBySport()`, `peakHours()`, `cancellationRate()`
- `userRegistrations()`, `userDemographics()`, `userGenderDistribution()`, `activeUsers()`, `userRoles()`
- `topOrgs()`, `orgTypeDist()`, `subscriptionStatus()`
- `marketplaceOverview()`, `topProducts()`, `orderStatusDist()`
- `tournamentOverview()`, `tournamentParticipation()`
- `coachPerformance()`
- `adsPerformance()`, `adsDailySpend()`
- `auditActivity()`, `topAuditEntities()`
