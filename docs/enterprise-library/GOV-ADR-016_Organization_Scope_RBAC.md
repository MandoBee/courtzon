---
document_id: "GOV-ADR-016"
document_name: "Organization-Scoped RBAC"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "advanced"
reading_time: 7
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
knowledge_objects:
  references: ["TECH-ARCH-15", "TECH-MOD-13", "TECH-MOD-02"]
  related: ["GOV-ADR-001", "GOV-ADR-002"]
---

# ADR-016: Organization-Scoped RBAC

## Status

Accepted

## Context

The platform serves multiple organizations (sports facilities, shops, academies). Users can have roles scoped to specific organizations, branches, or resources. The system must enforce permissions at multiple granularity levels: global (super_admin), organization-wide (org_admin), branch-level (branch_manager), and resource-level (court_operator). Common approaches include:

1. **Separate database per organization** — strong isolation but operational overhead; cross-org reporting is difficult
2. **Single database with global roles only** — simple but no multi-tenant isolation
3. **Single database with org-scoped roles via `user_role_scopes`** — flexible multi-tenancy without separate databases
4. **Row-level security (RLS)** — PostgreSQL-specific; not available on MySQL

## Decision

**Use `user_role_scopes` table for organization/branch/resource-level permission scoping within a single database.** Each user-role assignment can be scoped to an organization, branch, or resource. The middleware resolves scope at request time.

### Architecture

```
users (id, email, ...)
  │
  ├─ user_roles (user_id, role_id, org_id, is_active, expires_at)
  │    │
  │    ├─ roles (id, slug, name)
  │    │    └─ role_permissions (role_id, permission_id)
  │    │         └─ permissions (id, key, module_id)
  │    │
  │    └─ user_role_scopes (user_role_id, scope_type, scope_id)
  │         ├─ scope_type = 'organisation' → scope_id = org.id
  │         ├─ scope_type = 'branch'       → scope_id = branch.id
  │         └─ scope_type = 'resource'     → scope_id = resource.id
  │
  └─ organisations (owner_id references users.id)
```

### Key Implementation Details

| Aspect | Implementation | Source |
|--------|---------------|--------|
| Role assignment | `rbacRepository.assignRole()` — creates `user_roles` record | `rbac.repository.ts` |
| Scope setting | `rbacRepository.setUserRoleScope()` — adds scope entries | `rbac.repository.ts` |
| Template cloning | `rbacRepository.cloneRoleForOrg()` — copies template role for org-specific use | `rbac.repository.ts` |
| Org access check | `checkOrgAccess()` — verifies user has any role scoped to the org | `route-guard.ts:21-38` |
| Org manage check | `checkOrgManage()` — stricter check for admin-level operations | `route-guard.ts:45-60` |
| Scoped permission | `requireOrgScopedPermission()` — checks permission within org scope | `route-guard.ts:63-80` |
| Route middleware | `requireOrganisationAccess()` — Fastify preHandler | `route-guard.ts:21` |
| Super admin bypass | `super_admin` role bypasses all scope checks | `rbac.service.ts` |

### Registration Flow (Seller Example)

```
registerSeller()
  1. Create user in `users` table
  2. Create `organisation` with type = 'shop'
  3. Clone 'shop-admin' template role → org-specific role_id
  4. Assign cloned role to user → user_roles record
  5. Set user_role_scope = { organisation, orgId }
```

**Evidence:** `auth.service.ts:190-195` — seller registration with role cloning and scope setting.

### Scope Resolution at Request Time

```
GET /org/42/dashboard
  → requireOrganisationAccess('orgId') middleware
  → checkOrgAccess(userId, 42)
  → Queries: user_roles → user_role_scopes
  → Returns 403 if no scope entry for organisation 42
  → Sets (request as any).orgId for downstream handlers
```

## Consequences

### Positive

- **Multi-tenant in single DB**: No separate database per organization; cross-org reporting and management are straightforward
- **Granular scoping**: Organization, branch, and resource-level permission control
- **Template cloning**: Role templates cloned per org prevent cross-org role interference
- **Middleware enforcement**: Scope checks are automatic via Fastify preHandler; no per-route scope logic
- **Super admin bypass**: Platform admins skip scope checks entirely

### Negative

- **Query complexity**: Scope resolution requires multiple JOINs across user_roles, roles, and user_role_scopes
- **Role cloning overhead**: Each org gets its own copy of template roles — more rows in role_permissions
- **Caching challenge**: User permissions cached per user+org combination, increasing cache key space
- **Scope leak risk**: Incorrect scope query could expose data across org boundaries (mitigated by middleware checks on every request)

## Evidence

- `route-guard.ts:1-80` — `requireOrganisationAccess()`, `requireOrgManageAccess()`, `requireOrgScopedPermission()`
- `auth.service.ts:190-195` — seller registration with `setUserRoleScope()`
- `auth.service.ts:290-295` — organization registration with role cloning
- `rbac.repository.ts` — `assignRole()`, `setUserRoleScope()`, `cloneRoleForOrg()`
- `shared/middleware/auth.middleware.ts:37-50` — `requirePermission()` middleware

## Related Decisions

- GOV-ADR-001 (Global Identity Model): Single `users` table with role-based assignments
- GOV-ADR-002 (Domain Ownership): Organization owns its data; RBAC enforces boundaries
