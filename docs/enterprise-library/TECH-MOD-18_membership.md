---
document_id: "TECH-MOD-18"
document_name: "Membership Module"
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
  references: ["TECH-ARCH-02", "TECH-MOD-10"]
  related: ["TECH-MOD-03", "TECH-MOD-04"]
---

# Membership Module (TECH-MOD-18)

**Source:** `backend/src/modules/membership/` (11 files: domain/, application/, presentation/, infrastructure/)

## 1. Purpose

Membership plans, user assignments, loyalty points, tier system, campaigns, and rewards catalog. Supports 10 plan types (monthly, quarterly, annual, unlimited, credits, session bundles, corporate, family, student). User membership lifecycle with freeze/resume/cancel/renew. 14 routes, all permission-gated.

## 2. Architecture

```
domain/
  membership-aggregate.ts   — Plan types, membership status, loyalty tiers, rewards, campaigns
  membership.types.ts       — DB attribute interfaces
application/
  membership-plan.service.ts    — Plan CRUD with benefits
  user-membership.service.ts    — Assign, freeze, resume, cancel, renew, expire, history
  membership.service.ts         — General membership orchestration
presentation/
  membership.routes.ts          — 14 endpoints
  membership.controller.ts      — Request handlers
```

**Evidence:** Directory structure.

## 3. Routes (14)

Defined in `membership.routes.ts:9-24`:

**Plans (6):**
| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 1 | GET | `/admin/membership/plans` | `membership.view` | List plans |
| 2 | GET | `/admin/membership/plans/options` | `membership.view` | Plan options (categories, types) |
| 3 | GET | `/admin/membership/plans/:id` | `membership.view` | Get plan |
| 4 | POST | `/admin/membership/plans` | `membership.create` | Create plan |
| 5 | PUT | `/admin/membership/plans/:id` | `membership.update` | Update plan |
| 6 | DELETE | `/admin/membership/plans/:id` | `membership.delete` | Delete plan |

**User assignments (8):**
| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 7 | GET | `/admin/membership/assignments` | `membership.view` | List assignments |
| 8 | POST | `/admin/membership/assign` | `membership.assign` | Assign membership |
| 9 | GET | `/admin/membership/assignments/:id` | `membership.view` | Get user membership |
| 10 | POST | `/admin/membership/:id/freeze` | `membership.manage` | Freeze membership |
| 11 | POST | `/admin/membership/:id/resume` | `membership.manage` | Resume membership |
| 12 | POST | `/admin/membership/:id/cancel` | `membership.manage` | Cancel membership |
| 13 | POST | `/admin/membership/:id/renew` | `membership.manage` | Renew membership |
| 14 | GET | `/admin/membership/:id/history` | `membership.view` | Membership history |

## 4. User Membership Lifecycle

Implemented in `user-membership.service.ts`:

```
active ←→ frozen
  ↓         ↓
cancelled  expired (terminal)
```

| Action | From Status | Method |
|--------|------------|--------|
| `freeze` | `active` | `freeze()` → sets `frozen_at` |
| `resume` | `frozen` | `resume()` → clears `frozen_at` |
| `cancel` | `active`, `frozen` | `cancel()` → sets `cancelled_at` |
| `expire` | `active`, `frozen` | `expire()` → sets `expired_at` |
| `renew` | `cancelled`, `expired` | `renew()` → resets status to `active` |

**Evidence:** `user-membership.service.ts:83-134` (freeze/resume/cancel/expire), `:136-165` (renew).

## 5. Plan Types

Defined in `membership-aggregate.ts:1-4`:
`monthly`, `quarterly`, `semiannual`, `annual`, `unlimited`, `credits`, `session_bundle`, `corporate`, `family`, `student`

## 6. Membership Status

`membership-aggregate.ts:6` — `'active' | 'expired' | 'cancelled' | 'pending'`
`membership.types.ts:34` — `'active' | 'cancelled' | 'expired' | 'frozen'` (DB includes `frozen`)

## 7. Loyalty System

**Tiers** (`membership-aggregate.ts:90-96`):
| Tier | Min Points | Multiplier | Benefits |
|------|-----------|-----------|----------|
| `bronze` | 0 | 1x | None |
| `silver` | 1,000 | 1.2x | Priority booking |
| `gold` | 5,000 | 1.5x | Priority booking, free cancellation (100) |
| `platinum` | 15,000 | 2x | + wallet credit (200) |
| `diamond` | 50,000 | 3x | + academy discount (20%) |

**Benefits types** (`membership-aggregate.ts:24-26`):
`priority_booking`, `exclusive_pricing`, `guest_passes`, `free_cancellation`, `wallet_credit`, `academy_discount`, `marketplace_discount`, `coach_discount`, `tournament_discount`

**Evidence:** `membership-aggregate.ts:90-113`.

## 8. Campaigns & Rewards

**Campaign** (`membership-aggregate.ts:59-68`):
- `pointsMultiplier` — temporary multiplier during campaign period
- `applicableActivities` — which activities earn bonus points

**Reward Catalog** (`membership-aggregate.ts:70-80`):
- Reward types: `wallet_credit`, `coupon`, `free_booking`, `free_session`, `voucher`, `merchandise`, `tournament_ticket`
- Tracked by `pointsCost`, `quantity`, `isActive`

## 9. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Plan | `membership_plans` | `id, code, name, category, duration_type, duration_value, price, currency, status, is_default, is_public, sort_order` |
| Benefit | `membership_benefits` | `id, membership_plan_id, benefit_key, benefit_value, display_order` |
| User Membership | `user_memberships` | `id, user_id, membership_plan_id, status (active/cancelled/expired/frozen), start_date, end_date, renewal_type, cancelled_at, frozen_at, expired_at` |
| History | `membership_history` | `id, user_membership_id, action, old_status, new_status, notes, created_by` |

## 10. Events

- `membership:expiring` — Emitted when membership is about to expire (see VOLUME_03)
