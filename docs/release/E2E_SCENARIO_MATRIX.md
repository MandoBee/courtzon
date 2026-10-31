# CourtZon E2E Scenario Matrix (P6-02)

| Field | Value |
|---|---|
| Document | `docs/release/E2E_SCENARIO_MATRIX.md` |
| Plan item | **P6-02 — Persist the traceable scenario matrix (role, setup, action, expected, cleanup)** |
| Phase | 6 — Real UI and End-to-End Testing |
| Date | 2026-10-28 |
| Status | **Persisted inventory — execution NOT RUN** |
| Sources of truth | current working tree: `e2e/` specs/pages/fixtures/helpers, `playwright.config.ts`, `e2e/playwright.config.ts`, plan §10/§11, `INTEGRATION_SAFETY_ASSESSMENT.md` |
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
| **Class W** | Writes to the approved test DB (`courtzon_v3` @ `127.0.0.1:3307`) through fixtures/API |
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
| Test DB pin | `courtzon_v3` @ `127.0.0.1:3307`, asserted before connecting (`e2e/helpers/database.ts:23–26`) |
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

## 3. The matrix

### 3.1 P6-04 — Auth / session / role / permission

| ID | Role | Setup | Action | Expected | Cleanup | Spec (source) | Class | Status |
|---|---|---|---|---|---|---|---|---|
| A1 | Player | Insert test user (`insertUser`), login via UI | Submit valid phone/password | Redirect to `/app`, session cookie set | None per test; user row left for campaign cleanup | `e2e/scenarios/smoke/login.spec.ts:8–25` | W | NOT RUN |
| A2 | Anonymous | None | Submit invalid password | Visible error/alert; no session | None | `e2e/scenarios/smoke/login.spec.ts:27–36` | R | NOT RUN |
| A3 | Platform admin | Admin fixture logs in via API + UI | Open `/admin`, admin link, admin dashboard | `admin` nav visible; dashboard loads | None | `e2e/scenarios/admin/admin-dashboard.spec.ts:6–48` | W | NOT RUN |
| A4 | Anonymous | None | Navigate `/tournaments`, `/admin/tournament/list`, `/org/35/tournaments`, `/referee/assignments` | Redirect to `/login` or 4xx; no crash | None | `e2e/scenarios/tournament/p0-public-readonly.spec.ts:205–234` | R | NOT RUN |
| A5 | Anonymous | Stack up | `GET /health`; open `/` | 200; `#root` visible | None | `e2e/scenarios/smoke/health.spec.ts:4–12` | R | NOT RUN |
| A6 | Role matrix (player, admin; org/coach/referee actors absent) | Player + admin sessions seeded in the spec | API: player → `GET /admin/users` (403), `PATCH /bookings/1/status` (403), `POST /payments/1/refund` (403); admin → `GET /admin/users` (200). UI: player → `/admin/users` shows **Access denied**; admin → page renders | 401/403 before the handler; UI blocks the page | Logout both; no business rows created | `e2e/scenarios/auth/authz-session-isolation.spec.ts` (A6) | W | **AUTHORED — NOT EXECUTED (2026-10-28); pending approved DB-write window** |
| A7 | Player | One user, two seeded sessions | `POST /auth/logout {allDevices:true}` → other session `GET /auth/me` = `{user:null}` and a protected call = 401; refresh before/after revocation (rotation) | Immediate revocation (DB-backed session), 401 for revoked refresh | Sessions/audit rows remain | `e2e/scenarios/auth/authz-session-isolation.spec.ts` (A7) | W | **AUTHORED — NOT EXECUTED (4 tests); access-expiry timing stays integration-only** |
| A8 | Org A owner + unrelated user B | Two orgs/users (fixtures + `insertOrganisation`) | B → `GET /organisations/:orgA/bookings` (403, no data); B → `/org/:orgA/accounting/dashboard` (403); A → 200 | 403 without tenant data | Rows remain (campaign marker); no destructive cleanup | `e2e/scenarios/auth/authz-session-isolation.spec.ts` (A8) | W | **AUTHORED — NOT EXECUTED (2026-10-28); pending approved DB-write window** |

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
| A6 | **AUTHORED — NOT EXECUTED** | 2 (player allowed/denied + UI; admin allowed + UI) | Approved DB-write window + running stack; only player/admin actors available (org/coach/referee fixtures still absent) |
| A7 | **AUTHORED — NOT EXECUTED** | 4 (logout-all, single-logout isolation, refresh rotation, refresh after revocation) | Approved DB-write window + running stack; access-expiry timing intentionally left to `session-expiry.integration.spec.ts` |
| A8 | **AUTHORED — NOT EXECUTED** | 1 (cross-org bookings + accounting) | Approved DB-write window + running stack |

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
| B4 | Anonymous | ≥1 public tournament in DB | Open public list/detail; invalid id | List renders; detail identity; invalid id shows terminal error | None | `e2e/scenarios/tournament/p0-public-readonly.spec.ts:60–202` | R | NOT RUN (data-dependent; skip if no public tournament) |
| B5 | Player | Two contexts | Book the same slot simultaneously | Exactly one succeeds; other gets conflict UI | Cancel/refund per policy | — | — | **MISSING** |
| B6 | Org admin | Org-owned courts + external venue | Assign venue, override per competition, forged cross-org resource | Correct venue shown; forged resource rejected | Spec deletes fixed-slug rows itself | `e2e/scenarios/tournament/tournament-venue-flow.spec.ts:34–40` | W + **D** | **BLOCKED (spec runs `SET FOREIGN_KEY_CHECKS=0` + `DELETE` — violates the no-routine-destructive-cleanup rule; fix in P7-02)** |
| B7 | Anonymous | Public tournament | Mobile 390×844 detail + drawer | No page overflow; close control works | None | `p0-public-readonly.spec.ts:237–277` | R | NOT RUN |

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
  executed on the approved test DB.
- **Environment note:** cancellation can legitimately return `409` if an active `cancellation_policies` window exceeds
  the ~3-day fixture lead time (`_canUserCancel`, `booking.service.ts:1179–1208`); this is data-dependent, not a code
  defect.

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
| E1 | Anonymous | Public tournament | Desktop 1440×900 detail | No horizontal overflow; content renders | None | `p0-public-readonly.spec.ts:92–127` | R | NOT RUN |
| E2 | Anonymous | Public tournament | Mobile 390×844 | No page overflow; body non-empty | None | `p0-public-readonly.spec.ts:237–277` | R | NOT RUN |
| E3 | Any | Key pages | Automated axe/a11y scan | No critical/serious violations | None | — | — | **MISSING (no axe tooling installed — plan §13)** |
| E4 | Any | Key pages | Tablet 768/1024 widths | Layout intact, no clipped actions | None | — | — | **MISSING** |

### 3.6 P6-09 — Realtime and simultaneous booking

| ID | Role | Setup | Action | Expected | Cleanup | Spec (source) | Class | Status |
|---|---|---|---|---|---|---|---|---|
| F1 | Player | Two sessions | Create/cancel booking in one session | Other session updates without refresh | None | — | — | **MISSING** |
| F2 | Player | Two contexts | Simultaneous identical booking | One success, one conflict; slot never double-booked | Cancel/refund | — | — | **MISSING** (backend concurrency covered by P4-03/P5-06; UI not covered) |
| F3 | Player | Socket connected | Drop/reconnect network | Cache reconciles; no duplicate events | None | — | — | **MISSING** |

## 4. Existing spec inventory (13 files, 33 tests — verified by static count)

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
| `auth/authz-session-isolation.spec.ts` | 7 | A6, A7, A8 | W | **AUTHORED 2026-10-28 — not executed**; requires approved DB-write window + running stack (discovered by the `all` project) |

## 5. Coverage gaps against Phase 6 acceptance

| P6 task | Existing coverage | Gap / action |
|---|---|---|
| P6-04 auth/RBAC | 4 relevant rows (A1–A5) + **A6/A7/A8 authored** | Specs written 2026-10-28 (`e2e/scenarios/auth/authz-session-isolation.spec.ts`, 7 tests) but **not executed**; pending approved DB-write window + running stack. Org/coach/referee actors still absent |
| P6-05 bookings/clubs | 4 rows (B1–B4, B7), 1 blocked-destructive (B6) | `cancel-booking` contract fixed 2026-10-28; fix venue spec; add conflict test (B5) |
| P6-06 marketplace/payments | 2 rows, both gateway-dependent (C1/C2) | Marketplace, subscriptions, accounting, refund UI **not covered** |
| P6-07 notifications/reports/settlements | D1 (blocked), D2, D5 | Reports, settlements, notifications beyond one deep link **not covered** |
| P6-08 responsive/a11y | E1/E2 (public surface only) | No axe; no tablet; no consumer/admin page coverage |
| P6-09 realtime | none | All three rows missing |

**Phase 6 acceptance (plan §11) remains NOT MET**: the matrix exists, but there are **no executed results, no
failure evidence, no fixes and no regression reruns** yet.

## 6. Data safety and cleanup model

1. **No per-test cleanup.** Class W specs leave their rows behind (Amendment A1: existing `courtzon_v3` data is
   disposable and is cleared once, after the campaign, by the authorized procedure in plan §10.5). Tests never
   call `cleanup()` (`database.ts:82–89`).
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
| **T1 — read-only** | A2, A4, A5, B4, B7, E1, E2 | Stack running; for B4/B7/E1/E2 at least one public tournament must exist (test self-skips otherwise); no DB writes |
| **T2 — DB-writing** | A1, A3, A6, A7, A8, B1, B2, B3, D1, D5 | Explicit approval to write to `courtzon_v3`; no cleanup; evidence recorded per row |
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
