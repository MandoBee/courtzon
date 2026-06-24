# RBAC DESIGN — ROLE-BASED ACCESS CONTROL

## Philosophy
Row-level security enforced at the database query layer. A user's role determines what they can do; their scope determines which rows they can see.

## Architecture

```
User → Role → [Permissions] + [Scope]
                              ├── organization_id
                              ├── branch_id(s)
                              └── resource_id(s)
```

Scope is injected at the **repository level**. If the scope excludes a record, the WHERE clause naturally filters it — no error, no data leak.

## System roles (templates)

| Role | Slug | Typical grant count | Access |
|------|------|---------------------|--------|
| Super Admin | `super_admin` | **All** permissions in DB | Full platform + UI |
| Player | `player` | ~70 | Book, shop, coaches, community, profile |
| Player Seller | `player-seller` | ~90 | Player + marketplace sell |
| Seller | `seller` | ~33 | Marketplace seller dashboard |
| Organisation Admin | `org-admin` | ~115 | Org portal: branches, resources, bookings, staff |
| Organisation Seller | `org-seller` | ~33 | Org marketplace selling only |
| Coach | `coach` | ~47 | Coach profile, sessions, availability |
| Accountant | `accountant` | ~31 | Financial, reports, read-only bookings |

Org-scoped clones (`org-admin-org-{id}`, `seller-org-{id}`) use the same templates as `org-admin` / `org-seller`.

**Super Admin** always receives every row in `permissions` (migration `087_role_permissions_super_admin.sql` + `sync-role-permissions.mjs`).

## Keeping permissions in sync

1. Add UI keys to `frontend/src/permissions/registry.ts`
2. `node backend/scripts/sync-ui-registry.js` — upserts `permissions` table
3. `node backend/scripts/sync-role-permissions.mjs` — applies templates (`--prune` removes stray grants on non–super-admin roles)
4. After admin UI changes, refresh baseline: `node backend/scripts/export-baseline-seed.mjs`

Templates: `backend/scripts/role-permission-templates.mjs`

## Permission sources

- **API guards** — legacy keys like `bookings.view`, `financial.process_payouts`, `platform.admin`
- **UI registry** — flat keys like `users.edit.first-name`, `org.sidebar.branches` (511+ entries)

Both are stored in `permissions`; Super Admin has all of them.

## Middleware

Three middleware functions in `backend/src/shared/middleware/auth.middleware.ts`:

| Function | Purpose |
|----------|---------|
| `authMiddleware` | Validates session, sets `request.userId` |
| `requireRole(roles[])` | Role slug check (e.g. `super_admin`) |
| `requirePermission(permissions[])` | Permission key check (OR semantics) |
| `adminGuard` | `super_admin` role **or** `platform.admin` permission |

## Implementation

- `user_roles` — user ↔ role
- `role_permissions` — role ↔ permission
- `user_role_scopes` — optional row scope per assignment
- Admin UI: `/admin/ui-permissions` toggles `role_permissions` per element
- Registration assigns `player` by default; org flows assign `org-admin` / `seller` clones

## Access Request Flow

Player requests access to a restricted branch → org manager approves → `branch_player_access` updated.
