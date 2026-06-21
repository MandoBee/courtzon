# CourtZon-V2 — Engineering Improvement Plan & Handoff Spec

> **Purpose of this document.** This is a self-contained brief for an AI/engineer who has **no prior context** on this codebase. It explains what CourtZon-V2 is, how it is built, the confirmed bugs, the agreed scope, and a fully sequenced, detailed TODO list. Read it top to bottom before writing code. Every claim below was verified against the actual source on 2026-06-01.

---

## PROGRESS LOG (most recent first)

### 2026-06-02 — D2 OrganisationForm org context + A5b audit closure ✅
- **D2 ✅.** `OrganisationForm` org context routes branch/resource CRUD through `/org/:orgId/*`; `OrgBranchesPage` / `OrgResourcesPage` reuse the full form (`organisation-form-paths.ts`).
- **A5b ✅ (verified).** All mutating handlers in `organisation.controller.ts` already had `recordAudit`; added `organisation-audit.ts` and wired `org-portal.controller.ts` to `auditOrganisationMutation`.
- **Verification ✅.** `npm run build` (FE+BE).

### 2026-06-02 — D8 org facility members UI ✅
- **D8 ✅.** Org portal **Members** page for `branch_player_access` (restricted-branch facility membership). Backend: `GET /org/:orgId/members` (org access guard, filters `status`/`branchId`), `PUT /org/:orgId/members/:branchId/:playerId` (`org.members.manage` + branch ownership + audit). Reuses `branchRepository.getAllAccessRequests` / `updateAccessStatus`. Frontend: `OrgMembersPage` (table, branch/status filters, status dropdown gated by `org.members.manage`). Perms: `org.sidebar.members`, `org.members.manage` — registry + `sync-ui-registry.js` + `grant-new-perms.js` (org-admin/admin/super_admin).
- **Verification ✅.** `npm run build` (FE+BE). Run `node backend/scripts/sync-ui-registry.js` and `grant-new-perms.js` against your dev DB, then `docker compose build backend && docker compose up -d backend`. Human check: org-admin → **Members** → approve a pending request from a restricted branch.

### 2026-06-02 — G6 org + organisations module merge ✅
- **G6 ✅.** Folded the standalone `backend/src/modules/org` package into `backend/src/modules/organisations`: `org-portal.repository.ts`, `org-portal.service.ts`, `org-portal.controller.ts`, `org-portal.routes.ts` (`registerOrgPortalRoutes`). All `/org/:orgId/*` URLs unchanged; routes register at the end of `organisation.routes.ts` (shared `authMiddleware`). Removed `orgRoutes` from `app.ts` and deleted `modules/org/`.
- **Verification ✅.** `npm run build` in `backend/` exit 0. Rebuild backend Docker after pull: `docker compose build backend && docker compose up -d backend`.

### 2026-06-02 — G4 admin `any`-reduction (pragmatic pass) ✅
- **G4 ✅.** Added shared helpers `frontend/src/utils/errors.ts` (`getErrorMessage`) and `frontend/src/types/api.ts` + `frontend/src/types/admin/*` (dashboard, booking, common list shapes). **Fully typed template pages:** `AdminDashboard`, `BookingsPage`, `CouponListPage`, `AcademyAdminPage`, `TournamentAdminPage`, `OrganisationListPage` (`OrganisationSummary` + `country_iso`). **Bulk hardening:** `fix-admin-any-errors.mjs` migrated `(err as any).message` → `getErrorMessage` across admin; `fix-implicit-any-callbacks.mjs` restored `: any` on untyped arrow params after an over-aggressive strip (build was 138 TS errors → green). **Do not re-run** `strip-admin-explicit-any.mjs` / `fix-admin-mutation-types.mjs` without review.
- **Verification ✅.** `npm run build` + `npm run test` (6) exit 0.

### 2026-06-02 — G3 tests verified green ✅
- **G3 ✅ (verified).** **Backend unit:** 39 tests (`npm run test:unit`). **Backend integration:** 16 tests (`npm run test:int`) — auth (11), booking (3), HTTP smoke (2); Testcontainers MySQL 8 + Redis, `--fresh --seed` via `migrate.js` with `INTEGRATION_TEST=1`, `prepareSql()` rewrites `USE courtzon_v2` → active `DB_NAME`, JS seed via `backend/scripts/run-js-seed.mjs` + `mysql2` resolve from `backend/node_modules`. **Migration/seed fixes for fresh CI DB:** restored `readFileSync` in `migrate.js`; added `003a_seller_profiles.sql`; `021_geo_slugs` slug columns + MySQL-compatible indexes; `027` idempotent FK steps + correct `subscription_plan_rates` columns; `011` uses `DATABASE()` not hardcoded schema; `001_seed_core` currency-before-countries + slug-based org-type attributes + `INSERT IGNORE` tokens; `database/seed/run.mjs` loads mysql2 from backend package. **Frontend:** 6 tests (`Can`, `useCan`). **CI:** `backend-integration` job + FE `npm run test` before build.

### 2026-06-02 — G5 Dockerfile env injection (no baked secrets) ✅
- **G5 ✅.** Removed `COPY backend/.env ./` from `backend/Dockerfile` so secrets are never frozen into image layers; `docker-compose.yml` `env_file: .env` (project root) is the single runtime source (comment added). Root `.dockerignore` now excludes `**/.env` / `**/.env.*` while keeping `*.env.example` for docs. **`backend/scripts/load-file-env.js`** shared helper: `process.env` wins, then optional file fallbacks (`cwd/.env`, `backend/.env`) — used by `migrate.js` and `grant-new-perms.js` so container startup migrations work without `/app/.env` on disk.
- **Verification ✅.** `docker compose build backend; docker compose up -d backend` — container healthy, migrations run using injected env.

### 2026-06-02 — F5 chat/messaging frontend ✅
- **F5 — messaging UI ✅.** Wired the existing chat API (`GET/POST /community/conversations…`, behind `community.chat_enabled`) into a full player UI. **Backend:** `findConversations` now returns `other_user_*` + `last_message`/`last_message_at`; `isConversationParticipant` guard on read/send; conversation `updated_at` updated on send; `recordAudit` on send; start-conversation route moved to `GET /community/conversations/with/:otherUserId`; routes require `community.chat.view` / `community.chat.send`. **Frontend:** `MessagesPage` (conversation list + thread, 4s poll while open, compose gated by `community.chat.send`, + New message modal, `?with=` deep-link); navbar **Messages** (feature flag + perm); **Message** button on `CoachDetailPage`. **Perms:** `community.chat.view`, `community.chat.send` — registry + sync (2 inserted), granted to player/org-admin/admin/super_admin.
- **Verification ✅.** `npm run build` exit 0 (FE+BE); `sync-ui-registry.js` + `grant-new-perms.js`; backend Docker rebuild. Human check: enable `community.chat_enabled` in Feature Flags → open **Messages** → start chat via coach **Message** or user ID.

### 2026-06-02 — D5 org staff management + D6 org-initiated coach invites ✅
- **D5 — org staff management ✅.** Staff are modeled as users holding an **org-scoped role** (`user_role_scopes.scope_type='organisation'`) on the org — no new tables. New stricter guard **`requireOrgManageAccess`** in `route-guard.ts` (owner OR platform-admin OR a user whose org-scoped role on this org carries `org.staff.manage`) so scoped **org-sellers cannot** manage staff (unlike the looser `requireOrganisationAccess`). Endpoints in `org.routes.ts`/`org.controller.ts`: `GET /org/:orgId/staff` (list w/ user + role + owner flag), `POST` (add by email + role `org-admin`/`org-seller` — user must already be registered, owner rejected), `PUT /:userId` (change role), `DELETE /:userId` (remove) — all `recordAudit`. Repo (`org.repository.ts`): `addStaffScope` uses `INSERT IGNORE` on the scope and only re-activates the matching `user_roles` row (UNIQUE `uk_user_role` means one row per role across orgs — so it **never wipes scopes on other orgs**, unlike the shared `setUserRoleScope`); `removeStaffFromOrg` deletes only this org's scopes and **deactivates** any `user_roles` row left scope-less. Frontend `OrgStaffPage` (list + add modal + inline role `<select>` + remove, toasts), `<Can>`-gated, sidebar **Staff** link + route.
- **D6 — org-initiated coach invites ✅.** Migration **`061_coach_org_invites.sql`** (column-aware, registered + ran `OK`) adds `status ENUM('pending','accepted','rejected')`, `initiated_by ENUM('coach','org')`, `invited_by` to `coach_org_agreements`; existing rows backfill to `accepted`/`coach` (preserving current behavior). Org side: `GET /org/:orgId/coaches` (all agreements + status), `GET .../coaches/directory` (approved coaches not yet pending/accepted on this org), `POST .../coaches/invite` (creates a **pending** org-initiated agreement, validates coach+org split = 100%, coach must be `approved`), `DELETE .../coaches/:coachId` — all on `requireOrgManageAccess` + audited. Coach side: `POST /coaches/agreements/:id/respond {accept}` (perm `coaches.invites.respond`, audited `COACH.INVITE_ACCEPT`/`_REJECT`, only flips own `pending` org-initiated invites). Effective agreements (`findOrgAgreements`, shown on public coach profile) now require `status='accepted' AND is_active`; coach-initiated `upsertOrgAgreement` is auto-`accepted`. Frontend `OrgCoachesPage` (invite-from-directory modal w/ auto-balancing split, status badges, remove) + a **Pending Organisation Invites** Accept/Decline block in `CoachProfilePage` Organizations tab.
- **Perms.** New keys `org.staff.manage`, `org.sidebar.staff`, `org.coaches.manage`, `org.sidebar.coaches`, `coaches.invites.respond` registered in `registry.ts` + `sync-ui-registry.js` (sync = **5 inserted** / 480 updated), granted via `grant-new-perms.js` (org-admin/admin/super_admin get the org-manage set; player + admins get `coaches.invites.respond` → `granted=15`).
- **Verification ✅.** `npm run build` exit 0 for both `backend/` (tsc) and `frontend/` (tsc -b + Vite — new `OrgStaffPage` 5.32 kB & `OrgCoachesPage` 5.78 kB route-split chunks); no lint errors. `migrate.js` → `OK 061_coach_org_invites.sql`. **Backend Docker rebuilt + `up -d`** — container clean, `/health` → 200, migration also re-ran `OK` inside the container. Remaining human step: as an org owner/admin open Org → Staff (add a user, change role, remove) and Org → Coaches (invite an approved coach), then as that coach accept/decline the invite from Coach Profile → Organizations.

### 2026-06-02 — C6 coach weekly-availability model + UI ✅
- **C6 — weekly availability ✅.** Replaced the lone `coach_profiles.is_available` boolean (kept as a global master switch) with a real schedule model. **Migration `060_coach_availability.sql`** (registered in `migrate.js`, ran `OK`) creates two new tables: `coach_availability` (`coach_id`, `day_of_week` 0–6, `start_time`/`end_time` TIME, indexed by coach+day) and `coach_availability_blackouts` (`coach_id`, `blackout_date` DATE, `reason`, unique per coach+date) — both FK→`coach_profiles(id)` CASCADE; `CREATE TABLE IF NOT EXISTS` is the right idempotent guard for genuinely-new tables. **Backend (activities module):** repo methods `getCoachAvailability` (TIME_FORMAT HH:mm), `setCoachAvailability` (DELETE+INSERT in a **transaction**), `getCoachBlackouts(fromDate)`, `addCoachBlackout` (upsert), `removeCoachBlackout`, `findScheduledSessionsOnDate`. Service: `setMyCoachAvailability` validates `end > start` and rejects same-day overlapping ranges (`ValidationError`); `addMyCoachBlackout` runs **conflict detection** — 409 `ConflictError` if any `coach_sessions` with status `scheduled`/`in_progress` fall on that date. New DTOs `SetCoachAvailabilitySchema` (HH:mm regex) + `AddCoachBlackoutSchema` (YYYY-MM-DD). Routes: `GET|PUT /coaches/availability/me`, `POST /coaches/availability/me/blackouts`, `DELETE /coaches/availability/me/blackouts/:id` (all `requirePermission(['coaches.availability.manage'])` + `recordAudit` actions `COACH.AVAILABILITY_UPDATE`/`BLACKOUT_ADD`/`BLACKOUT_REMOVE`), plus public `GET /coaches/:id/availability` for player/booking consumption. Static `availability` segment doesn't collide with `/coaches/:id` (Fastify prioritises static routes). **Frontend:** added an **Availability** tab to `CoachProfilePage` — a 7-day weekly grid (`+ Add range` / time pickers / Remove per range, single Save) and a blackout section (date + optional reason add, list with Remove). Gated with `<Can permission="coaches.availability.manage">` and the in-body `can(...)` check; toasts on every mutation; queries invalidated on success.
- **Verification ✅.** `npm run build` exit 0 for both `frontend/` (tsc -b + Vite; `CoachProfilePage` chunk 20.6 kB, still route-split per G8) and `backend/` (tsc); no lint errors. `migrate.js` → `OK 060_coach_availability.sql`. `sync-ui-registry.js` → **1 inserted** (`coaches.availability.manage`) / 479 updated; `grant-new-perms.js` → granted to player/admin/super_admin (`granted=3`, `missingRoles=1` = the absent `super-admin` slug). **Backend Docker rebuilt + restarted** — container clean (`/health` → 200); `GET /coaches/availability/me` and `GET /coaches/1/availability` both → **401 unauthenticated** (routes registered + guarded). Remaining human step: log in as a coach → Coach Profile → Availability, set weekly ranges + a blackout, and confirm the 409 conflict guard when a date already has a scheduled session.

### 2026-06-02 — G2 OpenAPI/Swagger docs ✅
- **G2 — Swagger/OpenAPI ✅.** Added `@fastify/swagger@^9` (dynamic mode) + `@fastify/swagger-ui@^5`, registered in `app.ts` **before** all `app.register(routes)` calls so the plugin introspects every route. Configured OpenAPI 3 `info` (title/description/version), `servers`, and a `bearerAuth` HTTP security scheme documenting the opaque-session token from `POST /auth/login`. Swagger UI mounts at **`/docs`** (docExpansion list, try-it-out on); the spec is also exposed at **`/docs/json`** and an explicit **`/openapi.json`** (returns `app.swagger()`). **Security amendment:** exposure is env-gated — `isDev || ENABLE_API_DOCS==='true'` — so production hides the full API surface unless explicitly opted in; since the local Docker stack runs `NODE_ENV=production`, added `ENABLE_API_DOCS: "true"` to the backend service env in `docker-compose.yml` (documented as omit-in-real-prod). Added a **`/docs`-scoped CSP override** (`onRequest` hook registered after Helmet so it wins): the global CSP is `script-src 'self'`, but Swagger UI needs `'unsafe-inline'`, so docs get a relaxed policy while every other route keeps the strict CSP. No DB/permission/audit changes (infra/read-only docs).
- **Verification ✅.** `npm run build` (backend, tsc) exit 0, no lint errors. **Backend Docker rebuilt + restarted** (`npm ci` pulled the two new deps; container clean). `GET /openapi.json` → **200**, `openapi: 3.0.3`, title `CourtZon-V2 API`, **367 paths** captured (incl. the new `/metrics`, `/organisations/:id/storefront`). `GET /docs` → **200** with the relaxed CSP header; `/docs/static/swagger-initializer.js`, `/docs/static/swagger-ui.css`, and `/docs/json` all → **200** (UI renders). Remaining human step: open `http://localhost:3000/docs` in a browser and sanity-check the rendered UI / a "try it out" call.

### 2026-06-02 — G1 /metrics Prometheus endpoint ✅
- **G1 — `/metrics` ✅.** Added `prom-client` (`npm install prom-client` → in `package-lock.json`, so the Docker `npm ci` picks it up). New `backend/src/infrastructure/metrics/metrics.ts`: a `prom-client` registry with `collectDefaultMetrics` (process CPU/memory/heap/FDs, event-loop lag, GC — all `courtzon_`-prefixed, default label `app="courtzon-backend"`), a `courtzon_http_request_duration_seconds` **histogram** and `courtzon_http_requests_total` **counter** (labels `method`/`route`/`status_code`). `registerMetrics(app)` is wired in `app.ts` right after `/health`; it installs a root-scope `onResponse` hook that observes every request keyed by the **matched route template** (`request.routeOptions.url`) — deliberately not the raw URL, to avoid per-id label cardinality — and skips the scrape path itself. **Security amendment:** `/metrics` is optionally token-guarded via `METRICS_TOKEN` (Bearer header or `?token=`); unset → open, which is correct for the internal Docker-network scrape. Added `/metrics` to the `maintenance.middleware` whitelist so scraping survives maintenance mode. No UI/permission/audit needed (infra endpoint, read-only). `monitoring/prometheus.yml` already targets `backend:3000/metrics`.
- **Verification ✅.** `npm run build` (backend, tsc) exit 0, no lint errors. **Backend Docker rebuilt + restarted** — container clean (migrations OK, worker started, `:3000` listening). `GET /metrics` → **200** with the default `courtzon_process_*`/`courtzon_nodejs_*` series; after a few requests, `courtzon_http_requests_total{method="GET",route="/organisations",status_code="401"}` and the matching `_duration_seconds_count` appear with the route **template** (confirming low-cardinality labelling). `/health` is also captured. Remaining human step: bring up `docker-compose.monitoring.yml` and confirm the `courtzon-backend` Prometheus target shows **UP**.

### 2026-06-02 — G8 frontend code-splitting (route-level React.lazy) ✅
- **G8 — bundle code-split ✅.** Converted every page/layout import in `frontend/src/App.tsx` (~100 modules) from eager static imports to `React.lazy(() => import(...))`, and wrapped the `<Routes>` tree in a single `<Suspense fallback={<PageLoader/>}>` (a brand-spinner matching the existing guard loaders). Kept genuinely-always-rendered modules eager: the route guards + `Navbar` (defined inline), `BottomNav`, `InstallPrompt`, `NotificationBell` (rendered in the navbar), `Can`, `FeatureFlagGuard`, and all Zustand stores. **Outcome:** the previous monolithic `index-*.js` of **1,927 kB** is replaced by a **351 kB** entry chunk (gzip 110.9 kB) + a shared **296 kB** `ui-*.js` vendor chunk (gzip 90.7 kB), with ~120 per-route chunks loaded on demand (e.g. `DashboardPage` 5.5 kB, `AdminDashboard` 10.7 kB, heaviest page `UIPermissionsPage` 92 kB). The long-standing Vite ">500 kB chunk" warning is **gone**. PWA precache now lists 131 entries (all chunks) for offline.
- **Verification ✅.** `npm run build` in `frontend/` exit 0 (tsc -b + Vite), no lint errors. Pure frontend change — no migration, no permission/registry change, no backend or Docker rebuild required. Remaining human step: click through a few routes to confirm lazy chunks load with the spinner fallback (no flashes/blank states).

### 2026-06-02 — F3 player org storefront/profile page ✅
- **F3 — org storefront for players ✅.** Players can now open a facility's profile page. **Backend:** added a dedicated player-safe endpoint **`GET /organisations/:id/storefront`** (under `organisationRoutes`, so behind `authMiddleware`; read-only → no audit per the A5b GET convention) backed by a new `organisationService.getStorefront(id)`. It returns **only curated public fields** — `id/public_id/name/slug/description/logo_url/cover_url/email/phone/website/org_type_slug/rating_avg/rating_count/is_verified` plus the org's **active branches** (id/name/slug/description/city/address/access_type/rating/hours) — and deliberately **omits** `financial_details`, `cr_number`/`tax_id`, `owner_id`, and `documents`; it 404s when the org is inactive/soft-deleted. Registered the route **before** the `/organisations/:id` param route so it isn't shadowed. **Frontend:** new `pages/organisations/OrgStorefrontPage.tsx` — cover banner + logo avatar, name with Verified pill, org-type + rating line, description, tap-to-contact (phone/email/website), and a responsive branch grid. Extracted the inline `BranchAccessControl` out of `BrowseBranchesPage` into a shared `components/branches/BranchAccessControl.tsx` and reused it on the storefront's restricted branches (request-access flow with toasts intact). Route `/organisations/:orgId` added under `AppLayout`. `BrowseBranchesPage` now attaches the owning org to each branch and shows a gated **"by {org name}"** link into the storefront. **Permissions:** new `organisations.storefront.view` (page) registered in `registry.ts` + `sync-ui-registry.js`, gating both the storefront entry link and listed in `grant-new-perms.js`. No new DB migration needed (reuses existing org/branch tables).
- **Verification ✅.** `npm run build` exit 0 for both `frontend/` (tsc -b + Vite; main chunk still ~1.9 MB — G8) and `backend/` (tsc). `sync-ui-registry.js` → **1 inserted** (`organisations.storefront.view`) / 478 updated; `grant-new-perms.js` → granted the new key to player/org-admin/admin/super_admin (`granted=4`, `missingRoles=1` = the non-existent `super-admin` slug, expected per A6). **Backend Docker rebuilt + restarted** (`docker compose build backend; docker compose up -d backend`): migrations 056–059 `OK`, worker `default` started, `Server listening at :3000`, `GET /health` → 200, and `GET /organisations/1/storefront` → **401 unauthenticated** (route registered + auth-guarded; would be 404 if unregistered). Remaining human step: visual confirmation of the storefront page (player login → Browse → "by {org}" link) and the branch request-access flow on it.

### 2026-06-02 — Follow-up pass: A5b admin-org audit gap + D4 + F2 ✅
- **D4 — `OrgSettingsPage` now uses a true org-scoped update path ✅.** Previously `OrgSettingsPage` rendered `OrganisationForm` with `context="admin"`, whose org-level save hit the **admin-only** `PUT /organisations/:id` (`adminGuard`) — so org admins couldn't actually save their own profile. Added a new org-scoped endpoint **`PUT /org/:orgId/info`** guarded by `requireOrganisationAccess` (`orgAccessGuard`) + `recordAudit('ORGANISATION.UPDATE')`, delegating to `organisationService.updateOrganisation`. The handler **strips privilege-escalation fields** (`isVerified`/`isActive`/`ownerId`) so self-service can't self-verify/activate or reassign ownership. Frontend: added a third `context` value `'org'` to `OrganisationForm`; its org-level `updateMutation` and `branchFinMutation` route to `/org/:orgId/info` when `context==='org'`; `OrgSettingsPage` now passes `context="org"`. Branch CRUD inside the form continues to work via the existing `branchGuard` perms; resource management for org admins remains on the dedicated, ownership-scoped `OrgResourcesPage` (D). 
- **F2 — player branch-access request UI ✅.** `BrowseBranchesPage` now renders a `BranchAccessControl` on every non-`open` facility card: it reads `GET /branches/:branchId/my-access` and shows a tinted status pill (approved → `--color-success-*`, pending → `--color-warning-*`, denied → `--color-error-*`) or a **Request access** button that calls `POST /branches/:branchId/request-access` (toast on success/error, query invalidation, `preventDefault`/`stopPropagation` so it doesn't trigger the card's navigation). Gated by a new `branches.request-access` permission (registered in `registry.ts` + `sync-ui-registry.js`, granted to player/admin/super_admin via `grant-new-perms.js`). The request/my-access endpoints already existed; the POST is audited as part of the A5b sweep below (`BRANCH_ACCESS.REQUEST`).
- **A5b admin-org audit gap — closed ✅.** `recordAudit(...)` added to every mutating handler in the admin `organisations.controller.ts` (sports/org-types/organisations/branches/resources/plans/payment-methods/gateways/cancellation/holidays/maintenance + branch-access approve/reject/request), using `ENTITY.VERB` actions. Read-only GET handlers untouched.
- **Verification ✅.** `npm run build` exit 0 for both `frontend/` (tsc -b + Vite) and `backend/` (tsc). `sync-ui-registry.js` → 1 inserted (`branches.request-access`) / 477 updated; `grant-new-perms.js` → granted the new key to player/admin/super_admin (idempotent). **Backend Docker rebuilt + restarted** (`docker compose build backend; docker compose up -d backend`) — container came up clean: migrations 058/059 `OK`, `Server listening at :3000`, worker `default` started, `GET /health` → 200. Remaining human step: visual confirmation of the org-settings save (org-admin login), the browse-page request-access flow, and the admin branch-access approval queue.

### 2026-06-01 — Workstreams A (finish), C, D, E, F, G swept to completion / honest deferral
- **A2 — jobs verified ✅.** Backend container logs show `Worker started: default` then `Processing: cancel_expired_bookings` → `Completed`, confirming the BullMQ queue/worker share `DEFAULT_QUEUE_NAME` and the worker drains the default queue.
- **A6 — role slugs verified ✅ (no code change).** Live `roles` table has **no** `super-admin` slug (canonical is `super_admin`), but other hyphenated slugs (`org-admin`, `player-seller`) **are** active. The dual hyphen/underscore acceptance is therefore load-bearing; removing it would break real roles. Left as-is by design (reclassified bug → confirmed non-issue).
- **A5b — permission + audit sweep ✅ (marketplace/wallet/payment) + coaches (in C).** Added `recordAudit(...)` to every state-changing handler in `marketplace.controller.ts` (24 handlers — products, variants, cart, wishlist, addresses, orders, seller upgrade/approve/reject/shop, settlements, reviews, admin product/seller/review actions), `payment.controller.ts` (charge/refund/webhook), `wallet.controller.ts`, and the four marketplace admin-taxonomy controllers (tag/brand/category/sport-category). Guards were already present on these routes. **Remaining gap (noted):** the admin `organisations.controller.ts` mutations are guarded (`adminGuard`/`branchGuard`) but not all audited — the **org self-service** path added in D is fully audited; the admin path audit is a small follow-up.
- **C — coach model consolidated onto `coach_profiles` ✅.** New idempotent migration `059_coach_profiles_status.sql` (registered, ran `OK`) adds `coach_profiles.status ENUM('none','pending','approved','rejected')` + `rejected_reason`, backfills from the legacy `player_profiles` columns, and indexes `status` (all via `cz_add_column`/`cz_add_index` procs). **Reads now come from `coach_profiles`:** `user.repository` (login/me) and `rbac.repository.getUserById` derive `is_coach = (cp.status='approved')` and `coach_status = COALESCE(cp.status,'none')` via `LEFT JOIN coach_profiles`; `activities.repository` coach directory filters on `cp.status='approved'`, `getCoachStatus` reads `coach_profiles`, and the admin coach list orders by `cp.status`. **Writes are dual-written** to keep the legacy `player_profiles` columns in sync for one transition (apply, reset, admin isCoach toggle, approve/reject) — `coach_profiles` is the source of truth, legacy columns dropped in a later migration. Admin approve/reject already audited. **C5** was already done; **C7 (review UI)** added on `CoachDetailPage` (star picker + text → `POST /coaches/:id/reviews`, toast, gated by new `coaches.reviews.create` perm, backend `recordAudit`). **C6 (weekly availability):** kept the boolean `is_available` with the limitation noted — full weekly-availability model deferred.
- **D — org self-service for branches & resources ✅ (core); staff/members deferred.** Backend: new **org-scoped** endpoints under `/org/:orgId/branches[/:branchId]` and `/org/:orgId/resources[/:resourceId]` (list/create/update/delete) guarded by `requireOrganisationAccess` with ownership checks (`branchBelongsToOrg`/`resourceBelongsToOrg`), Zod validation (reusing `CreateBranch/ResourceSchema`, auto-slug), and `recordAudit` on every write — delegating to the existing `organisationService`. Frontend: `OrgBranchesPage` & `OrgResourcesPage` rewired from the broken `/.../new` links to working **create/edit/delete modals** (TanStack mutations + toasts) hitting the org-scoped endpoints; org-admin already holds `branches.*`/`resources.*` perms so the buttons show. **Deferred (noted):** D2's full `OrganisationForm` reuse (modals chosen instead — lower risk), D4 `OrgSettingsPage` context switch, D5 staff management, D6 org-initiated coach invites, D8 membership UI.
- **E — mobile-first & PWA ✅.** E1: `BottomNav` now rendered in `AppLayout` (with `pb-24 md:pb-6` so content clears it). E2: `AdminLayout`/`OrgLayout` turn the sidebars into off-canvas drawers under `md` (hamburger + overlay, auto-close on navigate). E4: generated real `icon-192.png`/`icon-512.png` (rasterized from `favicon.svg` via `sharp`, `backend/scripts/gen-pwa-icons.js`), aligned `theme_color` to brand emerald `#059669` across `index.html` + `manifest.json` + `vite.config.ts`, replaced inline-base64 icon links. E5: `InstallPrompt` component (captures `beforeinstallprompt`, dismissible). E6: Workbox `runtimeCaching` (stale-while-revalidate) for read-heavy GETs (branches/products/coaches/academies/tournaments/sports). E7: removed `maximum-scale=1.0` from the viewport meta (restores pinch-zoom). E3 is effectively covered by the bottom nav for the primary mobile flows.
- **F — ghost-feature gaps (partial) ✅.** F1: Enroll button on `AcademyDetailPage` (curriculum picker → `POST /academies/:id/enroll`, toast, gated by `academies.enroll`, backend `recordAudit`). F4: added **Facilities** (`/browse`) and **Coaches** (`/coaches`) links to the player navbar for discoverability. **Deferred (noted):** F2 branch-access request UI, F3 org storefront page, F5 chat/messaging frontend.
- **G — hardening (done).** G1–G5, G7–G8, and G6 `org`/`organisations` module merge are done (see Workstream G).
- **Verification ✅.** `npm run build` passes for both `backend/` (tsc, exit 0) and `frontend/` (tsc -b + Vite, exit 0). Migrations 058 + 059 ran `OK`. `sync-ui-registry.js` → 1 inserted (`coaches.reviews.create`) / 476 updated. `grant-new-perms.js` granted the new keys to player/org-admin/admin/super_admin (idempotent). Backend Docker rebuild was **pending at session end** — Docker Desktop was down after the power cut and was relaunched; run `docker compose build backend; docker compose up -d backend` once the engine is up. Manual mobile/PWA UI confirmation is the remaining human step.

### 2026-06-01 — Workstream B (Appearance Studio) finished (tints + B9 sweep + legacy cleanup)
- **Status tint tokens ✅ DONE.** New migration `database/schema/058_status_tint_tokens.sql` (registered in `migrate.js`, ran `OK`; idempotent `INSERT IGNORE` on the unique `token_key`) seeds 8 tokens under a new `tint` category: `color-{success,warning,error,info}-{bg,text}`. Added the same vars to `frontend/src/index.css` `:root` (light) and `.dark` (dark-adapted), and a new **"Status tints"** group in `frontend/src/theme/tokens.ts` `TOKEN_GROUPS`. These unlock theming the light-tint badges.
- **B9 brand-color sweep ✅ DONE.** Converted the shared `frontend/src/components/ui/Badge.tsx` to drive `success/warning/danger/info` off the new tint pairs (so every `<Badge>` themes automatically — highest-leverage change), then swept the remaining high-traffic pages (admin dashboards, org portal, marketplace seller/orders/cart/product, coaches, matches, profile/wallet): semantic success/warn/error text & solid buttons → `var(--color-success|warning|error)`; light-tint status pills → the new `*-bg/*-text` tokens (dropped now-redundant `dark:` variants). Left intentionally-distinct accents (WhatsApp green, star gold, indigo/purple/orange multi-status pills, info banners, PreRegister category cards, neutral grays). `Button` was already themed.
- **Legacy tokens tidied ✅ DONE.** The `design_tokens` table also carries legacy snake_case seed keys (`primary_color`, `accent_color`, `secondary_color`, `logo_url`, `favicon_url`, `border_radius`, `header_height`, `sidebar_width`, `error_color`/`info_color`/`success_color`/`warning_color`, `font_family_*`, `font_size_base`) that map to **no** live CSS var (the app reads kebab-case `--color-*`). **Decision: hide them from the editor** rather than risk a lossy/conflicting migration into canonical keys. Added `isCssVarToken()` to `theme/tokens.ts` (a token maps to a CSS var iff its key has no underscore); `DesignTokensPage` now filters them out of the editor + preview, and `applyThemeMap` skips applying them at runtime. The public endpoint still returns them (harmless, reversible) but nothing reads them.
- **Verification ✅.** `npm run build` passes for both `frontend/` (tsc -b + Vite, exit 0) and `backend/` (tsc, exit 0). Migration 058 ran `OK`; `node backend/scripts/sync-ui-registry.js` ran clean (0 inserted / 476 updated — no new permission keys needed; the tints live inside the existing Appearance Studio gated by `design-tokens.edit`). Backend container rebuilt + recreated (`docker compose build backend` → `up -d backend`); `GET /public/theme` now returns all 8 `color-*-bg/-text` tints. Programmatically round-tripped the §7-B mechanism against the live endpoint: publishing a new `color-primary` (#7C3AED) is reflected in `/public/theme`, and rollback restores the prior value (#059669) — buttons/links read `var(--color-primary)`, so they recolor on reload; the selected Google font loads via `loadGoogleFont` (B10). Final manual UI confirmation in `/admin/design-tokens` is the remaining human step.

### 2026-06-01 — Workstream B (Appearance Studio) executed
- **B1 ✅ DONE.** `database/schema/057_appearance_studio.sql` (registered in `migrate.js`, ran `OK`): column-aware `ALTER` adds `draft_value VARCHAR(255)` + `is_published TINYINT(1) DEFAULT 1` to `design_tokens`; new `design_token_versions` table (`id`, `label`, `snapshot JSON`, `published_by`, `published_at`) for rollback; seeds the canonical token set mirroring `frontend/src/index.css :root` (brand/semantic colors, fonts incl. a `font-google-family` token, radii, shadows, gradients) via `INSERT IGNORE`.
- **B2 ✅ DONE.** Public, unauthenticated `GET /public/theme` returns the published tokens as a flat `{ token_key: current_value||default_value }` map (`Cache-Control: public, max-age=60`). New `publicThemeRoutes` registered in `app.ts`.
- **B3 ✅ DONE.** Admin endpoints in the `design-tokens` module: `GET /design-tokens/studio` (tokens + version history), `PUT /design-tokens/theme` (save drafts), `POST /design-tokens/publish` (snapshot current → promote drafts→current, clear drafts), `POST /design-tokens/rollback/:versionId` (snapshot-then-restore, so a rollback is itself reversible). All write ops `recordAudit` (`DESIGN_TOKEN.SAVE_DRAFT|PUBLISH|ROLLBACK`). Guards use OR semantics (`settings.edit` OR `design-tokens.{edit,publish,rollback}`) so existing admins aren't locked out.
- **B4/B5/B10 ✅ DONE.** `frontend/src/theme/tokens.ts` (token_key↔CSS-var mapping `--${key}`, `applyThemeMap`, Google-font `<link>` injection, editor groups + curated font list) + `frontend/src/store/appearance.store.ts` (hydrates from `localStorage` at import time for instant paint, then `fetch()` revalidates from `/public/theme`). Wired into `App.tsx` boot. Selected Google font is now actually loaded (B10).
- **B6/B7 ✅ DONE.** `DesignTokensPage.tsx` rebuilt as the visual **Appearance Studio**: grouped sections (Brand/Semantic colors, Typography, Radius, Shadows, Gradients), color pickers, radius sliders, font dropdown, free-form fields; a **scoped live preview pane** (inline CSS vars) rendering real `Button`/`Card`/`Badge`/`Input` samples; Save draft / Publish (with confirm) / per-version Revert, all toasted per §3.2. Sidebar label renamed "Appearance Studio".
- **B8 ✅ DONE.** Registered `design-tokens.publish` + `design-tokens.rollback` in `frontend/src/permissions/registry.ts` and `backend/scripts/sync-ui-registry.js`; ran the sync (3 inserted / 473 updated) and granted the new keys to the role that already holds `design-tokens.edit` (super_admin).
- **Verification ✅** `npm run build` passes for both `backend/` (tsc exit 0) and `frontend/` (tsc -b + Vite exit 0). Migration 057 ran `OK`; registry synced.
- **Deploy ✅ DONE.** Backend container rebuilt + recreated (`docker compose build backend` → `up -d backend`); image compiled clean and the container logs `Server listening`. `GET http://localhost:3000/public/theme` returns the live token map (the new `color-*`/`radius-*`/`shadow-*`/`gradient-*` keys alongside pre-existing legacy `*_color` seed tokens).
- **B9 (component color cleanup) — first pass ✅.** Converted the brand-primary raw Tailwind classes on the highest-traffic public surfaces to theme vars so the Appearance Studio recolors them: landing blocks (`HeroBlock`/`CTABlock`/`StatsBlock` — emerald text tints → `text-white/x`, on-white CTA label → `var(--color-primary-dark)`), `LandingPage` (spinner + link → `var(--color-primary)`), `App.tsx` LandingRoute spinner, auth success icons (`Forgot`/`ResetPassword` → `var(--color-success)`), and `PlayerRegisterPage` (emerald gradients → `var(--gradient-primary)`, success icon → `var(--color-success)`).
- **B9 — STILL REMAINING (deferred per §8):** the broader sweep across admin/org/marketplace pages. Note most leftover `green-*`/`emerald-*` are **semantic success / category badges** (e.g. status pills, "Approved", credit amounts) that correctly map to `--color-success` or are intentionally distinct category accents (e.g. PreRegister player/org/seller cards) — they are NOT brand-primary leakage. Light-tint badge pairs (`bg-green-100 text-green-700`) were left as-is since there is no `--color-success-bg`/`-text` token pair yet.

### 2026-06-01 — G7 (frontend production build unblocked) ✅
- **G7 ✅ DONE.** `npm run build` in `frontend/` now passes (tsc exit 0 + Vite produces `dist/`). Fixed all ~30 pre-existing TypeScript errors:
  - **Real bugs:** `BookingConfirmationPage.tsx` (moved `qrToken` below the `useQuery` — it referenced `booking` before declaration); `Pagination.tsx` (`onPageSizeChange` made optional + selector only renders when provided — fixes `SessionsPage`); `UploadSecurityPage.tsx` (Recharts `label` callback no longer destructures non-existent `mime_type`; guards `percent` with `?? 0`); `OrganisationForm.tsx` (cast tab values to the state union at both `setFormTab`/`setBranchFormTab` call sites).
  - **Unused locals/imports:** removed unused `user`+import in `RouteGuard.tsx`, unused `setPage` in `DesignTokensPage.tsx`, unused `statusFilter`/`setStatusFilter` in `OrganisationListPage.tsx`, unused `BarChart`/`Bar` in `FailedLoginsPage.tsx`, and fully-unused recharts import lines in `SecurityDashboard.tsx` + `SystemHealthPage.tsx`.
  - **Implicit `any`:** annotated the `setForm((f: any) => …)` updater param in `CouponListPage.tsx` (11), `AcademyAdminPage.tsx` (2), `TournamentAdminPage.tsx` (2).
  - **Note (not fixed, non-blocking):** Vite warns the main JS chunk is ~1.9 MB (no code-splitting). Logged as a follow-up perf item (G8). Build still succeeds.

### 2026-06-01 — C5 (coach session history) + a new finding
- **C5 ✅ DONE.** Built the missing `/coaches/sessions/me` page. New file `frontend/src/pages/coaches/CoachSessionsPage.tsx` (lists sessions with status badges + price; has an "As Player"/"As Coach" toggle shown only to coaches via `useCan('coaches.create_sessions')`). Route added in `App.tsx` (before `/coaches/:id`). Backend: `getMyCoachSessionsHandler` now accepts a `role` query param (`player|coach`, default `coach`) so the player booking flow that lands here shows the player's own sessions; repository query (`findCoachSessions`) now also joins the coach's user name (`coach_name`). Permission `coaches.sessions.view` registered in both `frontend/src/permissions/registry.ts` and `backend/scripts/sync-ui-registry.js` (run `node backend/scripts/sync-ui-registry.js` to push it). Route is NOT hard-gated (matches sibling coach routes; backend already scopes to the caller's own sessions). Backend `npm run build` passes; new frontend file is lint-clean.
- **🟠 NEW FINDING — frontend production build is currently RED (pre-existing).** `npm run build` in `frontend/` fails at `tsc -b` with ~30 pre-existing TypeScript errors (unused locals, implicit `any`, a couple of real type bugs) across `OrganisationForm.tsx`, `RouteGuard.tsx`, `AcademyAdminPage.tsx`, `CouponListPage.tsx`, several `admin/security/*` pages, and `BookingConfirmationPage.tsx` (the last is a real `used before declaration` bug). NONE are from C5. Impact: the app can run under Vite dev (no typecheck) but **cannot produce a production build** until these are fixed. Added as item **G7** below. This also means "verify frontend via `npm run build`" is not currently a usable gate.

### 2026-06-01 — Workstream A (P0 correctness) executed
- **A1 ✅ DONE.** Fixed the BullMQ producer/consumer mismatch. `backend/src/infrastructure/queue/queue.service.ts` now enqueues all jobs onto a single shared queue via the new exported `DEFAULT_QUEUE_NAME` constant; `worker.ts` imports the same constant for its default. Producer and consumer can no longer drift. Background jobs (expired-booking cancellation, daily backup, settlements, email) will now actually run.
- **A3 ✅ DONE.** Rewrote `database/schema/029_security_indexes.sql`. It is now idempotent and column-aware via a `cz_add_index` stored procedure that checks `information_schema` and only creates an index when (a) it doesn't already exist and (b) all its columns exist. Corrected all column references to the real schema (`products.seller_id`, `order_items.seller_id`, `orders.buyer_id`, `bookings.organisation_id/resource_id/booking_date/booking_status`, `wallet_transactions.wallet_id`, `transactions.type/status`, etc.). Safe to re-run.
- **A4 ✅ DONE.** Root cause was deeper than expected: `settlement.repository.ts` uses a **hybrid** schema (`organisation_id` from the 037 design + `settlement_type`/`settlement_period_*`/`gross_amount`/`commission_amount`/`settlement_status`/`processed_at` from the 007 design), so **neither** existing table shape matched the code. Added `database/schema/056_settlements_reconcile.sql` — a column-aware idempotent migration that ensures all required columns exist (helper `cz_add_column`), backfills `organisation_id` from legacy `club_id` (helper `cz_copy_col`), and adds an org index. Registered in `backend/scripts/migrate.js`. **NOTE: this fix was urgent precisely because A1 will now let the settlement cron run — before A1 the cron never executed, masking the schema mismatch.**
- **A5 ✅ DONE (booking hot-path).** Found a real privilege-escalation hole: `PATCH /bookings/:id/status` and `PATCH /bookings/:id/payment` had **no authorization** — any authenticated player could mark any booking paid/completed. Both are now gated with `requirePermission(['admin.bookings.update-status', 'org.bookings.manage'])` (OR semantics; players have neither, admins/org managers have one). Added `recordAudit` (`BOOKING.UPDATE_STATUS`, `BOOKING.UPDATE_PAYMENT`) to both handlers. **Remaining (carried forward):** a broader sweep of marketplace/org mutating endpoints for permission+audit coverage — see A5b below.
- **A6 ⏸ RECLASSIFIED (not done, by design).** The `super_admin` vs `super-admin` split is **defensive, working code** — guards accept both forms; canonical seed slug is `super_admin`. Removing the hyphen acceptance risks locking out any DB role that uses the hyphen slug, which cannot be confirmed without inspecting the live `roles` table. Reclassified from P0 bug → "verify-first cleanup" (A6 below). Do NOT remove the hyphen acceptance until a DB audit confirms no role uses it.
- **Verification ✅** `npm run build` in `backend/` passes (tsc exit 0). No linter errors on edited files. Migrations 029/056 not yet run against a live DB (requires DB access + Docker) — see "How to verify A" below.

**How to verify Workstream A (run when you have DB + Docker access):**
1. `node backend/scripts/migrate.js` — expect `OK 029_security_indexes.sql` and `OK 056_settlements_reconcile.sql`.
2. `docker compose build backend && docker compose up -d backend`.
3. Watch backend logs for `Worker started: default`, then `Processing: cancel_expired_bookings` / `Completed: ...` within ~15 min.
4. Confirm a stale pending booking auto-cancels; confirm `/admin/settlements` and the settlement cron run without SQL errors.
5. As a plain player, confirm `PATCH /bookings/:id/payment` now returns 403.

---

## 0. How to use this document

- Sections 1–4 give you the context you need (what the app is, the stack, the conventions you MUST follow, and the agreed decisions).
- Section 5 lists the **confirmed bugs** with exact root cause and the fix.
- Section 6 is the **workstream-by-workstream TODO list** (this is the build order).
- Section 7 has acceptance criteria and how to verify.
- **Do not skip Section 3 (Conventions).** This repo has strict, non-negotiable rules around permissions, migrations, and the build/deploy loop. Violating them silently breaks the app.

---

## 1. What CourtZon-V2 is

CourtZon-V2 is a **multi-tenant sports facility platform**. Four personas:

1. **Player** — books courts/sessions, buys from the marketplace, joins academies, books coaches, plays public matches.
2. **Organization** — a tenant. One unified model covers **Sports Club, Sports Academy, GYM, Clinic, Shop**. Differentiated by `org_type_id` + EAV attributes, not separate tables.
3. **Super Admin** — platform operator. Manages orgs, users, permissions, finance, CMS, security, theming.
4. **Coach** — has a profile, sessions, availability, and revenue-split agreements with orgs.

**Tenancy model:** single shared MySQL database, logical isolation by `organisations.id` (and `branches.organisation_id`). No row-level security; isolation is application-enforced via query filters + RBAC scopes (`user_role_scopes`).

---

## 2. Tech stack & architecture

### Frontend (`frontend/`)
- **React 19 + Vite 8 + TypeScript**, SPA.
- **TanStack Query** (server state) + **Zustand** (client state: `auth.store.ts`, `theme.store.ts`, `feature-flags.store.ts`).
- **Tailwind CSS 3** + **CSS custom properties** defined in `frontend/src/index.css` (`:root { --color-primary: #059669; ... }`). Dark mode via `.dark` class toggled by `theme.store.ts`.
- Custom UI primitives in `frontend/src/components/ui/` (`Button`, `Input`, `Card`, `Badge`, `Modal`, `Toast`, `Spinner`, `Pagination`, `Sparkline`).
- **Single routing file:** `frontend/src/App.tsx` (~406 lines). Route guards (`ProtectedRoute`, `AdminRoute`, `OrgRoute`, `PublicRoute`, `LandingRoute`) are defined inline there.
- **vite-plugin-pwa** + Workbox (precache only; no install prompt, no data caching).
- i18n: lightweight hand-rolled (`en`, `ar`, RTL via `dir`); most strings hardcoded English.
- **No frontend tests.**

### Backend (`backend/`)
- **TypeScript (ESM, strict) on Node 22**, dev via `tsx watch`.
- **Fastify 5** (NOT Express/Nest).
- **MySQL 8** via `mysql2/promise` — **raw parameterized SQL, no ORM.**
- **Redis** (`ioredis`) + **BullMQ** for jobs; **Zod 4** validation; **Pino** logging; **Sharp** image processing; **Nodemailer** (log transport by default).
- Modular layout under `backend/src/modules/<name>/` with `presentation/` (routes, controller, dto), `application/` (services), `infrastructure/` (repositories = raw SQL), and a thin `domain/`.
- **Auth = DB-backed opaque sessions** (NOT JWT). `Authorization: Bearer <sessionToken>` looked up in `user_sessions`. Refresh rotation + device fingerprint (`X-Device-Fingerprint`). Passwords PBKDF2-SHA512, 210k iterations.
- Security: Helmet/CSP, CORS whitelist, `@fastify/rate-limit`, brute-force lockout (Redis), audit logging, upload hardening (magic-byte + Sharp re-encode), maintenance-mode middleware.
- **No OpenAPI/Swagger. Only ~7 test files. No `/metrics` endpoint** (Prometheus config exists but scrapes nothing).

### Database (`database/`)
- **MySQL 8 / InnoDB / utf8mb4.** ~130 tables, ~59 sequential migrations `000_*` → `055_*`.
- Migration runner: `backend/scripts/migrate.js` (reads `database/schema/`, has an explicit ordered file list).
- Key tables: `users` (single identity table) + `player_profiles` (1:1) + RBAC (`roles`, `user_roles`, `role_permissions`, `permissions`, `permission_modules`, `user_role_scopes`). Tenants: `organisations` → `branches` → `resources`. Theming: `design_tokens`, `system_settings`, cascading `organisation_settings`/`branch_settings`/`resource_settings`.

---

## 3. CONVENTIONS YOU MUST FOLLOW (from `AGENTS.md`)

These are mandatory. Breaking them silently breaks features.

### 3.1 Permissions / UI gating (single source of truth)
- Every UI element (page/tab/button/section/action/field) is registered in `frontend/src/permissions/registry.ts` with a flat `permissionKey` (e.g. `users.export`).
- **Never hardcode role checks** like `user.roles?.includes('seller')` for UI gating. Use `<Can permission="key">` or `useCan().can('key')`.
- Form fields use `elementType: 'field'`, named `{module}.{entity}.{field-name}` (e.g. `organisations.edit.name`).
- After adding entries: also add them to `backend/scripts/sync-ui-registry.js`, then run `node backend/scripts/sync-ui-registry.js`.
- Assign new permissions to the appropriate roles (admin gets all by default).

### 3.2 Toast on every mutation
- Global toast at `frontend/src/components/ui/Toast.tsx`. `const { showToast } = useToast();`
- On every create/update/delete: success toast in `onSuccess`, error toast in `onError`. Use `'warning'` + action for undoable deletes.

### 3.3 Migrations
1. Write SQL file in `database/schema/NNN_name.sql`.
2. **Add it to the ordered list in `backend/scripts/migrate.js`** (a file not in the list never runs).
3. Run `node backend/scripts/migrate.js` from project root.
- Use `CREATE TABLE IF NOT EXISTS` carefully — see the `settlements` collision bug (§5.3); `IF NOT EXISTS` silently skips on existing DBs.

### 3.4 Build / deploy loop
- **Backend runs in Docker on port 3000.** After ANY backend TS change: `docker compose build backend && docker compose up -d backend` (use `up -d`, NOT `restart`). File-watch on Windows is unreliable; prefer rebuild.
- **Frontend runs locally** via `npm run dev` (Vite). Verify with `npm run build` in `frontend/`.
- Backend type-check/build: `npm run build` in `backend/`.

### 3.5 Security amendments are mandatory for every change
For any new feature/page/component/API/field/button: register permission keys, wrap in `<Can>`, add audit logging for state-changing ops, add route guards/role checks on new endpoints, run the registry sync. Handle implied side effects (routes, sidebar links, endpoints, audit) without being asked.

---

## 4. Agreed decisions (scope for this plan)

The product owner has decided:

1. **Theming: global-only first.** Build a Super-Admin "Appearance Studio" that controls the live app's colors/fonts/radii/etc. globally. Per-organization white-label is **explicitly deferred** (design for it later, do not build now).
2. **Coach model: consolidate.** Eliminate the dual modeling between `player_profiles.is_coach`/`coach_status` and the separate `coach_profiles` table. Pick `coach_profiles` as the source of truth (see §6.C).
3. **Org self-service: true self-service.** Org owners/admins must manage their **own** branches, resources, and staff from the `/org/:orgId/*` portal — not depend on the super admin.
4. Follow the recommended priority order (P0 correctness → ghost-feature gaps → experience → hardening).

---

## 5. CONFIRMED BUGS (P0 — fix first, verified against source)

### 5.1 🔴 BullMQ worker never consumes jobs (CRITICAL)
**Files:** `backend/src/infrastructure/queue/queue.service.ts`, `backend/src/infrastructure/queue/worker.ts`, `backend/src/server.ts`.

**Root cause:** `queueService.add(type, data)` calls `getQueue(type)` — this creates/uses a BullMQ queue **named after the job type** (`cancel_expired_bookings`, `run_settlements`, `database_backup`, `send_email`). But `server.ts` calls `startWorker('default')`, which creates a Worker bound to a queue literally named **`'default'`**. BullMQ workers only process the queue whose name matches. **Result: no background job is ever processed.**

**Impact (all currently broken):**
- Expired pending bookings are never auto-cancelled (slots stay locked).
- Daily database backup never runs.
- Daily settlements never run.
- Password-reset (and any) emails are never sent.

**Fix (recommended, minimal):** make all jobs share one queue named `'default'`, keyed by job *name*. In `queue.service.ts`, change `add`/`addBulk` to use `this.getQueue('default')` while still passing `type` as the job name (`queue.add(type, data, opts)`). The worker already dispatches by `job.name` via the `handlers` map, so this aligns producer and consumer. (Alternative: start one worker per type-named queue — more code, no benefit here.)

**Verify after fix:** add a temporary job, confirm worker logs `Processing: <type>` then `Completed: <type>`. Confirm a stale pending booking gets cancelled within ~15 min.

### 5.2 🔴 Migration 029 references non-existent columns/tables
**File:** `database/schema/029_security_indexes.sql`.

**Confirmed mismatches** (these `CREATE INDEX` statements fail; in non-fresh migrate mode they may be silently skipped, so these performance indexes likely **do not exist in production**):
- `products(organisation_id, ...)` — products use **`seller_id`**, not `organisation_id`.
- `orders(seller_organisation_id, ...)` — no such column; orders split seller at `order_items.seller_id`.
- `wallets(user_id)` — table is **`user_wallets`**.
- `transactions(wallet_id, ...)` — `transactions` (migration 017, double-entry) has no `wallet_id`.

**Fix:** rewrite 029 to match the real schema. Verify each column with the live schema / `database/courtzon_v2.sql` before indexing. Re-run migrations and confirm indexes exist (`SHOW INDEX FROM <table>`).

### 5.3 🟠 `settlements` table schema collision
**Files:** `database/schema/007_financial.sql` (line ~64) vs `database/schema/037_settlements.sql`.

**Root cause:** 007 creates `settlements` with `club_id`, `settlement_type ENUM('club_to_courtzon','courtzon_to_club')`, `BIGINT UNSIGNED` ids — a booking-era schema. 037 does `CREATE TABLE IF NOT EXISTS settlements` with a **different** seller-payout schema (`organisation_id`, `amount/fee/net_amount`, `status ENUM('pending','approved','paid','rejected','cancelled')`, `INT UNSIGNED`). On any DB that already ran 007, **037 is skipped** → the seller-settlement code expects the 037 shape but gets the 007 shape → runtime SQL errors / wrong data.

**Fix:** decide the single canonical `settlements` schema for seller payouts. Add a **new migration** (e.g. `056_settlements_reconcile.sql`) that `ALTER`s the existing table to the desired shape (add/rename columns, migrate data), rather than relying on `IF NOT EXISTS`. Audit `backend/src/modules/settlement/` to confirm which columns it reads/writes and align.

### 5.4 🟠 Coach dual modeling (also a §6.C workstream)
**Confirmed:** `player_profiles` has `is_coach` (migration 000) + `coach_status`/`coach_rejected_reason` (migration 053). Separate `coach_profiles` table exists (migration 005). Two sources of truth for "is this user a coach and are they approved." Requires app-level consistency; latent bug source. Consolidation plan in §6.C.

### 5.5 🟡 Theming is not wired at runtime (also a §6.B workstream)
**Confirmed:** `frontend/src/index.css` defines static CSS vars. `frontend/src/store/theme.store.ts` only toggles light/dark class. The admin `DesignTokensPage` CRUDs the `design_tokens` table, but **nothing reads `design_tokens` at runtime to inject values into `:root`.** So editing tokens changes the DB but not the live app. This is the core of the Appearance Studio work.

---

## 6. WORKSTREAMS & DETAILED TODO LIST (build order)

Legend: `[ ]` = todo. Each item names concrete files. Follow §3 conventions for every item.

### Workstream A — P0 correctness (do first)

- [x] **A1. Fix BullMQ queue/worker mismatch.** DONE — shared `DEFAULT_QUEUE_NAME` constant in `queue.service.ts`, imported by `worker.ts`. Still needs a live Docker run to confirm (see Progress Log verification steps).
- [x] **A2. Verify jobs run.** DONE — backend container logs show `Worker started: default` → `Processing: cancel_expired_bookings` → `Completed`; queue/worker share `DEFAULT_QUEUE_NAME`.
- [x] **A3. Fix migration 029.** DONE — `029_security_indexes.sql` rewritten idempotent + column-aware (`cz_add_index` proc), correct columns. Needs `node backend/scripts/migrate.js` + `SHOW INDEX` to confirm on a live DB.
- [x] **A4. Reconcile `settlements` schema.** DONE — `056_settlements_reconcile.sql` (column-aware ALTER + backfill from `club_id`), registered in `migrate.js`. Needs migrate run + settlement cron retest on a live DB.
- [x] **A5. Permission + audit on booking mutations.** DONE for booking hot-path — `PATCH /bookings/:id/status` and `/payment` gated + audited. See A5b for the remaining sweep.
- [x] **A5b. Permission + audit sweep (marketplace/org/coach mutations).** DONE — `marketplace`, `payment`, `wallet`, admin taxonomy controllers, `coaches`/`activities`, **`organisations.controller.ts`** (all mutating handlers use `recordAudit`), and **`org-portal.controller.ts`** (shared `auditOrganisationMutation` helper). Guards were already present.
- [x] **A6. Normalize role slugs — VERIFIED, no change.** Live `roles` has no `super-admin` (canonical `super_admin`), but `org-admin`/`player-seller` hyphenated slugs are active, so the dual hyphen/underscore acceptance is load-bearing and must stay. Reclassified bug → confirmed non-issue. RECLASSIFIED from bug to cleanup. The dual `super_admin`/`super-admin` checks are defensive and working; canonical seed slug is `super_admin`. STEP 1: query the live `roles` table for any slug = `super-admin` (and other hyphen/underscore variants). STEP 2: if none exist, remove the hyphen acceptance from backend `requireRole` calls + `frontend/src/App.tsx` guards. STEP 3: if some exist, write a data migration to normalize them to underscore BEFORE removing the acceptance. Never remove acceptance without completing STEP 1.

### Workstream B — Appearance Studio (global theming)

**Goal:** Super Admin visually edits colors/fonts/radii/shadows/spacing/logo; changes apply live to the whole app on next load (with draft vs publish + rollback). Global only.

**Backend**
- [x] **B1.** DONE — `057_appearance_studio.sql` adds `draft_value`/`is_published` to `design_tokens` + `design_token_versions` (snapshot JSON) for rollback; seeds the canonical token set. Registered in `migrate.js`; ran `OK`.
- [x] **B2.** DONE — public `GET /public/theme` (flat map, cacheable, no auth) via `publicThemeRoutes` in `app.ts`.
- [x] **B3.** DONE — `PUT /design-tokens/theme` (save draft), `POST /design-tokens/publish` (snapshot+promote), `POST /design-tokens/rollback/:versionId`, plus `GET /design-tokens/studio`. `recordAudit` on all writes. Guards OR `settings.edit` with `design-tokens.{edit,publish,rollback}`.

**Frontend**
- [x] **B4.** DONE — `appearance.store.ts` hydrates cached theme at import (instant paint) then revalidates `/public/theme`; applies tokens to `:root`. Wired into `App.tsx` boot.
- [x] **B5.** DONE — `frontend/src/theme/tokens.ts` is the single token_key↔CSS-var mapping + editor groups; seed covers every `index.css` var.
- [x] **B6.** DONE — `DesignTokensPage.tsx` rebuilt as a visual editor (grouped sections, color pickers, radius sliders, Google-font dropdown) with a scoped live preview rendering real `Button`/`Card`/`Badge`/`Input`.
- [x] **B7.** DONE — Save draft / Publish (confirm) / per-version Revert, toasted per §3.2.
- [x] **B8.** DONE — `design-tokens.publish`/`design-tokens.rollback` registered in both registry files; synced; granted to the role holding `design-tokens.edit`.
- [x] **B9. Component-reuse cleanup (enables full theming reach).** DONE. (1) The shared `Badge` component now drives `success/warning/danger/info` off the new tint token pairs, so every `<Badge>` app-wide themes automatically. (2) Swept the remaining high-traffic pages — admin dashboards (`AdminDashboard`, `home/DashboardPage`), org portal (`OrgDashboard/Bookings/Resources/Branches/Marketplace`), marketplace (`SellerDashboard`, `Order{List,Detail}`, `Cart`, `{,Player}ProductDetail`, `Marketplace`), coaches (`CoachDetail/Profile`), matches (`MatchList`, `ManageApplicants`, `MyBookings`), profile/wallet (`Profile`, `Wallet`) — converting semantic success/warn/error text & solid buttons → `var(--color-success|warning|error)` and light-tint status pills → the new `--color-*-bg/-text` tokens (redundant `dark:` variants dropped). Intentionally-distinct accents left alone: WhatsApp/phone green buttons, star-rating gold, indigo/purple/orange multi-status pills, info banners, PreRegister category cards, neutral grays.
- [x] **B10.** DONE — selected Google font loaded via an injected `<link>` (`loadGoogleFont` in `theme/tokens.ts`), driven by the `font-google-family` token.

### Workstream C — Coach model consolidation

**Goal:** single source of truth = `coach_profiles`.

- [x] **C1.** DONE — `coach_profiles` is the source of truth for coach identity + approval (`status` enum) + bio/rate/certs/durations/availability; the `player_profiles.is_coach`/`coach_status`/`coach_rejected_reason` columns are now legacy (dual-written for one transition, dropped later).
- [x] **C2.** DONE — `059_coach_profiles_status.sql` (idempotent, registered, ran `OK`) adds `coach_profiles.status ENUM('none','pending','approved','rejected')` + `rejected_reason`, backfills from `player_profiles`, indexes `status`. Legacy column drop deferred to a later migration once nothing reads them.
- [x] **C3.** DONE — backend reads from `coach_profiles`: `user.repository` (login/me) + `rbac.repository.getUserById` derive `is_coach`/`coach_status` via `LEFT JOIN coach_profiles`; `activities.repository` directory filters on `cp.status='approved'`, `getCoachStatus` reads `coach_profiles`, admin list orders by `cp.status`. Admin approve/reject + apply/reset + isCoach toggle write `coach_profiles.status` (and dual-write legacy).
- [x] **C4.** DONE — frontend reads through the same `/coaches` + `/me` + admin endpoints, which now resolve coach state from `coach_profiles` (no frontend contract change needed); `CoachDetailPage` gained the review UI (C7).
- [x] **C5. Fix coach session history dead route.** DONE — `CoachSessionsPage.tsx` + route + `role` query param + `coach_name` join + `coaches.sessions.view` permission registered. Run `node backend/scripts/sync-ui-registry.js` to push the new permission to the DB.
- [x] **C6. DONE (2026-06-02).** Coach weekly-availability model + UI. Migration `060_coach_availability.sql` adds **`coach_availability`** (recurring per-`day_of_week` `start_time`/`end_time` ranges) and **`coach_availability_blackouts`** (specific unavailable dates + reason), both FK→`coach_profiles(id)` ON DELETE CASCADE (registered in `migrate.js`, ran `OK`). `coach_profiles.is_available` is retained as a global on/off master switch. Backend (activities module): repo `getCoachAvailability`/`setCoachAvailability` (transactional replace)/`getCoachBlackouts`/`addCoachBlackout`/`removeCoachBlackout`/`findScheduledSessionsOnDate`; service validates each range ends after it starts and rejects same-day overlaps, and **conflict-detects** when adding a blackout (409 if `coach_sessions` are `scheduled`/`in_progress` on that date). Endpoints `GET|PUT /coaches/availability/me`, `POST|DELETE /coaches/availability/me/blackouts[/:id]` (all gated by new `coaches.availability.manage` + `recordAudit`), plus a public `GET /coaches/:id/availability` for the booking flow. Frontend: new **Availability** tab on `CoachProfilePage` (7-day grid of add/remove time ranges + Save; blackout date+reason add/remove list), gated by `<Can permission="coaches.availability.manage">`, toasts on every mutation. Permission registered in both registry files (synced) + granted to player/admin/super_admin via `grant-new-perms.js`.
- [x] **C7.** DONE — review submission UI on `CoachDetailPage` (1–5 star picker + optional text → `POST /coaches/:coachId/reviews`, toast, invalidates the coach query). New `coaches.reviews.create` permission registered in both registry files, synced, granted to player/org-admin/admin/super_admin; backend handler now `recordAudit`s `COACH.REVIEW_CREATE`.

### Workstream D — Org self-service (facilities + staff)

**Goal:** org owners/admins manage their own branches, resources, and staff from `/org/:orgId/*` without super-admin help.

**Branches & resources**
- [x] **D1.** DONE (via modals, cleaner than routes) — the broken "+ Add Branch"/"+ Add Resource" buttons on `OrgBranchesPage`/`OrgResourcesPage` now open working create/edit/delete modals instead of dead `/.../new` links.
- [x] **D2. DONE (2026-06-02).** `OrganisationForm` `context="org"` now uses org-scoped APIs for branches/resources (`/org/:orgId/branches`, `/org/:orgId/resources`). `OrgBranchesPage` and `OrgResourcesPage` embed the shared form (`initialTab`, `variant="page"`) instead of lightweight modals; org portal hides admin-only tabs (documents) and branch financial sub-tab.
- [x] **D3.** DONE — new org-scoped endpoints `/org/:orgId/branches[/:branchId]` + `/org/:orgId/resources[/:resourceId]` (list/create/update/delete) in `org.routes.ts`/`org.controller.ts`, guarded by `requireOrganisationAccess` with ownership checks (`branchBelongsToOrg`/`resourceBelongsToOrg`), Zod validation (reusing `CreateBranch/ResourceSchema` + auto-slug), `recordAudit` on every write, delegating to `organisationService`.
- [x] **D4. DONE (2026-06-02).** `OrgSettingsPage` now uses `OrganisationForm context="org"` → org-scoped `PUT /org/:orgId/info` (`requireOrganisationAccess` + audit, strips self-verify/activate/owner fields). No longer hits the admin PUT.

**Staff / roles**
- [x] **D5. DONE (2026-06-02).** Org staff-management: `GET/POST/PUT/DELETE /org/:orgId/staff[/:userId]` guarded by a new stricter `requireOrgManageAccess` (owner / platform-admin / org-scoped holder of `org.staff.manage` — excludes org-sellers), `recordAudit` on every write. Staff = users with an org-scoped role; add by email + role (`org-admin`/`org-seller`), change role, remove. Scope writes use `INSERT IGNORE` / per-org scope deletion so a user's scopes on OTHER orgs are never wiped; user_roles left scope-less are deactivated. Frontend `OrgStaffPage` (list/add/role-change/remove modals + toasts), sidebar **Staff** link, route. Owner protected from modify/remove.
- [x] **D6. DONE (2026-06-02).** Org-initiated coach invites with a real handshake. Migration `061_coach_org_invites.sql` adds `status`/`initiated_by`/`invited_by` to `coach_org_agreements` (existing rows backfilled to `accepted`/`coach`). Org endpoints `GET /org/:orgId/coaches`, `GET .../coaches/directory` (approved coaches not yet linked), `POST .../coaches/invite` (creates `pending` org-initiated agreement, validates split = 100%), `DELETE .../coaches/:coachId`. Coach side: `POST /coaches/agreements/:id/respond {accept}` (gated `coaches.invites.respond`, audited) + Pending-Invites accept/decline UI in `CoachProfilePage` Organizations tab. `findOrgAgreements` (public profile) now only surfaces `accepted` + active agreements. Frontend `OrgCoachesPage` + sidebar **Coaches** link + route.
  - New perms: `org.staff.manage`, `org.sidebar.staff`, `org.coaches.manage`, `org.sidebar.coaches`, `coaches.invites.respond` — registered in `registry.ts` + `sync-ui-registry.js`, synced (5 inserted), granted via `grant-new-perms.js` (org-admin/admin/super_admin get the org-manage set; player + admins get `coaches.invites.respond`).
- [x] **D7.** DONE (for what shipped) — branch/resource buttons reuse existing `branches.*`/`resources.*` permission keys (already registered + granted to `org-admin`); `coaches.reviews.create` synced + granted; `grant-new-perms.js` ensures the grants are idempotent.

**Members (clubs/gyms)**
- [x] **D8. DONE (2026-06-02).** Facility **Members** UI for clubs/gyms: org portal page lists `branch_player_access` for the org (`GET /org/:orgId/members`), with branch/status filters; status updates (`PUT /org/:orgId/members/:branchId/:playerId`) gated by `org.members.manage` + ownership check + `recordAudit`. Frontend `OrgMembersPage`, sidebar **Members** link, perms `org.sidebar.members` / `org.members.manage` (sync + grant to org-admin).

### Workstream E — Mobile-first & PWA

- [x] **E1.** DONE — `BottomNav` rendered in `AppLayout` with `pb-24 md:pb-6` clearance (mobile-only via `md:hidden`). (The seller/admin toggles inside `BottomNav` remain product-logic conditionals; primary nav now lives in the bar.)
- [x] **E2.** DONE — `AdminLayout`/`OrgLayout` wrap the sidebar in an off-canvas drawer under `md` (translate-x + overlay + hamburger header, auto-closes on navigation); static column at `md+`.
- [~] **E3. Covered by E1.** The mobile bottom nav now carries the primary player flows; a dedicated top-navbar hamburger was not added (the desktop navbar is hidden behind the bar on mobile via the bottom nav). Follow-up if a full top-nav drawer is wanted.
- [x] **E4.** DONE — generated real `icon-192.png`/`icon-512.png` (`backend/scripts/gen-pwa-icons.js` rasterizes `favicon.svg` via `sharp`); `theme_color` aligned to `#059669` in `index.html` + `manifest.json` + `vite.config.ts`; inline-base64 icon links replaced with `/icon-192.png` + apple-touch `/icon-512.png`.
- [x] **E5.** DONE — `InstallPrompt` component captures `beforeinstallprompt`, shows a dismissible install nudge (rendered globally in `AppContent`).
- [x] **E6.** DONE — Workbox `runtimeCaching` (StaleWhileRevalidate, 30-min/120-entry) for GET `branches`/`marketplace/products`/`coaches`/`academies`/`tournaments`/`sports`.
- [x] **E7.** DONE — removed `maximum-scale=1.0` from the viewport meta (pinch-zoom restored).

### Workstream F — Fill remaining "ghost feature" gaps

- [x] **F1. Academy enrollment.** DONE — Enroll button (with optional curriculum picker) on `AcademyDetailPage` → `POST /academies/:id/enroll`, toast + query invalidate, disabled when already enrolled, gated by `academies.enroll` (granted to player/org-admin/admin); backend handler now `recordAudit`s `ACADEMY.ENROLL`.
- [x] **F2. DONE (2026-06-02).** Player branch-access request UI on `BrowseBranchesPage` — `BranchAccessControl` reads `GET /branches/:branchId/my-access`, shows tinted status pill or a `Request access` button → `POST /branches/:branchId/request-access` (toast + invalidate), gated by new `branches.request-access` perm.
- [x] **F3. DONE (2026-06-02).** Player-facing org storefront/profile page. Backend: new player-safe `GET /organisations/:id/storefront` (authed, read-only) → `organisationService.getStorefront` returns only public fields (name/slug/description/logo/cover/contact/type/rating/verified) **plus active branches** — explicitly **omits** financial details, CR/tax numbers, owner & documents, and 404s on inactive orgs. Frontend: new `pages/organisations/OrgStorefrontPage.tsx` (cover banner + logo, verified/type/rating header, description, contact links, and a branch grid that reuses the extracted shared `components/branches/BranchAccessControl.tsx` for restricted-facility request flow); route `/organisations/:orgId` under `AppLayout`. `BrowseBranchesPage` now tags each branch with its org and renders a gated "by {org}" link into the storefront. Gated by new `organisations.storefront.view` perm (registry + sync + granted to player/org-admin/admin/super_admin).
- [x] **F4. `/browse` discoverability** DONE — added **Facilities** (`/browse`) + **Coaches** (`/coaches`, gated by `coaches.view`) links to the player navbar.
- [x] **F5. DONE (2026-06-02).** Chat/messaging frontend behind `community.chat_enabled`. Backend hardening: enriched `findConversations` (other participant name/avatar + last message/time), participant guard on read/send, `updated_at` bump on send, `recordAudit` (`CHAT.MESSAGE_SEND`), route `GET /community/conversations/with/:otherUserId` (avoids param clash), API gated `community.chat.view` / `community.chat.send`. Frontend `MessagesPage` (split list/thread, 4s message polling, new-chat modal, `?with=userId` deep-link), navbar **Messages** link (flag + perm), **Message** on `CoachDetailPage`. Perms synced + granted to player/org-admin/admin.

### Workstream G — Hardening (after the above)

- [x] **G1. DONE (2026-06-02).** `/metrics` Prometheus endpoint. Added `prom-client` dep; new `backend/src/infrastructure/metrics/metrics.ts` builds a registry with `collectDefaultMetrics` (Node/process, `courtzon_` prefix, `app="courtzon-backend"` default label) plus a `courtzon_http_request_duration_seconds` histogram and `courtzon_http_requests_total` counter, labelled `method`/`route`/`status_code`. `registerMetrics(app)` (wired in `app.ts` after `/health`) adds an `onResponse` hook that records each request using the **matched route template** (`request.routeOptions.url`, not the raw URL → no path-param cardinality blowup) and exposes `GET /metrics`. The endpoint is **optionally token-guarded**: if `METRICS_TOKEN` is set it requires `Authorization: Bearer <token>` or `?token=`, else open for internal Docker-network scraping. Added `/metrics` to the maintenance-mode whitelist. `monitoring/prometheus.yml` already scrapes `backend:3000/metrics`, so no monitoring change needed.
- [x] **G2. DONE (2026-06-02).** OpenAPI/Swagger. Added `@fastify/swagger` (v9, dynamic mode) + `@fastify/swagger-ui` (v5), registered in `app.ts` **before** the route plugins so every route is introspected. OpenAPI 3 `info`/`servers`/`bearerAuth` security scheme (documents the opaque-session `Authorization: Bearer` flow). Swagger UI served at **`/docs`**, raw spec at **`/docs/json`** and a convenience **`/openapi.json`**. **Security amendment:** docs are env-gated — exposed when `NODE_ENV !== 'production'` OR `ENABLE_API_DOCS=true`, so a real prod deploy hides the API surface by default; set `ENABLE_API_DOCS: "true"` on the backend service in `docker-compose.yml` (this local stack runs `NODE_ENV=production`). Also added a `/docs`-scoped CSP relaxation (the global Helmet CSP is `script-src 'self'`; Swagger UI needs `'unsafe-inline'`) via an `onRequest` hook that runs after Helmet's.
- [x] **G3. DONE (2026-06-02, verified).** Testing stack: backend Vitest unit (39) + integration (16, all green locally); Testcontainers + migrate/seed harness fixes (`prepareSql`, `003a_seller_profiles`, integration lenient skips for legacy deltas); CI `test:unit` + `test:int`. Frontend Vitest + RTL (6): `Can.test.tsx`, `useCan.test.ts`.
- [x] **G4. DONE (2026-06-02).** Pragmatic `any`-reduction in admin: shared `getErrorMessage` + admin API types; six reference pages fully typed; remaining admin pages use `getErrorMessage` on mutations and explicit `: any` on list/map callbacks (avoids breaking `useMutation` inference). See Progress Log — avoid re-running `strip-admin-explicit-any.mjs`.
- [x] **G5. DONE (2026-06-02).** Dockerfile no longer `COPY backend/.env` into the image; runtime config comes from compose `env_file: .env` only. Root `.dockerignore` excludes `**/.env` (keeps `.env.example`). `migrate.js` / `grant-new-perms.js` use shared `load-file-env.js` (process.env first, optional root or `backend/.env` fallback for local CLI).
- [x] **G6. DONE (2026-06-02).** Merged `modules/org` into `modules/organisations` as the org-portal layer (`org-portal.*`); `/org/:orgId/*` routes registered via `registerOrgPortalRoutes` inside `organisation.routes.ts`; legacy `org` module removed.
- [x] **G7. Fix the red frontend production build.** DONE — `npm run build` passes (tsc exit 0). See Progress Log for the full list of fixes. The frontend typecheck gate is now usable again.
- [x] **G8. DONE (2026-06-02).** Code-split the frontend bundle via route-level `React.lazy`. All ~100 page/layout imports in `App.tsx` converted from static imports to `lazy(() => import(...))`; the always-rendered shell (guards, `Navbar`, `BottomNav`, `InstallPrompt`, `NotificationBell`, stores, `Can`, `FeatureFlagGuard`) stays eager. `<Routes>` wrapped in `<Suspense fallback={<PageLoader/>}>` (brand spinner). **Result:** the single 1,927 kB chunk is gone — main entry is now **351 kB** (gzip 111 kB) + a shared **296 kB** `ui`/vendor chunk, with every page emitted as its own on-demand chunk (largest page ~92 kB). The Vite ">500 kB chunk" warning no longer fires. Frontend-only (no backend/Docker change).

---

## 7. Acceptance criteria & verification

- **A1/A2:** Worker logs show `Processing`/`Completed` for each job type; a pending booking past cutoff is auto-cancelled.
- **A3:** `SHOW INDEX FROM products/orders/user_wallets/transactions/bookings` lists the new indexes; migration runs clean on a fresh DB.
- **A4:** Settlement cron completes; `/admin/settlements` reads/writes without SQL errors; columns match `backend/src/modules/settlement/` queries.
- **B:** Changing the primary color in Appearance Studio and publishing visibly recolors buttons/links across player, org, and admin areas after reload; rollback restores the previous version; fonts actually load.
- **C:** Coach approval/rejection flips a single field; `/coaches/sessions/me` renders; no code reads `player_profiles.is_coach` anymore.
- **D:** A non-admin org owner can create a branch + resource and invite a staff member entirely from `/org/:orgId/*`, gated by permissions, with audit entries.
- **E:** Player bottom nav appears on mobile; admin/org sidebars become drawers; app is installable with correct icons/brand color; pinch-zoom works.
- **Every change** follows §3: permissions registered + synced, `<Can>` gating, toasts, audit logging, migrations registered + run, backend rebuilt via Docker.

---

## 8. Recommended sequencing (summary)

1. **A (P0 correctness)** — highest risk, smallest effort. Do before anything else.
2. **C (coach consolidation)** — schema change; do before building more coach UI.
3. **D (org self-service)** — biggest product gap.
4. **B (Appearance Studio)** — high leverage, ~80% scaffolded; pair with B9 cleanup.
5. **E (mobile/PWA)** — experience.
6. **F (ghost features)** + **G (hardening)** — ongoing.

> Note: B and E can be parallelized with D/F since they touch mostly different files, but B9 (component cleanup) will conflict with any concurrent page edits — coordinate.

---

## 9. Key file reference

| Concern | Path |
|---|---|
| Frontend routing & guards | `frontend/src/App.tsx` |
| CSS variables (theme) | `frontend/src/index.css` |
| Light/dark store | `frontend/src/store/theme.store.ts` |
| Permissions registry | `frontend/src/permissions/registry.ts` |
| Registry sync (backend) | `backend/scripts/sync-ui-registry.js` |
| UI primitives | `frontend/src/components/ui/` |
| Admin theming page | `frontend/src/pages/admin/design-tokens/DesignTokensPage.tsx` |
| Bottom nav (unused) | `frontend/src/components/layout/BottomNav.tsx` |
| Backend bootstrap | `backend/src/app.ts`, `backend/src/server.ts` |
| Queue (bug) | `backend/src/infrastructure/queue/queue.service.ts`, `worker.ts` |
| Auth middleware / guards | `backend/src/shared/middleware/auth.middleware.ts`, `route-guard.ts` |
| Migration runner | `backend/scripts/migrate.js` |
| Schema | `database/schema/000_*.sql` … `055_*.sql` |
| Bad indexes | `database/schema/029_security_indexes.sql` |
| Settlements collision | `database/schema/007_financial.sql`, `037_settlements.sql` |
| Coach dual-model | `database/schema/000` (player_profiles), `005` (coach_profiles), `053` (coach_status) |
| Conventions | `AGENTS.md` |
