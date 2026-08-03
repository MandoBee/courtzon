# RBAC Roles Audit — RCA & Fix Report

**Date:** 2026-08-03 · **Scope:** `org-admin`, `shop-admin`, `resource-mgr`, `coach`, `accountant` (live DB `courtzon_v3` @ 187.127.72.93:3307)
**Status:** ✅ All findings fixed, deployed, and verified against the DB.

---

## 1. Root Cause Analysis

| # | Finding | Severity | Root cause | Resolution |
|---|---------|----------|-----------|------------|
| RCA-1 | **Accountant has zero reachable UI** despite 43 finance grants | **High** | `AdminRoute` (`App.tsx:309`) only admitted `super-admin`/`super_admin`/`admin`. The accountant's 43 finance permissions were never visible because the route guard blocked the entire `/admin/*` tree. | Added `accountant` to `AdminRoute`, `ProtectedRoute`, and `LandingRoute` admin lists. |
| RCA-2 | **`/admin/*` routes had zero permission gating** | **High** | Only the sidebar was `can()`-filtered (`AdminSidebar.tsx:219-226`); any admin-role user could deep-link to any admin page regardless of permissions. | Added `frontend/src/permissions/adminRoutePermissions.ts` (route → required permission map) and enforced it in `AdminLayout` (Access Denied screen). |
| RCA-3 | **`home.recent-activity` granted to all 5 staff roles** | Medium | Consumer-only home section; explicitly excluded from every non-player role template (`role-permission-templates.ts:270`) but older grants were never pruned. | Removed from `org-admin`, `shop-admin`, `resource-mgr`, `coach`, `accountant` (incl. org-scoped clones) in migration 080. |
| RCA-4 | **`settlements.request` missing on global `org-admin`** | Medium | Org Finance uses it for "Request Settlement" (`OrgFinancePage.tsx:380`); the org-6 clone had it but the global template/role didn't. | Granted to all `org-admin` roles (template + DB). |
| RCA-5 | **`coaches.approve`/`coaches.assign` were DB-only extras** | Low | Intentional workflow (Org Admin approves/assigns coaches) existed only as manual grants; a `--prune` sync would have wiped them. | Codified in the org-admin template and ensured on all org-admin roles. |
| RCA-6 | **Accountant had no sidebar navigation** | Medium | The finance pages had no `sidebar.*` grants, so `AdminSidebar` rendered nothing finance-related for the role. | Granted the 11 finance `sidebar.*` leaf keys (parents auto-render when a child passes). |
| RCA-7 | **Escalation risk for a finance-only role** | High | With RCA-2, a granted accountant could reach Users/Roles/Permissions/Organisations/Settings/Audit/Security screens. | Explicit deny-list (`isAdminDeniedRoute`) for the `accountant` role plus route-permission checks for every admin route. |

**Data-quality baseline (verified):** 828 permissions, 49 modules, 1729 mappings. Zero orphan mappings, zero duplicates, zero deleted-role mappings. All 803 UI-registry keys exist in the DB; 25 backend-only extras are legitimate.

---

## 2. Final permission matrix

`docs/rbac-permission-matrix.csv` — 828 rows × 5 roles (Allow / blank), plus module grouping. Generated from the updated templates, which now match the live DB exactly (`verify-final.mjs` reported 0 missing / 0 extra for all 7 role rows).

### Final grant counts

| Role | Before | After | Change |
|------|-------:|------:|--------|
| org-admin (3) | 179 | 179 | −`home.recent-activity`, +`settlements.request` |
| org-admin (1052, org 6) | 178 | 179 | −`home.recent-activity`, +`coaches.approve`, +`coaches.assign` |
| shop-admin (6, 1087) | 89 | 88 | −`home.recent-activity` |
| resource-mgr (5) | 54 | 53 | −`home.recent-activity` |
| coach (7) | 71 | 70 | −`home.recent-activity` |
| accountant (8) | 43 | 53 | −`home.recent-activity`, +11 finance `sidebar.*` keys |

### Accountant — allowed surface (strict least privilege)
Finance Dashboard `/admin/finance`, Ledger, Finance Reports, Financial Ops `/admin/financial-ops`, Settlements, Withdrawal Requests, Coupons, Bookings (view), Marketplace Orders, Admin Dashboard, Reports. **Explicitly denied:** Users, Roles, Permissions, Organizations/Branches, System/Settings, Security, Audit, Subscription, Identity.

---

## 3. SQL migration

`database/migrations/080_rbac_roles_review.sql` — idempotent (DELETE + `INSERT IGNORE`; unique index `uk_role_perm` guarantees dedupe).
**Applied to live DB** and recorded in `migration_history` (id=92, hash `910EA0F0DA6F`).

---

## 4. Files modified

| File | Change |
|------|--------|
| `frontend/src/permissions/adminRoutePermissions.ts` | **New** — `/admin` route → required permission map (longest-prefix) + accountant deny-list. |
| `frontend/src/app/layouts/AdminLayout.tsx` | Route-level permission enforcement; Access Denied screen. |
| `frontend/src/App.tsx` | `AdminRoute`/`ProtectedRoute`/`LandingRoute` admit `accountant`. |
| `backend/scripts/role-permission-templates.mjs` | Accountant sidebar pattern + org-admin `settlements.request`/`coaches.approve`/`coaches.assign`. |
| `backend/src/modules/rbac/application/role-permission-templates.ts` | Same, mirrored (TS). |
| `database/migrations/080_rbac_roles_review.sql` | **New** — idempotent RBAC reconciliation. |
| `docs/rbac-permission-matrix.csv` | **New** — final matrix deliverable. |

---

## 5. Confirmation

- **DB:** `verify-final.mjs` — all 7 role rows `[OK]` (0 missing / 0 extra vs templates).
- **Live checks:** `home.recent-activity` = 0 across the 5 slugs; org-admin roles each have exactly `settlements.request` + `coaches.approve` + `coaches.assign`; accountant has all 11 `sidebar.*` keys, 0 missing.
- **Build:** `npm run build` (frontend) ✅ · Docker images rebuilt ✅ · `GET /health` ok, frontend HTTP 200 ✅.
- **Deploy:** committed `1bf0f02` on `master`, pushed to `origin` ✅ (CI/CD auto-deploys from master).

## Notes / out of scope

- `scripts/ci-validate.js` crashes at line 199 (`moduleDirs` undefined — pre-existing bug, independent of this change); checks before it are intact. Fixing it was outside this task's scope.
- `workspace.store.ts` `roleWorkspaceMap` still omits `shop-admin`/`resource-mgr`/`accountant`/`coach`/`referee` (RoleSwitcher hidden for them). Not addressed — flag if you want it wired.
