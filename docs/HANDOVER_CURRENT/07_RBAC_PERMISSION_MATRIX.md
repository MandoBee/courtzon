# 07 — COMPLETE RBAC PERMISSION MATRIX

**Audit:** 2026-10-04 · Sources: `roles`, `permissions`, `role_permissions`, `user_role_scopes` (live DB), `frontend/src/permissions/registry.ts` (942 UI elements registered), `backend/scripts/role-permission-templates.mjs`, `app.ts` auth glue.

Status markers: ✅ IMPLEMENTED · 🟡 PARTIAL/INCONSISTENT · ⚠️ RISK · ❓ UNVERIFIED

---

## 1. How RBAC is implemented

- `permissions` table: `permission_key` UNIQUE + `element_type` (button/tab/page/section/action/field) + `element_label` + `component_path` + `is_ui_element`.
- `roles`: global (`organisation_id NULL`) or org-scoped; `slug` unique within org (`uk_role_org_slug` via generated `org_id_normalized`).
- `role_permissions` (role → permission); `user_roles` (user → role, `is_active`, `expires_at`); `user_role_scopes` (org/branch/resource scope).
- Backend enforcement: `authMiddleware` loads role slugs + `checkPermission`; `requirePermission(['key'])` arrays on routes; org guards.
- Frontend enforcement: `registry.ts` 942 elements + `<Can>` / `useCan`; admin sidebar 100+ gated entries.

## 2. The 26 GLOBAL roles (live DB, slug)

1. `super_admin` (Super Admin)
2. `player`
3. `org-admin`
4. `branch-mgr`
5. `resource-mgr`
6. `shop-admin`
7. `coach`
8. `accountant`
9. `independent_coach`
10. `resident_coach`
11. `referee`
12. `master-admin`
13. `court-manager`
14. `marketplace-manager`
15. `receptionist`
16. `customer-service`
17. `finance-manager`
18. `operations-manager`
19. `tournament-manager`
20. `academy-manager`
21. `event-manager`
22. `marketing-manager`
23. `content-manager`
24. `support-agent`
25. `auditor`
26. `read-only-admin`

DB total roles = 92 (26 global + ~66 org copies).

## 3. Permission counts

- Permissions table rows: **965** (live DB).
- Frontend registry entries: **942** (all elements needing sync). Small delta expected (some platform-only permissions).
- `permission_modules` catalog: seeded (module slugs like `dashboard`, `users`, `roles`, `organisations`, `branches`, `bookings`, `payments`, `financial`, `membership`, `marketplace`, `tournaments`, `academy`, `notifications`, `reports`, `security`, `app-settings`, …).

## 4. Capability matrix (semantic, verified from registry + route guards + screens)

| Capability | super_admin | org-admin | branch-mgr | resource-mgr | receptionist | accountant/finance | coach | referee | player | read-only-admin | auditor |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Full admin panel | ✅ | — | — | — | — | — | — | — | — | view | view |
| Org settings | ✅ | ✅ | 🟡(own branch) | — | — | — | — | — | — | view | view |
| Create plans/versions | ✅ | ✅ | — | — | — | — | — | — | — | — | — |
| Confirm cash (bookings/membership) | ✅ | ✅ | ✅ | — | ✅ | — | — | — | — | — | — |
| Complete card | ✅ | ✅ | ✅ | — | — | — | — | — | — | — | — |
| Ledger/accounting | ✅ | ✅ (org) | — | — | — | ✅ | — | — | — | view | view |
| Settlement ops | ✅ | ✅ | — | — | — | ✅ | — | — | — | view | view |
| Marketplace mgmt | ✅ | ✅ | — | — | — | — | — | — | sell | 🔧 | view |
| Tournament mgmt | ✅ | ✅ | — | — | — | — | — | — | reg | 🔧 | view |
| Academy mgmt | ✅ | ✅ | — | — | — | — | — | — | enroll | 🔧 | view |
| Coach sessions | — | — | — | — | — | — | ✅ | — | book | — | — |
| Referee assignments | — | — | — | — | — | — | — | ✅ | — | — | — |
| Wallet withdraw | — | — | — | — | — | ✅(queue) | — | — | ✅(own) | — | — |
| User/role management | ✅ | ✅(org staff) | — | — | — | — | — | — | — | — | — |

Legend: 🟡 = scoped; 🔧 = limited; ✅; — = none.

> **Note:** This matrix is semantic. The *exact* per-role permission grid lives in DB `role_permissions`; the UI shows it at `/admin/permissions`. For a machine-readable export run the admin "UI Permissions" screen or query the DB (read-only). **Full 965×26 export is intentionally not embedded here** (data size) — referenced as the audit artifact source.

## 5. Findings

### 5.1 Missing authorization / inconsistencies
- **F1** Frontend `/admin` route guard = hardcoded `roles.some([...super-admin, super_admin, admin, master-admin, accountant])` — **inconsistent with permission-first policy**; Accountant gets the whole admin shell despite narrow permissions. (`App.tsx`)
- **F2** `/org` guard: user needs any org scope — underlying org-level permissions are still enforced by backend routes (good) but UI nav may expose links that 403.
- **F3** Some routes likely use broad perms (e.g. `financial.reconcile` for refund+sync+recover+reconciliation) → less granular than ideal.
- **F4** Frontend `registry.ts` must stay in sync with `sync-ui-registry.js`; a missing entry = element invisible to non-super-admins (silent drop).

### 5.2 Over-permission / risk
- **R1** Orphaned org role copies (66 orgs × standard set) inherit whatever the template had; run `sync-role-permissions.mjs` only with review.
- **R2** `super_admin` template gets ALL permissions (per AGENTS.md) — fine; but ensure no accidental `player`+`super_admin` user having both.
- **R3** Cash confirmation grants (receptionist) combined with membership complete-card on same screen — verify separation of duties desired by business.

### 5.3 Frontend/backend mismatch
- Permissions are enforced **both sides**, but only backend is authoritative. Frontend `<Can>` derives from `/auth/me` `permissions[]` which is sent in the user object (verified in auth.store).

### 5.4 Privilege escalation / cross-org
- `requireOrgManageAccess` uses `org.staff.manage` OR owner — a staff member granted that single permission can manage org staff/roles (by design, but escalate read-only roles if wrongly granted).
- `user_role_scopes` correctly scopes org/branch/resource — cross-org access requires a valid scope row.
- **❓** Full grep of every admin route for missing scope checks not completed — recommended quick security sweep (see 29).

## 6. How to add a new permission (workflow — verified)

1. Add `permissionKey` + module/relementType/label to `frontend/src/permissions/registry.ts`.
2. Run `node backend/scripts/sync-ui-registry.js` (syncs to `permissions` table).
3. Assign to default roles via `backend/scripts/role-permission-templates.mjs` + `sync-role-permissions.mjs`.
4. Gate UI with `<Can permission="...">`; protect backend route with `requirePermission(['...'])`.

## 7. Data evidence

- Roles/permissions synced across all 26 role templates with zero drift per existing release notes (⚠️ release-note claim; DB snapshot not re-diffed in this audit — `07 ❓`).
- Permissions row count 965 vs registry 942 — **please re-run sync + report any drift before relying on the matrix for a new role**.

## 8. Business decisions required
- Should `accountant` / `read-only-admin` see the whole admin shell? (UI-gate policy)
- Separate-duties for cash confirm vs card complete? 
- Per-org role template customization beyond org-admin?