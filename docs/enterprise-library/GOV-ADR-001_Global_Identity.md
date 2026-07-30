---
document_id: "GOV-ADR-001"
document_name: "Global Identity Model"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "intermediate"
reading_time: 10
business_owner: "CTO"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
supersedes: []
related_decisions: ["GOV-ADR-002"]
---

# ADR-001: Global Identity Model

**Status:** Accepted | **Date:** 2025-01-15

## Context

The platform serves multiple actor types: players, coaches, referees, staff, org admins, and super admins. Each actor type has different attributes and capabilities. Common approaches include:

1. **Separate tables per actor type** (e.g., `players`, `coaches`, `admins`) — traditional but causes cross-actor complexity
2. **Single users table with role-based assignments** — flat and flexible
3. **User table + profile subtypes** — polymorphic profiles

## Decision

**Use a single `users` table with role-based assignments via a `user_roles` junction table.** NO separate tables for players, coaches, referees, or admins.

```
users (id, email, password_hash, full_name, birth_date, gender, account_status, created_at)
  ↓
user_roles (user_id, role_id, org_scope_id, is_active, expires_at)
  ↓
roles (id, slug, name, is_system)
  ↓
role_permissions (role_id, permission_id)
  ↓
permissions (id, permission_key, module_id)
```

### Key Implementation Details

| Aspect | Implementation | Source |
|--------|---------------|--------|
| Auth | JWT-based session with `userId` in request | `modules/auth/` |
| Role resolution | `user_roles` JOIN `roles` at middleware | `shared/middleware/auth.middleware.ts` |
| Permission check | `requirePermission(['key'])]` middleware | Same file |
| Scope limiting | `user_role_scopes` table for org-scoped access | `shared/middleware/route-guard.ts` |
| Role hierarchy | `super_admin` → `org_owner` → `org_admin` → `staff` → `player` | RBAC module |
| UI gating | `<Can permission="key">` component | `frontend/src/permissions/Can.tsx` |

### Player-Specific Data

Additional player attributes (skill level, sport interests, etc.) use optional profile tables:
- `player_profiles` (main_sport_id, main_level_id)
- `player_sport_interests` (user_id, sport_id)

**Evidence:** `match/application/services/eligibility.service.ts:10-44` queries `users LEFT JOIN player_profiles` for eligibility checks.

## Consequences

**Positive:**
- Single auth flow for all actor types
- Users can hold multiple roles simultaneously (player + coach)
- Org-scoped roles enable franchise model
- Permission keys provide granular UI control
- Simplified user management in admin screens

**Negative:**
- Profile tables add JOIN complexity for role-specific data
- Role checks are more complex than separate tables
- Migration of legacy separate-table systems is more involved

## Compliance

All 28 modules use `authMiddleware` → `requirePermission()` pattern. NO module checks `user.account_type` — they check `user_roles` + `role_permissions`.
