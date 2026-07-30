---
document_id: "TECH-ARCH-15"
document_name: "Organization Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 30
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-ARCH-07", "TECH-MOD-13"]
  related: ["TECH-MOD-14", "TECH-MOD-15"]
---

# Organization Architecture (TECH-ARCH-15)

## 1. Organization Hierarchy

```
Workspace (global platform)
  └── Organization (organisation)
       ├── Branches (physical locations)
       │    ├── Resources/Courts (bookable assets)
       │    ├── Working Hours (per-branch and per-resource)
       │    ├── Holidays (branch_holidays)
       │    ├── Cancellation Policies (per-branch overrides)
       │    └── Branch Financial Details (bank accounts, tax info)
       ├── Staff (org-scoped RBAC via user_role_scopes)
       ├── Members (branch_player_access — players with approved access)
       ├── Coaches (coach_org_agreements)
       ├── Subscription (organisation_subscriptions)
       ├── Marketplace Products (products)
       ├── Academies, Leagues, Tournaments
       └── Content (announcements, documents, gallery, reviews)
```

**Source:** `database/baseline/001_courtzon_v3.sql` — tables `organisations` (line 1939), `branches` (line 700), `resources` (line 2546), `organisation_types` (line 1889).

## 2. Org-Scoped RBAC

### user_role_scopes with scope_type = 'organisation'

The RBAC system uses `user_role_scopes` with `scope_type = 'organisation'` to grant permissions within an organisation context. A user holds a **user_role** (linked to a role template) and one or more scopes that determine which organisation, branches, or resources they can act on.

**Source:** `backend/src/modules/organisations/infrastructure/repositories/org-portal.repository.ts:227-270` — `addStaffScope()`

```
user_roles (user_id, role_id, assigned_by)
  └── user_role_scopes (user_role_id, scope_type, scope_id)
       ├── scope_type = 'organisation', scope_id = org_id
       ├── scope_type = 'branch', scope_id = branch_id
       └── scope_type = 'resource', scope_id = resource_id
```

### Staff Roles (6 assignable org roles)

Defined in `org-portal.controller.ts:13` and `org-portal.repository.ts:158`:

| Slug | Label | Purpose |
|------|-------|---------|
| `org-admin` | Org Admin | Full org management (except owner-only actions) |
| `branch-mgr` | Branch Manager | Manage specific branches |
| `resource-mgr` | Resource Manager | Manage specific resources/courts |
| `shop-admin` | Shop Admin | Manage marketplace products |
| `coach` | Coach | Coach sessions, limited admin access |
| `accountant` | Accountant | Finance read-only access |

**Staff permissions** — each role clones the template role's permissions and can be further customized with specific permission IDs per staff member via `getStaffPermissions` / `updateStaffPermissions`.

**Source:** `org-portal.controller.ts:13, 267-283`, `org-portal.service.ts:96-128`

### Plan Limits Enforcement

Staff count is limited by subscription plan via `getPlanNumericLimit(orgId, 'staff', 3)` at `org-portal.service.ts:45`.

## 3. Route Guard System

Three guard functions in `route-guard.ts` (80 lines):

### requireOrganisationAccess(orgIdParam = 'orgId')
- Checks if the authenticated user has any access to the organisation (owner, org-scoped role, or platform admin)
- Returns 401 if not authenticated, 403 if access denied, 500 on internal error
- Used on all `/org/:orgId/*` routes where basic access is sufficient

### requireOrgManageAccess(orgIdParam = 'orgId')
- Stricter check for elevated actions (staff & coach management)
- Requires org owner or org-admin access (or platform super_admin)
- Returns 403: "Requires organisation owner or admin access"

### requireOrgScopedPermission(permissionKey, orgIdParam = 'orgId')
- Checks if user holds a specific permission key scoped to the organisation
- Used for granular access control: `org.members.manage`, `org.announcements.manage`, `org.documents.manage`, `org.gallery.manage`, `org.branches.manage`, `org.settings.edit`
- Returns 403: "Insufficient organisation permissions"

**Source:** `backend/src/shared/middleware/route-guard.ts:1-80`

### Route Guard Dependencies

Initialized in `app.ts` via `initRouteGuard()` with three callbacks:
- `checkOrgAccess(userId, orgId)` — checks owner, platform admin, or org-scoped role
- `checkOrgManage(userId, orgId)` — checks owner or org-admin role
- `checkOrgPermission(userId, orgId, permissionKey)` — checks specific permission via role_permissions

## 4. Org-Portal Self-Service Pattern

All org self-service routes live under `/org/:orgId/*` and are registered via `registerOrgPortalRoutes()` from `org-portal.routes.ts`.

### Route Layout

```
/org/:orgId/
  info                    GET/PUT    Organisation profile (self-service: no verification/owner fields)
  dashboard               GET        Dashboard with KPIs, trends, pending actions
  bookings                GET        Org bookings with filters
  resources               GET        Org resources
  products                GET        Org marketplace products
  branches                GET/POST   Branch CRUD
  branches/:branchId      GET/PUT/DELETE
  branches/manage         GET        Enhanced branch list with courts count, managers, amenities
  branches/:branchId/financial-details  GET/PUT
  staff                   GET        List staff
  staff                   POST       Add staff by email + role
  staff/:userId           PUT/DELETE Change role / remove
  staff/:userId/permissions  GET/PUT  View / update custom permissions
  coaches                 GET        List coaches
  coaches/directory       GET        Invitable coaches
  coaches/invite          POST       Invite coach (split %)
  coaches/:coachId/respond PUT       Accept/reject coach agreement
  coaches/:coachId        DELETE     Remove coach
  members                 GET        List members (branch_player_access)
  members/:branchId/:playerId PUT    Update member access status
  subscription            GET        Current subscription + usage
  subscription/available-plans GET
  subscription/request    POST       Submit upgrade request
  subscription/requests   GET        List requests
  subscription/requests/:requestId/cancel POST
  transactions            GET        Org transactions (paginated)
  settlements             GET        Org settlements
  settlements/:settlementId GET      Settlement detail
  announcements           GET/POST/PUT/DELETE
  announcements/:id/publish POST
  documents               GET/DELETE
  gallery                 GET/POST/DELETE
  reports/bookings        GET        Booking report (date range)
  reports/revenue         GET        Revenue report (daily)
  reports/members         GET        Member report (by status, by branch)
  profile                 GET/PUT    Club profile (name, description, email, phone, website)
  working-hours           GET        All branches + resources + holidays
  branches/:branchId/hours PUT      Update branch + resource hours
  payment-settings        GET/PUT    Branch financial details
  reviews                 GET        Org reviews with avg rating
  referees                GET        Referees list
  academies               GET        Academy programs list
  leagues                 GET        Leagues list
  tournaments             GET        Tournaments list
  verification            GET        Org verification status + documents + history
  cancellation-settings   GET/PUT
  branches/:branchId/cancellation-policies GET/POST/PUT/DELETE
  role-templates/:slug/permissions  GET  Template permissions reference
```

**Source:** `backend/src/modules/organisations/presentation/org-portal.routes.ts:1-128`

## 5. Admin Routes (non-portal)

Admin/global routes in `organisation.routes.ts` (133 lines) handle:

| Category | Routes |
|----------|--------|
| Sports | CRUD (7 routes) |
| Organisation Types | CRUD (4 routes) |
| Organisations | List, storefront, get, create, update, delete (6 routes) |
| Branches | List by org, list by sport, CRUD, financial details, access requests (12 routes) |
| Resources | List by branch, CRUD (5 routes) |
| Amenities | List all, get/set branch amenities (3 routes) |
| Subscription Plans | CRUD, toggle, list features (8 routes) |
| Org Subscriptions | Get, update, activate, toggle, list all (5 routes) |
| Payment Methods | CRUD (4 routes) |
| Payment Gateways | CRUD (4 routes) |
| Cancellation Policies | Org policies, settings, branch policies (7 routes) |
| Branch Holidays | CRUD (4 routes) |
| Resource Maintenance | CRUD (4 routes) |
| Resource Peak Hours | Upsert (1 route) |
| Subscription Requests | List, stats, detail, approve, reject (5 routes) |

**Source:** `backend/src/modules/organisations/presentation/organisation.routes.ts:12-133`

## 6. Access Control Guards by Route

| Guard | Scope | Used By |
|-------|-------|---------|
| `adminGuard` | super_admin / super-admin | All admin routes: sports CRUD, org types, org CRUD, resources, plans, etc. |
| `eitherRoleOrPermission(['super_admin'], ['organisations.edit.branches'])` | Branch admin | Branch CRUD, branch holidays, financial details |
| `eitherRoleOrPermission(['super_admin'], ['organisations.edit.branches', 'branches.edit.financial'])` | Branch financial | Branch financial details |
| `requireOrganisationAccess('orgId')` | Org access | All `/org/:orgId/*` read routes and basic writes |
| `requireOrgManageAccess('orgId')` | Org owner/admin | Staff management, coach management |
| `requireOrgScopedPermission('org.members.manage')` | Specific permission | Member access status changes |
| `requireOrgScopedPermission('org.announcements.manage')` | Specific permission | Announcement CRUD |
| `requireOrgScopedPermission('org.documents.manage')` | Specific permission | Document delete |
| `requireOrgScopedPermission('org.gallery.manage')` | Specific permission | Gallery upload/delete |
| `requireOrgScopedPermission('org.branches.manage')` | Specific permission | Branch hours update |
| `requireOrgScopedPermission('org.settings.edit')` | Specific permission | Payment settings update |

## 7. Subscription Lifecycle

### States

```
active → expired (end_date passed, daily worker)
active → cancelled (admin toggle or plan deleted)
pending → active (admin activates subscription)
none → active (first subscription assigned)
```

### Daily Workers

**Expiry Worker** (`subscription-lifecycle.worker.ts`): Marks subscriptions where `end_date < CURDATE()` as `expired`. Emits `organisation:subscription-expired` event. Runs daily.

**Reminder Worker** (`subscription-lifecycle.service.ts:63`): Sends expiration reminders at 30, 14, 7, 3, and 1 day before `end_date`. Atomic `last_reminder_sent` column prevents duplicate sends via `CONCAT NOT LIKE` guard.

**Source:** `backend/src/modules/organisations/application/subscription-lifecycle.service.ts:15-56`

### Subscription Request Flow

```
Org submits request → status = 'pending' → Admin approves → status = 'approved', subscription activated
                                          → Admin rejects → status = 'rejected'
                                          → Org cancels → status = 'cancelled'
```

**Source:** `org-portal.service.ts:199-281`, `org-portal.repository.ts:600-764`

## 8. Plan Limits

Limits are enforced via `subscription_features` table and `getPlanNumericLimit()` / `getFeatureLimit()`:

| Feature Key | Description | Default Limit |
|-------------|-------------|---------------|
| `branches` | Max branches | 1 (if no subscription) |
| `resources` | Max resources | Infinity (if no subscription) |
| `staff` | Max staff members | 3 (if no subscription) |
| `products` | Max marketplace products | Configurable |
| `tournaments` | Max tournaments | Configurable |
| `academies` | Max academy programs | Configurable |

**Source:** `backend/src/modules/organisations/application/plan-limits.util.ts:1-20`, `org-portal.repository.ts:462-490`

## 9. Coach Agreement Lifecycle

```
Org invites coach → status = 'pending' (initiated_by = 'org')
                     → Coach accepts → status = 'accepted', is_active = true
                     → Coach rejects → status = 'rejected', is_active = false
Coach invites self → status = 'pending' (initiated_by = 'coach')
                     → Org accepts → status = 'accepted', is_active = true
                     → Org rejects → status = 'rejected', is_active = false
Remove → DELETE from coach_org_agreements
```

Revenue split is configured at invite time: `coach_split_pct + org_split_pct = 100%`. Optional `hourly_rate` per coach.

**Source:** `org-portal.service.ts:283-322`, `org-portal.repository.ts:362-460`

## 10. Cancellation Policy System

Two levels of policy enforcement:

- **Org-level** (`cancellation_policy_level = 'organisation'`): Single policy applied to all branches
- **Branch-level** (`cancellation_policy_level = 'branch'`): Per-branch override policies

Policies defined by:
- `cancellation_window_minutes` — minutes before start time within which cancellation is allowed
- `refund_percent` — percentage refunded if cancelled within window
- `cancellation_before_hours` — hours before start for the org-level fee calc
- `cancellation_fee_percentage` / `cancellation_fee_fixed` — fee structure

Admin-only routes for cancellation policy CRUD. Org portal has get/update for settings and per-branch policy management.

**Source:** `cancellation-policy.repository.ts:1-98`, `organisation.controller.ts:756-863`

## 11. Events

| Event | Payload | Emitted By |
|-------|---------|------------|
| `organisation:subscription-expired` | `{organisationId, planName}` | `expireSubscriptions()` |
| `organisation:subscription-expiring` | `{organisationId, daysLeft, planName}` | `sendExpirationReminders()` |
| `organisation:subscription-renewed` | `{organisationId, planName, billingCycle}` | `activateSubscription()` |
| `subscription:request-submitted` | `{organisationId, userId, requestId, requestType, requestedPlanName, notes}` | `submitSubscriptionRequest()` |
| `subscription:request-approved` | `{organisationId, requestId, requestType, requestedPlanName, approvedBy}` | `approveSubscriptionRequest()` |
| `subscription:request-rejected` | `{organisationId, requestId, requestType, requestedPlanName, reason, rejectedBy}` | `rejectSubscriptionRequest()` |
| `coach:invited` | `{coachId, userId, organisationId, organisationName, invitedBy}` | `inviteCoach()` |

**Source:** Event emits at `organisation.service.ts:985-991`, `subscription-lifecycle.service.ts:33-44, 100-106`, `org-portal.service.ts:258-266, 301-311`.

## 12. Audit Events

| Action | Entity Type | Triggered By |
|--------|-------------|-------------|
| `ORGANISATION.CREATE` | organisation | `createOrganisationHandler` |
| `ORGANISATION.UPDATE` | organisation | `updateOrganisationHandler`, `updateOrgInfoHandler` |
| `ORGANISATION.DELETE` | organisation | `deleteOrganisationHandler` |
| `BRANCH.CREATE` | branch | `createBranchHandler`, `createOrgBranchHandler` |
| `BRANCH.UPDATE` | branch | `updateBranchHandler`, `updateOrgBranchHandler` |
| `BRANCH.DELETE` | branch | `deleteBranchHandler`, `deleteOrgBranchHandler` |
| `BRANCH.FINANCIAL.UPDATE` | branch | `upsertBranchFinancialDetailsHandler` |
| `BRANCH.SET_AMENITIES` | branch | `setBranchAmenitiesHandler` |
| `BRANCH_ACCESS.REQUEST` | branch | `requestAccessHandler` |
| `BRANCH_ACCESS.APPROVE` | branch | `approveAccessHandler` |
| `BRANCH_ACCESS.REJECT` | branch | `rejectAccessHandler` |
| `BRANCH_ACCESS.UPDATE_STATUS` | branch | `updateAccessStatusHandler`, `updateOrgMemberAccessHandler` |
| `RESOURCE.CREATE` | resource | `createResourceHandler`, `createOrgResourceHandler` |
| `RESOURCE.UPDATE` | resource | `updateResourceHandler`, `updateOrgResourceHandler` |
| `RESOURCE.DELETE` | resource | `deleteResourceHandler`, `deleteOrgResourceHandler` |
| `RESOURCE_MAINTENANCE.CREATE` | resource | `createResourceMaintenanceHandler` |
| `RESOURCE_MAINTENANCE.UPDATE` | resource | `updateResourceMaintenanceHandler` |
| `RESOURCE_MAINTENANCE.DELETE` | resource | `deleteResourceMaintenanceHandler` |
| `RESOURCE_PEAK_HOURS.UPSERT` | resource | `upsertResourcePeakHoursHandler` |
| `RESOURCE_TYPE.CREATE` | resource_type | `createResourceTypeHandler` |
| `SPORT.CREATE` | sport | `createSportHandler` |
| `SPORT.UPDATE` | sport | `updateSportHandler` |
| `SPORT.DELETE` | sport | `deleteSportHandler` |
| `ORG_TYPE.CREATE` | organisation_type | `createOrganisationTypeHandler` |
| `ORG_TYPE.UPDATE` | organisation_type | `updateOrganisationTypeHandler` |
| `ORG_TYPE.DELETE` | organisation_type | `deleteOrganisationTypeHandler` |
| `PLAN.CREATE` | subscription_plan | `createPlanHandler` |
| `PLAN.UPDATE` | subscription_plan | `updatePlanHandler` |
| `PLAN.DELETE` | subscription_plan | `deletePlanHandler` |
| `PLAN.TOGGLE` | subscription_plan | `togglePlanHandler` |
| `ORG_SUBSCRIPTION.UPDATE` | organisation | `updateOrgSubscriptionHandler` |
| `ORG_SUBSCRIPTION.ACTIVATE` | organisation | `activateSubscriptionHandler` |
| `SUBSCRIPTION.TOGGLE_STATUS` | organisation_subscription | `toggleSubscriptionStatusHandler` |
| `SUBSCRIPTION.EXPIRED` | organisation_subscription | `expireSubscriptions()` |
| `SUBSCRIPTION_REQUEST.APPROVE` | organisation_upgrade_request | `approveSubscriptionRequestHandler` |
| `SUBSCRIPTION_REQUEST.REJECT` | organisation_upgrade_request | `rejectSubscriptionRequestHandler` |
| `SUBSCRIPTION.ACTIVATED` | organisation_subscription | `approveSubscriptionRequestHandler` |
| `SUBSCRIPTION.REJECTED` | organisation_subscription | `rejectSubscriptionRequestHandler` |
| `ORG_STAFF.ADD` | organisation | `addOrgStaffHandler` |
| `ORG_STAFF.UPDATE_ROLE` | organisation | `changeOrgStaffRoleHandler` |
| `ORG_STAFF.REMOVE` | organisation | `removeOrgStaffHandler` |
| `ORG_STAFF.UPDATE_PERMISSIONS` | organisation | `updateStaffPermissionsHandler` |
| `ORG_COACH.INVITE` | organisation | `inviteCoachHandler` |
| `ORG_COACH.RESPOND` | organisation | `respondOrgCoachHandler` |
| `ORG_COACH.REMOVE` | organisation | `removeOrgCoachHandler` |
| `CANCELLATION_POLICY.CREATE` | cancellation_policy | `createPolicyHandler` |
| `CANCELLATION_POLICY.UPDATE` | cancellation_policy | `updatePolicyHandler` |
| `CANCELLATION_POLICY.DELETE` | cancellation_policy | `deletePolicyHandler` |
| `CANCELLATION_SETTINGS.UPDATE` | organisation | `updateOrgPolicySettingsHandler` |
| `BRANCH_HOLIDAY.CREATE` | branch | `createBranchHolidayHandler` |
| `BRANCH_HOLIDAY.UPDATE` | branch_holiday | `updateBranchHolidayHandler` |
| `BRANCH_HOLIDAY.DELETE` | branch_holiday | `deleteBranchHolidayHandler` |
| `BRANCH_HOURS.UPDATE` | branch | `updateBranchHoursHandler` |
| `ORG_ANNOUNCEMENT.CREATE` | org_announcement | `createAnnouncementHandler` |
| `ORG_ANNOUNCEMENT.UPDATE` | org_announcement | `updateAnnouncementHandler` |
| `ORG_ANNOUNCEMENT.DELETE` | org_announcement | `deleteAnnouncementHandler` |
| `ORG_ANNOUNCEMENT.PUBLISH` | org_announcement | `publishAnnouncementHandler` |
| `ORG_DOCUMENT.DELETE` | upload | `deleteOrgDocumentHandler` |
| `ORG_GALLERY.DELETE` | upload | `deleteOrgGalleryHandler` |
| `ORG_PROFILE.UPDATE` | organisation | `updateClubProfileHandler` |
| `ORG_PAYMENT_SETTINGS.UPDATE` | organisation | `updateOrgPaymentSettingsHandler` |
| `PAYMENT_METHOD.CREATE` | payment_method | `createPaymentMethodHandler` |
| `PAYMENT_METHOD.UPDATE` | payment_method | `updatePaymentMethodHandler` |
| `PAYMENT_METHOD.DELETE` | payment_method | `deletePaymentMethodHandler` |
| `PAYMENT_GATEWAY.CREATE` | payment_gateway | `createGatewayConfigHandler` |
| `PAYMENT_GATEWAY.UPDATE` | payment_gateway | `updateGatewayConfigHandler` |
| `PAYMENT_GATEWAY.DELETE` | payment_gateway | `deleteGatewayConfigHandler` |

**Source:** All audit calls verified at `backend/src/modules/organisations/presentation/organisation.controller.ts` and `org-portal.controller.ts`.

**Evidence:** All source files verified against `backend/src/modules/organisations/presentation/`, `backend/src/modules/organisations/application/`, `backend/src/modules/organisations/infrastructure/repositories/`, `backend/src/shared/middleware/route-guard.ts`.
