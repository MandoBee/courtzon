---
document_id: "TECH-MOD-02"
document_name: "RBAC Module"
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
reviewer: "Security Lead"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-01"]
  related: ["TECH-MOD-20", "VOLUME-08"]
---

# RBAC Module (TECH-MOD-02)

**Source:** `backend/src/modules/rbac/` (6 entries: domain/, application/, commands/, infrastructure/, presentation/, __tests__/)

## 1. Purpose

Role-Based Access Control: manages roles, permissions, user-role assignments, feature flags, UI permission registry sync, and admin user management. 42 routes covering role CRUD, permission CRUD, user management, UI permission sync, and admin dashboard.

## 2. Architecture

```
presentation/
  rbac.routes.ts              — 42 endpoints
  rbac.controller.ts          — Request handlers
  rbac.dto.ts                 — Zod schemas
  feature-flags.routes.ts     — Feature flag specific routes
application/
  (services in ./)
domain/
  (role/permission aggregates)
infrastructure/
  repositories/
    rbac.repository.ts
```

**Evidence:** Source at `backend/src/modules/rbac/presentation/rbac.routes.ts` (72 lines, 42 routes).

## 3. Routes (42)

Defined in `rbac.routes.ts:10-72`:

**Permissions (5)** — `superAdminGuard`:
- `GET /permission-modules` — List modules
- `GET /permissions` — List all permissions
- `POST /permissions` — Create
- `PUT /permissions/:id` — Update
- `DELETE /permissions/:id` — Delete

**Roles (7)** — `superAdminGuard`:
- `GET /roles` — List
- `GET /roles/:id` — Get by ID
- `POST /roles` — Create
- `PUT /roles/:id` — Update
- `DELETE /roles/:id` — Soft delete
- `PUT /roles/:id/restore` — Restore deleted
- `PUT /roles/:id/permissions` — Set role permissions

**Users (16)** — admin or super admin:
- `GET /admin/users` — List (adminGuard)
- `GET /admin/users/:id` — Get (adminGuard)
- `PUT /admin/users/:id` — Update (superAdminGuard)
- `DELETE /admin/users/:id` — Delete (adminGuard + permissions)
- `GET /admin/users/:id/bookings` — User bookings (adminGuard)
- `GET /admin/users/:id/academies` — User academy enrollments (adminGuard)
- `GET /admin/users/:id/orders` — User marketplace orders (adminGuard)
- `GET /admin/users/:id/activity` — User activity log (adminGuard)
- `GET /admin/users/:id/organisations` — User orgs (adminGuard)
- `GET /admin/users/:id/branch-access` — Branch access (adminGuard)
- `PUT /admin/users/:id/password` — Change password (superAdminGuard)
- `GET /admin/bookings/:bookingId` — Booking detail (adminGuard)
- `GET /admin/orders/:orderId` — Order detail (adminGuard)
- `PATCH /admin/users/:id/coach/approve` — Approve coach (superAdminGuard)
- `PATCH /admin/users/:id/coach/reject` — Reject coach (superAdminGuard)

**User-Role (3)** — `superAdminGuard`:
- `POST /user-roles` — Assign role
- `DELETE /user-roles/:userId/:roleId` — Remove role
- `GET /users/:userId/roles` — Get user roles

**Feature Flags (5):**
- `GET /feature-flags` — List (adminGuard)
- `PATCH /feature-flags/:id/toggle` — Toggle (adminGuard)
- `POST /feature-flags` — Create (superAdminGuard)
- `PUT /feature-flags/:id` — Update (superAdminGuard)
- `DELETE /feature-flags/:id` — Delete (superAdminGuard)

**UI Permissions (2):**
- `GET /ui-permissions` — List (superAdminGuard)
- `POST /ui-permissions/sync` — Sync registry (superAdminGuard)

**Dashboard (2):**
- `GET /admin/dashboard` — Stats (superAdminGuard)
- `GET /admin/dashboard/trends` — Trends (superAdminGuard)

**My Scopes (2):**
- `GET /my/scopes` — Own scopes (any auth)
- `GET /my/permissions` — Own permissions (any auth)

**Reference (1):**
- `GET /player-levels` — No auth

## 4. Permissions

Permission keys follow dot-notation: `module.entity.action`. System has 200+ permissions registered via `frontend/src/permissions/registry.ts` and synced to `permissions` DB table.

Key permission groups:
- `users.*` — User management
- `bookings.*` — Booking management
- `academy.*` — Academy management
- `tournament.*` — Tournament management
- `league.*` — League management
- `hr.*` — HR management
- `financial.*` — Financial operations
- `audit.view` — Audit log access
- `bi.*` — BI dashboard

**Evidence:** `rbac.routes.ts` uses `requirePermission(['users.delete'])`, `requirePermission(['admin.bookings.update-status', 'org.bookings.manage'])`, etc.

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Role | `roles` | `id, name, slug, description, is_system, deleted_at` |
| Permission | `permissions` | `id, module_id, key, name, description` |
| Permission Module | `permission_modules` | `id, slug, name` |
| User Role | `user_roles` | `user_id, role_id` |
| Role Permission | `role_permissions` | `role_id, permission_id` |
| UI Permission | `ui_permissions` | `id, permission_key, module_slug, element_type, element_label` |
| Feature Flag | `feature_flags` | `id, key, enabled, description` |

## 6. Events

- `rbac:role-assigned` — When a role is assigned to a user
- `rbac:role-removed` — When a role is removed
- `rbac:permissions-synced` — When UI permissions are synced

## 7. Configuration

| Script | Purpose |
|--------|---------|
| `node backend/scripts/sync-ui-registry.js` | Sync UI permission registry from frontend code |
| `node backend/scripts/sync-role-permissions.mjs` | Apply role permission templates |
| `backend/scripts/role-permission-templates.mjs` | Role template definitions |

**Evidence:** AGENTS.md references these scripts.

## 8. Audit Events

- `ROLE.CREATE` / `ROLE.UPDATE` / `ROLE.DELETE`
- `PERMISSION.ASSIGN` / `PERMISSION.REVOKE` / `PERMISSION.SYNC`

**Evidence:** `audit-log.types.ts` lines 9-13 define these audit types.
