---
document_id: "BIZ-ARCH-05"
document_name: "Business Actor Model"
family: "BIZ-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["product", "architect", "security"]
difficulty: "intermediate"
reading_time: 15
business_owner: "Product Manager"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Draft"
---

# Business Actor Model (BIZ-ARCH-05)

## 1. Actor Definitions

| Actor | Description | Role Slug | Auth Method |
|-------|-------------|-----------|-------------|
| **Guest** | Unauthenticated visitor | — | None |
| **Player** | End-user booking courts, joining matches | `player` | JWT session |
| **Coach** | Provides coaching sessions | `coach` | JWT session |
| **Referee** | Officiates matches | `referee` | JWT session |
| **Staff** | Org employee managing operations | `staff` | JWT session |
| **Org Admin** | Manages an organisation | `org_admin` | JWT session |
| **Org Owner** | Owns the organisation | `org_owner` | JWT session |
| **Super Admin** | Platform-wide administrator | `super_admin` / `super-admin` | JWT session + 2FA |
| **API Client** | External system via API key | — | SHA-256 API key |

## 2. Actor-Permission Matrix

| Capability | Guest | Player | Coach | Referee | Staff | Org Admin | Org Owner | Super Admin |
|-----------|-------|--------|-------|---------|-------|-----------|-----------|-------------|
| Browse public content | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Register / Login | ✓ | — | — | — | — | — | — | — |
| Create booking | — | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Cancel booking | — | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Create match | — | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| Marketplace buy | — | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| Marketplace sell | — | — | — | — | — | ✓ | ✓ | ✓ |
| Manage inventory | — | — | — | — | ✓ | ✓ | ✓ | ✓ |
| Process payroll | — | — | — | — | — | ✓ | ✓ | ✓ |
| Manage memberships | — | — | — | — | ✓ | ✓ | ✓ | ✓ |
| View reports | — | — | — | — | — | ✓ | ✓ | ✓ |
| Manage API keys | — | — | — | — | — | — | — | ✓ |
| Admin financial ledger | — | — | — | — | — | — | — | ✓ |
| Manage permissions | — | — | — | — | — | — | — | ✓ |
| UI permission gating | — | — | — | — | — | — | — | ✓ |
| Revert audit actions | — | — | — | — | — | — | — | ✓ |
| Access via API key | — | — | — | — | — | — | ✓ | ✓ |

**Evidence:** Permission keys defined in `frontend/src/permissions/registry.ts`. Route guards in each module's `*.routes.ts`.

## 3. Role Hierarchy

```
super_admin (platform-wide)
  ├── org_owner (owns one or more orgs)
  │   └── org_admin (manages an org)
  │       └── staff (org employee)
  │           ├── coach (provides sessions)
  │           ├── referee (officiates)
  │           └── player (uses facilities)
  └── api_client (external integration)
```

## 4. Key Auth Middleware Patterns

| Middleware | Used In | Source |
|-----------|---------|--------|
| `authMiddleware` | All protected routes | `shared/middleware/auth.middleware.ts` |
| `requirePermission(['key'])]` | Granular route gating | Same file |
| `requireRole(['super_admin'])]` | Admin-only routes | Same file |
| `adminGuard` | CMS, Community admin | Same file |
| `apiKeyAuth` | Integration gateway | `integration/middleware/api-key-auth.ts` |
| `requireOrganisationAccess('orgId')` | Org-scoped uploads | `upload/presentation/upload.routes.ts` |
