---
document_id: "TECH-MOD-13"
document_name: "Organisations Module"
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
  related: ["TECH-MOD-04", "TECH-MOD-05", "TECH-MOD-06"]
---

# Organisations Module (TECH-MOD-13)

**Source:** `backend/src/modules/organisations/` (6 entries: domain/, application/, commands/, infrastructure/, presentation/, __tests__/)

## 1. Purpose

Organisation management system: CRUD for orgs, branches, resources, sports, subscription plans, cancellation policies, working hours, holidays, payment gateways. Org-portal self-service (70 routes) for org owners to manage staff, coaches, members, finances, announcements, documents, gallery. 85 routes total.

## 2. Architecture

```
presentation/
  organisation.routes.ts     — 133 lines, admin/global routes
  org-portal.routes.ts       — 128 lines, org self-service routes
  organisation.controller.ts
  org-portal.controller.ts
  organisation.dto.ts
  organisation-audit.ts
domain/
  (organisation types/aggregates)
application/
  (service layer)
infrastructure/
  repositories/
    resource.repository.ts
    (org, branch, subscription repos)
commands/
  (org commands)
```

**Evidence:** `organisation.routes.ts` (133 lines, ~85 routes combined with org-portal), `org-portal.routes.ts` (128 lines, ~70 self-service routes).

## 3. Routes (85)

**Global/Admin** (`organisation.routes.ts`):

**Sports (7):** List public, marketplace sports, all sports (admin), get, create, update, delete
**Org Types (4):** List, create, update, delete
**Organisations (6):** List, storefront, get, create, update, delete
**Branches (12):** List by org, list by sport, get, create, update, delete, financial details (get/upsert), access requests (list/approve/reject/request/my-access/all/update)
**Resource Types (2):** List, create
**Resources (5):** List by branch, get, create, update, delete
**Amenities (3):** List all, get branch amenities, set branch amenities
**Subscription Plans (8):** List, all (admin), get, create, update, delete, toggle, list features
**Org Subscriptions (5):** Get, update, activate, toggle status, all org subscriptions (admin)
**Payment Methods (4):** List, create, update, delete
**Payment Gateways (4):** List, create, update, delete
**Cancellation Policies (7):** Get org policies, get settings, update settings, branch policies CRUD (3)
**Holidays (4):** Get, create, update, delete
**Maintenance (4):** Get, create, update, delete
**Peak Hours (1):** Upsert
**Subscription Requests (5):** List, stats, detail, approve, reject

**Org Portal** (`org-portal.routes.ts` — ~70 routes under `/org/:orgId/*`):
Org info, dashboard, bookings, resources, products
Branches CRUD + financial details
Resources CRUD
Staff management (7): list, add, change role, remove, permissions (get/update), template permissions
Coaches (5): list, directory, invite, respond, remove
Cancellation settings (2): get, update
Members (2): list, update access
Cancellation policies CRUD (4)
Subscription (5): get, available plans, request, cancel, list requests
Finance (3): transactions, settlements, settlement detail
Announcements (5): list, create, update, delete, publish
Documents (2): list, delete
Gallery (3): list, upload, delete
Reports (3): bookings, revenue, members
Club Profile (2): get, update
Branch Management (2): manage list, branch detail
Working Hours (2): get org hours, update branch hours
Payment Settings (2): get, update
Reviews (1): list
Referees (1): list
Academies (1): list
Leagues (1): list
Tournaments (1): list
Verification (1): get

## 4. Permissions

Admin routes use `adminGuard` (super_admin/super-admin).
Branch routes use `eitherRoleOrPermission(['super_admin'], ['organisations.edit.branches'])`.
Org portal routes use `requireOrganisationAccess()` and `requireOrgScopedPermission()`.

Org-scoped permissions: `org.members.manage`, `org.announcements.manage`, `org.documents.manage`, `org.gallery.manage`, `org.branches.manage`, `org.settings.edit`

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Organisation | `organisations` | `id, name, slug, type_id, status, owner_id` |
| Branch | `branches` | `id, organisation_id, name, address, city_id, timezone, opening_time, closing_time` |
| Resource | `resources` | `id, branch_id, name, resource_type_id, sport_id, is_active, slot_duration, opening_time, closing_time` |
| Sport | `sports` | `id, name, slug, is_active` |
| Subscription Plan | `subscription_plans` | `id, name, price, currency, billing_cycle, features` |
| Subscription | `organisation_subscriptions` | `id, org_id, plan_id, status, start_date, end_date` |
| Staff | `org_staff` | `id, org_id, user_id, role, permissions` |
| Coach | `org_coaches` | `id, org_id, user_id, status, agreement` |
| Holiday | `branch_holidays` | `id, branch_id, date, description` |
| Cancellation Policy | `cancellation_policies` | `id, org_id, branch_id, hours_before, refund_percent` |
| Announcement | `org_announcements` | `id, org_id, title, body, status, published_at` |
| Gallery Image | `org_gallery` | `id, org_id, url, caption` |

## 6. Events

- `organisation:created` / `organisation:updated`
- `organisation:subscription_changed`
- `organisation:staff_added` / `organisation:staff_removed`
- `organisation:coach_invited` / `organisation:coach_responded`
- `branch:created` / `branch:updated`
- `resource:created` / `resource:updated`

## 7. Audit Events

- `ORGANISATION.CREATE` / `ORGANISATION.UPDATE` / `ORGANISATION.DELETE` / `ORGANISATION.VERIFY`

**Evidence:** `audit-log.types.ts` lines 15-18.

## 8. Staff Roles (6 assignable)

Defined in org portal: 6 assignable roles for org staff:
- `owner` — Full control
- `club_admin` — Administrative access
- `manager` — Operations management
- `coach` — Coaching staff
- `referee` — Match officiating
- `staff` — General staff

## 9. Coach Agreement Lifecycle

```
pending (invited) → accepted | rejected → (active coaching relationship)
```
