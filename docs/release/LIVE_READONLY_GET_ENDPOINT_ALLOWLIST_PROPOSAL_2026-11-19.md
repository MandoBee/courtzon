# CourtZon Live — Read-Only GET Endpoint Allowlist Proposal — DRAFT 2026-11-19

> **OWNER-APPROVED ENDPOINT SELECTION (2026-11-19) — DRAFT — NOT SIGNED — NO LIVE EXECUTION AUTHORIZED**
>
> The owner has explicitly approved the exact endpoint selection recorded in §4: **E-01 INCLUDE**; **E-02 automatic request — HTTP Status and Request ID only, Response Body not retained**; **E-03 / E-04 / E-05 / E-06 EXCLUDED**. This document records that approval. It **grants no authorization** to access the Live environment, to execute any endpoint, to authenticate, to query any database, to run any test, or to execute any scenario. It does not sign any governance record: **D-16 remains PENDING** and **Constitution §5.5 remains NOT PASSED**.

| Field | Value |
|---|---|
| Document | `docs/release/LIVE_READONLY_GET_ENDPOINT_ALLOWLIST_PROPOSAL_2026-11-19.md` |
| Status | **ENDPOINT SELECTION APPROVED BY OWNER (2026-11-19) — DRAFT — NOT SIGNED — NO LIVE EXECUTION AUTHORIZED** |
| Approval scope | **Endpoint selection only (D-08 / B-08).** No endpoint execution, no Live access, no D-16 signature, no W1 approval, and no §5.5 passage. |
| Prepared | 2026-11-19 |
| Prepared by | OpenCode — local source-code inspection only |
| Repository | `C:\Users\mniaz\Desktop\CourtZon-V2` |
| Branch / expected HEAD | `fix/courtzon-live-phase1` · `f1fc4d60518b63e68834de42071982427913575c` |
| Review method | Read-only inspection of route registration, controller handlers, service/repository projections, and frontend usage. **No endpoint was called; no scenario was executed.** |
| Governing source documents | `LIVE_READ_ONLY_EXECUTION_READINESS_CHECKLIST_DRAFT_2026-11-19.md`; `OWNER_DECISION_RECORD_LIVE_READINESS_REVISION_2026-11-19.md`; `COURTZON_TEST_CONSTITUTION.md` |

---

## 1. Purpose and non-authorization statement

The purpose of this document is to propose a **precise, minimal GET endpoint allowlist** for the future, conditional Live Read-Only UAT wave covering UR-03 and UR-07. It reviews the six candidates E-01…E-06 recorded in the readiness checklist and determines, from source code only, which endpoints are genuinely required, which are optional, and which should be excluded.

This document is **not** an authorization record:

- **No Live access, browser navigation, login, session creation, OTP handling, credential discovery, or token/cookie inspection** was performed or is authorized by it.
- **No database connection, query, migration, seed, or backup** was performed or is authorized by it.
- **No test, simulation, Docker operation, Git operation, deployment, source-code change, or evidence file/folder creation** was performed or is authorized by it.
- **The owner's endpoint selection is recorded in §4.** The companion readiness checklist and owner decision revision were updated **only** to record that same decision. The original decision draft, `COURTZON_RELEASE_PROGRESS.md`, `COURTZON_TEST_CONSTITUTION.md`, all historical evidence and all source files were **not** amended.
- Conclusions that cannot be established from source code are marked **NOT VERIFIED** rather than assumed.

---

## 2. Scope and governing decisions

### 2.1 Governing decisions applied

| Decision | Requirement applied in this review |
|---|---|
| **D-01** | A future **conditional** Live Read-Only wave for UR-03 / UR-07 only; no writes, no deployment; not immediately executable. |
| **D-05** | Permitted automation is technical analysis only. Human authentication, identity, and OTP remain with the owner; credentials, cookies, tokens, and secrets are never discovered, extracted, stored, or bypassed. |
| **D-06** | Approved scenarios: UR-03 dashboard visibility, Quick Actions, Action Center, direct-navigation denial, unknown admin-route denial; UR-07 multi-role badge for user 126; negative checks via `qa.acc@courtzon.test`. No writes. |
| **D-07** | Platform / Global scope only. No organisation or branch scope, no cross-tenant probing, and no other-organisation business data. |
| **D-08** | **GET-only**, no mutations, no bulk downloads, no unnecessary personal or financial data access, and **only data strictly necessary for the approved scenarios**. **The exact allowed endpoint selection was documented and approved by the owner on 2026-11-19 (§4)**; E-02 is an automatic request with status/request-ID evidence only and no Response Body retention. |
| **D-09** | Evidence limited to screenshots, accessibility snapshots, HTTP status classification, and request IDs, with redaction; exact storage path still pending. |
| **D-14 / D-15** | Write-enabled UAT not authorized; payments, settlements, wallet mutations, refunds, bookings, and all financial/business mutations are excluded. |
| **D-16** | Final signature, decision ID, effective UTC time, and confirmation remain **PENDING**. |

### 2.2 Owner-confirmed data classification (recorded, not re-opened)

The owner has explicitly and repeatedly confirmed that **all data currently displayed in the CourtZon test environment is TEST DATA**, including names, email addresses, booking and order records, amounts, and revenue values. These are **test records — not real customer PII and not real financial records**. This document records that confirmation; it does **not** challenge, reinterpret, or request confirmation of it again.

That classification does **not** weaken **D-08**. Test-data status does not make every response field automatically necessary. Each field below was assessed for strict necessity against the approved scenarios in §3; **the owner fixed the permitted evidence for the approved endpoints on 2026-11-19 (§4)**, so no further field-level approval is pending for this wave.

### 2.3 Governance states — recorded (D-08 endpoint-selection status corrected to owner approval)

| Item | State |
|---|---|
| Overall completion | **56%** |
| Phase 6 | **5/10** |
| Phase 7 | **10%** |
| UR-03 | **BLOCKED** |
| UR-07 | **BLOCKED** |
| W1 Gate Out | **NOT MET** |
| Constitution §5.5 Transition Gate | **NOT PASSED** |
| D-16 | **PENDING** |
| D-04 identity verification | **NOT VERIFIED** |
| D-08 endpoint selection / B-08 allowlist | **APPROVED — OWNER APPROVED 2026-11-19** (§4; checklist B-08). Only the endpoint selection is approved — see the D-08 status clarification below for still-outstanding execution prerequisites. |
| D-09 evidence path | **PENDING** |
| Backup person | **PENDING** |
| D-11 execution window | **PENDING** |
| Option A+ Live deployment | **NOT AUTHORIZED** |
| Write-enabled UAT | **NOT AUTHORIZED** |

**D-08 status clarification.** The **D-08 endpoint selection / B-08 allowlist** is **APPROVED — OWNER APPROVED 2026-11-19** (§4). This does **not** mean all D-08 requirements are complete: separate execution prerequisites remain outstanding — **D-04 identity verification NOT VERIFIED**, **D-09 evidence path PENDING**, **D-11 execution window PENDING**, and backup person **PENDING**. **D-16** final signature and effective-time record remain **PENDING** (no Decision ID, signature, initials or UTC timestamp is invented), **W1 Gate Out NOT MET**, and **Constitution §5.5 NOT PASSED**. No endpoint or scenario has been executed, and approval of the list grants **no** Live access or execution authorization.

No scenario is marked executed and no gate is marked passed by this proposal.

---

## 3. Endpoint-by-endpoint assessment

Assessment legend: **essential** = the assertion cannot be evidenced without it; **optional** = useful supporting evidence; **redundant** = the same evidence is available elsewhere; **unnecessary** = not needed for any approved scenario. Recommendations in this section are the original **INCLUDE / EXCLUDE / CONDITIONAL** analysis. **The owner's final decisions are recorded in §4 and supersede every CONDITIONAL suggestion below** — E-04 and E-05 are EXCLUDED from this wave, and E-02's CONDITIONAL status is resolved to APPROVED with the owner's status/request-ID-only restriction.

### 3.1 E-01 — `GET /admin/dashboard`

| # | Analysis item | Finding |
|---|---|---|
| 1 | Method / route | `GET /admin/dashboard` |
| 2 | Source references | `backend/src/modules/rbac/presentation/rbac.routes.ts:67`; controller `backend/src/modules/rbac/presentation/rbac.controller.ts:397–400`; repository `backend/src/modules/rbac/infrastructure/repositories/rbac.repository.ts:599–632` (projection `:627–631`, revenue query `:618–620`); frontend `frontend/src/pages/admin/AdminDashboard.tsx:30–33` |
| 3 | Handler / authorization | `getDashboardStatsHandler` (`rbac.controller.ts:397–400`) → `rbacService.getDashboardStats()` → `rbacRepository.getDashboardStats()`. Global `authMiddleware` (`rbac.routes.ts:7`) plus `dashboardGuard = requireRole(['super_admin','super-admin'])` (`rbac.routes.ts:66`, applied at `:67`). |
| 4 | Scenario support | **UR-03-01** dashboard visibility (positive), **UR-03-03** Quick Actions, **UR-03-04** Action Center (counts), **UR-07-01** badge surface (the page must render for the badge to be observable). |
| 5 | Necessity | **Essential.** The dashboard page's primary query; its result (or error) determines the render / `AdminDataErrorState` path. |
| 6 | Exact response fields (source-verified) | `{ data: { totalUsers, totalOrganisations, pendingOrganisations, totalBookings, todayBookings, activeUsersToday, totalRevenue, totalProducts, totalCoaches } }` (`rbac.repository.ts:627–631`). All are aggregate counts/sums; `totalRevenue` is `SUM(amount)` over `wallet_transactions` (`rbac.repository.ts:618–620`). No row-level user records. |
| 7 | Minimum fields needed | For the approved assertions, the **HTTP status class, request ID, and the fact that the dashboard rendered** are the core evidence. The aggregate values are not themselves assertions; if KPI content is captured, the following source-verified distinction applies. **Aggregate-field vs displayed-card distinction (source-verified):** E-01 returns **nine aggregate response fields** — `totalUsers`, `totalOrganisations`, `pendingOrganisations`, `totalBookings`, `todayBookings`, `activeUsersToday`, `totalRevenue`, `totalProducts`, `totalCoaches` (`rbac.repository.ts:627–631`). The frontend renders them as **six KPI cards** — `totalUsers`, `totalOrganisations`, `totalBookings`, `totalRevenue`, `totalProducts`, `totalCoaches` (`AdminDashboard.tsx:73–80`); the other three (`activeUsersToday`, `pendingOrganisations`, `todayBookings`) appear as sub-labels inside three of those cards (`:74–76`), not as separate cards (six-card loading skeleton at `:60`). No row-level user data. `totalRevenue` is **not needed** for UR-07 or for visibility. |
| 8 | Fields that can be ignored | `totalRevenue` specifically (not required for visibility or badge); and, if status/render evidence is sufficient, all nine numeric values. The **response body need not be retained** for these scenarios. |
| 9 | Actor scope / other users | Not actor-scoped; global aggregates. **Does not expose other users' row-level records.** |
| 10 | Side effects from source | **None identified.** Read-only `COUNT`/`SUM` SELECTs; no `recordAudit` call and no mutation in the handler, service, or repository. |
| 11 | Recommendation | **INCLUDE** — required for the positive dashboard render assertions. Apply D-08: collect status/request ID and visible UI text, not the full body. |
| 12 | Owner decision | **RESOLVED — owner approved E-01 INCLUDE on 2026-11-19**; evidence handling is recorded in §4 (HTTP status, request ID, visible UI text; response body not retained). |

### 3.2 E-02 — `GET /admin/dashboard/trends`

| # | Analysis item | Finding |
|---|---|---|
| 1 | Method / route | `GET /admin/dashboard/trends` |
| 2 | Source references | `backend/src/modules/rbac/presentation/rbac.routes.ts:68`; controller `rbac.controller.ts:445–448`; repository `rbac.repository.ts:907–958` (recent rows `:926–940`, timelines `:911–924`, health `:948–957`); frontend `AdminDashboard.tsx:35–38`, error gate `:40–50`, loading gate `:52` |
| 3 | Handler / authorization | `getDashboardTrendsHandler` (`rbac.controller.ts:445–448`) → `rbacService.getDashboardTrends()` → `rbacRepository.getDashboardTrends()`. Same `dashboardGuard` (`rbac.routes.ts:66`) plus global `authMiddleware` (`:7`). |
| 4 | Scenario support | Indirect. Not asserted by UR-03/UR-07 content, but **automatically requested whenever the dashboard page mounts** (`AdminDashboard.tsx:35–38`), and a trends error produces the same `AdminDataErrorState` early return as an E-01 error (`:40–50`). |
| 5 | Necessity | **Optional for the assertion; unavoidable as a request.** The badge and visibility assertions do not depend on trends fields, but the page cannot complete its loading gate without the trends query resolving (`:52`). |
| 6 | Exact response fields (source-verified) | `{ revenueTimeline, bookingTimeline, recentActivity: { users, bookings, orders }, systemHealth }` (`rbac.repository.ts:948–957`). `recentActivity.users`: `id, full_name, email, created_at` (`:926–928`); `bookings`: `id, booking_type, total_amount, booking_status, created_at, full_name` (`:930–934`); `orders`: `id, total, status, created_at, full_name` (`:936–940`). All are **test records** per the owner's confirmation. |
| 7 | Minimum fields needed | For UR-03/UR-07: **none of the response body fields are needed** — only the HTTP status class and request ID for the automatically issued request. `systemHealth` and the timelines are not asserted by these scenarios. |
| 8 | Fields that can be ignored | **All row-level recent-activity test rows** (`users`, `bookings`, `orders`), both timelines, and `systemHealth`. They must not be collected, logged, or retained as evidence for these scenarios. |
| 9 | Actor scope / other users | **Not actor-scoped.** The recent-activity queries return the most recent records across the whole user base (no `WHERE user_id = ?` filter, `:926–940`); therefore the endpoint **can return other users' test records**, subject only to the `super_admin` guard. This is test data, not real customer data. |
| 10 | Side effects from source | **None identified.** Read-only SELECTs plus `process.uptime()` and `SELECT 1`; no mutation and no `recordAudit` call. |
| 11 | Recommendation | **APPROVED BY OWNER (2026-11-19) as an automatic request.** Record **HTTP Status and Request ID only**. The **Response Body must not be retained, stored, copied into logs/evidence, or otherwise collected for this wave**. It is not required to evidence the badge or dashboard visibility. The frontend issues E-02 automatically (`AdminDashboard.tsx:35–38`); this does **not** imply it can be suppressed. Suppressing it would require a source-code change or dropping the dashboard scenario — **neither is authorized or proposed in this task**. |
| 12 | Owner decision | **RESOLVED — owner fixed the E-02 restriction on 2026-11-19** (§4). No further owner decision is required for E-02 handling; any alternative would require a new decision. |

**Special analysis — E-01 vs E-02 necessity.** Both are fired by the dashboard component on mount via two independent `useQuery` calls (`AdminDashboard.tsx:30–38`). Verification of **dashboard visibility** and the **UR-07 badge** depends on E-01 and on the client-side route/permission predicate; it does **not** depend on trends content. E-02 matters only because its error state participates in the page's error gate (`:41–50`) and its loading state participates in the loading gate (`:52`). A scenario can therefore be verified **without collecting or retaining any E-02 response fields** — evidence is limited to status class, request ID, and the rendered UI. This satisfies D-08 while remaining truthful about the page's real network behavior.

### 3.3 E-03 — `GET /auth/me`

| # | Analysis item | Finding |
|---|---|---|
| 1 | Method / route | `GET /auth/me` |
| 2 | Source references | `backend/src/modules/auth/presentation/auth.routes.ts:22`; controller `backend/src/modules/auth/presentation/auth.controller.ts:222–245`; service `backend/src/modules/auth/application/auth.service.ts:756–766`, projection `:893–947`; frontend API client `frontend/src/services/api.ts:114` |
| 3 | Handler / authorization | `meHandler` (`auth.controller.ts:222–245`). **No explicit `requireRole`/`requirePermission` pre-handler** (`auth.routes.ts:22`); identity is resolved from the session by `resolveSessionUserId` (`:223`), with a refresh-token fallback query (`:225–239`). Per-route rate limit 30/min. |
| 4 | Scenario support | None. Not a UR-03/UR-07 scenario endpoint; at most a session-identity confirmation mechanism. |
| 5 | Necessity | **Unnecessary** for the approved scenarios. The owner can establish actor identity through the already-approved D-04 verification and D-05 owner-controlled authentication method, corroborated by the delivered UI identity/badge, without harvesting this profile. |
| 6 | Exact response fields (source-verified) | `{ user }` (`auth.controller.ts:243–244`) or `{ user: null }` when no valid session (`:237`, `:241`). `mapUserResponse` (`auth.service.ts:912–946`) returns a broad profile including `id, publicId, fullName, email, phoneNumber, fullPhone, gender, birthDate, avatarUrl, languageId, timezone, darkMode, isCoach, coachStatus, isSeller, isPublic, mainSportId, mainLevelId, interestedSportIds, playing_hand, bio, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, emergencyContacts, privacy_*, defaultCurrency, defaultCurrencySymbol, roles, permissions`. These are test-record values in the test environment. |
| 7 | Minimum fields needed | None for the approved assertions. If an owner ever requires session-identity corroboration, only `id` and `roles` would be relevant — but the response shape is fixed by source, so field-level selection is **not available without a code change**, which is not proposed. |
| 8 | Fields that can be ignored | All other fields, especially emergency-contact and profile-privacy fields; the entire body should not be captured as UAT evidence. |
| 9 | Actor scope / other users | **Actor-scoped** — resolves the current session user only. Does not expose other users' records. |
| 10 | Side effects from source | Read-only profile loading; **one auth-housekeeping behavior**: on the no-session path the handler calls `clearAuthCookies(reply)` (`auth.controller.ts:240`), i.e. a response cookie-clearing header, not a business-data mutation. No credential, token, or cookie value was accessed in this review, and none may be inspected during execution (D-05). |
| 11 | Recommendation | **EXCLUDE — owner decision 2026-11-19.** It may occur as normal SPA bootstrap (`api.ts:114`), but it is not a scenario endpoint and its broad profile conflicts with D-08 minimization if captured. |
| 12 | Owner decision | **RESOLVED — owner excluded E-03 on 2026-11-19**; identity is established through D-04/D-05 owner-controlled methods and no `/auth/me` response is collected. |

### 3.4 E-04 — `GET /my/permissions`

| # | Analysis item | Finding |
|---|---|---|
| 1 | Method / route | `GET /my/permissions` |
| 2 | Source references | `backend/src/modules/rbac/presentation/rbac.routes.ts:76`; controller `rbac.controller.ts:414–418`; repository `rbac.repository.ts:499–512` |
| 3 | Handler / authorization | `getMyPermissionsHandler` (`rbac.controller.ts:414–418`) reads `userId` from `(request as any).userId` (`:415`) and calls `getUserPermissionKeys`. Global `authMiddleware` only (`rbac.routes.ts:7`); **any authenticated user**. |
| 4 | Scenario support | Supporting evidence for **UR-03-05 / UR-03-06** negative checks: explains why `qa.acc@courtzon.test` is denied by showing the effective permission keys. Not needed for the positive actor. |
| 5 | Necessity | **Optional** — useful, minimal, and directly relevant to the negative permission assertion; not strictly required because denial is primarily evidenced by the rendered denied surface and client route-map result. |
| 6 | Exact response fields (source-verified) | `{ data: string[] }` — distinct `permission_key` values for the current user (`rbac.repository.ts:499–512`), filtered to active, unexpired role assignments and active, non-deleted roles (`:505–508`). No other fields. |
| 7 | Minimum fields needed | If included: only the presence/absence of the specific permission keys relevant to the tested admin paths; the full key array need not be reproduced in evidence. |
| 8 | Fields that can be ignored | All unrelated permission keys; the complete array need not be copied into evidence artifacts. |
| 9 | Actor scope / other users | **Actor-scoped** — keyed to `(request as any).userId`; no path or query parameter for another user. Does not expose other users' records. |
| 10 | Side effects from source | **None identified.** Read-only SELECT; no mutation and no `recordAudit` call. |
| 11 | Recommendation | **EXCLUDE — owner decision 2026-11-19 (not in this wave).** The earlier CONDITIONAL suggestion is superseded; no permission-key evidence is collected. |
| 12 | Owner decision | **RESOLVED — owner excluded E-04 from this wave on 2026-11-19.** |

### 3.5 E-05 — `GET /my/scopes`

| # | Analysis item | Finding |
|---|---|---|
| 1 | Method / route | `GET /my/scopes` |
| 2 | Source references | `backend/src/modules/rbac/presentation/rbac.routes.ts:56`; controller `rbac.controller.ts:123–127`; service `rbac.service.ts:319–320`; repository `rbac.repository.ts:320–354` |
| 3 | Handler / authorization | `getUserScopesHandler` (`rbac.controller.ts:123–127`) reads the actor from `(request as any).userId` (`:124`) and calls `getUserScopes`. Global `authMiddleware` only (`rbac.routes.ts:7`); **any authenticated user**. |
| 4 | Scenario support | Candidate supporting evidence for the D-04 **scope** attribute of the positive actor; not a UR-03/UR-07 assertion by itself. |
| 5 | Necessity | **Optional**, with an important limitation (see item 11). Useful to show that no organisation scope rows are attached to the actor, but it cannot positively prove a "global" designation. |
| 6 | Exact response fields (source-verified) | `{ data: any[] }` of **organisation scope rows**: `'organisation' AS scope_type`, `o.id AS scope_id`, `o.name`, `o.logo_url`, `o.is_verified`, `o.is_active` (`rbac.repository.ts:322–323`), filtered to ownership or active-role membership with active/unexpired roles (`:326–348`) and ordered by name (`:350`). No explicit `global` flag is returned. |
| 7 | Minimum fields needed | If included: `scope_type` and `scope_id` are sufficient to show the absence of organisation scopes; `name`, `logo_url`, and `is_verified` are not needed for D-04. |
| 8 | Fields that can be ignored | `name`, `logo_url`, `is_verified`, `is_active`; the full row set need not be retained. |
| 9 | Actor scope / other users | **Actor-scoped** — bound to `(request as any).userId` (`rbac.controller.ts:124`); no other-user parameter. Its rows are organisations linked to that actor, not arbitrary third-party records. |
| 10 | Side effects from source | **None identified.** Read-only SELECT; no mutation and no `recordAudit` call. |
| 11 | Recommendation | **EXCLUDE — owner decision 2026-11-19 (not in this wave).** The earlier CONDITIONAL suggestion is superseded; no scope-row evidence is collected. Limitation remains: the endpoint returns only organisation scope rows, and an empty result is not positive proof of global scope. |
| 12 | Owner decision | **RESOLVED — owner excluded E-05 from this wave on 2026-11-19.** D-04 global scope, if required, must be established by owner-controlled means, not from this endpoint. |

### 3.6 E-06 — `GET /users/:userId/roles`

| # | Analysis item | Finding |
|---|---|---|
| 1 | Method / route | `GET /users/:userId/roles` |
| 2 | Source references | `backend/src/modules/rbac/presentation/rbac.routes.ts:5, 50`; controller `rbac.controller.ts:117–121`; service `rbac.service.ts:315–317`; repository `rbac.repository.ts:272–285` |
| 3 | Handler / authorization | `getUserRolesHandler` (`rbac.controller.ts:117–121`) takes `userId` **from the path** (`:118`) and calls `rbacService.getUserRoles(Number(userId))` (`:119`). Guard: `superAdminGuard = requireRole(['super_admin','super-admin'])` (`rbac.routes.ts:5`), applied at `:50`, plus global `authMiddleware` (`:7`). |
| 4 | Scenario support | Candidate for the D-04 **active-role / expiry** attribute of user 126. **Not** needed for the UR-07 badge: the badge reads roles from the auth store (`AdminDashboard.tsx:24`, rendered at `:112–119`), not from this endpoint. |
| 5 | Necessity | **Unnecessary** for the approved scenario assertions. Role/expiry verification belongs to D-04, which requires an owner-controlled method. |
| 6 | Exact response fields (source-verified) | `{ data: [...] }` from `rbac.repository.ts:272–285`: `ur.*` plus `role_name`, `role_slug`, `is_system`, `organisation_id`, `organisation_name` (`:274–275`). Filtered to `ur.is_active = TRUE`, unexpired `expires_at`, active non-deleted roles (`:279–281`). **The exact expansion of `ur.*` is NOT VERIFIED** — the `user_roles` column list was not inspected in this task, so the full returned column set cannot be stated from source here. |
| 7 | Minimum fields needed | If an owner-controlled use is approved: role identity (`role_slug`/`role_name`) and `expires_at`/`is_active` for **user 126 only**. |
| 8 | Fields that can be ignored | `organisation_name`, `logo`-adjacent metadata, and any administrative `ur.*` columns not required for role/expiry confirmation. |
| 9 | Actor scope / other users | **Not actor-scoped.** The `userId` path parameter can target **any** user, so a `super_admin` caller can retrieve other users' role assignments (test data). Under D-07, any use must be restricted to user 126; it must never be used for cross-user probing or by the negative actor (which would receive 403). |
| 10 | Side effects from source | **None identified.** Read-only SELECT; no mutation and no `recordAudit` call. |
| 11 | Recommendation | **EXCLUDE — owner decision 2026-11-19.** Two limitations: (a) **circularity** — it requires a `super_admin` caller, so using the positive actor to verify its own roles is self-attestation, while the negative actor cannot call it at all; (b) it can expose other users' role records and its exact `ur.*` field set is NOT VERIFIED. Role/expiry verification for user 126 should be performed by the owner-controlled D-04 method, restricted to that user ID. |
| 12 | Owner decision | **RESOLVED for the endpoint — owner excluded E-06 on 2026-11-19.** The D-04 role/expiry verification method remains a separate owner-controlled decision (NOT VERIFIED). |

---

## 4. Approved minimal allowlist — owner decision 2026-11-19

The following is the **exact endpoint selection approved by the project owner under D-08 / B-08 on 2026-11-19**. It supersedes all earlier CONDITIONAL or PENDING suggestions in this document.

### 4.1 Approved for this wave

| # | Endpoint | Owner decision | Evidence permitted |
|---|---|---|---|
| E-01 | `GET /admin/dashboard` | **INCLUDE** | HTTP status class, request ID, and visible UI text / rendered dashboard. Aggregate response body fields are **not retained**; `totalRevenue` is ignored. |
| E-02 | `GET /admin/dashboard/trends` | **INCLUDE as an automatic request** | **HTTP Status and Request ID only.** The **Response Body must not be retained, stored, copied into logs/evidence, or otherwise collected for this wave.** The request is issued automatically by the frontend (`AdminDashboard.tsx:35–38`); the decision does **not** imply it can be suppressed. |

### 4.2 Excluded from this wave

| # | Endpoint | Owner decision | Reason in brief |
|---|---|---|---|
| E-03 | `GET /auth/me` | **EXCLUDE** | Not a scenario endpoint; identity via D-04 / D-05. |
| E-04 | `GET /my/permissions` | **EXCLUDE from this wave** | No permission-key evidence collected in this wave; earlier CONDITIONAL suggestion superseded. |
| E-05 | `GET /my/scopes` | **EXCLUDE from this wave** | No scope-row evidence collected in this wave; earlier CONDITIONAL suggestion superseded. |
| E-06 | `GET /users/:userId/roles` | **EXCLUDE** | Super-admin-only, arbitrary `userId`, circular for self-verification; D-04 method owner-controlled. |

**Scope of approval.** The owner approved **endpoint selection only**. It is **not** authorization to execute any endpoint, to access Live, to collect evidence, to sign D-16, to approve W1, or to pass Constitution §5.5. All other blockers in §7 remain open.

---

## 5. Explicitly excluded endpoints and reasons

| Endpoint | Exclusion reason |
|---|---|
| **E-03 `GET /auth/me`** | **Owner EXCLUDE decision 2026-11-19.** Not a scenario endpoint; broad profile (including emergency-contact and privacy fields) is not strictly necessary; actor identity is established by the D-04 verification and D-05 owner-controlled authentication path. Response shape is fixed, so field selection is impossible without a code change, which is not proposed. |
| **E-04 `GET /my/permissions`** | **Owner EXCLUDE from this wave (2026-11-19).** The earlier CONDITIONAL suggestion is superseded; no permission-key evidence is collected. |
| **E-05 `GET /my/scopes`** | **Owner EXCLUDE from this wave (2026-11-19).** The earlier CONDITIONAL suggestion is superseded; no scope-row evidence is collected, and an empty scope result is not proof of global scope. |
| **E-06 `GET /users/:userId/roles`** | **Owner EXCLUDE decision 2026-11-19.** Requires `super_admin`, making self-verification circular and denying the negative actor; accepts an arbitrary `userId`, so it can expose other users' test role records (D-07 concern); exact `ur.*` fields NOT VERIFIED; the UR-07 badge does not use this endpoint. D-04 role/expiry verification must use an owner-controlled method restricted to user 126. |
| **E-02 Response Body (endpoint itself is APPROVED as an automatic request)** | The recent-activity rows (`users`, `bookings`, `orders`), timelines, and `systemHealth` are test records and are **not** asserted by UR-03/UR-07. **Owner restriction (2026-11-19): only HTTP Status and Request ID may be recorded; the Response Body must not be retained, stored, copied into logs/evidence, or otherwise collected for this wave.** The request is issued automatically by the frontend and is **not** treated as suppressible; suppression would require an unapproved code change. |

No other endpoint is proposed. All mutations (`POST`/`PUT`/`PATCH`/`DELETE`) and all out-of-scope GET families in the readiness checklist (§2.2 E-07…E-09) remain excluded or prohibited under D-12, D-14, and D-15.

---

## 6. Scenario-to-endpoint mapping (UR-03 and UR-07)

| Scenario | Actor | Endpoints relevant | Notes |
|---|---|---|---|
| **UR-03-01** dashboard visibility (positive) | User 126 | **E-01** (essential); **E-02** automatic, status only | Badge/visibility evidenced by rendered UI + E-01 status; no trends body retained. E-03 not needed (D-04/D-05 identity). |
| **UR-03-02** dashboard denial (negative) | `qa.acc@courtzon.test` | **E-01** expected denied / error surface; **E-02** automatic request (status/request ID only, no body). **E-04 EXCLUDED** | Denial evidenced by rendered denied/error surface and status class; no token/cookie capture. |
| **UR-03-03** Quick Actions (positive) | User 126 | **E-01** (page render only) | Filtering is client-side via `canAccess`/`canAccessAdminPath`; positive actor has `*` so omission cannot be demonstrated (existing BLOCKED limitation). |
| **UR-03-04** Action Center (positive) | User 126 | **E-01** (counts) | Card visibility is client-side; same filtering limitation as UR-03-03. |
| **UR-03-05** direct-navigation denial (negative) | `qa.acc@courtzon.test` | **E-04 EXCLUDED**; no backend endpoint strictly required | Primarily a frontend route-map assertion (`adminRoutePermissions.ts`); not proof of backend authorization. |
| **UR-03-06** unknown admin-route denial (negative) | `qa.acc@courtzon.test` | No endpoint required | Fail-closed client predicate; depends on deployed bundle (NOT VERIFIED; deployment not authorized). |
| **UR-07-01** multi-role badge (positive) | User 126 | **E-01** (page must render); **E-02** automatic status only | Badge text comes from the auth store roles (`AdminDashboard.tsx:24, 112–119`), not E-06. Active/unexpired roles are a D-04 prerequisite, NOT VERIFIED. |

**Limitation carried forward:** UR-03 Quick Actions / Action Center filtering remains **BLOCKED for Live** — no dashboard-capable partial-permission actor is documented, and the negative actor receives an error surface before the dashboard renders. This proposal does not change that blocker.

---

## 7. Owner decisions — resolved and outstanding

| # | Decision | Status |
|---|---|---|
| O-1 | Approve the D-08 / B-08 endpoint selection. | **RESOLVED — owner approved 2026-11-19** (§4): E-01 INCLUDE; E-02 automatic/status-only; E-03/E-04/E-05/E-06 EXCLUDED. This is endpoint selection only, not execution authorization. |
| O-2 | E-02 observed at status/request-ID level only; no trends body fields retained. | **RESOLVED — owner fixed 2026-11-19**: HTTP Status + Request ID only; Response Body not retained, stored, logged, or collected. |
| O-3 | E-04 and E-05 as optional supporting evidence. | **RESOLVED — both EXCLUDED from this wave by owner 2026-11-19**. |
| O-4 | E-03 excluded; identity from D-04 / D-05 owner-controlled methods. | **RESOLVED — owner excluded E-03 on 2026-11-19**. D-04/D-05 methods remain owner-controlled. |
| O-5 | E-06 excluded; owner-controlled D-04 method for user 126 role/expiry verification. | **RESOLVED for the endpoint — owner excluded E-06 on 2026-11-19**. The D-04 verification method remains a separate owner-controlled item (O-6). |
| O-6 | Verify D-04 attributes for user 126 and availability of `qa.acc@courtzon.test` (owner-controlled; no DB/Live/credential access). | **NOT VERIFIED** |
| O-7 | Confirm D-05 authentication method; no credential, OTP, cookie, or token discovery. | **PENDING** |
| O-8 | Confirm D-09 evidence path and redaction rules; no evidence folder is created by this task. | **PENDING** |
| O-9 | D-16 decision ID, effective UTC time, signature, and final confirmation. | **PENDING** — nothing fabricated by this document. |
| O-10 | D-11 execution window, backup responsibility, and §5.5 / W1 readiness. | **PENDING** — §5.5 NOT PASSED; W1 Gate Out NOT MET. |

The owner's test-data confirmation is **already recorded** and is **not** among the outstanding decisions. The endpoint-selection decisions O-1…O-5 are resolved; all execution prerequisites O-6…O-10 remain open.

---

## 8. Source file references with line numbers

| Reference | Verified content |
|---|---|
| `backend/src/modules/rbac/presentation/rbac.routes.ts:5, 7, 50, 56, 66, 67, 68, 76` | Guards and registration for E-01, E-02, E-04, E-05, E-06; global `authMiddleware` at `:7`; `dashboardGuard` at `:66`; `superAdminGuard` at `:5`. |
| `backend/src/modules/rbac/presentation/rbac.controller.ts:117–127, 397–400, 414–418, 445–448` | Handlers for E-06/E-05, E-01, E-04, E-02. |
| `backend/src/modules/rbac/infrastructure/repositories/rbac.repository.ts:272–285` | E-06 role query and active/unexpired filters. |
| `backend/src/modules/rbac/infrastructure/repositories/rbac.repository.ts:320–354` | E-05 organisation-scope query and returned fields. |
| `backend/src/modules/rbac/infrastructure/repositories/rbac.repository.ts:499–512` | E-04 permission-key query. |
| `backend/src/modules/rbac/infrastructure/repositories/rbac.repository.ts:599–632` | E-01 aggregate counters (`:627–631`) and `totalRevenue` (`:618–620`). |
| `backend/src/modules/rbac/infrastructure/repositories/rbac.repository.ts:907–958` | E-02 timelines, recent-activity test rows (`:926–940`), system health. |
| `backend/src/modules/rbac/application/rbac.service.ts:315–321` | Pass-through services for E-06 roles and E-05 scopes. |
| `backend/src/modules/auth/presentation/auth.routes.ts:22` | E-03 registration, rate limit, no role/permission pre-handler. |
| `backend/src/modules/auth/presentation/auth.controller.ts:222–245` | `meHandler` session resolution, `{ user: null }` paths, `getProfile` call. |
| `backend/src/modules/auth/application/auth.service.ts:756–766, 893–947` | E-03 profile assembly and full field map (`:912–946`). |
| `frontend/src/pages/admin/AdminDashboard.tsx:24, 30–38, 40–52, 112–119` | Automatic E-01/E-02 queries, error/loading gates, badge sourced from auth-store roles. |
| `frontend/src/services/api.ts:114` | Frontend `me()` client binding for `/auth/me`. |
| `frontend/src/permissions/adminRoutePermissions.ts:153–161` (per readiness checklist) | Client-side direct-navigation predicate (frontend route, not an API endpoint). |
| `docs/release/OWNER_DECISION_RECORD_LIVE_READINESS_REVISION_2026-11-19.md:71, 73, 179–185` | D-06, D-08 and the UR-03 / UR-07 scenario matrix used for mapping. |
| `docs/release/LIVE_READ_ONLY_EXECUTION_READINESS_CHECKLIST_DRAFT_2026-11-19.md:75–80, 96–100` | Candidate endpoint table and frontend-route limitation. |

Line references are to the working tree at the expected HEAD `f1fc4d60518b63e68834de42071982427913575c`. No source file was modified.

---

## 9. Final decision and limitations

**Final decision (owner-approved 2026-11-19).** The exact allowlist is fixed in §4: **`GET /admin/dashboard` (E-01) — INCLUDE** as the only deliberate evidence endpoint; **`GET /admin/dashboard/trends` (E-02) — INCLUDE as an automatic request**, recording **HTTP Status and Request ID only** with the **Response Body not retained, stored, copied into logs/evidence, or otherwise collected**; **`GET /auth/me` (E-03) — EXCLUDE**; **`GET /my/permissions` (E-04) and `GET /my/scopes` (E-05) — EXCLUDED from this wave**; **`GET /users/:userId/roles` (E-06) — EXCLUDE**. Identity and role/expiry/global-scope are established through the owner-controlled D-04/D-05 methods, not the excluded endpoints. The earlier CONDITIONAL suggestions for E-02/E-04/E-05 are superseded. This decision covers endpoint selection only and grants **no execution authorization**.

**Limitations.**

- This is a **source-code review only**. No endpoint was called and no scenario was executed. Runtime behavior of the deployed Live bundle is **NOT VERIFIED**, and deployment to Live is **NOT AUTHORIZED** (D-12).
- D-04 attributes for user 126 (availability, active roles, expiry, global scope) and availability of `qa.acc@courtzon.test` are **NOT VERIFIED**.
- The exact expansion of `ur.*` for E-06 is **NOT VERIFIED**; the frontend API base URL and the deployed route registration were **NOT VERIFIED**.
- E-05 returns no explicit global-scope flag; an empty scope array is **not** positive proof of Platform/Global scope.
- UR-03 Quick Actions / Action Center filtering remains **BLOCKED for Live**; this proposal does not supply the missing partial-permission actor.
- All data displayed in the test environment is **owner-confirmed TEST DATA**. That confirmation is recorded and not re-opened; D-08 field minimization for the approved endpoints is **fixed by the owner's 2026-11-19 decision** (§4), with no Response Body retention for E-02 and no evidence from the excluded endpoints.
- All governance states in §2 remain unchanged: **D-16 PENDING**, **§5.5 NOT PASSED**, **W1 Gate Out NOT MET**, **D-04 NOT VERIFIED**, **D-09 PENDING**, backup person **PENDING**, **D-11 PENDING**, **Option A+ NOT AUTHORIZED**, **write-enabled UAT NOT AUTHORIZED**. The document remains **ENDPOINT SELECTION APPROVED BY OWNER (2026-11-19) — DRAFT — NOT SIGNED — NO LIVE EXECUTION AUTHORIZED**.

**STOP.** No endpoint is to be executed and no scenario is to be run on the basis of this document.
