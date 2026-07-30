---
document_id: "TECH-MOD-44"
document_name: "Design Tokens Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 15
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-UX-01", "TECH-UX-02"]
  related: ["TECH-MOD-02"]
---

# Design Tokens Module (TECH-MOD-44)

**Source:** `backend/src/modules/design-tokens/` (5 entries: presentation/, application/, infrastructure/)

## 1. Purpose

Full theme appearance studio: manage design tokens (CSS variable values), light/dark color schemes, published theme versions, role-based theme overrides, landing page themes, and theme versioning with rollback.

## 2. Routes (18)

### Public (1) — unauthenticated
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/public/theme` | — | Get published theme |

### Appearance (2) — role-customize permission
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 2 | GET | `/appearance/theme` | `appearance.role-customize` | Get my role theme |
| 3 | PUT | `/appearance/my-theme` | `appearance.role-customize` | Save my role theme |

### Design Tokens / Studio (15) — `design-tokens.view` hook
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 4 | GET | `/design-tokens/studio` | view | Get theme studio editor data |
| 5 | PUT | `/design-tokens/theme` | edit | Save theme draft |
| 6 | POST | `/design-tokens/publish` | publish | Publish theme |
| 7 | POST | `/design-tokens/rollback/:versionId` | rollback | Rollback to version |
| 8 | PUT | `/design-tokens/role-editable` | edit | Save role-editable flags |
| 9 | POST | `/design-tokens/reset-baseline` | edit | Save reset baseline snapshot |
| 10 | POST | `/design-tokens/restore-baseline` | edit | Restore from baseline |
| 11 | GET | `/design-tokens/role-theme/:roleId` | edit | Get role theme overrides |
| 12 | PUT | `/design-tokens/role-theme/:roleId` | edit | Save role theme overrides |

### Legacy Token CRUD (6)
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 13 | GET | `/design-tokens` | view | List tokens |
| 14 | GET | `/design-tokens/:id` | view | Get token |
| 15 | POST | `/design-tokens` | create | Create token |
| 16 | PUT | `/design-tokens/:id` | edit | Update token |
| 17 | DELETE | `/design-tokens/:id` | delete | Delete token |

## 3. Services

`design-token.service.ts` provides:

- **Studio:** `getPublishedTheme`, `listForEditor` (tokens + versions + reset baseline)
- **User Themes:** `getThemeForUser` (merges global + role overrides), `saveMyRoleTheme` (filters to editable keys)
- **Versioning:** `saveDrafts`, `publish`, `rollback`, `saveResetBaseline`, `restoreResetBaseline`
- **Role Themes:** `getRoleTheme`, `saveRoleTheme`, `saveRoleEditable`
- **CRUD:** `list`, `get`, `create`, `update`, `delete`

## 4. Key Concepts

- **Design Tokens:** Named CSS variable values (`--color-primary`, `--font-heading`, etc.)
- **Published Theme:** A snapshot of all token values at a point in time, stored as versioned JSON payload
- **Role-Based Overrides:** Each role can have custom token overrides that merge on top of the global published theme
- **Editable Keys:** Admin controls which tokens each role is allowed to customize
- **Versioning:** Full version history with `publish` → `rollback` capability. Baseline snapshots for disaster recovery
- **Reset Baseline:** Saved snapshot of the published theme that can be restored at any time
