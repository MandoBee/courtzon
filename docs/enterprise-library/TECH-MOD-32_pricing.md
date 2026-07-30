---
document_id: "TECH-MOD-32"
document_name: "Pricing Module"
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
  references: ["TECH-ARCH-02", "TECH-MOD-03"]
  related: ["TECH-MOD-31", "TECH-MOD-18"]
---

# Pricing Module (TECH-MOD-32)

**Source:** `backend/src/modules/pricing/` (6 directories: domain/, application/, presentation/, infrastructure/, __tests__/, index.ts)

## 1. Purpose

Dynamic pricing engine with a 4-phase calculation pipeline: base → season → rules → demand. Supports 7 rule types, seasonal multipliers, demand-based surge pricing, and day-of-week/time-of-day/date-range constraints. All admin routes gated by super_admin.

## 2. Architecture

```
domain/
  pricing-aggregate.ts   — PricingRule, SeasonRule, DemandRule, applyRule(), matchers
  pricing-engine.ts      — calculatePrice() 4-phase pipeline
application/
  pricing.service.ts     — Orchestration
presentation/
  pricing.routes.ts      — 11 endpoints
  pricing.controller.ts
  pricing.dto.ts
index.ts                 — Exports: pricingService, pricingRoutes, calculatePrice
```

**Evidence:** `pricing-engine.ts:4-70`, `pricing-aggregate.ts:1-103`.

## 3. Price Calculation Pipeline

`pricing-engine.ts:4-70` — `calculatePrice()`:

```
Phase 1: Base Price → starts with basePrice
Phase 2: Season Adjustment → applies active season multiplier
Phase 3: Pricing Rules → sorted by priority, applies matching rules
Phase 4: Demand Multiplier → applies if occupancy >= threshold
```

**Evidence:** `pricing-engine.ts:14-63`.

## 4. Rule Types

Defined in `pricing-aggregate.ts:1` and `:76-87`:

| Rule Type | Effect |
|-----------|--------|
| `fixed` | `base + value` |
| `percentage_increase` | `base * (1 + value/100)` |
| `percentage_decrease` | `base * (1 - value/100)` |
| `multiplier` | `base * value` |
| `min_price` | `Math.max(base, value)` |
| `max_price` | `Math.min(base, value)` |
| `override` | `value` (replaces base) |

## 5. Pricing Rules Attributes

| Attribute | Description |
|-----------|-------------|
| `ruleType` | One of 7 types above |
| `scope` | `'global' \| 'organisation' \| 'branch' \| 'resource'` |
| `scopeId` | ID for scoped rules |
| `resourceId` | Optional resource-specific rule |
| `value` | Numeric value |
| `priority` | Sort order (lower runs first) |
| `daysOfWeek` | Day-of-week filter |
| `timeRange` | Time-of-day filter |
| `dateRange` | Date range filter |

**Evidence:** `pricing-aggregate.ts:17-31`.

## 6. Season Rules

Defined in `pricing-aggregate.ts:33-40`:

- `organisationId` — scoped to org
- `dateRange` — start/end date
- `multiplier` — price multiplier during season
- `isActive` — toggle

## 7. Demand Rules

Defined in `pricing-aggregate.ts:42-48`:

- `resourceId` — optional resource scope
- `occupancyThreshold` — 0.0 to 1.0
- `multiplier` — surge multiplier when threshold met

## 8. Routes (11)

Defined in `pricing.routes.ts:11-23`:

| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | POST | `/pricing/preview` | auth (any) | Preview price calculation |
| 2 | GET | `/admin/pricing/rules` | super_admin | List rules |
| 3 | GET | `/admin/pricing/rules/:id` | super_admin | Get rule |
| 4 | POST | `/admin/pricing/rules` | super_admin | Create rule |
| 5 | PUT | `/admin/pricing/rules/:id` | super_admin | Update rule |
| 6 | DELETE | `/admin/pricing/rules/:id` | super_admin | Delete rule |
| 7 | GET | `/admin/pricing/seasons` | super_admin | List seasons |
| 8 | POST | `/admin/pricing/seasons` | super_admin | Create season |
| 9 | DELETE | `/admin/pricing/seasons/:id` | super_admin | Delete season |

## 9. Price Breakdown

Each calculation returns a `PriceResult` with:
- `basePrice` — Starting price
- `breakdown` — Array of `PriceBreakdownStep` showing each step: step name, input/output amounts, rule name
- `finalPrice` — Computed final price
- `currency` — EGP default
