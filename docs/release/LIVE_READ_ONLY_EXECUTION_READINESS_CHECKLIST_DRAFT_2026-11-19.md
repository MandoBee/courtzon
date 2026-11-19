# CourtZon Live — Read-Only Execution Readiness Checklist — DRAFT 2026-11-19

> **DRAFT — NOT SIGNED — NO LIVE EXECUTION AUTHORIZED**
>
> This document is local preparation only. It **grants no authorization** to access Live, to authenticate, to query any database, to run any test, or to execute any scenario. It does not amend or replace any governance record, and it does not sign anything on behalf of the project owner.

| Field | Value |
|---|---|
| Document | `docs/release/LIVE_READ_ONLY_EXECUTION_READINESS_CHECKLIST_DRAFT_2026-11-19.md` |
| Status | **DRAFT — NOT SIGNED — NO LIVE EXECUTION AUTHORIZED** |
| Prepared | 2026-11-19 |
| Prepared by | OpenCode — local documentation and source-code inspection only |
| Repository | `C:\Users\mniaz\Desktop\CourtZon-V2` |
| Branch / expected HEAD | `fix/courtzon-live-phase1` · `f1fc4d60518b63e68834de42071982427913575c` |
| Governing test standard | `docs/release/COURTZON_TEST_CONSTITUTION.md` — **APPROVED v0.5 (2026-11-14)**, especially §3 stop conditions (lines 65–76), §5.2 scenario template (line 201), §5.3 execution order (line 224), §5.5 Transition Gate (lines 246–258) |
| Owner decision baseline | `docs/release/OWNER_DECISION_RECORD_LIVE_READINESS_REVISION_2026-11-19.md` — decisions **D-01…D-15 communicated 2026-11-19**; **D-16 pending final owner signature** |
| Scope of this document | Candidate GET endpoints, data boundaries, evidence storage recommendation, responsibility placeholder, execution-window fields, and remaining blockers for a **future** Live Read-Only wave (UR-03 / UR-07) |
| Data classification | **OWNER-CONFIRMED — TEST DATA:** all data currently displayed in the CourtZon test environment are test records (names, email addresses, booking records, order records, amounts, revenue values) — **not** real customer PII and **not** real financial records. This reflects the owner's confirmation, **not** an independent database audit. |
| D-08 / B-08 endpoint selection | **APPROVED BY OWNER (2026-11-19)** — E-01 INCLUDE; E-02 automatic, HTTP Status + Request ID only, Response Body not retained; E-03 / E-04 / E-05 / E-06 EXCLUDED. See §2.1 and §8. |
| Effect | Records the owner's D-08 endpoint-selection decision only. **No Live access, endpoint execution, scenario execution, gate passage, D-16 signature, or deployment is authorized.** |

---

## Owner-confirmed data classification — test environment

> **OWNER-CONFIRMED (not an independent database audit):** ALL data currently displayed in the CourtZon test environment is **TEST DATA**, not real customer data and not real sensitive personal or financial records. Names, email addresses, booking records, order records, amounts, and revenue values displayed in this environment are **test records**. The owner has confirmed this repeatedly; this document records that confirmation and does **not** challenge, reinterpret, or request confirmation of it again.

Consequences for this document:

1. Responses from the test environment — including E-01 (`GET /admin/dashboard`) and E-02 (`GET /admin/dashboard/trends`) — contain **test records**. They must **not** be described as exposing real customer PII or real sensitive financial records.
2. The separate **D-08** requirement remains fully in force: evidence is limited to the owner-approved fields for each approved endpoint (§2.1, §8). Test-data status does **not** make every field automatically necessary.
3. Existing restrictions are unchanged — GET-only, no mutations, no bulk downloads, no unnecessary record enumeration, no cross-tenant probing, no organisation/branch scope, and no real financial effects (D-01, D-07, D-08, D-14, D-15).
4. This classification introduces **no new restriction and no new approval**. It corrects a data classification only; it does not pass any gate or authorize execution.

---

## Status vocabulary

| Status | Meaning in this document |
|---|---|
| **VERIFIED** | Established from local source code or an existing local governance record at the cited path/line. Not a Live observation. |
| **NOT VERIFIED** | Not established. Current Live state, account availability, or runtime behavior is explicitly unknown and was not checked. |
| **PENDING** | Requires an owner decision, confirmation, or signature before work can proceed. |
| **BLOCKED** | Cannot proceed until every listed prerequisite is satisfied. |

---

## 1. Scope baseline (D-07) and unchanged gate status

**VERIFIED (from owner decision record):** D-07 freezes scope to **Platform / Global only** — no organisation or branch scope, no cross-tenant probing, and no access to other organisations' business data. D-08 freezes data access to GET-only, no mutations, no unnecessary personal or financial data, no bulk downloads, and only data strictly necessary for the approved scenarios, with the **exact allowed GET endpoint list APPROVED by the owner on 2026-11-19** (E-01 INCLUDE; E-02 automatic, HTTP Status + Request ID only, Response Body not retained; E-03 / E-04 / E-05 / E-06 EXCLUDED). The approval covers endpoint selection only and does **not** authorize execution. D-14 withholds write-enabled UAT; D-15 excludes payments, settlements, wallet mutations, refunds, bookings/booking mutations, and all financial/business mutations; D-12 withholds Option A+ deployment to Live.

**Unchanged statuses — recorded, not altered:**

| Item | Status |
|---|---|
| Phase 6 | **5/10** |
| Phase 7 | **10 %** |
| Overall completion | **56 %** |
| UR-03 | **BLOCKED** |
| UR-07 | **BLOCKED** |
| W1 Gate Out | **NOT MET** |
| Constitution §5.5 Transition Gate | **NOT PASSED** |

Owner approval of D-01…D-15 **and of the D-08 endpoint selection** does **not** mean §5.5 has passed, does **not** mark W1 as approved, does **not** substitute for the D-16 signature, and does **not** authorize immediate Live access or endpoint execution.

---

## 2. Candidate GET API endpoints — local source inspection

All routes below are registered on the root Fastify instance via `app.register(rbacRoutes)` (`backend/src/app.ts:563`) and `app.register(authRoutes)` under the corresponding module registration; the frontend API client base URL was **not** verified in this task. Route strings are quoted exactly as registered in source. **No endpoint was called, and no endpoint was executed.** A GET method alone is **not** treated as evidence of safety — data fields and side effects are assessed per row, against the owner-confirmed **test-data** classification above and the independent D-08 minimization requirement.

### 2.1 Endpoints directly implicated by the approved UR-03 / UR-07 scenarios

| # | Method / route | Source file : line | Authorization guard (source) | Purpose | Minimum data returned (from code) | Exposure / side-effect assessment | Status |
|---|---|---|---|---|---|---|---|
| E-01 | `GET /admin/dashboard` | `backend/src/modules/rbac/presentation/rbac.routes.ts:67` → `rbac.controller.ts:397–400` → `rbac.repository.ts:599–632` | `requireRole(['super_admin', 'super-admin'])` — `dashboardGuard`, `rbac.routes.ts:66`; global pre-handler `authMiddleware`, `rbac.routes.ts:7` | Backs UR-03 dashboard visibility and the UR-07 badge surface | **Aggregate-field vs displayed-card distinction (source-verified):** E-01 returns **nine aggregate response fields** — `totalUsers`, `totalOrganisations`, `pendingOrganisations`, `totalBookings`, `todayBookings`, `activeUsersToday`, `totalRevenue`, `totalProducts`, `totalCoaches` (`rbac.repository.ts:627–631`). The frontend renders them as **six KPI cards** — `totalUsers`, `totalOrganisations`, `totalBookings`, `totalRevenue`, `totalProducts`, `totalCoaches` (`AdminDashboard.tsx:73–80`); the other three (`activeUsersToday`, `pendingOrganisations`, `todayBookings`) appear as sub-labels inside three of those cards (`:74–76`), not as separate cards (six-card loading skeleton at `:60`). No row-level user data. | Read-only aggregates of **test data** in the test environment. `totalRevenue` is an aggregate derived from `wallet_transactions` (`rbac.repository.ts:618–620`); it is an owner-confirmed **test** revenue value, not a real financial record. Evidence handling was fixed by the owner's D-08 approval (2026-11-19): HTTP status, request ID and visible UI text only; the response body is not retained and `totalRevenue` is ignored. This is **not** a real-data exposure blocker. No mutation in code. | **VERIFIED** (code; owner-confirmed test-data classification) / endpoint selection **APPROVED** (B-08, 2026-11-19) |
| E-02 | `GET /admin/dashboard/trends` | `backend/src/modules/rbac/presentation/rbac.routes.ts:68` → `rbac.controller.ts:445–448` → `rbac.repository.ts:907–958` | Same `dashboardGuard`, `rbac.routes.ts:66` | Loaded **automatically alongside E-01** by the dashboard page (`frontend/src/pages/admin/AdminDashboard.tsx:35–38`) | **Contains row-level test records**, not only aggregates: `recentActivity.users` = `id, full_name, email, created_at` (limit 5, `rbac.repository.ts:926–928`); `recentActivity.bookings` = `id, booking_type, total_amount, booking_status, created_at, full_name` (limit 5, `:930–934`); `recentActivity.orders` = `id, total, status, created_at, full_name` (limit 5, `:936–940`); plus `revenueTimeline`, `bookingTimeline`, `systemHealth` (`:948–957`). The names, emails, amounts, and totals are **test data in the test environment** per the owner's confirmation — **not real customer PII and not real sensitive financial records**. | Read-only response of **test records**; no mutation in code. It must **not** be described as exposing real customer data or real sensitive financial records. The separate **D-08** requirement was applied to E-02 through the owner's 2026-11-19 decision (B-08, now APPROVED): evidence is limited to HTTP Status and Request ID, and no response-body field is retained. Test-data status does **not** make every field automatically necessary. **Owner decision (2026-11-19):** E-02 is an **automatic request** — record **HTTP Status and Request ID only**; the **Response Body must not be retained, stored, copied into logs/evidence, or otherwise collected for this wave**. The frontend issues E-02 automatically (`AdminDashboard.tsx:35–38`); suppression is **not** proposed and would require a code change that is **NOT AUTHORIZED**. | **VERIFIED** (code; owner-confirmed test-data classification) / endpoint selection **APPROVED** (B-08, 2026-11-19) with body-retention prohibition |
| E-03 | `GET /auth/me` | `backend/src/modules/auth/presentation/auth.routes.ts:22` → `auth.controller.ts:222–245` | Session resolution in handler (`resolveSessionUserId`, `auth.controller.ts:223`); per-route rate limit 30/min (`auth.routes.ts:22`). **No explicit `requireRole`/`requirePermission` pre-handler.** | Candidate only for **owner-controlled identity confirmation** (which account the session belongs to). Not a UR-03/UR-07 scenario endpoint. | `{ user }` from `authService.getProfile(userId)` (`auth.controller.ts:243–244`). Exact profile fields **NOT VERIFIED** from the inspected handler; the profile may contain personal data. | Read-only. Returns `{ user: null }` when no valid session (`auth.controller.ts:237, 241`). Must **not** be used to discover, extract, or inspect credentials/tokens. Exposure scope beyond the handler is **NOT VERIFIED**. | **EXCLUDED** — owner decision 2026-11-19 (not in this wave); data fields remain **NOT VERIFIED**; D-04/D-05 owner-controlled method only |
| E-04 | `GET /my/permissions` | `backend/src/modules/rbac/presentation/rbac.routes.ts:76` → `rbac.controller.ts:414–418` | Any authenticated user (global `authMiddleware`, `rbac.routes.ts:7`); no role/permission pre-handler | Candidate for confirming the negative actor's effective permission set without enumerating other users | Permission keys for the **current** user only (`rbac.controller.ts:415–417`). No third-party data. | Read-only, actor-scoped. No cross-tenant exposure in code. Side effects: none in code. | **VERIFIED** (code) / **EXCLUDED — owner decision 2026-11-19 (not in this wave)** |
| E-05 | `GET /my/scopes` | `backend/src/modules/rbac/presentation/rbac.routes.ts:56` → `rbac.controller.ts:123–127` | Any authenticated user (global `authMiddleware`, `rbac.routes.ts:7`); no role/permission pre-handler | Candidate for **D-04 global-platform-scope verification** of the session actor | Scope rows for the **current** user only (`rbac.controller.ts:124–126`). Exact field set **NOT VERIFIED** from the handler alone. | Read-only, actor-scoped. Must be driven by an **owner-controlled method**; no DB/Live access in this task. | **EXCLUDED — owner decision 2026-11-19 (not in this wave)**; data fields **NOT VERIFIED**; D-04 verification **PENDING** |
| E-06 | `GET /users/:userId/roles` | `backend/src/modules/rbac/presentation/rbac.routes.ts:50` → `rbac.controller.ts:117–121` → `rbac.repository.ts:272–285` | `superAdminGuard` = `requireRole(['super_admin','super-admin'])` (`rbac.routes.ts:5, 50`) | Candidate for **D-04 active-role and expiry verification** of user 126 | Active, unexpired roles joined to `roles` and organisations (`rbac.repository.ts:274–281`): `ur.*`, `role_name`, `role_slug`, `is_system`, `organisation_id`, `organisation_name`. The query filters `ur.is_active = TRUE`, unexpired `expires_at`, `r.is_active = TRUE`, `r.deleted_at IS NULL` (`:279–281`). | Read-only. **Two flags:** (1) it requires a **super_admin caller**, so using the positive actor to verify itself is circular — an owner-controlled method is required; (2) `ur.*` may include administrative metadata beyond role identity — exact returned columns **NOT VERIFIED** beyond the SQL projection. | **EXCLUDED — owner decision 2026-11-19 (not in this wave)**; **VERIFIED** (filter logic); D-04 method **PENDING** |

### 2.2 Endpoints whose exposure is undefined or out of scope

| # | Route family | Source | Assessment | Status |
|---|---|---|---|---|
| E-07 | `GET /admin/organisations` | `backend/src/modules/financial/presentation/financial-admin.routes.ts:10` | Guarded by `authMiddleware` + `requirePermission(['financial.view'])` (`:6–7`). It returns organisation data and is **out of scope under D-07** (no organisation scope / no other-organisation data). **Excluded** from the candidate set. | **EXCLUDED — PENDING** owner confirmation |
| E-08 | `GET /admin/bookings`, `/admin/inventory/*`, `/admin/users`, `/admin/roles`, `/permission-modules`, `/permissions`, `/roles/:id`, `/feature-flags`, `/player-levels`, `/ui-permissions` | `booking.routes.ts:20`; `inventory.routes.ts:60,84,92,95,100`; `rbac.routes.ts:10,11,17,18,26–39,50,53,59,71` | Guards vary (`requirePermission`, `adminGuard`, `superAdminGuard`, none) and several return paged or row-level business/personal data. **Not approved for this wave** by D-06; exact data exposure **NOT VERIFIED** for all of them. Any future inclusion requires a specific D-08 endpoint freeze and a fresh owner decision. | **NOT VERIFIED / NOT IN SCOPE** |
| E-09 | Any mutations (`POST`/`PUT`/`PATCH`/`DELETE`) — e.g. `POST /user-roles`, `PUT /roles/:id/permissions`, `POST /ui-permissions/sync`, `PATCH /feature-flags/:id/toggle` | `rbac.routes.ts:12–14,19–24,28,37,41–49,60–63,72–73` | Explicitly **prohibited** by D-01, D-08, D-14 and D-15. | **PROHIBITED** |

### 2.3 Frontend routes are NOT API endpoints

The direct-navigation scenarios in D-06 are **frontend route** assertions, not backend API calls. They are resolved by the client-side predicate `canAccessAdminPath` in `frontend/src/permissions/adminRoutePermissions.ts:153–161`: it denies `accountant` on deny-listed prefixes (`:158`) and otherwise requires a mapped permission key (`:159–160`). Unmapped paths return `null` from `getAdminRoutePermission` (`:126–135`) and are **denied fail-closed** (`:150–160`). The landing route `''` maps to `platform.admin` (`:14`).

| Frontend route (client-side) | Purpose in approved scenarios | Governing client guard | Status |
|---|---|---|---|
| `/admin/dashboard` | UR-03-01 visibility, UR-07-01 badge | `platform.admin` (`:14`); page invokes E-01 + E-02 (`AdminDashboard.tsx:30–38`) | **VERIFIED** (code) / execution **BLOCKED** |
| `/admin/organisations`, `/admin/users`, `/admin/roles`, `/admin/reports`, `/admin/unified-settlements`, `/admin/reception`, `/admin/subscription`, `/admin/audit-logs`, `/admin/organisations/new` | Quick Actions / Action Center entries (`AdminDashboard.tsx:87–94, 147–154`) | Route map `:15–50, 81` + `canAccess` filter (`:95–97`, `ActionCenter.tsx:35–37, 80–82`) | **VERIFIED** (code) / execution **BLOCKED** |
| Any unmapped `/admin/*` path | UR-03-06 unknown admin-route denial | Fail-closed `canAccessAdminPath` (`:153–160`) | **VERIFIED** (client code) / **NOT VERIFIED** as backend enforcement |

**Important limitation:** a client-side denial is UX / defence-in-depth. It is **not** proof of backend authorization. Backend enforcement is evidenced only by the API guard responses (e.g. E-01 `dashboardGuard`). Do not claim backend security from a frontend redirect.

---

## 3. Data boundaries

### 3.1 Explicitly allowed minimum data

| # | Allowed item | Basis | Status |
|---|---|---|---|
| A-1 | Aggregate dashboard counters from E-01 **only as approved evidence** — HTTP status, request ID and visible UI text; the response body is not retained and `totalRevenue` is ignored. `totalRevenue` is an owner-confirmed **test** revenue aggregate, not a real financial record. | D-08 minimum-necessary rule; owner-confirmed test-data classification; owner endpoint approval 2026-11-19 (B-08); `rbac.repository.ts:627–631`, `:618–620` | **VERIFIED** (test-data classification) / endpoint selection **APPROVED** (B-08, 2026-11-19) |
| A-2 | ~~The current actor's own permission keys (E-04) and own scopes (E-05), when needed to explain an observed allow/deny~~ — **EXCLUDED from this wave by owner decision (2026-11-19); no such evidence is collected** | D-08; owner endpoint decision; `rbac.controller.ts:414–418, 123–127` | **EXCLUDED — owner decision 2026-11-19** |
| A-3 | ~~E-06 role/expiry fields for user 126~~ — **E-06 EXCLUDED from this wave**; role/expiry verification, if any, must use the owner-controlled D-04 method, **not** an allowlisted endpoint | D-04; owner endpoint decision; `rbac.repository.ts:279–281` | **EXCLUDED (E-06) / D-04 verification NOT VERIFIED** |
| A-4 | HTTP status classification, request ID, and visible UI labels/short badge text for the approved scenarios | D-06, D-09 | **PENDING** owner confirmation of evidence path |

No data outside this list is approved. Any additional GET route requires a new D-08 endpoint freeze and owner approval. E-01 and E-02 responses are **test records** per owner confirmation; their inclusion in the frozen allow-list is **APPROVED by the owner (2026-11-19, B-08)**. E-01 evidence is limited to status/request ID/visible UI text with no body retention; E-02 evidence is limited to HTTP Status and Request ID with the Response Body not retained. E-03/E-04/E-05/E-06 are **EXCLUDED from this wave**.

### 3.2 Explicitly prohibited data

| # | Prohibited item | Basis | Status |
|---|---|---|---|
| P-1 | **Real customer personal data / real PII.** Names, emails and record fields displayed in this test environment are **TEST DATA** per owner confirmation (E-02 test rows: `rbac.repository.ts:926–940`) and are **not** classified as real customer PII; this row does not prohibit viewing them in the approved scenarios. Bulk enumeration and unnecessary exposure remain restricted by D-08. | D-08; owner-confirmed test-data classification | **PROHIBITED (real customer PII only)** — no test-data blocker |
| P-2 | **Real financial records and real financial effects.** Amounts, totals and revenue values displayed in this test environment are **TEST DATA**, not real financial records (E-02: `rbac.repository.ts:931–939`; E-01: `:618–620`). Mutations and real financial effects remain prohibited by D-15. | D-08, D-15; owner-confirmed test-data classification | **PROHIBITED (real financial records/mutations only)**; test-value handling fixed by owner approval 2026-11-19 (B-08): E-01 body not retained, E-02 body prohibited |
| P-3 | Payments, settlements, refunds, wallet mutations, bookings and booking mutations, and **all** financial/business mutations | D-15 | **PROHIBITED** |
| P-4 | Cross-tenant data, organisation-scoped or branch-scoped business data, and any probing of other tenants' IDs | D-07; Constitution §3 stop condition (`:71`) | **PROHIBITED** |
| P-5 | Bulk exports, bulk downloads, paginated enumeration of users/bookings/orders, or unnecessary record listing | D-08 | **PROHIBITED** |
| P-6 | Credentials, passwords, OTPs, cookies, session tokens, or secrets — discovery, extraction, storage, or bypass | D-04, D-05 | **PROHIBITED** |
| P-7 | Any state-changing operation, account/role/permission change, deployment, migration, seed, or SQL | D-01, D-12, D-14 | **PROHIBITED** |

### 3.3 Data-boundary status — former exposure blocker removed

**REMOVED — former blocker B-09.** The former blocker was based **solely** on the mistaken assumption that `GET /admin/dashboard/trends` (E-02) returned real sensitive personal/financial records. The owner has explicitly and repeatedly confirmed that all data displayed in the CourtZon test environment is **TEST DATA** — names, emails, booking/order records, amounts, and revenue values are test records, **not** real customer PII and **not** real sensitive financial records. That assumption is therefore incorrect, and the blocker is **removed**. It is not challenged, reinterpreted, or re-requested here.

**D-08 field minimization — RESOLVED for the approved endpoints by owner decision (2026-11-19, B-08).** D-08 requires that only data strictly necessary for the approved scenarios be inspected. The owner approved the exact endpoint selection and fixed the evidence handling: **E-01** — HTTP status, request ID and visible UI text only, response body not retained; **E-02** — HTTP Status and Request ID only, with the Response Body **not retained, stored, copied into logs/evidence, or otherwise collected**. E-03/E-04/E-05/E-06 are **EXCLUDED from this wave**, so no evidence is taken from them. Test-data status does **not** make every field automatically necessary. No new restriction is introduced: GET-only, no mutations, no bulk downloads, no unnecessary record enumeration, no cross-tenant probing, and no other-organisation data remain in force.

**No gate or scenario status changes.** UR-03 and UR-07 remain **BLOCKED** for their other, independent prerequisites (§8). Removal of this blocker does not unblock either defect, authorize execution, or mark §5.5 as passed.

---

## 4. Evidence storage — recommendation only

**PENDING — AWAITING OWNER CONFIRMATION.** No evidence directory or evidence file was created in this task.

Recommended repository-relative directory:

`docs/evidence/live-readonly-2026-11-19/`

| Aspect | Recommendation | Status |
|---|---|---|
| Path | `docs/evidence/live-readonly-2026-11-19/` — dedicated, wave-specific, repository-relative. **Not created.** | **PENDING** owner confirmation |
| Naming | `<scenario-id>__<actor-short-label>__<UTC-timestamp>__<artifact-type>.<ext>` — e.g. `UR-03-01__user126__20261119T120000Z__dashboard.png`. Use scenario IDs from the revision document §6; use short actor labels, never emails or real names in filenames. | **PENDING** |
| Timestamps | ISO-8601 UTC (`YYYYMMDDTHHMMSSZ`) in filenames; record collection time in UTC in the scenario evidence log. Do not use local time. | **PENDING** |
| Capture method | Only D-09 methods: screenshots, accessibility snapshots, HTTP status classification, and request IDs. **No** cookie/token/header capture, no network-body dumps containing real personal data or secrets. For **E-02**, the owner approved **HTTP Status and Request ID only** — the Response Body must **not** be retained, stored, copied into logs/evidence, or otherwise collected; the request itself is automatic and cannot be suppressed without an unauthorised code change. Test-record fields are still minimized to scenario relevance (D-08). | **VERIFIED** (decision; owner approval 2026-11-19) |
| Redaction | Before storage, redact **real** personal data, credentials, cookies, tokens, and secrets from every artifact — directly implements D-09 and the Constitution §3 real-PII stop condition (`:69`). Names, emails, and amounts in test rows are **test data** per owner confirmation and are not real customer PII; still keep evidence limited to scenario-relevant fields (D-08). | **VERIFIED** (D-09 requirement) / endpoint evidence handling **APPROVED** (B-08, 2026-11-19) |
| Access | Restrict to the authorization/decision chain: project owner, OpenCode technical lead, ChatGPT governance reviewer (D-10). Do not commit evidence containing unredacted **real** personal data or secrets. | **PENDING** |
| Retention | Retain only for the duration of this governance wave plus the audit window defined by the owner; delete or archive per owner instruction. No retention period is invented here. | **PENDING** |
| Authorization | This section **grants no authorization**. The D-08 endpoint selection is **APPROVED**, but that approval is **not** authorization to execute any endpoint or collect evidence. Evidence collection may occur only after D-16 signature, D-04 verification, D-11 window, §5.5 readiness, and D-09 path confirmation. | **VERIFIED** |

---

## 5. Backup owner

| Role | Value | Status |
|---|---|---|
| Responsible roles (from D-10) | OpenCode — technical preparation and execution of permitted tasks; Project owner — authorization, identity control and decisions; ChatGPT — review of reports and governance compliance | **VERIFIED** (decision) |
| Named backup person | — | **PENDING** — no person is invented or nominated. Owner to supply. |

---

## 6. Execution window and stop conditions

### 6.1 Execution window

| Field | Value |
|---|---|
| Planned start (UTC) | `____________________` — **PENDING** |
| Planned end (UTC) | `____________________` — **PENDING** |
| Decision reference | D-11 — **APPROVED IN PRINCIPLE; EXECUTION WINDOW PENDING** |

No date or time is selected or invented. A final UTC start/end and stop conditions are required before Live execution (D-11).

### 6.2 Proposed stop conditions (grounded in Constitution §3 lines 65–76 and D-01…D-15)

On any of the following, **stop immediately**, end the current wave, and report status:

1. Any unexpected connection to a production host, or any navigation/API call outside the frozen allow-list.
2. Any unapproved write or state change of any kind (D-01, D-08, D-14).
3. Any real financial effect or any payment/settlement/wallet/refund/booking mutation (D-15).
4. Any **real** personal data or secret appearing in evidence, logs, or filenames — real-PII leakage (D-09; Constitution `:69`). Names/emails in test rows are test data per owner confirmation; credentials, cookies, tokens, and secrets remain prohibited regardless (D-05, D-09).
5. Any repeated 5xx error or service disruption (Constitution `:70`).
6. Any cross-tenant access or data leakage, including organisation/branch isolation failure (D-07; Constitution `:71`).
7. Any unauthorized privilege escalation or guard bypass — including reaching an action/data item without the actual permission (Constitution `:72`); never weaken `requireRole(['super_admin','super-admin'])`.
8. Any data corruption, loss, or material inconsistency (Constitution `:73`).
9. Any requirement for human authentication, OTP, credential entry, or session creation — **per D-05, stop and request the owner's intervention**; never discover, extract, store, or bypass credentials or OTP.
10. Any attempt to verify user 126's availability/roles/expiry/scope by database access or Live inspection rather than the owner-controlled method (D-04).
11. Discovery that the deployed Live bundle differs from the inspected source (D-12: Option A+ deployment to Live is **NOT AUTHORIZED**; Live bundle state **NOT VERIFIED**).
12. Any scenario not frozen in the owner decision revision §6, or any scenario whose expected side effects/rollback are not recorded as `N/A` under §5.2.

Escalation after a stop follows Constitution §3 (`:75–76`): halt, report status, await owner decision. No implicit W1 → write-enabled transition (Constitution §5.3/§5.5, D-14).

---

## 7. D-04 identity verification — NOT VERIFIED

| Attribute for `TEST_SUPERADMIN` / user 126 | Current state | Method restriction |
|---|---|---|
| Current availability (account active, session possible) | **NOT VERIFIED** | Owner-controlled method only; no DB, no Live, no login |
| Active roles | **NOT VERIFIED** | As above |
| Role expiry status | **NOT VERIFIED** | As above |
| Global platform scope | **NOT VERIFIED** | As above |
| Credentials / OTP | **NOT ACCESSIBLE — PROHIBITED** | D-04, D-05 |

Historical documentation records `player` + `super_admin` and global scope (`docs/HANDOVER_CURRENT/48_TEST_IDENTITIES_CREATED.md` §6–§8), but **historical records are not current proof**. No database was accessed, no Live request was made, and no authentication was attempted. E-03/E-05/E-06 are **EXCLUDED from this wave by owner decision (2026-11-19)** and are not to be used as verification mechanisms; D-04 verification must be owner-controlled. None was used.

---

## 8. Outstanding owner decisions and verification blockers

| # | Blocker | Status | Owner action required |
|---|---|---|---|
| B-01 | D-16 final signature — Decision ID | **PENDING** | Owner supplies decision ID |
| B-02 | D-16 effective date/time (UTC) | **PENDING** | Owner supplies UTC timestamp |
| B-03 | D-16 owner signature / initials | **PENDING** | Owner signs; OpenCode does not sign |
| B-04 | D-16 final owner confirmation | **PENDING** | Owner confirms |
| B-05 | W1 output explicitly approved and recorded | **PENDING** | Owner records explicit W1 approval (Constitution §5.5 item 1; W1 Gate Out **NOT MET**) |
| B-06 | D-04 verification of user 126 (availability / active roles / expiry / global scope) | **NOT VERIFIED** | Owner-controlled verification; no credential/OTP discovery |
| B-07 | Availability of `qa.acc@courtzon.test` | **NOT VERIFIED** | Owner-controlled confirmation |
| B-08 | D-08 GET endpoint selection (E-01…E-06) and approved evidence handling | **APPROVED — owner decision 2026-11-19** (no longer pending) | None for endpoint selection. E-01: status/request ID/visible UI text only; E-02: HTTP Status + Request ID only, Response Body not retained; E-03/E-04/E-05/E-06 EXCLUDED. All other blockers in this table remain. |
| B-09 | ~~E-02 trends endpoint PII/financial exposure conflict~~ — **REMOVED**: former blocker based solely on the mistaken real-sensitive-record assumption; E-02 returns owner-confirmed **test data** | **REMOVED — no longer a blocker** | None; D-08 evidence handling was fixed by the owner's 2026-11-19 approval (B-08, now closed for endpoint selection) |
| B-10 | D-09 exact evidence storage path confirmation | **PENDING** | Owner confirms or replaces recommended path |
| B-11 | Backup person | **PENDING** | Owner supplies (no invention) |
| B-12 | D-11 final UTC window and stop conditions | **PENDING** | Owner sets window; stop conditions proposed in §6.2 |
| B-13 | §5.5 Transition Gate approval record (who / when / scope) | **NOT PASSED** | Owner completes gate; no implicit transition |
| B-14 | UR-03 / UR-07 unblock | **BLOCKED** | Requires B-01…B-07 and B-10…B-13 satisfied (B-08 endpoint selection **APPROVED**; B-09 removed); no dashboard-capable partial-permission actor is documented; Quick Actions / Action Center filtering for restricted actors remains **BLOCKED** for Live evidence. Removal of B-09 does not unblock either defect. |
| B-15 | Backend dashboard guard preservation | **VERIFIED** | Must remain `requireRole(['super_admin','super-admin'])` (`rbac.routes.ts:66`); no bypass, no new actor |
| B-16 | Option A+ Live deployment (D-12) / write-enabled UAT (D-14) | **NOT AUTHORIZED** | Separate explicit decisions required |

---

## 9. Source files inspected (local, read-only)

| Source | Use / cited lines |
|---|---|
| `docs/release/COURTZON_TEST_CONSTITUTION.md` | v0.5 header `:1–9`; stop conditions `:65–76`; §5.2 `:201`; §5.3 `:224–226`; §5.5 `:246–258`; approval block `:491–516` |
| `docs/release/OWNER_DECISION_RECORD_LIVE_READINESS_REVISION_2026-11-19.md` | D-01…D-16 decisions, scenario matrix §6, unchanged statuses §1 |
| `docs/release/W1_READONLY_DISCOVERY_REPORT_2026-11-14.md` | W1 Gate Out **NOT MET** (referenced from revision record) |
| `docs/HANDOVER_CURRENT/48_TEST_IDENTITIES_CREATED.md` | Historical TEST_* roles/scopes (referenced; not re-opened in this task) |
| `backend/src/app.ts` | `app.register(rbacRoutes)` — `:563` |
| `backend/src/modules/rbac/presentation/rbac.routes.ts` | Guards and routes `:5`, `:7`, `:10–18`, `:26–56`, `:65–76` |
| `backend/src/modules/rbac/presentation/rbac.controller.ts` | Handlers `:117–127`, `:397–400`, `:414–418`, `:445–448` |
| `backend/src/modules/rbac/application/rbac.service.ts` | `getDashboardStats` `:598–599`; `getDashboardTrends` `:602–603`; `getUserRoles` `:315–316` |
| `backend/src/modules/rbac/infrastructure/repositories/rbac.repository.ts` | `getDashboardStats` `:599–632`; `getUserRoles` `:272–285`; `getDashboardTrends` `:907–958` |
| `backend/src/modules/auth/presentation/auth.routes.ts` | `GET /auth/me` `:22` |
| `backend/src/modules/auth/presentation/auth.controller.ts` | `meHandler` `:222–245` |
| `backend/src/modules/financial/presentation/financial-admin.routes.ts` | `GET /admin/organisations` and guards `:5–10` |
| `frontend/src/pages/admin/AdminDashboard.tsx` | Query calls `:30–38`; early error return `:40–50`; Quick Actions `:87–97`; badge `:112–119`; Action Center `:146–154` |
| `frontend/src/components/dashboard/ActionCenter.tsx` | `canAccess`/`can` filters `:33–37`, `:78–82` |
| `frontend/src/permissions/adminRoutePermissions.ts` | Route map `:11–104`; deny-list `:106–120`; resolver `:126–140`; fail-closed guard `:142–161` |

No other files were opened or modified in this correction.

---

## 10. Preservation and authorization statement

This document, the owner decision revision (new §3.2) and the allowlist proposal (§4 and related sections) were updated in this synchronization **only** to record the owner's explicit D-08 endpoint-selection approval of 2026-11-19. The earlier correction in this document recorded the owner's confirmation that all data displayed in the test environment is **TEST DATA** and removed the former blocker based on the incorrect real-sensitive-record assumption. The original owner decision draft, `COURTZON_RELEASE_PROGRESS.md`, all historical governance/evidence records, all source files, and `opencode.json` were **not modified**. No Live website access, browser navigation, login, session creation, OTP or credential discovery, database connection or query, SQL/migration/seed/backup, test or simulation, Docker operation, Git operation, deployment, endpoint execution, evidence directory, or evidence file occurred.

The owner's D-08 endpoint-selection approval is now recorded; it grants **no** authorization to access Live, execute any endpoint, or run any scenario. It does **not** constitute D-16 signature, W1 approval, or §5.5 passage. All governance statuses in §1 remain unchanged, and all non-endpoint blockers in §8 remain open. This document remains **DRAFT — NOT SIGNED — NO LIVE EXECUTION AUTHORIZED** until the owner completes D-16 and every prerequisite in §8 is satisfied.

---

**DRAFT — NOT SIGNED — NO LIVE EXECUTION AUTHORIZED**
