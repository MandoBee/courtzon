# CourtZon E2E Scenario Matrix (P6-02)

| Field | Value |
|---|---|
| Document | `docs/release/E2E_SCENARIO_MATRIX.md` |
| Plan item | **P6-02 — Persist the traceable scenario matrix (role, setup, action, expected, cleanup)** |
| Phase | 6 — Real UI and End-to-End Testing |
| Date | 2026-10-28 (updated 2026-11-02: DB identity and write policy §2.1) |
| Status | **Persisted inventory — execution NOT RUN** |
| Authority | **Scenario authority** for Phase 6 (owner decision 2026-11-03, plan §1.1). Scenarios, safety classes and gating are defined here; every **result** belongs to `COURTZON_RELEASE_PROGRESS.md` and no status is claimed here |
| Inputs (static inspection) | current working tree: `e2e/` specs/pages/fixtures/helpers, `playwright.config.ts`, `e2e/playwright.config.ts`, plan §10/§11, `INTEGRATION_SAFETY_ASSESSMENT.md` |
| Related evidence | P6-01 inventory (progress §8), P6-03 target/safety gates (progress §8), Phase 5 evidence ledger (progress §5W) |

> **What this document is:** the persisted, traceable matrix Phase 6 executes against. It records *what
> exists today*, *what each spec actually does*, *its data-safety class*, and *what is missing*.
>
> **What it is not:** no test was executed to produce it, no result is claimed, and no scenario below is
> `PASS`. Execution results must be added per scenario when P6-04…P6-09 run.

## 1. How to read the matrix

| Field | Meaning |
|---|---|
| **Class R** | Read-only: browser navigation + GET requests only; no DB writes by the test |
| **Class W** | Writes to the **local development database** `courtzon_v3` @ `127.0.0.1:3307` (persistent Docker volume) through fixtures/API. It is **not** an isolated or disposable test environment; a Class W run needs explicit approval naming the local target and the expected tables/impact (Amendment A1). **Never Live.** |
| **Class X** | Depends on a payment gateway; with `PAYMENT_GATEWAY_PROVIDER=paymob` it needs the external Sandbox (P5-05, **DEFERRED**); with `mock` it is UI-only evidence |
| **Class D** | Contains its own destructive SQL (`DELETE`/`TRUNCATE`) → blocked until reviewed/fixed (P7-02) |
| **S** | Stale fixture/incompatibility with current code → cannot pass until updated |
| **Status** | `NOT RUN` · `BLOCKED (<reason>)` · `MISSING` (no spec exists) |

Row IDs are stable: `A*` = P6-04 auth/RBAC, `B*` = P6-05 bookings/clubs, `C*` = P6-06 marketplace/payments,
`D*` = P6-07 notifications/reports/admin, `E*` = P6-08 responsive/a11y, `F*` = P6-09 realtime.

## 2. Environment prerequisites (must be confirmed before any execution)

| Requirement | Current state |
|---|---|
| Frontend + backend running | NOT VERIFIED in this task (no server started) |
| `PLAYWRIGHT_BASE_URL` / `FRONTEND_URL` (default `http://localhost:5173`) | documented (`playwright.config.ts`, `e2e/playwright.config.ts:3–4`) |
| `BACKEND_URL` (default `http://localhost:3000`) | documented (`e2e/helpers/api.ts:1`) |
| Local DB pin | `courtzon_v3` @ `127.0.0.1:3307` — the **local development database** (persistent Docker volume), **not** a test environment. Asserted before connecting (`e2e/helpers/database.ts:23-26`). Same database **name** as Live, different instance |
| Destructive cleanup | defer-only, fail-closed, requires explicit authorization (`database.ts:82–89`); tests never call it |
| Payment provider | Value **UNKNOWN** locally (`.env` not inspected). Class X rows require `mock` for UI-only runs, or the deferred Paymob Sandbox for payment evidence |
| Test data | Fixtures create their own users/orgs/branches/resources; public-tournament rows must already exist for `p0-public-readonly` |
| Browsers | Playwright 1.60 + Chromium 1223 recorded (P1-03); not re-verified here |

**Config ambiguity (risk):** two configs exist — root `playwright.config.ts` (`testDir: './e2e'`, starts a
`webServer` from `./frontend`) and `e2e/playwright.config.ts` (`testDir: './scenarios'`, projects `smoke` +
`critical`, HTML/JUnit/JSON reporters). Run commands must name the config explicitly to avoid different
discovery/web-server behaviour.

**Findings from the 2026-10-28 static listings (`playwright test --list`, no tests executed):**

1. **Missing fixture module — FIXED 2026-10-28.** Seven specs imported `../../fixtures/auth`, but the repository
   only has `e2e/fixtures/auth.fixture.ts`. The imports were corrected to `../../fixtures/auth.fixture` (same
   `test`/`expect` exports and the `authenticatedPlayer`/`authenticatedAdmin` fixtures they already used). Discovery
   now reports **52 tests in 12 files** with no module-load errors. **No test was executed.**
2. **Reporter/output clash — FIXED 2026-10-28 (config-only).** `e2e/playwright.config.ts` kept the HTML report at
   `test-results/e2e/html` while Playwright's default test output folder was the repo-root `test-results`, i.e. the
   report folder was nested inside the output folder that the HTML reporter clears. The config now sets
   `outputDir: '../test-results/e2e/artifacts'` so the two are **siblings** under `test-results/e2e/` (artifacts vs
   html); reporters, projects, `testDir`, `testMatch`, and discovery are unchanged. Discovery with
   `e2e/playwright.config.ts` reports **52 tests in 12 files** and with the root `playwright.config.ts`
   **26 tests in 12 files**, both with **no configuration error** (no tests executed).

### 2.1 Database identity and write policy (canonical)

This section fixes the wording used throughout this matrix. Evidence is recorded in
`COURTZON_RELEASE_PROGRESS.md` §22 (read-only audit, 2026-11-02).

| Item | Canonical statement |
|---|---|
| What `courtzon_v3` is | The **application database name**, used in both environments: local Docker and Hostinger Live. It is **not** the name of a test database. |
| Local instance | `courtzon_v3` @ `127.0.0.1:3307` inside the `courtzon-mysql` container — the **local development database** on a persistent Docker volume. It is **not** an isolated or disposable test environment. |
| Live instance | The Coolify-managed MySQL service `courtzon-db` (`DB_NAME=courtzon_v3`, `DB_USER=courtzon_app`, `COURTZON_MIGRATION_ENV=production`) — a **separate instance** with separate credentials, never a copy of the local database. |
| Why tests use the local instance | The integration/E2E suites are pinned to the local `courtzon_v3` on loopback:3307 and assert that target before connecting (`vitest.integration.setup.ts`, `e2e/helpers/database.ts:23–26`). This is Amendment A1: an accepted risk, not test isolation. |
| Phase 6 test target (current) | Phase 6 uses the **persistent local development database in Docker**, `courtzon_v3` @ `127.0.0.1:3307`. It is **not** an isolated test database and **not** a disposable one. |
| Write approval (Class W / T2) | A write-producing run requires **explicit approval that names the local target** (`courtzon_v3` @ `127.0.0.1:3307`) **and the expected tables/impact**. Approval for one run is not blanket approval for later runs. |
| Live writes | **None.** Live is read-only for this campaign. No fixture, API call or SQL statement from this matrix may write to Live. |
| Cleanup | There is no per-test cleanup. Any data cleanup is a separate, explicitly authorized operation under plan §10.5 that names the target and affected tables. |
| Historical shorthand | "Approved DB-write window" (used in older rows and in earlier audit documents) is shorthand for **explicit approval to write to the local development database** `courtzon_v3` @ `127.0.0.1:3307`, naming the expected tables/impact. It does **not** imply a separate test database, disposable data, or any Live write, and it does **not** change any previously approved test decision. |

**Schema vs data transfer to Live (documented policy):** approved schema changes reach Live **only** as reviewed
numbered migrations inside the deployed backend image, applied by `backend/docker-entrypoint.sh` →
`node /app/scripts/migrate.js` under `migration-guard.sh` and `COURTZON_MIGRATION_ENV=production`. The local database
is **never** copied over Live. Local business data is **never** transferred to Live automatically; any Live data
change is a separate, explicitly approved operation with its own safe plan.

## 3. The matrix

### 3.1 P6-04 — Auth / session / role / permission

| ID | Role | Setup | Action | Expected | Cleanup | Spec (source) | Class | Status |
|---|---|---|---|---|---|---|---|---|
| A1 | Player | Insert test user (`insertUser`), login via UI | Submit valid phone/password | Redirect to `/app`, session cookie set | None per test; user row left for campaign cleanup | `e2e/scenarios/smoke/login.spec.ts:8–25` | W | **PASS (2026-11-03, local Docker stack; 1/1)** — real phone+password login reaches `/app`; enabled by the `insertUser` PBKDF2 seeding fix |
| A2 | Anonymous | None | Submit invalid password | Visible error/alert; no session | None | `e2e/scenarios/smoke/login.spec.ts:27–36` | R | **PASS (2026-11-03, local Docker stack; 1/1)** — after the locator fix (`text=Invalid` had been mixed into a CSS selector list, which Playwright rejected); the rendered backend message is asserted. **Historical:** PASS (2026-11-02, Live) — one synthetic attempt: alert `Invalid credentials. 4 attempt(s) remaining.`, stayed on `/login`, `GET /auth/me` → `user:null` |
| A3 | Platform admin | Admin fixture logs in via API + UI | Open `/admin`, admin link, admin dashboard | `admin` nav visible; dashboard loads | None | `e2e/scenarios/admin/admin-dashboard.spec.ts:6–48` | W | **PASS (2026-11-03, local; 3/3)** — after retargeting the spec to the real admin workspace: URL `/admin`, `System Dashboard` heading, sidebar `<nav>` present, `/admin/users` renders with its table. The former player-dashboard / "Admin link" expectations did not match the app (platform staff are redirected to `/admin`) |
| A4 | Anonymous | None | Navigate `/tournaments`, `/admin/tournament/list`, `/org/35/tournaments`, `/referee/assignments` | Redirect to `/login` or 4xx; no crash | None | `e2e/scenarios/tournament/p0-public-readonly.spec.ts:205–234` | R | **PASS with observation (2026-11-02, Live)** — `/admin`, `/admin/tournament/list`, `/org/35/tournaments`, `/tournaments` → SPA redirect to `/login`; `/referee/assignments` → **401 JSON** `AUTHENTICATION_ERROR` (4xx, no crash); 0 page errors. Raw JSON on direct browser navigation mirrors the D-04 class for API-prefixed paths. **Re-confirmed PASS (2026-11-03, local; G5)** — all four routes denied (`/login` redirect or 4xx), 0 fatal page errors |
| A5 | Anonymous | Stack up | `GET /health`; open `/` | 200; `#root` visible | None | `e2e/scenarios/smoke/health.spec.ts:4–12` | R | **PASS (2026-11-02, Live)** — `GET /health` = **200** `status:"ok"`; `/` = **200**, `#root` present (2 children), 2683 chars rendered. **Re-confirmed PASS (2026-11-03, local; 2/2)** |
| A6 | Role matrix (player, admin; org/coach/referee actors absent) | Player + admin sessions seeded in the spec | API: player → `GET /admin/users` (403), `PATCH /bookings/1/status` (403), `POST /payments/1/refund` (403); admin → `GET /admin/users` (200). UI: player → `/admin/users` shows **Access denied**; admin → page renders | 401/403 before the handler; UI blocks the page | Logout both; no business rows created | `e2e/scenarios/auth/authz-session-isolation.spec.ts` (A6) | W | **PASS (2026-11-03, local Docker stack; 2/2)** — player: `POST /bookings` **200/201** with an id; `GET /admin/users` **403**, `PATCH /bookings/1/status` **403**, `POST /payments/1/refund` **403** (rejected in `preHandler`, no write); UI `/admin/users` shows `Access denied`. Admin: `GET /admin/users` **200** and `/admin/users` renders without `Access denied`. **Historical:** PARTIAL (2026-11-02, Live) — deny half PASS, allowed half NOT RUN |
| A7 | Player | One user, two seeded sessions | `POST /auth/logout {allDevices:true}` → other session `GET /auth/me` = `{user:null}` and a protected call = 401; refresh before/after revocation (rotation) | Immediate revocation (DB-backed session), 401 for revoked refresh | Sessions/audit rows remain | `e2e/scenarios/auth/authz-session-isolation.spec.ts` (A7) | W | **PASS (2026-11-03, local Docker stack; 4/4)** — logout-all revokes the other session immediately (`/auth/me` → `user:null`, protected call 401); single logout leaves the other session valid; refresh rotates and the old refresh token is rejected (401); refresh after revocation is rejected (401). Access-expiry timing stays integration-only |
| A8 | Org A owner + unrelated user B | Two orgs/users (fixtures + `insertOrganisation`) | B → `GET /organisations/:orgA/bookings` (403, no data); B → `/org/:orgA/accounting/dashboard` (403); A → 200 | 403 without tenant data | Rows remain (campaign marker); no destructive cleanup | `e2e/scenarios/auth/authz-session-isolation.spec.ts` (A8) | W | **PASS (2026-11-03, local Docker stack; 1/1)** — owner A: org bookings 200 and org accounting dashboard 200; user B: both **403** with no `data` in the body (no tenant leak) |

### 3.1d P6-04 local execution — 2026-11-03

**Environment:** local development database `courtzon_v3` @ `127.0.0.1:3307` (Docker), frontend `http://localhost:5173`, backend `http://localhost:3000`. Playwright with `--workers=1 --trace=off`; one scenario group per command. No Live access, no Docker rebuild, no cleanup.

| Row | Command scope | Result |
|---|---|---|
| A1 | `smoke/login.spec.ts --grep "player can login with valid credentials"` | **PASS 1/1** |
| A2 | `smoke/login.spec.ts --grep "shows error with invalid credentials"` | **PASS 1/1** |
| A3 | `admin/admin-dashboard.spec.ts` (3 tests) | **PASS 3/3** |
| A4 | `tournament/p0-public-readonly.spec.ts --grep "G5"` | **PASS** |
| A5 | `smoke/health.spec.ts` (2 tests) | **PASS 2/2** |
| A6 | `auth/authz-session-isolation.spec.ts --grep "role and permission enforcement"` | **PASS 2/2** |
| A7 | `auth/authz-session-isolation.spec.ts --grep "session lifecycle"` | **PASS 4/4** |
| A8 | `auth/authz-session-isolation.spec.ts --grep "organization isolation"` | **PASS 1/1** |

**Test-side blockers fixed in the working tree and preserved in the local (not yet pushed) E2E commit:** `insertUser` now hashes with the backend `$pbkdf2-` format; `insertBranch`/`insertResource` aligned to the live schema (`city`/`latitude`/`longitude`/`slug`/`public_id`, `hourly_price`, no `currency_id`); `data/courts.ts` tennis fixture `sportId` 1 → 22; A2 locator rewritten; A3 retargeted from the player dashboard to the real admin workspace.

**Data left behind:** every class-W row remains (`users`, `user_roles`, `user_sessions`, `organisations`, `branches`, `resources`, `bookings` and derived rows). No cleanup and no `TRUNCATE` was executed.

**Historical sections §3.1a–§3.1c** describe earlier readiness/blocked states and are **superseded by this section for current status**.

### 3.1b Live read-only run — 2026-11-02

**Scope:** A2, A4, A5, A6-UI only. No writes, no admin actions, no account changes. A2 used **one** failed login with a synthetic phone (brute-force preserved: 4 attempts remaining); A6-UI used the existing player test account (D-09) and logged out at the end.
**Tool:** Playwright 1.60 (Chromium, 1280×900) against `https://courtzon.cloud`; health read from `https://api.courtzon.cloud/health`.
**Results:** A2 **PASS** · A4 **PASS with observation** · A5 **PASS** · A6-UI **PASS**.
**Observation:** direct browser navigation to `/referee/assignments` returns raw **401 JSON** (`AUTHENTICATION_ERROR`) instead of an SPA redirect — same class as the fixed D-04 (`/org`) case. It is a 4xx with no crash, so A4's expectation is met, but the UX deviation is recorded.
**Not executed:** A1, A3, A6-API (admin-allowed path), A7, A8 — they require an admin session and/or an approved DB-write window (§2.1).

**3.1b-1 A6-API deny-path run (2026-11-02, no writes):** first attempt was BLOCKED — no player session existed and a fresh login was out of scope; an unauthenticated browser-context control returned **401**. **Second attempt (explicit user approval for one login):** logged in once as player D-09 via the UI, then, from the browser context:

| Request | Status | Notes |
|---|---|---|
| `GET /admin/users` | **403** `FORBIDDEN` | body keys `error,message` (58 B), no user data |
| `PATCH /bookings/999999999/status` | **403** `FORBIDDEN` | non-existent id; rejected in `preHandler` |
| `POST /payments/999999999/refund` | **403** `FORBIDDEN` | non-existent id; rejected in `preHandler` |

All three rejections happen in `preHandler` before any handler executes — `rbac.routes.ts:26` (`adminGuard`), `booking.routes.ts:16` (`requirePermission(['admin.bookings.update-status','org.bookings.manage'])`), `payment.routes.ts:13` (`requirePermission(['financial.reconcile'])`), with `requirePermission` returning 401/403 without invoking the handler (`shared/middleware/auth.middleware.ts:37–50`). No write occurred. Session state: authenticated before logout, `authenticated: false` after logout. Admin-allowed path (200) remains NOT RUN.

**3.1b-2 A6 admin-allowed path — session availability check (2026-11-02):** **NOT RUN.** Availability verified before any action: no local debugging endpoint on `9222/9223/9333`, no browser process carrying `--remote-debugging-port` or a Playwright/`ms-playwright` profile, and the only stored browser state in the workspace is a **2-day-old player** session (`cz-qa/state.json`, 2026-10-31) that is neither an admin session nor within the refresh-token lifetime. Establishing an admin session would require credentials, which this run explicitly disallows. No admin request was executed; no status code exists to report.

**3.1c P6-04 residual scope under read-only / no-new-session constraints (2026-11-02, review only):** every remaining P6-04 row requires a write and/or an admin session, so **none was executed** in this step:

| Row | What blocks execution | Class |
|---|---|---|
| A1 | inserts a test user and creates a fresh login session | W |
| A3 | requires a platform-admin session (`/admin`, dashboard) | W |
| A6 (allowed half) | requires an admin session → `GET /admin/users` = 200 | W |
| A7 | requires two sessions and `POST /auth/logout {allDevices:true}` | W |
| A8 | fixtures creating two organisations/users + cross-tenant calls | W |

**No test was run in this review step and no PASS is claimed.** P6-04 remains **IN_PROGRESS** until an approved DB-write window (§2.1) and/or an admin session is provided.

**3.1b-3 A6 admin account audit (2026-11-02):** **no admin account was ever created in this campaign.** Only two accounts exist, both `player`: **D-09** (`roles:["player"]`) and **D-11** (`roles:["player"]`, later coach-approved). Account records were checked locally for the `roles` field only — no credentials, cookies or tokens were read or printed. The super-admin credentials supplied earlier in the session were rejected by the API (`401 INVALID_CREDENTIALS`, 4 attempts remaining) and were never persisted. Re-checked availability at this step: no CDP endpoint (`9222/9223/9333` closed), no browser with `--remote-debugging-port`, no Playwright browser running, and the only stored browser state is the expired 2026-10-31 **player** session. ⇒ A6-admin remains **NOT RUN**; neither test was executed and no status code exists.

**3.1b-4 Official path for an admin test account — code/doc audit (2026-11-02, no execution):** **no official self-service path exists**, so A6-admin stays **NOT RUN**.

| Check | Finding |
|---|---|
| `POST /admin/users` (admin-side user creation) | **Does not exist** — the RBAC router only exposes `GET/PUT/DELETE /admin/users/:id` (`backend/src/modules/rbac/presentation/rbac.routes.ts:26–39`) |
| Admin "invite user" endpoint | **Does not exist**; invite endpoints in this codebase are coach agreements, community chat and tournament teams only |
| Admin UI (`frontend/src/pages/admin/users/`) | Contains only `UserListPage`, `UserEditModal`, `CoachTab` — **no create/invite action** |
| Role assignment | `POST /user-roles` requires `superAdminGuard` (`rbac.routes.ts:48`) ⇒ needs an **existing** super admin |
| Staff creation | `POST /hr/employees` requires `hr.employees.manage` (`hr.routes.ts:25`) — no test account holds it, and it is org-staff scoped, not platform super admin |
| Public registration | Only `player` / `seller` / `organization` roles (`/auth/register-*`), never admin |
| Documentation | `docs/enterprise-library/QUAL-TEST-03_Integration_Test_Reference.md:278` describes an "invite user by email + assign role" flow, but **no matching route exists in this codebase** |

**Consequence:** creating an admin test account would require either an existing super-admin session (none available) or a direct DB/RBAC change (explicitly forbidden). No account was created and no request was sent.

### 3.1a A6 / A7 / A8 readiness review (read-only, 2026-10-28)

**A6 — role and permission enforcement (allowed + denied)**

| Item | Evidence |
|---|---|
| Permission gate | `backend/src/shared/middleware/auth.middleware.ts:37–50` (`requirePermission` → 401 when unauthenticated, 403 when the user lacks **any** listed key); `:73–74` (`adminGuard` = `super_admin`/`super-admin` role **or** `platform.admin`) |
| Permission resolution | `backend/src/app.ts:261–274` — active `user_roles` → `role_permissions` → `permissions.permission_key` (expiry/deleted-role aware) |
| Allowed (player) | `POST /bookings` requires `bookings.create` (`booking.routes.ts:9`); the player template grants `bookings.*` incl. cancel (`backend/scripts/role-permission-templates.mjs`, `PLAYER_PATTERNS`) |
| Denied (player) | `GET /admin/users` — `adminGuard` only (`rbac/presentation/rbac.routes.ts:26`) → **403**; `PATCH /bookings/:id/status` — `admin.bookings.update-status` **or** `org.bookings.manage` (`booking.routes.ts:16`) → **403**; `POST /payments/:id/refund` — `financial.reconcile` (`payment.routes.ts:13`) → **403** |
| Allowed (admin) | `GET /admin/users` → 200 (`rbac.routes.ts:26`, seeded super_admin) |
| UI gates | `frontend/src/app/routes/RouteGuards.tsx:7–14, 54+` (explicit **Access denied**), `app/layouts/AdminLayout.tsx:24–49` (per-route key), `permissions/adminRoutePermissions.ts:27` (`users → users.view`) |
| Existing coverage | E2E: `login.spec.ts` A1/A2, `admin-dashboard.spec.ts` A3, `p0-public-readonly` G5 (unauth). Backend: `auth-route-rate-limit` (17), RBAC module (112), `template-parity`, `auth.integration` (13). Frontend unit: `routeGuards.test.tsx` (18), `AdminLayout.access.test.tsx` (5) |
| Missing | No E2E role/permission matrix; **only `player` and `admin` fixtures exist** (`e2e/fixtures/auth.fixture.ts:8–11`); no org/coach/referee actors |
| Class / preconditions | **W** — player fixture inserts a user + session; denied API calls are rejected in `preHandler` (no business writes); admin action is a read |
| Cleanup | Logout both contexts; no rows to delete; sessions/audit left for campaign cleanup |
| Security note | `GET /admin/users` is gated by `adminGuard`, **not** `users.view`, while the UI route key is `users.view` — deny-safe mismatch (B24 class). Assert both API 403 and UI denial; never assert that a `users.view`-only role can reach the API. Avoid repeated invalid logins (brute-force 429). |

**A7 — session lifecycle (expiry / refresh / logout / logout-all)**

| Item | Evidence |
|---|---|
| Login / cookies | `auth.controller.ts:105–188` login; `shared/utils/auth-cookies.ts:28–41` — `session_token` (15 min default) + `refresh_token` (24 h / 30 d remember), HttpOnly/SameSite=Lax/secure in prod |
| Session resolution | `app.ts:226–248` — DB lookup by **hashed** session token with `is_revoked = FALSE AND expires_at > NOW()`; revocation is therefore **immediate** on the next request |
| Refresh rotation | `auth.service.ts:550–563` — revoked old session + fresh session; expired refresh revokes and throws |
| Logout / logout-all | `auth.service.ts:565–583` — `allDevices` resolves the owner from the refresh token then `revokeAllForUser`; single logout revokes only that session; handler `auth.controller.ts:201–217`, body `{ refreshToken?, allDevices? }` (`auth.dto.ts:85–88`) |
| `/auth/me` | `auth.controller.ts:219–243` — always 200, `{ user: null }` when the session/refresh are invalid; cookies cleared only when both are invalid |
| Testability | **No expiry wait needed:** two sessions, `POST /auth/logout {allDevices:true}` from one → the other’s next request is 401/`user:null` (DB `is_revoked`). Refresh before/after revocation validates rotation. Access-token **expiry timing** (15 min default, env-overridable) is not UI-testable without time manipulation → stays integration-only |
| Existing coverage | `logout-all-devices.spec.ts` (2 unit), `session-expiry.integration.spec.ts` (6, **DB-writing / NOT RUN**), `auth-route-rate-limit` (17); no E2E |
| Class / preconditions | **W** — sessions are DB rows; one user + two contexts |
| Cleanup | Logout both; revoked session rows remain (campaign cleanup) |
| Security note | `/auth/logout` is public (`auth.middleware.ts:105` PUBLIC_PREFIXES) — `allDevices` must be driven by the refresh cookie, not a client-supplied user id. Never print tokens; assert only status/shape. |

**A8 — organisation / tenant isolation**

| Item | Evidence |
|---|---|
| Access rule | `shared/middleware/org-access.ts:25–45` (`canAccessOrganisation`: owner, platform admin, or active org role-scope), `:53–69` (`findAccessibleOrgIds`; empty = platform admin, no tenant restriction) |
| Guard | `shared/middleware/route-guard.ts:21–38` (`requireOrganisationAccess` → 403), `:43–60` (manage), `:63–80` (org-scoped permission); deps wired in `app.ts:299–358` |
| Representative routes | `GET /organisations/:orgId/bookings` — `bookings.view` + org guard (`booking.routes.ts:19`); org accounting `GET /org/:orgId/accounting/*` — `org.accounting.view` (`accounting/presentation/accounting.routes.ts:14–20`); settlement detail/pay — `assertSettlementOrgAccess` resolves the org server-side (`settlement/presentation/unified-settlement.controller.ts:58–63, 82, 91`); list scoping never trusts a client `orgId` (`:72–77`) |
| Test | User B (not owner/scope) → org A routes **403** and no data; owner A → 200. Optionally a settlement id belonging to A → 403 for B |
| Existing coverage | `org-access.spec.ts` (6 unit, mocked DB), `multi-org-settlement-isolation`, `org-journal-rbac`, `f3-org-scope`, `f3-repo-isolation` (integration); no E2E |
| Class / preconditions | **W** — two organisations (owner A, unrelated B) + users/sessions via fixtures; `insertOrganisation`/`insertBranch` |
| Cleanup | Rows remain; no destructive cleanup; campaign marker recommended |
| Security note | Server-side org resolution only; assert **403 with no data** (not 404-only) and that error bodies never include tenant data. Do not use a real customer org. |

**Readiness summary**

| Scenario | Status | Tests authored | Blockers |
|---|---|---|---|
| A6 | **AUTHORED — NOT EXECUTED** | 2 (player allowed/denied + UI; admin allowed + UI) | Approved DB-write window (§2.1) + running stack; only player/admin actors available (org/coach/referee fixtures still absent) |
| A7 | **AUTHORED — NOT EXECUTED** | 4 (logout-all, single-logout isolation, refresh rotation, refresh after revocation) | Approved DB-write window (§2.1) + running stack; access-expiry timing intentionally left to `session-expiry.integration.spec.ts` |
| A8 | **AUTHORED — NOT EXECUTED** | 1 (cross-org bookings + accounting) | Approved DB-write window (§2.1) + running stack |

**Spec:** `e2e/scenarios/auth/authz-session-isolation.spec.ts` (discovered by the `all` project only — run it with
`--project=all`, or pass the file path with an explicit `--config`). Discovery (`playwright test --list`, no
execution) reports **59 tests in 13 files**, including all 7 new tests, with no configuration or module-load error.

**Implementation notes (verified while authoring):**

- **Session seeding** (hashed `user_sessions` rows; same convention as
  `tournament/tournament-venue-flow.spec.ts:23–31`) is kept because it is deterministic and lets the four A7
  lifecycle assertions be isolated from login/rate-limit behaviour. It exercises the real auth middleware, permission
  resolution and org guards.
- **Two fixture/login mismatches were found and fixed on 2026-10-28 (test helpers only):**
  1. `e2e/helpers/database.ts::insertUser` used to store `full_phone` as the local 11-digit number while
     `authService.login` looks users up by country-code-prefixed phone (`auth.service.ts:520–529`). It now reads
     `countries.phone_code`, normalizes it to a leading `+` (the same normalization login applies) and stores
     `full_phone = +<code><local>` — so seeded users can authenticate through the real phone-login contract.
  2. `authenticatedAdmin` used email login, which `LoginSchema` rejects (`auth.dto.ts:28–29` — 11-digit phone only).
     It now creates a dedicated phone/password user, grants `super_admin` with the existing inline `user_roles`
     convention, logs in with the phone, and accepts the `/admin` landing (plus `/app` fallback).
- **Role seeding** uses the existing inline convention (`INSERT IGNORE INTO user_roles …`) already present in the
  tournament specs (`tournament-team-invitation.spec.ts:89`, `tournament-venue-flow.spec.ts:96`); no new fixture
  export was invented.
- **API login helper and phone-format defects fixed on 2026-10-28 (test helpers only):**
  1. `e2e/helpers/api.ts::api.login` used to POST `{phoneNumber, password}` with no `countryCode`, so
     `authService.login` threw `InvalidCredentialsError` (`auth.service.ts:525–526`). It now sends the local digits
     plus `countryCode` (`'+20'` by default, matching country 1 = Egypt in `database/seeds/001_baseline.sql:154`,
     the same row `insertUser` reads), exactly like the web client (`LoginPage.tsx:58–63`). An already-international
     `+…` number is rejected with a clear error instead of being double-prefixed or wrongly re-split.
  2. `e2e/data/users.ts` generated **16-digit** numbers for `player`, `coach`, `seller`, `secondPlayer`
     (`'01000000' + 8 digits`), which fail `localPhoneNumberSchema` (exactly 11 digits,
     `shared/validation/local-phone.ts:5,10`) and the form’s `localPhoneZod` (`frontend/src/utils/phone.ts:10`) —
     so `authenticatedPlayer`, `login.spec`, and every `api.login` caller could never authenticate. They now use a
     3-digit Egyptian mobile prefix + 8 digits (11 total), the pattern `testUsers.admin()` already used.
  Because all E2E users are seeded with `countryId = 1`, seed-time `full_phone` (`+20…`) and login-time
  `countryCode` (`+20…`) now agree.
- **No tokens are printed**; cookies are only sent in headers.

No test was executed for this task and no scenario is claimed as `PASS`.

### 3.2 P6-05 — Clubs / courts / bookings / cancellations / conflicts

| ID | Role | Setup | Action | Expected | Cleanup | Spec (source) | Class | Status |
|---|---|---|---|---|---|---|---|---|
| B1 | Player | Insert org/branch/resource; open booking page | Select court/date/slot, Book Now | Confirmation; booking card appears in `/bookings` | Rows left; campaign cleanup only | `e2e/scenarios/booking/create-booking.spec.ts:18–45` | W | NOT RUN |
| B2 | Player | Fixture booking via API | Create (cash → confirmed) then cancel via UI | Status `cancelled`; slot released | Rows left | `e2e/scenarios/booking/cancel-booking.spec.ts:18–62` | W | **NOT RUN (unverified) — obsolete confirm call removed 2026-10-28 (spec-only); cash bookings are created confirmed (`booking.service.ts:478–480`) and cancelled through `POST /bookings/:id/cancel`. Execution still requires DB-write approval + a running stack** |
| B3 | Player | Fixture booking | Create public match, open list | Match visible | Rows left | `e2e/scenarios/match/public-match.spec.ts:21–45` | W | NOT RUN — fixture (`cash`) and import fixed 2026-10-28; requires DB-write approval |
| B4 | Anonymous | ≥1 public tournament in DB | Open public list/detail; invalid id | List renders; detail identity; invalid id shows terminal error | None | `e2e/scenarios/tournament/p0-public-readonly.spec.ts:60–202` | R | **PASS (2026-11-02, Live)** — discovery `GET /public/tournaments` → **2** records (ids 14 and 10); `/tournaments/public` rendered **2 anchors**; **both** details contain their name (440 / 504 chars), **0 match cards and 0 bracket headings for either** (empty brackets = data-dependent, recorded as note per spec), no horizontal overflow at 1440; invalid id `999999999` → terminal message `This tournament is unavailable or not public. ← Back to public tournaments`; **0 page errors** in all four navigations |
| B5 | Player | Two contexts | Book the same slot simultaneously | Exactly one succeeds; other gets conflict UI | Cancel/refund per policy | — | — | **MISSING** |
| B6 | Org admin | Org-owned courts + external venue | Assign venue, override per competition, forged cross-org resource | Correct venue shown; forged resource rejected | Spec deletes fixed-slug rows itself | `e2e/scenarios/tournament/tournament-venue-flow.spec.ts:34–40` | W + **D** | **BLOCKED (spec runs `SET FOREIGN_KEY_CHECKS=0` + `DELETE` — violates the no-routine-destructive-cleanup rule; fix in P7-02)** |
| B7 | Anonymous | Public tournament | Mobile 390×844 detail + drawer | No page overflow; close control works | None | `p0-public-readonly.spec.ts:237–277` | R | **PASS (2026-11-02, Live)** — 390×844 on **both** public tournaments (14, 10): `scrollWidth = clientWidth = 390` (no unintended overflow), 440 / 504 chars rendered; **drawer NOT EXERCISED** — **both** public tournaments expose **0 `.cz-match-card`** elements, so the spec's conditional drawer block does not apply (data-dependent); 0 page errors |

### 3.2a B2 root-cause trace (read-only, 2026-10-28)
- **Spec request:** `e2e/scenarios/booking/cancel-booking.spec.ts:40–41` calls
  `PATCH /bookings/:id/confirm` and asserts `200`.
- **Registered booking routes:** `backend/src/modules/booking/presentation/booking.routes.ts:9–20` — `POST /bookings`,
  `POST /bookings/prepare`, `DELETE /bookings/prepare/:prepareId`, `GET /bookings/:id`, **`POST /bookings/:id/cancel`**
  (`:14`, permission `bookings.cancel`), `POST /bookings/:id/check-in`, **`PATCH /bookings/:id/status`** (`:16`,
  permission `admin.bookings.update-status` **or** `org.bookings.manage`), `PATCH /bookings/:id/payment`, etc.
  **No `/confirm` route exists** (not renamed; nothing in the frontend calls it either).
- **Correct cancellation contract:** `cancelBookingHandler` (`booking.controller.ts:109–126`) parses
  `{ reason }` (`CancelBookingSchema`, `booking.dto.ts:79–81`), calls
  `bookingService.cancelBooking(id, userId, reason)` and replies **200 with the booking object**. The service enforces
  ownership (`booking.service.ts:986–991`), the cancellation window (`:993–996`), runs the canonical `CancelBooking`
  command (`:1010` / `:1022`) and returns `this.getBooking(id)` (`:1036`). The player holds `bookings.cancel` via
  `PLAYER_PATTERNS` (`backend/scripts/role-permission-templates.mjs`).
- **Why the confirm step is obsolete:** with the corrected `cash` fixture the booking is created **already
  confirmed** (`booking.service.ts:478–480`; `isGatewayOrWallet` excludes cash/COD at `:373`). For card/wallet,
  confirmation happens through the payment webhook (`payment:succeeded` → `booking-payment.listener.ts`), never a
  REST confirm.
- **Frontend parity:** cancel is `api.post('/bookings/${id}/cancel', { reason })`
  (`frontend/src/pages/booking/BookingDetailPage.tsx:69`, `MyBookingsPage.tsx:54`).
- **Same obsolete contract in unused fixtures:** `e2e/fixtures/booking.fixture.ts:94` and
  `e2e/fixtures/payment.fixture.ts:63–65` (neither is imported by any spec).
- **Conclusion:** the E2E scenario tested an **obsolete/non-existent contract**, not an application defect.
  **Corrected 2026-10-28 (spec-only):** the `confirm` call/assertion at `cancel-booking.spec.ts:40–41` was removed;
  no confirm route was added and the creation → UI-cancel flow is unchanged. B2 remains **unverified** until it is
  executed against the local development database `courtzon_v3` (Amendment A1).
- **Environment note:** cancellation can legitimately return `409` if an active `cancellation_policies` window exceeds
  the ~3-day fixture lead time (`_canUserCancel`, `booking.service.ts:1179–1208`); this is data-dependent, not a code
  defect.

### 3.2b Live read-only run (2026-11-02)

**Scope:** B4 and B7 only. Anonymous browser navigation + `GET /public/tournaments` for data discovery. No writes, no sessions created/used, no bookings or tournaments created/modified.
**Tool:** Playwright 1.60 (Chromium); desktop 1440×900 for B4, mobile 390×844 for B7; target `https://courtzon.cloud`.
**Data discovered:** `GET /public/tournaments` → **2** records: id **14** and id **10** (both QA/E2E campaign data — consistent with the still-open D-05 QA-data item). **Both** were exercised, not just the first.

| Check | Result |
|---|---|
| B4 list `/tournaments/public` | **2** tournament anchors rendered, 0 page errors |
| B4 detail id 14 | name present, 440 chars, **0 match cards / 0 bracket headings**, no horizontal overflow, 0 page errors |
| B4 detail id 10 | name present, 504 chars, **0 match cards / 0 bracket headings**, no horizontal overflow, 0 page errors |
| B4 invalid `/tournaments/public/999999999` | terminal message `This tournament is unavailable or not public. ← Back to public tournaments`, `#root` rendered, 0 page errors |
| B7 390×844 (id 14) | `scrollWidth = clientWidth = 390`, 440 chars, 0 page errors |
| B7 390×844 (id 10) | `scrollWidth = clientWidth = 390`, 504 chars, 0 page errors |
| B7 drawer | **NOT EXERCISED** — **both** public tournaments expose 0 `.cz-match-card`, so the spec's conditional drawer block does not apply |

**Not run:** B1, B2, B3 (class W — require booking writes / approved DB-write window (§2.1)), B5 (scenario missing), B6 (blocked by its own destructive SQL, P7-02).

### 3.3 P6-06 — Marketplace / payments / subscriptions / accounting

| ID | Role | Setup | Action | Expected | Cleanup | Spec (source) | Class | Status |
|---|---|---|---|---|---|---|---|---|
| C1 | Player | Prepare booking (card) fixture | Open payment page, enter card, submit | `success` result; payment row paid | Rows left | `e2e/scenarios/payments/payment-flow.spec.ts:19–56` | W + **X** | **BLOCKED (fake card `4242…` only succeeds with MockGateway; Paymob requires redirect + Sandbox — P5-05 DEFERRED)** |
| C2 | Player | Wallet page | Top up 100, submit | Balance increases on success | Rows left | `e2e/scenarios/wallet/wallet-topup.spec.ts:7–32` | W + **X** | **BLOCKED (top-up goes through the gateway; mock-only UI evidence unless Sandbox run)** |
| C3 | Buyer | Products + active seller subscription | Marketplace checkout (card/cash), stock decrement | Order created, stock reduced once, accounting posted | Rows left | — | — | **MISSING** |
| C4 | Org/seller | Plans configured | Subscribe/renew; expired plan blocked | Activation rules enforced | Rows left | — | — | **MISSING** |
| C5 | Accountant/auditor | Posted journals | Open ledger/trial balance/report center | Balanced figures; permission-gated | None | — | — | **MISSING** |
| C6 | Buyer/admin | Paid order/booking | Refund via UI | Refund recorded, reversal journal, status updated | Rows left | — | — | **MISSING** |

### 3.4 P6-07 — Notifications / reports / settlements / admin workflows

| ID | Role | Setup | Action | Expected | Cleanup | Spec (source) | Class | Status |
|---|---|---|---|---|---|---|---|---|
| D1 | Player | Fixture booking | Trigger notification, open bell, click deep link | Navigates to the referenced entity | Rows left | `e2e/scenarios/notifications/notification-deeplink.spec.ts:20–50` | W | NOT RUN — inline wallet literal (`cash`) and import fixed 2026-10-28; requires DB-write approval; notification delivery unverified |
| D2 | Admin | Admin fixture | Open admin dashboard | Loads admin-specific elements | None | `admin-dashboard.spec.ts` (rows A3) | W | NOT RUN |
| D3 | Finance role | Seeded settlements | Open list/detail, pay/cancel where permitted | Correct figures; actions permission-gated | None | — | — | **MISSING** |
| D4 | Auditor/admin | Seeded data | Run/read reports, export | Correct data; export gated | None | — | — | **MISSING** |
| D5 | Player captain + invitee | Free team tournament | Create team, invite, accept/reject, expiry | Non-captain blocked; cross-tournament accept rejected; no financial writes | Rows left (timestamped slugs) | `e2e/scenarios/tournament/tournament-team-invitation.spec.ts:6–45` | W | NOT RUN |

### 3.5 P6-08 — Responsive and accessibility

| ID | Role | Setup | Action | Expected | Cleanup | Spec (source) | Class | Status |
|---|---|---|---|---|---|---|---|---|
| E1 | Anonymous | Public tournament | Desktop 1440×900 detail | No horizontal overflow; content renders | None | `p0-public-readonly.spec.ts:92–127` | R | **PASS (attributed, 2026-11-02)** — covered by the **B4** run (§3.2b) on ids 14 and 10: name present, text 440/504 chars, `scrollWidth = clientWidth`, 0 page errors. Criteria unchanged; **no re-run performed** |
| E2 | Anonymous | Public tournament | Mobile 390×844 | No page overflow; body non-empty | None | `p0-public-readonly.spec.ts:237–277` | R | **PASS (attributed, 2026-11-02)** — covered by the **B7** run (§3.2b) against this row's stated expectation on ids 14 and 10: `scrollWidth = clientWidth = 390`, text 440/504 chars, 0 page errors. **Drawer / close-control NOT EXERCISED** — both public tournaments expose 0 `.cz-match-card`, so that conditional block in `G6` was never run; this is a recorded **gap**, not a pass |
| E3 | Any | Key pages | Automated axe/a11y scan | No critical/serious violations | None | `e2e/scenarios/a11y/axe-public.spec.ts` | R | **PASS (2026-11-02, local — after fixes)** — **48/48 scans** (6 public pages × 4 viewports × light + dark), axe-core **4.14.0**: **0 critical, 0 serious, 1 moderate per scan** (`meta-viewport` = A11Y-007, excluded by decision). 0 BLOCKED. Run against a local build via Vite preview — **not** Docker `:5173` (image not rebuilt) and **not** Live. A11Y-001…006 fixed and pushed (`2d08621c`, `4568771f`); details + pre-fix baseline in §3.5b |
| E4 | Any | Key pages | Tablet 768/1024 widths | Layout intact, no clipped actions | None | — | — | **PASS (2026-11-02, Live)** — ids 14 and 10 at **768×1024** and **1024×768**: `scrollWidth = clientWidth`, **0 off-screen interactive elements**, **0 elements clipped by a container**, 0 page errors |

### 3.5a E1/E2 evidence attribution + E4 Live run (2026-11-02)

**E1 attribution (no new run):** the 2026-11-02 B4 execution (§3.2b) visited the public detail at **1440×900** — the same viewport constant the spec uses (`DESKTOP`) — for **both** public tournaments (ids 14, 10) and observed: tournament name present, non-empty body (440 / 504 chars), the spec's "empty bracket" note branch, `scrollWidth = clientWidth`, and 0 page errors. That matches **E1's stated expectation** exactly ("No horizontal overflow; content renders"). E1's criteria were **not modified**.

**E2 attribution (no new run):** the 2026-11-02 B7 execution (§3.2b) visited the same details at **390×844** (dsf 1) and observed `scrollWidth = clientWidth = 390`, non-empty body (440 / 504 chars), and 0 page errors — i.e. **E2's stated expectation** ("No page overflow; body non-empty"). **Gap recorded, not passed:** the `G6` drawer/close-control block was never executed because **both** tournaments expose 0 `.cz-match-card`; E2 therefore says nothing about the drawer.

**E4 run (executed live, read-only):** ids **14** and **10** at **768×1024** and **1024×768**, anonymous, no session, no writes:

| Tournament | Viewport | `scrollW / clientW` | Off-screen interactive | Clipped by container | Page errors |
|---|---|---|---|---|---|
| 14 | 768×1024 | 768 / 768 | **0** | **0** | 0 |
| 10 | 768×1024 | 768 / 768 | **0** | **0** | 0 |
| 14 | 1024×768 | 1024 / 1024 | **0** | **0** | 0 |
| 10 | 1024×768 | 1024 / 1024 | **0** | **0** | 0 |

Checked surfaces: `a`, `button`, `[role=button]`, `input`, `select`, `textarea` (visible only) — none outside the viewport, none clipped by an `overflow` ancestor (the page-level `<main>` scroller excluded).

### 3.5b E3 — axe accessibility scan, executed locally (2026-11-02)

**Status: PASS (after fixes).** E3's criterion — zero `critical` / `serious` violations — is met in **both colour schemes**: **48/48 scans PASS** (6 public pages × 4 viewports × light + dark), **0 critical, 0 serious**, and **1 `moderate` per scan** (`meta-viewport` → A11Y-007, deliberately excluded from this fix).

**Scope:** anonymous **public** pages only. No session, no admin login, no data created.

| Item | Value |
|---|---|
| Tool | `@axe-core/playwright` **4.14.0** (root `devDependency`, `--save-exact`) → `axe-core` **4.14.0** (`results.testEngine.version`) |
| Tags | `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` |
| Frontend (target) | `http://127.0.0.1:5174` — local production build (`npm run build`) served by `vite preview`, behind a temporary loopback router that mirrors Nginx `Accept`-header routing. Guard fail-closed on loopback + allowlisted port (`5173` Docker / `5174` local) |
| API | `http://127.0.0.1:3000` — loopback:3000 guard |
| Command | `$env:E3_THEME='light'\|'dark'; npx playwright test --config e2e/playwright.config.ts --project=a11y --workers=2` (twice: once per scheme) |
| Viewports | **1440×900** (E1), **390×844** (E2), **768×1024** and **1024×768** (E4) — the exact constants used by E1/E2/E4 |
| Themes | **light** and **dark** (`localStorage.theme_mode` + `emulateMedia`; the spec asserts `html.dark`/`html.light` actually applied before scanning) |
| Commit | `9230b155da5584f3e3847b358d3913bb829d56c4` — **no commit was made**; the fixes below exist only in the local working tree |
| Result | **PASS** — 48/48 scans, **0 BLOCKED**, 0 critical, 0 serious, 1 moderate per scan |
| Evidence | `test-results/e2e/a11y/<page>__<viewport>__{light\|dark}.json` (48 files, gitignored) + per-test attachments in `test-results/e2e/artifacts/` |

**Run 1 per-page results (pre-fix, dark scheme only, identical across all four viewports; counts = axe violations, not nodes):**

| Page | Path | Critical | Serious | Moderate | Minor | Verdict |
|---|---|---|---|---|---|---|
| Landing | `/` | 0 | 1 (`color-contrast`, 2–3 nodes) | 1 (`meta-viewport`) | 0 | **FAIL** |
| Login | `/login` | **1** (`select-name`) | 1 (`color-contrast`, 3–4 nodes) | 1 (`meta-viewport`) | 0 | **FAIL** |
| Forgot password | `/forgot-password` | 0 | 2 (`color-contrast`, `link-in-text-block`) | 1 (`meta-viewport`) | 0 | **FAIL** |
| Register chooser | `/register` | 0 | 1 (`color-contrast`, 3 nodes) | 1 (`meta-viewport`) | 0 | **FAIL** |
| Public tournaments list | `/tournaments/public` | 0 | 2 (`color-contrast`, `link-in-text-block`) | 1 (`meta-viewport`) | 0 | **FAIL** |
| Public tournament detail | `/tournaments/public/3632` | 0 | 1 (`link-in-text-block`) | 1 (`meta-viewport`) | 0 | **FAIL** |

All six pages rendered (HTTP 200, `#root` non-empty) — **no page was BLOCKED**. Detail page id was discovered read-only via `GET /public/tournaments` (id `3632`, `G11M2 1790909703203`); nothing was created.

**Run 2 — post-fix results (both schemes, PASS):**

| Page | Path | Light (c / s / m / mi) | Dark (c / s / m / mi) | Verdict ×2 |
|---|---|---|---|---|
| Landing | `/` | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 | **PASS** |
| Login | `/login` | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 | **PASS** |
| Forgot password | `/forgot-password` | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 | **PASS** |
| Register chooser | `/register` | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 | **PASS** |
| Public tournaments list | `/tournaments/public` | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 | **PASS** |
| Public tournament detail | `/tournaments/public/3632` | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 | **PASS** |

24/24 PASS in each scheme (48/48 total). The single `moderate` on every scan is `meta-viewport` (A11Y-007), which is **out of scope by decision** and is **not** counted as a pass for that item.

**Contrast achieved with the published palette (no theme value was changed, nothing published):**

| Defect | Pair | Light | Dark | Required |
|---|---|---|---|---|
| A11Y-002 | `#FFFFFF` on `--color-primary-dark` `#15803D` | **5.02** | **5.02** | 4.5 |
| A11Y-003 | `--color-primary-text` on `--color-primary-bg` | **4.57** (`#15803D`/`#DCFCE7`) | **6.49** (`#86EFAC`/`#14532D`) | 4.5 |
| A11Y-004 | `--color-primary-text` on surface | **4.79** (`#F8FAFC`) | **10.93** (`#14263A`) | 4.5 |
| A11Y-005 | `.cz-landing-btn-surface` (`--color-primary-text`) | **4.79** | **10.93** | 4.5 |
| A11Y-006 | link distinction | permanent underline | permanent underline | 1.4.1 |

**Environment honesty:** the scan ran against a **fresh local build** (`npm run build` → `vite preview` on `127.0.0.1:5175` + a temporary loopback router on `127.0.0.1:5174` that mirrors Nginx `Accept`-header routing, because `vite preview` does not run the dev-only SPA-fallback middleware and `vite dev` cannot serve `virtual:pwa-register`). It did **not** run against **Docker `:5173`** (the image was **not** rebuilt — it still serves the pre-fix bundle) and **not** against Live. The router script was deleted after the run. To avoid sampling mid-animation opacity, animations are reduced to zero duration and finished before `analyze()`; this revealed that the light-mode "4.05/3.66" contrast reports were translucent-transition artifacts (the real resting value `#64748B` on `#F8FAFC` is **4.55**).

**Supporting checks (same step):**

| Check | Result |
|---|---|
| `npm run build` (frontend, tsc + vite) | **PASS** (0 TypeScript errors) |
| `npx vitest run` on the two public tournament page specs | **PASS** (2 files, 9/9 tests) |
| `npx eslint` on the seven changed source files | **11 errors + 1 warning — all pre-existing** (`no-explicit-any` on untouched lines; `set-state-in-effect` at `LandingLayout.tsx:80`). **Not fixed, not claimed fixed** |
| `node scripts/ci-validate.js` | **214 errors — all pre-existing backend architecture rules** (`SQL outside repository`, `Presentation layer DB access`). **Not fixed, not claimed fixed** |

**Safety evidence (enforced in the spec, verified in every artifact):**

| Barrier | Evidence |
|---|---|
| Loopback only | Frontend and API URLs parsed and asserted (`http` + loopback host + allowlisted port `5173`/`5174` and `3000`) before any activity; a post-navigation check throws if the SPA leaves the local frontend |
| No writes sent | Every non-`GET`/`HEAD`/`OPTIONS` request is `route.abort()`-ed. `unexpectedWrites = []` and `writesSentToServer = 0` in all 48 records |
| App bootstrap only | The SPA itself attempts `POST /auth/refresh` once per page load; it was **blocked** (never reached the server), recorded as `blockedWrites: ["POST http://localhost:5174/auth/refresh"]` |
| No DB / fixtures | Spec imports only `@playwright/test`, `@axe-core/playwright`, `node:fs`, `node:path` — no `fixtures/*`, no `helpers/database`, no SQL |
| No data created | No accounts, tournaments, or bookings; discovery is `GET` only |

**Defect register (001–006 FIXED — committed `2d08621c`/`4568771f` and pushed; 007 OPEN — excluded):**

| ID | Impact | Rule (WCAG) | Root cause (as found) | Fix applied | Status |
|---|---|---|---|---|---|
| A11Y-001 | **critical** | `select-name` (4.1.2) | `LoginPage.tsx:77` label had no `htmlFor`/`id` link to the `<select>` | `htmlFor="login-country"` + `id="login-country"` (`LoginPage.tsx:77,81`) | **FIXED** |
| A11Y-002 | serious | `color-contrast` (1.4.3) | white `#059669` = 3.77:1 on primary buttons | `Button.tsx:14` → `bg-[var(--color-primary-dark)]` = 5.02:1 | **FIXED** |
| A11Y-003 | serious | `color-contrast` (1.4.3) | `#059669` on `--color-primary-bg` (2.42 / 3.58) | new per-mode token `--color-primary-text` (`index.css:12` light `#15803D`, `:156` dark `#86EFAC`) used by nav/chips | **FIXED** |
| A11Y-004 | serious | `color-contrast` (1.4.3) | `#059669` on surface (4.07 / 3.77) | links/CTAs → `--color-primary-text` in `LoginPage`, `ForgotPasswordPage`, `LandingLayout`, `PreRegisterPage`, `PublicTournamentsPage`, `PublicTournamentDetailPage` | **FIXED** |
| A11Y-005 | serious | `color-contrast` (1.4.3) | `.cz-landing-btn-surface` `#15803D` on `#14263A` = 3.06 | `index.css:656` → `color: var(--color-primary-text)` | **FIXED** |
| A11Y-006 | serious | `link-in-text-block` (1.4.1) | inline links underlined only on hover | permanent `underline` on the inline links | **FIXED** |
| A11Y-007 | moderate | `meta-viewport` (1.4.4) | `frontend/index.html:4` disables pinch-zoom | **not changed** — excluded by decision | **OPEN (observation)** |

**Interpretation:** E3's criterion ("no critical/serious violations") is **MET for the six public pages in both schemes**, so E3 is recorded as **PASS**. This does **not** close P6-08 (E2's drawer gap is still open, and consumer/admin pages were never scanned) and does not fix A11Y-007. No commit, push, Docker rebuild, deployment or database write occurred; the Docker frontend on `:5173` still runs the pre-fix bundle.


### 3.6 P6-09 — Realtime and simultaneous booking

| ID | Role | Setup | Action | Expected | Cleanup | Spec (source) | Class | Status |
|---|---|---|---|---|---|---|---|---|
| F1 | Player | Two sessions | Create/cancel booking in one session | Other session updates without refresh | None | — | — | **SPEC APPROVED (2026-11-02) — NOT RUN** — acceptance surface fixed to the **slot picker**; booking date chosen **beyond the cancellation-policy window** to avoid a policy `409`; policy must not be modified. **D3 fixed:** two sessions of the **same player** |
| F2 | Player ×2 | Two users, each with an independent API session (separate `session_token`) | Fire `POST /bookings` concurrently for the same resource/date/slot | Exactly one 2xx and exactly one `409`; one booking row only; `429` is a failure | Rows left | `e2e/scenarios/realtime/simultaneous-booking.spec.ts` | W | **PASS (2026-11-03, local)** — `npx playwright test e2e/scenarios/realtime/simultaneous-booking.spec.ts --workers=1` → **one 2xx + one 409**, **no 429**, no retry. Winner booking **`59073`** (2026-11-06, 08:00–09:30, `confirmed`, cash); active bookings for the slot = **1**. Rows left in place (no cleanup). Only `409` counts as the conflict (D6); message-text assertion remains deferred |
| F3 | Player | Socket connected | Drop/reconnect network | Cache reconciles; no duplicate events | None | `e2e/scenarios/realtime/reconnect-duplicate-events.spec.ts` | W | **PASS (2026-11-03, local) — evidence limitation.** Final run `npx playwright test e2e/scenarios/realtime/reconnect-duplicate-events.spec.ts --workers=1` executed 18:56:39–18:56:57; `test-results/.last-run.json` (Playwright-written) recorded **`{"status":"passed","failedTests":[]}`**, and the DB rows written inside that run match both phases (1 writer user, 1 organisation, 1 branch, 2 resources, 2 `public_match` bookings `59079`/`59080`). **No HTML/JUnit/JSON report exists**, so there is no assertion-by-assertion evidence. **The spec does not inject synthetic duplicate frames**, so it proves a real socket drop/reconnect plus exactly-one rendered row, not dedupe of injected duplicates. Details: §3.6c. Background: spec authored 2026-11-03; events limited to **match/tournament/academy** (in `invalidateRealtimeReconcile`); **notifications reconnect-queue excluded**. **D9 fixed:** event generated via **API** (`public_match` booking), observed on `/matches`. **Payload corrected (2026-11-03):** `match.available` carries **`bookingId`**, not `matchId` — dedupe is evaluated per `bookingId` (§3.6a). Drop is performed with Playwright `page.routeWebSocket` (real connection close), because `context.setOffline(true)` alone did not drop the live socket locally |

### 3.6a F1 / F2 / F3 — approved specifications (2026-11-02; F2 and F3 executed 2026-11-03, F1 not run)

**F1 remains NOT RUN.** F2 and F3 were executed on 2026-11-03 (§3.6b and §3.6c); the F3 result carries an explicit evidence limitation. Every write-producing run is permitted **only** on the **local development database** `courtzon_v3` @ `127.0.0.1:3307` (persistent Docker volume) under Amendment A1, and only after explicit approval naming the local target and the expected tables/impact. It is **not** an isolated or disposable test environment. **No write of any kind may be sent to Hostinger Live** — Live is read-only for this campaign.

**F1 — cross-session update (slot picker)**
- **Approved:** the acceptance surface is the **slot picker** (`['resource-slots', resourceId, bookingDate]`, `frontend/src/realtime/useRealtimeCacheUpdates.ts:737–741`), and the booking date must be chosen **beyond the cancellation-policy window** so the cancel step cannot legitimately return `409` (`§3.2a` L259–261). The cancellation policy itself must **not** be modified.
- **Fixed (D3):** the two sessions belong to the **same player** — this is the literal reading of "other session" and matches event routing to `user:<userId>` (`socket-event-mapper.ts:205`). Two different players would not receive the event through that room and would produce a false failure.
- Steps: A (same player) opens the slot picker for the resource/date → B (second session of the same player) creates the booking → A must show the slot as taken **without a page reload** → B cancels → A must show the slot as free again.
- Pass: both transitions observed live in A, zero manual reloads, no `409` on cancel. Fail: any manual refresh required, or the slot state does not change.
- Evidence: before/after screenshots of the picker, timestamps, network/navigation count for A (must be 0 reloads), booking id.

**F2 — simultaneous identical booking**
- **Approved:** **two different users**; **only HTTP `409` counts as the acceptable conflict**. `400`, `422`, or any other non-2xx response is a **test failure**, never a pass.
- **Fixed (D6):** the primary acceptance criterion is **no success state and no new booking created** (no navigation to a confirmation surface, no new row in the list, and the losing request is not 2xx). **Verifying the conflict message text is deferred** until a stable UI selector (role/aria) or a documented string exists — recorded here as an explicit limitation, not silently dropped. (Current evidence: the toast renders the server-provided `err.response.data.message` — `BookingFormPage.tsx:111–112` — and the toast component exposes no `role`/`aria-live`, only class-based markup.)
- Steps: prepare the same payload (resource/date/slot/type) for both users → fire `POST /bookings` concurrently → record both status codes → re-read the slot state and the list.
- Pass: exactly one success + exactly one `409`, **no second booking**, and the slot is held by a single booking. Fail: two successes, zero `409`, any non-2xx other than `409` on the losing side, or a second booking row.
- Evidence: both response codes, resulting booking ids count, post-run slot state, losing-side screenshot (URL + list state; text assertion deferred).

**F3 — reconnect and duplicate-event control**
- **Approved:** use **match / tournament / academy** events only — they are the roots listed in `invalidateRealtimeReconcile` (`useRealtimeCacheUpdates.ts:442–500`). **Notifications `reconnect-queue` is explicitly excluded** as a criterion.
- **Approved dedupe definition:** observe **socket frames by event type + entity id**, accepting a duplicate **transport** frame provided it produces **no duplicate state/UI**.
- **Concrete criterion fixed for this spec (payload corrected 2026-11-03):** event `match.available` carries **`bookingId`**, not `matchId` — the producer emits `{ bookingId, userId, organisationId, branchId, visibility, timestamp }` (`notification-engine.ts:58-62` and `:85-90`) and the mapper only copies `matchId` from the payload, so it is absent (`socket-event-mapper.ts:771-798`). Surface `/matches` (`MatchListPage`, query key `['public-matches', …]`; invalidation `invalidateMatchKeys`, `useRealtimeCacheUpdates.ts:395-420`). After an offline window and reconnect: the match must appear **exactly once** in the list; repeated transport frames for the **same `bookingId`** are tolerated **only if** the rendered list still contains exactly one entry for that match. A frame carrying a `matchId` is **not** required and must not be asserted.
- **Fixed (D9):** the event during the offline window is generated by a **direct API call** — `POST /bookings` with `bookingType: 'public_match'` — which produces `booking:created` and, through the notification engine, `match:available` (`notification-engine.ts:57–61`). Observation stays in the UI (`/matches`). Using a second UI context for the write was rejected as timing-sensitive.
- **Documented request fields before execution (do not guess):** `CreateBookingSchema` (`booking.dto.ts:16–26`) requires `branchId`, `resourceId`, `bookingDate` (YYYY-MM-DD), `startTime`/`endTime` (HH:mm); `bookingType` defaults to `private_match` (set `public_match`); `paymentMethod` defaults to `card` (use **cash** for an automatically confirmed booking — wallet is not an active booking payment method, `:23–25`). Any remaining optional fields must be read from the same schema at execution time, not assumed.
- Steps: connect `/matches` → drop the live WebSocket (Playwright `page.routeWebSocket` closes the connection and refuses new handshakes during the offline window) → create the `public_match` booking via API → restore the socket → verify the match appears **exactly once**; then create a second `public_match` while connected and verify the real `match.available` frame (`bookingId`) arrives and still yields **one** row.
- **Offline mechanism (revised 2026-11-03):** `context.setOffline(true)` alone did **not** close the established WebSocket in Chromium (observed locally on 2026-11-03: the client never reached `reconnecting`), so the drop is performed through Playwright's documented `page.routeWebSocket()` route (`WebSocketRoute.close()` / `connectToServer()`), which closes the live connection and refuses re-handshakes until restored. The previous "`matchId`" wording and the setOffline-only step are superseded.
- **Open execution-time item (not a decision):** confirm at run time that the browser actually uses the WebSocket transport (the client is configured `['websocket','polling']`); if it falls back to polling, `routeWebSocket` cannot cut it and the spec must fail explicitly rather than pass.

### 3.6b F2 — local execution (2026-11-03)

**Environment:** local development database `courtzon_v3` @ `127.0.0.1:3307`, backend `http://localhost:3000`. No browser session and no Live access; no Docker rebuild; no environment or rate-limit change.

**Command:** `npx playwright test e2e/scenarios/realtime/simultaneous-booking.spec.ts --workers=1` → **1 passed (3.2s)**.

| Check | Result |
|---|---|
| Two different users, each with an independent API session (`session_token` captured per user, not the shared helper jar) | OK — cookie A ≠ cookie B |
| Concurrent `POST /bookings` for the same resource/date/slot | Both requests started in the same tick (`Promise.all`) |
| Response statuses | **exactly one 2xx + exactly one `409`** |
| Rate limiting | **no `429`**; no retry performed |
| Active bookings for that slot | **1** (`resource_id` + `booking_date` + `start_time`, status not in `cancelled/expired/no_show`) |
| Winner booking | **`59073`** — 2026-11-06, **08:00–09:30**, `confirmed`, cash |
| Data left behind | yes — 2 users, 2 `player` grants, 2 sessions, 1 organisation, 1 branch, 1 resource, 1 booking, 3 audit rows; **no cleanup/deletion** |

**Not touched in this run:** B3 and B5 stay as they were; no Live/Docker/GitHub operation.

### 3.6c F3 — local execution (2026-11-03)

**Environment:** same local stack as §3.6b — `courtzon_v3` @ `127.0.0.1:3307`, frontend `http://localhost:5173`, backend `http://localhost:3000`. No Live access; no Docker rebuild; no environment/rate-limit change.

**Command:** `npx playwright test e2e/scenarios/realtime/reconnect-duplicate-events.spec.ts --workers=1` (root config). The final run executed **18:56:39–18:56:57** local time.

| Check | Result |
|---|---|
| Playwright last-run status | **`{"status":"passed","failedTests":[]}`** — `test-results/.last-run.json`, written 18:56:57 (gitignored) |
| Detailed artifact (HTML/JUnit/JSON) | **NONE** — the run used the root config, whose reporter is the default `list`; no report was archived |
| Writer user | 1 (`e2e-f3-writer-1793725010862-hfz6tx@test.com`, created 18:56:51) |
| Shared tenant | 1 organisation + 1 branch + **2** resources (offline/online), created 18:56:51 |
| Bookings written | **2** — `59079` and `59080` (2026-11-08, 08:00–09:30, `public_match`, `confirmed`, cash), created 18:56:55–18:56:56 |
| What the two bookings prove | Both spec phases ran: the write during the socket outage (phase 1) and the write while connected (phase 2) |
| Data left behind | yes — user, role grant, session, organisation, branch, 2 resources, 2 bookings and derived rows; **no cleanup/deletion** |

**Evidence limitation (explicit):** the available evidence is the Playwright-written PASS status plus the database rows matching both phases. There is **no assertion-by-assertion report**, so the individual checks (reconnect refetch observed, row count exactly 1, `match.available` frame carrying `bookingId`, zero document navigations) are **not independently documented** in an archived artifact.

**Scope limitation (explicit):** the spec **does not inject synthetic duplicate frames**. It verifies a real socket drop/reconnect, the reconnect-driven `/matches` refetch and exactly-one rendered row. It therefore does **not** prove deduplication of artificially repeated transport frames; the duplicate-tolerance wording covers only naturally repeated delivery.

**Not touched in this run:** F1 remains **NOT RUN**; F2's recorded result is unchanged; no Live/Docker/GitHub operation.

## 4. Existing spec inventory (13 files, 33 tests - verified by static count)
| Spec | Tests | Primary matrix rows | Class | Executable now? |
|---|---:|---|---|---|
| `smoke/health.spec.ts` | 2 | A5 | R | Yes, if stack is up |
| `smoke/login.spec.ts` | 2 | A1, A2 | W / R | A2 yes; A1 writes a user |
| `admin/admin-dashboard.spec.ts` | 3 | A3, D2 | W | Requires DB-write approval (import fixed) |
| `booking/create-booking.spec.ts` | 1 | B1 | W | Requires DB-write approval (import fixed) |
| `booking/cancel-booking.spec.ts` | 1 | B2 | W | Requires DB-write approval; test contract fixed 2026-10-28 |
| `match/public-match.spec.ts` | 2 | B3 | W | Requires DB-write approval (import/fixture fixed) |
| `tournament/p0-public-readonly.spec.ts` | 7 | A4, B4, B7, E1, E2 | R | Yes, if a public tournament exists (uses hard-coded `localhost:3000` at line 22) |
| `tournament/tournament-team-invitation.spec.ts` | 4 | D5 | W | Requires DB write approval |
| `tournament/tournament-venue-flow.spec.ts` | 1 | B6 | W + **D** | **No** (destructive SQL) |
| `payments/payment-flow.spec.ts` | 1 | C1 | W + X | Only with MockGateway (import fixed); Paymob blocked (P5-05) |
| `notifications/notification-deeplink.spec.ts` | 1 | D1 | W | Requires DB-write approval (import/fixture fixed); delivery unverified |
| `wallet/wallet-topup.spec.ts` | 1 | C2 | W + X | Only with MockGateway (import fixed) |
| `auth/authz-session-isolation.spec.ts` | 7 | A6, A7, A8 | W | **AUTHORED 2026-10-28 — not executed**; requires approved DB-write window (§2.1) + running stack (discovered by the `all` project) |

## 5. Coverage gaps against Phase 6 acceptance

| P6 task | Existing coverage | Gap / action |
|---|---|---|
| P6-04 auth/RBAC | **A1–A8 all executed and PASS** (2026-11-03, local; §3.1d) | Row complete. Org/coach/referee actors remain absent (only player + `super_admin` covered); expiry timing stays integration-only |
| P6-05 bookings/clubs | 4 rows (B1–B4, B7), 1 blocked-destructive (B6) | `cancel-booking` contract fixed 2026-10-28; fix venue spec; add conflict test (B5) |
| P6-06 marketplace/payments | 2 rows, both gateway-dependent (C1/C2) | Marketplace, subscriptions, accounting, refund UI **not covered** |
| P6-07 notifications/reports/settlements | D1 (blocked), D2, D5 | Reports, settlements, notifications beyond one deep link **not covered** |
| P6-08 responsive/a11y | E1/E2 (public surface only), E4, **E3 axe scan (local, 2026-11-02, light + dark)** | E3 **PASS** after fixes (A11Y-001…006 fixed and pushed; A11Y-007 excluded); consumer/admin pages still not scanned; E2 drawer gap open |
| P6-09 realtime | **F2 executed and PASS** (2026-11-03; §3.6b) and **F3 executed and PASS with an evidence limitation** (2026-11-03; §3.6c) | F1 (cross-session realtime update) still missing/not run. F3's evidence is the Playwright `passed` last-run status plus DB rows matching both phases — no assertion-level report — and the spec does not inject synthetic duplicate frames, so dedupe of injected duplicates remains unproven |

**Phase 6 acceptance (plan §11) remains NOT MET.** Executed evidence now exists — the 2026-11-02 Live runs (A2, A4 with observation, A5, A6 deny half, B4, B7, E1/E2 attributed, E4), the **2026-11-02 local E3 axe runs (§3.5b)** (first run FAIL → A11Y-001…006 fixed → re-run **PASS in both schemes, 48/48, 0 critical, 0 serious**, A11Y-007 open by decision), and the **2026-11-03 local P6-04 runs (§3.1d: A1–A8 all PASS)**, plus the **2026-11-03 local F2/F3 runs (§3.6b, §3.6c)** — F3 with the explicit evidence/scope limitation recorded there. The E3 fixes are **committed and pushed** (`2d08621c`, `4568771f`) and were built into the local frontend image on 2026-11-03 (`b4c0f4d01a0f`); the P6-04 test-side fixes and the E2E specs (including F1/F2/F3 and B5) are preserved in a **local commit** that has **not** been pushed. BLOCKED rows (B6, C1, C2), NOT RUN rows (B1–B3, D1, D2, D5) and MISSING/not-run rows (B5, C3–C6, D3, D4, F1) remain open, and E2's drawer gap is unresolved, so the phase cannot close.

## 6. Data safety and cleanup model

1. **No per-test cleanup.** Class W specs leave their rows behind in the **local development database** `courtzon_v3`
   (persistent Docker volume). The data is not treated as disposable by default; any cleanup is a separate,
   explicitly authorized operation under plan §10.5 that must name the target and affected tables. Tests never call
   `cleanup()` (`database.ts:82–89`).
2. **Target pinning.** `connect()` asserts `courtzon_v3` on loopback:3307 before opening a pool (`database.ts:23–26`).
3. **Destructive SQL is forbidden** in routine tests. `tournament-venue-flow.spec.ts:38–40` violates this
   (`SET FOREIGN_KEY_CHECKS=0`, `DELETE FROM resources/branches`) → **blocked**; the deletion must be removed or
   moved behind the authorized cleanup (P7-02) before execution.
4. **Fixtures** insert users/orgs/branches/resources/sessions with timestamped slugs so concurrent/earlier runs do
   not collide (`data/courts.ts`, `tournament-*.spec.ts`).
5. **External effects**: Class X rows must never hit Paymob in a generic test run. With
   `PAYMENT_GATEWAY_PROVIDER=mock` they are UI-only evidence; with Paymob they are **blocked** by P5-05.

## 7. Execution gating (what may run when)

| Tier | Rows | Preconditions |
|---|---|---|
| **T1 — read-only** | A2, A4, A5, B4, B7, E1, E2, **E3** | Stack running; for B4/B7/E1/E2 at least one public tournament must exist (test self-skips otherwise); E3 runs only against a **local frontend** (loopback `5173` Docker or `5174` local `vite preview`, allowlisted) and aborts every non-GET request; both colour schemes must be scanned; no DB writes |
| **T2 — DB-writing** | A1, A3, A6, A7, A8, B1, B2, B3, D1, D5 | Explicit approval naming the **local development database** `courtzon_v3` @ `127.0.0.1:3307` and the expected tables/impact; no per-test cleanup; evidence recorded per row; **never Live** |
| **T3 — gateway-dependent** | C1, C2 | Mock provider (UI-only evidence) or the deferred Paymob Sandbox (blocked) |
| **T4 — blocked** | B6 (destructive SQL) | Spec fix first (P6-10 / P7-02) |

Recommended execution order for P6-04…P6-09: T1 smoke → T2 auth/bookings → write the missing role/session rows →
marketplace/subscription/accounting rows → reports/settlements → responsive/a11y → realtime.

## 8. Traceability / change control

- Every row cites its spec at file:line where one exists; `MISSING` rows are the work items for P6-04…P6-09.
- Results must be appended to this file (or the progress document) with: run timestamp, config used, environment,
  `PASS/FAIL/BLOCKED/NOT RUN`, evidence path (trace/screenshot), and any fix + regression rerun (P6-10).
- Changing a spec's class (e.g. removing the destructive SQL) requires updating this matrix and the progress
  document in the same change.
- **E3 run record (2026-11-02, local):** config `e2e/playwright.config.ts` (`--project=a11y`), command
  `E3_THEME=light|dark npx playwright test --config e2e/playwright.config.ts --project=a11y --workers=2`,
  environment `127.0.0.1:5174` (local `vite preview` of a fresh build, behind a loopback router) + `127.0.0.1:3000`,
  commit `9230b155da5584f3e3847b358d3913bb829d56c4` (base at run time; the fixes were later committed in
  `2d08621c`/`4568771f` and pushed on 2026-11-03), axe-core `4.14.0`. Run 1 (dark only) **FAIL**;
  run 2 after fixing A11Y-001…006 (light + dark) **PASS — 48/48, 0 critical, 0 serious, 1 moderate/scan**.
  Evidence `test-results/e2e/a11y/*__{light|dark}.json` (48 files, gitignored) and `§3.5b`.
