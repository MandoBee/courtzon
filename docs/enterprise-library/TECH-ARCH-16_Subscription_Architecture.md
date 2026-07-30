---
document_id: "TECH-ARCH-16"
document_name: "Subscription Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
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
  references: ["TECH-ARCH-15", "TECH-DB-03"]
  related: ["TECH-MOD-13"]
---

# Subscription Architecture (TECH-ARCH-16)

## 1. Subscription Plan Model

### Tables

**subscription_plans** (line 2941 of baseline):
| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint(20) unsigned | PK |
| `plan_name` | varchar(255) | Display name (e.g. "Starter", "Professional") |
| `price_monthly` | decimal(12,2) | Monthly price (NULL for unlimited-only) |
| `price_yearly` | decimal(12,2) | Yearly price (NULL for unlimited-only) |
| `is_unlimited` | tinyint(1) | TRUE = no feature limits |
| `applicable_org_types` | longtext (JSON) | Array of `organisation_types.id` that can use this plan |
| `is_active` | tinyint(1) | Soft toggle for availability |
| `is_internal` | tinyint(1) | TRUE = hidden from public catalog (admin-assign only) |
| `sort_order` | int(10) unsigned | Display order |

**subscription_plan_rates** (line 2926):
| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint(20) unsigned | PK |
| `plan_id` | bigint(20) unsigned | FK to subscription_plans |
| `applicable_entity` | varchar(100) | Entity type: `booking`, `tournament`, `marketplace`, `coach_session`, `academy` |
| `rate_type` | enum('percentage','fixed') | How the commission is calculated |
| `amount` | decimal(5,2) | Rate value (e.g. 10.00 for 10%) |

**subscription_features** (line 2896):
| Column | Type | Description |
|--------|------|-------------|
| `id` | int(10) unsigned | PK |
| `feature_key` | varchar(100) | Unique key (e.g. `branches`, `staff`, `products`) |
| `label` | varchar(255) | Display label |
| `value_type` | enum('numeric','boolean','tier','text') | How to interpret the value |
| `unit` | varchar(50) | Unit label |
| `sort_order` | int(11) | Display order |

**subscription_plan_features** (line 2911):
| Column | Type | Description |
|--------|------|-------------|
| `id` | int(10) unsigned | PK |
| `plan_id` | bigint(20) unsigned | FK to subscription_plans |
| `feature_id` | int(10) unsigned | FK to subscription_features |
| `value` | varchar(255) | Feature value (e.g. "5" for 5 branches, "true" for boolean) |

**organisation_subscriptions** (line 1849):
| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint(20) unsigned | PK |
| `organisation_id` | int(10) unsigned | FK to organisations |
| `plan_id` | bigint(20) unsigned | FK to subscription_plans |
| `billing_cycle` | enum('monthly','yearly') | Current billing period |
| `start_date` | date | Subscription start |
| `end_date` | date | Subscription end (NULL for unlimited) |
| `subscription_status` | enum('active','expired','cancelled','pending') | Lifecycle state |
| `auto_renew` | tinyint(1) | Auto-renew flag |
| `plan_snapshot` | longtext (JSON) | Immutable plan details at time of activation |

**organisation_upgrade_requests** (line 1906):
| Column | Type | Description |
|--------|------|-------------|
| `id` | int(10) unsigned | PK |
| `organisation_id` | int(10) unsigned | FK to organisations |
| `requested_by` | int(10) unsigned | FK to users |
| `requested_plan_id` | bigint(20) unsigned | FK to subscription_plans |
| `request_type` | varchar(50) | `NEW_SUBSCRIPTION` or `PLAN_CHANGE` |
| `status` | enum('pending','approved','rejected') | Current state |
| `approved_by` | int(10) unsigned | FK to users (admin) |
| `plan_snapshot` | JSON | Snapshot of plan at request time |

**Source:** `database/baseline/001_courtzon_v3.sql:1849-1866` (organisation_subscriptions), `1906-1934` (organisation_upgrade_requests), `2896-2936` (subscription_features/plan_features/plan_rates), `2941-2954` (subscription_plans).

## 2. Plan CRUD (Admin Only)

### Create Plan (`organisation.service.ts:561-626`)
- Inserts into `subscription_plans` with plan_name, prices, flags
- Optionally inserts `subscription_plan_rates` (commission rates per entity)
- Optionally inserts `subscription_plan_features` (feature limits)
- Uses transactional insert (conn.beginTransaction / conn.commit)

### Update Plan (`organisation.service.ts:628-708`)
- Updates plan metadata (name, prices, flags)
- Deletes and re-inserts `subscription_plan_rates` if provided
- Deletes and re-inserts `subscription_plan_features` if provided
- If plan deleted → existing subscriptions on that plan are cancelled

### Delete Plan (`organisation.service.ts:710-732`)
- Cancels all active/pending `organisation_subscriptions` on the plan
- Deletes `subscription_plan_features`, `subscription_plan_rates`
- Hard-deletes the plan row

### Toggle Plan (`organisation.service.ts:734-741`)
- Flips `is_active` (0→1 or 1→0)
- Used to hide/unhide plans without data loss

### Admin Routes
```
POST   /subscription-plans          createPlanHandler
PUT    /subscription-plans/:id      updatePlanHandler
DELETE /subscription-plans/:id      deletePlanHandler
PATCH  /subscription-plans/:id/toggle togglePlanHandler
GET    /subscription-plans          listSubscriptionPlansHandler (public active only)
GET    /subscription-plans/all      listAllPlansHandler (admin, includes inactive)
GET    /subscription-plans/:id      getPlanHandler
GET    /subscription-features      listSubscriptionFeaturesHandler
```

**Source:** `organisation.routes.ts:73-86`, `organisation.service.ts:550-741`.

## 3. Organization Subscription Assignment

### Direct Assignment (Admin)
`PUT /organisations/:orgId/subscription` — `updateOrgSubscriptionHandler`
- Validates plan is active and has appropriate pricing for billing cycle
- Builds `plan_snapshot` JSON (immutable record of plan, features, commission rates at assignment time)
- Computes `start_date` (today) and `end_date` (based on billing cycle)
- Inserts or updates `organisation_subscriptions` with status `active`
- Clears subscription resolver cache

### Admin Activation
`POST /organisations/:orgId/subscription/activate` — `activateSubscriptionHandler`
- Finds pending subscription and activates it
- Computes dates and builds plan snapshot
- Emits `organisation:subscription-renewed` event if this is a renewal
- Used after an org's verification triggers subscription activation

### Status Toggle
`POST /organisations/:orgId/subscription/toggle-status` — `toggleSubscriptionStatusHandler`
- Toggles between `active` and `pending`
- Useful for admin pause/resume of subscriptions

**Source:** `organisation.service.ts:830-994`, `organisation.routes.ts:82-86`.

## 4. Upgrade Request Workflow

### Org Submits Request (`org-portal.service.ts:199-269`)
1. Validates no pending request already exists (conflict check)
2. Snapshots current plan details (if any)
3. Validates requested plan is active
4. Prevents requesting the same plan the org is already on
5. Creates `organisation_upgrade_requests` row with status `pending`
6. Emits `subscription:request-submitted` event

### Org Cancels Request (`org-portal.service.ts:271-277`)
- Only the most recent pending request can be cancelled
- Updates status to `cancelled` with reason

### Admin Reviews Request (`org-portal.repository.ts:600-764`)

**Approve:**
1. Locks request row with `FOR UPDATE`
2. Re-validates: organisation exists, plan is active, no conflicting requests
3. Updates request status to `approved`
4. Builds plan_snapshot from current subscription_plans + features + rates
5. Activates subscription: inserts or updates `organisation_subscriptions` with status `active`
6. Creates transaction in `financial_transactions` for audit trail
7. Clears subscription resolver cache
8. Emits `subscription:request-approved` event

**Reject:**
1. Locks request row with `FOR UPDATE`
2. Updates status to `rejected` with rejection reason
3. Emits `subscription:request-rejected` event

### Admin Routes for Requests
```
GET    /admin/subscription-requests              listSubscriptionRequestsHandler (paginated, filterable)
GET    /admin/subscription-requests/stats        getSubscriptionRequestStatsHandler
GET    /admin/subscription-requests/:requestId   getSubscriptionRequestDetailHandler
POST   /admin/subscription-requests/:requestId/approve  approveSubscriptionRequestHandler
POST   /admin/subscription-requests/:requestId/reject   rejectSubscriptionRequestHandler
```

**Source:** `organisation.routes.ts:124-129`, `org-portal.service.ts:199-281`, `org-portal.repository.ts:503-822`.

### Request Stats
`getSubscriptionRequestStatsHandler` returns:
- Total requests, pending, approved, rejected, cancelled counts
- Approved/rejected today
- Average approval hours
- Active subscriptions count
- Subscriptions expiring in 30 days

**Source:** `organisation.service.ts:1153-1190`.

## 5. Plan Limits Enforcement

### Architecture
Limits are stored as feature values in `subscription_plan_features`. The utility `getPlanNumericLimit()` at `plan-limits.util.ts` delegates to `getFeatureLimit()` in `current-subscription.service.ts`.

### Enforced Limits
| Feature Key | Where Enforced | Default (no subscription) |
|-------------|----------------|--------------------------|
| `branches` | `organisation.service.ts:361` — `createBranch()` | 1 |
| `resources` | `organisation.service.ts:451` — `createResource()` | Infinity |
| `staff` | `org-portal.service.ts:45` — `addOrgStaff()` | 3 |
| `products` | Product creation | Configurable |
| `tournaments` | Tournament creation | Configurable |
| `academies` | Academy creation | Configurable |

**Source:** `plan-limits.util.ts:14-20`, `org-portal.repository.ts:462-490` (`getFeatureUsageCounts`).

### Usage Tracking
`getFeatureUsageCounts(orgId)` queries actual counts from:
- `branches` (WHERE organisation_id = ? AND deleted_at IS NULL)
- `user_role_scopes` (staff count: DISTINCT user_id with org scope)
- `products` (WHERE seller_id = ? AND deleted_at IS NULL AND status != 'sold')
- `resources` (JOIN branches WHERE organisation_id = ?)
- `tournaments` (WHERE organisation_id = ? AND deleted_at IS NULL)
- `academies` (WHERE organisation_id = ? AND deleted_at IS NULL)

**Source:** `org-portal.repository.ts:462-490`.

## 6. Commission Rate Configuration

### Architecture
Commission rates are tied to subscription plans via `subscription_plan_rates`. Each rate defines:
- `applicable_entity`: `booking`, `tournament`, `marketplace`, `coach_session`, `academy`
- `rate_type`: `percentage` or `fixed`
- `amount`: the rate value

### Normalization
The `normalizeCommissionEntity()` utility maps various input formats to canonical entity names before storing.

### Snapshot at Activation
When a subscription is activated or approved, the current commission rates are frozen into `plan_snapshot` (JSON column on `organisation_subscriptions`). This ensures historical rate integrity — changing the plan template does not retroactively affect existing subscriptions.

**Source:** `organisation.service.ts:855-863` (snapshot building), `organisation.service.ts:590-599` (rate insertion on plan create), `organisation.service.ts:666-678` (rate update on plan update).

### How Rates Are Used
Commission rates from the effective subscription are read at booking/payment time to calculate:
- Platform commission on booking amounts
- Commission on marketplace transactions
- Coach session commission splits
- Tournament/academy fee splits

**Source:** `shared/services/commission-mappers.ts`.

## 7. Subscription Lifecycle Workers

### Expiry Worker (`subscription-lifecycle.worker.ts`)
- **Schedule:** Daily
- **Action:** Marks subscriptions with `end_date < CURDATE()` as `expired`
- **Events:** `organisation:subscription-expired`
- **Audit:** `SUBSCRIPTION.EXPIRED`

### Expiration Reminder Worker (`subscription-lifecycle.service.ts:63-114`)
- **Schedule:** Daily
- **Action:** Sends reminders at 30, 14, 7, 3, 1 day(s) before `end_date`
- **Dedup:** Uses `last_reminder_sent` column with `LIKE` guard to prevent duplicate sends
- **Events:** `organisation:subscription-expiring` with `daysLeft`

**Source:** `backend/src/modules/organisations/application/subscription-lifecycle.service.ts:10-114`.

## 8. Current Subscription Resolver

The `current-subscription.service.ts` implements a lazy-resolve pattern:

1. On demand, looks up the effective subscription for an org
2. Checks `organisation_subscriptions` for active/pending records
3. Resolves plan details (from `plan_snapshot` if available, else live `subscription_plans`)
4. Caches resolved data in an in-memory map
5. Cache is cleared after any subscription mutation (activate, approve, update, toggle, expire)
6. Fallback: if no active subscription exists, returns `{ exists: false }` — limits use their defaults

**Source:** `current-subscription.service.ts` (imported dynamically at `organisation.service.ts:798` and elsewhere).

## 9. Public Plan Catalog

`GET /subscription-plans` returns only:
- `is_active = TRUE`
- `is_internal = FALSE`
- Ordered by `sort_order`, then price ascending

Org portal's `GET /org/:orgId/subscription/available-plans` further filters by `applicable_org_types` (the org's own `org_type_id` must be in the plan's JSON array).

**Source:** `organisation.service.ts:785-795`, `org-portal.repository.ts:492-501`.

**Evidence:** All source files verified against `backend/src/modules/organisations/application/`, `backend/src/modules/organisations/infrastructure/repositories/`, `backend/src/modules/organisations/presentation/`, `database/baseline/001_courtzon_v3.sql`.
