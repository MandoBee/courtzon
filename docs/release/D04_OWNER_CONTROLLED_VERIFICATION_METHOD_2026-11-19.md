# CourtZon Live — D-04 Owner-Controlled Verification Method Discovery — 2026-11-19

> **LOCAL DISCOVERY ONLY — D-04 NOT VERIFIED — NO LIVE EXECUTION AUTHORIZED**

| Field | Value |
|---|---|
| Document | `docs/release/D04_OWNER_CONTROLLED_VERIFICATION_METHOD_2026-11-19.md` |
| Status | **LOCAL DISCOVERY ONLY — D-04 NOT VERIFIED — NO LIVE EXECUTION AUTHORIZED** |
| Prepared | 2026-11-19 |
| Prepared by | OpenCode — local frontend source, backend source and documentation inspection only |
| Repository | `C:\Users\mniaz\Desktop\CourtZon-V2` |
| Expected branch / HEAD | `fix/courtzon-live-phase1` · `f1fc4d60518b63e68834de42071982427913575c` |
| Review method | Static read-only inspection of local source files and existing governance records. **No route was executed, no API request was made, no endpoint was called, and no scenario was run.** |
| Governing records | `LIVE_READONLY_GET_ENDPOINT_ALLOWLIST_PROPOSAL_2026-11-19.md` §2.3 and §4 (owner-approved D-08 selection); `OWNER_DECISION_RECORD_LIVE_READINESS_REVISION_2026-11-19.md` §3–§4; `LIVE_READ_ONLY_EXECUTION_READINESS_CHECKLIST_DRAFT_2026-11-19.md` §7–§8; `COURTZON_RELEASE_PROGRESS.md` §33.7 and §38.2 |

---

## 1. Authorization boundary

This document records **local discovery only**. It does not verify either actor and it does not authorize verification.

- **D-04 remains NOT VERIFIED.** No current account attribute was established for user 126 or for `qa.acc@courtzon.test`.
- **No Live execution is authorized.** No Live site access, browser navigation to Live, login, authentication, session creation, OTP entry, credential discovery, cookie/token inspection, database access, SQL, test, simulation, account/role/permission change, Docker operation, Git operation, deployment, or evidence-file creation was performed or is authorized here.
- The project owner retains **exclusive control** of all authentication and all secrets. OpenCode does not request, receive, extract, store, or handle credentials, OTPs, cookies, tokens, or secrets.
- Discovery of a UI is **not** an authorization to use it. Every candidate UI below is evaluated against the exact owner-approved D-08 selection. A UI whose API calls are outside that selection is **UNAVAILABLE FOR THIS WAVE**.

### 1.1 Approved D-08 GET allowlist (frozen, recorded as approved)

| ID | Endpoint | Owner decision | Permitted evidence |
|---|---|---|---|
| E-01 | `GET /admin/dashboard` | **INCLUDE** | Status / request ID and visible UI text only. |
| E-02 | `GET /admin/dashboard/trends` | **INCLUDE — automatic request** | **HTTP Status and Request ID only. Response Body is not retained, stored, logged, copied into evidence, or collected.** The request is automatic and its suppression is not implied by this approval. |
| E-03 | `GET /auth/me` | **EXCLUDE** | Not to be used as a verification workaround. |
| E-04 | `GET /my/permissions` | **EXCLUDE from this wave** | Not to be used as a verification workaround. |
| E-05 | `GET /my/scopes` | **EXCLUDE from this wave** | Not to be used as a verification workaround. |
| E-06 | `GET /users/:userId/roles` | **EXCLUDE** | Not to be used as a verification workaround. |

No other endpoint is approved. Direct database access, manual SQL, hidden APIs, and browser developer-tools extraction are not recommended and are outside the approved method.

---

## 2. Available owner-operated UI methods — source-established candidates

"Available" below means **present in the codebase**, not authorized for this wave. All fields and guards are quoted from local source; no route was opened.

### 2.1 `/admin/users` — User list (`UserListPage`)

| Item | Source-established fact |
|---|---|
| Exact route | `/admin/users` — `frontend/src/App.tsx:731` (`<Route path="users" element={<UserListPage />} />`), nested under `/admin` at `frontend/src/App.tsx:710-712`. |
| Source file | `frontend/src/pages/admin/users/UserListPage.tsx`. |
| Backend API calls | `GET /admin/users?…` at `UserListPage.tsx:68-79`; `GET /countries` at `:83-86`; `GET /roles?scope=global` at `:89-92`; `DELETE /admin/users/:id` at `:56` (mutation, out of scope). |
| Authorization guard | Route key `'users': 'users.view'` in `frontend/src/permissions/adminRoutePermissions.ts:30`, applied through `canAccessAdminPath()` at `:153-161`; page-level `AdminRoute` via `hasPlatformAdminAccess()` in `frontend/src/app/routes/RouteGuards.tsx:88-99` and `frontend/src/permissions/platformAccess.ts:13-16`; action buttons gated by `<Can permission="users.edit">` and `<Can permission="users.delete">` at `UserListPage.tsx:197` and `:203`. Backend: `[adminGuard]` at `backend/src/modules/rbac/presentation/rbac.routes.ts:26`, where `adminGuard` = `super_admin`/`super-admin` role **or** `platform.admin` permission (`backend/src/shared/middleware/auth.middleware.ts:79-80`). |
| Exact fields displayed | `full_name` (`:176`), `country_name`/`country_iso`/`country_flag` (`:179-183`), `phone_number` (`:185`), `role_names` (`:186`), `account_status` (`:189`), `has_activated_selling` (`:190-192`), `created_at` (`:195`). |
| In approved D-08 allowlist? | **NO.** `GET /admin/users`, `GET /countries`, and `GET /roles?scope=global` are not E-01…E-06. |
| Wave status | **UNAVAILABLE FOR THIS WAVE.** |

**Additional source caveat:** `role_names` is produced by `GROUP_CONCAT(DISTINCT r.name …)` in `backend/src/modules/rbac/infrastructure/repositories/rbac.repository.ts:395-404`; the `LEFT JOIN user_roles` filter at `:404` checks `ur.is_active = TRUE` but contains **no `expires_at` guard**. A role name shown here can therefore be an expired assignment. This list is not proof of *active* roles even if it were allowed.

### 2.2 `/admin/users` → Edit modal — `UserEditModal` (target-user detail)

| Item | Source-established fact |
|---|---|
| Exact route | No standalone `/admin/users/:id` React route exists; detail is opened as a modal from `UserListPage.tsx:237-238` (`<UserEditModal userId={…} … />`), reachable only through `/admin/users`. |
| Source file | `frontend/src/pages/admin/users/UserEditModal.tsx`. |
| Backend API calls | `GET /admin/users/:id` at `:43-46`; `GET /admin/users/:id/bookings` at `:48-50`; `GET /admin/users/:id/academies` at `:62`; `GET /admin/users/:id/orders` at `:68`; `GET /admin/users/:id/branch-access` at `:80`; `GET /admin/users/:id/notification-preferences` at `:86`; `GET /admin/users/:id/coach` at `:92`; `GET /admin/users/:id/activity` at `:98`; `GET /roles` at `:104`; `GET /organisations` at `:109`. Mutating calls (out of scope): `PUT /admin/users/:id` at `:141`, `POST /user-roles` at `:152`, `DELETE /user-roles/:userId/:roleId` at `:158`, `PUT /admin/users/:id/password` at `:164`. |
| Authorization guard | Backend `[adminGuard]` for `GET /admin/users/:id` at `rbac.routes.ts:27` (super_admin role or `platform.admin`). Frontend action gates: `<Can permission="users.edit.status">` at `UserEditModal.tsx:366`, `<Can permission="users.edit">` at `:437`, `<Can permission="users.change-password">` at `:456`, `<Can permission="users.assign-role">` at `:531` and `:572`, `<Can permission="users.edit.role">` at `:564`; tab permissions at `:275-297`. |
| Exact fields displayed | Header `full_name` (`:245`) and `account_status` badge (`:246-250`); form status `accountStatus` from `account_status` with `active`/`suspended`/`banned` options (`:193`, `:365-385`); `Current Roles` list of `ur.role_name` (`:525-538`); `Organisations` list of `ur.organisation_name` / `System` / `No Organization` (`:542-549`). Coach-only availability via `CoachTab.tsx:236-241`: `coach.status`, `coach.platform_status`, `coach.is_verified`, `coach.is_available`, `rating_avg`. |
| Fields present in the backend response but **not displayed** | `GET /admin/users/:id` returns `user_roles` rows including `expires_at`, `is_active`, `role_id`, `role_slug`, `organisation_id`, `organisation_name` via `rbac.repository.ts:272-285`; the modal renders only `role_name` and organisation label at `UserEditModal.tsx:530` and `:547`. There is no displayed `platform.admin` field and no permissions count. |
| In approved D-08 allowlist? | **NO.** `GET /admin/users/:id` and all supporting calls are outside E-01…E-06. |
| Wave status | **UNAVAILABLE FOR THIS WAVE.** |

### 2.3 `/admin` — Admin dashboard (`AdminDashboard`)

| Item | Source-established fact |
|---|---|
| Exact route | `/admin` (index child) — `frontend/src/App.tsx:710-712`. |
| Source file | `frontend/src/pages/admin/AdminDashboard.tsx`. |
| Backend API calls | `GET /admin/dashboard` at `:30-33`; `GET /admin/dashboard/trends` at `:35-38`. Both fire automatically on screen load. |
| Authorization guard | `AdminRoute` (`RouteGuards.tsx:88-99`) via `hasPlatformAdminAccess()` (`platformAccess.ts:13-16`); `/admin` route permission `'': 'platform.admin'` in `adminRoutePermissions.ts:12-14`. Backend `[dashboardGuard]` = `requireRole(['super_admin','super-admin'])` at `rbac.routes.ts:66-68`; this is **role-only**, not the broader `adminGuard`. |
| Exact fields displayed | KPI cards from `stats`: `totalUsers`, `activeUsersToday`, `totalOrganisations`, `pendingOrganisations`, `totalBookings`, `todayBookings`, `totalRevenue`, `totalProducts`, `totalCoaches` (`AdminDashboard.tsx:73-80`). Recent users from trends: `full_name`, `email`, `created_at` (`:197-217`). |
| In approved D-08 allowlist? | **YES** — E-01 and E-02. However E-02 permits **HTTP Status and Request ID only**; its Response Body cannot be read, retained, or used as evidence, so the recent-user fields at `:197-217` are **not available**. |
| Wave status | **AVAILABLE ONLY WITHIN THE E-01 STATUS/UI-TEXT AND E-02 STATUS/REQUEST-ID LIMITS.** These endpoints return aggregate platform statistics and contain **no target-user status, roles, expiry, scope, or `platform.admin` field**. They cannot verify either nominated actor. |

### 2.4 Other inspected admin/organisation screens (all unavailable for this wave)

| Screen | Exact route / source | API calls | Authorization guard | Fields displayed | D-08 status |
|---|---|---|---|---|---|
| Role definitions | `/admin/roles` — `App.tsx:719`; `frontend/src/pages/admin/roles/RoleListPage.tsx:29-46,88` | `GET /roles?includeDeleted=…`, `GET /permission-modules`, `GET /permissions`, `GET /organisations`, `GET /roles/:id` | `'roles': 'roles.view'` (`adminRoutePermissions.ts:19`); backend `[superAdminGuard]` (`rbac.routes.ts:17-18`) | `role.name`, `is_system`, deleted flag, `organisation_name`, `permission_count`, role-definition `is_active` (`:312-333`) | **NOT IN ALLOWLIST — UNAVAILABLE.** Also shows role *definitions*, not a target user's active assignment. |
| UI permissions | `/admin/permissions` — `App.tsx:720-721`; `frontend/src/pages/admin/ui-permissions/UIPermissionsPage.tsx:31-36` | `GET /ui-permissions`, `GET /roles?scope=global` | `'permissions': 'ui-permissions.view'` (`adminRoutePermissions.ts:20-21`) | `element_label`, `element_type`, `permission_key`, per-role `has_permission` (`:240-272`) | **NOT IN ALLOWLIST — UNAVAILABLE.** Role→key mapping only; no per-user state. |
| Role audit | `/admin/security/role-audit` — `App.tsx:750`; `frontend/src/pages/admin/security/RoleAuditPage.tsx:8` | `GET /admin/security/role-audit` | longest-prefix rule `security: 'security.dashboard'` (`adminRoutePermissions.ts:42`, applied `:126-135`) | historical `created_at`, `action`, `entity_type`, `actor`, `after_state` (`:36-65`) | **NOT IN ALLOWLIST — UNAVAILABLE.** Historical log, not current state. |
| Audit logs | `/admin/audit-logs` — `App.tsx:741`; `frontend/src/pages/admin/AuditLogPage.tsx:31` | `GET /admin/audit-logs` | `'audit-logs': 'sidebar.audit'` (`adminRoutePermissions.ts:40`) | `Date`, `Actor`, `Action`, `Entity`, `ID`, `Description`, before/after state (`:67-96`) | **NOT IN ALLOWLIST — UNAVAILABLE.** Historical log, not current state. |
| Coach administration | `/admin/coaches` — `App.tsx:799`; `frontend/src/pages/admin/coaches/CoachAdminPage.tsx:15` | `GET /admin/coaches?page=…&limit=20` | `'coaches': 'sidebar.coaches-admin'` (`adminRoutePermissions.ts:62`); action `<Can>` gates at `CoachAdminPage.tsx:118-144` | `coach_status`, `platform_status`, `is_verified`, `is_available` (`:91-114`) | **NOT IN ALLOWLIST — UNAVAILABLE.** Coach-only; neither nominated actor is documented as a coach. |
| Organisation staff | `/org/:orgId/staff` — `App.tsx:874-890`; `frontend/src/pages/org/OrgStaffPage.tsx:60,80,108,132-147` | `GET /org/:orgId/staff`, `GET /org/:orgId/role-templates/:roleSlug/permissions`, `GET /org/:orgId/staff/:userId/permissions`, plus mutating calls | `OrgRoute`/`OrgApprovedGuard` (`App.tsx:363-379`) and `<Can permission="org.staff.manage">` (`OrgStaffPage.tsx:252,285`) | `full_name`, `email`, `role_slug` label, branch/resource scope summary (`OrgStaffPage.tsx:12-24,277-280`) | **NOT IN ALLOWLIST — UNAVAILABLE.** Organisation scope is excluded by D-07. |
| Organisation members | `/org/:orgId/members` — `App.tsx:890`; `frontend/src/pages/org/OrgMembersPage.tsx:37,43` | `GET /org/:orgId/members` | `OrgRoute`/`OrgApprovedGuard`; `<Can permission="org.members.manage">` (`:126-150`) | branch name, user name/email/phone, branch-access status `pending`/`approved`/`rejected`/`banned` (`:119-153`) | **NOT IN ALLOWLIST — UNAVAILABLE.** Branch access is not account status and is excluded by D-07. |
| Command palette | component, not a route — `frontend/src/components/search/CommandPalette.tsx:46-54`; preview `frontend/src/components/search/EntityPreview.tsx:44-53` | `GET /admin/users` | navigates to `/admin/users` only | `Type`, `ID`, `email`, `booking_status`, `is_active` when present | **NOT IN ALLOWLIST — UNAVAILABLE.** No roles, expiry, scope, or `platform.admin`. |

### 2.5 Endpoints that exist in the backend but are excluded or absent in the frontend

| Endpoint | Backend registration / guard | Frontend usage | D-08 status |
|---|---|---|---|
| `GET /auth/me` | `backend/src/modules/auth/presentation/auth.routes.ts:22`; special handling in `auth.middleware.ts:240-244` | `frontend/src/services/api.ts:113-114` | **E-03 EXCLUDE — unavailable.** |
| `GET /my/permissions` | `rbac.routes.ts:76`; `authMiddleware` only | No match in `frontend/src` | **E-04 EXCLUDE from this wave — unavailable.** |
| `GET /my/scopes` | `rbac.routes.ts:56`; `authMiddleware` only; organisation rows only (`rbac.repository.ts:322-352`) | `frontend/src/store/auth.store.ts:141,149,154-176` | **E-05 EXCLUDE from this wave — unavailable.** |
| `GET /users/:userId/roles` | `rbac.routes.ts:50`; `[superAdminGuard]`; returns `expires_at`, `is_active`, `organisation_id` (`rbac.repository.ts:272-285`) | No match in `frontend/src` | **E-06 EXCLUDE — unavailable.** |
| `GET /admin/crm/customers/:id` | `backend/src/modules/crm/presentation/crm.routes.ts:10`; `requirePermission(['crm.customers.view'])`; returns `account_status` (`crm.controller.ts:58-60`) | No owner-verification UI identified | **NOT IN ALLOWLIST — unavailable.** |

---

## 3. Verification coverage matrix

Status values reflect the **approved D-08 method only**. Historical evidence never upgrades a current attribute to verified.

| Attribute | User 126 | qa.acc account | Existing approved method | Status |
|---|---|---|---|---|
| Current active/inactive account status | Historical creation-time record only (`48_TEST_IDENTITIES_CREATED.md` §6–§8); current value **NOT VERIFIED**. | Historical 2026-11-14 `active` observation (`COURTZON_RELEASE_PROGRESS.md` §33.7.1:4824-4837); current value **NOT VERIFIED**. | None. E-01 returns aggregates; E-02 body is not retained. `account_status` is available only via `GET /admin/users` / `/admin/users/:id` (not approved) or CRM detail (not approved). | **NOT VERIFIABLE THROUGH THE APPROVED METHOD** |
| Current assigned role names | Historical `player` + `super_admin`; current value **NOT VERIFIED**. | Historical `player` + `accountant`; current value **NOT VERIFIED**. | None. `role_names` via `GET /admin/users` and `role_name` via `GET /admin/users/:id` are unapproved; `GET /auth/me` is E-03 EXCLUDE. | **NOT VERIFIABLE THROUGH THE APPROVED METHOD** |
| Role expiry dates / absence of expiry | **NOT VERIFIED**. | **NOT VERIFIED**; no user ID documented for this email. | None. `expires_at` is returned only by `/admin/users/:id` and `/users/:userId/roles` (E-06 EXCLUDE); neither is approved. No frontend screen displays role expiry. | **NOT VERIFIABLE THROUGH THE APPROVED METHOD** |
| Global / Platform scope | Historical **Global** (no scope row); current value **NOT VERIFIED**. | Historical `platform.admin=false`, non-platform; current value **NOT VERIFIED**. | None. `/admin/users/:id` exposes role `organisation_id` but is unapproved; `GET /my/scopes` is E-05 EXCLUDE and returns organisation rows only; `GET /users/:userId/roles` is E-06 EXCLUDE. | **NOT VERIFIABLE THROUGH THE APPROVED METHOD** |
| Effective `platform.admin` status | **NOT VERIFIED**. | **NOT VERIFIED**. | None. No backend endpoint returns a `platform.admin` boolean; the frontend derives it from the `/auth/me` permissions array (E-03 EXCLUDE) via `platformAccess.ts:13-17`. `GET /my/permissions` is E-04 EXCLUDE. | **NOT VERIFIABLE THROUGH THE APPROVED METHOD** |
| Current availability of the actor for owner-controlled use | **NOT VERIFIED**. | **NOT VERIFIED**. | None in the approved method. Availability requires current account status plus owner-controlled authentication; credentials and OTP are outside OpenCode's boundary (D-05). | **NOT VERIFIABLE THROUGH THE APPROVED METHOD — OWNER ACTION REQUIRED** |

No attribute in the matrix is **VERIFIED**. The only endpoints approved for this wave return platform aggregates and do not identify either nominated actor; E-02 permits no Response Body retention at all.

---

## 4. Gaps

Every attribute requested in §3 is a gap under the approved method:

1. **Account status** — available in code only through `GET /admin/users` (`rbac.repository.ts:395`) and `GET /admin/users/:id`; both are outside E-01…E-06.
2. **Role names** — same endpoints; `GET /auth/me` (E-03) also carries roles but is excluded.
3. **Role expiry** — returned only by `GET /admin/users/:id` and `GET /users/:userId/roles` (E-06) via `rbac.repository.ts:274-281`; no UI displays it. Additionally, the `/admin/users` list join at `rbac.repository.ts:404` omits the expiry filter, so that list cannot prove assignments are unexpired even if approved.
4. **Global/Platform scope** — no approved endpoint returns a global/platform flag. `GET /my/scopes` (E-05) emits only `scope_type='organisation'` (`rbac.repository.ts:322`). Global scope is modelled as `r.organisation_id IS NULL` (`backend/src/shared/middleware/org-access.ts:10-24`), which is not surfaced by E-01/E-02.
5. **`platform.admin`** — no endpoint returns it as a field; it is a guard predicate (`auth.middleware.ts:79-80`) or a client-side derivation from the excluded `/auth/me` permissions array.
6. **Availability** — cannot be established without current account status and an owner-controlled authentication decision; authentication is explicitly outside OpenCode's boundary.
7. **qa.acc identity** — no user ID is documented for `qa.acc@courtzon.test`, and the email-to-“QA Accountant” display-name mapping is **NOT VERIFIED** (`COURTZON_RELEASE_PROGRESS.md` §33.7.1 records display names only). Locating the correct user record would require an unapproved endpoint.
8. **No single screen** in `frontend/src` presents all six attributes for one target user; the closest (`/admin/users` + `UserEditModal`) omits expiry, detailed assigned scopes, and `platform.admin`, and is itself unapproved.

**Conclusion:** the existing UI cannot provide any required D-04 attribute without using an endpoint outside the approved allowlist. All six attributes are therefore **NOT VERIFIABLE THROUGH THE APPROVED METHOD**. Closing these gaps requires an owner decision — either owner-supplied non-secret attestations (as prepared in `D04_IDENTITY_VERIFICATION_PREPARATION_2026-11-19.md`) or a **separate D-08 amendment** authorizing additional read-only endpoints/UI.

---

## 5. Recommended owner-controlled workflow (future, separately authorized)

The following is a proposal for the owner, **not** a step performed here and **not** an authorization.

1. **No action in this session.** Remain at LOCAL DISCOVERY ONLY; D-04 stays NOT VERIFIED.
2. **Owner decides the method first.** Choose one of:
   - (a) owner supplies non-secret attestations for the five minimum fields (identity, active roles, expiry state, Global/Platform scope, availability), as prepared in the D-04 preparation document; or
   - (b) owner approves a **separate D-08 amendment** adding specific read-only endpoints/UI, with explicit evidence rules, before any UI inspection occurs.
3. **Owner controls authentication personally.** The owner enters all credentials and OTPs personally; the owner may use an existing authorized session of their choosing. **OpenCode must stop and wait for the owner whenever authentication or OTP is needed (D-05).** OpenCode never asks the owner to send secrets, OTPs, tokens, cookies, or screenshots containing them.
4. **Read-only observation only.** If method (b) is later authorized, the owner may view the approved screen and report only non-secret observations (role names, status, expiry state, scope label, platform-admin state). No account, role, permission, password, or status change; no database access; no developer-tools extraction of tokens or hidden APIs.
5. **No use of excluded endpoints.** E-03, E-04, E-05 and E-06 are not to be used as workarounds. If an attribute cannot be observed within the amended allowlist, record **NOT VERIFIED** rather than inferring it.
6. **Separate authorization for Live.** Any future Live step requires all then-applicable gates: D-16 signature, D-11 execution window, §5.5 passage, W1 approval, and an explicit owner decision. None is recorded as complete here.
7. **Stop.** After the owner's attestations or approved observation, record D-04 as verified **only** for the attributes actually covered; leave all others NOT VERIFIED.

---

## 6. Approval requirements and preserved governance state

### 6.1 Explicit distinctions

| Item | State |
|---|---|
| Local discovery | **COMPLETED** — source and documentation inspected; no route or API executed. |
| Owner verification | **NOT PERFORMED** — D-04 **NOT VERIFIED** for either actor. |
| Additional endpoint or UI method | **REQUIRES A SEPARATE D-08 AMENDMENT.** No excluded endpoint may be repurposed. |
| Any future Live access | **REQUIRES SEPARATE AUTHORIZATION.** Not granted by this document. |
| D-16 / §5.5 / W1 Gate Out | **PENDING** / **NOT PASSED** / **NOT MET** — unchanged. |

### 6.2 Governance states — unchanged

| Item | State |
|---|---|
| Overall completion | **56%** |
| Phase 6 | **5/10** |
| Phase 7 | **10%** |
| UR-03 | **BLOCKED** |
| UR-07 | **BLOCKED** |
| W1 Gate Out | **NOT MET** |
| Constitution §5.5 | **NOT PASSED** |
| D-16 | **PENDING** |
| D-04 | **NOT VERIFIED** |
| D-08 endpoint selection | **APPROVED** |
| D-09 evidence path | **PENDING** |
| Backup person | **PENDING** |
| D-11 execution window | **PENDING** |
| Option A+ Live deployment | **NOT AUTHORIZED** |
| Write-enabled UAT | **NOT AUTHORIZED** |

No Decision ID, signature, initials, UTC timestamp, backup person, or owner approval was invented.

---

## 7. Source references

All references are repository-relative paths with 1-based line numbers.

### 7.1 Frontend

| Claim | Reference |
|---|---|
| `/admin` route and `/admin/users`, `/admin/roles`, `/admin/permissions`, `/admin/audit-logs`, `/admin/security/role-audit`, `/admin/coaches` routes | `frontend/src/App.tsx:710-712,719,720-721,731,741,750,799` |
| `/org/:orgId` route, org gate and `/org/:orgId/staff`, `/org/:orgId/members` | `frontend/src/App.tsx:363-379,874-890` |
| Admin dashboard automatic E-01/E-02 requests | `frontend/src/pages/admin/AdminDashboard.tsx:30-33,35-38` |
| Dashboard KPI fields | `frontend/src/pages/admin/AdminDashboard.tsx:73-80` |
| Dashboard recent-user display | `frontend/src/pages/admin/AdminDashboard.tsx:197-217` |
| `/admin/users` query and filters | `frontend/src/pages/admin/users/UserListPage.tsx:64-92` |
| `/admin/users` displayed fields and action gates | `frontend/src/pages/admin/users/UserListPage.tsx:171-198,203` |
| Modal invocation from list | `frontend/src/pages/admin/users/UserListPage.tsx:237-238` |
| `UserEditModal` read and mutation endpoints | `frontend/src/pages/admin/users/UserEditModal.tsx:43-46,48-50,56,62,68,80,86,92,98,104,109,141,152,158,164` |
| `UserEditModal` status, roles, organisations display | `frontend/src/pages/admin/users/UserEditModal.tsx:171,193,245-250,365-385,521-550` |
| `UserEditModal` permission gates | `frontend/src/pages/admin/users/UserEditModal.tsx:275-297,366,437,456,531,564,572` |
| Coach availability fields | `frontend/src/pages/admin/users/CoachTab.tsx:236-241` |
| Role list API and fields | `frontend/src/pages/admin/roles/RoleListPage.tsx:29-46,88,312-333` |
| UI permissions API and fields | `frontend/src/pages/admin/ui-permissions/UIPermissionsPage.tsx:31-36,240-272` |
| Role audit API and fields | `frontend/src/pages/admin/security/RoleAuditPage.tsx:8,26-65` |
| Audit log API and fields | `frontend/src/pages/admin/AuditLogPage.tsx:31,42,67-96` |
| Coach admin API and fields/gates | `frontend/src/pages/admin/coaches/CoachAdminPage.tsx:15,91-114,118-144` |
| Org staff API, scope summary and gates | `frontend/src/pages/org/OrgStaffPage.tsx:12-24,60,80,108,132-147,252,277-280,285` |
| Org members status/API | `frontend/src/pages/org/OrgMembersPage.tsx:9,37,43,119-153` |
| `/auth/me` API call | `frontend/src/services/api.ts:113-114` |
| `/my/scopes` handling | `frontend/src/store/auth.store.ts:141,149,154-176` |
| Absence of `/my/permissions` and `/users/:userId/roles` in frontend | repository-wide search of `frontend/src` — no match |
| `platform.admin` derivation | `frontend/src/permissions/platformAccess.ts:13-17`; `frontend/src/permissions/adminRoutePermissions.ts:11-14,90`; `frontend/src/navigation/admin.registry.ts:14,118-123` |
| Route permission map and `canAccessAdminPath` | `frontend/src/permissions/adminRoutePermissions.ts:19-21,30,40,42,62,126-135,153-161` |
| `AdminRoute` guard | `frontend/src/app/routes/RouteGuards.tsx:88-99` |
| `<Can>` implementation | `frontend/src/permissions/Can.tsx:10-18` |
| `can()` implementation | `frontend/src/hooks/useCan.ts:17-20` |
| Command palette / preview | `frontend/src/components/search/CommandPalette.tsx:46-54`; `frontend/src/components/search/EntityPreview.tsx:44-53` |

### 7.2 Backend

| Claim | Reference |
|---|---|
| RBAC route registrations and guards | `backend/src/modules/rbac/presentation/rbac.routes.ts:5-7,17-18,26-27,34-36,48-50,56,66-68,76` |
| `adminGuard`, `requirePermission`, `requireRole`, `authMiddleware` | `backend/src/shared/middleware/auth.middleware.ts:28-56,63-80,233-254` |
| Strict platform-admin / global-scope predicate | `backend/src/shared/middleware/auth.middleware.ts:82-112`; `backend/src/shared/middleware/org-access.ts:10-24,33-54` |
| `GET /admin/users` handler and service | `backend/src/modules/rbac/presentation/rbac.controller.ts:129-138`; `backend/src/modules/rbac/application/rbac.service.ts:323-332` |
| `GET /admin/users` projected fields and expiry-free role join | `backend/src/modules/rbac/infrastructure/repositories/rbac.repository.ts:394-412` (role join at `:404`) |
| `GET /admin/users/:id` handler and service | `backend/src/modules/rbac/presentation/rbac.controller.ts:140-149`; `backend/src/modules/rbac/application/rbac.service.ts:334-341` |
| Target-user role rows including `expires_at` | `backend/src/modules/rbac/infrastructure/repositories/rbac.repository.ts:272-285` |
| `GET /users/:userId/roles` handler | `backend/src/modules/rbac/presentation/rbac.controller.ts:117-121`; `backend/src/modules/rbac/application/rbac.service.ts:315-317` |
| `GET /auth/me` route, handler and mapped fields | `backend/src/modules/auth/presentation/auth.routes.ts:22`; `backend/src/modules/auth/presentation/auth.controller.ts:222-245`; `backend/src/modules/auth/application/auth.service.ts:756-766,893-947` |
| `GET /my/scopes` returns organisation rows only | `backend/src/modules/rbac/infrastructure/repositories/rbac.repository.ts:320-354` (literal `'organisation'` at `:322`) |
| `GET /my/permissions` projection | `backend/src/modules/rbac/infrastructure/repositories/rbac.repository.ts:499-512` |
| Dashboard aggregate fields | `backend/src/modules/rbac/infrastructure/repositories/rbac.repository.ts:599-632,907-958` |
| CRM customer detail account status | `backend/src/modules/crm/presentation/crm.routes.ts:9-10`; `backend/src/modules/crm/presentation/crm.controller.ts:10-60` |
| `user_roles.expires_at` schema | `database/baseline/001_courtzon_v3.sql:6590-6605` |
| No `platform.admin` boolean returned by any endpoint | repository-wide search of `backend/src`; `platform.admin` appears only as a guard key / permission string (`auth.middleware.ts:79-80`, `org-access.ts:33-54`) |

### 7.3 Documentation

| Claim | Reference |
|---|---|
| Owner-approved six-endpoint selection and E-02 evidence restriction | `docs/release/LIVE_READONLY_GET_ENDPOINT_ALLOWLIST_PROPOSAL_2026-11-19.md` §2.1, §2.3, §4 |
| D-02…D-15 decisions and D-16 PENDING | `docs/release/OWNER_DECISION_RECORD_LIVE_READINESS_REVISION_2026-11-19.md` §3 (D-02 `:67`, D-03 `:68`, D-04 `:69`, D-05 `:70`, D-07 `:72`, D-08 `:73`, D-09 `:74`, D-10 `:75`, D-11 `:76`, D-12 `:77`, D-14 `:79`, D-15 `:80`), §3.1 `:82-91`, §3.2 `:93+` |
| D-04 attribute matrix and blockers | `docs/release/LIVE_READ_ONLY_EXECUTION_READINESS_CHECKLIST_DRAFT_2026-11-19.md` §7 `:203-213`, §8 `:217-229` |
| Historical user 126 creation record | `docs/HANDOVER_CURRENT/48_TEST_IDENTITIES_CREATED.md` §1 `:11`, §2 `:14`, §6 `:30`, §7 `:45,51`, §8 `:53-57`, §18 `:110`, closing block `:117-138` |
| Historical `qa.acc@courtzon.test` attributes | `docs/release/COURTZON_RELEASE_PROGRESS.md` §38.2 `:5200-5208` (`:5207`), §33.7.1 `:4814-4837` (`:4824`, `:4832`, `:4865`) |
| UI role-assignment limitation | `docs/release/COURTZON_LIVE_C7_C12_AUDIT.md` §A14 `:350-377`, §A18.1 `:433-449` |
| Prepared D-04 evidence requirements | `docs/release/D04_IDENTITY_VERIFICATION_PREPARATION_2026-11-19.md` §5, §7 |

---

**STOP.** Neither actor was verified. No endpoint, route, or scenario was executed. No Live system, database, account, role, permission, Docker service, or Git operation was accessed or modified.
