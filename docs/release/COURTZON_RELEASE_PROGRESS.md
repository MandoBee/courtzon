# CourtZon Release Progress (Live)

| Field | Value |
|---|---|
| Document | `docs/release/COURTZON_RELEASE_PROGRESS.md` |
| Plan | [`COURTZON_RELEASE_READINESS_PLAN.md`](./COURTZON_RELEASE_READINESS_PLAN.md) |
| Last updated | 2026-10-31 |
| Current phase | **Phase 5 (9/10, acceptance NOT MET — P5-05 deferred)** + **Phase 6 IN_PROGRESS (3/10)** |
| Overall completion | **54 %** (54 / 100 DONE items) |

> Statuses: `TODO` · `IN_PROGRESS` · `BLOCKED` · `DONE` · `ACCEPTED_RISK`.
> Percentages count only `DONE`. A phase is not complete until its acceptance criteria pass.

---

## 1. Phase dashboard

| Phase | DONE / total | Phase % | State |
|---|---|---|---|
| 1 — Baseline & Test Environment Safety | 10 / 10 | **100 %** | **DONE** (acceptance met) |
| 2 — Security Audit & Dependency Compatibility | 10 / 10 | **100 %** | **DONE** (acceptance met; native/Docker proof deferred to Phase 9) |
| 3 — Frontend Defect Remediation | 10 / 10 | **100 %** | **DONE** (acceptance met) |
| 4 — Backend & Business Rules Audit | 10 / 10 | **100 %** | **DONE** (audit acceptance met; **B36/B37** open follow-ups) |
| 5 — Payments, Accounting & Settlements | 9 / 10 | **90 %** | IN_PROGRESS (P5-05 IN_PROGRESS/DEFERRED; P5-01–P5-04, P5-06–P5-10 DONE; acceptance NOT MET) |
| 6 — Real UI & E2E Testing | 3 / 10 | **30 %** | IN_PROGRESS (P6-01, P6-02, P6-03 DONE; P6-04…P6-10 not started) |
| 7 — Tests, Architecture & CI Security Gates | 1 / 10 | **10 %** | IN_PROGRESS |
| 8 — Performance, Quality & UX | 1 / 10 | **10 %** | IN_PROGRESS |
| 9 — Docker Rebuild & Operational Verification | 0 / 10 | **0 %** | TODO (gated) |
| 10 — GitHub & Final Release Readiness | 0 / 10 | **0 %** | TODO (gated) |
| **Overall** | **54 / 100** | **54 %** | — |

## 2. Baseline snapshot (2026-10-26)

| Item | Value |
|---|---|
| Branch | `master` |
| Local HEAD | `184aa6e0b96c93b278f909d63eb7f4a88d28b424` |
| `origin/master` | `806177477cb687d90b37fe04c4184cbaeaf1d0a1` (local ahead 1, unpushed) |
| Working tree | clean before this documentation operation |
| Node / npm | v22.14.0 / 11.7.0 |
| Docker | backend `cbd5bb603f65`, frontend `10f00d300047`, redis `df68692fadf1`, mysql `6622d8c632c9`, grafana `dbb44c7528f2`, prometheus `5249ae03b7d9` — all up, four healthy |
| DB | `courtzon_v3` @ `127.0.0.1:3307` (container `courtzon-mysql`) — **approved test database (Amendment A1)**; data is user-declared disposable and cleared once after the campaign |
| Redis | `127.0.0.1:6379` |
| Local backend mode | `NODE_ENV=production`, `RELAX_RATE_LIMIT=false`, `PAYMENT_GATEWAY_PROVIDER=paymob`, `PAYMOB_SANDBOX=true` |
| Browser tooling | Playwright 1.60.0, Chromium 1223 installed |
| Lockfiles | 3 × `lockfileVersion: 3`, all resolved from `registry.npmjs.org` |

## 3. Checklist — Phase 1 (10/10)

| ID | Task | Status | Evidence / notes |
|---|---|---|---|
| P1-01 | Record Git baseline | **DONE** | Plan §9; this file §2. HEAD/origin/branch/status captured. |
| P1-02 | Record Docker baseline | **DONE** | Six container IDs/status recorded (§2), unchanged during audits. |
| P1-03 | Record runtime/tooling baseline | **DONE** | Node 22.14.0, npm 11.7.0, Playwright 1.60/Chromium 1223, Vitest 4. |
| P1-04 | Define rollback strategy | **DONE** | Plan §9.1: no history rewrite; code revert-commit model; disposable-data decision recorded; no truncation during tests. |
| P1-05 | Inspect test setup/cleanup scripts | **DONE** | Audited `e2e/helpers/database.ts`, `vitest.integration.setup.ts`, `global-setup.ts`, seed scripts, integration inventory (131 persistent / 32 container-based specs; 14 use the shared helper, 18 direct `GenericContainer`), E2E fixtures/scenarios, no E2E teardown. |
| P1-06 | Design existing-DB safety model | **DONE** | Plan §10 + Amendment A1: `courtzon_v3` only, exact target pinning, deferred explicit cleanup, marker guidance. |
| P1-07 | Verify explicit target on all test paths | **DONE** | `e2e/helpers/database.ts::connect()` asserts approved target before opening a pool; `vitest.integration.setup.ts` asserts at startup; 14/14 guard tests pass. |
| P1-08 | Remove silent wrong-instance defaults | **DONE** | Seed defaults moved from host-XAMPP `3306` to local Docker `3307` (`scripts/seed.sh`, `backend/scripts/seed.js`). Integration defaults unchanged and validated. |
| P1-09 | Enforce deferred, explicit destructive cleanup | **DONE** | `e2e/helpers/cleanup-guard.ts` requires exact DB + fixed confirmation token + non-empty campaign id **before** connecting; `cleanup(authorization)` is deferred. 14/14 focused tests. |
| P1-10 | Document final cleanup + prove no premature path | **DONE** | Final cleanup procedure in Plan §10.5; no test calls `cleanup()`; unused cleanup imports removed from `booking.fixture.ts` and `organisation.fixture.ts`. |

**Phase 1 acceptance:** MET — every test-writing path is pinned to `courtzon_v3` @ `127.0.0.1:3307`, destructive cleanup is deferred/authorized, final cleanup documented, baseline recorded (user-directed Amendment A1).

## 4. Checklist — Phase 2 (10/10)

| ID | Task | Status | Evidence / notes |
|---|---|---|---|
| P2-01 | Capture `npm audit` inventory | **DONE** | backend 28, frontend 50, root 0 (2026-10-26). |
| P2-02 | Document advisories (severity/range/fix/reachability) | **DONE** | Audit report: 35 high, 40 moderate, 3 low, 0 critical; direct packages mapped with advisory IDs. |
| P2-03 | Backend compatibility matrix | **DONE** | `docs/release/DEPENDENCY_COMPATIBILITY_MATRIX.md`: 7 targets + supporting swagger; registry/list/lockfile evidence; 8-field analysis; staged order; unverified items flagged; no installs. |
| P2-04 | Upgrade backend vulnerable deps | **DONE** | **Stages A + B + C + D complete.** Stage A: fastify 5.12.7, zod 4.6.7, mysql2 3.24.6, find-my-way 9.10.0. Stage B: `@fastify/static` 10.1.7 + `@fastify/swagger-ui` 6.1.2 (`/uploads` + `/docs` verified); `@fastify/swagger` 9.7.0 evaluated and retained. Stage C: `nodemailer` 10.2.1, `@types/nodemailer` removed, 10 mailer tests. Stage D: `sharp` 0.34.5 → **0.35.5**, deprecated `@types/sharp` dev stub removed (bundled conditional types resolved by `tsc`); local libvips 8.18.7; sharp-processor **7 → 10** tests. Build PASS after every stage; no direct vulnerable production target remains. Alpine/musl runtime proof deferred to Phase 9. |
| P2-05 | Verify backend build/tests post-upgrade | **DONE** | Build **PASS** after Stages A–D; Stage A integration **40/40 PASS** (payment, payment-reference-id, upload RBAC, coach profile); focused unit **70/70 PASS**; timeout pair 36/36; 6 date failures confirmed pre-existing. Stage B **24/24** integration + **77/77** regression. Stage C **10/10** mailer + **36/36** regression. Stage D **18/18** sharp/brand-image unit + **15/15** upload RBAC integration. Audit at Stage A close: prod 10 / full 24; after Stage D: prod **6** / full **20**. Integration global teardown no longer deletes data. |
| P2-06 | Frontend compatibility matrix | **DONE** | `DEPENDENCY_COMPATIBILITY_MATRIX.md` §10 (analysis only, no install). Installed → target: axios 1.16.1→1.20.0, zod 4.4.3→4.6.7, react-router-dom 7.15.1→7.18.4, all five `@tiptap/*` 3.23.5→3.32.0, postcss 8.5.14→8.5.31, vite 8.0.13→8.3.5 — all **same-major, no breaking**. Peers/engines verified (Node 22.14.0; react 19; plugin-react/vitest/pwa all accept Vite 8). Usage mapped: axios in 3 files (`services/api.ts` interceptors/refresh/FormData), zod in 10 files (basic APIs), router in 225 files (declarative `<BrowserRouter>`, no data-router/RSC), **tiptap imported nowhere and absent from `dist`**. `vite-plugin-pwa` classified **devDependency** (config-only import; `workbox-window` bundled into `dist`; Docker builder installs dev deps). Audit baseline: prod **46**, full **50**. |
| P2-07 | Upgrade frontend vulnerable deps | **DONE** | `vite-plugin-pwa` moved to **devDependencies** (1.3.0 preserved); upgraded axios **1.16.1→1.20.0**, zod **4.4.3→4.6.7**, react-router-dom **7.15.1→7.18.4**, postcss **8.5.14→8.5.31**, vite **8.0.13→8.3.5**, all five `@tiptap/*` **3.23.5→3.32.0** (one copy of core/pm/extensions). Tiptap exact-peer `ERESOLVE` resolved by uninstall+reinstall (no `--force`/`--legacy-peer-deps`). New `src/services/api.test.ts` **11/11 PASS**. Build **PASS**; `dist/sw.js` 44.7 KB + `workbox-5b3f2944.js` + `manifest.webmanifest` present; notification handlers injected; CSS byte-identical (98.4 KB); tiptap/ProseMirror **absent** from `dist`; prod tree no longer contains vite/postcss/pwa/workbox. Audit: prod **46 → 2**, full **50 → 12**. |
| P2-08 | Verify frontend build/tests post-upgrade | **DONE** | Build **PASS** (P2-07, `tsc -b` re-run clean). Focused: nav parity **98/98** (fixtures reconciled — org Membership section + player My Memberships added to the legacy builders; authoritative counts 46 org ids / 39 id→key, 21 player ids / 15 key maps), `OrgSubscriptionPage` **10/10** (date-relative fixture), `TournamentCreatePage` **46/46** after removing the `walkTo` overshoot (no global timeout change). Full suite **1356/1356 (134/134 files) PASS twice consecutively** (97 s each). No upgrade regression; no assertion weakened or skipped. |
| P2-09 | Security-control review | **DONE** | Reviewed auth/session cookies, brute force (5/15m/30m), RBAC (754 `requirePermission`), upload magic bytes, Paymob HMAC, helmet/CSP/CORS, rate limit, `trustProxy`, DB root user, docs exposure. |
| P2-10 | Re-audit + record accepted risks | **DONE** | In-range lockfile updates: `follow-redirects` **1.16.0→1.16.2** (axios `^1.16.0`), `socket.io-parser` **4.2.6→4.2.7** (`socket.io-client ~4.2.4`) — no manifest change, no `--force`/`--legacy-peer-deps`, single copies, `npm ls` clean. Audits (2026-10-26): frontend prod **0** / full **10**; backend prod **6** / full **20**; root **0**. De-duplicated: **25** unique full packages (5 shared), **79** package+GHSA pairs (78 GHSA), prod **23 advisories** in **6** packages. Remaining risks documented with in-range fixes (B13 backend prod transitives, B14 frontend dev-only); Alpine/Docker proof deferred to Phase 9. |

**Phase 2 acceptance:** **MET** (2026-10-26) — relevant security findings are fixed or explicitly
documented; builds and affected tests pass (frontend 1356/1356, backend build PASS + focused 20/20).
Explicit deferrals: Alpine/musl runtime proof and Docker image verification → **Phase 9**;
backend production transitives and frontend dev-only advisories → B13/B14 with in-range, non-breaking
fixes recorded. Phase 2 is **not** claimed as fully runtime-verified until Phase 9 completes.

## 5. Checklist — Phase 3 (10/10)

| ID | Task | Status | Evidence / notes |
|---|---|---|---|
| P3-01 | Inventory rules-of-hooks | **DONE** | 67 findings / 10 files; 42 from early-return gates; 25 loop hooks in `useRealtimeCacheUpdates.ts`. |
| P3-02 | Fix `OrgAccountingRecordsPage` gate | **DONE** | Root cause: `if (!can('org.accounting.view')) return null;` sat after 4 hooks and before 13 more (9 `useState` + 2 `useQuery` + `useMemo` + `useMutation`), so a runtime permission change rendered a different hook count. Fix: permission is now a plain `canView` value; the gate moved **after every hook**; both queries use `enabled: canView && …` so unauthorised users still trigger no requests, and the `<Can>` wrapper remains. New regression tests (revoked-while-mounted, granted-after-denied) count the two query hooks via a wrapped `useQuery`; both fail on the old code (0 hook calls) and pass now. Focused **16/16**, accounting set **47/47**, full suite **1358/1358**, `tsc -b` clean. |
| P3-03 | Fix remaining gates + MessagesPage | **DONE** | Verified all 8 candidates were still defective (early return before later hooks): AccountingDashboardPage:28, FinanceDashboardPage:13, FinancialOpsDashboard:8, LedgerViewerPage:19, ReportCenterPage:16, BookingSettlementPage:69, UnifiedSettlementListPage:30, MessagesPage:296 (the last returned mid-render before the promote/demote `useMutation` hooks). Same fix pattern: `canView` value + `enabled` guards on every query + gate after the last hook; RBAC/loading/error/empty behaviour unchanged. Regression tests added (5 pages in `finance/permissionHookOrder.test.tsx`, Messages equivalent, +1 each in the settlement suites) and proven to fail on the pre-fix code (0 query-hook calls / 16 vs 18 mutations). Focused **51/51** (8 files), `tsc -b` clean, full suite **1367/1367**, repo-wide `react-hooks/rules-of-hooks` now **25**, all in `useRealtimeCacheUpdates.ts` (P3-04). |
| P3-04 | Refactor `useSocketEvent` loops | **DONE** | Added `useSocketEvents(eventTypes, handler)` to `useSocket.ts`: one effect subscribes the whole list, handler kept in a ref (latest closure, no resubscribe churn), full cleanup on unmount. Replaced **25** in-loop `useSocketEvent` calls in `useRealtimeCacheUpdates.ts` with **25** top-level `useSocketEvents` calls backed by module-level event-list constants (membership/order unchanged; the `TOURNAMENT_REALTIME_EVENTS` handler still receives the event name for standings/bracket selection). Updated both realtime test mocks. New `useSocketEvents.test.tsx` (**8/8**): per-event subscribe + payload event name, no resubscribe on re-render, add/remove list transition with no stale subscriptions, unmount cleanup, latest-handler semantics, plus real-hook stability/shared-event/cleanup checks. `rules-of-hooks`: **25 → 0 repo-wide**; tsc clean; realtime **84/84**; full suite **1375/1375**. |
| P3-05 | Permission-based route guards | **DONE** | **Root cause:** `ProtectedRoute`/`AdminRoute` in `App.tsx` derived platform access from a hardcoded role-string list, so access ignored granted permissions; the aliases `super-admin`/`admin` do not exist as `roles` slugs. **Fix:** guards extracted to `src/app/routes/RouteGuards.tsx`; predicate `hasPlatformAdminAccess(can)` = `dashboard.view` (the key mapped to `/admin` in `adminRoutePermissions.ts`) **or** `platform.admin` (mirrors the backend `adminGuard`). `AdminRoute` denies with an explicit **Access denied** surface (no redirect loop); `ProtectedRoute` skips the `/app`→`/admin` bounce without the permission; Navbar uses the same predicate; `AdminLayout` keeps per-section `getAdminRoutePermission` checks. **No new permission key, no registry sync, no default grants.** DB-verified: `dashboard.view` → super_admin, master-admin, accountant, auditor, content-manager, event-manager, finance-manager, read-only-admin; `platform.admin` → super_admin. **Documented delta (B16):** the five non-legacy platform roles now pass the coarse gate because they already hold `dashboard.view` + per-route admin keys; player/org/coach/referee access is unchanged. New `routeGuards.test.tsx` **18/18** (role-string-only denied, permission-only allowed, revoke/grant while mounted, unauthenticated → login, `/notifications` + `/org` exemptions, no `/app`↔`/admin` loop); focused **30/30** (4 files); `tsc -b` clean; full **1393/1393**; `rules-of-hooks` **0**. |
| P3-06 | Triage other react-hooks findings | **DONE** | **Baseline re-measured, not assumed:** `set-state-in-effect` **57**, `refs` **37**, `purity` **10**, `static-components` **8** (**3,437** total findings). **Fixed four defect classes:** (1) leftover debug instrumentation removed — `ProductCategoriesPage`/`TagsPage`/`BrandsPage` (`Math.random`-in-render, render-count ref writes, per-render `console.warn`) and `BookingConfirmationPage`/`usePaymentConfirm` (`[TRACE]` render logs + `Date.now` refs); (2) render-time ref reads replaced — `App.tsx` pendingReload → lazy `useState`, latest-callback refs in `LoginSplash`/`useDetectedCountry`/`PaymobPixelCard` moved into effects, payment IDs in the org/seller registration pages + `SubscriptionRequestModal` read from existing `paymentInfo` state, and `UnifiedSettlementCreatePage` uses a `submitting` state mirror while keeping the synchronous ref double-submit guard; (3) `FinanceDashboardPage` KPI moved to module scope; (4) `ProductCardImage` retry cache-buster no longer calls `Date.now`. **After:** `refs` **37 → 0**, `static-components` **8 → 0**, `purity` **10 → 3**, `set-state-in-effect` **57 → 54**, `exhaustive-deps` **29 → 26**; total **3,437 → 3,377 (−60)**. Remaining 54 `set-state-in-effect` are intentional sync patterns (editable form/server drafts, pagination resets, request lifecycles, browser/socket subscriptions) — sampled and classified; the 3 remaining `purity` findings are `Date.now()` in subscription-expiry display (needs a shared clock abstraction, deferred as **B17**). No suppressions or config changes. **B15 retained** with DB evidence (accountant holds none of the deny-listed route permissions today — redundant defence-in-depth, kept against future grant drift). New `InstallPrompt.test.tsx` **5/5** locks derived banner visibility. Focused **57/57** (9 files), `tsc -b` clean, full **1398/1398**, `rules-of-hooks` **0**. |
| P3-07 | Lint baseline + CI gate | **DONE** | Confirmed the configured command `npx eslint .` = **3,377** findings (**3,295** errors, **82** warnings) across **706** files; 3 non-rule warnings are pre-existing unused `eslint-disable` directives. ESLint 10 bulk suppressions were evaluated and rejected for the gate: `--suppress-all` covers only the 3,295 errors (55 KB `eslint-suppressions.json`), leaving all 82 warnings and 3 no-rule warnings ungated. Added `frontend/scripts/lint-baseline.mjs` + committed `frontend/lint-baseline.json`: exact per-file/rule/severity counts, full linted-file inventory, and `eslint-disable` directive counts for TS/TSX. The gate fails on new/increased findings, new files with findings, disappeared findings (deliberate baseline update required), removed/ignored baseline files, added/removed suppression directives, and error↔warning severity changes; new clean files pass. Wired `npm run lint:gate` into `.github/workflows/lint.yml` after `tsc`. Normal `npm run lint` is unchanged (`eslint .`, still exits 1 with the documented 3,377). New `lint:gate:selftest` **6/6 PASS** (unchanged passes; existing-file violation fails; new-file violation fails; new clean file passes; removed/ignored baseline file fails; new `eslint-disable` fails) with full cleanup. `tsc -b` clean, full suite **1398/1398**. **B4 partially resolved** (ESLint CI gate now real; secret/audit gates remain P7-04/P7-05). |
| P3-08 | Incremental TS strictness plan | **DONE** | Measurement-only; **no flag or config enabled/changed**. TS **6.0.3** (both trees), Node **22.14.0**. **Premise corrected:** TS 6 enables `strict` by default, so the frontend baseline is already strict (0 errors; `--strict` adds 0; `--strict false` removes probe errors) and the backend has explicit `strict: true`. Also found frontend `npx tsc --noEmit` (used by `lint.yml`) checks **0 files** because the root config is references-only; the real check is `tsc -b` (0 errors). Confirmed beyond-strict error counts (frontend / backend): `noUncheckedIndexedAccess` **304 / 764**, `exactOptionalPropertyTypes` **140 / 761**, `noPropertyAccessFromIndexSignature` **332 / 2,234**, `noImplicitOverride` **3 / 0**, `noImplicitReturns` **1 / 1**, `noUnusedLocals` already on / **196**, `noUnusedParameters` already on / **105**, `allowUnreachableCode=false` **0 / 1**, `allowUnusedLabels=false` **0 / 0**, `noFallthroughCasesInSwitch` already on / **0**. Combined big flags: frontend **455** (205 in test files / 250 source), backend **1,528**; Stage-1 bundle frontend **4** / backend **2**; backend unused bundle **301**. Proposed order: pin `strict` + fix the frontend CI type-check → Stage-1 mechanical flags → backend unused cleanup → `exactOptionalPropertyTypes` → `noUncheckedIndexedAccess` → defer `noPropertyAccessFromIndexSignature`. Full tables/root causes in §17; ESLint gate untouched. **Additional checks (independently re-verified after the interrupted session):** `allowUnusedLabels=false` **0 / 0**; `skipLibCheck=false` **7 / 0** — all seven frontend errors are `@dnd-kit/*` `.d.ts` TS2503 (`Cannot find namespace 'JSX'`, React 19), not project code; explicit `any` (ESLint `@typescript-eslint/no-explicit-any`, invisible to every TS flag) **3,163** (**2,594** source / **569** tests). |
| P3-09 | Regression tests per fixed defect | **DONE** | Built the defect→test map for **17** P3-02…P3-07 defects (full matrix in **§5B**): **43** Vitest regression tests across **9** files (2 + 5 + 2 + 1 + 1 + 8 + 18 + 5 + 1) plus **6** ESLint-gate self-test scenarios. **Pre-fix failure proven for 12 / 17 defects** — 11 by scoped mutation (7 runs: org 2 failed, five finance pages 5, Messages 2, BookingSettlement 1, UnifiedSettlementList 1, role-string guard 7, ProductCardImage 1) plus the lint-gate self-test (#17); every mutated file was restored byte-exactly (SHA-256 verified, marker scan clean). **1 new test added** (`ProductCardImage.test.tsx`) for the previously untested P3-06 `Date.now()` cache-buster — it fails on the pre-fix line and passes now. **5 defects documented as not safely demonstrable** (P3-04 loop hooks, P3-06 debug instrumentation, render-time ref reads, KPI hoist, InstallPrompt) — **B23**. Verification: targeted **65 / 65** (9 files), `tsc -b --force` **exit 0**, `lint:gate` **PASS** (707 files / 3,377 findings), gate self-test **6 / 6**, full suite **1399 / 1399** (140/140 files, 103.15 s). |
| P3-10 | Re-verify affected flows | **DONE** | Verified every P3-02/P3-03 path plus admin navigation, the accountant deny-list and the card-payment flows — matrix in **§5C** (22 rows; role/permission, action, expected vs actual, command, evidence class). **Critical regression found and fixed:** the P3-06 purity change gated the card-payment fallback poller on `paymentInfo?.paymentId`, but `handlePaymentComplete` clears `paymentInfo` before polling → the "Confirming payment…" poller never mounted in `SubscriptionRequestModal`, `OrganizationRegisterPage` and `SellerRegisterPage`. New behavioural test failed before the fix (`Unable to find [data-testid="payment-poller"]`) and passes now; the poller id is held in state again. Also closed both **B23** gaps: Navbar admin-link mirror (**5/5**, 3 fail under the legacy role-string mutation) and the payment-id wiring (**2** behavioural + **3** source-guard tests). Verification: focused **108/108** (14 files), `tsc -b --force` **exit 0**, `lint:gate` **PASS** (711 files / 3,377 findings), gate self-test **6/6**, full suite **1414/1414** (144/144 files). **Phase 3 acceptance MET.** |

**Phase 3 acceptance:** **MET (2026-10-27).** All ten items are `DONE` with executed evidence:
`rules-of-hooks` **0** repo-wide (9 conditional page gates + 25 loop subscriptions removed), admin access is
permission-driven (route guard **18/18**, AdminLayout **5/5**, Navbar mirror **5/5**), the remaining
ref/purity/static defects are remediated (**refs 0**, **static-components 0**, **purity 3**), the ESLint
baseline gate is fail-closed (**6/6** self-test; 711 files / 3,377 findings unchanged), the strictness plan
is measured (§17), every fix is mapped to a regression test with pre-fix evidence for 12/17 (§5B), and the
affected finance/settlement/messaging access paths were re-verified with one critical payment-polling
regression found and fixed (§5C). Full suite **1414/1414** (144/144 files), `tsc -b --force` exit 0.

Classified and tracked, **not** open defects: **B16** (P3-05 permission delta), **B17** (54 intentional
`set-state-in-effect`, 3 `purity`), **B18** (baseline governance), **B23** (remaining static-only evidence
for P3-04/P3-06), **B24** (route/page/nav permission-key drift — deny-safe). Infrastructure/CI gaps routed
to Phase 7: **B19** (frontend CI `tsc --noEmit` is a no-op; backend tests untyped), **B21** (3,163 explicit
`any`, no type-aware lint), **B22** (`@dnd-kit` blocks `skipLibCheck:false`). No critical frontend defect
remains open.

## 5B. P3-09 — defect-to-test regression map (2026-10-27)

Built from the **actual working-tree diff** (`git diff`), the current tests, and the recorded evidence —
not from the completion notes alone. "Fail-before" means the regression test was executed against a
minimal, temporary re-insertion of the original defective statement; every mutation was reverted from a
byte-exact backup and verified by SHA-256 (no `git checkout`, no broad revert, no unrelated file touched).

### 5B.1 Matrix — 17 mapped defects

| # | Defect / changed behaviour | Source | Regression test and assertion | Fail-before |
|---|---|---|---|---|
| 1 | Permission gate sat **before 13 hooks**; a runtime permission change altered the hook count | `pages/org/OrgAccountingRecordsPage.tsx` | `OrgAccountingRecordsPage.test.tsx` (16; **2 new**): denied render still calls both `useQuery` hooks, revoked-while-mounted does not throw, granted-after-denied renders | **YES** — 2 failed / 14 passed |
| 2 | Gate before `useQuery` (accounting dashboard) | `pages/admin/accounting/AccountingDashboardPage.tsx` | `finance/permissionHookOrder.test.tsx`: denied render runs the hooks, heading hidden, **no API call**, grant renders it | **YES** — 5 failed (rows 2–6 together) |
| 3 | Gate before 4 `useQuery` hooks | `pages/admin/finance/FinanceDashboardPage.tsx` | same file | **YES** |
| 4 | Gate before 3 `useQuery` hooks | `pages/admin/finance/FinancialOpsDashboard.tsx` | same file | **YES** |
| 5 | Gate before `useQuery` + state | `pages/admin/finance/LedgerViewerPage.tsx` | same file | **YES** |
| 6 | Gate before 4 `useQuery` hooks | `pages/admin/finance/ReportCenterPage.tsx` | same file | **YES** |
| 7 | **Mid-render** permission return before the promote/demote `useMutation` hooks | `pages/community/MessagesPage.tsx` | `MessagesPage.permissionHookOrder.test.tsx` (2): equal mutation-hook count granted vs denied; grant-while-mounted removes the denial | **YES** — 2 failed |
| 8 | Gate before 2 `useQuery` hooks | `pages/admin/settlements/BookingSettlementPage.tsx` | `BookingSettlementPage.test.tsx` (+1): `useQuery` ≥ 2 on the denied render, no request | **YES** — 1 failed |
| 9 | Gate before `useQuery` | `pages/admin/settlements/UnifiedSettlementListPage.tsx` | `UnifiedSettlementListPage.test.tsx` (+1): `useQuery` ≥ 1, UI hidden, no request | **YES** — 1 failed |
| 10 | **25** `useSocketEvent` calls inside `for` loops (invalid hook usage) | `realtime/useRealtimeCacheUpdates.ts`, `realtime/useSocket.ts` (`useSocketEvents`) | `useSocketEvents.test.tsx` (8): subscribe-once-per-event, no resubscribe on re-render, list add/remove teardown, unmount cleanup, latest-handler semantics, real hook 100+ subs with shared-event delivery | **NO — limitation (B23)** |
| 11 | Hardcoded role strings (`super-admin`/`admin`/`accountant`…) decided admin access | `App.tsx` (removed), `app/routes/RouteGuards.tsx`, `permissions/platformAccess.ts` | `routeGuards.test.tsx` (18): legacy role strings **denied**, permission-only **allowed**, `platform.admin` fallback, wildcard, revoke/grant while mounted, `/notifications` + `/org` exemptions, no `/app`↔`/admin` loop, key alignment | **YES** — role-string mutation: 7 failed / 11 passed |
| 12 | Debug instrumentation in render: `Math.random` refs, render counters, per-render `console.warn`, `[TRACE]` logs | `BrandsPage`, `TagsPage`, `ProductCategoriesPage`, `BookingConfirmationPage`, `usePaymentConfirm` | none dedicated — behaviour-preserving removal; full suite + lint deltas | **NO — no behaviour change (B23)** |
| 13 | Render-time ref writes/reads (latest-callback and payment-id refs) | `App`, `LoginSplash`, `useDetectedCountry`, `PaymobPixelCard`, org/seller registration, `SubscriptionRequestModal`, `UnifiedSettlementCreatePage` | existing suites: `LoginSplash` 4, `CommandPalette` 5, `UnifiedSettlementCreatePage` 3, `InstallPrompt` 5 | **NO — behaviour-preserving (B23)** |
| 14 | Component declared inside the page render (`KPI`) — remounted subtree | `pages/admin/finance/FinanceDashboardPage.tsx` | `permissionHookOrder.test.tsx` renders the page (heading + hooks) | **NO — structure-only (B23)** |
| 15 | `InstallPrompt` visibility copied into state from an effect | `components/InstallPrompt.tsx` | `InstallPrompt.test.tsx` (5): hidden before the event, shown on landing, hidden after dismiss/install, hidden off-landing | **NO — behaviour intentionally identical; old code passes these too (B23)** |
| 16 | `Date.now()` cache-buster inside `useMemo` (`react-hooks/purity`, non-deterministic URL) | `components/marketplace/ProductCardImage.tsx` | **new** `ProductCardImage.test.tsx` (1): retry URL is exactly `?cz_retry=1` (no timestamp), second failure renders the placeholder | **YES** — pre-fix line: 1 failed / 0 passed |
| 17 | No lint regression gate (findings could grow silently) | `scripts/lint-baseline.mjs`, `lint-baseline.json`, `.github/workflows/lint.yml` | `lint-gate-selftest.mjs` (**6 scenarios**): unchanged pass, new/increased finding fail, new-file violation fail, new clean file pass, coverage-loss fail, new suppression fail | **YES** — each scenario mutates a temp copy and asserts the gate exit code |
| — | P3-08 was measurement/planning only — no runtime behaviour changed | — | not applicable | n/a |

### 5B.2 Counts

| Metric | Value |
|---|---|
| Defects mapped | **17** (+ P3-08 recorded as no-code-change) |
| Regression tests in the map | **43** Vitest tests across **9** files, + **6** gate self-test scenarios = **49** |
| Newly added by P3-09 | **1** test (`ProductCardImage.test.tsx`, 1 case) |
| Proven to fail against the pre-fix behaviour | **12 / 17 defects** (11 via 7 mutation runs + the gate self-test) |
| Documented as not safely demonstrable | **5 / 17** (B23) |
| Targeted suite now | **65 / 65 PASS** (9 files) |
| Full suite now | **1399 / 1399 PASS** (140/140 files) |

### 5B.3 Gaps and limitations (B23)

1. **P3-04** — the pre-fix implementation is a 433-line loop version. Reverting it (even temporarily) is a
   broad reversion of production code and was refused. Evidence instead: the deleted `for (…) useSocketEvent(…)`
   lines are visible in `git diff`; `react-hooks/rules-of-hooks` went **25 → 0** repo-wide; the new test's
   list-change case cannot exist under the loop version (the hook count would change with the list).
2. **P3-06 ref/purity/static-component fixes** — by design they preserve observable behaviour, so no test
   can fail-before/pass-after without reintroducing the lint defect. Covered indirectly by the full suite
   and by the lint deltas (`refs` 37→0, `static-components` 8→0, `purity` 10→3).
3. **`InstallPrompt`** — the test locks the visibility rules but passes against the old implementation too;
   it is a regression guard, not a fail-before proof.
4. **No dedicated test** for the `Navbar` admin-link mirror (the `Navbar` component is private to
   `App.tsx`; covered only by full-App redirect specs) and for the registration/subscription payment-id
   switch (equivalent value source, covered by existing page suites). Not worth new brittle harnesses now;
   revisit in P6/P8.

### 5B.4 Verification commands actually run

```bash
cd frontend
npx vitest run <9 mapped test files>          # 65/65 PASS
npx vitest run                                # 1399/1399 PASS (140 files)
npx tsc -b --force                            # exit 0
npm run lint:gate                             # PASS — 707 files / 3,377 findings
npm run lint:gate:selftest                    # 6/6 PASS
npx eslint src/realtime/useRealtimeCacheUpdates.ts src/realtime/useSocket.ts   # rules-of-hooks: 0
```


## 5C. P3-10 — finance / settlement / messaging access-path verification (2026-10-27)

Every row was checked against the **current source** and re-run in this session. Evidence classes:
**A** = automated test, **S** = source inspection, **L** = static analysis (ESLint/tsc).

### 5C.1 Verification matrix (22 rows)

| # | Path / component | Role + required permission | Action / navigation | Expected | Actual (tested / observed) | Command & result | Class |
|---|---|---|---|---|---|---|---|
| 1 | `/org/:orgId/accounting/records` — `OrgAccountingRecordsPage` | Org staff + `org.accounting.view` (nav `nav.org.accounting-records`) | Open page, load journal entries | Records render; **2** queries enabled | Renders; both queries run; no hook-order change | `npx vitest run src/pages/org/OrgAccountingRecordsPage.test.tsx` → **16/16** | A |
| 2 | same | Org user **without** `org.accounting.view` | Mount denied | Nothing rendered; **zero** requests | `api.get` never called; queries `enabled: false` | same run | A |
| 3 | same | Permission **revoked while mounted** | Re-render | No hook-count crash; UI hides | No throw; 2 hooks still called; UI hidden | same run | A |
| 4 | same | Permission **granted after denial** | Re-render | Page appears; queries run | Renders records; requests fire | same run | A |
| 5 | `/admin/accounting/dashboard` — `AccountingDashboardPage` | Platform role + `accounting.dashboard` (route key `sidebar.accounting`; nav `sidebar.accounting-dashboard`) | Open | Renders stats; denied → hidden + no request; grant → renders | All three behaviours pass | `npx vitest run src/pages/admin/finance/permissionHookOrder.test.tsx` → **5/5** | A |
| 6 | `/admin/finance` — `FinanceDashboardPage` | `sidebar.finance-dashboard` (route key `financial.view`) | Open | 4 queries gated; heading hidden when denied | Passes (same file) | same run | A |
| 7 | `/admin/financial-ops` — `FinancialOpsDashboard` | `sidebar.finance-transactions` (route key `financial.view`) | Open | 3 queries gated; skeleton preserved | Passes (same file) | same run | A |
| 8 | `/admin/finance/ledger` — `LedgerViewerPage` | `sidebar.finance-ledger` (route key `financial.view`) | Open, empty result | Query gated; `SkeletonRow` loading + "No ledger entries found." empty state preserved | Diff touches only the gate/`enabled`; states intact | same run + source | A + S |
| 9 | `/admin/finance/reports` — `ReportCenterPage` | `sidebar.finance-reports` (route key `reports.view`) | Switch tabs | Per-tab `enabled` still ANDed with `canView` | `canView && (tab === …)` in all four queries | same run + source | A + S |
| 10 | `/admin/settlements/bookings` — `BookingSettlementPage` | `settlements.view` (nav `sidebar.settlements-bookings`) | Open | 2 queries gated; denied hidden; no request | Passes; `useQuery` ≥ 2 on denied render | `npx vitest run …BookingSettlementPage.test.tsx` → **7/7** | A |
| 11 | `/admin/unified-settlements` — `UnifiedSettlementListPage` | `settlements.view` (nav `sidebar.settlements`) | Open list | Query gated; "Loading..." + "No settlements found." rows preserved | Passes; query runs disabled | `…UnifiedSettlementListPage.test.tsx` → **3/3** | A + S |
| 12 | `/admin/unified-settlements/new` — create page | `settlements.view` (route) + `settlements.pay` (action) | Create / pay | Route gate + action keys unchanged | Passes | `…UnifiedSettlementCreatePage.test.tsx` → **14/14** | A |
| 13 | `/admin/unified-settlements/:id` — detail page | `settlements.view` (route) | Open detail | Route gate unchanged; no page-level gate added | Passes | `…UnifiedSettlementDetailPage.test.tsx` → **13/13** | A |
| 14 | `/messages` — `MessagesPage` | `community.chat.view` **and** flag `community.chat_enabled` (route `FeatureFlagGuard`, nav `Can`) | Open / deny / grant | Denied → message + zero requests; grant while mounted renders; hook count stable | 7 queries carry `enabled: … can('community.chat.view')`; **2/2** | `…MessagesPage.permissionHookOrder.test.tsx` → **2/2** | A + S |
| 15 | Navbar `/admin` link (private to `App.tsx`) | `dashboard.view` **or** `platform.admin` | Visibility on consumer routes | Shown for permission holders, hidden for legacy role strings / players; reacts while mounted | **5/5**; under the legacy role-string mutation **3 fail** (byte-exact restore verified) | `src/app/layouts/NavbarAdminLink.test.tsx` → **5/5** | A |
| 16 | `AdminLayout` per-section gate | mapped route key (`users.view`, `financial.view`, …) | Navigate `/admin/*` | Outlet only with the key; sidebar stays mounted | **5/5** | `src/app/layouts/AdminLayout.access.test.tsx` → **5/5** | A |
| 17 | Accountant deny-list (B15) | role `accountant` (+ key) | `/admin/users` vs `/admin/finance` | Privileged section denied even with the key; finance section allowed | Denied / allowed as designed | same run (2 cases) | A |
| 18 | Coarse `/admin` guard | `dashboard.view` / `platform.admin` / `*` | Enter `/admin` | Allow with key, deny legacy role strings, no redirect loop | **18/18** | `src/permissions/routeGuards.test.tsx` → **18/18** | A |
| 19 | `AdminSidebar` / `OrgSidebar` entries | per-item `permissionKey` (registry) | Menu visibility | Items filtered by key, not role strings | `Can` wrappers + `permissionKey` present for every finance/settlement/accounting item | source inspection | S |
| 20 | Card payment fallback poller — `SubscriptionRequestModal` | Org admin + `org.subscription.pay` | Pay by card → confirm not immediate | "Confirming payment…" poller mounts for the created payment id | **Failed before the fix** (`Unable to find [data-testid="payment-poller"]`); **2/2** after | `…SubscriptionRequestModal.paymentPolling.test.tsx` → **2/2** | A |
| 21 | Card payment fallback poller — `OrganizationRegisterPage`, `SellerRegisterPage` | Public visitor | Same card flow | Poller wired to a payment id that survives closing the card modal | Both sources assert the state-based wiring | `src/components/payment/paymentPollerWiring.test.ts` → **3/3** | A (source guard) + S |
| 22 | P3-04 / P3-06 invariants | — | — | No loop hooks, no render-time ref reads, no in-render components | `rules-of-hooks` **0**, `refs` **0**, `static-components` **0**, `purity` **3**, `set-state-in-effect` **54** (B17) | `npx eslint . --format json` | L |

### 5C.2 Critical regression found and fixed in P3-10

- **Symptom:** after a card payment that the confirm endpoint could not settle immediately, the
  "Confirming payment…" poller never appeared, so the client never completed the fallback poll (up to 90 s)
  and the user got no confirmation/timeout feedback. Affected **all three** card flows: subscription
  request, organisation registration, seller registration.
- **Root cause:** P3-06 replaced the render-time `paymentIdRef.current` read with `paymentInfo?.paymentId`,
  but `handlePaymentComplete` clears `paymentInfo` (`setPaymentInfo(null)`) **before** `setPollingPaid(true)`
  — the new condition was always false at polling time. A purity fix that silently disabled a financial
  flow; no test covered it (the P3-09 map had no payment-flow test).
- **Fix:** keep the polling id in component state (`pollingPaymentId`), set it from the event-handler read of
  the ref, reset it on modal reopen / cancel / success, and gate the poller on `pollingPaid && pollingPaymentId > 0`.
  Final behaviour is identical to the pre-P3-06 implementation while keeping the render pure.
- **Proof:** the new behavioural test failed on the P3-06 version (`Unable to find
  [data-testid="payment-poller"]`) and passes after the fix. The registration pages cannot be mounted
  without a brittle multi-step harness, so `paymentPollerWiring.test.ts` guards their identical wiring.
- **Not covered here:** a real Paymob Sandbox card completion (Phase 5 P5-04/P5-05, BLOCKED pending
  configuration approval) — this verification is a mocked-component behavioural test, not a gateway test.

### 5C.3 B23 disposition

| Gap | Disposition |
|---|---|
| Navbar admin-link mirror had no test | **CLOSED** — `NavbarAdminLink.test.tsx` (5 cases, full App); 3 fail under the legacy role-string mutation |
| Payment-id source switch untested | **CLOSED** — behavioural test (2) + wiring guard (3) |
| P3-04 loop hooks not revertible | **REMAINS** — static evidence only (`rules-of-hooks` 25→0; deleted `for (…) useSocketEvent(…)` lines in `git diff`); no broad reversion performed |
| P3-06 behaviour-preserving fixes | **REMAINS** — static evidence (`refs` 0, `static-components` 0, `purity` 3) + full suite; `InstallPrompt` test passes on the old code too |
| Registration flows not behaviour-tested | **PARTIAL** — source guard + type-check/lint; real UI flow belongs to Phase 6 |

### 5C.4 Phase 3 acceptance decision

**MET.** No critical frontend defect remains open: the only one found in this task (dead card-payment
polling) is fixed and covered by a regression test. Remaining findings are classified (B16–B18, B23, B24)
and the CI/typing gaps are routed to Phase 7 (B19, B21, B22).

### 5C.5 Commands actually run (this task)

```bash
cd frontend
npx vitest run <14 access-path suites>            # 108/108 PASS
npx vitest run                                    # 1414/1414 PASS (144 files, 94.43 s)
npx tsc -b --force                                # exit 0
npm run lint:gate                                 # PASS — 711 files / 3,377 findings
npm run lint:gate:selftest                        # 6/6 PASS
npx eslint . --format json                        # rules-of-hooks 0, refs 0, static-components 0, purity 3
```


## 5D. P4-01 — business-rule and test-coverage inventory (Phase 4, 2026-10-27)

Evidence base: current source files, `npx vitest list`, spec-file counts, and targeted greps — not the
completion notes. **No production, test, dependency, DB, `.env`, Docker or config change; no test was
modified or forced.** Class: **A** = automated test, **S** = source inspection, **L** = known limitation.

### 5D.1 Measured test baseline

| Metric | Value | Command |
|---|---:|---|
| Unit spec files (default config) | **308** | `Get-ChildItem src -Recurse -Include *.spec.ts` minus integration |
| Unit test entries | **3,740** | `npx vitest list` (excludes `*.integration.spec.ts`) |
| Integration spec files | **163** | `Get-ChildItem src -Recurse -Include *.integration.spec.ts` |
| All spec files | **471** | — |
| Coverage thresholds | **3 %** statements/branches/functions/lines | `vitest.config.ts` (P7-08 known gap) |
| `requirePermission(...)` call sites | **777** | grep |

| Area | Spec files | Unit tests | Area | Spec files | Unit tests |
|---|---:|---:|---|---:|---:|
| tournaments | 99 | 1,054 | membership | 11 | 68 |
| financial | 44 | 307 | settlement | 11 | 54 |
| academy | 24 | 292 | wallet | 11 | 54 |
| booking | 53 | 286 | payment | 14 | 38 |
| match-result | 13 | 208 | activities | 12 | 36 |
| marketplace | 21 | 205 | scheduling | 7 | 34 |
| notifications | 26 | 201 | auth | 7 | 26 |
| shared (`src/shared`) | — | 161 | hr / reports | 2 / 1 | 14 / 14 |
| realtime (module + `src/realtime`) | 5 + 13 | 117 + 13 | accounting | 13 | 12 unit (+ integration) |
| rbac | 8 | 112 | security / upload | 4 / 2 | 10 / 10 |
| organisations | 21 | 99 | **community** | **0** | **0** |
| match | 9 | 87 | **brute-force** | **0** | **0** |
| `src/tests` | — | 85 | time | 3 | 74 |

### 5D.2 Rule inventory — 45 rules across 8 areas

#### A. Authentication, authorization, tenant isolation (7)

| # | Rule | Authoritative source | Existing tests / assertions | Uncovered edge | Class |
|---|---|---|---|---|---|
| A1 | Every guarded route requires a specific permission key; missing → **403**, unauthenticated → 401 | `src/shared/middleware/auth.middleware.ts:37` `requirePermission` (777 call sites) | RBAC module 112 tests + route-level specs across modules | No global sweep proving **every** mutating route carries a guard | A/S |
| A2 | Platform-admin routes accept `super_admin` role **or** `platform.admin` | `auth.middleware.ts:74` `adminGuard` | Route-level RBAC suites (source usage) | No dedicated guard unit test | S |
| A3 | Org-scoped access = owner **or** platform admin **or** active `user_role_scopes`; org id resolved server-side | `src/shared/middleware/org-access.ts` `canAccessOrganisation`; `route-guard.ts:21` | `org-access.spec.ts` (zero ids / owner / admin / scope / non-scope), settlement isolation integration | Cross-tenant negatives sampled, not exhaustive per org route | A |
| A4 | Session/refresh revocation and device cap | `auth.service.ts` (`revokeAllForUser`, `revokeOldestForUser`, `SESSION_MAX_DEVICES`) + `session.repository.ts` (`is_revoked`) | `auth` 26 tests; frontend `api.test.ts` 11 (401 refresh replay/session clear) | Refresh-token **reuse detection** not separately asserted | A/S |
| A5 | Per-route rate limits (login 10/min, forgot/reset 5/15 min, etc.) | `auth.routes.ts` + rate-limit plugin | `auth-route-rate-limit.spec.ts` (17 cases) | — | A |
| A6 | Brute-force lockout / progressive delay | `src/modules/brute-force/application/brute-force.service.ts` | **none** (module has 0 specs; grep for lockout found only academy row locks) | Entire lockout behaviour | S |
| A7 | Role→permission templates drive granted keys | `scripts/role-permission-templates.mjs` | No automated parity test (P3-05 checked selected grants with DB evidence) | Template vs DB vs registry drift **B24** | S |

#### B. Booking (6)

| # | Rule | Source | Tests | Uncovered edge | Class |
|---|---|---|---|---|---|
| B1 | Players may book only inside the branch-local 7-day window (`today … today+6`), DST-safe | `booking/domain/booking-window.policy.ts`; `booking.service.ts` `assertPlayerBookingWindow` | `booking-window.policy.spec.ts` + integration | — | A |
| B2 | Window bypass only with `super_admin` / `admin.bookings.update-status` / `org.bookings.manage` | `booking.service.ts` `canBypassPlayerBookingWindow` | Covered by create-booking integration (source + tests) | No standalone bypass-matrix test | A/S |
| B3 | Availability/conflict: overlapping/duplicate slots rejected under Redis locks + transaction | `booking.service.ts` (`redisLock.acquireAll`, `beginTransaction`), `slot-generator.ts`, `court-reservation.service.ts` | `booking.concurrency.integration.spec.ts`, `create-booking.integration`, `booking.repository.contract.integration` (concurrent inserts) | Lock **expiry/timeout** failure mode not directly asserted | A |
| B4 | Lifecycle `pending → confirmed → completed / no-show / cancelled / expired` with workers | `booking/commands/*`, `booking-expiry.worker.ts`, `booking-auto-complete.worker.ts` | create/confirm/complete/cancel/expire unit + integration + event contracts | — | A |
| B5 | Cancellation compensates or refunds per policy; provider cancel path | `booking.service.ts` `cancelBooking`, `compensateFailedBooking`, `cancelBookingByProvider`; `booking-cancellation-policy` | `cancel-booking.*`, `booking-refund-idempotency.integration` (concurrent refunds collapse to one) | — | A |
| B6 | Recurring series create/cancel/cash/refund accounting | `booking-series.repository.ts`, `recurring-payment.service.ts` | `recurring-pricing.r5a`, `recurring-series-payment.r5b` integration | — | A |

#### C. Payments (6)

| # | Rule | Source | Tests | Uncovered edge | Class |
|---|---|---|---|---|---|
| C1 | Charge routing by method (card / wallet / cash) | `payment.service.ts` `charge`, `gateway-factory.ts` | `payment-charge-routing.spec.ts`, `hardening-chargebywallet-reservation.spec.ts` | — | A |
| C2 | Webhook authenticity via gateway HMAC before any state change | `payment.controller.ts`, `payment.service.ts:319`, `paymob-gateway.ts:336` `verifyWebhook` | Integration suites call `handleWebhook(..., 'sig')` with `verifyWebhook` **mocked `true`** | **No negative/forged-signature test** (B5) | S/L |
| C3 | Duplicate charge protection: client `idempotencyKey` + gateway reference | `payment.service.ts` (idempotency block) + `payment.repository` | `payment-reference-id.integration`, `process-payment.hardening.spec` | — | A |
| C4 | Refund crash window + concurrency (no double refund) | `payment.service.ts` `REFUND_RESOLUTION_WINDOW_MS`, refund intent | `hardening-refund-crash-window.integration`, `hardening-group-card-refund-race.integration` | — | A |
| C5 | Confirm/poll/status transitions; terminal states idempotent | `confirmPayment`, `getPaymentStatus`, `FINAL_STATES` | `payment.integration`, `payment-reference-id` S6 (late webhook skipped), P3-10 UI poller tests | Real gateway confirmation (B7) | A |
| C6 | Stale payment expiry | `expireStalePayments`, `expirePayment` | `payment-reference-id` S6 | Scheduled sweeper timing not asserted | A/S |

#### D. Marketplace (6)

| # | Rule | Source | Tests | Uncovered edge | Class |
|---|---|---|---|---|---|
| D1 | No oversell: conditional atomic decrement (`quantity >= ?`), variant rollback, restore on cancel/refund | `marketplace.repository.ts:443` `decrementStock` / `:465` `restoreStock`; `marketplace.service.ts:642,1144…` | Restore asserted in `multi-seller-checkout` / `multi-seller-accounting` (repo mocked) | **No test hits the real conditional UPDATE / `Insufficient stock`** | S/A |
| D2 | Order lifecycle + checkout-group fulfilment/failure | `marketplace.service.ts`, `change-order-status`, `order-aggregate` | `change-order-status.spec`, `order-aggregate.spec`, `group-card-refund-wiring.spec` | — | A |
| D3 | Seller must have an **active** subscription at checkout | `marketplace.service.ts:438` (throws `ConflictError`) | All checkout suites **mock** `getCurrentSubscription` → `active` | **No rejection test** (inactive/expired/suspended seller) — B26 | S |
| D4 | Commission/seller economics + settlement split | `commissionService`, `seller-order-economics` | `seller-order-economics.spec`, `multi-seller-accounting.spec` | — | A |
| D5 | Tax persisted per order line | marketplace tax persistence | `marketplace-tax-persistence.integration.spec` | — | A |
| D6 | Complaint holds / refunds / receipt timeout | `marketplace-complaint.service.ts`, workers | `f4-complaint-hold-release`, `f4-receipt-timeout-worker`, `f2-*` | — | A |

#### E. Settlement / gateway clearing (5)

| # | Rule | Source | Tests | Uncovered edge | Class |
|---|---|---|---|---|---|
| E1 | Settlement direction + fees + payable computed from entitlements | `settlement/application/unified-settlement-calc.ts` `computeSettlementFinancials` | `unified-settlement-calc.spec.ts` | — | A |
| E2 | Create/pay/cancel settlement; concurrent settlement blocked | `unified-settlement.service.ts` | `unified-settlement.service.spec`, `unified-settlement.concurrency.integration` | — | A |
| E3 | Gateway batch reconciliation: header = sum of ACTIVE lines | `gateway-settlement.reconciliation.ts` | `gateway-settlement.integration`, `gateway-settlement-reversal.integration` | — | A |
| E4 | Org isolation on settlement lists/exports | repository scope filters | `f3-org-scope.spec`, `f3-repo-isolation.spec`, `multi-org-settlement-isolation.spec` | — | A |
| E5 | No double settlement (bounded `LEAST`) | settlement calculation guards | “coach settlement cannot double-settle (bounded by LEAST)” | — | A |

#### F. Subscriptions and membership (4)

| # | Rule | Source | Tests | Uncovered edge | Class |
|---|---|---|---|---|---|
| F1 | Org subscription request lifecycle (submit → approve/reject/reopen → activate) | `org-portal.routes.ts:66-71`, `subscription-*` services | `subscription-request.spec`, `subscription-reject-controller.spec`, `subscription-reopen.spec`, `activate-pending-badge.spec` | Gateway-paid activation covered only with mocks | A |
| F2 | Membership plans/benefits P1–P3 + GL posting | `membership.service.ts`, `membership-lifecycle/installment/renewal` | `membership-p1/p2/p3` unit + integration + GL | — | A |
| F3 | Membership refund windows (before/at/after start) | membership refund policy | “BEFORE membership start → ALLOWED”, boundary/after → REJECTED | — | A |
| F4 | Seller/org access requires an active subscription | `current-subscription.service.ts` | `current-subscription` unit tests (status resolution) | Enforcement path untested (see D3) | A/S |

#### G. Accounting (5)

| # | Rule | Source | Tests | Uncovered edge | Class |
|---|---|---|---|---|---|
| G1 | Journal must balance (debits = credits) | `accounting.controller.ts:1169` (manual journals) | `org-journal.integration` (accepts balanced, rejects unbalanced), `org-journal-rbac.integration` | — | A |
| G2 | Period handling + year close requires balanced ledger | `year-closing.service.ts:135` `validateLedgerBalance`, period services | `org-periods-yearclose.integration`, `year-close.full.integration` | — | A |
| G3 | Reports/tax scoped to the organisation | accounting report/tax services | `org-reports-scoping.integration`, `tax-*` suites | — | A |
| G4 | GL idempotency/replay + source segregation | `financial` engine | `hardening-accounting-replay.spec`, `accounting-source-segregation.integration` | — | A |
| G5 | Org journal RBAC (own org only, balanced required) | `accounting.routes.ts` + controller | `org-journal-rbac.integration` | — | A |

#### H. Messaging, notifications, realtime (6)

| # | Rule | Source | Tests | Uncovered edge | Class |
|---|---|---|---|---|---|
| H1 | Conversation access: participants only; group admin/creator rules for invite/remove/delete | `community.service.ts:80-176` (`isConversationParticipant`, `ForbiddenError`) | **0 community specs** | All REST authorization rules — **B25** | S |
| H2 | Chat REST requires `community.chat.view/send` + `community.chat_enabled` flag | `community.routes.ts` (`requirePermission`, feature-flag hook) | None at API level; frontend gate tested (P3-10) | 403/flag-off behaviour untested server-side | S |
| H3 | Socket room joins fail closed (booking owner/staff, conversation participant, platform admin) | `src/realtime` room authorization | `src/realtime/__tests__/room-authorization.spec.ts` (owner/staff/unrelated/nonexistent/participant/non-participant/admin) | — | A |
| H4 | Notification dedupe, preferences, quiet hours, templates, dispatch | `notifications` engine + dispatcher | 201 tests (`tournament-notification-dedup*`, `quiet-hours.service`, `notification-preference*`, templates) | — | A |
| H5 | Provider failover + dead-letter retry | `failover.service.ts`, `delivery.repository.ts` (DLQ) | **0 test references** to `failover` / `deadLetter` | Failover chain and DLQ replay — **B27** | S |
| H6 | Realtime cache updates subscribe once per event list, no leaks | `useSocketEvents` (P3-04) | `useSocketEvents.test.tsx` 8 + hub/g11-10 suites + P3-09 map | — | A |

### 5D.3 B24 — permission mapping (route vs page vs nav vs deny-list)

Source: `permissions/adminRoutePermissions.ts`, page gates, `navigation/admin.registry.ts`, `AdminLayout`
deny-list, `scripts/role-permission-templates.mjs`. **No permission or grant was changed.** Role impact is
template-derived; the authoritative DB grant set was **not** re-queried (no Docker/DB operations in this
task) and must be confirmed in the RBAC alignment task.

| Route | Route key (`AdminLayout`) | Page gate | Nav key | Mismatch | Observable effect |
|---|---|---|---|---|---|
| `/admin/finance` | `financial.view` | `sidebar.finance-dashboard` | `sidebar.finance-dashboard` | two different keys | Page key without route key → **Access denied**; route key without page key → **blank page** |
| `/admin/finance/ledger` | `financial.view` | `sidebar.finance-ledger` | `sidebar.finance-ledger` | same class | same |
| `/admin/finance/reports` | `reports.view` | `sidebar.finance-reports` | `sidebar.finance-reports` | same class | same |
| `/admin/financial-ops` | `financial.view` | `sidebar.finance-transactions` | `sidebar.finance-transactions` | same class | same |
| `/admin/accounting/dashboard` | `sidebar.accounting` | `accounting.dashboard` | `sidebar.accounting-dashboard` | **three different keys** | Template roles with `^sidebar\.`/`.+\.view` (auditor, read-only-admin) pass the guard + see the menu but lack `accounting.dashboard` → **blank page**; finance-manager has `accounting.dashboard` but no `sidebar.accounting` → **Access denied** on direct URL |
| `/admin/unified-settlements` | `settlements.view` | `settlements.view` | `sidebar.settlements` | nav key differs | `settlements.view` without `sidebar.settlements` → reachable by URL, **hidden from the menu** |
| `/admin/settlements/bookings` | `settlements.view` | `settlements.view` | `sidebar.settlements-bookings` | nav key differs | accountant holds `settlements.*` but not this nav key → reachable by URL, not in menu |
| `/admin/users` (representative privileged route) | `users.view` | none | `users.view` | deny-list role check | accountant is denied even if it held `users.view` (B15 defence-in-depth, intentionally retained) |
| `/messages` | none (App `ProtectedRoute` + `FeatureFlagGuard`) | `community.chat.view` | `community.chat.view` + flag | route layer has no permission key | page hides + backend 403; no route-level error surface |
| `/org/:orgId/accounting/records` | `orgAccessGuard` (owner/admin/scope) | `org.accounting.view` | `org.accounting.view` | consistent | — |

### 5D.4 Verified risk status (no deferred item treated as done)

| Risk | Verified status |
|---|---|
| **B5** | **PARTIALLY RESOLVED (P5-02/P5-03).** Webhook HMAC positive/negative tests now exist (Intention 20-field, Accept 23-field, 401 paths) but the comparator remains non-timing-safe; upload magic-byte and CORS/header negatives still absent; brute-force service still has **0** tests. Rate-limit negative coverage **does** exist (`auth-route-rate-limit.spec.ts`, 17). |
| **B7 / P5-04** | **SUPERSEDED 2026-10-28 — see §5Q.** P5-04 is recorded `DONE` on **limited, user-confirmed** evidence (Test-mode dashboard, Test-labelled Public/Secret keys, successful Hostinger test). No Sandbox call was executed by the assistant; credential scope and HMAC availability remain unverified. |
| **B13 / B14 / AR-2** | Unchanged: backend prod 6 advisories (in-range fixes), frontend dev-only 10 accepted, Alpine/musl + Docker proof deferred to Phase 9. |
| **B19** | OPEN. Frontend CI `tsc --noEmit` is a no-op (references-only config); backend tests excluded from `tsc`. |
| **B20** | OPEN. Frontend `strict` relies on the TS 6 default; pinning recommended. |
| **B21** | OPEN. 3,163 explicit `any`; ESLint not type-aware. |
| **B22** | OPEN. `@dnd-kit` `.d.ts` blocks frontend `skipLibCheck:false`; backend clean. |
| **B23** | PARTIAL. Navbar + payment-id gaps closed in P3-10; P3-04/P3-06 remain static-only evidence. |
| **B24** | **OPEN, mapped above.** Deny-safe, no data exposure; menu/blank-page inconsistency. |
| Container-based integration suites | **32** suites remain unrun under the no-container rule (163 integration files total); 131 persistent specs, of which 129 destructive (see `INTEGRATION_SAFETY_ASSESSMENT.md`). |

### 5D.5 Coverage gaps ranked by business impact × regression likelihood

| Rank | Gap | Impact | Likelihood | Class | Owner |
|---:|---|---|---|---|---|
| 1 | Messaging **REST** authorization untested (participant/group-admin rules, permissions 777 call-site context) | High (data exposure if wrong) | High (no tests, actively edited in P3-03) | **Missing tests** — B25 | P4-06 / P7-06 |
| 2 | Webhook HMAC negative path untested (forged signature accepted/rejected unknown at test level) | High (fake payments) | Medium | **Missing test** — B5 | P5-02 |
| 3 | Seller-subscription checkout rejection untested (inactive/expired seller) | High (unauthorised sales) | Medium | **Missing test** — B26 | P4-04 |
| 4 | Upload magic-byte / CORS / header negative tests absent | High | Medium | Missing tests — B5 | P7-06 |
| 5 | Brute-force lockout has 0 tests | Medium | Medium | Missing tests — B5 | P7-06 |
| 6 | Notification failover / DLQ replay untested | Medium | Medium | Missing tests — B27 | P4-05 |
| 7 | B24 route/page/nav key drift | Medium (confusing, deny-safe) | Medium | **Confirmed mapping defect** | RBAC alignment task |
| 8 | Marketplace conditional stock update not tested against a real DB | Medium (oversell) | Low-Medium | Missing test (repo mocked) | P4-04 |
| 9 | Container integration suites unrun (32) | Medium (evidence) | — | **Unverified** | Phase 7/9 |
| 10 | Sandbox payment lifecycle | High | — | **Not verified externally** — B7 | P5-04/P5-05 |

No **new code defect** was found in this inventory; the only confirmed defect class is the B24 mapping
inconsistency. Everything else is either missing negative coverage or an unverified external integration.

### 5D.6 Commands actually run (inspection only)

```bash
cd backend
npx vitest list                                             # 3,740 unit test entries
Get-ChildItem src -Recurse -Include *.integration.spec.ts   # 163 files (308 unit-only spec files)
npx vitest run src/modules/community                         # "No test files found" (exit 1)
grep requirePermission                                      # 777 call sites
grep -i "invalid signature|tamper" src --include=*.spec.ts  # 0 HMAC negative tests
grep -i "brute.?force|lockout" src --include=*.spec.ts      # 0 (only academy row locks)
grep -i "failover|deadLetter" src/modules/notifications --include=*.spec.ts   # 0
```

No test was executed for correctness in this task (inventory only), and no file was modified outside this
progress document.

## 5E. P4-02 — authentication, sessions, RBAC and tenant-isolation audit (2026-10-27)

Evidence base: current source, existing tests, and **read-only SELECT queries** against the already-running
Docker MySQL `courtzon_v3` (no container start/stop, no schema/data change, no credentials printed).
**Two confirmed security defects were fixed with red→green proofs; B24 is resolved with authoritative grants.**

### 5E.1 Authentication and session/token lifecycle

| Rule | Source | Evidence | Status |
|---|---|---|---|
| Missing/invalid/expired access token → **401** (except documented public prefixes) | `shared/middleware/auth.middleware.ts:111` `authMiddleware` | Session query requires `is_revoked = FALSE AND expires_at > NOW()` (`session.repository.ts:41`); integration suite `session-expiry.integration.spec.ts` covers expiry/revocation/refresh | Verified (A/S) |
| Session tokens stored **hashed** (SHA-256), never raw | `shared/utils/token.ts` `hashToken` + `session.repository.ts` | Source | Verified (S) |
| Refresh **rotation**: a used refresh token is revoked and a new session issued | `auth.service.ts:550` `refresh()` | `session-expiry.integration.spec.ts` “refresh rotates the session”; revoked session no longer resolves | Verified (A) |
| Expired refresh token revokes the session and throws `SessionExpiredError` | `auth.service.ts:556-560` | Same suite | Verified (A) |
| Device cap: oldest sessions revoked beyond `SESSION_MAX_DEVICES` | `auth.service.ts:799` `revokeOldestForUser` | Source (unit not present) | Verified (S) |
| Cookies: `httpOnly`, `sameSite=lax`, `secure` in production; access/refresh max-age separate | `shared/utils/auth-cookies.ts` | Source | Verified (S) |
| Login brute-force: 5 failures / 15 min → 30 min Redis lockout (`429`), cleared on success | `modules/brute-force/application/brute-force.service.ts`; `auth.controller.ts:109/133/161` | **0 tests in module**; keyed on `request.ip` (shared-NAT lockout possible) | Implemented, **untested** (B5) |
| Per-route rate limits (login 10/min, reset 5/15 min, …) | `auth.routes.ts` | `auth-route-rate-limit.spec.ts` 17 cases | Verified (A) |
| “Logout all devices” revokes every session | `auth.service.ts` `logout()` | **Was broken**: `/auth/logout` is public, so `request.userId` is never set and `allDevices=true` degraded to a single-session revoke | **FIXED** (see 5E.6) |
| Permission changes during an active session | permissions re-read per request in `app.ts:261 checkPermission`; UI reacts via store (P3-05) | Source + `routeGuards.test.tsx` (grant/revoke while mounted) | Verified (A/S) |

### 5E.2 RBAC resolution and route guards

| Rule | Source | Evidence |
|---|---|---|
| Permission check = active `user_roles` → `role_permissions` → `permissions.permission_key` (DISTINCT), 777 call sites | `app.ts:261`; `auth.middleware.ts:37` | grep count; RBAC module 112 tests |
| Platform admin = `super_admin`/`super-admin` role **or** `platform.admin` | `auth.middleware.ts:74` `adminGuard` | DB: only `super_admin` holds `platform.admin` |
| Org access = owner **or** platform admin **or** active `user_role_scopes` | `shared/middleware/org-access.ts`; `route-guard.ts:21` | `org-access.spec.ts`; settlement isolation suites |
| Org-manage/org-permission guards for staff actions | `route-guard.ts:43/63` | Source; used by org portal routes |
| Admin section guard `getAdminRoutePermission` + accountant deny-list | `frontend/src/permissions/adminRoutePermissions.ts`; `AdminLayout.tsx:22` | `routeGuards.test.tsx` 18, `AdminLayout.access.test.tsx` 5, DB grants in 5E.4 |
| No `*` permission row exists; `super_admin` works through full grants + role-based admin guard | DB query | `permissions` has no `*`; role checks cover super-admin paths |

### 5E.3 Tenant isolation — booking, accounting, settlement, marketplace, messaging

| Handler | Rule | Evidence | Status |
|---|---|---|---|
| `GET /bookings/:id` | Owner **or** accepted participant only | `booking.controller.ts getBookingHandler` (explicit check) | Verified (S) |
| `GET /organisations/:orgId/bookings` | `requireOrganisationAccess('orgId')` before the service call | `booking.routes.ts:19` | Verified (S) |
| `PATCH /bookings/:id/status`, cancel/check-in | Permission + owner/series-responsibility rules in the service | `booking.service.ts:986`, `:1171`, `canBypassPlayerBookingWindow` | Verified (A/S) |
| Org accounting journal/records | `orgAccessGuard` (`requireOrganisationAccess`) + `org.accounting.view` page gate | `org-portal.routes.ts`, `OrgAccountingRecordsPage` tests | Verified (A/S) |
| Unified settlement detail/pay/cancel | `assertSettlementOrgAccess(userId, settlementId)` resolves the owning org then checks access; list/export intersect with accessible orgs and never trust a client `orgId` | `unified-settlement.controller.ts:58/72` | Verified (S) |
| Marketplace product update/delete/variants | Seller org ids resolved from the user; product/variant `seller_id` must be owned | `marketplace.service.ts:166/217/257` | Verified (A/S) |
| Marketplace seller orders/stats | Scoped to the seller’s own org ids | `marketplace.service.ts:1656` | Verified (S) |
| **`GET /marketplace/orders/:id`** | Buyer **or** seller org on the order; **admin via separate handler** | `getOrderForUser` had an **unfiltered fallback** returning any row to any caller (`marketplace.order.view` is held by coach, org/shop admin and several platform roles) | **DEFECT — FIXED** (5E.6) |
| Community REST read/write | Participant-only; group creator/admin matrix; invitation ownership | `community.service.ts:80-273` — previously **0 tests** | **B25 CLOSED** (15 tests) |
| Socket room joins | Fail closed (booking owner/staff, conversation participant, admin) | `src/realtime/__tests__/room-authorization.spec.ts` | Verified (A) |

### 5E.4 B24 — authoritative grants (read-only DB) and effects

Source: `courtzon_v3` on the running Docker MySQL (host `127.0.0.1:3307`, server port 3306), using the
project’s own `DB_USER` from the root `.env`; **SELECT-only**, 92 role rows (26 unique slugs incl. org clones).
Unique-slug grants:

| Key | Roles |
|---|---|
| `financial.view` | accountant, auditor, finance-manager, master-admin, read-only-admin, super_admin |
| `reports.view` | accountant, auditor, finance-manager, read-only-admin, super_admin |
| `sidebar.finance-*` | accountant, auditor, finance-manager, read-only-admin, super_admin |
| `sidebar.accounting` | auditor, read-only-admin, super_admin |
| `accounting.dashboard` | finance-manager, super_admin |
| `sidebar.accounting-dashboard` | auditor, read-only-admin, super_admin |
| `settlements.view` | accountant, auditor, finance-manager, marketplace-manager, operations-manager, org-admin, read-only-admin, super_admin |
| `sidebar.settlements` | accountant, auditor, finance-manager, marketplace-manager, read-only-admin, super_admin |
| `sidebar.settlements-bookings` | auditor, finance-manager, marketplace-manager, read-only-admin, super_admin |
| `dashboard.view` | accountant, auditor, content-manager, event-manager, finance-manager, master-admin, read-only-admin, super_admin |
| `platform.admin` | super_admin |
| `marketplace.order.view` | auditor, coach, independent_coach, marketplace-manager, master-admin, org-admin, read-only-admin, shop-admin, super_admin (template drift: `PLAYER_PATTERNS` would grant it to `player`, the DB does not — **not changed**) |

**Confirmed observable effects (before the fix):**

| Route | Effect | Roles |
|---|---|---|
| `/admin/finance`, `/admin/finance/ledger`, `/admin/financial-ops` | **BLANK PAGE** — route key `financial.view` granted, page gate `sidebar.finance-*` absent | **master-admin** |
| `/admin/accounting/dashboard` | **BLANK PAGE** — route `sidebar.accounting` + nav granted, page gate `accounting.dashboard` absent | **auditor**, **read-only-admin** |
| `/admin/accounting/dashboard` | **ACCESS DENIED BY ROUTE** — page key held, route key absent (nav hidden) | finance-manager |
| `/admin/unified-settlements`, `/admin/settlements/bookings` | reachable by URL, **hidden from menu** | operations-manager, org-admin, accountant (bookings) |

**Fix (canonical model = `ADMIN_ROUTE_PERMISSIONS`):** the five page gates were aligned to the route keys
(`financial.view` ×3, `reports.view`, `sidebar.accounting`). **No permission was granted or revoked in the
DB**; every role holding a nav key already held the route key, so no role lost access, and the two blank-page
classes now render. Nav-only drift remains (B24 residual, cosmetic) — master-admin still has no finance menu
entries (it holds no `sidebar.*` keys), and operations/org-admin/accountant menus omit settlement links.

### 5E.5 Confirmed defects fixed (red → green)

| Defect | Root cause | Test (pre-fix) | Fix |
|---|---|---|---|
| **Marketplace order IDOR** | `getOrderForUser` step 3 fetched the order **unfiltered** when buyer/seller lookups missed, then returned it — any `marketplace.order.view` holder (coaches, org/shop admins and platform finance/audit roles) could read any order, including `shipping_address` PII | `order-access-isolation.spec.ts`: **2 failed** (unrelated user resolved the order) | Fallback now returns the row **only when `buyer_id === userId`**; sellers keep their org path; admin uses the separate handler |
| **“Logout all devices” no-op** | `/auth/logout` is a public route → `request.userId` undefined → `allDevices && userId` never true | `logout-all-devices.spec.ts`: **1 failed** (`revokeAllForUser` not called) | `logout()` resolves the owner from the refresh-token session before revoking all |
| **B24 blank pages** | page gate used a different key than the route gate | updated grant tests: reverting the FinanceDashboard gate → **1 failed** (FinanceDashboardPage) | five page gates aligned to route keys |
| **B25 messaging REST untested** | no specs in `modules/community` | `npx vitest run src/modules/community` → “No test files found” | 15 authorization tests added; removing the participant check → **1 failed / 14 passed** |

### 5E.6 Tests added / updated

- **New:** `modules/community/__tests__/community-authorization.spec.ts` (**15**) — participant-only reads/writes,
  group creator/admin invite/remove/update/delete matrix, invitation ownership, no write/emit on denial.
- **New:** `modules/marketplace/__tests__/order-access-isolation.spec.ts` (**4**) — buyer, seller, unrelated
  user, unfiltered-fallback isolation.
- **New:** `modules/auth/__tests__/logout-all-devices.spec.ts` (**2**) — all-device vs single-session logout.
- **Updated:** `pages/admin/finance/permissionHookOrder.test.tsx` grants now use the canonical route keys (the
  same five assertions; no assertion weakened).

### 5E.7 Commands and results

```bash
cd backend
npx vitest run src/modules/auth src/modules/rbac src/modules/community src/modules/marketplace   # 364/364, 35 files
npx tsc -p tsconfig.json --noEmit                                                                 # exit 0
npx vitest run src/modules/community                                                              # before: "No test files found"
npx vitest run src/tests                                                                          # 2 pre-existing failures in proxy-contract.spec.ts (B28)
cd ../frontend
npx vitest run src/pages/admin/finance/permissionHookOrder.test.tsx                               # 5/5 after alignment
npx tsc -b --force                                                                                # exit 0
npm run lint:gate                                                                                 # PASS — 711 files / 3,377 findings
npx vitest run                                                                                    # 1414/1414 (144 files)
```

**B28 (new, pre-existing):** `src/tests/proxy-contract.spec.ts` fails on `/demo`, `/protected`, `/broken`
because it scans **frontend test files** for `api.get('/…')` fixtures and requires nginx/vite proxy coverage
for them. Introduced by earlier test additions (`services/api.test.ts`), not by P4-02; requires a scan
exclusion or fixture rename (P7-02/P7-09).

### 5E.8 Remaining risks after P4-02

- **B24 residual:** nav-vs-route drift for master-admin (no `sidebar.*`), finance-manager (accounting nav),
  operations-manager/org-admin/accountant (settlement menu links). Deny-safe, no data exposure.
- **B5:** brute-force lockout still untested; HMAC/upload/CORS negatives unchanged; sales-side subscription
  gate (B26), notification failover (B27) unchanged.
- **B28:** proxy-contract false positive (test infrastructure).
- **B19–B22, B13, B14, AR-2, B7/P5-04:** unchanged.

## 5F. P4-03 — booking concurrency, Redis locks and transaction boundaries (2026-10-27)

### 5F.1 Call chains traced

| Flow | Chain |
|---|---|
| Player booking — card | `POST /bookings` → `createBooking` → window/pricing/tax → `redisLock.acquireAll` (15 s TTL) → `BEGIN` → `checkSlotAvailability` (`resources FOR UPDATE` + overlap count) → `INSERT bookings` + `booking_slots` → `COMMIT` → gateway `charge` → emit `booking:created` → `finally` release locks |
| Player booking — cash/COD | same, but the availability re-check + insert + COD ledger rows are one transaction; `booking:paid` emitted **after** commit; locks released in `finally` |
| Card prepare → confirm | `prepareGatewayBooking` → `acquireAllForPrepare` (10 min) → **non-transactional** availability pre-check → gateway intention → prepare JSON in Redis (stores `lockSlots`/`lockOwner`) → `confirmBookingFromPrepare` → `runProvidedTransaction` → `checkSlotAvailability(conn)` → insert `pending_payment` → relink payment → release locks + delete prepare key |
| Recurring series | no Redis lock; TOCTOU pre-check per occurrence, then ONE transaction: series row + every occurrence with `checkSlotAvailability(conn)` (per court `resources FOR UPDATE`) — any conflict rolls back the whole series |
| Tournament court | `reserveCourt` / `rescheduleCourt` → Redis locks → `BEGIN` → `matches FOR UPDATE` → availability (`resources FOR UPDATE`) → insert booking + slots + link → `COMMIT` → release |
| Coach scheduling | `scheduling-booking.service` → `redisLock.acquireCoach` (15 s) around coach-slot creation, release in `finally` |
| Expiry worker | selects `pending_payment AND expires_at < NOW()` → `ExpireBooking` command (optimistic `aggregate_version`) → rollback-safe |

### 5F.2 Redis lock implementation (verified)

| Property | Value |
|---|---|
| Court key | `booking:lock:<resourceId>:<YYYY-MM-DD>:<HH:MM>` (date+slot from the same `slotGenerator`/`splitTimeRange` inputs) |
| Coach key | `booking:lock:coach:<coachId>:<date>:<slot>` (separate namespace — unit-tested) |
| Acquire | `SET key owner PX 15000 NX`; prepare variant: Lua `SET … PX 600000` if absent **or same owner** (refresh) |
| Release | Lua compare-and-delete (`GET key == owner → DEL`); `releaseAll` per slot, errors swallowed |
| Multi-slot | `acquireAll` / `acquireAllForPrepare` with a 5 s budget; partial acquisitions are released in `finally`; returns `false` (→ 409) without touching the DB |
| Renewal | **none** (transaction is expected < 15 s; DB guard is authoritative) |
| Redis unavailable | fail-closed: the acquire throws → request fails, no booking row is written |

### 5F.3 Database authority (verified via `SHOW INDEX` on the running `courtzon_v3`)

- `bookings` has **no unique slot key** (only `uk_booking_series_occurrence (series_id, booking_date, start_time)`); `booking_slots` has only the non-unique `idx_resource_date_slot`. Migration **140** intentionally dropped the status-blind unique keys (they blocked rebooking after terminal statuses and forced history deletion) and documents the authoritative mechanism:
  `BEGIN → SELECT id FROM resources WHERE id = ? FOR UPDATE → COUNT overlapping non-terminal bookings → INSERT`.
- Every creation path uses that mechanism with a transaction connection (player create, prepare-confirm, recurring occurrences, tournament reservation, academy conflict engine).
- Race window: the first statement inside the transaction is the locking read, so the following consistent read sees a competitor's committed booking after the lock wait. Adjacent windows are not blocked (row lock, not gap lock).

### 5F.4 Failure-window analysis

| Window | Result |
|---|---|
| Redis down / acquire timeout | **Fail-closed** 409/500; no DB write; partial locks released |
| Lock TTL expires while the DB transaction runs | Another request may acquire the slot lock; both still serialize on `resources FOR UPDATE` → one commits, the other sees the committed booking and gets 409. No double booking |
| TTL expires during the post-commit gateway charge (card) | Safe: the committed `pending_payment` booking already blocks the slot; the delayed release cannot free it |
| Release after failed/timed-out transaction | `conn.rollback()` in `catch`, `conn.release()` in `finally`, `releaseAll` in the outer `finally`; compare-and-delete cannot remove a foreign lock |
| Two concurrent identical/partial-overlap requests | Real `Promise.all` evidence: exactly one succeeds, the other 409 (16 integration tests) |
| Different courts/dates/slots | Distinct keys (unit test); no accidental sharing |
| Duplicate/retry requests | A committed/pending booking blocks re-insertion (overlap count); duplicate exact-start conflicts are normalised to 409 |
| Recurring partial-series failure | One transaction for series + all occurrences; a single conflict rolls back everything (no partial series) |
| Pending-payment vs expiry worker | Optimistic `aggregate_version` on every transition → exactly one wins; loser gets a conflict |
| Multi-resource recurring / concurrent series | Two transactions can take resource row locks in different orders → InnoDB deadlock is possible; it fails safe (rollback, retryable), never corrupts (documented residual, B30) |

### 5F.5 Confirmed defect fixed — non-unique lock ownership token

- **Defect:** owners were `user:<id>` (player create + prepare), `tournament:<user>:<match>` and `scheduling:<user>:<now>`. Two acquisitions by the same principal shared a token, so a **stale release** (after TTL expiry) could delete a newer acquisition's lock. The DB `resources FOR UPDATE` guard prevents double-booking, but the distributed-lock guarantee was broken (fairness/contention, and the intended TTL protection was ineffective).
- **Fix:** `createLockOwner(scope)` appends a UUID per acquisition (`user:42:<uuid>`) and is used at all four production sites (booking create, prepare, tournament reservation, coach scheduling). No schema, policy or accounting change.
- **Proof:** `redis-lock.spec.ts` reproduces the defect class with a shared legacy token (stale release deletes the newer lock) and proves unique tokens prevent it; `lock-owner-wiring.spec.ts` fails against the pre-fix token form (**1 failed / 2 passed** under a scoped mutation, file restored byte-exactly) and passes now.

### 5F.6 Tests and results

| Command | Result |
|---|---|
| `npx vitest run src/modules/booking/infrastructure/redis/redis-lock.spec.ts` | **13 / 13** — key isolation, 15 s/10 min TTL, prepare refresh, compare-and-delete, partial-acquisition rollback, budget exhaustion, owner uniqueness |
| `npx vitest run src/modules/booking/__tests__/lock-owner-wiring.spec.ts` | **3 / 3** (pre-fix mutation: **1 failed / 2 passed**) |
| `npx vitest run src/modules/booking src/modules/scheduling` | **336 / 336** (25 files) |
| `npx vitest run --config vitest.integration.config.ts …booking.concurrency.service.integration.spec.ts …booking.concurrency.integration.spec.ts` | **16 / 16** — real `Promise.all` against the running MySQL (`courtzon_v3` @ 3307) + Redis: identical, partial overlap, adjacent, duplicate normalisation, integrity, terminal rebooking |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npm run lint:gate` (frontend, unaffected) | PASS — 711 files / 3,377 findings |
| Skipped | 32 container-based integration suites (no-container rule); remaining persistent integration suites not run (out of scope); no Docker operation performed |

### 5F.7 Residual risks

- **B30 (Low):** prepare-path availability pre-check runs outside a transaction (its `FOR UPDATE` is a no-op in autocommit); the 10-minute window relies on the Redis prepare lock and is re-validated at confirm. No renewal for the 15 s create lock. Recurring series takes multiple resource row locks without Redis locks → possible InnoDB deadlock under concurrency (fails safe, retryable).
- **B5 / B26 / B27 / B28** unchanged; Paymob Sandbox (**B7**) still blocked.

## 5G. P4-04 — marketplace inventory, overselling, restoration, seller eligibility (2026-10-27)

### 5G.1 Verified order/stock lifecycle

```
checkout
  → cart + products/variants (purchasable + per-item stock pre-check)
  → per-seller: active-subscription gate → commission → shipping → tax → discount
  → create per-seller order + items + history (autocommit statements, shared checkout_group_id)
  → conditional decrement per item  [UPDATE products SET quantity = quantity - ? WHERE id = ? AND quantity >= ?]
      └─ variant decrement; product rolled back if the variant fails
  → payment
      ├─ cash  → _fulfillAndConfirmOrder per order
      └─ card  → charge
            ├─ failure / no payment session → restore cart + stock ONCE, cancel all orders
            └─ session created             → order stays pending (abandoned worker owns terminal)
  → payment:succeeded → fulfil every order in the group
  → payment:failed    → restore once + cancel (terminal guard makes retries no-ops)
  → cancel/refund     → money first → status → reversal financials → restore stock (+ siblings)
  → abandoned cleanup (30 min) → paid check → restore (terminal-guarded) → cancel + history
```

Seller eligibility: `getCurrentSubscription(sellerOrgId)` must return `exists === true` **and**
`effectiveStatus === 'active'` for every seller in the cart (`marketplace.service.ts:429-440`). Commission is
resolved per seller from the same gate; tax uses the seller org rate (falling back to global); totals are
per-seller and aggregated for the gateway charge. Buyer/seller ownership was already fixed in P4-02
(buyer-only order read).

### 5G.2 Confirmed defects fixed (red → green)

| # | Defect | Root cause | Fix | Pre-fix proof |
|---|---|---|---|---|
| 1 | Card failure restored stock **twice** and left orders pending (inventory inflation; a later abandoned-cleanup run would restore a third time) | The `!result.success` / no-URL branches restored stock **inside** the `try`, then threw; the outer `catch` restored again | Single failure path: inner branches only throw; `catch` restores cart + stock once via `_cancelOrdersAfterFailedCheckout` and moves every order to `cancelled`; a post-session error no longer restores stock | Re-adding the inner restore makes the no-URL test fail (**1 failed / 8 passed**, byte-exact restore) |
| 2 | Part-way stock-decrement failure restored items that were **never decremented** | `_restoreOrderStock(oid)` restored the whole order regardless of which items had been decremented | Track `decrementedItems` and restore only those, in reverse order, before cancelling | Replacing the loop with per-order restore fails the targeted test (**1 failed / 8 passed**) |
| 3 | Repeated `payment:failed` event could restore stock twice | No terminal check in the failure handler or restorer | `handlePaymentFailed` ignores terminal orders; `_restoreOrderStock` skips `cancelled`/`refunded` orders (and still skips paid orders) | Disabling both guards fails the duplicate-event test (**1 failed / 8 passed**) |
| 4 | **B26** — seller eligibility untested | Every checkout suite mocked an active subscription | 5 focused tests: `exists:false`, `expired`, `suspended`, `cancelled` → rejected before any order; `active` → normal two-order checkout | Coverage gap (no code change; the gate already existed) |

### 5G.3 Atomicity and idempotency findings

- **Oversell prevention (verified):** the decrement is a single conditional UPDATE (`quantity >= ?`); no
  `SELECT … FOR UPDATE` is needed. Real concurrency (integration, no containers): 10 parallel unit
  decrements on qty 5 → exactly 5 succeed and stock lands on 0; qty 3 with five 2-unit decrements → one
  succeeds, stock 1; five parallel restores are additive.
- **Restoration idempotency:** one restore per terminal transition. Cancel/refund restores after the money
  movement and status write; a duplicate failure event, a duplicate cleanup run (sequential) or a delayed
  webhook cannot restore again because the order is terminal.
- **Not transactional (documented, B31):** order/item/history inserts and the stock decrement are separate
  autocommit statements — there is no single transaction covering them. A crash between order creation and
  decrement leaves an order with no stock movement; a crash mid-decrement is partially restored by the new
  reverse-restore path. **B31 was fixed on 2026-10-28 for the cancel/failure/cleanup paths** (conditional
  terminal claim + restore in one transaction — see **§5U**); the order-creation/decrement statements remain
  non-transactional (unchanged, documented residual).

### 5G.4 Tests and results

| Command | Result |
|---|---|
| `npx vitest run src/modules/marketplace/__tests__/checkout-inventory-integrity.spec.ts` | **9 / 9** (seller eligibility ×5, gateway failure, no-URL, decrement rollback, duplicate failure event) |
| 3 scoped pre-fix mutations | each detected **1 failed / 8 passed**; source restored byte-exactly (SHA-256, marker scan clean) |
| `npx vitest run --config vitest.integration.config.ts …marketplace-stock-concurrency.integration.spec.ts` | **3 / 3 real concurrency** (self-cleaned fixture product in `courtzon_v3`) |
| `npx vitest run src/modules/marketplace` | **218 / 218** (21 files) |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npm run lint:gate` (frontend, untouched) | PASS — 711 files / 3,377 findings |
| Skipped | 32 container-based integration suites (no-container rule); remaining persistent suites outside marketplace stock not run |

### 5G.5 Residual risks

- **B31 (Medium):** (1) no transaction spans order creation + stock decrement (crash window can leave stock
  un-decremented); (2) concurrent cancels / overlapping cleanup workers can restore the same order twice
  (no claim/lease or durable “restored” marker); (3) `reserved_quantity` is not used for soft reservations —
  stock is decremented at checkout, not at cart/payment start.
- **B5/B27/B28/B19–B22/B13/B14/AR-2** unchanged; Paymob Sandbox (**B7**) still blocked.

## 5H. P4-05 — subscriptions, notifications, reporting jobs, failover/DLQ (2026-10-27)

### 5H.1 Subscription lifecycle (verified)

```
request (NEW/CHANGE/RENEWAL) → pending
  ├─ approve → writeActiveSubscription (transaction):
  │     RENEWAL chains start = prev_end + 1 day (never the payment date)
  │     future-dated → status 'pending' (scheduled), active otherwise
  │     activation closes every other active/suspended/pending row (one effective subscription)
  │     single scheduled renewal enforced (future-dated row rejects a second renewal)
  ├─ reject → audit SUBSCRIPTION_REQUEST.REJECT + event; reopen restores pending/cancelled state
  ├─ cash activation → same canonical writer + cash accounting tests
  └─ scheduled job (daily, promote-before-expire):
        activateDueRenewals(): pending ∧ start_date ≤ today → active (FOR UPDATE, idempotent)
        expireSubscriptions(): active ∧ end_date < today → expired (FOR UPDATE, idempotent)
        sendExpirationReminders(): 30/14/7/5/3/1-day windows, notification events
```

Enforcement consumers resolve `getCurrentSubscription()` (canonical DTO with `effectiveStatus`); the
marketplace seller gate (B26) is the strictest consumer. No lifecycle defect was found. **3 pre-existing
date-expired fixtures** fail in `current-subscription-resolution.spec.ts` (fixed 2026-08/09 dates) and
`membership-p2.spec.ts` (grace window `2026-10-10`) — recorded as **B8** (P7-02), not caused by P4-05.

### 5H.2 Notification delivery / retries / failover / DLQ

| Mechanism | Verified behaviour |
|---|---|
| Queue | BullMQ, `attempts: 3`, exponential backoff (2 s base) / fixed backoff for digests; `removeOnFail` retention 7 days |
| Provider failover | `deliverToChannel` iterates the providers registered for a channel and returns the first success (provider-level failover). The user `failover_chain` is **pre-delivery channel expansion** (union with opted-in channels), not a post-failure cascade — documented |
| Attempt accounting | `attempts` increments on every `failed` write; drives retry exhaustion |
| Dead letter | Terminal attempt (`attempts >= max_retries`) persists **one** `notification_dead_letter_queue` row with the original job payload, marks the delivery `dead_letter`, audits it, then rethrows for BullMQ |
| Replay | Atomic claim (`DELETE … WHERE id`, `affectedRows` guard) → new delivery → **enqueue `process_notification`** → row removed. Enqueue failure re-inserts the dead letter and rethrows |
| Duplicate processing | A retried job for an already-`delivered` notification/channel is suppressed (audit `duplicate_suppressed`) |
| Preferences | Malformed `channels`/`failover_chain` JSON is ignored (fallback `in_app`), never throws |
| Graceful shutdown | `SIGTERM`/`SIGINT` → close workers (normal + notification), queue, Redis, MySQL pool, Socket.IO, Fastify |
| Digest | Scheduler now enqueues the canonical `ProcessNotificationDigestJob` (`count`, `categorySlug`, `eventName`, `windowId`) |

### 5H.3 Confirmed defects fixed (red → green)

| # | Defect | Pre-fix proof | Fix |
|---|---|---|---|
| 1 | Provider result `{success:false}` fell through as success — delivery row stuck `processing`, BullMQ marked the job complete, notification silently lost | Disabling the new guard → **1 failed / 4 passed** | Throw on `!result.success` so the job retries |
| 2 | DLQ was written **only on the success path** (and never for real failures); terminal failures were never persisted | Disabling terminal guard → **1 failed / 4 passed** | Persist DLQ in the failure path when attempts reach `max_retries` |
| 3 | A failed attempt never incremented `attempts` → exhaustion never detected | Disabling increment → **1 failed / 6 passed** | Increment attempts on `failed` |
| 4 | Replay created a delivery row but **never enqueued** it, then deleted the dead letter (replay lost) | Disabling enqueue → **2 failed / 5 passed** | Enqueue `process_notification`; restore the row if enqueue fails |
| 5 | A retried job could send an already-delivered notification twice | Disabling guard → **1 failed / 4 passed** | `findDeliveredDelivery` suppression |
| 6 | Corrupted preference JSON crashed dispatch | Malformed JSON test (old code threw) | Safe parser with fallback |
| 7 | Digest job payload used `notificationCount`/`frequency`; worker read `count`/`categorySlug` → undefined text and category | Reverting the payload → **2 failed / 1 passed** | Canonical payload |

All mutations were restored byte-exactly (SHA-256, marker scan clean). No schema change was required.

### 5H.4 Reporting and background jobs

- Reporting endpoints are request-scoped (no scheduled report generator) and tenant scoping is enforced by
  the existing report/BI suites (`org-reports-scoping`, `tournament-finances.report`).
- Registered workers (booking expiry, academy holds, saga repair, abandoned orders, subscription/membership
  expiry + reminders, entitlement activation, complaint periods, payment sync/expiry, match lifecycle,
  digests, cleanup) are registered once in `server.ts`; financial workers post through the canonical
  accounting services and their existing suites (financial 307) remain the reference — not re-run wholesale
  in this task.
- `retry_failed_deliveries` exists in the `JobType` map but has **no registered handler or schedule** —
  dead job type (B32).

### 5H.5 Tests and results

| Command | Result |
|---|---|
| `npx vitest run src/modules/notifications/__tests__/{notification-failover,notification-dlq,notification-replay,digest-scheduler}.spec.ts` | **21 / 21** |
| 6 pre-fix mutations (5 worker/repo + digest payload) | all detected (1–2 failures each), sources restored byte-exactly |
| `npx vitest run src/modules/notifications` | **222 / 222** (28 files) |
| subscription + membership suites | **126 / 129** — 3 pre-existing date-expired fixtures (**B8**, P7-02) |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npm run lint:gate` (frontend untouched) | PASS — 711 files / 3,377 findings |
| Skipped | 32 container-based integration suites; **no live email/SMS/push/webhook provider test** (providers are mocked; external delivery is unverified) |

### 5H.6 Residual risks (B32)

1. **Digest duplication:** `processDigest` selects unread notifications without marking them digested or
   claiming a window; overlapping hourly/daily runs can enqueue more than one digest for the same unread set.
   The `notification_digest_windows` table exists but this path does not use it.
2. **`retry_failed_deliveries`** has no handler/schedule (dead JobType).
3. **Channel “failover”** is pre-delivery expansion, not a failure cascade; documentation now matches code.
4. **Duplicate sends under a true race:** two workers processing the same notification concurrently can both
   pass the delivered-lookup before either writes `delivered` (the app-level guard is not atomic without a
   unique key; schema change deferred).

## 5I. P4-06 — EventBus, Socket.IO, idempotency and event races (2026-10-27)

### 5I.1 Event call chain (verified)

```
business op
  └─ eventBusV2.emit(event, payload, ctx, conn?)
       └─ createEnvelope (ULID eventId, schemaVersion, occurredAt …)
       └─ INSERT published_events            ← SAME connection as the domain write
            (unique event_id; ER_DUP_ENTRY ignored → idempotent publish)
       └─ defer to after-commit:
            • enqueue subscriber queues (jobId = `<eventId>--<queue>`, attempts 6, custom backoff)
            • run in-memory handlers (notification engine, SocketPublisher)
  └─ transaction commits
       └─ subscriber worker (per queue)
            └─ processed_events UNIQUE(event_id, subscriber_id) → duplicate skipped
            └─ handler → Socket.IO rooms / notifications
  └─ outbox poller (every 5 s, cursor per subscriber)
       └─ re-enqueues committed-but-not-enqueued events (same jobId → BullMQ dedupe)
```

### 5I.2 Transaction timing (verified)

| Case | Behaviour |
|---|---|
| `withTransaction` / `runProvidedTransaction` | Event row + hooks are part of the transaction; hooks run **only after commit**; rollback discards them |
| Manual `conn.beginTransaction()` + `conn.commit()` (booking create, marketplace) | Events emitted after the manual commit run outside the ALS context → now **immediate** (previously buffered into a global array that never flushed) |
| Event emitted inside a transaction that rolls back | No realtime/notification delivery and no outbox row (both rolled back) |
| Commit succeeds but enqueue fails | Outbox row persists → poller recovers within 5 s (durable, not exactly-once) |

### 5I.3 Confirmed defect fixed — global after-commit hook queue

- **Defect:** `afterCommitHooks` was a module-global array with an index snapshot. With two overlapping
  requests, request A's commit spliced and ran **both** A's and B's hooks → B's event (realtime + notification)
  was delivered before B committed; if B later rolled back, clients received a **phantom event**. Also, when
  `emit` ran outside any transaction, the enqueue hook was pushed to the array and **never flushed** (the only
  `flushAfterCommitHooks()` callers are test mocks) — delivery depended entirely on the 5 s outbox poller.
- **Fix:** hooks live in the `AsyncLocalStorage` transaction context (`{inTransaction, hooks}`); each
  transaction flushes only its own hooks; outside a transaction `onAfterCommit` runs the hook immediately.
- **Proof:** `src/tests/database.transaction.spec.ts` (6 tests). Swapping in the pre-fix file produced exactly
  **2 failures** (cross-transaction flush, outside-transaction immediacy) / 4 passes; the file was restored
  byte-exactly (SHA-256). No broad revert.

### 5I.4 Idempotency — durable vs best-effort

| Mechanism | Guarantee |
|---|---|
| `published_events.event_id` unique + duplicate ignored | **Durable** — one row per emitted event |
| `processed_events` UNIQUE(event_id, subscriber_id) | **Durable** per-subscriber handler dedupe (skips already-processed events) |
| `outbox_cursors` per subscriber + `last_event_id` guard | **Durable** recovery cursor; poller re-enqueues committed events |
| Queue `jobId = eventId--queue` | **Best-effort window** — dedupes while BullMQ retains the job (`removeOnComplete` 1 day / 1,000 jobs) |
| Subscriber handler side effects | **At-least-once**: the processed row is written *after* the handler succeeds, so a crash between the side effect and the record can re-run the handler on retry — handlers must be idempotent (notifications dedupe by event; websocket emissions are safe) |

### 5I.5 Socket.IO / realtime (verified)

- Room joins fail closed: booking (owner/staff), match (owner/participant/join-request), conversation
  (participant), resource (authenticated) — 6 tests in `src/realtime/__tests__/room-authorization.spec.ts`.
- Room scoping: `user:<id>`, `organization:<id>`, `branch:<id>`, `role:<slug>`, `admin`, `player`, plus
  per-entity rooms; the publisher emits once to the union of mapped rooms (no duplicate per-room emits).
- Reconnect: infinite retry with 1–30 s backoff; offline notifications are replayed via
  `notification:reconnect-queue`; on `reconnecting|disconnected → connected` the frontend runs
  `invalidateRealtimeReconcile` (refetch of match/result/tournament roots). Domain events are **not** replayed
  to the socket — reconcile-by-refetch is the deliberate design.
- Frontend subscriptions: P3-04 `useSocketEvents` (one effect per list, handler ref, full cleanup) remains the
  only subscription primitive; no subscriptions inside loops.

### 5I.6 Tests and results

| Command | Result |
|---|---|
| `npx vitest run src/tests/database.transaction.spec.ts` | **6 / 6** (cross-transaction isolation, rollback discard, post-commit ordering, ALS flag, provided-connection path, outside-transaction immediacy) |
| pre-fix file swap | **2 failed / 4 passed**, restored byte-exactly |
| `npx vitest run src/shared src/modules/realtime src/tests/database.transaction.spec.ts` | **284 / 284** (22 files) |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npm run lint:gate` (frontend untouched) | PASS — 711 files / 3,377 findings |
| Skipped | 32 container-based integration suites; `published-events`/`processed-events` integration specs (DB-dependent, not run); no live Socket.IO client/server test |

### 5I.7 Residual risks (B33)

1. **Unawaited emits:** 255 of 366 `eventBusV2.emit(...)` call sites are neither awaited nor `void`-ed; the
   emit performs a DB insert, so a transient failure becomes an unhandled rejection (Node 22 default can
   terminate the process) and the event is lost. Fixing all sites is a broad change — deferred to the P8-09
   debt register.
2. **No durable event dead-letter store:** after BullMQ exhausts attempts the subscriber only logs
   `event.dead_letter`; replay requires the outbox (which will not re-send an event whose cursor advanced).
3. **At-least-once duplicate window:** see 5I.4 — handler idempotency is the contract, not exactly-once.
4. **Cursor init race:** `subscribe()` initialises cursors fire-and-forget (`initCursorLatest`); a very early
   poll could read `0` and replay history for a `latest` subscriber. Poller starts 10 s after boot, so the
   window is startup-only.
5. **No socket event replay** after reconnect (by design); clients rely on refetch reconcile.

## 5J. P4-07 — accounting integrity: double entry, idempotency, reversal and reposting (2026-10-27)

### 5J.1 Canonical posting chain (verified end to end)

```
domain write (own transaction, own connection)
  └─ eventBusV2.emit(domain:event)                     ← same connection: published_events row
       └─ after-commit subscribers (P4-06 ALS-scoped hooks)
            └─ accounting listener handler (accounting-event.listener.ts)
                 └─ postAccountingEvent(eventType, sourceType, sourceId, orgId, conceptAmounts, currency, description,
                                        outerConn?, conceptOrganisations?, timezone?)
                      ├─ ledgerRepository.hasPosting(source_type, source_id, event_type)   → false (APP pre-check)
                      ├─ accountingEngineService.resolveMapping(eventType, orgId)           → DB mapping + code defaults
                      ├─ accountingEngineService.validateAccounts(ids, orgId)               → active / org scope / L4 postable
                      ├─ accountingEngineService.buildLedgerLines(...)                      → declared concepts only
                      │     (0 amounts omitted · negative & unknown concepts REJECTED ·
                      │      same side+account+org merged, different org attribution kept)
                      ├─ accountingEngineService.validateBalance(lines)                     → debits == credits (≥ 0.01)
                      ├─ ledgerRepository.createEntries(lines, conn) ──► ledger_entries     → uk_dedup (DB) · ER_DUP_ENTRY → rollback, false
                      ├─ glProjectionService.resolvePeriod + projectEntries(conn) ──► general_ledger
                      └─ commit → emit('accounting:entry-recorded')                          → SELF-COMMITTING PATH ONLY
```

Events traced: `payment:succeeded`, `payment:refunded`, `payment:allocation-refunded`, `payment:failed-event`,
`marketplace:order-processing|delivered|refunded|cancelled`, `wallet:withdrawal-submitted|completed`,
`payment:gateway-settled|settlement-reversed`, `settlement:paid`, `booking:paid`, `booking:refunded`,
`tournament:prize-awarded|refunded`, plus the direct callers (`subscription-activation`,
`booking-settlement`, `settlement-correction`, tournament/academy/membership refund services).

### 5J.2 Posting paths and accounts (DB-resolved, not assumed)

| Flow | Events | Chart accounts (code) |
|---|---|---|
| Booking card | `booking_card_payment` → `booking_refund` | Dr 1100 Payment Clearing = gross · Cr 2202 Merchant Payable = org net · Cr 4110 Platform Commission · Cr 2300 Tax (exact inverse on refund) |
| Booking wallet | `booking_wallet_payment` → `booking_wallet_refund` | Dr 2100 Wallet Liability = gross · Cr 2202 + 4110 + 2300 (inverse credits 2100) |
| Booking COD / series cash | `booking_cod_payment` → `booking_cod_reversal`; `booking_series_cod_payment` | Dr 1161 Marketplace Receivable = commission + tax · Cr 4110 · Cr 2300 (inverse on reversal) |
| Coach / org recovery | `booking_coach_recovery`, `booking_org_recovery`, `booking_coach_reversal` | Dr recovery receivable / Cr coach expense · Dr org recovery receivable / Cr org payable (2200) · Dr coach payable / Cr coach expense |
| Org book (merchant) | `booking_org_receivable_reversal`, `booking_org_cash_receivable_rev` | Org-scoped revenue / receivable / commission-expense reversal; mirrored 1:1 by the payment posting |
| Marketplace | `marketplace_card_payment`, `marketplace_wallet_payment`, `marketplace_cash_commission`; refunds `marketplace_merchant_refund`, `_settled`, `marketplace_wallet_refund`, `marketplace_cash_reversal` | Card/wallet: Dr 1100 / Dr 2100 · Cr 2202 + 4160 + 2300. Cash: Dr 1161 · Cr 4160. Unsettled refund credits 1100; **settled** refund (`marketplace_merchant_refund_settled`) credits **1120**, never 1100 |
| Academy | `academy_card|wallet|cash_payment` → `academy_*_refund` | 1100 / 2100 / 1161 with 2202 + 4191 + 2300 (tax 0 % by design); refunds are exact inverses |
| Membership | `membership_card|cash_payment` → `membership_*_refund`, `membership_card_refund_settled` | 1100 / 1161 with 2202 + 4110 + 2300; settled refund pays 1120 (+ 5220 refund expense) |
| Tournament | `tournament_registration_card_payment` → `_refund`/`_refund_settled`; `tournament_cash_commission_receivable` → `_refund` | 1100 / 2202 / 4192; cash Dr 2202 / Cr 4192; settled refund pays 1120 |
| Gateway clearing & settlement | `payment_gateway_settlement` → `payment_gateway_settlement_reversal` | Dr 1120 Cash/Bank + 5210 Gateway Fee · Cr 1100 Payment Clearing (exact inverse) |
| Merchant payout | `settlement:paid` → `settlement_paid`, `settlement_paid_otc`, `settlement_paid_offset`, `settlement_paid_otc_offset` | Dr 2202 Merchant Payable / Cr 1120; OTC Dr 1120 / Cr 1161; offsets clear 2202 **and** 1161 against net cash in one balanced posting |
| Historical correction | `settlement_paid_reversal`, `settlement_paid_correction` | Reversal Dr 1120 / Cr **2200 legacy org payable** (corrects pre-`ec2a5ab` rows); correction Dr 2202 / Cr 1120 — deliberately not a merchant-payable inverse |

Observations (no defect): `booking_wallet_refund` credits concept `wallet_liability` while
`academy_wallet_refund` credits `wallet_liability_spend`; both concepts resolve to **2100**, so the posting is
identical — naming inconsistency only. Legacy extra mapping rows (`booking_card_payment → org_payable 2200`,
`booking_cod_payment → receivable_from_org 1160`) are ignored because `buildLedgerLines` only materialises the
concepts the event declares; they are recorded under **B35** for a future seed cleanup.

### 5J.3 Invariants verified

| Invariant | Evidence |
|---|---|
| Total debits = total credits for every posting shape | Engine `validateBalance` runs inside every `postAccountingEvent`; new tests cover card/wallet/COD/marketplace/academy/membership/tournament/gateway/settlement amounts and reject imbalance |
| Refunds/reversals are exact side inversions over the same accounts (no dropped tax/commission leg) | 13 payment↔refund pairs asserted twice: concept level (unit) **and** DB-resolved chart-account code level (integration) |
| No invented accounts; every posting resolves to an existing active COA row | Integration test resolves each mapping and asserts `chart_of_accounts.is_active = 1` for every account id |
| No partial journal on failure | `postAccountingEvent` wraps ledger + GL projection in one transaction; rollback on any error; `ER_DUP_ENTRY` rolls back and returns `false` |
| Zero/negative lines impossible | `buildLedgerLines` omits `0`, throws on `< 0`; `createLedgerLines`/`createLedgerPair` throw on `<= 0` |
| Tenant/org scoping | Org-scoped lines resolved per org; merged only when side + account **and** organisation match; `validateAccounts` rejects an org posting into another org's account |
| Period handling | `glProjectionService.resolvePeriod` + `validateOpenPeriod` gate every projection (existing suites; not re-tested here) |
| Duplicate/replay safety | DB `ledger_entries.uk_dedup` UNIQUE `(source_type, source_id, event_type, chart_account_id, side)` verified via `information_schema` + application `hasPosting` pre-check + `ER_DUP_ENTRY` path |
| Realtime signal only after durable commit | `accounting:entry-recorded` emitted post-commit, self-committing path only, never on idempotent skips (existing `accounting-entry-event.spec.ts` 3/3) |

### 5J.4 Idempotency — durable vs application-level

| Layer | Guarantee | Class |
|---|---|---|
| `ledger_entries.uk_dedup` | One row per (source, event, account, side); concurrent duplicate insert fails | **Durable (DB)** |
| `ledgerRepository.hasPosting` | Skips a repeat posting before opening a transaction | Application pre-check (outside the transaction) |
| `postAccountingEvent` `ER_DUP_ENTRY` handling | Rolls back, returns `false`, logs — no duplicate journal, no realtime event | **Durable (DB)** |
| `published_events.event_id` / `processed_events(event_id, subscriber_id)` | One publish per event id; one handler run per subscriber | **Durable (DB)** — P4-06 |
| Posting identity granularity | `(source_type, source_id, event_type)` — **no occurrence ordinal** | Limitation → **B35** |

### 5J.5 Confirmed defect fixed (B34)

- **Defect:** `postBookingRefundAccounting` incremented `bookings.coach_recovered_amount` /
  `org_recovered_amount` unconditionally after calling `postAccountingEvent`. A booking refund is legitimately
  triggered twice (`payment:refunded` and `booking:refunded`); the second delivery is skipped by
  `hasPosting`/`uk_dedup`, but before the fix it **still consumed recovery capacity** with no ledger entry —
  a counter that no journal backs, followed by a later refund that can no longer recover the settled economics.
- **Fix:** `postAccountingEvent` now returns `Promise<boolean>` (`true` = this call wrote the journal; `false` =
  `hasPosting` skip or `ER_DUP_ENTRY`) and both recovery-counter updates are gated on
  `if (coachPosted)` / `if (orgPosted)`. Posting policy, accounts, concepts and settlement rules unchanged.
- **Proof (red→green):** `accounting-posting-idempotency.spec.ts` delivers the same `booking:refunded` event
  twice. With the fix, 4 distinct postings occur once each and exactly **2** recovery `UPDATE`s run
  (`coach 15`, `org 45`). Mutating the two guards to `if (true)` produced **1 failed / 5 passed** with
  **4** updates; the source was restored byte-exactly (SHA-256 `62c2c417…`).

### 5J.6 Transaction boundaries and failure windows

1. **Self-committing posting** (events, most refunds): ledger rows + GL projection commit together; the realtime
   signal fires only after that commit. A crash before commit leaves no journal (safe); the event is still
   durable in `published_events`, so the outbox poller re-delivers and the posting is retried idempotently.
2. **Outer-connection posting** (`booking-settlement`, `subscription-activation`, `settlement-correction`): the
   journal is part of the caller's transaction. `postAccountingEvent` returns `true`/`false` but these callers
   ignore it; they commit their own state and post-commit realtime themselves. Safe for the current single
   occurrence per (booking, event); see **B35**.
3. **Event handler failure is logged, not retried:** accounting handlers catch and log errors, so a transient
   DB failure completes the event without a posting (no DLQ replay for in-memory handlers). Documented in
   **B35**; harmless for duplicate-delivery safety, but it is a recovery gap — the durable re-drive path is the
   outbox only when the emit itself is re-delivered.
4. **Money movement vs journal:** refunds move money first, then emit the accounting event; the ledger can lag
   the gateway by one event hop (P4-06 delivery window), never the reverse (no journal without a refund).

### 5J.7 Tests and results

| Command | Result |
|---|---|
| `npx vitest run src/modules/financial/__tests__/accounting-ledger-invariants.spec.ts` | **25 / 25** — domain line construction, balance predicate incl. missing/duplicated leg, engine merge/org split/zero/negative/unknown/missing-mapping rejections, 13 payment↔refund concept inversions, documented `settlement_paid_reversal` exception |
| `npx vitest run src/modules/financial/__tests__/accounting-posting-idempotency.spec.ts` | **6 / 6** — `true` on first post, `false` + no transaction on `hasPosting` skip, `false` + rollback on `ER_DUP_ENTRY`, retry after a hard failure, duplicate refund delivery advances each recovery counter once, unsettled refund never touches recovery |
| pre-fix guard mutation (`if (coachPosted)`/`if (orgPosted)` → `if (true)`) | **1 failed / 5 passed** (4 updates instead of 2); restored byte-exactly (SHA-256) |
| `npx vitest run --config vitest.integration.config.ts src/modules/financial/__tests__/accounting-mapping-integrity.integration.spec.ts` | **31 / 31** against the running `courtzon_v3` (127.0.0.1:3307), **read-only** — 13 DB-resolved chart-account inversions, settled refund pays 1120 (not 1100), gateway 1100→1120+5210, settlement 2202/1120, correction 1120/2200, code-fallback completeness + active COA rows, `uk_dedup` uniqueness/columns |
| `npx vitest run src/modules/financial src/modules/accounting src/modules/settlement` | **404 / 404** (42 files) |
| `npx vitest run --config vitest.integration.config.ts src/modules/booking/__tests__/booking-recovery.integration.spec.ts src/modules/booking/__tests__/booking-refund.integration.spec.ts src/modules/booking/__tests__/booking-refund-idempotency.integration.spec.ts` | **27 / 27** (running MySQL) — recovery bounds, snapshot proration, refund idempotency |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npm run lint:gate` (frontend untouched) | PASS — 711 files / 3,377 findings |

**Skipped:** the 32 container-based (Testcontainers) integration suites — no new containers allowed; no live
gateway/Paymob Sandbox refund; no period-close/year-close execution (existing `year-closing` suites were not
re-run); no re-posting/repair tool exercise (no such tool exists).

### 5J.8 Residual risks

- **B34 — CLOSED:** recovery counters now follow the journal (see §5J.5).
- **B35 — accounting posting-identity and recovery residuals** (see §14): occurrence-level posting identity,
  outer-connection callers ignoring the posting boolean, in-memory handler failures not re-driven, legacy stale
  mapping rows, and no period-lock test in this task.

## 5K. P4-08 — business-rule coverage gap matrix and focused tests (2026-10-27)

### 5K.1 Method

Re-walked the 45-rule inventory in **§5D** and the per-task findings in **§5E–§5J** against the test files that
exist today, then classified every rule that is not adequately protected. Classification (one per gap):

| Code | Meaning |
|---|---|
| `N` | missing **normal-path** coverage |
| `F` | missing **failure-path** coverage |
| `C` | missing **concurrency/boundary** coverage |
| `X` | **external integration** not verifiable locally (Sandbox/gateway/containers) |
| `L` | **documented architectural limitation** (needs schema/service change or is accepted design) |

**Outcome: 0 confirmed production defects in this task.** Every gap below is either a test gap (now closed),
an already-documented limitation, or work that the plan routes to a later phase. No production file was changed
and no assertion was weakened.

### 5K.2 Gap matrix

| # | Area | Business rule | Existing coverage | Gap | P4-08 disposition |
|---:|---|---|---|---|---|
| 1 | Booking | Create: availability, overlap, double-booking | `booking.concurrency.*` (16), overlap/repository suites | — | Covered (not re-run: persistent DB/Redis) |
| 2 | Booking | Cancel guards: completed/cancelled/already refunded | `cancel-booking.spec`, `cancel-booking.integration.spec` (2) | — | Covered |
| 3 | Booking | Refund economics: proration from the persisted snapshot | `booking-refund.integration`, §5J tests | — | Covered |
| 4 | Booking | Refund boundaries: over-refund clamp, zero refund, zero payable, exhausted recovery capacity, recovered > settled | happy path only | **C** | **Closed:** new `booking-refund-boundaries.spec.ts` (**9**) |
| 5 | Booking | Refund → coach/org settled-vs-unsettled split | `booking-recovery.integration` (8), §5J | — | Covered (integration re-run in P4-07) |
| 6 | Booking | Recurring series: one recognition per series, multi-partial refunds | `recurring-series-payment.r5b.*` | — | Covered; occurrence identity limit → **B35** |
| 7 | Marketplace | Order status state machine + role authority | `order-aggregate`, `change-order-status`, contract specs | — | Covered |
| 8 | Marketplace | Seller must have an active subscription | `checkout-inventory-integrity` (5, B26) | — | Covered |
| 9 | Marketplace | No oversell / restore exactly once | `marketplace-stock-concurrency.integration` (3), integrity (9) | — | Covered |
| 10 | Marketplace | Concurrent cancels / overlapping cleanup workers restoring the same order | sequential + duplicate-event only | **L** | **B31** (needs claim/lease or a durable marker — schema change) |
| 11 | Marketplace | Refund formula incl. cumulative reversals | `marketplace-refund-calc`, `marketplace-cumulative-reversal` | — | Covered |
| 12 | Marketplace | Post-gateway-settlement refund pays from bank (1120) | `marketplace-settled-refund.integration`, §5J mapping test | — | Covered |
| 13 | Payments | Refund guards: status, over-refund, duplicate/concurrent requests | `hardening-refund-*`, `booking-refund-idempotency.integration` | — | Covered |
| 14 | Payments | Wallet refund returns funds through the wallet path | R4 wallet-refund suites | — | Covered |
| 15 | Payments | Webhook HMAC positive **and** negative | positive path mocked; no rejection test | **F** | **B5** — routed to **P5-02** (plan-assigned; not duplicated here) |
| 16 | Payments | Gateway timeout / error / retry against the real provider | mock-gateway unit paths only | **X** | **P5-03/P5-04** (Sandbox approval, **B7**) |
| 17 | Payments | Allocation-scoped partial refunds (recurring) | `recurring-series-payment.r5b.*` (D2-B) | — | Covered |
| 18 | Subscriptions | Eligibility, one effective subscription, approval/renewal/expiry | `subscription-*`, membership P2/P3 | — | Covered |
| 19 | Subscriptions | Activation accounting (cash/card/wallet) posted once | `subscription-cash-activation`, `subscription-accounting-modelb` | — | Covered |
| 20 | Subscriptions | Date-relative fixtures (expired plan/membership) | 3 fixtures fail because dates lapsed | **F** | **B8** — routed to **P7-02** (dates, not logic) |
| 21 | Notifications | Failover, DLQ, replay, digest payload | P4-05 suites (21), module 222/222 | — | Covered |
| 22 | Notifications | Duplicate digest suppression (overlapping hourly/daily runs) | none | **L** | **B32** (needs a window claim; schema/service change) |
| 23 | Notifications | `retry_failed_deliveries` job | type exists, no handler/schedule | **L** | **B32** |
| 24 | Settlements | Entitlement consumption: AVAILABLE only, ON_HOLD/complaint held, org scope | `booking-settlement-unification`, `f3-org-scope`, eligibility integration | — | Covered |
| 25 | Settlements | No double settlement of one booking | unification spec test 3 + entitlement reservation | — | Covered |
| 26 | Settlements | Gateway settlement reversal errors without side effects | `gateway-settlement-reversal.integration` | — | Covered |
| 27 | Settlements | Recovery offset projection vs the accounting posting result | unverified | **L** | **Characterized** (2 tests, §5K.4) → **B35** item 2; fix needs occurrence identity |
| 28 | Accounting | Double entry, refund inversion, duplicate posting | P4-07: 25 + 31 + 6 | — | Covered |
| 29 | Accounting | Durable idempotency (`uk_dedup`) vs application pre-check | P4-07 integration (read-only) | — | Covered |
| 30 | Accounting | Period scope/lock: org authoritative, platform fallback, closed rejection, missing period, org isolation | none | **C** | **Closed:** new `gl-period-lock.spec.ts` (**9**) |
| 31 | Accounting | Second legitimate occurrence of one event type | unverified | **L** | **Characterized** (1 test) → **B35** item 1 |
| 32 | Accounting | Handler failure recovery / retry | unverified | **L** | **Characterized** (2 tests) → **B35** item 3 |
| 33 | Accounting | Legacy stale mapping rows (`org_payable` 2200 / `receivable_from_org` 1160) | ignored by `buildLedgerLines`; no test | **L** | **B35** item 4 (cleanup needs seed/migration — not authorized) |
| 34 | Accounting | Period close / year-close execution | `year-closing` suites exist, not run here | **X** | Not run (no period-close operation authorized) |

**Gap counts:** 34 rules reviewed → **5 gaps closed with new tests** (#4, #27, #30, #31, #32), **4 documented
limitations** (#10, #22, #23, #33), **1 limitation characterized but unfixed** (#27), **3 routed to later
phases** (#15 → P5-02, #16 → P5-03/P5-04, #20 → P7-02), **21 already covered** (#1–#3, #5–#9, #11–#14,
#17–#19, #21, #24–#26, #28, #29).

### 5K.3 Tests added (23)

| File | Tests | What it protects |
|---|---:|---|
| `backend/src/modules/financial/__tests__/gl-period-lock.spec.ts` (new) | **9** | Org period is authoritative even when closed (caller must reject); `resolvePeriod` rejects closed; org→platform fallback; platform postings never read an org period; no covering period is a hard error; closed platform fallback rejected; `validateOpenPeriod` accepts only open ids; org isolation (query bound to the requested org) |
| `backend/src/modules/financial/__tests__/booking-refund-boundaries.spec.ts` (new) | **9** | Over-refund clamped to 100 % of the snapshot; zero refund yields zero economics; 2-decimal proration sums back to the refund; missing booking / zero payable → null; settled share taken from remaining capacity; exhausted capacity; fully unsettled booking; recovered > settled never yields negative capacity |
| `backend/src/modules/financial/__tests__/accounting-posting-idempotency.spec.ts` (extended) | **+3** (now 9) | **B35 characterization:** second same-`(source,event)` posting is skipped even with a different amount (no occurrence ordinal); a hard DB failure aborts the refund journal and the handler swallows it (no automatic retry); a manual re-delivery posts every leg and advances recovery once |
| `backend/src/modules/financial/__tests__/booking-settlement-unification.spec.ts` (extended) | **+2** (now 9) | Recovery offset: full offset + collected projection when the posting succeeds; **B35 characterization** — the collected projection still advances when the posting is skipped |

### 5K.4 Evidence and commands

| Command | Result |
|---|---|
| `npx vitest run src/modules/financial/__tests__/gl-period-lock.spec.ts src/modules/financial/__tests__/booking-refund-boundaries.spec.ts` | **18 / 18** |
| `npx vitest run src/modules/financial/__tests__/accounting-posting-idempotency.spec.ts` | **9 / 9** (6 P4-07 + 3 new) |
| `npx vitest run src/modules/financial/__tests__/booking-settlement-unification.spec.ts` | **9 / 9** (7 existing + 2 new) |
| `npx vitest run src/modules/financial src/modules/accounting src/modules/settlement src/modules/booking` | **729 / 729** (65 files) |
| `npx vitest run src/modules/marketplace src/modules/payment src/modules/notifications` | **478 / 478** (56 files) |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npm run lint:gate` (frontend untouched) | PASS — 711 files / 3,377 findings |

**Not run:** 32 container-based (Testcontainers) suites; Paymob Sandbox / live gateway flows; period-close and
year-close execution; the B8 subscription/membership date-expired fixtures (still failing by design — P7-02);
`proxy-contract.spec.ts` fixture scan (**B28**).

### 5K.5 Confirmed defects vs limitations

- **Confirmed production defects found and fixed in P4-08: none.** No behaviour change was made; the only
  production edit in Phase 4 remains the P4-07 **B34** fix.
- **Newly characterized limitations (not defects to fix here):** posting identity has no occurrence ordinal
  (B35-1); settlement recovery projection advances independently of the posting boolean (B35-2); accounting
  handlers log failures without re-driving them (B35-3). The new tests pin today's behaviour so any future fix
  is a deliberate, reviewed change.
- **External/architectural:** B5 (HMAC negatives — P5-02), B7/P5-04 (Sandbox), B8 (date fixtures — P7-02),
  B31/B32 (B31 concurrency restore, B32 digest/retry), B28 (proxy-contract scan).

## 5L. P4-09 — schema integrity vs baseline, migrations and live metadata (2026-10-27)

### 5L.1 Method (read-only)

- Sources: `database/baseline/001_courtzon_v3.sql` (authoritative baseline), all **210** files in
  `database/migrations/`, the 8 seed files in `database/seeds/`, `backend/docker-entrypoint.sh`,
  `scripts/migrate.sh`, `backend/scripts/migration-guard.sh`, and the **live** `courtzon_v3` schema
  (127.0.0.1:3307) via `information_schema` (**SELECT only**).
- Techniques: static parse of `CREATE TABLE` / `ALTER TABLE … ADD` / `DROP` / `RENAME` / `CREATE INDEX` in the
  baseline and every migration; comparison with live `TABLES`/`COLUMNS`/`STATISTICS`; extraction of SQL table
  references from **735** production `backend/src/**/*.ts` files (excluding specs); extraction and validation of
  every static `INSERT INTO <table>(columns)` / `UPDATE <table> SET columns` against live metadata; comparison of
  `migration_history` (filenames, hashes, timestamps) against the files and git history.
- **No DDL/DML was executed.** No migration, seed, cleanup or repair script was run; no `.env`, dependency,
  Docker file, commit or push was touched. Only this progress document changed.

### 5L.2 Inventory

| Object set | Count |
|---|---:|
| Baseline tables (`CREATE TABLE`) | **328** |
| Live tables (`courtzon_v3`, base tables) | **330** (baseline + `payment_allocations` + `migration_history`) |
| Baseline tables missing from live | **0** |
| Migration files | **210** (`CREATE TABLE` statements: 209; distinct tables created: **198**) |
| Column `ALTER … ADD` operations | **314** filtered column adds (484 raw `ADD`, incl. keys/constraints) |
| Migration-created tables dropped by later migrations | **6** |
| Live columns not in baseline | **45** |
| Baseline columns missing from live | **0** |
| `migration_history` rows | **211** = baseline stamp + 210 files (0 duplicates, 0 pending, 1 applied file missing on disk) |
| Production TS files / distinct SQL table refs | **735** / **349** |
| New P4-09 tests | **0** (verification task; no production change) |

### 5L.3 Findings

| ID | Finding | Evidence | Classification | Impact / follow-up |
|---|---|---|---|---|
| **S-01** | **The baseline is stale relative to the migration chain and the fresh-deploy entrypoint stamps the chain as applied.** Baseline has 328 tables; it lacks **`payment_allocations`** (created by `178_payment_allocations.sql`) and **45 columns** added by `149_gateway_settlements`, `158–161` (Academy), `177_recurring_booking_series`, `193_membership_p2_installments`. All 45 columns + the table exist in the live reference DB. `backend/docker-entrypoint.sh:48-79` imports the baseline and then inserts **every** migration filename into `migration_history` (`SHA2(filename)`) **without executing it**, so a fresh container/DB never applies 149–203. | `information_schema` diff (45 extra live columns, 0 missing); baseline HEAD `3f175281` (2026-10-12) shows a single hand-patched column (`tournaments.max_events_per_player`) — i.e. **not** regenerated; entrypoint lines 48-79 + 110-130. | **Confirmed defect (Critical, release asset/deploy path)** | A fresh deploy / DR restore lacks `payment_allocations` and Academy/settlement/series/membership columns → those features fail at first query. Runtime DB used in this campaign is migrated, so no current-session failure. Follow-up: regenerate the baseline from the full chain **and** make the entrypoint stamp only genuinely applied files (or apply pending ones); add a CI convergence check. Needs an authorized task (baseline regeneration is a DB-derived artefact; not done here). |
| **S-02** | **Org payment settings use non-existent columns.** `org-portal.controller.ts:962` (GET) selects `bfd.account_holder_name`, `bfd.account_number`, `bfd.swift_code`, `bfd.tax_id`; `:980-986` (PUT) inserts/updates the same. `branch_financial_details` actually has `bank_account_name`, `bank_account_number`, `swift` (no `tax_id`). Routes: `org-portal.routes.ts:115-116` (`org.settings.edit`). | Live metadata (15 columns); baseline line 936; correct implementation exists at `branch-financial.repository.ts:31-46` using the real columns. No test covers GET/PUT against the real schema (`org-payment-settings.spec.ts` mocks `pool.query` and asserts SQL text only). | **Confirmed defect (High, reachable)** | GET/PUT `/org/:orgId/payment-settings` fail with `ER_BAD_FIELD_ERROR`; organisations cannot read/save payout settings. Code-only fix (align to real columns or call the existing repository) — **not applied** (P4-09 is read-only verification). |
| **S-03** | **Mobile push-token register/list use non-existent `device_id`.** `mobile.controller.ts:16-19` inserts `device_id` (also in `ON DUPLICATE KEY UPDATE`), and `:70` selects it; `push_tokens` has 12 columns and no `device_id`. Routes: `mobile.routes.ts:9-11`. | Live metadata; migration `073_mobile_platform.sql:2-20`; baseline line 4677. No test. | **Confirmed defect (High, reachable)** | `POST /mobile/push/register` and `GET /mobile/push/tokens` fail; mobile push registration is unusable. Code-only fix (drop `device_id` or store the fingerprint in an existing column). |
| **S-04** | **Resource maintenance CRUD is written against a different table shape.** `resource.repository.ts:174` orders by `start_date`; `:182` inserts `title, description, start_date, end_date, start_time, end_time, reason, status`; `:193-204` updates the same. Actual `resource_maintenance` has `reason, date_from, date_to, is_active, created_by, created_at`. Routes: `organisation.routes.ts:117-120`. | Live metadata (8 columns); baseline line 4776; no migration adds the expected columns; no test. | **Confirmed defect (High, reachable)** | GET/POST/PUT maintenance all fail (read fails on `ORDER BY start_date`); the org resource-maintenance feature is unusable. Fix needs a small mapping decision (`title/description → reason`, `start_date/time → date_from`, `status → is_active`) — code-only but not mechanical. |
| **S-05** | **Dead HR repository method inserts non-existent columns.** `hr.repository.ts:21-24` `createDepartment` inserts `name, description, head_user_id`; the table has `organisation_id NOT NULL`, `head_employee_id`, and no `description`. | Live metadata; baseline line 1839; no migration adds them. **No caller**: `createDepartmentHandler` (`hr.controller.ts:60-70`) writes the correct SQL itself. | **Confirmed defect (Low, dead code)** | No runtime impact today; delete or align the method before it is wired up. |
| **S-06** | **Dead command references a non-existent table.** `activities/commands/update-activity-status.command.ts:41-45` reads/updates `activities`; no `CREATE/DROP TABLE activities` exists in the baseline, any migration, the archive, or git history, and it is not in the live DB. | Repository-wide search; only reference is `transaction-conn.integration.spec.ts` (imports the handler). | **Confirmed defect (Low, dead code / test-only reference)** | No runtime impact; the integration test exercises SQL that cannot run against this schema. Delete or implement the table in a future authorized migration. |
| **S-07** | **Six migration-created tables are intentionally absent** from baseline/live because later migrations drop them: `notification_alerts` (138), `settlement_batches` (139), `tournament_match_players` (138), `referee_assignments` (138), `organisation_coaches` (091), `org_coach_agreements` (091). | `DROP TABLE` lines in 091/138/139; live lists 0 of them; baseline excludes them. | **Legitimate migration-backed change (deprecated)** | None; confirms the baseline correctly omits retired tables. |
| **S-08** | **`payment_allocations` is legitimate but missing from the baseline.** Created by `178_payment_allocations.sql`; live has it with `uk_pa_payment_booking`; code uses it (recurring allocation refunds). | Migration 178:24; live metadata; referenced by `paymentAllocationRepository`. | **Legitimate migration-backed change** — baseline omission is part of **S-01**. | Include it when the baseline is regenerated. |
| **S-09** | **Migration-file drift after application.** 179 of 210 applied files' recorded hash ≠ the on-disk SHA-256 (both full-64 and 12-char conventions present); 201/211 applied files have a git commit timestamp **after** their `applied_at`. The runner only warns and never re-runs. Additionally `migration_history` records **`103b_coa_cleanup.sql`**, which exists nowhere in the repo, archive or git history. | `migration_history` rows vs `sha256` of each file; `git log -1 --format=%cI` per file; file search + `git log --all`. | **Legacy/process finding — unresolved evidence gap** | The live schema is verified against baseline+migrations+code (S-01/S-02…), so this is not a proven schema divergence, but the DB cannot be *proven* byte-identical to the repo chain. Requires a controlled rebuild/convergence run (Phase 9) and recovery of `103b`; no writes permitted here. |
| **S-10** | **Duplicate numeric migration prefixes** — `002` ×3, `017` ×4, `018` ×3, `019` ×2, `020` ×2. | Filenames; `migration_history` shows each applied exactly once in lexical order. No conflicting `CREATE/ALTER` on the same object was found between same-prefix files. | **Legacy naming (additive, applied)** | Ordering is lexical and deterministic today; a future consolidation should renumber. No action required now. |
| **S-11** | **No runtime DDL and no invented reachable tables.** 0 `CREATE/ALTER/DROP TABLE` statements in production `backend/src`; all 349 distinct SQL table references resolve to baseline ∪ migrations ∪ live, except the dead `activities` reference (S-06). | Static scan of 735 files; 27 raw residual tokens were reviewed and are prose/aliases/`ON DUPLICATE KEY UPDATE` artefacts (e.g. “from customers”, “from CourtZon”, `account_holder_name` after `UPDATE`). | **Verified (no defect)** | Table-level schema usage is supported. |
| **S-12** | **No orphan tables from recent work.** Only 1 of the 37 tables created by migrations ≥149 appeared unreferenced by static SQL (`tournament_age_categories`); it is referenced dynamically by the eligibility service, present in baseline (line 6250) and seeded. | Migration/file scan + reference scan. | **Verified (no defect)** | None. |
| **S-13** | **Migration guard policy** — 47 files carry `COURTZON_MIGRATION_ENV: PRODUCTION_SAFE`, **0** carry `LOCAL_DOCKER_ONLY`, 163 are unmarked (defaults to production-safe per the guard). | Counts over all 210 files; `migration-guard.sh` policy. | **Verified (legitimate)** | Chain is fully production-safe; no environment-gated schema left pending. |

**Classification totals:** confirmed defects **6** (S-01 Critical; S-02/S-03/S-04 High; S-05/S-06 Low-dead) ·
legitimate migration-backed **2** (S-07, S-08) · legacy/deprecated **1** (S-10) · legacy/process evidence gap
**1** (S-09) · verified/no-defect **3** (S-11, S-12, S-13).

### 5L.4 B35 stale-mapping provenance (investigation only — no cleanup)

- Live rows (`accounting_event_mapping_lines`, `organisation_id IS NULL`):
  `booking_card_payment.org_payable → 2200` (account id 8), `booking_wallet_payment.org_payable → 2200`,
  `booking_cod_payment.receivable_from_org → 1160` (id 6), `booking_cod_reversal.receivable_from_org → 1160`,
  all `is_active = 1`; `created_at` **2026-08-12T20:19:32Z** for the `org_payable`/`receivable_from_org` rows
  (the older concepts were created at 13:20:20Z the same day).
- **Provenance:** introduced by `database/migrations/113_financial_custody_audit.sql:25` (custody model change:
  org share → `org_payable` 2200; COD → `receivable_from_org` 1160) and re-asserted by
  `117_accounting_mapping_reconciliation.sql:49`; `database/seeds/005_accounting_defaults.sql:189-230`
  re-inserts the same rows idempotently (`NOT EXISTS` guards). Git: 113 committed 2026-08-13, seed last updated
  2026-09-12 (the seed already documents “NOT org_payable (2200)” for the newer payout model).
- **Why they are harmless:** the custody model moved to `merchant_payable` 2202 / `marketplace_receivable` 1161
  (resolved by `CONCEPT_ACCOUNT_CODE_DEFAULTS`), and `buildLedgerLines` only materialises the concepts the event
  actually supplies — the stale rows are never requested. Verified by the P4-07 mapping integration suite
  (13 payment/refund pairs resolve to 2202/1161, read-only).
- **Classification:** legacy/deprecated seed+migration rows (not invented). **No cleanup performed** (requires a
  seed/migration change — B35-4). Follow-up: a future seed cleanup plus a regression assertion that
  `booking_card_payment` resolves `merchant_payable` (already covered) and that legacy concepts are inactive.

### 5L.5 Validation executed

| Command / check | Result |
|---|---|
| Read-only `information_schema` diff (baseline vs live) | 328 baseline tables / 330 live; **0** baseline tables or columns missing from live; **45** live columns + `payment_allocations` absent from baseline |
| Static migration/baseline/AST audit (210 files, 8 seeds, 735 TS files) | 209 `CREATE TABLE` statements (198 distinct), 314 column adds, 6 dropped tables, 0 runtime DDL, 0 unknown reachable tables |
| `migration_history` vs files/git | 211 rows, 0 duplicates/pending, 1 missing file (`103b`), 179/210 hash mismatches, 201/211 modified after apply |
| `npx vitest run src/infrastructure/migrations src/modules/financial/__tests__/f23-baseline-integrity.spec.ts src/modules/financial/__tests__/f24-control-account-direction.spec.ts src/modules/financial/__tests__/g8-accounting-mapping.spec.ts src/modules/financial/__tests__/gl-period-lock.spec.ts` | **68 / 68 PASS** (6 files) |
| `npx vitest run --config vitest.integration.config.ts src/modules/financial/__tests__/accounting-mapping-integrity.integration.spec.ts` | **31 / 31 PASS** (read-only against the live DB) |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npm run lint:gate` | PASS — 711 files / 3,377 findings |

**Not run / not verifiable here:** the container-based `baseline-convergence.integration.spec.ts` and
`migration-guard.integration.spec.ts` (Testcontainers/Docker `exec`, no containers permitted) — the former would
actually *fail* today for the same reason as S-01 if executed; no fresh-DB baseline import (no DB writes);
production/Hostinger schema was not inspected; `103b_coa_cleanup.sql` content is unrecoverable from the repo.
**The baseline is therefore not fully verified as a fresh-deploy artefact** — only its delta against the live
chain-applied schema and the code is proven.

### 5L.6 Related deployment observation (not a schema-reference defect)

`backend/docker-entrypoint.sh:48-54` imports only `database/seeds/001_baseline.sql` on an empty database; the
accounting seeds `004_chart_of_accounts`, `005_accounting_defaults`, `006_account_templates` are **not** applied
(and the entrypoint marks failed migrations as applied despite warnings, lines 118-130). This is a
reference-data/deploy-path gap consistent with AGENTS’ known “empty accounting screens” incident; recorded here
for the Phase 9 deployment audit, **not** changed.

## 5M. P4-10 — Phase 4 evidence package and traceability matrix (2026-10-27)

### 5M.1 Method and sources (documentation-only)

- **Sources reconciled:** §5D (P4-01 inventory), §5E–§5I (P4-02…P4-06), §5J (P4-07 accounting),
  §5K (P4-08 coverage), §5L (P4-09 schema), the Phase 4 checklist (§6), the evidence log (§13), the risk
  register (§14), the audit trail (§15) and the per-task compliance records (§17D–§17K).
- **Cross-checks applied:** every recorded test count was matched against its §13/§17 record; every defect and
  risk ID was traced to a fix/test or an explicit open status; the 100-item denominator and phase subtotals
  were recomputed; no result was inferred where the record states “not run”.
- **No production/test/schema change**, no DB writes, no Docker/Git operation. One supplementary **read-only
  test re-run** was made solely to reconcile a numeric inconsistency (§5M.4 D-1); it did not modify any file.
- **Totals derived from the record (not new measurements):** 9 audit tasks (P4-01…P4-09) + this package;
  **15 production defects fixed** (P4-02 ×2, P4-03 ×1, P4-04 ×3, P4-05 ×7, P4-06 ×1, P4-07 ×1);
  **161 new focused backend tests recorded** across P4-02…P4-08 (21 + 16 + 12 + 21 + 6 + 62 + 23 — sum of
  per-task suite counts, not independently deduplicated); **6 confirmed but unfixed code/schema defects**
  from P4-09 (S-01…S-06 → **B36/B37**); **0 production changes in P4-08/P4-09/P4-10**.

### 5M.2 Phase 4 evidence summary (P4-01 → P4-10)

| Task | Area | Key evidence | Defects / risks | Recorded verification | Status |
|---|---|---|---|---|---|
| **P4-01** | Business-rule/test inventory | 45 rules / 8 areas; baseline **308** unit spec files / **3,740** tests / **163** integration files; B24 route/page/nav table; ranked gaps | Seeds B24 (core), B25, B26, B27, B5; no code change | Inspection only; no tests executed for correctness | **DONE** |
| **P4-02** | Auth/session/RBAC/tenant isolation | 26 role slugs read-only; 5 page gates aligned; 21 new tests (community 15, order access 4, logout 2); focused **364/364** (35 files); frontend **1414/1414** | Fixed: marketplace order **IDOR**, logout-all-devices no-op; **B24** core fixed (nav residual); **B25 closed**; **B28** documented | tsc 0; `lint:gate` PASS; DB SELECT-only | **DONE** |
| **P4-03** | Booking concurrency/locks/transactions | Lock tokens → per-acquisition UUID at 4 sites; `redis-lock` **13/13**, wiring **3/3**, real concurrency **16/16**; booking+scheduling unit **336/336** (25 files) | Fixed: stale lock release; **B29 resolved**; **B30** design limits | tsc 0; `lint:gate` PASS; SHA-256 mutation restore | **DONE** |
| **P4-04** | Marketplace inventory/oversell | Conditional decrement proven under real concurrency; `checkout-inventory-integrity` **9/9**, stock concurrency **3/3**, marketplace **218/218** (21 files) | Fixed: 3 restoration defects; **B26 closed**; **B31** limitations | tsc 0; `lint:gate` PASS; 3 mutation proofs | **DONE** |
| **P4-05** | Subscriptions/notifications/jobs | 21 tests (failover 6, DLQ 5, replay 7, digest 3); notifications **222/222** (28 files); subscriptions **126/129** | Fixed: 7 notification defects; **B27 closed**; **B32**; **B8** pre-existing | tsc 0; `lint:gate` PASS; 6 mutation proofs; external providers **not** tested | **DONE** |
| **P4-06** | EventBus/Socket.IO/idempotency | ALS-scoped after-commit hooks; `database.transaction` **6/6**; pre-fix **2 failed/4 passed**; focused **284/284** (22 files) | Fixed: global hook queue (phantom/never-flushed events); **B33** limits | tsc 0; `lint:gate` PASS; SHA-256 restore | **DONE** |
| **P4-07** | Accounting integrity | Chain traced; 13 payment/refund inversions at concept + DB-code level; `uk_dedup` UNIQUE verified; tests **25 + 6 + 31**; focused **404/404** (42 files); refund integration **27/27** | Fixed: **B34** recovery-counter drift; **B35** residuals (characterized) | tsc 0; `lint:gate` PASS; DB reads only | **DONE** |
| **P4-08** | Business-rule coverage (normal/failure/concurrency/boundary) | 34-rule gap matrix; **23 new tests** (period lock 9, refund boundaries 9, B35 characterization 5); financial+booking **729/729** (65 files) | **0 defects**; B35 items characterized; B5/B8/B28 routed | tsc 0; `lint:gate` PASS | **DONE** |
| **P4-09** | Schema integrity (baseline/migrations/live) | Baseline 328 tables, 210 migrations, live 330; 45 columns + `payment_allocations` absent from baseline; 0 invented reachable tables; **S-01…S-13** | **6 confirmed defects: S-01 (Critical), S-02/03/04 (High), S-05/06 (Low/dead)** → **B36/B37**; B35 provenance explained | Focused **68/68**; mapping integration **31/31**; tsc 0; `lint:gate` PASS; no writes | **DONE** |
| **P4-10** | Evidence package & reconciliation | This section; 14-row traceability matrix; D-1/D-2 corrections; risk preservation | **0 new defects**; documentation inconsistencies found and reconciled (D-1/D-2) | Doc-invariant script + one read-only re-run (**336/336**, 25 files) | **DONE** |

### 5M.3 Traceability matrix (Phase 4 findings → evidence → status → follow-up)

| # | Task / area | Defect or risk | Evidence (section + tests) | Status | Follow-up |
|---:|---|---|---|---|---|
| 1 | P4-01 inventory | B24 permission-key drift (later fixed in P4-02) | §5D inventory + B24 table; §5E.4 read-only grants | Tested/fixed (core) | Nav residual tracked under B24 (P7/P8) |
| 2 | P4-01 inventory | B25 messaging REST authz **0 tests** | §5D ranked gaps; closed in P4-02 with 15 tests | **Closed** | — |
| 3 | P4-01 inventory | B26 seller-subscription rejection untested | §5D; closed in P4-04 with 5 tests | **Closed** | — |
| 4 | P4-01 inventory | B27 notification failover/DLQ **0 refs** | §5D; closed in P4-05 with 21 tests | **Closed** | — |
| 5 | P4-01 inventory | B5 webhook HMAC negatives missing | §5D (§5K row 15) | Documented | **P5-02** |
| 6 | P4-02 auth/tenant | Marketplace order IDOR (`getOrderForUser`) | §5E.5; `order-access-isolation.spec.ts` 4/4 (red 2 → green) | **Fixed + tested** | Regression guard stays in focused auth suite |
| 7 | P4-02 auth/tenant | Logout-all-devices no-op | §5E.5; `logout-all-devices.spec.ts` 2/2 (red 1 → green) | **Fixed + tested** | — |
| 8 | P4-02 auth/tenant | B28 proxy-contract spec scans frontend test fixtures | §5E.8; 2 failing assertions recorded | Documented (pre-existing) | **P7-02/P7-09** |
| 9 | P4-03 booking | Non-unique lock owner token (stale release deletes newer lock) | §5F; `redis-lock` 13, `lock-owner-wiring` 3; mutation 1/3 | **Fixed + tested** | — |
| 10 | P4-03 booking | B29 (lock tests/ownership) | §5F; resolved by #9 | **Resolved** | — |
| 11 | P4-03 booking | B30 prepare pre-check outside tx / no renewal / recurring deadlock window | §5F.7; design limits | Documented | P8/P9 hardening |
| 12 | P4-04 marketplace | Double stock restore on card failure | §5G.2; `checkout-inventory-integrity` (mutation 1 failed/8 passed) | **Fixed + tested** | — |
| 13 | P4-04 marketplace | Over-restore of non-decremented items | §5G.2; same suite | **Fixed + tested** | — |
| 14 | P4-04 marketplace | Duplicate `payment:failed` restore | §5G.2; same suite | **Fixed + tested** | — |
| 15 | P4-04 marketplace | B31 atomicity / concurrent-restore limits | §5G.3, §5G.5 | Documented | Phase 5/9 hardening (schema/claim) |
| 16 | P4-05 notifications | B27 seven delivery defects (success:false, DLQ, attempts, replay, resend, prefs, digest) | §5H.3; 21 tests; 6 mutation proofs | **Closed/fixed** | — |
| 17 | P4-05 notifications | B32 digest duplication, unregistered retry job, failover semantics, non-atomic guard | §5H.6 | Documented | Phase 7/9 (needs schema/window claim) |
| 18 | P4-05 subscriptions | B8 three date-expired fixtures | §5H.5; 126/129 | Documented (pre-existing) | **P7-02** |
| 19 | P4-06 events | Global after-commit hook queue (cross-tx phantom events; outside-tx never flushed) | §5I.3; `database.transaction` 6/6; pre-fix 2 failed/4 passed | **Fixed + tested** | — |
| 20 | P4-06 events | B33 unawaited emits, no event DLQ, at-least-once, cursor race, no socket replay | §5I.7 | Documented | P8-09 / Phase 9 |
| 21 | P4-07 accounting | B34 recovery counters advanced on skipped posting | §5J.5; `accounting-posting-idempotency` 6/6; mutation 1 failed/5 passed | **Fixed (B34 closed)** | — |
| 22 | P4-07 accounting | B35-1 posting identity lacks occurrence ordinal | §5J.8; P4-08 characterization test | Characterized | Phase 5/9 (schema-level) |
| 23 | P4-07 accounting | B35-2 outer-conn recovery projection ignores posting result | §5J.8; P4-08 characterization test | Characterized | Phase 5/9 with B35-1 |
| 24 | P4-07 accounting | B35-3 handler failure not re-driven | §5J.8; P4-08 failure/re-delivery tests | Characterized | Phase 9 (durable retry) |
| 25 | P4-07 accounting | B35-4 stale mapping rows (`org_payable` 2200 / `receivable_from_org` 1160) | §5L.4 provenance (113/117 + seed 005); ignored by `buildLedgerLines` | Documented (legacy, harmless) | Authorized seed/migration cleanup |
| 26 | P4-08 coverage | 5 gaps closed (period lock, refund boundaries, B35 characterization) | §5K.3; 23 tests; **729/729**, **478/478** | **Tested/characterized** | — |
| 27 | P4-08 coverage | B5/B8/B28 routed; B31/B32/B35 limitations | §5K.2 matrix | Documented | P5-02 / P7-02 / P7-09 |
| 28 | P4-09 schema | **B36 / S-01 — stale baseline + entrypoint stamps chain on fresh DB** | §5L.3; baseline 328 vs live 330; 45 columns + `payment_allocations`; entrypoint 48–79 | **Confirmed defect — Critical, OPEN** | Authorized baseline regeneration + entrypoint/CI convergence fix (**Phase 9**), before any rebuild/DR test |
| 29 | P4-09 schema | **B37 / S-02 — org payment-settings columns** | §5L.3; `org-portal.controller.ts:962,980-986` vs `branch_financial_details` | **Confirmed defect — High, OPEN** | Dedicated authorized code-fix task (code-only) |
| 30 | P4-09 schema | **B37 / S-03 — mobile push `device_id`** | §5L.3; `mobile.controller.ts:16-19,70` | **Confirmed defect — High, OPEN** | Same code-fix task |
| 31 | P4-09 schema | **B37 / S-04 — resource-maintenance shape** | §5L.3; `resource.repository.ts:174,182,193-204` | **Confirmed defect — High, OPEN** | Same task (needs column-mapping decision) |
| 32 | P4-09 schema | S-05/S-06 dead code (`hr.repository.createDepartment`, `activities` command) | §5L.3 | **Confirmed — Low/dead, OPEN** | Delete/align in the code-fix task |
| 33 | P4-09 schema | S-07/S-08/S-10…S-13 | §5L.3 | Legitimate/deprecated/verified | Baseline regeneration should preserve S-07 exclusions and add S-08 |
| 34 | P4-09 schema | S-09 migration hash drift, 201/211 edited after apply, `103b` missing | §5L.3, §5L.5 | **Unresolved evidence gap** | Phase 9 controlled rebuild/convergence; recover `103b` |
| 35 | P4-10 package | D-1 count inconsistency (333 vs 336) | §5M.4; re-run **336/336** (25 files) | **Reconciled/corrected** | None |
| 36 | P4-10 package | D-2 audit-trail rows missing for P4-04/P4-05 | §5M.4; backfilled from §17F/§17G | **Reconciled/backfilled** | None |

### 5M.4 Reconciliation findings (no silent corrections)

- **D-1 — numeric inconsistency (resolved and recorded).** The §6 P4-03 row recorded booking+scheduling unit
  **333/333**, while §13, §15 and §17E recorded **336/336 (25 files)**. P4-10 re-ran exactly
  `npx vitest run src/modules/booking src/modules/scheduling` on the current tree → **336/336 (25 files)**.
  The §6 value is corrected to 336/336 and marked “see §5M.4 D-1”. **Limitation:** a current re-run cannot
  prove which number the original P4-03 session observed; the contemporaneous §17E record (336/336) is treated
  as authoritative, and the discrepancy is disclosed rather than hidden.
- **D-2 — missing audit-trail rows (backfilled).** §15 contained P4-06, P4-07, P4-08 and P4-09 rows but not
  P4-04/P4-05, although §6, §13, §17F and §17G contain their evidence. P4-10 added the two missing rows using
  only the existing §17F/§17G text (no new results). This is a documentation repair, not a re-classification.
- **D-3 — no other numeric/status contradictions found** among the Phase 4 suite counts (21, 16, 12, 21, 6,
  62, 23 new tests; 364, 336, 404, 729, 478, 68 focused runs), the defect counts (2, 1, 3, 7, 1, 1) or the risk
  statuses (B24 residual; B25/B26/B27/B29/B34 closed/resolved; B28/B30–B33/B35–B37 open). The check covered
  §5D–§5L, §6, §13, §14, §15 and §17D–§17K.
- **D-4 — evidence that cannot be reconciled by documentation alone:** S-09 (hash drift/`103b`), container
  suites, Sandbox/providers, the fresh-DB baseline import and the production schema. These remain explicitly
  unverified (see §5M.7), not “passed”.

### 5M.5 Risk register preservation (no status changes in P4-10)

- **Closed/resolved before P4-10 (unchanged):** B25, B26, B27, B29, B34; B24 core fixed with nav residual;
  B9 Stage A; B10/B11/B12; B2/B3 resolved.
- **Open and preserved:** **B5** (HMAC negatives → P5-02), **B7/P5-04** (Sandbox approval), **B8** (date
  fixtures → P7-02), **B13/B14/AR-2** (dependency/Docker deferrals), **B19–B22** (type/lint coverage),
  **B23** (residual evidence gaps), **B28** (proxy-contract scan), **B30** (booking design limits),
  **B31** (inventory atomicity), **B32** (notification residue), **B33** (event-bus limits), **B35**
  (accounting identity/replay), **B36** (baseline/convergence — **Critical**), **B37** (endpoint schema
  mismatches — **High**), plus **B4/B6/B15–B18/AR-1** as recorded in §14.
- P4-10 **adds no risk and closes none**. B36/B37 are explicitly carried into the next phases; they are not
  “resolved by documentation”.

### 5M.6 Package validation

| Check | Result |
|---|---|
| 100-item denominator and subtotal arithmetic | Phases 1–4 = 10+10+10+10, Phase 6 = 2, Phases 7/8 = 1+1 → **44/100 (44 %)**; Phase 4 **10/10 (100 %)** |
| Phase 4 checklist rows P4-01…P4-10 | **10 DONE**, no `TODO`/`IN_PROGRESS` remaining |
| Traceability matrix rows | **36 rows** covering every Phase 4 defect/risk and D-1/D-2 |
| Risk IDs preserved | B5, B7, B8, B13, B14, B19–B22, B28, B30–B37, AR-1/AR-2 all present in §14/§5M.5 |
| Test-count reconciliation | §13/§17/§6 cross-checked; one mismatch (D-1) found, re-measured and disclosed |
| Audit-trail completeness | P4-04/P4-05 rows restored (D-2); P4-10 row added |
| Files changed in P4-10 | `docs/release/COURTZON_RELEASE_PROGRESS.md` only |
| DB/Docker/Git operations | **None** (no SQL, no containers, no commits/pushes) |

### 5M.7 Unresolved limitations carried forward

1. **B36:** the baseline is not a complete fresh-deploy artefact and the entrypoint stamps the chain; a fresh
   DB was **not** created or tested (write-free task). Baseline completeness is proven only as a delta against
   the migrated reference DB, not by a fresh import.
2. **B37:** the three endpoint mismatches are proven from code + authoritative schema metadata but were **not**
   executed against a live server/DB in this task.
3. **S-09:** migration-history hash drift and the missing `103b_coa_cleanup.sql` cannot be resolved by
   documentation; a controlled rebuild/convergence run (Phase 9) is required.
4. **External integrations:** 32 Testcontainers suites, Paymob Sandbox, live email/SMS/push/webhook providers
   and production schema remain unverified (B5/B7/B8/B28/B33).
5. **Test totals** are the sum of per-task recorded suites, not an independently deduplicated inventory;
   P4-01’s historical baseline (308 spec files / 3,740 tests) reflects the tree at that time.

### 5M.8 Phase 4 acceptance decision

- **Plan criterion:** “critical workflows have documented rules and tests for normal, failure, concurrency, and
  boundary scenarios.”
- **Evidence:** §5D documents 45 rules; every audited area has executable normal/failure coverage; concurrency
  is proven by real MySQL/Redis runs for booking and marketplace and by DB constraints for accounting; boundary
  cases were added in P4-08; §5K classifies every remaining gap and §5M.3 traces it.
- **Decision: Phase 4 checklist is 10/10 and the audit acceptance criterion is MET for the audited workflows.**
  This is **not** a release-readiness claim: **B36 (Critical)** and **B37 (High)** are open release-blocking
  follow-ups, and the external/Sandbox and fresh-deploy evidence remains unverified as listed in §5M.7.
  Phase 5 is **not started** by this task.

## 6. Checklist — Phase 4 (10/10)

| ID | Task | Status | Evidence / notes |
|---|---|---|---|
| P4-01 | Collect/reconcile existing audits & tests | **DONE** | Evidence-based inventory in **§5D**: **45 business rules** across 8 areas mapped to source + tests + gaps; test baseline re-measured (**308** unit spec files / **3,740** test entries; **163** integration spec files), per-module distribution, **B24** route/page/nav permission mapping table, ranked coverage gaps, and verified status of B5/B7/B13/B14/AR-2/B19–B24. Key findings: messaging **REST** authorization has **0** tests (socket rooms are covered), webhook HMAC negative path is still untested (B5), seller-subscription checkout rejection has no negative test, notification failover/DLQ has **0** test references, brute-force lockout has **0** tests. No production/test/DB change; no test modified. |
| P4-02 | Auth/session/RBAC/tenant audit | **DONE** | **§5E**: audited auth/session/token lifecycle, RBAC resolution (777 `requirePermission` sites), guards/org scoping, and tenant isolation for booking/accounting/settlement/marketplace/messaging. **B24 resolved with authoritative read-only DB grants** (Docker `courtzon_v3`: 26 role slugs): route/page/nav mismatches confirmed and the **blank-page class fixed** by aligning 5 page gates to the canonical route keys (no permission granted; no role loses access). **2 confirmed defects fixed with red→green tests:** marketplace order **IDOR** (`getOrderForUser` unfiltered fallback exposed any order to any `marketplace.order.view` holder) and **"logout all devices" no-op** (public route never set `userId`). Added **21 tests** (community REST authz 15, marketplace order access 4, logout all-devices 2) + 5 updated frontend grant tests. Evidence: DB SELECT-only audit, focused backend **364/364** (35 files), backend `tsc --noEmit` 0, frontend `tsc -b --force` 0, `lint:gate` PASS (711/3,377), full frontend **1414/1414**. Pre-existing unrelated failure found: `proxy-contract.spec.ts` scans frontend **test** files (B28). |
| P4-03 | Booking rules/concurrency audit | **DONE** | **§5F**: traced create (card/cash), prepare→confirm, recurring, tournament reservation and scheduling flows through Redis locks, DB transaction, commit/rollback and release. **Lock primitive had 0 tests** — added `redis-lock.spec.ts` (**13**): key isolation, 15s/10min TTLs, compare-and-delete ownership, partial-acquisition rollback, budget exhaustion, prepare refresh. **Confirmed defect fixed:** lock owners were per-user (`user:<id>`), so a stale release after TTL expiry could delete a newer same-user acquisition's lock — replaced with a per-acquisition UUID token (`createLockOwner`) at 4 call sites (booking create/prepare, tournament reservation, coach scheduling). Real concurrency evidence: `booking.concurrency.service.integration.spec.ts` + repository spec **16/16** against the running MySQL/Redis (identical, partial-overlap, adjacent, duplicate-normalisation, terminal-rebooking), plus booking+scheduling unit **336/336** (see §5M.4 D-1 for the corrected record), backend `tsc --noEmit` **0**, frontend `lint:gate` PASS. DB authoritative guard verified: `resources` row `FOR UPDATE` + overlap count; status-blind unique slot keys were intentionally dropped (migration 140, confirmed by `SHOW INDEX`). Documented residual limitations (prepare pre-check outside a transaction, 15s TTL vs post-commit charge, recurring multi-resource deadlock window, no renewal) — **B29/B30**. |
| P4-04 | Marketplace inventory/oversell audit | **DONE** | **§5G**: traced checkout → per-seller orders → conditional stock decrement → payment → fulfil/cancel/refund/abandoned-cleanup. Conditional `UPDATE … WHERE quantity >= ?` prevents overselling (real concurrent evidence: 10 overlapping decrements against qty 5 → exactly 5 succeed, stock 0; qty 3 with decrements of 2 → 1 succeeds). **3 confirmed inventory-restoration defects fixed** with red→green proofs: (1) card failure restored stock **twice** (inner branch + outer catch) and left orders pending → now one restore + orders cancelled; (2) a part-way decrement failure restored items that were never decremented → now restores only decremented items in reverse; (3) a repeated `payment:failed` event could restore twice → terminal guard + early return. **B26 closed**: 5 subscription-enforcement tests (no plan / expired / suspended / cancelled rejected; active seller proceeds). Tests: new `checkout-inventory-integrity.spec.ts` **9/9**, new `marketplace-stock-concurrency.integration.spec.ts` **3/3** (real MySQL concurrency), marketplace suite **218/218** (21 files), backend `tsc --noEmit` **0**, `lint:gate` PASS. Residual crash-window/atomicity limits recorded as **B31**. |
| P4-05 | Subscriptions/notifications/reports/jobs audit | **DONE** | **§5H**: traced the org-subscription lifecycle (request → approve/reject/reopen → activation → chained renewal → expiry → reminders; transactional + `FOR UPDATE`, one effective subscription, single scheduled renewal, `pending` promoted only when `start_date <= CURDATE()`; tests 126/129 with 3 **pre-existing date-expired fixtures** — B8). **B27 closed with 7 confirmed notification defects fixed** (red→green, 6 mutation proofs): provider `success:false` treated as success; DLQ only on the success path (never on failure); attempts never incremented on failure; replay created a delivery but **never enqueued** it and deleted the DLQ row; retried jobs could re-send a delivered notification; malformed preference JSON crashed dispatch; digest payload used legacy fields (`notificationCount`/`frequency`) so the worker rendered an undefined count/category. New tests: failover **6**, DLQ **5**, replay **7**, digest **3** (21); notifications suite **222/222** (28 files); `tsc` **0**; `lint:gate` PASS. Residual digest-duplication and job-registration gaps recorded as **B32**. |
| P4-06 | EventBus/Socket.IO/idempotency/races | **DONE** | **§5I**: traced `emit → published_events (same conn) → after-commit enqueue → subscriber worker (processed_events unique) → Socket.IO rooms → frontend cache/reconnect reconcile`, plus the outbox poller recovery path. **Confirmed defect fixed:** after-commit hooks lived in a module-global array, so an overlapping transaction's commit could flush (and publish) another transaction's buffered events — including a transaction that later rolled back; events emitted **outside** a transaction were buffered and never flushed. Hooks are now ALS-scoped per transaction and run immediately when no transaction exists. New `database.transaction.spec.ts` **6/6**; pre-fix swap of the old file → **2 failed / 4 passed**; restored byte-exactly. Focused `src/shared` + realtime + tx suite **284/284** (22 files), backend `tsc` **0**, `lint:gate` PASS. Durable guarantees vs limits documented (**B33**: unawaited emits 255/366, no event dead-letter store, at-least-once duplicate window, cursor-init race, no socket replay). |
| P4-07 | Accounting consistency audit | **DONE** | **§5J**: traced the full posting chain `domain write → eventBusV2.emit (published_events on the same conn) → after-commit subscriber → accounting listener → postAccountingEvent (hasPosting → resolveMapping → validateAccounts → buildLedgerLines → validateBalance → ledger_entries/uk_dedup → general_ledger projection → commit → accounting:entry-recorded)` for bookings (card/wallet/COD/series), marketplace (card/wallet/cash), academy, membership, tournament, gateway clearing/settlement, merchant payouts and historical corrections. **Verified:** debits = credits on every shape; refunds are exact chart-account inversions (13 pairs proven at concept level and again on DB-resolved codes); no invented accounts (every account active in `chart_of_accounts`); zero/negative/unknown/missing-mapping legs rejected; org attribution preserved (merge only same side+account+org); `ledger_entries.uk_dedup` is a **UNIQUE** key `(source_type, source_id, event_type, chart_account_id, side)`; `hasPosting` is only an application pre-check. **Confirmed defect fixed (B34):** the booking-refund recovery counters (`coach_recovered_amount`/`org_recovered_amount`) advanced even when `postAccountingEvent` skipped the posting, so the duplicate `payment:refunded` + `booking:refunded` delivery consumed recovery capacity without a journal entry — `postAccountingEvent` now returns `boolean` and both updates are gated on it (mutation proof **1 failed / 5 passed**, 4 vs 2 updates, SHA-256 restore). New tests: `accounting-ledger-invariants.spec.ts` **25/25**, `accounting-posting-idempotency.spec.ts` **6/6**, `accounting-mapping-integrity.integration.spec.ts` **31/31** (read-only against running MySQL). Focused financial+accounting+settlement **404/404** (42 files), booking refund/recovery integration **27/27**, backend `tsc` **0**, `lint:gate` PASS. Residuals documented as **B35**. |
| P4-08 | Document rules + add tests | **DONE** | **§5K**: re-walked the 45-rule inventory against current tests and produced a **34-rule gap matrix** across booking, marketplace, payments/refunds, subscriptions, notifications, settlements and accounting, each row classified (`N` normal / `F` failure / `C` concurrency-boundary / `X` external / `L` limitation). **23 new tests in 4 files, 0 production changes:** period-lock/scope boundaries (9), booking refund arithmetic boundaries (9), B35 posting-identity + handler-failure characterization (3), B35 recovery-offset projection characterization (2). No confirmed production defect was found in this task; every remaining gap is an already-documented limitation (**B31/B32/B35**), an external dependency (**B7/P5-04**, Testcontainers), or plan-routed later (**B5**→P5-02, **B8**→P7-02, **B28**→P7-02/P7-09). Results: new files **18/18**, extended files **9/9** + **9/9**, financial+accounting+settlement+booking **729/729** (65 files), marketplace+payment+notifications **478/478** (56 files), backend `tsc` **0**, `lint:gate` PASS (711/3,377). |
| P4-09 | Confirm no invented schema | **DONE** | **§5L**: read-only audit of the baseline (328 tables), **210** migrations (209 `CREATE TABLE`, 314 column adds, 6 later-dropped tables), 8 seeds, the deploy entrypoint and the live `courtzon_v3` metadata (330 tables, 3,674 columns, 1,334 indexes), plus SQL table/column extraction from **735** production TS files. **Verified:** 0 baseline tables/columns missing live, 0 runtime DDL, 0 unknown reachable table refs, 12 Phase-4 tables/columns/indexes all present (`uk_dedup`, recovery columns, `payment_allocations`, …), 6 dropped tables correctly absent, fully production-safe marker chain. **Confirmed defects:** **S-01 (Critical)** baseline lacks `payment_allocations` + **45** migration-added columns while the Docker entrypoint stamps the whole chain as applied on a fresh DB (fresh deploy/DR gap); **S-02/S-03/S-04 (High)** reachable endpoints use non-existent columns (`branch_financial_details`, `push_tokens`, `resource_maintenance` — org payment settings, mobile push, resource maintenance); **S-05/S-06 (Low, dead code)** HR `createDepartment` and an `activities` command reference unsupported columns/tables. **B35 provenance:** legacy rows from migrations 113/117 re-asserted by seed 005 (2200/1160), harmless because `buildLedgerLines` only materialises supplied concepts — no cleanup. **Unresolved:** migration-hash drift (179/210), 201/211 edited after apply, `103b_coa_cleanup.sql` recorded but absent from repo/archive/git, duplicate numeric prefixes. Validation: focused **68/68**, read-only mapping integration **31/31**, `tsc` 0, `lint:gate` PASS. **No writes, no production changes**; new risks **B36** (baseline/deploy) and **B37** (code↔schema endpoint mismatches). |
| P4-10 | Phase evidence package | **DONE** | **§5M**: consolidated P4-01…P4-09 into a **10-row evidence summary** (15 defects fixed, 161 recorded new tests, 6 unfixed P4-09 defects) and a **36-row traceability matrix** (task/area, defect/risk, evidence + test reference, status, follow-up), preserving every open risk (**B5, B7/P5-04, B8, B13/B14/AR-2, B19–B22, B28, B30–B37**). Reconciliation found and disclosed **D-1** (P4-03 count 333 vs 336; re-ran read-only → **336/336**, 25 files, §6 corrected with pointer) and **D-2** (§15 missing P4-04/P4-05 rows, backfilled from §17F/§17G); no other numeric/status contradictions. Explicitly records **B36 (Critical: stale baseline + fresh-DB stamping)** and **B37 (High: endpoint schema mismatches + dead code)** as open follow-ups. Documentation-only; doc-invariant checks PASS; no DB/Docker/Git operation. |

**Phase 4 acceptance:** **MET for the audit scope** — all 10 checklist items DONE; 45 rules documented, normal/
failure/concurrency/boundary coverage recorded and traceable in **§5M**; open release-blocking follow-ups
**B36** (Critical) and **B37** (High) are explicitly preserved and not claimed as fixed. This is not a
release-readiness claim.

## 7. Checklist - Phase 5 (9/10)

| ID | Task | Status | Evidence / notes |
|---|---|---|---|
| P5-01 | Payment lifecycle map + test matrix | **DONE** | **§5N**: mapped 12 payment flows (booking card/prepare/cash, recurring series, marketplace, org subscription, membership, academy, tournament, wallet top-up, refunds, settlement/reconciliation) with states, authoritative persistence, events, accounting and recovery. Recorded `payment_transactions` enum/indexes, the final-state/idempotency guards, and a **45-row Phase 5 matrix** (`EXISTS / EXTEND / MISSING / BLOCKED`). New findings: **B38** duplicate-charge window (gateway called before local row, `special_reference` includes `Date.now()`), **B39** webhook replay marked before processing, **B40** no partial-refund representation for single payments; **B5** HMAC tests absent; **B7/P5-04** Sandbox unverified; **B36** fresh-DB prerequisite preserved. Payment unit suite **38/38** (7 files, read-only). |
| P5-02 | HMAC positive/negative tests | **DONE** | **§5O**: 65 new unit tests (HMAC 55, service 3, controller 7) for Intention (20 fields) and Accept (23 fields, implementation-faithful), per-field mutations, invalid/empty/truncated/uppercase/whitespace signatures, null/undefined, missing/empty secret, unsigned-field tolerance, no secret logging; invalid signature → 401 with no repository read and no payment events. **Confirmed defect fixed (B41):** non-string signature threw `TypeError` in the mismatch logger; normalized to empty string in both branches (exact equality preserved). Results: 65/65; payment+gateway 103/103 (10 files); tsc 0; lint gate PASS. Timing-safe compare not changed (B5 residual). |
| P5-03 | Mock-gateway failure/timeout/retry/idempotency | **DONE** | **§5P**: 52 new unit tests (gateway failure/timeout/idempotency 11, webhook replay 4, route authorization 37). **B38 reproduced at unit level** (two concurrent same-key charges both reach the gateway before persistence; only the second local insert fails) — remains open, no fix. **B39 reproduced at unit level** (replay key persists after a processing failure, so the retry is dropped; Redis down skips dedupe) — remains open, no fix. Also covers explicit gateway failure/timeout, paid/pending idempotency short-circuits, duplicate local insert (`ER_DUP_ENTRY`), already-paid confirm, lost-update/final-state handlers; and 12 protected `/payments/*` routes × 401/403/200 with the real middleware (webhook public). Results: 52/52; payment+gateway 155/155 (13 files); tsc 0; lint gate PASS. |
| P5-04 | Confirm Paymob Sandbox safety | **DONE (limited, user-confirmed)** | **Evidence recorded (2026-10-28).** User explicitly approved recording confirmation of successful Paymob test on Hostinger as **limited, user-confirmed evidence** (not independently verified by repo inspection). Reported: dashboard in **Test mode**, Public/Secret labeled **Test**, Integration ID **5663993** present, API Key not labeled Test in screenshot, HMAC unavailable on displayed screen. **Local hardening (repo-evidenced):** host fixed to `https://accept.paymob.com` with allowlist/override guard; `PAYMOB_SANDBOX` treated as configuration state only (not proof of scope); fail-closed credential checks; production guard requires explicit `PAYMOB_SANDBOX` when using Paymob; test-safe health checks; new unit tests `paymob-sandbox-config.spec.ts` (**6/6 PASS**), `tsc --noEmit` clean. **Limitations:** credential scope (test vs live) and HMAC availability remain independently unverified; `PAYMOB_SANDBOX=true` cannot be taken as proof of credential scope; not all payment/refund/webhook lifecycle verified. No secrets/network calls/DB/Docker/Git operations. |
| P5-05 | Sandbox lifecycle tests | **IN_PROGRESS** | **§5Q.2** — offline portion executed: new `paymob-sandbox-lifecycle.spec.ts` (**15/15 PASS**) drives the real gateway through intention → checkout URL → webhook HMAC (valid + tampered + missing secret) → status poll (paid/failed/pending) → refund (success/fail-closed) → refund-state recovery, plus six containment assertions (every URL on the allowlisted origin, no transport on invalid refs, disallowed override rejected). Transport fully stubbed; **no request left the process**. **Still DEFERRED:** real Sandbox charge/3DS, real webhook delivery, provider refund timing, credential-scope proof, fresh-DB evidence (**B36**). |
| P5-06 | Duplicate booking/slot protection | **DONE** | **§5R**. Slot protection verified on two layers. (a) **Real-concurrency evidence (P4-03, executed 2026-10-27, not re-run today):** `booking.concurrency.integration` + `booking.concurrency.service.integration` **16/16 PASS** against MySQL `courtzon_v3` — identical/partial-overlap/duplicate requests under `Promise.all` → exactly one booking, the rest 409; adjacent windows both succeed; terminal rebooking allowed. (b) **New offline contract suite (this task):** `booking-slot-availability.spec.ts` (**8**) pins the authoritative SQL — `resources` row `FOR UPDATE` issued **first**, overlap count excludes only `cancelled/expired/no_show` so a held `pending_payment` slot still blocks, strict `<`/`>` boundary comparison, multi-slot sum, overnight wrap SQL, academy-hold blocking with expired-hold exclusion and self-exclusion on reschedule. (c) **Matrix #21 closed:** `booking-payment-expiry-listener.spec.ts` (**10**) proves a `payment:expired-event` on a single `pending_payment`/`pending` booking issues exactly one `CancelBooking` with `PAYMENT_TIMEOUT`, skips terminal/missing/unrelated references, delegates `booking_series` to the series branch, never throws on command failure, and cannot double-cancel on duplicate events or double registration. Mutation proof: adding `pending_payment` to the excluded list → **1 failed / 7 passed**, file restored byte-exactly (SHA-256 `3851328…`). Results: new files **18/18**, with existing expiry specs **31/31** (4 files), booking unit module **320/320** (23 files), `tsc --noEmit` **exit 0**. No DB writes today; **B30** residual unchanged. |
| P5-07 | Duplicate accounting posting checks (idempotency) | **DONE** | **§5S**. Verified the posting-identity guard on four axes, offline with the **real** listener + `postAccountingEvent`: (a) **concurrent duplicate race** — 2 and 4 simultaneous postings of the same `(source_type, source_id, event_type)` produce **exactly one** journal, one commit, one `accounting:entry-recorded`; the losers roll back on `ER_DUP_ENTRY`; `projectEntries` runs once. (b) **identity scope (no over-skip)** — same source with a different event type, a different source id, or a different source type each post independently; `hasPosting` is queried with exactly the 3-tuple. (c) **retry semantics** — a hard failure throws, claims nothing, commits nothing, and the retry posts exactly once; a duplicate rejection is never retried into a second journal. (d) **duplicate domain-event delivery** — `settlement:paid` twice posts `settlement_paid` + `settlement_org_receipt` once each; `payment:gateway-settled` twice posts once; settlement + its reversal are distinct postings, each once; zero-id/zero-amount payloads are ignored. Mutation proof: disabling the `ER_DUP_ENTRY` idempotent-rollback branch → **4 failed / 10 passed**, file restored byte-exactly (SHA-256 verified). Results: new file **14/14**, with P4-07/P4-08 idempotency specs **23/23**, financial unit suite **375/375** (37 files), `tsc --noEmit` **exit 0**. **Limitations:** the race is simulated at the persistence boundary (no DB writes today); the durable guarantee rests on `ledger_entries.uk_dedup` verified read-only in P4-07, plus **B35** residuals (no occurrence ordinal → a second *legitimate* same-event posting is skipped; handlers do not auto-retry). |
| P5-08 | Stock restoration/refund reconciliation | **DONE** | **§5T** verification + **§5U B31 fix**. (a) **Stock restoration guards:** sequential duplicate `payment:failed` restores once; paid orders never cancel/restore; terminal orders ignored; multi-line orders restore each line with its ordered quantity — `stock-restore-race.spec.ts` (**10**, incl. 4 concurrent/crash tests) plus P4-04's `checkout-inventory-integrity` (**9**). (b) **B31 FIXED (2026-10-28, §5U):** terminal status transitions are now a conditional atomic claim (`UPDATE … WHERE status NOT IN ('cancelled','refunded')`) executed in **one transaction** with the inventory restore; concurrent/duplicate failure events, checkout rollbacks and overlapping abandoned-cleanup runs restore exactly once, and a crash rolls the claim back so the retry still restores. No schema change. (c) **Refund boundaries:** `booking-refund-boundaries.spec.ts` **9/9**; DB-writing refund crash/race suites **NOT RUN** (no DB writes). (d) **Reconciliation invariants (L-5):** `reconciliation-invariants.spec.ts` (**16**) — gateway-paid/local-pending CRITICAL + auto-fixable vs failed/unreachable fail-safe, booking mismatch WARNING, wallet CRITICAL, orphan WARNING, COD INFO, settled-refund 1120/1100 invariant (+rounding), missing settled variant, tournament lineage, counters, autoFix only on auto-fixable and never report-only, contained failure, escaped date filters, `RECONCILIATION.RUN` audit. Mutation proofs: bypassing the settled-refund invariant → **2 failed / 14 passed**; removing the B31 claim gate → **4 failed / 6 passed**; both files restored byte-exactly. Results: payment+marketplace unit **344/344** (35 files), `tsc --noEmit` **exit 0**. **B40** and DB-writing suites remain open/NOT RUN. |
| P5-09 | Clearing/fees/payables/settlements | **DONE** | **§5V**. Offline verification (no DB writes): (a) **fees/net** — real `_computeFee` (**14 tests**): pct-only, fixed-only, mixed, 2-dp rounding, zero gross, missing fee config → `missing` (no invented 0%), non-gateway methods, plus the fee ≥ gross boundary (left unchanged by decision). (b) **batch creation** — real `create()` against a scripted transaction (**21 tests**): header gross/fee/net = Σ line snapshots to the cent, one clearing→bank posting in the same transaction, duplicate-id dedupe, already-linked / ACTIVE-line / lost guarded-UPDATE duplicates rejected with **no** insert/posting, eligibility+fee guards, later-line failure rolls back with no partial journal, and **B42 currency guard** (mixed EGP/USD rejected before persistence/accounting, order-independent; single-currency EGP and USD still create). (c) **reversal** — stored amounts posted once, already-reversed rejected, concurrent linkage change aborts without commit. (d) **settlement reconciliation** — real `GatewaySettlementReconciliationService` (**15 tests**): 9 report-only checks (header vs ACTIVE lines, transaction_count, ownership, payment↔batch linkage, refunded-still-active, pointer mismatch, refunded tournament, unsettled-after-draw-lock WARNING, duplicate ACTIVE ownership), 2-dp tolerance, 200 cap, counters, per-discrepancy audit, audit failure contained. **B42 FIXED** (§5V.3, `ConflictError` before totals/inserts/posting; fail-before **2 failed / 19 passed**, file restored byte-exactly). Results: settlement module **104/104** (9 files), full backend **4105 passed / 8 pre-existing failures** (B28 2 + B8 6), `tsc --noEmit` **exit 0**. **Limitations:** DB-writing settlement integration suites (`gateway-settlement*` 8 + 6) **NOT RUN**; payable balances evidenced indirectly via the P4-07 posting audit; fee ≥ gross remains an accepted unguarded configuration risk. |
| P5-10 | Evidence (sandbox vs mocked) | **DONE** | **§5W** — Phase 5 evidence ledger. Defines six evidence classes (**A** offline automated, **S** source inspection, **I** integration executed earlier on the real DB, **U** user-confirmed external, **X** independently executed Sandbox, **N** not run/deferred) and classifies every Phase 5 item with its exact result and limitation. Aggregate re-executed in this task: **16 Phase 5 spec files, 246/246 PASS**; settlement module **104/104**; `tsc --noEmit` **exit 0**; full backend **4105 passed / 8 pre-existing failures** (B28 2 + B8 6). External ledger: **U** = Test-mode dashboard, Test-labelled Public/Secret keys, integration `5663993`, successful Hostinger test (not independently verified, no request/response evidence); **X = 0** (no Paymob call ever made by the assistant); real Sandbox lifecycle **DEFERRED**; credential scope/HMAC availability **not established**; fresh-DB evidence **BLOCKED (B36)**. Risks preserved: fee≥gross, B38/B39/B40, B5, B35, B36/B37, B7, DB-writing settlement/refund suites **NOT RUN**, 32 container suites **BLOCKED**. No mocked or user-confirmed result was upgraded to Sandbox; Phase 5 acceptance remains **NOT MET**. |

**Phase 5 acceptance:** **NOT MET.** All Phase 5 items except **P5-05** are `DONE` (P5-04 limited, user-confirmed;
P5-09 with B42 fixed; P5-10 evidence ledger §5W), but P5-05's **external Sandbox lifecycle is DEFERRED** and plan
rule 4.5 states unit/mocked evidence does not replace Sandbox testing. The DB-writing settlement/refund/stock
integration suites were also **NOT RUN** under the no-write constraint. **No production-readiness claim** — Phase 5
cannot be accepted until the external lifecycle is executed or its limitation is explicitly accepted, and **B36**
remains a release blocker for fresh-deploy verification.

## 5N. P5-01 — payment lifecycle map and Phase 5 test matrix (2026-10-27)

### 5N.1 Method and evidence sources (analysis-only)

- **Code traced:** `payment.service.ts` (`charge`, `chargeByGateway`, `handleWebhook`, `confirmPayment`,
  `_processPaymentOutcome`, `syncPendingPayments`, `recoverPayment`, `expireStalePayments`, `refund`,
  `_refundCard`, `_refundSeriesAllocation`), `payment-aggregate.ts`, `payment.repository.ts`,
  `payment-cron.worker.ts`, `reconciliation.service.ts`, `paymob-gateway.ts`, `mock-gateway.ts`,
  `gateway-factory.ts`, the module listeners (`booking-payment`, `marketplace-payment`,
  `tournament-payment`, `wallet-payment`, `academy-payment`, accounting), and the booking / marketplace /
  subscription / membership / academy / tournament entry points.
- **Read-only schema evidence:** `information_schema` for `payment_transactions` (24 columns, 10 indexes),
  settlement tables and related tables; `SELECT` only. No database writes.
- **Test inventory:** 7 payment unit files (**38/38 PASS**, run read-only), plus the payment/refund/settlement
  integration suites listed in §5N.5. No integration suite or external provider was executed.
- **Configuration:** `.env` (read without printing secrets) has `PAYMENT_GATEWAY_PROVIDER=paymob`,
  `PAYMOB_SANDBOX=true`, and all Paymob key/secret fields set; `backend/.env` has the provider/sandbox flags
  only. No Sandbox call was made (**B7/P5-04** remains open).

### 5N.2 Authoritative payment state model

`payment_transactions.payment_status` (DB enum): **`created` · `pending` · `processing` · `paid` · `failed` ·
`cancelled` · `expired` · `refunded`**. The application state machine (`payment-aggregate.ts`) and
`_processPaymentOutcome` implement:

```
created ──► pending ──► paid ──► refunded
   │            ├─────► failed        (terminal)
   │            ├─────► cancelled     (terminal)
   │            └─────► expired       (terminal)
   └──────────► cancelled
```

Guards: `FINAL_STATES = {paid, failed, cancelled, expired, refunded}` are never re-processed; the update is a
single conditional `UPDATE … WHERE payment_status NOT IN (final)` inside a `FOR UPDATE` transaction; duplicate
webhook/sync/confirm/recover paths converge on the same outcome. `processing` and `created` are read as
“in-flight” by sync/expiry/reconciliation, but **no code path writes `processing` or `created`** (rows are
created as `pending`) — a legacy/dead state, documented below.

Durable identity: `uk_idempotency_key` (UNIQUE `idempotency_key`), `uq_gateway_reference` (UNIQUE
`gateway_reference`), `idx_pt_status_created`, `idx_reference(reference_type, reference_id)`. There is **no
`refunded_amount` column and no `partially_refunded` status** on `payment_transactions`.

### 5N.3 Flow map (states, persistence, events, accounting, recovery)

| Flow | Initiation → authoritative persistence | States / transitions | Events | Accounting effect | Recovery |
|---|---|---|---|---|---|
| **Booking — card (direct create)** | `createBooking` creates `bookings` **`pending_payment`** + 3-min `expires_at`, blocks slots → `paymentService.charge` → `payment_transactions(pending)` | booking `pending_payment → confirmed` on payment success; `→ cancelled/expired` on failure/expiry; payment `pending → paid/failed/cancelled/expired` | `booking:created`; on payment: `payment:succeeded`+`payment:completed` / `payment:failed-event`+`payment:failed` → booking listener confirms (`booking:paid`) or cancels; `booking:expired` from expiry worker | `booking_card_payment` / `booking_cod_payment` via accounting listener (§5J) | webhook, `confirm`, 5-min sync job, 2-min expiry job (3-min booking TTL + 5-min payment timeout), manual recover; gateway throw/failure cancels the booking |
| **Booking — prepare/intention** | `prepareGatewayBooking` → `createGatewayIntention` (no booking yet) → payment row stores Paymob **intention order id**; prepare data in Redis | payment `pending`; later `confirmBookingFromPrepare` creates the booking and relinks `booking_id`; `paid` via webhook/confirm/sync | same as above; correlation via stored intention JSON / `merchant_order_id` (`findByWebhookCorrelation`) | same as booking card | webhook re-correlation; expiry recovers a Paymob-paid intent instead of expiring it; late webhook on expired local row is ignored |
| **Booking — cash/COD** | booking created **`confirmed`**, `payment_status='pending'` | operator/cash collection marks paid (module flow); no gateway | `booking:paid` on collection | `booking_cod_payment` receivable model | manual collection; no gateway recovery |
| **Recurring booking series** | one series payment (`reference_type='booking_series'`) covers N occurrences; occurrences `pending` until success | payment `pending → paid/failed/cancelled/expired`; occurrences confirmed/cancelled atomically | `payment:succeeded`/`failed-event` → series handler confirms/cancels occurrences; `payment:refunded` for full/partial allocation refunds | one `booking_series_card_payment` recognition (or COD); allocation refunds reverse per occurrence | webhook/confirm/sync/expiry; allocation intents persisted in `gateway_response` for crash recovery; multi-partial supported **only** via allocations |
| **Marketplace order** | checkout creates per-seller orders (`pending`) + payment row; stock decremented at checkout; cart snapshot retained | order `pending → processing → shipped → delivered`, or `cancelled/refunded`; payment `pending → paid/failed/refunded` | `payment:succeeded` → `handlePaymentSucceeded`; `payment:failed-event` → cancel/restore; refund → `payment:refunded` + order update | `marketplace_card_payment`/wallet/cash via accounting listener; refunds per §5J | webhook/confirm/sync; failed payment cancels + restores stock exactly once; refund only marks order after money moves; abandoned-order worker (30 min) |
| **Organisation subscription** | request (`pending`) created in org portal; **no gateway initiation in this module** | request `pending → approved/rejected/cancelled`; subscription `pending → active → expired` | `subscription:approved` / activation events | `subscription_cash_payment` (cash) or card accounting through `postAccountingEvent` | admin approve/reject/reopen; for card, activation requires the linked `payment_transactions(reference_type='subscription')` to be **paid** (a pending/failed txn cannot be overridden); cash approval is the payment evidence |
| **Membership** | `createSubscription` creates immutable subscription snapshot + **pending** `payment_transactions` (cash/card); installments schedule | subscription `pending → active → expired/cancelled/terminated`; payment `pending → paid/failed/refunded`; first installment activates, later installments are payments on the full invoice | `payment:succeeded` → activation/finalisation; `membership:activated`; `payment:refunded` on refund | `membership_card_payment`/cash; installment accounting (§5J) | cash operator confirmation; card webhook/confirm; overdue never deactivates; refunds via policy (`membership-cancel-refund`) |
| **Academy** | player `charge` requires `enrollment.status='confirmed'` + `program.lifecycle_state='confirmed'`; server-derived amount; `paymentService.charge(reference_type='academy')` | payment `pending → paid/failed/refunded`; enrollment payment state `free/unpaid/processing/paid/unavailable`; snapshot committed on success | `payment:succeeded` → `academy:enrollment-paid`; `payment:refunded` on refund | immutable `academy_enrollment_payments` snapshot + entitlements + `academy_card_payment`/cash | webhook/confirm/sync; duplicate/concurrent attempts produce one snapshot; refunds card via shared hardened refund, cash offline reversal |
| **Tournament** | registration creates registration + payment (`reference_type='tournament'`); cash marks paid immediately; card creates pending gateway payment | registration `pending → paid → refunded/cancelled`; payment `pending → paid/failed/refunded` | `payment:succeeded` → listener marks registration paid + `tournament:registration-paid`; cash path emits `payment:succeeded` directly; refunds → `payment:refunded` | `tournament_registration_card_payment` / cash commission (§5J) | webhook/confirm/sync; refund service uses hardened card refund or cash reversal; prize/settlement flows separate |
| **Wallet top-up** | `deposit` → `createGatewayIntention(reference_type='wallet_topup')` → pending payment row | payment `pending → paid/failed/expired`; wallet credited only on `payment:succeeded` | `payment:succeeded` → wallet listener credits wallet + operational ledger; accounting `wallet_topup` | Dr clearing / Cr wallet liability (accounting engine) | webhook/confirm/sync/expiry; idempotency by `(wallet, paymentId)`; wallet is **not** an active charge method (Phase 1), but refunds credit it |
| **Refunds** | `paymentService.refund` after module authorisation | wallet: `paid → refunded` inside one transaction; card: T1 arm → gateway → T2/T3 finalize `paid → refunded`; allocation: per-allocation partial intent, payment stays `paid` until full | `payment:refunded` (wallet/card), module refund events | per §5J; allocation refunds reverse only that allocation | crash-window recovery (`getRefundState`), retry/cool-off, duplicate/concurrent guards; **single-payment partial refunds are terminal** (see B40) |
| **Settlement / reconciliation** | gateway settlement links paid card transactions; unified settlement consumes entitlements | gateway settlement `completed → reversed`; unified settlement `requested → calculating → pending_approval → approved → paid → completed`, or `rejected/cancelled`; transfer `pending → completed/failed` | `payment:gateway-settled` / `-reversal`; `settlement:paid` → accounting `settlement_paid` | clearing/cash/payable per §5J | duplicate settlement rejected (unique linkage); reversal posts inverse journal; reconciliation compares gateway vs local, paid-vs-booking, wallet-vs-payment, duplicate postings |

### 5N.4 Lifecycle inconsistencies, security gaps and provider assumptions

| ID | Finding (evidence) | Class | Impact | Follow-up |
|---|---|---|---|---|
| **B38** | **Duplicate-charge window on concurrent same-idempotency-key payments.** `chargeByGateway` calls the gateway **before** inserting the local row (`payment.service.ts:250-292`); `createGatewayIntention` does the same (`:1751-1788`). The idempotency pre-check (`:233-246`) is outside any lock, and Paymob `special_reference` includes `Date.now()` (`paymob-gateway.ts:83`), so two concurrent requests with the same key create two distinct gateway intentions; only the second **local** insert fails on `uk_idempotency_key` — after the customer may already be charged twice. No test covers this race. | **Confirmed by code inspection — lifecycle/idempotency gap (High); not reproduced in a test** | Double charge / orphan gateway transaction, no compensating refund path. | **P5-03** (concurrency/idempotency), **P5-08** |
| **B39** | **Webhook replay protection marks before processing.** `handleWebhook` writes the Redis key `webhook:processed:<id>` (24 h TTL) **before** resolving/processing (`payment.service.ts:335-351`); if processing then fails, retries are answered as duplicates and skipped, and Redis unavailability disables dedupe entirely (DB final-state guards remain the only protection). | **Confirmed by code inspection — recovery gap (Medium); not reproduced** | A transient DB error can permanently drop a valid payment event until manual recovery; duplicate delivery is masked as success. | **P5-03** |
| **B40** | **No partial-refund representation for single payments.** Both card finalisation (`:1592`) and wallet (`:978`) set `payment_status='refunded'` for **any** refund amount; `payment_transactions` has no `refunded_amount` and no `partially_refunded` status. Multi-partial is implemented only for recurring allocations via `gateway_response` intents (`payment.repository.ts:257-312`). Marketplace cumulative refund logic exists in the calculation layer, but a normal partial card refund closes the payment. | **Documented limitation / boundary gap (Medium), code-inspected** | A second partial refund of the same payment is impossible unless it is an allocation refund; financial reporting cannot read the refunded amount from the payment row. | **P5-07/P5-08**; schema change may be required (do not implement in P5-01) |
| **B5** | **No webhook-signature rejection tests; comparator is not timing-safe.** `PaymobGateway.verifyWebhook` implements both Intention (20-field) and Accept (23-field) HMAC-SHA512 concatenations, fails closed without a secret, but compares with `===` (`paymob-gateway.ts:383,414`); every integration test spies/mocks `verifyWebhook` to `true` (e.g. `paymob-intention-correlation.integration.spec.ts:179`) and no test asserts 401/rejection or runs the real HMAC. | **Missing failure/security coverage (B5, High)** | A signature regression or algorithm mismatch would not be detected; timing side-channel on the comparator. | **P5-02** (scope below) |
| **B7 / P5-04** | **Sandbox/live provider identity: partially evidenced (2026-10-28).** The user confirmed the Paymob dashboard is in **Test mode**, Public/Secret keys are **Test-labelled**, Integration ID `5663993` exists, and a Paymob test on Hostinger **succeeded** — recorded as **limited, user-confirmed evidence**, not independently verified from the repo. The API Key was not Test-labelled in the screenshot and HMAC is unavailable on that screen; credential scope and HMAC presence therefore remain unverified. Local host stays `https://accept.paymob.com` with an allowlist; `PAYMOB_SANDBOX` is config state only. | **External integration partially evidenced (B7, High residual)** | Real provider behaviour (Intention/order/refund APIs, HMAC field order, webhook delivery, timeouts, `notification_url`) is still unverified; a live-scope key would not be detectable locally. | **P5-04** recorded DONE-limited (§5Q); **P5-05** offline lifecycle done, external lifecycle **DEFERRED** |
| **B33 / B35** | Payment outcome events are published via the event bus and accounting is posted post-commit; duplicate delivery is guarded by `uk_dedup`, but posting identity/replay limits remain. | Documented (P4-06/P4-07) | No new finding; keep invariants. | P5-07, Phase 9 |
| **B36** | **Critical prerequisite:** any fresh-DB/rebuild payment verification is invalid until the baseline/convergence defect is fixed. | Confirmed (P4-09) | Do not run fresh-DB/Sandbox lifecycle verification against a rebuilt DB. | Authorized baseline task + Phase 9 |
| **L-4** | `processing`/`created` payment states are queried as in-flight but never written by the service. | Legacy/dead state (Low) | No behavioural impact; misleading reconciliation counts. | Documented; P5-03/P5-09 may clean up |
| **L-5** | `syncPendingPayments` (5-min job) still has no dedicated test. `reconciliation.service.ts` now has offline coverage (**16 tests**, P5-08 §5T.4) for classification/counters/auto-fix boundaries and the settled-refund 1120/1100 invariant, but its SQL executes only against a stubbed pool. | Partially closed (P5-08); sync job and real-SQL semantics remain uncovered | Provider drift in the sync sweeper and query-level reconciliation behaviour is undetected. | **P5-09** (sync/query-level) |
| **L-6** | Payment routes (`/payments/charge|confirm|refund|sync|expire|recover|reconciliation/*`) are permission-gated in code, but no route-level authorization tests exist (only the tournament refund registry guard test). | Missing coverage | Permission regressions on money endpoints would be silent. | **P5-03/P5-09** |

### 5N.5 Phase 5 test matrix

Status legend: **EXISTS** (covered today) · **EXTEND** (partial; add scenario) · **MISSING** (no test) ·
**BLOCKED** (needs external/Sandbox or B36). Target = task that should own it.

| # | Area / scenario | Type | Existing evidence | Status | Target |
|---:|---|---|---|---|---|
| 1 | Intention webhook: valid HMAC accepted | normal | none (verifyWebhook always mocked) | **MISSING** | P5-02 |
| 2 | Accept webhook: valid HMAC accepted | normal | none | **MISSING** | P5-02 |
| 3 | Invalid/tampered signature → 401, no state change | failure/security | controller maps “Invalid” → 401, no test | **MISSING** | P5-02 |
| 4 | Missing/empty HMAC secret → fail closed | failure | code only (`paymob-gateway.ts:337`) | **MISSING** | P5-02 |
| 5 | Paymob field-order/concatenation exactness (both payload shapes) | boundary | none | **MISSING** | P5-02 |
| 6 | Signature comparison hardening (timing-safe) | security | code uses `===` | **MISSING** | P5-02 |
| 7 | Duplicate webhook (same txn id) is idempotent | idempotency | `paymob-intention-correlation` #2; `recurring-series` 32/35 | **EXISTS** | P5-03 |
| 8 | Gateway retry envelope (different webhook id, same order) | idempotency | `recurring-series` 32/35 | **EXISTS** | P5-03 |
| 9 | Webhook replay after a processing failure | failure/recovery | none | **MISSING** (B39) | P5-03 |
| 10 | Webhook with Redis unavailable | failure | code logs and proceeds; no test | **MISSING** | P5-03 |
| 11 | Unknown gateway reference → 404-style handling | failure | `org-portal.integration.spec.ts` webhook tests (mock provider) | **EXTEND** | P5-03 |
| 12 | Late webhook on expired/cancelled payment ignored | boundary | `payment.integration` expiry; code guards | **EXTEND** | P5-03 |
| 13 | Charge/confirm/refund route authorization matrix | authorization | none for `/payments/*` | **MISSING** | P5-03/P5-09 |
| 14 | Concurrent same-idempotency-key charge → no double charge | concurrency | none (**B38**) | **MISSING** | P5-03 |
| 15 | Gateway charge failure → no row / clean error | failure | `payment-charge-routing` (card failure) | **EXISTS** | P5-03 |
| 16 | Booking card success → booking confirmed + paid | normal | `booking-card-payment.integration` #1 | **EXISTS** | P5-06 |
| 17 | Booking card failure → booking not paid/cancelled | failure | `booking-card-payment` #4; listener | **EXISTS** | P5-03 |
| 18 | Booking prepare → intention correlation → paid | normal | `paymob-intention-correlation` #1/#3 | **EXISTS** | P5-03 |
| 19 | Booking expiry recovers Paymob-paid intent | recovery | `paymob-intention-correlation` #4 | **EXISTS** | P5-03 |
| 20 | Booking expiry skips pending/unknown (no race-cancel) | boundary | `paymob-intention-correlation` #6 | **EXISTS** | P5-03 |
| 21 | Single booking expiry cancels the pending booking (not only series) | failure | **CLOSED in P5-06** — `booking-payment-expiry-listener.spec.ts` (10): one `CancelBooking`/`PAYMENT_TIMEOUT`, terminal/missing/unrelated skipped, series delegated, no throw on failure, no double-cancel | **EXISTS** | P5-06 (done) |
| 22 | Recurring series full payment / duplicate confirm | normal/idempotency | `recurring-series-payment.r5b.integration` | **EXISTS** | P5-03 |
| 23 | Recurring multi-partial refunds / allocation intents | boundary/idempotency | `recurring-series-payment.r5b.integration` (D2-B) | **EXISTS** | P5-08 |
| 24 | Marketplace checkout → paid → stock/order state | normal | `marketplace-payment.integration` | **EXISTS** | P5-08 |
| 25 | Marketplace failed payment → cancel + single stock restore | failure | `marketplace-payment`, `checkout-inventory-integrity` | **EXISTS** | P5-08 |
| 26 | Marketplace concurrent confirmation → exactly one | concurrency | `marketplace-payment.integration` | **EXISTS** | P5-08 |
| 27 | Marketplace post-settlement refund / cumulative refund | boundary | `marketplace-settled-refund`, `marketplace-refund-calc` | **EXISTS** | P5-08 |
| 28 | Membership full payment activation | normal | `membership-p1.integration` | **EXISTS** | P5-09 |
| 29 | Membership installment activation / overdue / cancel refund | boundary | `membership-p2/p3.integration` | **EXISTS** | P5-09 |
| 30 | Org subscription: card activation requires paid txn | failure/authorization | `subscription-cash-activation`; card-linked path not tested | **EXTEND** | P5-09 |
| 31 | Academy card/cash success, duplicate, concurrency, refund | normal/failure/concurrency | `g8-payment-flow.integration` (18), `academy-refund.*` | **EXISTS** | P5-08 |
| 32 | Tournament card/cash payment → registration paid | normal | `tournament-payment.listener.spec`, `g11-1/2` | **EXISTS** | P5-09 |
| 33 | Tournament refund / cancellation | boundary | `tournament-refund.g11-3`, `registration-cancel` | **EXISTS** | P5-08 |
| 34 | Wallet top-up credits once; duplicate event safe | idempotency | `payment.integration` wallet tests, `deposit-wallet.events.contract` | **EXTEND** (listener-level) | P5-03 |
| 35 | Card full refund crash windows (T1/T2/T3, stale intent, unknown state) | failure/recovery | `hardening-refund-crash-window.integration` (14) | **EXISTS** | P5-08 |
| 36 | Concurrent refunds of same payment → one gateway call | concurrency | `hardening-group-card-refund-race.integration` (5) | **EXISTS** | P5-08 |
| 37 | Wallet refund credits wallet once | normal/idempotency | `hardening-payment-refund.integration` (2) | **EXISTS** | P5-08 |
| 38 | Over-refund cap / partial-refund terminality | boundary | mock gateway cap tested; B40 semantics untested | **EXTEND** | P5-08 |
| 39 | Gateway settlement create/duplicate/fees | normal/failure | `gateway-settlement.integration` (8) | **EXISTS** | P5-09 |
| 40 | Settlement reversal + immutable history | recovery | `gateway-settlement-reversal.integration` (6) | **EXISTS** | P5-09 |
| 41 | Reconciliation: gateway-paid/local-pending, paid-vs-booking, wallet mismatch, duplicate postings | failure/boundary | **P5-08** 16 offline tests (`reconciliation-invariants.spec.ts`); **P5-09** added 15 offline tests for the gateway-settlement reconciliation (9 checks incl. header vs ACTIVE lines) and 18 for batch create/reverse | **EXTEND** (real-SQL/settlement integration still NOT RUN) | P5-09 |
| 42 | Sync job (5 min) paid/failed/unreachable | failure/recovery | none dedicated | **MISSING** | P5-03 |
| 43 | Confirm endpoint 60 s polling / remote error fallback | boundary/failure | recurring confirm only | **EXTEND** | P5-03 |
| 44 | Paymob Sandbox configuration + lifecycle | external | P5-04 user-confirmed evidence; **offline lifecycle suite added in P5-05** (`paymob-sandbox-lifecycle.spec.ts`, stubbed transport) | **PARTIAL** — external lifecycle **DEFERRED** (B7) | P5-04 (done) / P5-05 (offline done, external deferred) |
| 45 | Fresh-DB/rebuild payment verification | external/prerequisite | none; **B36** unresolved | **BLOCKED** | Baseline task/Phase 9 |

### 5N.6 P5-02 and P5-04 intended scope (not executed)

- **P5-02 (HMAC positive/negative tests):** unit-test `PaymobGateway.verifyWebhook` with a deterministic
  secret for **both** payload shapes (Intention 20-field and Accept 23-field), asserting: valid signature
  accepted; any single-field mutation rejected; wrong/empty/truncated signature rejected; missing secret
  rejected (fail-closed); `handleWebhook` throws → controller returns 401 with **no** payment row/event change;
  timestamp/field ordering documented as provider-defined (not a security check). This is a unit-level task and
  does not require Sandbox.
- **P5-04 (Sandbox safety confirmation, RESOLVED 2026-10-28 on limited, user-confirmed evidence — see §5Q):**
  the user confirmed the Paymob account is in Test mode with Test-labelled Public/Secret keys and Integration ID
  `5663993`, and that a Paymob test on Hostinger succeeded. This was **not** independently verified by repository
  inspection; credential scope and HMAC availability remain unverified. Local host fix + fail-closed hardening is
  recorded in §5Q. P5-05 owns lifecycle tests.
- **B36 prerequisite:** no fresh-database or rebuilt-environment payment verification may be treated as evidence
  until the baseline/entrypoint convergence defect is fixed (authorized separate task; **not** in P5-01).

### 5N.7 Validation and limitations

| Check | Result |
|---|---|
| `npx vitest run src/modules/payment` (unit config; no DB writes) | **38 / 38 PASS** (7 files) |
| Static lifecycle tracing | payment service, aggregate, repository, gateway, cron, reconciliation, module listeners |
| Read-only schema inspection | `payment_transactions` 24 columns / 10 indexes; settlement tables/status enums; no writes |
| Integration/Sandbox execution | **NOT RUN** (32 container suites, DB-writing payment suites, external provider) |
| B36 fresh-DB verification | **NOT RUN** (blocked by design) |

**Unverified details:** real Paymob HMAC behaviour and field ordering, webhook delivery/reachability, order/refund
API semantics, Sandbox account scope, provider timeout behaviour, and any fresh-DB behaviour. These are recorded
as external assumptions, not verified facts.

## 5O. P5-02 — Paymob webhook HMAC tests (2026-10-27)

### 5O.1 Signature construction tested (exact implementation order)

- **Serialization:** values are concatenated with **no separators**, `null`/`undefined` become **empty string**
  (`?? ''`), booleans serialize as `true`/`false`, then **HMAC-SHA512** with the merchant HMAC secret,
  lowercase hex. Comparison is exact string equality.
- **Intention callback (20 values):** `obj.amount_cents`, `obj.created_at`, `obj.currency`, `obj.error_occured`,
  `obj.has_parent_transaction`, `obj.id`, `obj.integration_id`, `obj.is_3d_secure`, `obj.is_auth`,
  `obj.is_capture`, `obj.is_refunded`, `obj.is_standalone_payment`, `obj.is_voided`, `obj.order.id`, `obj.owner`,
  `obj.pending`, `obj.source_data.pan`, `obj.source_data.sub_type`, `obj.source_data.type`, `obj.success`.
- **Accept callback (23 values):** `amount_cents`, `created_at`, `currency`, `error_occured`,
  `has_parent_transaction`, `id`, `integration_id`, `is_3d_secure`, `is_auth`, `is_capture`, `is_refunded`,
  `is_standalone_payment`, `is_voided`, `order.id`, `order.created_at`, `order.merchant_order_id`, `owner`,
  `pending`, `refunded_amount_cents`, `source_data.pan`, `source_data.sub_type`, `source_data.type`, `success`.
- **Discovery/correction:** P5-01 records “Accept 22 fields” from the code comment; the implementation actually
  signs **23** values (the `success` field plus the 22 preceding). P5-02 follows the code and corrects the record
  everywhere in this document. No provider call was made, so this is **implementation-faithful**, not a Sandbox
  confirmation of Paymob’s published order.

### 5O.2 Tests added (65)

| File | Tests | Coverage |
|---|---:|---|
| `backend/src/shared/services/gateway/__tests__/paymob-webhook-hmac.spec.ts` | **55** | Valid Intention + Accept signatures; **each** of the 20 Intention and 23 Accept fields mutated individually (signature must fail); absent/null signed fields treated as `''`; extra unsigned fields ignored; incorrect, empty, truncated (32 chars), over-long, non-hex, uppercase and whitespace-padded signatures rejected; null/undefined signature rejected (both modes); missing and empty HMAC secret fail closed; no secret or full signature is logged. |
| `backend/src/modules/payment/__tests__/webhook-signature-handling.spec.ts` | **3** | `paymentService.handleWebhook` with verifier `false`: throws `Invalid webhook signature`, **no** payment repository read (`findByGatewayRef`/`findById`), **no** `payment:succeeded` / `payment:completed` / `payment:failed-event` / `payment:failed` emission. |
| `backend/src/modules/payment/__tests__/payment-webhook-controller.spec.ts` | **7** | Invalid signature → **HTTP 401** `{error:'Invalid signature'}` with **no** success audit; signature extraction from `?hmac` and `x-paymob-signature` (query wins); empty signature passed as `''` (fail closed); missing gateway reference → 400; non-signature error → 500; accepted webhook audits `PAYMENT.WEBHOOK` once. |

No real credentials are used: the fixture secret is `unit-test-hmac-secret-not-real`; no provider endpoint is
contacted and no database is opened.

### 5O.3 Confirmed defect found and fixed (B41)

- **Defect:** `PaymobGateway.verifyWebhook` threw `TypeError: Cannot read properties of null (reading 'slice')`
  for a `null`/`undefined` signature because the mismatch logger called `expected.slice(...)` **after**
  `computed === signature` had already failed. A malformed signature therefore produced a 500-style crash
  instead of a fail-closed rejection.
- **Pre-fix evidence:** the new suite failed exactly one test —
  `rejects null/undefined signatures` → `TypeError … reading 'slice'` at `paymob-gateway.ts:387` (Intention
  branch; the Accept branch was already optional-chained). No state was mutated by the failing call.
- **Fix (minimal, in-scope):** normalize the expected signature to `''` when it is not a string
  (`const expected = typeof signature === 'string' ? signature : ''`) in **both** branches, use it for the
  equality check and the mismatch log. Exact string-equality semantics are preserved; lifecycle, accounting,
  idempotency and refund policy are untouched. **No timing-safe comparison was introduced** (B5 residual).
- **Re-run:** all 65 new tests pass; combined payment gateway/payment-unit suite **103/103** (10 files).

### 5O.4 Results

| Command | Result |
|---|---|
| `npx vitest run src/shared/services/gateway/__tests__/paymob-webhook-hmac.spec.ts src/modules/payment/__tests__/webhook-signature-handling.spec.ts src/modules/payment/__tests__/payment-webhook-controller.spec.ts` | **65 / 65 PASS** |
| `npx vitest run src/modules/payment src/shared/services/gateway` | **103 / 103 PASS** (10 files) |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npm run lint:gate` | PASS — 711 files / 3,377 findings |

**Not run:** Paymob Sandbox/live calls, webhook delivery, DB-writing payment integration suites and the
container suites. The HMAC field order is verified against the implementation, **not** against Paymob’s live
documentation or an actual delivery.

### 5O.5 Remaining limitations

- **B5 remains open (partially resolved):** HMAC positive/negative coverage now exists; upload magic-byte,
  CORS/header negatives, brute-force and rate-limit negatives are unchanged; the comparator remains
  non-timing-safe by decision (tests only).
- **B7/P5-04:** Sandbox approval and real delivery remain unverified.
- **B38/B39/B40:** untouched (duplicate-charge window, webhook replay ordering, partial-refund representation) —
  owned by P5-03/P5-07/P5-08.
- **B36:** fresh-DB verification remains blocked by baseline convergence.
- Tests validate the **current implementation's** concatenation; if Paymob’s published field list differs, the
  implementation (and therefore the tests) would be wrong together — only Sandbox/P5-04 can confirm that.

## 5P. P5-03 — gateway failure/retry/idempotency and payment-route authorization tests (2026-10-27)

### 5P.1 Scope and method

Unit tests only, with mocked gateway/repository/Redis and the real route middleware. No provider call, no DB
access, no production change. Code paths traced: `PaymentService.chargeByGateway`, `confirmPayment`,
`_processPaymentOutcome`, `handleWebhook` replay branch, `payment.routes.ts` guards, and the gateway factory.

### 5P.2 Tests added — 52 (3 files)

| File | Tests | Coverage |
|---|---:|---|
| `backend/src/modules/payment/__tests__/gateway-failure-idempotency.spec.ts` | **11** | Explicit gateway failure (no local row); gateway throw/timeout (propagates, no row); gateway success + local insert failure (un-compensated charge, current behaviour); paid/pending idempotency-key short-circuits (no gateway); **B38 concurrency** (two same-key requests both reach the gateway before either insert; one local insert wins, the second `ER_DUP_ENTRY`); duplicate local insert after gateway charge; already-paid `confirmPayment` is idempotent with **no gateway status call**; missing payment throws; `_processPaymentOutcome` skips terminal state and a lost concurrent update with no events. |
| `backend/src/modules/payment/__tests__/webhook-replay-ordering.spec.ts` | **4** | **B39 characterization:** replay key is written **before** the payment lookup; a processing failure leaves the key so the gateway retry is answered `duplicate (replay protected)` without reprocessing; a pre-existing key returns duplicate; Redis unavailable skips dedupe and continues to the normal processing path (no key stored). |
| `backend/src/modules/payment/__tests__/payment-routes-authorization.spec.ts` | **37** | Real `authMiddleware` + `requirePermission` with injected test deps and stubbed controllers. **12 protected routes × 3** (unauthenticated → 401; authenticated without the route permission → 403; with it → 200) + webhook public (200). Permissions derived from `payment.routes.ts`: `financial.payment.charge`, `financial.payment.confirm`, `financial.payment.view`, `financial.wallet.view`, `financial.reconcile` (refund/sync/expire/recover/health/reconciliation/production-readiness). |

### 5P.3 B38 and B39 evidence (both remain OPEN)

- **B38 — reproduced at unit level, not fixed.** The concurrency test holds the mocked gateway behind a barrier,
  lets both requests pass `findByIdempotencyKey` with no existing row, then releases: **both** call
  `paymentGateway.charge`, and only the second `paymentRepository.create` is rejected by the simulated
  `uk_idempotency_key` unique constraint. This demonstrates the gateway-charge-before-persistence window and
  the time-based Paymob `special_reference` (`Date.now()`) that makes the two intentions distinct. A correct fix
  requires a reservation/pre-insert state (or provider-level idempotency guarantee), which would change the
  payment lifecycle; **not implemented**.
- **B39 — reproduced at unit level, not fixed.** A forced repository failure after the Redis `SET` leaves
  `webhook:processed:<id>`; the retry returns `duplicate` and never reaches the repository. Redis-down behaviour
  is also pinned (dedupe skipped, processing continues). A correct fix (mark-after-success, or `SET NX` +
  delete-on-failure) changes replay semantics and should be designed/reviewed separately; **not implemented**.
- **No production defect fix in P5-03.** No production file was changed; B38/B39 stay open with failing-first
  characterization tests.

### 5P.4 Results

| Command | Result |
|---|---|
| `npx vitest run src/modules/payment/__tests__/gateway-failure-idempotency.spec.ts src/modules/payment/__tests__/webhook-replay-ordering.spec.ts src/modules/payment/__tests__/payment-routes-authorization.spec.ts` | **52 / 52 PASS** |
| `npx vitest run src/modules/payment src/shared/services/gateway` | **155 / 155 PASS** (13 files) |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npm run lint:gate` | PASS — 711 files / 3,377 findings |

**Not run:** Paymob/Sandbox, real webhook delivery, DB-writing payment integration suites, container suites,
fresh-DB (B36). The B38/B39 tests prove the service-level control flow with mocks; they are **not** a live
provider reproduction.

### 5P.5 Limitations and next step

- **B38 (High, open):** no in-flight reservation; duplicate gateway charge possible under concurrent same-key
  requests; no compensating refund. Owner: P5-03 evidence → P5-08/payment hardening.
- **B39 (Medium, open):** replay key survives a failed processing, suppressing retries; Redis outage removes
  dedupe. Owner: P5-03 evidence → a dedicated payment-recovery design.
- **Still uncovered (matrix):** the 5-minute `sync_pending_payments` job (#42) and the full 60-second
  `confirmPayment` polling loop (#43); P5-03 covers confirmation **idempotency**, not the polling timer. Route
  tests cover guard wiring, not handler-level business authorization. Defer to P5-09/P5-10 or a later
  hardening pass.
- **B5** remains partially resolved; **B7/P5-04** blocked; **B36/B37/B40** unchanged.
- **Next task:** **P5-04 — Sandbox safety confirmation is BLOCKED** pending explicit approval; P5-05 depends on
  it. No later Phase 5 task should start until that approval is granted or the user explicitly authorizes
  skipping P5-04/P5-05.

## 8. Checklist - Phase 6 (3/10)

| ID | Task | Status | Evidence / notes |
|---|---|---|---|
| P6-01 | Inventory Playwright + safe suites | **DONE** | Playwright 1.60; configs at root and `e2e/`; 12 spec files / 26 tests; read-only candidates: `smoke/health.spec.ts`, `tournament/p0-public-readonly.spec.ts`. |
| P6-02 | Persist traceable scenario matrix | **DONE** | **`docs/release/E2E_SCENARIO_MATRIX.md`** (2026-10-28). Persisted a 33-row traceable matrix (role, setup, action, expected, cleanup, spec file:line, evidence class, status) mapped to P6-04…P6-09, derived from static inspection of the 12 existing specs (26 tests, count verified) and the plan. Classes: **R** read-only, **W** DB-writing, **X** gateway-dependent, **D** contains destructive SQL, **S** stale fixture. Findings: (1) `cancel-booking`, `public-match`, `notification-deeplink` use `bookingPayload` with `paymentMethod:'wallet'` (`e2e/data/courts.ts:108`) while wallet charging is disabled (`payment.service.ts:102–105`) → **blocked/stale**; (2) `payment-flow` uses fake card `4242…` and only works with MockGateway → Paymob path blocked by P5-05; (3) `tournament-venue-flow` runs `SET FOREIGN_KEY_CHECKS=0` + `DELETE` (`:38–40`) → **blocked** pending P7-02; (4) two Playwright configs (root `testDir: './e2e'` + webServer vs `e2e/` `testDir: './scenarios'` + projects) → run commands must name the config; (5) gaps: RBAC/session/org-isolation, marketplace/subscriptions/accounting/refund UI, reports/settlements, axe a11y, realtime/simultaneous booking. Execution gating: T1 read-only runnable; T2 DB-writing needs approval; T3 mock-only or deferred Sandbox; T4 blocked. **No test was executed and no result is claimed.** Wallet fixture fixed 2026-10-28 (see audit row) — B2 still blocked by a missing `PATCH /bookings/:id/confirm` endpoint. |
| P6-03 | Confirm approved test-DB target + safety gates | **DONE** | `connect()` target assertion + explicit destructive-cleanup authorization; 14/14 guard tests. |
| P6-04 | Auth/session/role/permission scenarios | TODO | — |
| P6-05 | Clubs/courts/bookings/cancellations | TODO | — |
| P6-06 | Marketplace/payments/subscriptions/accounting | TODO | — |
| P6-07 | Notifications/reports/settlements/admin | TODO | — |
| P6-08 | Responsive + accessibility checks | TODO | No axe tooling yet. |
| P6-09 | Realtime + simultaneous booking | TODO | — |
| P6-10 | Fixes + regression reruns recorded | TODO | — |

**Phase 6 acceptance:** **NOT MET.** The traceable matrix is persisted (`docs/release/E2E_SCENARIO_MATRIX.md`,
P6-02) and the DB target/safety gates are in place (P6-03), but **no scenario has been executed**, so there are no
results, failure evidence, fixes or regression reruns. T1 read-only rows are executable next; T2 rows need DB-write
approval; T3 rows are mock-only or blocked by **P5-05**; T4 rows are blocked by a stale wallet fixture
(`e2e/data/courts.ts:108`) or destructive SQL (`tournament-venue-flow.spec.ts:38–40`).

## 9. Checklist — Phase 7 (1/10)

| ID | Task | Status | Evidence / notes |
|---|---|---|---|
| P7-01 | Ensure integration tests target the approved DB | **DONE** | `vitest.integration.setup.ts` asserts `courtzon_v3`/loopback/3307 at startup; negative checks refused `courtzon_v2`, port 3306, remote host before any connection. |
| P7-02 | Repair unsafe test scripts/cleanup | TODO | FK-off TRUNCATE helper; no E2E teardown; `e2e-validation.mjs` partial cleanup. Also owns the time-dependent test fixtures listed below. |
| P7-03 | Fix validator false positives + tests | **IN_PROGRESS** | Layer Architecture fixed (`scripts/architecture/validate-layering.js`, 8 regression tests). EventBus (26) and Notification (5) warnings remain heuristic false positives. |
| P7-04 | Secret scanning must be able to fail | TODO | `trufflehog … || true` in `.github/workflows/security-scan.yml`. |
| P7-05 | Dependency/container scans must fail | TODO | `npm audit --audit-level=high` only; Trivy v0.50.1; Snyk conditional. |
| P7-06 | Webhook/upload/header/CORS/brute-force/rate-limit tests | TODO | None exist for these controls. |
| P7-07 | E2E smoke in CI | TODO | No workflow runs Playwright. |
| P7-08 | Coverage baseline + ratchet | TODO | Thresholds are 3 %; `test:coverage` not in CI. |
| P7-09 | Verify CI checks actually execute | TODO | ESLint never runs; “Lint” = tsc only. |
| P7-10 | Phase evidence package | TODO | — |

**Phase 7 sub-item (denominator unchanged):** replace time-dependent fixtures in the
membership/subscription tests (B8) with fixed/relative dates before CI can be trusted.

**Phase 7 acceptance:** not met.

## 10. Checklist — Phase 8 (1/10)

| ID | Task | Status | Evidence / notes |
|---|---|---|---|
| P8-01 | Measure bundle/loading | **DONE** | Main `index-CsUjtNSV.js` 1,287.8 KB (1.32 MB raw / 311.3 KB gzip); CSS 98.4 KB; largest lazy chunk 168.2 KB. |
| P8-02 | Bundle reduction/code splitting | TODO | No `manualChunks`. |
| P8-03 | Query performance review | TODO | — |
| P8-04 | Background jobs/realtime review | TODO | — |
| P8-05 | Production logging/PII review | TODO | 41 `console.log` in production source; ErrorBoundary telemetry unwired. |
| P8-06 | Accessibility audit | TODO | No axe/automated a11y tooling. |
| P8-07 | Responsive review | TODO | — |
| P8-08 | Error/loading/empty states review | TODO | — |
| P8-09 | Technical-debt register | TODO | — |
| P8-10 | Re-measure improvements | TODO | — |

**Phase 8 acceptance:** not met.

## 11. Checklist — Phase 9 (0/10) — gated

| ID | Task | Status | Evidence / notes |
|---|---|---|---|
| P9-01 | Gate: all prior phases accepted | TODO | Blocked until Phases 1–8 acceptance is recorded. |
| P9-02 | Rebuild required backend/frontend images | TODO | Requires authorization; no Docker lifecycle now. |
| P9-03 | Recreate local containers | TODO | — |
| P9-04 | Verify health/logs/DB/Redis/services | TODO | — |
| P9-05 | Run critical smoke/regression on Docker build | TODO | — |
| P9-06 | Confirm payment config cannot use live gateway | TODO | — |
| P9-07 | Verify persistent volumes/data intact | TODO | — |
| P9-08 | Run post-build E2E smoke | TODO | — |
| P9-09 | Rehearse rollback (image + database) | TODO | — |
| P9-10 | Produce phase evidence package | TODO | — |

**Phase 9 acceptance:** not met; no Docker action permitted yet.

## 12. Checklist — Phase 10 (0/10) — gated

| ID | Task | Status | Evidence / notes |
|---|---|---|---|
| P10-01 | Review final diffs/secrets/generated artifacts | TODO | — |
| P10-02 | Ensure Git history/commits are clear and auditable | TODO | — |
| P10-03 | Run final build/type-check/lint/architecture gates | TODO | — |
| P10-04 | Run final security scan gates | TODO | — |
| P10-05 | Run final E2E acceptance gates | TODO | — |
| P10-06 | Sign off the dependency audit | TODO | — |
| P10-07 | Produce release notes/limitations/risk register | TODO | — |
| P10-08 | Obtain explicit user authorization to push | TODO | — |
| P10-09 | Push to GitHub only after authorization | TODO | — |
| P10-10 | Produce final release-readiness report | TODO | — |

**Phase 10 acceptance:** not met; no push/deploy permitted.

## 13. Test / verification status (actual evidence)

| Category | Passed / run | Status |
|---|---|---|
| Focused backend unit tests (RBAC publication 16 + rating 6 + brand-image 8) | 38 / 38 | PASS (executed earlier 2026-10-26) |
| E2E cleanup/target guard (P1-07/P1-09) | 14 / 14 | PASS (`npx vitest run src/tests/e2e-cleanup-guard.spec.ts`) |
| Backend compatibility review (P2-03) | 7 packages + 1 supporting | NOT A TEST: `npm view` registry checks, lockfile/manifests, code usage; no runtime proof |
| Integration setup target guard (P7-01) | 3 / 3 negative checks + 1 positive | PASS (no DB connection; wrong DB/port/host refused) |
| Architecture validator | 0 errors, 31 warnings (26 EventBus + 5 Notification) | PASS (errors), warnings open |
| Backend build (`npm run build`) | 1 / 1 | PASS (re-executed for P2-05) |
| Stage A focused unit tests (P2-04) | 63 / 63 | PASS (7 files: auth routes/DTO, payment, booking, RBAC, cleanup guard) |
| Stage A integration (P2-05) | 40 / 40 | PASS — 4 files: payment, payment-reference-id, upload RBAC, coach-profile (Fastify/Zod/mysql2/find-my-way) |
| Stage A focused unit (P2-05) | 70 / 70 | PASS (includes new cleanup/helper tests) |
| Stage B build (P2-04) | 1 / 1 | PASS (`npm run build`, `tsc` clean) |
| Stage B plugin compatibility + auth routes (P2-04) | 15 / 15 | PASS (`fastify-plugin-compat.spec.ts` + `auth-route-rate-limit.spec.ts`): `/uploads` 200/nested/404/traversal×4, `decorateReply:false`, `/docs` 200, OpenAPI 3, production docs gate |
| Stage B focused regression set (P2-04) | 77 / 77 | PASS (10 files, re-run after install: plugin compat, cleanup guards, auth routes/DTO, payment, booking, RBAC) |
| Stage B integration regressions (P2-04) | 24 / 24 | PASS (upload RBAC + coach-profile; scoped cleanup, zero residue) |
| Stage C build + mailer tests (P2-04) | build PASS; **10 / 10** | PASS — SMTP success/defaults/overrides, transport error propagation, default log path (no import/send), real `import('nodemailer')` + `jsonTransport`; no DB/network |
| Stage C regression set (P2-04) | 36 / 36 | PASS (6 files: mailer ×2, notification dispatch/contract, plugin compat, auth rate-limit) |
| Stage D build + sharp/brand-image tests (P2-04) | build PASS; **18 / 18** | PASS (`sharp-processor.spec.ts` 10, `brand-image.spec.ts` 8): lossless WebP alpha preservation, opaque PNG output, brand favicon spec through `SharpProcessor` |
| Stage D upload RBAC integration (P2-04/P2-05) | 15 / 15 | PASS (scoped cleanup, zero residue, reused period `#12245`) |
| Stage A timeout pair (P2-05) | 36 / 36 | PASS (individually and together) |
| Stage A date-sensitive files (P2-05) | 22 / 28 | 6 deterministic failures (expired fixtures); not upgrade-related |
| Full backend unit suite (P2-04) | 3705 / 3713 | 8 failures: 6 date-expired fixtures (pre-existing) + 2 timeouts that PASS in isolation |
| Frontend type-check (`tsc -p tsconfig.app.json --noEmit`) | 1 / 1 | PASS |
| Frontend ESLint | 3,493 findings (3,408 errors, 85 warnings) | FAIL (not gating CI) |
| Integration tests | 40 run (Stage A set) + 24 rerun (Stage B set) | **PASS**; remaining 32 container-based suites BLOCKED by no-container rule; other persistent suites not exercised |
| E2E / browser tests | 0 run | NOT RUN |
| Dependency audit (after Stage D) | backend prod **6** (5 high, 1 moderate, 0 low); backend full **20** (13 high, 6 moderate, 1 low) | OPEN — `@fastify/static`, `@fastify/swagger-ui`, `nodemailer`, `sharp` **cleared**; no direct vulnerable production target remains |
| Frontend compatibility review (P2-06) | 6 upgrade targets + 1 classification | NOT A TEST: `npm ls`/`npm explain`/`npm view`/changelog + import and `dist` artifact inspection; **no install performed** |
| Dependency audit (frontend, baseline for P2-07) | prod **46** (15 high, 29 moderate, 2 low); full **50** (16 high, 32 moderate, 2 low) | OPEN — 29 entries are the unused `@tiptap/*`+`prosemirror-view` subtree; 6 are the PWA→Vite prod-tree inflation |
| Frontend build after upgrades (P2-07) | 1 / 1 | **PASS** — `tsc -b` + `vite 8.3.5` build + `inject-push-sw.js`, built in 8.66 s; PWA `generateSW` 651 precache entries |
| `services/api.ts` contract tests (P2-07) | **11 / 11** | **PASS** — request interceptor (content type + fingerprint), FormData multipart, blob passthrough, single-flight refresh, session-expiry logout, non-401 propagation |
| Full frontend suite (P2-07) | **1347 / 1356** then **1346 / 1356** | 9–10 failures: 7 deterministic nav-parity source drift, 1 date-expired fixture (`endDate 2026-09-22`), 1–2 load timeouts in the 46-test tournament wizard (46/46 PASS in isolation) |
| Frontend artifacts (P2-07) | main **782.97 kB / 223.43 kB gzip**; CSS **98.4 KB byte-identical**; `sw.js` 44.7 KB; `workbox-5b3f2944.js` 22.6 KB; `manifest.webmanifest` 1,408 B; 340 JS chunks | **PASS** — tiptap/ProseMirror absent; notification SW handlers injected |
| Dependency audit (after P2-07) | frontend prod **2** (2 high, 0 moderate, 0 low); frontend full **12** (6 high, 4 moderate, 2 low) | OPEN — `follow-redirects@1.16.0` (not in browser bundle) and `socket.io-parser@4.2.6`; both fixable in-range via `npm update` |
| Navigation parity after reconciliation (P2-08) | **98 / 98** | PASS — legacy org fixture gained the Membership section, legacy player fixture gained My Memberships; strict deep-equality and id-map assertions retained with authoritative counts |
| `OrgSubscriptionPage` date fixture (P2-08) | **10 / 10** | PASS — `startDate`/`endDate` now `localDateOffset(-30/+30)`; production "Expired:" logic untouched |
| `TournamentCreatePage` wizard (P2-08) | **46 / 46** | PASS in isolation; `walkTo()` no longer overshoots to Review and back, cutting ~2–5 step transitions per call (no timeout change) |
| `tsc -b` after test changes (P2-08) | 1 / 1 | PASS |
| Full frontend suite (P2-08, after fixes) | **1356 / 1356** (134/134 files) — two consecutive runs | **PASS** (96.96 s and 97.19 s) |
| P2-10 in-range transitive updates | `follow-redirects` 1.16.0→**1.16.2**; `socket.io-parser` 4.2.6→**4.2.7** | PASS — both satisfy parent ranges (`^1.16.0`, `~4.2.4`); single copy each; `npm ls --depth=0` exit 0; no invalid peers |
| Frontend focused after update (P2-10) | **103 / 103** (6 files: api + realtime/socket stores) | PASS |
| Frontend full suite after update (P2-10) | **1356 / 1356** (134/134 files) | PASS (98.15 s) |
| Backend build (P2-10) | 1 / 1 | PASS (`tsc` clean) |
| Backend focused realtime/notification (P2-10) | **20 / 20** (4 files) | PASS |
| Audit — frontend (P2-10) | prod **0**; full **10** (4 high, 4 moderate, 2 low) | Production **clean**; remainder is dev/build-only |
| Audit — backend (P2-10) | prod **6** (5 high, 1 moderate); full **20** (13 high, 6 moderate, 1 low) | Unchanged; all six prod entries have in-range non-breaking fixes (B13) |
| Audit — root (P2-10) | prod 0 / full 0 | PASS |
| Audit composite (de-duplicated) | prod **6** packages / **23** advisories; full **25** unique packages (5 shared) / **79** package+GHSA pairs (78 GHSA) | Reconciled — no double counting across trees |
| `OrgAccountingRecordsPage` focused (P3-02) | **16 / 16** | PASS — 14 existing + 2 new hook-order regression tests |
| Accounting-page regression set (P3-02) | **47 / 47** (7 files) | PASS — accounting records/periods/financial position/finance/reports + accounting components |
| `tsc -b` after P3-02 | 1 / 1 | PASS (exit 0) |
| Full frontend suite after P3-02 | **1358 / 1358** (134/134 files) | PASS (93.67 s) |
| Hook-order regression proof (P3-02) | 2 tests fail on the pre-fix code (0 hook calls on the denied path) and pass after | Evidence captured by temporarily restoring the early return |
| P3-03 focused regression set | **51 / 51** (8 files) | PASS — 5 finance/accounting pages, Messages, BookingSettlement (7), UnifiedSettlementList (3), plus settlement create/detail + ledger/accounting component suites |
| P3-03 regression proof | restored gates fail: 0 query-hook calls (AccountingDashboard, UnifiedSettlementList) and **16 vs 18** mutation hooks (MessagesPage) | Verified, then reverted to the fixed code |
| `tsc -b` after P3-03 | 1 / 1 | PASS (exit 0) |
| Full frontend suite after P3-03 | **1367 / 1367** (136/136 files) | PASS (91.22 s) |
| `react-hooks/rules-of-hooks` repo scan after P3-03 | **25** findings, **all** in `src/realtime/useRealtimeCacheUpdates.ts` | Page-level gates cleared; remaining 25 = P3-04 |
| P3-04 realtime focused suite | **84 / 84** (4 files) | PASS — existing hub/G11.10/handler suites + new `useSocketEvents.test.tsx` (8) |
| P3-04 `rules-of-hooks` scan | **0** findings repo-wide (was 25) | PASS — no suppression, no config change |
| `tsc -b` after P3-04 | 1 / 1 | PASS (exit 0) |
| Full frontend suite after P3-04 | **1375 / 1375** (137/137 files) | PASS (103.02 s) |
| P3-05 route-guard regression suite | **18 / 18** (`src/permissions/routeGuards.test.tsx`) | PASS — unauthenticated → login; `dashboard.view` allow; `platform.admin` fallback allow; wildcard allow; legacy role strings **denied**; permission without role string **allowed**; revocation while mounted; `/notifications` + `/org` stay reachable; no `/app`↔`/admin` loop |
| P3-05 focused set (guards + full-App redirects) | **30 / 30** (4 files) | PASS — includes `AdminTournamentsRedirect.spec.tsx` (full `<App/>`) and `OrgJournalRedirect.test.tsx` |
| `tsc -b` after P3-05 | 1 / 1 | PASS (exit 0) |
| `react-hooks/rules-of-hooks` after P3-05 | **0** repo-wide | PASS (unchanged) |
| Full frontend suite after P3-05 | **1393 / 1393** (138/138 files) | PASS (91.67 s) |
| P3-06 ESLint baseline (re-measured) | total **3,437** — `set-state-in-effect` **57**, `refs` **37**, `purity` **10**, `static-components` **8**, `exhaustive-deps` **29**, `rules-of-hooks` **0** | Captured from `npx eslint src --format json` (not inferred from earlier notes) |
| P3-06 ESLint after remediation | total **3,377** — `set-state-in-effect` **54**, `refs` **0**, `purity` **3**, `static-components` **0**, `exhaustive-deps` **26**, `rules-of-hooks` **0** | PASS — **−60** findings; no rule disabled/suppressed; only remaining `purity` = `Date.now()` display in subscription screens (B17) |
| P3-06 `InstallPrompt` regression | **5 / 5** | PASS — hidden before install event, shown on landing path, hidden on dismiss/complete, not shown off-landing |
| P3-06 focused set (changed components) | **57 / 57** (9 files) | PASS — InstallPrompt, CommandPalette, UnifiedSettlementCreate, LoginSplash, CartPage, BookingModal, AcademyPaymentPanel, OrgSubscriptionPage, finance hook-order |
| `tsc -b` after P3-06 | 1 / 1 | PASS (exit 0) |
| Full frontend suite after P3-06 | **1398 / 1398** (139/139 files) | PASS (99.31 s) |
| P3-07 configured ESLint baseline (`npx eslint .`) | **3,377** findings (3,295 errors, 82 warnings) / **706** files | Exit 1 (unchanged `npm run lint`); 3 warnings are pre-existing unused directives |
| P3-07 baseline gate (`npm run lint:gate`) | 706 files / 3,377 findings, 0 differences | **PASS** (exit 0) |
| P3-07 gate self-test (`npm run lint:gate:selftest`) | **6 / 6** scenarios | PASS — unchanged pass; existing-file violation fail; new-file violation fail; new clean file pass; removed/ignored file fail; new `eslint-disable` fail |
| `tsc -b` after P3-07 | 1 / 1 | PASS (exit 0) |
| Full frontend suite after P3-07 | **1398 / 1398** (139/139 files) | PASS (91.02 s) |
| P3-08 type-check baseline | FE app **0**, FE node **0**, BE **0** (all exit 0) | PASS — TS **6.0.3** / Node **22.14.0** |
| P3-08 CI type-check gap | FE `npx tsc --noEmit` exit 0 but `--listFilesOnly` = **0 files** | **GAP** — root config is references-only; `tsc -b` (build) checks both projects, 0 errors (B19) |
| P3-08 strict-default proof | Temp probe outside repo: default `tsc` → TS2322 (null) + TS7006 (implicit any); `--strict false` → 0; project `--strict` → +0 errors | PASS — probe removed; strict is already effective (B20) |
| P3-08 flag measurements | FE/BE: `noUncheckedIndexedAccess` 304/764; `exactOptionalPropertyTypes` 140/761; `noPropertyAccessFromIndexSignature` 332/2,234; `noImplicitOverride` 3/0; `noImplicitReturns` 1/1; `noUnusedLocals` —/196; `noUnusedParameters` —/105; `allowUnreachableCode=false` 0/1; `allowUnusedLabels=false` 0/0 | Measured individually; all error runs exit 2, zero-error runs exit 0 |
| P3-08 combined bundles | FE big **455** (205 tests / 250 src); BE big **1,528**; FE Stage-1 **4**; BE Stage-1 **2**; BE unused **301** | PASS — counts used for staged plan |
| P3-08 residual static checks | `allowUnusedLabels=false` **0 / 0**; `skipLibCheck=false` **7 / 0**; explicit `any` **3,163** (**2,594** src / **569** tests) | **PARTIAL** — the 7 frontend `skipLibCheck:false` errors are `@dnd-kit/*` `.d.ts` TS2503 (dependency drift under React 19), not project code; explicit `any` is not detectable by any `tsc` flag (B21) |
| P3-08 independent re-verification (post-interruption) | Re-ran every baseline and per-flag command; reproduced the recorded counts exactly (baselines 0/0/0; 304/764, 140/761, 332/2,234, 3/0, 1/1, 0/1, 196/105, 455/1,528, 4/2, 301) | PASS — carried-forward record confirmed; no discrepancy, no correction required |
| P3-07 gate re-check after P3-08 | 706 files / 3,377 findings, 0 differences | PASS (exit 0) — gate intact |
| P3-09 mapped regression set (targeted) | **65 / 65** (9 files) | PASS — 8 P3-02…P3-06 files + new `ProductCardImage.test.tsx` |
| P3-09 pre-fix mutation proofs | 7 mutation runs → **11 defects detected** (+ gate self-test = **12 / 17**): org 2, finance 5, Messages 2, Booking 1, Unified 1, guard 7, image 1 failures as expected | PASS — files restored byte-exactly (SHA-256), `P3-09-PREFIX` scan = 0 |
| P3-09 new regression test | `ProductCardImage.test.tsx` **1 / 1** now; **1 / 0** on the pre-fix `Date.now()` line | PASS — added for a previously untested P3-06 fix |
| P3-09 `tsc -b --force` | 1 / 1 | PASS (exit 0) |
| P3-09 `npm run lint:gate` | 707 files / 3,377 findings | PASS — new test file lint-clean, baseline **not** modified |
| P3-09 `npm run lint:gate:selftest` | **6 / 6** scenarios | PASS |
| P3-09 full frontend suite | **1399 / 1399** (140/140 files) | PASS (103.15 s) |
| P3-09 realtime `rules-of-hooks` (P3-04 evidence) | **0** (`no-explicit-any` 84, `exhaustive-deps` 2 remain) | PASS — unchanged from P3-04 |
| P3-10 focused access-path suites | **108 / 108** (14 files) | PASS — org accounting 16, finance hook-order 5, settlements 7/3/14/13, Messages 2, route guards 18, AdminLayout 5, Navbar 5, payment polling 2, wiring 3, InstallPrompt 5, OrgSubscription 10 |
| P3-10 card-payment poller regression | pre-fix **1 failed / 0 passed** (`Unable to find [data-testid="payment-poller"]`); post-fix **2 / 2** | **FOUND + FIXED** — affects subscription + both registrations |
| P3-10 Navbar mirror pre-fix proof | legacy role-string mutation: **3 failed / 2 passed**, file restored (SHA-256) | PASS — permission-driven visibility proven |
| P3-10 `tsc -b --force` | 1 / 1 | PASS (exit 0) |
| P3-10 `npm run lint:gate` | 711 files / 3,377 findings | PASS — 4 new test files lint-clean, baseline **not** modified |
| P3-10 `npm run lint:gate:selftest` | **6 / 6** scenarios | PASS |
| P3-10 full frontend suite | **1414 / 1414** (144/144 files) | PASS (94.43 s) |
| P3-10 static invariants (P3-04/P3-06) | `rules-of-hooks` **0**, `refs` **0**, `static-components` **0**, `purity` **3**, `set-state-in-effect` **54** | PASS — refreshed via `npx eslint . --format json` |
| P4-01 test inventory (`npx vitest list`) | **3,740** unit test entries; **308** unit spec files; **163** integration spec files | PASS (discovery only; integration excluded by default config) |
| P4-01 messaging coverage probe | `npx vitest run src/modules/community` → **"No test files found"** (exit 1) | GAP — REST authorization untested (B25) |
| P4-01 negative-coverage probes | HMAC forged-signature tests **0**; brute-force/lockout tests **0**; notification failover/DLQ refs **0** | GAP — confirmed (B5, B27) |
| P4-01 permission mapping probe | `requirePermission` **777** call sites; B24 route/page/nav table (10 routes) | Evidence recorded; no permission changed |
| P4-02 authoritative grant audit (read-only) | Docker `courtzon_v3` (127.0.0.1:3307): 26 role slugs; SELECT-only queries for 19 permission keys | PASS — grants recorded in §5E.4; no schema/data change |
| P4-02 marketplace order IDOR | pre-fix **2 failed** (unrelated user received the order); post-fix **4/4** | **FOUND + FIXED** — buyer-only fallback |
| P4-02 logout all-devices | pre-fix **1 failed** (`revokeAllForUser` not called); post-fix **2/2** | **FOUND + FIXED** — owner resolved from refresh session |
| P4-02 B24 page-gate alignment | reverting the FinanceDashboard gate → **1 failed** (FinanceDashboardPage); current **5/5** | **FIXED** blank-page class; 5 page gates aligned; no DB grant changed |
| P4-02 B25 messaging authorization | **15/15** new tests; removing the participant check → **1 failed / 14 passed** | **B25 CLOSED** |
| P4-02 focused backend suites | **364 / 364** (35 files: auth, rbac, community, marketplace) | PASS |
| P4-02 backend type-check | `npx tsc -p tsconfig.json --noEmit` → exit 0 | PASS |
| P4-02 frontend `tsc -b --force` | exit 0 | PASS |
| P4-02 `npm run lint:gate` | 711 files / 3,377 findings | PASS (baseline untouched) |
| P4-02 full frontend suite | **1414 / 1414** (144/144 files) | PASS (94.35 s) |
| P4-02 proxy-contract spec | **2 failed** (`/demo`, `/protected`, `/broken` from frontend test fixtures) | **PRE-EXISTING** (B28); not caused by P4-02 |
| P4-03 Redis lock primitive | **13 / 13** (`redis-lock.spec.ts`) | PASS — key isolation, 15 s / 10 min TTL, prepare refresh, compare-and-delete, partial rollback, budget exhaustion |
| P4-03 lock-ownership wiring | **3 / 3** (pre-fix mutation: **1 failed / 2 passed**, SHA-256 restore) | PASS — all production owners use `createLockOwner(...)` |
| P4-03 booking + scheduling unit | **336 / 336** (25 files) | PASS |
| P4-03 real concurrency integration (persistent DB + Redis) | **16 / 16** (2 files: service + repository) | PASS — identical/partial-overlap/adjacent/duplicate/terminal-rebooking under `Promise.all` |
| P4-03 backend type-check | `npx tsc -p tsconfig.json --noEmit` | PASS (exit 0) |
| P4-03 DB index verification (read-only) | `SHOW INDEX` on `bookings`, `booking_slots` | `bookings`: series-occurrence unique only; `booking_slots`: non-unique — matches migration 140 |
| P4-04 checkout inventory/eligibility suite | **9 / 9** (`checkout-inventory-integrity.spec.ts`) | PASS — B26 ×5, gateway failure, no-URL, decrement rollback, duplicate failure event |
| P4-04 pre-fix mutation proofs | 3 mutations, each **1 failed / 8 passed** | PASS — double restore, over-restore, duplicate-event restore; SHA-256 restored |
| P4-04 real stock concurrency | **3 / 3** (`marketplace-stock-concurrency.integration.spec.ts`, running MySQL) | 10 parallel decrements vs qty 5 → 5 succeed, stock 0; qty 3 with 2-unit decrements → 1 wins; parallel restores additive |
| P4-04 marketplace unit suite | **218 / 218** (21 files) | PASS |
| P4-04 backend type-check | `npx tsc -p tsconfig.json --noEmit` | PASS (exit 0) |
| P4-05 notification failover/DLQ/replay/digest suites | **21 / 21** (4 files) | PASS — preferences/failover 6, DLQ 5, replay 7, digest 3 |
| P4-05 pre-fix mutation proofs | 6 mutations, each detected (1–2 failures) | PASS — sources restored byte-exactly (SHA-256) |
| P4-05 notifications module suite | **222 / 222** (28 files) | PASS |
| P4-05 subscription/membership suites | **126 / 129** | 3 failures are **pre-existing date-expired fixtures** (B8); not caused by P4-05 |
| P4-05 backend type-check | `npx tsc -p tsconfig.json --noEmit` | PASS (exit 0) |
| P4-06 transaction-hook isolation suite | **6 / 6** (`src/tests/database.transaction.spec.ts`) | PASS — cross-transaction flush, rollback discard, post-commit ordering, ALS flag, provided-conn path, outside-tx immediacy |
| P4-06 pre-fix file swap | old `database.transaction.ts` → **2 failed / 4 passed**; restored byte-exactly (SHA-256) | PASS — phantom-event + never-flushed defects reproduced |
| P4-06 focused shared/realtime suites | **284 / 284** (22 files) | PASS |
| P4-06 backend type-check | `npx tsc -p tsconfig.json --noEmit` | PASS (exit 0) |
| P4-07 accounting invariant suite | **25 / 25** (`accounting-ledger-invariants.spec.ts`) | PASS — domain lines, balance predicate (missing/duplicated leg), engine merge/org split, zero/negative/unknown/missing-mapping rejections, 13 concept inversions |
| P4-07 posting idempotency suite | **6 / 6** (`accounting-posting-idempotency.spec.ts`) | PASS — `true`/`false` contract, no-transaction skip, `ER_DUP_ENTRY` rollback, retry after hard failure, duplicate refund advances recovery once |
| P4-07 pre-fix recovery-gating mutation | guards → `if (true)` → **1 failed / 5 passed** (4 updates vs 2); source restored byte-exactly (SHA-256 `62c2c417…`) | PASS — B34 defect reproduced |
| P4-07 DB mapping integrity (read-only) | **31 / 31** (`accounting-mapping-integrity.integration.spec.ts`, running `courtzon_v3`:3307) | PASS — 13 chart-account inversions, settled refund pays 1120, gateway 1100→1120+5210, settlement 2202/1120, correction 1120/2200, active COA rows, `uk_dedup` unique columns |
| P4-07 focused financial suites | **404 / 404** (42 files; `src/modules/financial`, `src/modules/accounting`, `src/modules/settlement`) | PASS |
| P4-07 booking refund/recovery integration | **27 / 27** (3 files, running MySQL) | PASS |
| P4-07 backend type-check | `npx tsc -p tsconfig.json --noEmit` | PASS (exit 0) |
| P4-08 GL period-lock/boundary suite | **9 / 9** (`gl-period-lock.spec.ts`) | PASS — org authoritative even when closed, closed rejection, platform fallback, platform scope, missing period, closed fallback, `validateOpenPeriod`, org isolation |
| P4-08 booking refund boundary suite | **9 / 9** (`booking-refund-boundaries.spec.ts`) | PASS — over-refund clamp, zero refund, 2-dp proration, null cases, capacity splits, exhausted capacity, recovered > settled |
| P4-08 B35 characterization | **3** (posting identity), **2** (recovery offset) | PASS — limitations pinned, no production change |
| P4-08 focused financial/booking suites | **729 / 729** (65 files) | PASS |
| P4-08 marketplace/payment/notifications suites | **478 / 478** (56 files) | PASS |
| P4-08 backend type-check | `npx tsc -p tsconfig.json --noEmit` | PASS (exit 0) |
| P4-09 baseline ↔ live schema diff (read-only) | **0** baseline tables/columns missing live; **45** live columns + `payment_allocations` absent from baseline | FINDINGS — S-01 baseline stale vs migrations 149/158–161/177/193 |
| P4-09 static schema audit | 210 migrations / 209 `CREATE TABLE` / 314 column adds / 6 later-dropped tables / 8 seeds / 735 TS files | 0 runtime DDL; 0 invented reachable table refs; 4 endpoints + 2 dead-code column/table mismatches |
| P4-09 migration history integrity | 211 rows (baseline + 210), 0 duplicate filenames, 0 pending, 1 applied-but-missing file (`103b`), 179/210 hash mismatches, 201/211 modified after apply | PARTIAL — live schema verified; chain-to-repo byte equality unproven (needs Phase 9 rebuild) |
| P4-09 schema/migration unit suites | **68 / 68** (6 files: migration guard, baseline integrity, control-account direction, accounting mapping, period lock) | PASS |
| P4-09 read-only mapping integration | **31 / 31** (`accounting-mapping-integrity.integration.spec.ts`) | PASS |
| P4-09 backend type-check | `npx tsc -p tsconfig.json --noEmit` | PASS (exit 0) |
| P4-10 evidence reconciliation | Doc-invariant checks: Phase totals **10+10+10+10+0+2+1+1+0+0 = 44/100**; 10/10 Phase 4 rows DONE; 36-row matrix; all preserved risk IDs present; one count mismatch found (D-1) and re-measured | PASS (with D-1/D-2 disclosed) |
| P4-10 read-only reconciliation re-run | `npx vitest run src/modules/booking src/modules/scheduling` → **336 / 336** (25 files) | PASS — confirms §17E/§13 record, not the §6 typo (D-1) |
| P5-01 payment lifecycle mapping | 12 flows traced (booking card/prepare/cash, recurring, marketplace, org subscription, membership, academy, tournament, wallet top-up, refunds, settlement/reconciliation); schema read-only (`payment_transactions` 24 cols / 10 indexes) | COMPLETE — map + 45-row matrix in §5N |
| P5-01 payment unit suite | `npx vitest run src/modules/payment` → **38 / 38** (7 files, no DB writes) | PASS |
| P5-01 external/integration evidence | Sandbox, DB-writing payment integration suites, container suites, fresh-DB (B36) | **NOT RUN** |
| P5-02 HMAC unit suite | `paymob-webhook-hmac.spec.ts` → **55 / 55** | PASS — 2 valid shapes, 20 Intention + 23 Accept field mutations, null/absent fields, unsigned-field tolerance, invalid/empty/truncated/over-long/non-hex/uppercase/whitespace, null/undefined, missing/empty secret, no secret logging |
| P5-02 service/controller signature handling | `webhook-signature-handling.spec.ts` 3 + `payment-webhook-controller.spec.ts` 7 → **10 / 10** | PASS — invalid signature 401, no repo read, no payment events, no success audit; query/header extraction; 400/500 mapping |
| P5-02 pre-fix defect | first run: **1 failed** (`TypeError … reading 'slice'`, `paymob-gateway.ts:387`) | FIXED — B41; exact-equality semantics preserved |
| P5-02 combined payment/gateway suites | **103 / 103** (10 files) | PASS |
| P5-02 backend type-check | `npx tsc -p tsconfig.json --noEmit` | PASS (exit 0) |
| P5-03 gateway failure/idempotency suite | `gateway-failure-idempotency.spec.ts` → **11 / 11** | PASS — failure/timeout, paid/pending idempotency, duplicate insert, confirm idempotency, final/race state; **B38 reproduced** (2 gateway calls for 1 key) |
| P5-03 webhook replay suite | `webhook-replay-ordering.spec.ts` → **4 / 4** | PASS — SET-before-processing ordering, failed-then-retry dropped, duplicate key, Redis-down continues; **B39 reproduced** |
| P5-03 payment route authorization | `payment-routes-authorization.spec.ts` → **37 / 37** | PASS — 12 protected routes × 401/403/200 + public webhook; permissions from `payment.routes.ts` |
| P5-03 combined payment/gateway suites | **155 / 155** (13 files) | PASS |
| P5-03 backend type-check | `npx tsc -p tsconfig.json --noEmit` | PASS (exit 0) |
| CI workflows | not executed locally | NOT VERIFIED |

**Security findings (reconciled 2026-10-26):** no vulnerable **production** package remains in the
frontend (**2 → 0**); backend production has **6** transitive packages (**23** advisories) — all with
in-range, non-breaking fixes recorded as B13. Frontend full audit is **10** dev/build-only packages
(B14). Whole-workspace de-duplicated totals: **25** unique vulnerable packages, **79** package+GHSA
pairs (78 unique GHSA), and **23** production advisories in **6** packages. The previous "32 = 20 + 12"
figure double-counted 5 shared packages and is superseded. Fixed in this plan: fastify/zod/mysql2/
find-my-way (Stage A), `@fastify/static`/`@fastify/swagger-ui` (Stage B), `nodemailer` (Stage C),
`sharp` (Stage D), frontend axios/zod/react-router-dom/postcss/vite/`@tiptap/*` + PWA production-tree
inflation (P2-07), and `follow-redirects`/`socket.io-parser` (P2-10). Accepted risk: AR-1, AR-2.

**UI/E2E scenarios:** passed 0 / failed 0 / blocked 0 executed / not run — the traceable matrix is now persisted
(`docs/release/E2E_SCENARIO_MATRIX.md`, P6-02) and the approved DB target/safety gates are in place (P6-03); no
scenario has been executed yet.

## 14. Blockers and accepted risks

| ID | Item | Classification | Phase |
|---|---|---|---|
| AR-1 | All E2E/integration tests write directly to `courtzon_v3` (user-approved). Data is disposable; full cleanup is deferred to the end of the campaign and requires explicit authorization. No separate DB/directory is permitted. | **ACCEPTED_RISK** (user decision) | 1, 6, 7 |
| AR-2 | Alpine/musl runtime proof for the upgraded native modules (`sharp`, `bcrypt`, `mysql2`) and Docker image verification are **deferred to Phase 9** — no container rebuild was authorized in Phase 2. No native-module evidence exists on Alpine yet. | **ACCEPTED_RISK (deferred)** | 2, 9 |
| B2 | **Reconciled in P2-10.** Per-scope `npm audit`: backend prod **6** (5 high, 1 moderate) / full **20** (13 high, 6 moderate, 1 low); frontend prod **0** / full **10** (4 high, 4 moderate, 2 low); root 0/0. De-duplicated across the two npm trees: production **6** unique packages / **23** advisories (no overlap); full **25** unique packages (5 shared: `@vitest/mocker`, `brace-expansion`, `fast-uri`, `undici`, `vitest`) / **79** package+GHSA pairs (**78** unique GHSA). The former "32 = 20 + 12" figure double-counted the shared packages and is superseded. | High | 2 |
| B3 | **RESOLVED (P3-02…P3-06).** All page-level conditional-hook gates removed, the 25 loop-bound `useSocketEvent` calls replaced by `useSocketEvents`, repo-wide `rules-of-hooks` **0**, and the remaining ref/purity/static-component defects remediated (`refs` **37→0**, `static-components` **8→0**, `purity` **10→3**). The remaining `set-state-in-effect` **54** + `purity` **3** are classified as intentional patterns (B17), not correctness violations. | Resolved | 3 |
| B4 | **Partially resolved (P3-07).** Frontend ESLint now has a real CI gate (`npm run lint:gate` in `.github/workflows/lint.yml`) that fails on new findings, coverage loss, and new suppressions. Secret scanning (`trufflehog … || true`) and audit severity gates remain ineffective — Phase 7 (P7-04/P7-05). | High (remaining) | 7 |
| B5 | **Partially resolved (P5-02).** HMAC positive/negative coverage now exists for both Paymob Intention (20 fields) and Accept (23 fields) payloads, including per-field mutation, invalid/empty/truncated signatures, missing secret and the 401 controller path (**§5O**). Still open: upload magic-byte, headers/CORS negatives, brute-force (**0** tests) and rate-limit negatives (rate-limit coverage exists separately), and the HMAC comparator is not timing-safe (tests-only decision in P5-02). | High (remaining) | 5/7 |
| B6 | DB root user + unused least-privilege script; `trustProxy: true` with IP rate limiting | High | 2 |
| B7 | Paymob Sandbox use unapproved; local provider is `paymob` | Medium | 5 |
| B8 | **Frontend part RESOLVED in P2-08** (date-relative `OrgSubscriptionPage` fixture; `TournamentCreatePage` walk optimized, 46/46 and full suite green twice). **Backend part remains**: 6 date-expired unit fixtures (membership/subscription) + 2 suite-load timeouts that pass in isolation — Phase 7 (P7-02). | Medium (test debt, backend only) | 7 |
| B9 | **RESOLVED for Stage A.** Global teardown no longer deletes; selected specs use unique markers + scoped FK-ordered cleanup with zero-residue assertions; Stage A integration 40/40 PASS. Remaining 32 container-based suites stay unrun under the no-container rule; other persistent suites were not exercised. | Resolved (Stage A) | 2/7 |
| B10 | **RESOLVED in P2-07.** `vite-plugin-pwa` moved to `devDependencies`; frontend production tree no longer contains `vite`, `postcss`, `workbox-build`, `browserslist`, `@babel/core`, `fast-uri`, `serialize-javascript`, `baseline-browser-mapping`, `filelist`, `minimatch` or `brace-expansion`. Frontend production audit **46 → 2**. Residual caveat: a frontend build using `npm ci --omit=dev` would now fail — no such path exists (Docker/CI use full `npm ci`; Phase 9 must preserve this). | Resolved (P2-07) | 2 |
| B11 | **RESOLVED in P2-07.** New `frontend/src/services/api.test.ts` (**11/11 PASS**) exercises the real axios pipeline with a scripted adapter: request interceptor (JSON content type, device fingerprint), FormData kept as `FormData` (not JSON-serialized), `responseType: 'blob'`, 401 → single shared refresh → replay, no refresh on `/auth/me` & `/auth/refresh`, `INVALID_REFRESH_TOKEN`/`SESSION_EXPIRED` → clear session + `auth:logout`, other refresh failures keep session, non-401 propagated. | Resolved (P2-07) | 2 |
| B12 | **RESOLVED in P2-08.** Legacy org fixture now includes the Membership section (Plans/Settings/Subscriptions) and legacy player fixture includes My Memberships, matching the authoritative registries. Strict parity/id-map assertions preserved with updated counts (org 46 ids / 39 id→key; player 21 ids / 15 key maps); parity suite **98/98 PASS**. No test skipped, weakened, or deleted. | Resolved (P2-08) | 2/3 |
| B13 | **Backend production transitives — DEFERRED (not accepted).** 6 packages / 23 advisories: `@fastify/busboy@3.2.0` (→3.2.4), `brace-expansion@5.0.6` (→5.0.12), `engine.io@6.6.9` (→6.6.11), `fast-copy@4.0.3` (→4.3.1), `fast-uri@3.1.2` (→3.1.9), `socket.io-parser@4.2.6` (→4.2.7). Every fix is **in-range and non-breaking**; none was applied in P2-10 because the task scope was limited to the two frontend targets. Requires a dedicated in-range backend transitive pass. | High (deferred, fix available) | 7/8 |
| B14 | **Frontend dev/build-time advisories — ACCEPTED for Phase 2.** 10 packages (`@babel/core`, `@vitest/mocker`, `baseline-browser-mapping`, `brace-expansion` ×2 copies, `browserslist`, `fast-uri`, `postcss-selector-parser`, `serialize-javascript`, `undici`, `vitest`), none shipped in `dist`; all have in-range fixes (no breaking upgrade). Revisit with the Phase 7 dependency-scan gate (P7-05) / P8-09 debt register. | Low–High (no production exposure) | 2, 7 |
| B15 | **RETAINED as explicit defence-in-depth (P3-06 decision).** `src/app/layouts/AdminLayout.tsx:22` still uses `roles.includes('accountant')` for the deny-list. DB evidence: the accountant grant set contains **none** of the route permissions behind `ADMIN_DENY_PREFIXES` (`users.view`, `roles.view`, `ui-permissions.view`, `organisations.view`, `app-settings.view`, `security.dashboard`, `sidebar.audit`, `sidebar.subscription`), so `getAdminRoutePermission` + `can()` already denies every listed section today. Removing the role check changes no current behaviour and would weaken protection against future grant drift for a restricted finance role, so it is retained and documented. | Low (defence-in-depth) | 3 |
| B17 | **Remaining react-hooks quality findings — classified intentional (P3-06).** `set-state-in-effect` **54**: editable-form drafts initialised from query/prop data (`OrganisationForm` ×7, product modals ×6, app-settings/accounting/design/countries/BI/…), pagination resets on filter change (`CountriesPage`, `BranchListPage`; `CoachDirectoryPage` was safely moved to its handlers), request-lifecycle loading/error state (`BIDashboardPage`, `ObservabilityPage`, `LandingPage`, `SubscriptionPlanDetailPage`), and browser/socket/timer subscriptions (`ConnectionStatus`, `InstallPrompt`, `ReloadSplash`, `SocketContext`, `LandingLayout`). `purity` **3**: `Date.now()` in subscription-expiry display (`SubscriptionCard` ×2, `SubscriptionPage` ×1) — needs a shared ticking-clock abstraction; speculative per-component rewrites were avoided. Callback-scoped `[TRACE]` logs remain in `BookingModal.tsx` (payment-flow diagnostics; not flagged by these rules) and are covered by the P8-05 production-logging/PII review. | Low (intentional; no correctness defect observed) | 3, 7 |
| B18 | **Lint-baseline governance (P3-07).** The gate compares against committed `frontend/lint-baseline.json`; a contributor could hide a regression by updating the baseline in the same change. Mitigation: baseline updates are explicit (`npm run lint:baseline`) and must be reviewed as policy changes; the gate still prevents accidental/undeclared regressions, new files with findings, removed coverage, rule/severity weakening, and new `eslint-disable` directives in TS/TSX. Directive scanning is deliberately limited to TS/TSX (the configured rule scope); `.mjs` tooling is inventoried for coverage but not directive-policed. | Low (process risk) | 7 |
| B16 | **P3-05 permission delta — documented, not a defect.** Replacing the stale role list with `dashboard.view` lets five additional platform roles (`auditor`, `content-manager`, `event-manager`, `finance-manager`, `read-only-admin`) reach the coarse `/admin` gate and the consumer→`/admin` redirect. They already held `dashboard.view` plus per-route admin permissions (`getAdminRoutePermission` still enforces every section), so UI entry now matches the authoritative grant set; **no permission was created or granted** and no player/org/coach/referee role gained access. Multi-role platform+player users are redirected to `/admin` exactly as before for the legacy roles. | Low (intended semantics) | 3 |
| B19 | **Type-check coverage gaps (P3-08).** Frontend `npx tsc --noEmit` (used in `.github/workflows/lint.yml`) checks **0 files** because `tsconfig.json` is references-only (`files: []`); the real check is `tsc -b` in `npm run build` (`ci.yml`). Backend `tsconfig.json` excludes tests (`__tests__`, `*.spec.ts`, `src/tests`), so backend test files are transpiled by Vitest but not type-checked. Recommendation: run `npx tsc -b` in the frontend lint job and add a test tsconfig in a later task. | Medium (CI coverage) | 7, 8 |
| B20 | **Frontend strictness relies on the TS 6 default (P3-08).** `tsconfig.app.json` does not pin `strict`; TS 6.0.3 enables the strict family by default (verified: project `--strict` adds 0 errors; `--strict false` clears probes; standalone default `tsc` reports TS2322/TS7006). A future compiler-default change could silently weaken checking. Recommendation: pin `"strict": true` explicitly (0 errors) before dependency upgrades. | Low–Medium | 8 |
| B21 | **Explicit `any` backlog + no type-aware lint (P3-08).** `@typescript-eslint/no-explicit-any` **3,163** (2,594 source / 569 tests; `src/pages` 2,415 incl. `src/pages/admin` 1,652) cannot be detected by any `tsc` flag, and `tseslint.configs.recommended` runs **without** `projectService`, so no type-aware rule exists to catch unsafe `any` propagation. Every strictness stage in §17 is therefore necessary but not sufficient. Recommendation: a dedicated `no-explicit-any` ratchet (per-module budget) and a separate type-aware-lint evaluation — P7-08/P8-09, not Phase 3. | Medium (typing debt) | 7, 8 |
| B22 | **Frontend `skipLibCheck: false` blocked by dependency typings (P3-08).** Backend is clean (**0**), frontend reports **7** TS2503 `Cannot find namespace 'JSX'` errors, all inside `@dnd-kit/core` / `@dnd-kit/sortable` `.d.ts` files (React 19 JSX namespace). This is dependency drift, not project code, and cannot be fixed without a dependency change (P7-05). No action in Phase 3. | Low | 7, 8 |
| B23 | **Regression-map evidence gaps — mostly closed (P3-09 → P3-10).** (1) P3-04 loop hooks: the 433-line pre-fix file cannot be reverted safely; evidence remains the deleted `for (…) useSocketEvent(…)` lines plus `rules-of-hooks` **25 → 0**. (2) P3-06 debug-instrumentation, render-time ref reads, `KPI` hoist and `InstallPrompt` are behaviour-preserving by design (the `InstallPrompt` test passes on the old code too); evidence is the refreshed lint deltas (`refs` 0, `static-components` 0, `purity` 3) plus the full suite. **CLOSED in P3-10:** the Navbar admin-link mirror now has 5 full-App tests (3 fail under the legacy role-string mutation) and the payment-id wiring has a behavioural test plus a 3-file source guard. **Remaining:** the two registration pages are only source-guarded (mounting them needs a brittle multi-step harness); real card flows belong to Phase 5/6. | Low (evidence gap, no open defect) | 3, 6, 8 |
| B24 | **Permission-key drift — core resolved in P4-02, nav residual.** Authoritative read-only DB grants (`courtzon_v3`, 26 role slugs) confirmed the divergence: `/admin/finance*` route `financial.view`/`reports.view` vs page/nav `sidebar.finance-*`; `/admin/accounting/dashboard` route `sidebar.accounting` vs page `accounting.dashboard` vs nav `sidebar.accounting-dashboard`; settlement routes `settlements.view` vs nav `sidebar.settlements(-bookings)`. Confirmed effects: **blank pages** for master-admin (finance/ledger/ops) and auditor/read-only-admin (accounting dashboard); finance-manager denied by route on accounting; ops/org-admin/accountant settlement links missing from the menu. **Fixed (deny-safe, no grant changed):** five page gates now use the canonical route keys (`financial.view` ×3, `reports.view`, `sidebar.accounting`) — every nav-key holder already held the route key, so no role lost access. **Residual (cosmetic):** master-admin still has no `sidebar.*` nav keys; finance-manager accounting nav hidden; ops/org-admin/accountant settlement menu links absent. Full table in **§5E.4**. | Medium → Low (residual) | 3, 4 |
| B25 | **CLOSED in P4-02.** `modules/community/__tests__/community-authorization.spec.ts` adds **15** tests: participant-only message read/send (no write/emit when denied), group creator/admin invite/remove/update/delete matrix (cannot remove creator; only creator removes admins), invitation ownership and duplicate-response rules, group info/members and pin/read-receipt participant checks. Removing the participant check makes exactly the mapped test fail (**1 failed / 14 passed**), proving the suite catches the regression. Socket-room coverage was already present. | Resolved | 4 |
| B26 | **CLOSED in P4-04.** `checkout-inventory-integrity.spec.ts` exercises the real gate at `marketplace.service.ts:429-440`: `exists:false` (no plan), `expired`, `suspended`, `cancelled` are rejected **before any order row is created**; an `active` seller completes the normal two-order checkout. No production change was needed for eligibility — the gate already existed; only the negative coverage was missing. | Resolved | 4 |
| B31 | **Marketplace inventory atomicity limits (P4-04, Medium, not changed).** (1) Order/item/history inserts and the stock decrement are separate autocommit statements — a process crash between them can leave an order without a stock movement (or a partially restored cart). (2) The cancel/refund stock restore is not atomic with the status write: two **concurrent** cancels of the same pending order, or two overlapping 30-minute cleanup workers, can restore the same order twice (sequential retries and duplicate events are now safe). (3) `reserved_quantity` is not used for soft reservation — stock leaves inventory at checkout, not when the cart/payment starts. Fixing (2) properly needs a claim/lease or a durable “stock restored” marker (schema change); recorded for the Phase 5/9 hardening pass. | Medium (design limitation) | 4, 5 |
| B27 | **CLOSED in P4-05.** The notification delivery path had **7 real defects** behind the missing tests, all fixed with red→green proofs: provider `success:false` treated as success (silent loss), DLQ persisted only on the success path, failed attempts never incremented (`attempts`), replay created a delivery but never enqueued it and deleted the dead letter, retried jobs could re-send a delivered notification, malformed preference JSON crashed dispatch, and the digest payload used legacy fields the worker could not read. New suites: `notification-failover` (6), `notification-dlq` (5), `notification-replay` (7), `digest-scheduler` (3) = **21**; notifications module **222/222**. Remaining limitations tracked in **B32**. | Resolved | 4, 7 |
| B32 | **Notification reliability residuals (P4-05, Medium, not changed).** (1) `processDigest` re-selects unread notifications without marking them digested or claiming a digest window — overlapping hourly/daily runs can send duplicate digests (the `notification_digest_windows` table exists but this path does not use it). (2) `retry_failed_deliveries` is a `JobType` with **no registered handler or schedule**. (3) The user `failover_chain` is pre-delivery channel expansion, not a post-failure cascade (documentation now matches code). (4) Two workers processing the same notification concurrently can both pass the delivered-lookup before either writes `delivered`; a fully atomic guard needs a unique key on `(notification_id, user_id, channel)` (schema change deferred to Phase 9 hardening). | Medium (design limitation) | 7, 9 |
| B33 | **Event-bus reliability limits (P4-06, Medium, not changed).** (1) **255 of 366** `eventBusV2.emit(...)` call sites are neither awaited nor `void`-ed; emit performs a DB insert, so a transient failure becomes an unhandled rejection (Node 22 may terminate) and the event is lost — a repo-wide await audit is deferred to P8-09. (2) No durable event dead-letter store: after BullMQ exhausts attempts the subscriber only logs `event.dead_letter`, and the outbox will not re-send (cursor advanced). (3) Delivery is at-least-once: `processed_events` is written after the handler succeeds, so a crash between side effect and record can re-run a handler — handlers must stay idempotent. (4) `subscribe()` initialises outbox cursors fire-and-forget, so an early poll during startup could replay history for a `latest` subscriber. (5) Domain events are not replayed to Socket.IO on reconnect (reconcile-by-refetch is deliberate). | Medium (design limitation) | 7, 9 |
| B34 | **CLOSED in P4-07.** Booking refund accounting advanced `coach_recovered_amount`/`org_recovered_amount` even when `postAccountingEvent` idempotently skipped the posting (duplicate `payment:refunded` + `booking:refunded`), consuming recovery capacity with no journal entry. `postAccountingEvent` now returns `boolean` and both updates are gated on it. Proof: new `accounting-posting-idempotency.spec.ts` **6/6**; mutation to `if (true)` → **1 failed / 5 passed** (4 vs 2 updates), restored byte-exactly. | Resolved | 4 |
| B35 | **Accounting posting-identity and recovery residuals (P4-07, Medium/Low; (1)–(3) characterized, (4) open, (5) closed in P4-08).** (1) **Posting identity has no occurrence ordinal:** `(source_type, source_id, event_type)` is the whole idempotency key, so a second *legitimate* posting of the same event type for the same source cannot post. Today single-booking card/wallet refunds are full-only and settlement recovery capacity is consumed once, so no live path is affected — but multi-partial single-booking refunds or repeated offset collections would silently drop a journal until a new event identity (or an ordinal/sequence column, i.e. schema change) exists. Characterization: `accounting-posting-idempotency.spec.ts` (second same-event posting with a different amount is skipped). (2) **Outer-connection callers ignore the posting result:** `booking-settlement.service.ts` updates `org_recovery_collected`/`coach_recovery_collected` without checking the boolean; safe only because the event identity is unique per booking today (same class as B34). Characterization: `booking-settlement-unification.spec.ts` (collected advances even when the posting is skipped). (3) **In-memory accounting handlers swallow errors** (log only); a transient DB failure completes the event with no posting and no DLQ replay — manual re-delivery works (tested), automatic retry does not. (4) **Legacy mapping rows coexist** (`booking_card_payment → org_payable 2200`, `booking_cod_payment → receivable_from_org 1160`); provenance confirmed in **§5L.4** (migrations 113/117 + seed 005, superseded by 2202/1161, ignored by `buildLedgerLines`); cleanup needs a seed/migration change (not authorized). (5) **Period lock/scope now covered** by `gl-period-lock.spec.ts` (9 tests, P4-08). | Medium/Low (design limitation) | 5, 9 |
| B36 | **Stale baseline + fresh-deploy stamping (P4-09, Critical, open).** `database/baseline/001_courtzon_v3.sql` contains **328** tables but is missing `payment_allocations` (migration 178) and **45** columns added by migrations 149, 158–161, 177 and 193 (all present in the live reference DB; 0 baseline objects are missing live). `backend/docker-entrypoint.sh:48-79` imports that baseline on an empty DB and then **stamps every migration filename into `migration_history` without executing it**, so a fresh Docker/DB (also any DR restore using the baseline alone) never receives migrations 149–203. Impact: Academy ownership/scheduling/confirmation columns, gateway-settlement columns, `bookings.series_id`, membership installments and `payment_allocations` are absent → those features fail on first query. The current running DB is migrated and unaffected; no current-session data loss. Fix requires regenerating the baseline from the full chain **and** changing the entrypoint/CI convergence check (baseline regeneration is a DB-derived artefact and must be authorized; not done in P4-09). Related observation: the entrypoint imports only `seeds/001_baseline.sql`, not the accounting seeds 004–006 (Phase 9). | **Critical (release/deploy)** | 4, 9, 10 |
| B37 | **Code ↔ schema mismatches in reachable endpoints (P4-09, High, open; discovered pre-existing).** (1) `org-portal.controller.ts:962,980-986` — org payment-settings GET/PUT use `account_holder_name`, `account_number`, `swift_code`, `tax_id`; the table has `bank_account_name`, `bank_account_number`, `swift` and no `tax_id` (the correct repository `branch-financial.repository.ts:31-46` already exists). (2) `mobile.controller.ts:16-19,70` — push register/list use `push_tokens.device_id`, which does not exist. (3) `resource.repository.ts:174,182,193-204` — maintenance CRUD uses `title/description/start_date/end_date/start_time/end_time/status`, but the table is `reason/date_from/date_to/is_active/...`. All three are routed (`org-portal.routes.ts:115-116`, `mobile.routes.ts:9-11`, `organisation.routes.ts:117-120`) and have **no schema-backed tests** (the payment-settings spec mocks SQL text). Also low-impact dead code: `hr.repository.ts:21-24` (invented `description`/`head_user_id`) and `activities/commands/update-activity-status.command.ts:41-45` (table `activities` does not exist anywhere; only referenced by `transaction-conn.integration.spec.ts`). Code-only fixes are possible; **not applied in P4-09** (verification-only task, and the maintenance mapping needs a product decision). | **High (endpoint failures)** | 4, 7, 9 |
| B38 | **Duplicate-charge window on concurrent same-idempotency-key payments (P5-01/P5-03, High, OPEN).** `PaymentService.chargeByGateway` calls the gateway **before** creating the local `payment_transactions` row (`payment.service.ts:250-292`; same pattern in `createGatewayIntention` `:1751-1788`), and the idempotency pre-check (`:233-246`) runs outside any lock. Paymob's `special_reference` includes `Date.now()` (`paymob-gateway.ts:83`), so two concurrent requests with the same client idempotency key create two distinct gateway intentions; only the second **local** insert fails on `uk_idempotency_key` — potentially after the customer was charged twice. **Reproduced at unit level in P5-03** (`gateway-failure-idempotency.spec.ts`: 2 gateway calls for 1 key, 1 fulfilled / 1 `ER_DUP_ENTRY`); no provider/live reproduction and **no fix** (a correct fix needs a reservation/pre-insert state or provider idempotency). | **High (duplicate charge/idempotency)** | 5, 8 |
| B39 | **Webhook replay protection marks before processing (P5-01/P5-03, Medium, OPEN).** `handleWebhook` writes `webhook:processed:<id>` to Redis (24 h TTL) **before** resolving/processing (`payment.service.ts:335-351`); if processing then fails, retries are answered as duplicates and skipped. Redis unavailability disables replay dedupe entirely (only DB final-state guards remain). **Reproduced at unit level in P5-03** (`webhook-replay-ordering.spec.ts`: failed processing → retry dropped; Redis down → no dedupe); no fix (a correct fix changes replay semantics: mark-after-success or `SET NX` + delete-on-failure). | **Medium (recovery gap)** | 5, 7 |
| B40 | **No partial-refund representation for single payments (P5-01, Medium, open).** Card (`payment.service.ts:1592`) and wallet (`:978`) finalisation set `payment_status='refunded'` for any amount; `payment_transactions` has no `refunded_amount`/`partially_refunded`; multi-partial exists only for recurring allocations via `gateway_response` intents (`payment.repository.ts:257-312`). A second normal partial refund is impossible, and reporting cannot read the refunded amount from the payment row. Schema change may be required; not implemented. | **Medium (limitation/boundary)** | 5, 9 |
| B41 | **CLOSED in P5-02.** `PaymobGateway.verifyWebhook` threw `TypeError: Cannot read properties of null (reading 'slice')` for a null/undefined signature because the mismatch logger sliced the expected value after comparison; a malformed signature produced a crash instead of a fail-closed rejection. New tests failed first (`rejects null/undefined signatures`, `paymob-gateway.ts:387`), then the expected signature was normalized to an empty string in both Intention and Accept branches. Exact string-equality semantics preserved; no lifecycle/accounting/idempotency/refund change; 65 new tests pass. | **Resolved (Low/Medium robustness)** | 5 |
| B28 | **Proxy-contract test scans frontend test files (P4-02, pre-existing).** `backend/src/tests/proxy-contract.spec.ts` extracts every `api.<verb>('/prefix')` call from `frontend/src` (including `.test.tsx`) and requires nginx/vite proxy coverage, so fixtures such as `services/api.test.ts` (`/demo`, `/protected`) and the complaints test (`/broken`) fail both assertions in the current working tree. Not caused by P4-02; the spec needs a test-file exclusion or fixture renaming. Owner: P7-02/P7-09. | Low (test infrastructure) | 7 |
| B29 | **RESOLVED (P4-03).** The Redis booking lock had **no tests** and used non-unique ownership tokens (`user:<id>`, `tournament:<user>:<match>`, `scheduling:<user>:<now>`), so a stale release after TTL expiry could delete a newer same-principal acquisition. Fixed with `createLockOwner()` (UUID per acquisition) at all four sites + `redis-lock.spec.ts` (13) and `lock-owner-wiring.spec.ts` (3, red on the pre-fix form). | Resolved | 4 |
| B30 | **Booking concurrency design limitations (P4-03, Low, DB-authoritative).** (1) `prepareGatewayBooking` runs its availability pre-check outside a transaction (the `FOR UPDATE` is a no-op in autocommit); the 10-min window relies on the Redis prepare lock and is re-validated inside the confirm transaction. (2) The 15 s create lock has **no renewal**; if it expires during the post-commit gateway charge another request may acquire it, but the committed `pending_payment` booking still blocks the slot. (3) Recurring-series creation takes no Redis lock and locks multiple `resources` rows in plan order → a concurrent series can deadlock; InnoDB rolls one back (fails safe/retryable). No data-integrity impact observed; the `resources FOR UPDATE` + overlap count remains authoritative. | Low (design limitation) | 4 |

**Additional test-target hygiene (low risk):** 12 unit specs still hardcode `DB_PORT=3306` in their
local env setup, but they mock MySQL and do not open a pool; `unified-settlement.service.spec.ts`
(the only one that constructs a pool) was moved to 3307. Normalize the rest during Phase 7 (P7-02/P7-09).

## 15. Audit trail

| Date | Operation | Result / evidence |
|---|---|---|
| 2026-10-26 | Phase 4B-1: migrated 10 legacy RBAC EventBus emissions to `eventBusV2` with explicit rejection handling | 10/10 `.catch`, transaction ordering preserved |
| 2026-10-26 | Phase 4B-1.1: added 16 RBAC publication contract tests | 16/16 PASS |
| 2026-10-26 | Phase 4C: reviewed Layer Architecture validator scope | 18 errors traced to frontend test files |
| 2026-10-26 | Phase 4C-2: added test-file exclusion + 8 validator regression tests | 8/8 PASS; Layer 18 → 0 errors |
| 2026-10-26 | Phase 4B-2: removed domain→infrastructure import in brand-image | backend build PASS; architecture warning resolved |
| 2026-10-26 | Phase 5: full local verification | 38/38 focused tests, backend build PASS, frontend tsc PASS, architecture 0 errors |
| 2026-10-26 | Local commit `184aa6e0` (5 files) | not pushed; origin unchanged |
| 2026-10-26 | Pre-release audit: lint, architecture, test tooling, DB/E2E safety | 3,493 lint findings; E2E writes to `courtzon_v3`; no teardown |
| 2026-10-26 | Dependency & security audit | 78 vulnerable entries; CI gates weak; no Dependabot |
| 2026-10-26 | Plan adoption: created canonical plan + progress; updated `AGENTS.md` pointer | documentation only; no source/DB/Docker changes |
| 2026-10-26 | P1-09: fail-closed E2E cleanup guard | Added `e2e/helpers/cleanup-guard.ts`; `database.ts::cleanup()` delegates before connecting; 9/9 focused tests PASS |
| 2026-10-26 | Phase 1 amendment + execute (Amendment A1) | User-approved existing-DB strategy; target pinning, deferred explicit cleanup, seed port fix; 14/14 guard tests + 4 setup guard checks PASS; Phase 1 DONE |
| 2026-10-26 | P2-03: backend dependency compatibility matrix | `docs/release/DEPENDENCY_COMPATIBILITY_MATRIX.md`; registry/lockfile evidence for 7 targets; no installs |
| 2026-10-26 | P2-04 Stage A: backend security upgrades | fastify 5.12.7, zod 4.6.7, mysql2 3.24.6; find-my-way 9.10.0; build PASS; 63/63 focused; full unit 3705/3713 (8 pre-existing) |
| 2026-10-26 | P2-05: post-upgrade validation | build PASS; 36/36 timeout pair; 6 date failures confirmed pre-existing; integration BLOCKED (DELETE/new-DB); audit prod 10 / full 24 |
| 2026-10-26 | B9 investigation: integration safety | 163 specs (32 container-based, 131 persistent; 129 destructive, 1 SELECT-only, 1 writes templates); global setup INSERT/DELETE; B9 remains BLOCKED; `docs/release/INTEGRATION_SAFETY_ASSESSMENT.md` |
| 2026-10-26 | B9 remediation + Stage A integration | Global teardown DELETE removed; unique markers + scoped cleanup for payment/upload/coach-profile; new helper/unit tests; integration **40/40 PASS**; build PASS; 70/70 focused unit |
| 2026-10-26 | P2-04 Stage B: coupled Fastify plugins | `@fastify/static` 9.1.3→**10.1.7**, `@fastify/swagger-ui` 5.2.6→**6.1.2**; `@fastify/swagger` 9.7.0 evaluated, retained; single static copy; build PASS; plugin/docs/uploads **15/15**; integration **24/24**; static + swagger-ui advisories cleared (prod 8 / full 22) |
| 2026-10-26 | P2-04 Stage C: nodemailer | 8.0.7→**10.2.1**; `@types/nodemailer` removed (bundled types); new mailer mock-transport + real-ESM tests **10/10**; regression **36/36**; build PASS; nodemailer advisory cleared (prod 7 / full 21) |
| 2026-10-26 | P2-04 Stage D: sharp | 0.34.5→**0.35.5**; deprecated `@types/sharp` removed (bundled conditional types resolved via `tsc --traceResolution`); local win32-x64 prebuilt / libvips 8.18.7; sharp-processor **7→10** tests; sharp/brand-image **18/18**, upload RBAC integration **15/15**; build PASS; sharp advisory cleared (prod 6 / full 20) |
| 2026-10-26 | P2-06: frontend compatibility assessment (analysis only) | Installed→target verified: axios 1.16.1→1.20.0, zod 4.4.3→4.6.7, react-router-dom 7.15.1→7.18.4, `@tiptap/*` 3.23.5→3.32.0 (5 packages + exact peers), postcss 8.5.14→8.5.31, vite 8.0.13→8.3.5 — all same-major. Tiptap **unused** (0 imports, absent from `dist`); `vite-plugin-pwa` classified **devDependency** (config-only, workbox bundled, Docker builder installs dev). Frontend audit baseline prod **46** / full **50**. No install/manifest/lockfile change |
| 2026-10-26 | P2-07: frontend upgrades + validation | `vite-plugin-pwa`→devDependencies; axios **1.20.0**, zod **4.6.7**, react-router-dom **7.18.4**, postcss **8.5.31**, vite **8.3.5**, `@tiptap/*` **3.32.0** (all five, single core/pm). Tiptap `ERESOLVE` handled by uninstall/reinstall (no `--force`). New `services/api.test.ts` **11/11**; build **PASS**; full suite **1347/1356** then **1346/1356** (7 nav-parity drift + 1 date fixture + 1–2 load timeouts, all pre-existing/flaky); audit prod **46→2**, full **50→12**; tiptap absent from `dist`, CSS byte-identical, main entry 1,287.8→782.97 kB |
| 2026-10-26 | P2-08: frontend test stabilization | Nav fixtures reconciled to the authoritative registries (org Membership + player My Memberships; counts 46/39 and 21/15) → parity **98/98**; `OrgSubscriptionPage` fixture made date-relative → **10/10**; `TournamentCreatePage` `walkTo` overshoot removed → **46/46**; full suite **1356/1356 (134/134)** twice; `tsc -b` clean. No production logic, dependency, DB or Docker change |
| 2026-10-26 | P2-10: final dependency audit + risk acceptance | In-range lockfile updates `follow-redirects` 1.16.0→**1.16.2**, `socket.io-parser` 4.2.6→**4.2.7** (no manifest change, no force flags). Frontend focused **103/103**, full **1356/1356**, backend build PASS + focused **20/20**. Audits: frontend prod **0**/full **10**; backend prod **6**/full **20**; root 0. De-duplicated: **25** unique packages, **79** pkg+GHSA pairs, prod **23** advisories in **6** packages. Phase 2 acceptance **MET** with B13/B14 + AR-2 (Alpine/Phase 9) deferrals |
| 2026-10-26 | P3-02: fix conditional React hooks | Moved the `org.accounting.view` gate in `OrgAccountingRecordsPage` **after all 17 hooks**; `canView` now gates both queries (`enabled`), preserving no-request behaviour when denied. 2 regression tests (revoked-while-mounted, granted-after-denied) counting `useQuery` calls — verified failing on the old code and passing now. Focused **16/16**, accounting set **47/47**, full **1358/1358**, `tsc -b` clean. No dependency/backend/DB/Docker change |
| 2026-10-27 | P3-03: remaining page-level conditional-hook gates | Fixed all 8 documented candidates (7 finance/accounting pages + MessagesPage mid-render gate): `canView` value, `enabled` guards, gate after the last hook. New regression tests for 5 pages + Messages, and 1 each added to BookingSettlement/UnifiedSettlementList suites; proven to fail on the pre-fix code. Focused **51/51**, full **1367/1367**, `tsc -b` clean; repo `rules-of-hooks` 25 → all in `useRealtimeCacheUpdates.ts` (P3-04). No dependency/backend/DB/Docker change |
| 2026-10-27 | P3-04: loop-safe realtime subscriptions | New `useSocketEvents` (one effect per event list, handler ref, full cleanup) + module-level event lists; replaced 25 in-loop `useSocketEvent` calls in `useRealtimeCacheUpdates.ts` (25 `useSocketEvents` calls). Test mocks updated; new `useSocketEvents.test.tsx` **8/8**. Realtime **84/84**, full **1375/1375**, `tsc -b` clean, `rules-of-hooks` **25 → 0 repo-wide** (no suppression). No dependency/backend/DB/Docker change |
| 2026-10-27 | P3-05: permission-based route guards | Extracted `ProtectedRoute`/`AdminRoute` to `src/app/routes/RouteGuards.tsx`; replaced both role-string checks in `App.tsx` with `dashboard.view` (canonical `/admin` route permission) OR `platform.admin` (backend adminGuard parity). `AdminRoute` shows an explicit Access-denied surface (no redirect loop); `ProtectedRoute` no longer bounces `/app` to `/admin` without the permission; Navbar uses the same predicate. No new permission key or registry sync. New `routeGuards.test.tsx` **18/18**; focused **30/30**; full **1393/1393**; `tsc -b` clean; `rules-of-hooks` 0 |
| 2026-10-27 | P3-06: remaining react-hooks triage/remediation | Re-measured baseline **57** set-state / **37** refs / **10** purity / **8** static-components (3,437 total). Removed debug instrumentation (`ProductCategoriesPage`, `TagsPage`, `BrandsPage`, `BookingConfirmationPage`, `usePaymentConfirm`); moved render-time ref reads into state/effects (`App`, `LoginSplash`, `useDetectedCountry`, `PaymobPixelCard`, org/seller registration, `SubscriptionRequestModal`, `UnifiedSettlementCreatePage`); hoisted `FinanceDashboardPage` KPI; removed `ProductCardImage` `Date.now` cache-buster. After: refs **0**, static **0**, purity **3**, set-state **54**; total **3,377** (−60). B15 retained with DB evidence; B17 records the intentional remainder. New `InstallPrompt` **5/5**; focused **57/57**; `tsc` clean; full **1398/1398**; `rules-of-hooks` 0. No dependency/backend/DB/Docker change |
| 2026-10-27 | P3-07: ESLint baseline + CI gate | Confirmed `npx eslint .` = **3,377** findings (3,295 errors / 82 warnings) across **706** files. Rejected ESLint bulk suppressions (errors-only). Added `scripts/lint-baseline.mjs` + `lint-baseline.json` (per-file/rule/severity counts, file inventory, TS/TSX suppression directives) and `lint-gate-selftest.mjs`; wired `npm run lint:gate` into `lint.yml`. Gate **PASS**; selftest **6/6**; `tsc` clean; full **1398/1398**. Normal `npm run lint` preserved. No dependency/backend/DB/Docker change |
| 2026-10-27 | P3-08: TS strictness measurement + staged plan | TS **6.0.3** / Node **22.14.0**; baselines FE app/node **0**, BE **0**. Confirmed TS 6 defaults `strict` on (probes; `--strict false` clears; project `--strict` +0). Found FE `npx tsc --noEmit` checks **0 files** (references-only root) and BE tests excluded from tsc (B19). Measured FE/BE candidates: noUncheckedIndexedAccess 304/764, exactOptionalPropertyTypes 140/761, noPropertyAccessFromIndexSignature 332/2,234, noImplicitOverride 3/0, noImplicitReturns 1/1, noUnusedLocals —/196, noUnusedParameters —/105, allowUnreachableCode=false 0/1. Proposed F0/B0 prerequisites + F1/B1 small flags → B2 unused → F3/B3 exactOptional → F4/B4 noUnchecked → defer F5/B5 noPropertyAccess. No flag/config/dependency/DB/Docker change |
| 2026-10-27 | P3-08 re-verification after power interruption (session resume) | Re-read AGENTS.md + the plan/progress/matrix/safety documents; re-ran **every** baseline and per-flag command from scratch on the on-disk tree: FE app/node/BE all **0** (exit 0), `tsc -b --force` **exit 0**, and every candidate flag reproduced its recorded count (304/764, 140/761, 332/2,234, 3/0, 1/1, 0/1, 196/105) plus unions (455/1,528) and stage bundles (4/2, 301). Newly measured items added: `allowUnusedLabels=false` **0/0**, `skipLibCheck=false` **7/0** (all `@dnd-kit` d.ts, B22), explicit-`any` inventory **3,163** (2,594 source / 569 tests, B21). ESLint gate re-run **PASS** (706 files / 3,377 findings). **No discrepancy found** in the carried-forward P3-08 record; only additive findings. Changed path: this progress file only. No flag/config/dependency/DB/Docker/`.env` change, no commit/push |
| 2026-10-27 | P3-09: defect→test regression map + pre-fix proofs | Mapped **17** defects (P3-02…P3-07) to **43** Vitest tests in **9** files + **6** gate scenarios (**§5B**). Re-ran targeted set **65/65**. Proved pre-fix failure for **12/17** defects — 11 by minimal scoped mutation (7 runs: org 2, finance 5, Messages 2, Booking 1, Unified 1, role-string guard 7, ProductCardImage 1 failures as expected) plus the gate self-test; every file restored byte-exactly from an in-memory+on-disk backup (SHA-256 verified, marker scan 0). Added **1** new test (`ProductCardImage.test.tsx`) for a previously untested P3-06 fix — **1/0 failed** on the old `Date.now()` line, **1/1** now. Documented **5** non-demonstrable defects (B23). `tsc -b --force` **exit 0**; `lint:gate` **PASS** (707 files / 3,377 findings, baseline untouched); gate self-test **6/6**; full suite **1399/1399** (140/140). No production-code/dependency/DB/Docker/`.env` change, no commit/push |
| 2026-10-27 | P3-10: access-path re-verification + payment-poller fix | Matrix **§5C** (22 rows). **Found + fixed a critical regression:** P3-06 gated the card-payment fallback poller on `paymentInfo?.paymentId`, but `handlePaymentComplete` clears `paymentInfo` before polling, so the poller never mounted in `SubscriptionRequestModal`, `OrganizationRegisterPage`, `SellerRegisterPage`. Restored with `pollingPaymentId` state (3 files, pre-P3-06 behaviour, render stays pure). New tests: payment polling **2/2** (1 failed on the P3-06 version), wiring guard **3/3**, Navbar mirror **5/5** (3 fail under the role-string mutation; SHA-256 restore), AdminLayout **5/5** (incl. accountant deny-list). Focused **108/108** (14 files), `tsc -b --force` **0**, `lint:gate` **PASS** (711 files / 3,377 findings), selftest **6/6**, full **1414/1414** (144 files). **Phase 3 acceptance MET.** No dependency/DB/Docker/`.env` change, no commit/push |
| 2026-10-27 | P4-01: business-rule & coverage inventory | **§5D**: 45 rules across 8 areas; baseline re-measured (**308** unit spec files / **3,740** unit tests; **163** integration files; 471 total), per-module distribution, 10-route **B24** mapping table, ranked gap list, verified risk status. Findings: messaging REST authorization **0 tests** (B25, High), seller-subscription rejection untested (B26), notification failover/DLQ **0 refs** (B27), HMAC negative path still mocked (B5), brute-force **0 tests**, upload/CORS negatives absent. `npx vitest run src/modules/community` → “No test files found”. No test executed for correctness, no production/test/DB/Docker/`.env`/config change, no test modified |
| 2026-10-27 | P4-02: auth/session/RBAC/tenant audit + fixes | **§5E**. Read-only SELECT audit of Docker `courtzon_v3` (26 role slugs) → authoritative B24 grants; aligned 5 page gates to the canonical route keys (blank-page class fixed, no grant changed). **Fixed 2 confirmed defects:** marketplace order **IDOR** (unfiltered fallback; unrelated user received the order — red 2 failed → green 4/4) and **logout-all-devices no-op** (public route never set userId — red 1 failed → green 2/2). **B25 closed** with 15 community REST authorization tests (mutation proof 1 failed/14 passed). Focused backend **364/364** (35 files), backend `tsc --noEmit` 0, frontend `tsc -b --force` 0, `lint:gate` PASS (711/3,377), full frontend **1414/1414**. New pre-existing test defect documented: `proxy-contract.spec.ts` scans frontend test fixtures (B28). No DB schema/data, `.env`, Docker, dependency or commit/push change |
| 2026-10-27 | P4-03: booking concurrency, locks, transactions | **§5F**. Traced create/prepare-confirm/recurring/tournament/scheduling/expiry chains. Verified lock keys/TTLs (15 s create, 10 min prepare), NX + Lua compare-and-delete, 5 s budget, partial-acquisition rollback; DB authority = `resources FOR UPDATE` + overlap count (migration 140 dropped status-blind unique keys — confirmed by `SHOW INDEX`). **Fixed the non-unique lock owner token** with `createLockOwner()` at 4 sites. New tests: `redis-lock.spec.ts` **13/13**; `lock-owner-wiring.spec.ts` **3/3** (pre-fix mutation 1 failed/2 passed, SHA-256 restore). Real concurrency: service + repository integration **16/16** against running MySQL/Redis. Booking+scheduling unit **336/336**, backend `tsc` 0, `lint:gate` PASS. Documented residuals (prepare pre-check outside tx, no renewal, recurring deadlock window) as B30 |
| 2026-10-27 | P4-04: marketplace inventory, overselling, stock restoration | **§5G**. Traced checkout → per-seller orders → conditional decrement → payment → fulfil/cancel/refund/cleanup. Oversell guard verified with 10 real concurrent decrements (qty 5 → exactly 5 succeed) and stock-3/2-unit races (1 wins). **3 restoration defects fixed** (double restore on card failure, over-restore of non-decremented items, duplicate failure-event restore), each with a scoped mutation proof (1 failed/8 passed; SHA-256 restore). **B26 closed** with 5 eligibility tests. Evidence: new `checkout-inventory-integrity.spec.ts` 9/9, `marketplace-stock-concurrency.integration.spec.ts` 3/3 (real MySQL), marketplace 218/218 (21 files), `tsc` 0, `lint:gate` PASS. Residuals **B31** |
| 2026-10-27 | P4-05: subscriptions, notifications, reporting jobs, failover/DLQ | **§5H**. Traced subscription request → approve/reject/reopen → activation → renewal → expiry/reminders and the notification pipeline (dispatcher → queue → worker → providers → DLQ → replay). **B27 closed with 7 defects fixed** (provider `success:false`, DLQ-on-success-only, missing attempt increment, replay never enqueued, retried delivered notification, malformed preferences, digest payload contract); 6 mutation proofs. Evidence: 21 new tests, notifications 222/222 (28 files), subscription/membership 126/129 with **3 pre-existing date-expired fixtures (B8)**, `tsc` 0, `lint:gate` PASS. Residuals **B32**; external providers mocked |
| 2026-10-27 | P4-06: EventBus/Socket.IO/idempotency audit | **§5I**. Traced emit → `published_events` (same transaction conn) → after-commit enqueue → subscriber workers (`processed_events` unique) → Socket.IO rooms → frontend cache/reconnect reconcile, plus the 5 s outbox poller. **Fixed the global after-commit hook queue:** overlapping transactions could publish each other's events (phantom events on rollback) and events emitted outside a transaction were never flushed. Hooks are now ALS-scoped per transaction and immediate outside one. New `database.transaction.spec.ts` **6/6**; pre-fix file swap **2 failed / 4 passed**, restored byte-exactly. Focused shared+realtime **284/284** (22 files), `tsc` 0, `lint:gate` PASS. Durable-vs-best-effort idempotency documented; residuals (unawaited emits 255/366, no event DLQ, at-least-once window, cursor-init race, no socket replay) as **B33** |
| 2026-10-27 | P4-07: accounting integrity audit + B34 fix | **§5J**. Traced every posting path (booking card/wallet/COD/series, marketplace card/wallet/cash, academy, membership, tournament, gateway clearing/settlement, merchant payouts, historical corrections) through `postAccountingEvent`. Verified by tests: balanced journals on every shape, 13 refund/reversal pairs as exact inversions (concept level + DB-resolved chart codes), active-COA-only mapping, zero/negative/unknown/missing-mapping rejections, org attribution, and DB-enforced `ledger_entries.uk_dedup` UNIQUE over `(source_type, source_id, event_type, chart_account_id, side)`. **Fixed B34:** booking-refund recovery counters advanced on an idempotently skipped posting → `postAccountingEvent` now returns `boolean`, both counter updates gated (mutation proof **1 failed / 5 passed**, 4 vs 2 updates, SHA-256 restore). New tests **25 + 6 + 31**; focused financial/accounting/settlement **404/404** (42 files); booking refund/recovery integration **27/27**; `tsc` 0; `lint:gate` PASS (711/3,377). Read-only DB mapping checks; no schema/data, COA, journal-semantics or settlement-rule change; no Docker/`.env`/dependency/commit/push. Residuals as **B35** |
| 2026-10-27 | P4-08: business-rule coverage gap matrix + focused tests | **§5K**. Re-walked the 45-rule inventory (§5D) against current spec files → **34-rule gap matrix** classified `N/F/C/X/L` across booking, marketplace, payments/refunds, subscriptions, notifications, settlements, accounting. **23 new tests, 0 production changes, 0 new defects:** `gl-period-lock.spec.ts` **9/9** (org period authoritative even when closed, closed rejection, platform fallback/scope, missing period, `validateOpenPeriod`, org isolation), `booking-refund-boundaries.spec.ts` **9/9** (over-refund clamp, zero refund, 2-dp proration, null cases, exhausted/negative capacity), `accounting-posting-idempotency.spec.ts` **+3** (B35 occurrence identity, handler swallow, manual re-delivery), `booking-settlement-unification.spec.ts` **+2** (B35 recovery projection vs posting skip). Focused financial+accounting+settlement+booking **729/729** (65 files), marketplace+payment+notifications **478/478** (56 files), `tsc` 0, `lint:gate` PASS. Remaining gaps routed: B5→P5-02, B8→P7-02, B28→P7-02/P7-09, B31/B32/B35 documented; no schema/data/Docker/`.env`/dependency/commit/push |
| 2026-10-27 | P4-09: schema integrity vs baseline, migrations and live metadata (read-only) | **§5L**. Parsed the baseline (328 tables), **210** migrations (209 `CREATE TABLE`, 314 column adds, 6 later-dropped tables), 8 seeds, `docker-entrypoint.sh`, `migrate.sh` and the migration guard; diffed against live `courtzon_v3` metadata (330 tables / 3,674 columns / 1,334 indexes, `information_schema` SELECT only); extracted SQL table/column references from **735** production TS files. **Verified:** 0 baseline tables/columns missing live; 0 runtime DDL; 0 invented reachable table refs; Phase-4 columns/indexes (`uk_dedup`, recovery, `payment_allocations`) present; 6 retired tables correctly absent; chain fully production-safe. **Confirmed defects:** **S-01 Critical** — baseline missing `payment_allocations` + **45** migration-added columns while the entrypoint stamps the chain as applied on a fresh DB; **S-02/03/04 High** — org payment-settings, mobile push and resource-maintenance endpoints use non-existent columns; **S-05/06 Low** — dead HR/activity code. **B35 provenance** traced to migrations 113/117 + seed 005 (2200/1160), harmless because only supplied concepts materialise. **Unresolved:** 179/210 hash mismatches, 201/211 files edited after apply, `103b_coa_cleanup.sql` missing from repo/archive/git, duplicate numeric prefixes. **No DB writes, no production change.** Validation: focused **68/68**, read-only mapping integration **31/31**, `tsc` 0, `lint:gate` PASS. Risks **B36** (baseline/deploy) and **B37** (endpoint schema mismatches) added |
| 2026-10-27 | P4-10: Phase 4 evidence package (documentation-only) | **§5M**. Consolidated P4-01…P4-09 into a 10-row evidence summary and a **36-row traceability matrix** (task/area, defect/risk, evidence + test refs, status, follow-up); derived totals: **15 fixed defects**, **161 recorded new focused tests**, **6 open P4-09 code/schema defects**, 5 closed/resolved risks, 8 open Phase-4-relevant risks + all global risks preserved. Reconciliation: **D-1** — §6 P4-03 recorded 333/333 vs §13/§15/§17E 336/336; a read-only re-run produced **336/336 (25 files)**, §6 corrected with a pointer and the discrepancy disclosed; **D-2** — §15 missing P4-04/P4-05 rows, backfilled from §17F/§17G; no other numeric/status contradictions. **B36 (Critical)** and **B37 (High)** recorded as open release-blocking follow-ups; Phase 4 marked 10/10 with acceptance met for the audit scope only. Documentation-only; no DB/Docker/Git operation, no commit/push |
| 2026-10-27 | P5-01: payment lifecycle map + Phase 5 test matrix (analysis-only) | **§5N**. Traced 12 payment flows (booking card/prepare/cash, recurring series, marketplace, org subscription, membership, academy, tournament, wallet top-up, refunds, settlement/reconciliation) and recorded the authoritative `payment_transactions` model (8-state enum, final-state guard, conditional `FOR UPDATE` outcome, `uk_idempotency_key`/`uq_gateway_reference`, no partial-refund column). Produced the **45-row Phase 5 matrix** (`EXISTS/EXTEND/MISSING/BLOCKED`, owning task) and scoped P5-02 (HMAC) / P5-04 (Sandbox). **New open findings:** **B38** (gateway charge before local row + `Date.now()` in `special_reference` → concurrent same-key double-charge), **B39** (webhook replay marked before processing → failed retries skipped), **B40** (single-payment partial refunds terminal/no refunded amount). **B5/B7** scoped, **B36** preserved as fresh-DB prerequisite. Validation: payment unit suite **38/38** (7 files, no DB writes); read-only schema inspection; no integration/Sandbox/fresh-DB run. No code/schema/DB/Docker/commit changes |
| 2026-10-27 | P5-02: Paymob webhook HMAC positive/negative tests | **§5O**. Added **65 unit tests in 3 files**: 55 for `PaymobGateway.verifyWebhook` (Intention 20-field and Accept **23-field** exact order; both valid; every signed field mutated individually; absent/null fields → `''`; unsigned fields ignored; incorrect/empty/truncated/over-long/non-hex/uppercase/whitespace/null/undefined signatures; missing/empty secret fails closed; no secret logging), 3 service-level (invalid signature → no repository read, no payment events) and 7 controller-level (401 + no success audit, query/header signature precedence, 400/500 mapping). **Confirmed and fixed B41:** null/undefined signature threw `TypeError … reading 'slice'` in the mismatch logger; normalized to `''` in both branches with exact string-equality preserved (new test failed first; `paymob-gateway.ts:387`). Results: new files **65/65**; payment+gateway **103/103** (10 files); backend `tsc` 0; `lint:gate` PASS (711/3,377). No Paymob/Sandbox calls, no DB writes, no Docker/commit. **B5 partially resolved** (HMAC portion; timing-safe compare and other negatives remain); B38/B39/B40 untouched |
| 2026-10-27 | P5-03: gateway failure/retry/idempotency + route authorization | **§5P**. Added **52 unit tests in 3 files**: gateway failure/timeout/idempotency **11**, webhook replay **4**, `/payments/*` authorization **37**. **B38 reproduced at unit level** (two concurrent same-key charges both reach the gateway before persistence; only the second local insert fails) — remains **OPEN**, no fix. **B39 reproduced at unit level** (replay key persists after processing failure → retry dropped; Redis down skips dedupe) — remains **OPEN**, no fix. Covered explicit failure/timeout, paid/pending idempotency short-circuits, duplicate insert, already-paid confirm, final/lost-update state handling; real `authMiddleware`/`requirePermission` over 12 protected routes × 401/403/200 + public webhook, permissions derived from `payment.routes.ts`. Results: new **52/52**; payment+gateway **155/155** (13 files); `tsc` 0; `lint:gate` PASS (711/3,377). No production change, no provider/DB/Docker/commit |
| 2026-10-28 | P5-04 decision + P5-05 offline Sandbox lifecycle | **§5Q**. Recorded the user's explicit approval of **limited, user-confirmed evidence** for P5-04 (Paymob dashboard in Test mode, Test-labelled Public/Secret keys, integration `5663993`, successful Hostinger test), with limitations: credential scope and HMAC availability unverified, `PAYMOB_SANDBOX` is config state only, host unchanged, and no payment/refund/webhook path exercised by the assistant. Began P5-05 within local-only limits: new `paymob-sandbox-lifecycle.spec.ts` drives the real gateway (intention → checkout URL → webhook HMAC → status poll → refund → refund-state recovery) against a **fully stubbed `fetch`**, asserting the allowlisted origin, fail-closed behaviour and rejection of a disallowed base-URL override. Results: new file **15/15**, gateway+payment group **102/102** (6 files), `src/modules/payment` **100/100** (12 files), `tsc --noEmit` **exit 0**. **Deferred** (never PASS): real Sandbox charge/3DS, real webhook delivery, provider refund timing, credential-scope proof, fresh-DB evidence (**B36**). Score per §6: 47 → **48** DONE, Phase 5 **4/10 (40 %)**. No secrets/network/DB/Docker/Git operations; no production-code change |
| 2026-10-28 | P5-06: booking-slot protection + single-booking expiry path | **§5R**. Verified the two protection layers offline: `booking-slot-availability.spec.ts` (**8**) asserts the real `checkSlotAvailability` SQL contract against a stub connection — `resources` `FOR UPDATE` first, `pending_payment` still blocking (only `cancelled/expired/no_show` excluded), strict overlap operators, multi-slot summation, overnight wrap branch, academy-hold blocking with expired-hold/self exclusion. Matrix **#21 closed** by `booking-payment-expiry-listener.spec.ts` (**10**): one `CancelBooking`/`PAYMENT_TIMEOUT` for `pending_payment`/`pending`, terminal/missing/unrelated skipped, `booking_series` delegated, no throw on command failure, no double-cancel on duplicate events or double registration. Mutation proof: adding `pending_payment` to the exclusion list → **1 failed / 7 passed**, file restored byte-exactly (SHA-256 verified). Results: new **18/18**; with expiry specs **31/31** (4 files); booking unit module **320/320** (23 files); `tsc --noEmit` **exit 0**. Real-concurrency proof remains the P4-03 run (**16/16**, not re-executed — DB writes forbidden). No production change, no DB/Docker/Git/network/secret operation. Score per §6: 48 → **49** DONE, Phase 5 **5/10 (50 %)** |
| 2026-10-28 | P5-07: no duplicate accounting postings (idempotency) | **§5S**. Verified the posting guard offline with the **real** listener + `postAccountingEvent`: true **concurrent duplicate race** (2 and 4 simultaneous postings → exactly one journal, one commit, one `accounting:entry-recorded`; losers roll back on `ER_DUP_ENTRY`; GL projection once), **identity scope** (different event type / source id / source type each post independently), **retry semantics** (hard failure throws + claims nothing, retry posts once; duplicate rejection never re-posts), and **duplicate domain-event delivery** (`settlement:paid` → `settlement_paid` + `settlement_org_receipt` once each; `payment:gateway-settled` once; settlement + reversal distinct and each once; zero-id/zero-amount ignored). Mutation proof: disabling the `ER_DUP_ENTRY` rollback branch → **4 failed / 10 passed**, file restored byte-exactly (SHA-256 verified). Results: new **14/14**; with P4-07/P4-08 idempotency specs **23/23**; financial unit suite **375/375** (37 files); `tsc --noEmit` **exit 0**. **Limitations:** race simulated at the persistence boundary (no DB writes); durable guarantee = `uk_dedup` read-only evidence (P4-07); **B35-1** (no occurrence ordinal → a second legitimate same-event posting is skipped) and **B35-3** (no automatic retry) remain open. No production change, no DB/Docker/Git/network/secret operation. Score per §6: 49 → **50** DONE, Phase 5 **6/10 (60 %)** |
| 2026-10-28 | P5-08: stock restoration, refunds and reconciliation | **§5T**. Offline verification. **Stock guards confirmed** (`stock-restore-race.spec.ts` **7**): sequential duplicate failure restores once, paid/terminal/missing orders never restore, multi-line restore uses ordered quantities. **B31 CONFIRMED (open, characterized):** two concurrent `payment:failed` deliveries both pass the guard → stock 10 → 14 for two 2-unit lines; minimal fix (order `stock_restored_at` conditional claim or order-row lock) proposed in §5T.2, **not implemented**. **Refund boundaries** re-run `booking-refund-boundaries.spec.ts` **9/9**; DB-writing refund crash-window/race suites **NOT RUN**. **Reconciliation (L-5 gap closed)** `reconciliation-invariants.spec.ts` **16**: gateway-paid CRITICAL/auto-fixable vs failed/unreachable fail-safe, booking mismatch WARNING, wallet CRITICAL, orphan WARNING, COD INFO, settled-refund 1120/1100 invariant (pass/violation/rounding), missing settled variant, tournament lineage, counters, autoFix only on auto-fixable and never report-only, contained auto-fix failure, escaped date filters, `RECONCILIATION.RUN` audit. Mutation proof: bypassing the settled-refund invariant → **2 failed / 14 passed**, file restored byte-exactly (SHA-256 `797AC776…C922`). Results: new **23/23**; combined **41/41** (4 files); payment+marketplace unit **341/341** (35 files); `tsc --noEmit` **exit 0**. **B40** and **B31** remain open; reconciliation SQL not executed (stubbed pool); gateway totals/fees/payables → P5-09. No production change, no DB/Docker/Git/network/secret operation. Score per §6: 50 → **51** DONE, Phase 5 **7/10 (70 %)** |
| 2026-10-28 | B31 fix: atomic cancel claim + transactional stock restore | **§5U**. **Root cause:** cancel/failure/cleanup paths restored stock then wrote the terminal status with no claim or transaction; `updateOrderStatus` was unconditional. **Fix (no schema change):** terminal `updateOrderStatus` is now a conditional claim (`AND status NOT IN ('cancelled','refunded')`, returns `affectedRows > 0`); new `_cancelOrdersWithStockRestore()` runs claim → restore → history in ONE `withTransaction`, used by `handlePaymentFailed`, `_cancelOrdersAfterFailedCheckout` and `cancelAbandonedOrders`; manual cancel/sibling paths skip restore when the claim is lost; removed the unused read-then-write helpers. Deadlocks avoided by locking order rows ascending first, then product rows. **Tests:** `stock-restore-race.spec.ts` **10/10** (2/4 concurrent duplicates, sequential retry, independent orders, group, crash-rollback+retry, paid/terminal guards, multi-line, overlapping cleanup), marketplace+payment **344/344** (35 files), `tsc` **0**; full backend suite **4055 passed / 8 failed (all pre-existing: B28 proxy-contract 2 + B8 date fixtures 6)**. Fail-before: removing the claim gate → **4 failed / 6 passed**, file restored byte-exactly (SHA-256 verified). No DB write/Docker/Git/network/secret operation; real-MySQL concurrency run **NOT RUN** |
| 2026-10-28 | P5-09: gateway clearing, fees, payables, settlements | **§5V**. Offline verification (no DB writes). **Fees/net:** real `_computeFee` **14 tests** (pct/fixed/mixed, 2-dp rounding, zero gross, missing config → `missing`, non-gateway methods, fee>gross boundary). **Batch creation:** real `create()` against a scripted transaction **18 tests** — header = Σ lines, one clearing→bank posting in-tx, duplicate-id dedupe, already-linked/ACTIVE-line/lost-UPDATE duplicates rejected with no insert/posting, eligibility+fee guards, later-line failure rolls back with no partial journal. **Reversal:** stored amounts posted once, already-reversed rejected, concurrent linkage change aborts without commit. **Reconciliation:** real `GatewaySettlementReconciliationService` **15 tests** — 9 report-only checks (header vs ACTIVE lines, count, ownership, linkage, refunded-active, pointer mismatch, refunded tournament, unsettled-after-draw-lock WARNING, duplicate ACTIVE ownership), 2-dp tolerance, 200 cap, counters, per-discrepancy audit. **NEW DEFECT B42 (High, OPEN):** mixed-currency selections are accepted — `create()` sums across currencies and stamps the batch/journal with `lines[0].currency`; minimal fix proposed in §5V.3 (**not implemented**, needs approval). Results: settlement **101/101** (9 files), `tsc` **0**. DB-writing settlement integration suites **NOT RUN**. No production change, no DB/Docker/Git/network/secret operation. **P5-09 = IN_PROGRESS**, score unchanged **51/100** |
| 2026-10-28 | B42 fix: single-currency gateway settlement guard | **§5V.3**. `create()` now rejects mixed-currency selections with the existing `ConflictError` **before** totals/inserts/accounting; no conversion, no schema change. Regression suite converts the characterization into 4 tests (mixed EGP/USD rejected before persistence and posting, order-independent; single-currency EGP+EGP and USD+USD still create correctly). Fail-before: removing the guard → **2 failed / 19 passed**; file restored byte-exactly (SHA-256 `57B2F3AB…CF179F`). **Fee-boundary decision:** `fee ≥ gross` is NOT established as invalid by any existing rule/constraint, so **no restriction added** — recorded as an accepted configuration risk (§5V.4). Results: settlement **104/104** (9 files), full backend **4105 passed / 8 pre-existing failures** (B28 2 + B8 6), `tsc --noEmit` **exit 0**. **P5-09 = DONE** (DB-writing settlement suites **NOT RUN**); score per §6: 51 → **52** DONE, Phase 5 **8/10 (80 %)** |
| 2026-10-28 | P5-10: Phase 5 evidence ledger (mocked vs Sandbox vs not-run) | **§5W**. Documentation-only. Six evidence classes defined (**A** offline automated, **S** source inspection, **I** earlier real-DB integration, **U** user-confirmed external, **X** independently executed Sandbox, **N** not run/deferred) and applied to every Phase 5 item with exact results and limitations. Aggregate re-executed in this task: **16 Phase 5 spec files → 246/246 PASS**; settlement module **104/104**; `tsc --noEmit` **exit 0**; full backend **4105 passed / 8 pre-existing failures** (B28 2 + B8 6). External ledger: **U** = Test-mode dashboard, Test-labelled Public/Secret keys, integration `5663993`, successful Hostinger test (no request/response evidence; not independently verified); **X = 0** — no Paymob call was ever made by the assistant; real Sandbox lifecycle **DEFERRED**; credential scope/HMAC **not established**; fresh-DB **BLOCKED (B36)**. Risks preserved: fee≥gross, B38/B39/B40, B5, B35, B36/B37, B7, DB-writing settlement/refund suites **NOT RUN**, 32 container suites **BLOCKED**. No mocked or user-confirmed item upgraded to Sandbox; Phase 5 acceptance **NOT MET**. Score per §6: 52 → **53** DONE, Phase 5 **9/10 (90 %)**. No production/DB/Docker/Git/network/secret operation; changed file: this progress document only |
| 2026-10-28 | P6-02: persist the E2E scenario matrix | **`docs/release/E2E_SCENARIO_MATRIX.md`** — new 33-row traceable matrix (role, setup, action, expected, cleanup, spec file:line, class, status) for P6-04…P6-09, plus env prerequisites, coverage gaps, data-safety model and execution gating. Static inspection only: 12 specs / **26 tests** (count verified), no test executed and no result claimed. Findings: **stale wallet fixture** (`e2e/data/courts.ts:108` vs `payment.service.ts:102–105`) blocks B2/B3/D1; **fake-card payment spec** (`4242…`) is MockGateway-only (C1 blocked by P5-05); **destructive SQL** in `tournament-venue-flow.spec.ts:38–40` blocks B6 (P7-02); **two Playwright configs** (root webServer vs `e2e/` projects) require explicit `--config`; missing coverage: RBAC/session/org isolation, marketplace/subscriptions/accounting/refund UI, reports/settlements, axe a11y, realtime. Gating: T1 read-only runnable, T2 needs DB-write approval, T3 mock-only or deferred Sandbox, T4 blocked. Score per §6: 53 → **54** DONE, Phase 6 **3/10 (30 %)**. No production code, DB, Docker, Git or network operation |
| 2026-10-28 | E2E stale wallet fixture fix (narrow scope) | Replaced the unsupported `paymentMethod:'wallet'` fixture with **`cash`** in `e2e/data/courts.ts:108` (`bookingPayload`) and the identical inline literal in `e2e/scenarios/notifications/notification-deeplink.spec.ts:46`. **Verified statically:** `cash` is an allowed `CreateBookingSchema` value (`booking.dto.ts:26`); wallet is explicitly rejected server-side (`booking.service.ts:371`, `payment.service.ts:102–105`); `cash`/`cod` are the non-gateway path (`booking.service.ts:373,478–480`), so the fixture no longer needs Paymob or a charge. **No test executed; no scenario claimed.** A safe `playwright test --list` (enumeration only, no execution) exposed two **pre-existing, unfixed** blockers: (a) 7/12 specs import `../../fixtures/auth` but only `e2e/fixtures/auth.fixture.ts` exists → **0 tests discovered**, so A3, B1, B2, B3, C1, C2, D1 cannot load; (b) the HTML reporter folder clashes with the test output folder. **B2** additionally calls a non-existent `PATCH /bookings/:id/confirm` (`booking.routes.ts:6–63`). B3/D1 remain **BLOCKED** (load failure), not runnable. Matrix updated accordingly. No production code/DB/Docker/network/Git; score unchanged **54/100** |
| 2026-10-28 | E2E auth-fixture import fix (narrow scope) | Corrected the import in the **7 affected specs** from `../../fixtures/auth` (non-existent) to `../../fixtures/auth.fixture` — the existing module that exports `test`/`expect` and the `authenticatedPlayer` / `authenticatedAdmin` fixtures each spec already uses: `admin-dashboard` (A3), `create-booking` (B1), `cancel-booking` (B2), `public-match` (B3), `payment-flow` (C1), `wallet-topup` (C2), `notification-deeplink` (D1). No duplicate fixture, no new exports, no test-logic change. **Verified:** static grep shows 0 remaining `fixtures/auth` imports; `npx playwright test --list --config e2e/playwright.config.ts` (discovery only, **no execution**) now reports **52 tests in 12 files** with **no module-load errors**. The pre-existing reporter/output-folder configuration error remains (**out of scope**); B2 still calls a non-existent `PATCH /bookings/:id/confirm`; B6 destructive SQL unchanged; C1/C2 remain mock-only or P5-05-dependent. **No test executed; no scenario claimed.** Score unchanged **54/100** |
| 2026-10-28 | Playwright reporter/output collision fix (config-only) | **Root cause:** `e2e/playwright.config.ts` put the HTML report at `test-results/e2e/html` while the test output folder defaulted to repo-root `test-results` — the report folder was nested inside the folder the HTML reporter clears, so Playwright refused with a configuration error. **Fix (one added line):** `outputDir: '../test-results/e2e/artifacts'`, making artifacts and html **siblings** under `test-results/e2e/`; reporters, `testDir`, `testMatch`, projects, timeouts and discovery are unchanged, and neither config was merged/removed. **Verification (discovery only, no tests executed):** `npx playwright test --list --config e2e/playwright.config.ts` → **52 tests in 12 files**, no configuration error; `npx playwright test --list --config playwright.config.ts` → **26 tests in 12 files**, no configuration error. No DB/network/Docker/Git; score unchanged **54/100** (discovery is not E2E evidence) |
| 2026-10-28 | B2 root-cause analysis (read-only) | Traced the scenario's `PATCH /bookings/:id/confirm` call (`cancel-booking.spec.ts:40–41`): **no such route is registered** (`booking.routes.ts:9–20`; routes are `POST /bookings`, `/prepare`, `/delete prepare`, `GET /:id`, **`POST /:id/cancel`** `:14`, `PATCH /:id/status` `:16` [admin/org only], `PATCH /:id/payment`). The correct contract is `POST /bookings/:id/cancel` (`bookings.cancel`, `{reason}`, response **200 + booking** — `booking.controller.ts:109–126`, `booking.service.ts:975–1037`); the frontend already uses it (`BookingDetailPage.tsx:69`, `MyBookingsPage.tsx:54`). The confirm step is **obsolete**: cash bookings are created `confirmed` (`booking.service.ts:478–480`; `:373`), and card/wallet confirm via the payment webhook. The same obsolete call exists in the unused fixtures `booking.fixture.ts:94` / `payment.fixture.ts:63–65`. **Conclusion: obsolete test contract, not an application defect.** Recommended (not applied): delete `cancel-booking.spec.ts:40–41` (optionally assert the created booking is `confirmed`). Note: a `409` is possible if a DB cancellation policy exceeds the ~3-day fixture lead time. No code/test/DB change; score unchanged **54/100** |
| 2026-10-28 | B2 correction (spec-only) | Removed the obsolete `PATCH /bookings/:id/confirm` request and its `200` assertion from `e2e/scenarios/booking/cancel-booking.spec.ts` (former lines 40–41). Creation → UI-cancel flow, all other assertions, fixtures and imports are unchanged; no `/confirm` endpoint was added and no production code was touched. **Verified:** the file no longer contains `api.raw`/`/confirm`; `npx playwright test --list --config e2e/playwright.config.ts` (discovery only, **no execution**) still lists the B2 test under `critical` and `all` and reports **52 tests in 12 files** with **no configuration error**. **B2 remains NOT RUN/unverified** and still needs DB-write approval + a running stack; a `409` is possible if a DB cancellation policy exceeds the ~3-day fixture lead time. No DB/network/Docker/Git; score unchanged **54/100** |
| 2026-10-28 | A6/A7/A8 readiness review (read-only) | Inspected auth routes/controllers/service, session repository/cookies, permission middleware and resolution, org-access guards, RBAC routes and existing tests. **A6 READY TO WRITE:** `requirePermission` 401/403 (`auth.middleware.ts:37–50`), `adminGuard` (`:73–74`), permission resolution (`app.ts:261–274`); denied player → `GET /admin/users` (adminGuard, `rbac.routes.ts:26`), `PATCH /bookings/:id/status` (`booking.routes.ts:16`), `POST /payments/:id/refund` (`payment.routes.ts:13`); admin allowed `GET /admin/users`; UI `Access denied` (`RouteGuards.tsx:7–14`, `AdminLayout.tsx:24–49`, `adminRoutePermissions.ts:27`). Only player/admin fixtures exist. **A7 READY:** DB-backed session resolution (`app.ts:226–248`) makes `logout {allDevices:true}` (`auth.service.ts:565–583`, `auth.controller.ts:201–217`) immediately revocable in a second context; refresh rotation (`:550–563`); expiry timing remains integration-only (`session-expiry.integration.spec.ts`, NOT RUN). **A8 READY TO WRITE:** `canAccessOrganisation`/`findAccessibleOrgIds` (`org-access.ts:25–69`), guards (`route-guard.ts:21–80`), representative routes (`booking.routes.ts:19`; `accounting.routes.ts:14–20`; `unified-settlement.controller.ts:58–63,72–77`). All three require **DB-writing** fixtures (class W); no test executed. Matrix §3.1/§3.1a updated; no score change (**54/100**) |
| 2026-10-28 | A6/A7/A8 E2E specs authored (not executed) | New `e2e/scenarios/auth/authz-session-isolation.spec.ts` (**7 tests**): **A6** player allowed `POST /bookings` + denied `GET /admin/users`, `PATCH /bookings/:id/status`, `POST /payments/:id/refund` (403) and the UI **Access denied** surface; admin `GET /admin/users` 200 + UI renders. **A7** two sessions for the same user: logout-all revokes the other immediately (`/auth/me` → `{user:null}`, protected call 401), single logout does not, refresh rotates and rejects old-token reuse, refresh after revocation 401 — no expiry wait. **A8** two orgs/users: B denied on A's bookings (403, no `data`) and accounting dashboard; owner A allowed on both. Sessions are seeded directly (hashed `user_sessions`, existing tournament-spec convention) and roles via inline `user_roles` inserts (existing convention) to bypass two **pre-existing fixture/login mismatches** discovered while authoring: `insertUser` stores local `full_phone` while login expects country-code-prefixed (`auth.service.ts:520–529`), and admin login uses an email rejected by `LoginSchema` (`auth.dto.ts:28–29`). **Verification:** static/discovery only — `playwright test --list --config e2e/playwright.config.ts` → **59 tests in 13 files**, all 7 new tests listed, no config/module errors. **Not executed** (DB-write window + stack approval); score unchanged **54/100**. No production code/DB/network/Docker/Git |
| 2026-10-28 | E2E auth-fixture fix (phone-only login contract) | **1)** `e2e/helpers/database.ts::insertUser` now reads `countries.phone_code`, normalizes it to a leading `+` (same normalization as `authService.login`, `auth.service.ts:520–523`) and stores `full_phone = +<code><local 11-digit>` instead of the bare local number; `phone_number` stays local. Registration parity: `auth.service.ts:58,103,151` stores `countryPhoneCode + local`. **2)** `e2e/data/users.ts::testUsers.admin()` now returns a valid 11-digit `phoneNumber` + password + full name/email (no email-based login). **3)** `e2e/fixtures/auth.fixture.ts::authenticatedAdmin` creates a dedicated user via `insertUser`, grants `super_admin` via the existing inline `user_roles` convention, logs in with phone/password and accepts the `/admin` landing (with `/app` fallback) — the `api.login(email)` call was removed. **4)** `authz-session-isolation.spec.ts` admin test now provisions its own admin actor instead of querying a seeded email. **Verified statically:** discovery (`playwright test --list --config e2e/playwright.config.ts`, no execution) → **59 tests in 13 files**, all 7 A6–A8 tests plus admin/cancel specs listed, no config/module errors. **No tests executed**; no DB/schema/seed/production changes; score unchanged **54/100** |
| 2026-10-28 | E2E `api.login` + test-phone format fixes (test helpers only) | **1) `e2e/helpers/api.ts::api.login`** now posts `{phoneNumber: <local digits>, password, countryCode}` — the production contract (`LoginSchema`, `auth.dto.ts:28–31`; `authService.login`, `auth.service.ts:520–529`; web client `LoginPage.tsx:58–63`). Default `countryCode = '+20'`, traced to country 1 = Egypt (`database/seeds/001_baseline.sql:154`), the same row `insertUser` reads, so seeded `full_phone` and the login prefix agree; callers may override it as a 3rd argument. A `+…` input now throws a clear error instead of being double-prefixed or wrongly re-split. **2) `e2e/data/users.ts`** — `player`/`coach`/`seller`/`secondPlayer` generated **16-digit** numbers (`'01000000' + 8 digits`), rejected by `localPhoneNumberSchema` (11 digits, `shared/validation/local-phone.ts:5,10`) and the form rule `localPhoneZod` (`frontend/src/utils/phone.ts:10`); all four now use a 3-digit Egyptian prefix + 8 digits (11 total), matching the already-correct `testUsers.admin()`. **Callers audited (9):** `e2e/fixtures/booking.fixture.ts:47,88`, `organisation.fixture.ts:44`, `payment.fixture.ts:57`, `scenarios/booking/cancel-booking.spec.ts:21`, `scenarios/match/public-match.spec.ts:25,57,88`, `scenarios/notifications/notification-deeplink.spec.ts:25`, `scenarios/payments/payment-flow.spec.ts:23` — all pass 11-digit local numbers sourced from `testUsers`/`insertUser` (countryId 1), none pass `+…`, so no caller change was required. **Verified statically:** grep → 0 international inputs at `api.login` call sites; arithmetic check of prefix + 8 padded digits = 11 for `010/011/012/015`; `npx playwright test --list --config e2e/playwright.config.ts` (discovery only, **no execution**) → **59 tests in 13 files**, no config/module errors. **Not executed** (needs DB-write window + running stack); no production code/DB/schema/seed change; score unchanged **54/100** |
| 2026-10-28 | Super Admin bootstrap corrected against the v3 schema (script-only, not executed) | **Mismatches found** in `backend/scripts/bootstrap-admin.js` vs `database/baseline/001_courtzon_v3.sql:6685–6720`: **(1)** `users.name` → real column `full_name`; **(2)** `users.role` → no such column (roles live in `user_roles`); **(3)** `users.is_active` → real column `account_status` ENUM; **(4)** `users.email_verified_at` → real column `is_email_verified` TINYINT; **(5)** five NOT NULL/no-default columns never supplied: `public_id`, `country_id`, `phone_number`, `full_phone`, `gender`; **(6)** the `salt:sha256(password)` hash is rejected by `verifyPassword`, which only accepts `$pbkdf2-sha512$…` (`backend/src/shared/utils/password.ts:16–27,29–34`); **(7)** email was treated as the login identity although login is phone-only (`full_phone` lookup — `auth.service.ts:520–529`, `user.repository.ts:68–84`); **(8)** `user_roles.created_at` does not exist (real: `assigned_at` default) so the grant insert would fail; **(9)** the role lookup also tried the non-seeded `super-admin` slug and ignored `organisation_id IS NULL`. **Correction (script only):** requires `SUPER_ADMIN_PHONE` (local 11 digits, mirroring `localPhoneNumberSchema`), `SUPER_ADMIN_COUNTRY_ISO`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_EMAIL` (profile only) plus optional `SUPER_ADMIN_NAME`/`SUPER_ADMIN_GENDER`; resolves `countries.id`/`phone_code` by ISO and `roles.id` by `slug='super_admin' AND organisation_id IS NULL` (no hardcoded IDs); builds `full_phone = +<code><phone>`, locates by `full_phone`, inserts exactly the 8 required `users` columns (`public_id` via `randomUUID()`), hashes with the same PBKDF2-SHA512 v2 layout, and grants with `INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, NULL)`. Never logs phone/email/password values. **Verified statically:** `node --check` → exit 0; column-set diff vs baseline → no unknown columns and no uncovered NOT NULL columns; hash constants/layout line-identical to `password.ts`. **Not executed — no DB connection/write and no Super Admin created.** Env samples still list only `SUPER_ADMIN_EMAIL/PASSWORD` (`deployment/env/.env.example:80–83`, `deployment/coolify/.env.production:60–61`, `docs/deployment/environment_matrix.md:41–42`) and must be updated before the script can run. Score unchanged **54/100** |

## 16. Next task

**P6-02 is complete (`docs/release/E2E_SCENARIO_MATRIX.md`). The next plan item is P6-04 — auth/session/role/
permission scenarios — but it is an execution task and is currently blocked; do not start it without the
prerequisites below.**

1. **Ordering blocker (plan §4.1/§4.5):** Phase 5 acceptance is still **NOT MET** because **P5-05's external
   Sandbox lifecycle is DEFERRED**. P6-02 was a non-execution documentation artifact; the next tasks execute real
   UI/DB flows and should not start until P5-05 is either executed or its limitation is explicitly accepted in
   writing.
2. **Execution prerequisites for P6-04:** running frontend + backend (the task implies the local stack; this
   requires an explicit Docker/stack go-ahead), explicit approval for **DB-writing** fixtures on `courtzon_v3`, and
   the A6–A8 specs — now **authored but not executed** (matrix §3.1a; 7 tests in
   `e2e/scenarios/auth/authz-session-isolation.spec.ts`) — must be run and their results recorded. The
   fixture/login defects found earlier were fixed on 2026-10-28 (phone-format seeding, phone-based admin fixture,
   `api.login` sending `countryCode`, and 16→11-digit test phone numbers), so login-dependent specs no longer depend
   on a broken helper. One assumption stays **unverified**: the login page pre-selects the country from
   `useDetectedCountry`/`/public/geo/currency` (`LoginPage.tsx:51–53`). For a non-public client IP that endpoint falls
   back to the platform default currency (`geo.service.ts:171–174,237–238`, EGP → `EG`), which matches the seeded
   country 1; this must be confirmed in a real browser run before `admin-dashboard`/`cancel-booking` are trusted.
3. **Safe subset if authorised without the full campaign:** T1 read-only rows only — A2 (invalid login), A4
   (unauthenticated guards), A5 (health/frontend), B4/B7/E1/E2 (public tournament read-only) — provided at least one
   public tournament exists. No DB writes, no gateway.
4. **Blocked rows to fix before their P6 tasks:** the `cancel-booking` obsolete `PATCH /bookings/:id/confirm` call was
   removed on 2026-10-28 (spec-only; see matrix §3.2a) — B2 is now a normal T2 DB-writing row, **still unverified**
   until executed with approval. Destructive SQL in `tournament-venue-flow.spec.ts:38–40` blocks B6. The wallet
   fixture, the broken `fixtures/auth` imports, and the Playwright reporter/output-directory collision were fixed on
   2026-10-28 (discovery: **52 tests / 12 files** under `e2e/`, **26 / 12** under the root config, no config error);
   gateway rows C1/C2 remain mock-only or P5-05-dependent.
5. **B36** remains a release blocker for fresh-deploy/Phase 9 verification.
6. Preserve: no provider call without approval, no schema/data change, no Docker unless explicitly authorised, no
   commit/push, no `.env` change.
7. **Super Admin bootstrap:** `backend/scripts/bootstrap-admin.js` now matches the v3 schema and the phone-only login
   contract (2026-10-28, **verify-only**), but it was **not executed** and no account was created. Provisioning still
   needs `SUPER_ADMIN_PHONE` + `SUPER_ADMIN_COUNTRY_ISO` added to the deployment env samples
   (`deployment/env/.env.example`, `deployment/coolify/.env.production`,
   `docs/deployment/environment_matrix.md`) and an explicitly approved run.

Open items routed later: **P5-05 external / B7**, **E2E fixture fixes** (wallet payload, destructive SQL → P6-10/
P7-02), **fee≥gross guard** (accept-or-fix decision), **B40**, **B38**, **B39**, **B35-1/B35-3**, **B5 residuals**,
**B36**, **B37**, **B8 → P7-02**, **B28 → P7-02/P7-09**, **B30/B32/B33**, **B19–B22**, **B13/B14/AR-2**.

## 17. P3-08 compliance record (completed 2026-10-27)

- Operation type: **TypeScript strictness measurement + staged plan** (P3-08). Planning/measurement
  only: no tsconfig/flag/dependency/backend/DB/Docker/`.env` change, no application refactor, no Phase 4
  work.
- Tooling: TypeScript **6.0.3** in both trees (`npx tsc --version`), Node **22.14.0**. Existing
  type-check paths: frontend `npm run build` → `tsc -b`; backend `npm run build` → `tsc`; CI `lint.yml`
  → `npx tsc --noEmit`.
- Baselines (confirmed, exit 0 in all cases):
  - frontend `npx tsc -p tsconfig.app.json --noEmit --pretty false` → **0 errors**;
  - frontend `npx tsc -p tsconfig.node.json --noEmit` → **0**;
  - frontend `npx tsc -b` (app + node references) → **0**;
  - backend `npx tsc -p tsconfig.json --noEmit --pretty false` → **0** (tests are excluded by config).
  - `npm run build` was deliberately **not** executed (it writes `dist/` and runs
    `generate-translation-artifact.js`); `tsc -b --force` / `tsc -p … --noEmit` are its exact type-check
    step and were run instead.
- **Premise corrected:** TS 6 enables the `strict` family by default. Standalone probes outside the repo
  (deleted afterwards) failed with TS2322 (`null` → `string`) and TS7006 (implicit `any`) under default
  options; `--strict false` cleared both; `npx tsc -p tsconfig.app.json --noEmit --strict` added **0**
  errors. The frontend is therefore already strict, and the backend has explicit `strict: true`.
- **CI gap found:** frontend `npx tsc --noEmit` exits 0 but checks **0 files** (`--listFilesOnly` empty)
  because the root `tsconfig.json` is references-only (`files: []`). The real check is `tsc -b` in the
  build (and `ci.yml`), so `lint.yml` alone does not type-check the frontend (**B19**). Backend tests are
  excluded from `tsc` and only transpiled by Vitest.
- Per-flag measurements (each `npx tsc -p <config> --noEmit --pretty false --<flag>`; error runs exit 2,
  zero-error runs exit 0). All counts below are **confirmed**, not hypothetical.

| Frontend flag | Errors | Top error codes | Representative files | Stage |
|---|---:|---|---|---|
| `noUncheckedIndexedAccess` | 304 | TS2532 110, TS2345 75, TS18048 49, TS2322 47, TS2722 19 | `navigation/parity/parity.test.ts` 31, `OrgAccountingRecordsPage.test.tsx` 18, `FinancialPositionPage.tsx` 17, `BookingModal.tsx` 12 | F4 |
| `exactOptionalPropertyTypes` | 140 | TS2375 93, TS2379 34, TS2345 6, TS2412 4 | `LandingPage.tsx` 14, `TournamentCreatePage.tsx` 11, `TournamentDetailPage.tsx` 10 | F3 |
| `noPropertyAccessFromIndexSignature` | 332 | TS4111 332 | `RuleSetVisualEditor.tsx` 37, `PlayerRegisterPage.tsx` 36, `BankSettingsTab.tsx` 35 | F5 (defer) |
| `noImplicitOverride` | 3 | TS4114 3 | `components/ErrorBoundary.tsx` | F1 |
| `noImplicitReturns` | 1 | TS7030 1 | `components/ConnectionStatus.tsx:19` | F1 |
| `allowUnreachableCode: false` | 0 | — | — | F1 |
| `allowUnusedLabels: false` | 0 | — | — | F1 |
| `skipLibCheck: false` | 7 | TS2503 7 | `node_modules/@dnd-kit/core/**/*.d.ts`, `@dnd-kit/sortable/**/*.d.ts` | N/A — dependency d.ts, not project code (B22) |

| Backend flag | Errors | Top error codes | Representative files | Stage |
|---|---:|---|---|---|
| `noUncheckedIndexedAccess` | 764 | TS18048 421, TS2532 238, TS2322 35, TS2345 32, TS2769 29 | `accounting.controller.ts` 77, `hr.controller.ts` 70, `booking.service.ts` 47, `tournament.repository.ts` 32 | B4 |
| `exactOptionalPropertyTypes` | 761 | TS2379 688, TS2375 29, TS2322 28, TS2345 8 | `organisation.controller.ts` 56, `academy.controller.ts` 45, `marketplace.controller.ts` 40 | B3 |
| `noPropertyAccessFromIndexSignature` | 2,234 | TS4111 2,234 | `socket-event-mapper.ts` 336, `membership-subscription.service.ts` 106, `marketplace.service.ts` 101 | B5 (defer) |
| `noUnusedLocals` | 196 | TS6133 161, TS6196 32, TS6192 3 | `booking.service.ts` 8, `year-closing.service.ts` 5 | B2 |
| `noUnusedParameters` | 105 | TS6133 105 | `notification-engine.ts` 11, `activities.repository.ts` 7 | B2 |
| `noImplicitReturns` | 1 | TS7030 1 | `src/app.ts:598` | B1 |
| `allowUnreachableCode: false` | 1 | TS7027 1 | `marketplace.service.ts:752` (dead code) | B1 |
| `noImplicitOverride` | 0 | — | — | B1 |
| `noFallthroughCasesInSwitch` | 0 | — | — | B1 |
| `allowUnusedLabels: false` | 0 | — | — | B1 |
| `skipLibCheck: false` | 0 | — | — | N/A — already clean, no blocker |

- Blast radius for the four large candidates (production vs test split, measured):

| Flag | Project | Total | Source | Tests | Top directories |
|---|---|---:|---:|---:|---|
| `noUncheckedIndexedAccess` | frontend | 304 | 121 (42 files) | 183 (35 files) | pages 133, components 70, navigation 39, utils 19, realtime 13 |
| `noUncheckedIndexedAccess` | backend | 764 | 764 (115 files) | n/a (excluded) | modules 742, shared 21, `app.ts` 1 |
| `exactOptionalPropertyTypes` | frontend | 140 | 118 (54 files) | 22 (7 files) | pages 90, components 38, navigation 4, store 3 |
| `exactOptionalPropertyTypes` | backend | 761 | 761 (150 files) | n/a | modules 744, shared 15, infrastructure 2 |
| `noPropertyAccessFromIndexSignature` | frontend | 332 | 282 (44 files) | 50 (6 files) | pages 268, utils 20, components 19, realtime 13 |
| `noPropertyAccessFromIndexSignature` | backend | 2,234 | 2,234 (149 files) | n/a | modules 2,094, shared 110, infrastructure 13, `app.ts` 12 |

- Interaction (measured unions — flags are **not** additive): frontend
  `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` = **455** while 140 + 304 = 444 (**+11**
  interaction errors); backend = **1,528** while 761 + 764 = 1,525 (**+3**). Running
  `exactOptionalPropertyTypes` first (F3/B3) and `noUncheckedIndexedAccess` second (F4/B4) keeps each
  stage's error list attributable to a single flag; the end state is identical.
- Explicit `any` inventory — the dominant typing gap, invisible to every `tsc` flag.
  `npx eslint . --format json` → `@typescript-eslint/no-explicit-any` **3,163** errors (**2,594** source /
  **569** tests): `src/pages` **2,415** (of which `src/pages/admin` **1,652**), `src/components` **419**,
  `src/realtime` **189**, `src/services` **101**, `src/store` **29**, `src/navigation` **3**, `src/utils`
  **3**, `src/hooks` **2**, `src/lib` **2**. Worst files: `OrganisationForm.tsx` 139, `CountriesPage.tsx`
  92, `useRealtimeCacheUpdates.ts` 81, `BranchListPage.tsx` 76, `UserEditModal.tsx` 57, `ProfilePage.tsx`
  52. ESLint uses `tseslint.configs.recommended` **without** `projectService`, so no type-aware linting
  exists today; no strictness stage below reduces this number (B21).
- `noUncheckedSideEffectImports` is **already active by compiler default** in TS 6 (verified: an
  unresolvable side-effect import reports TS2882 with *and* without the flag) and yields **0** project
  errors — not a candidate stage.
- Independent re-verification after the interrupted session (2026-10-27): all baselines re-run
  (`tsc -p tsconfig.app.json`, `tsc -p tsconfig.node.json`, `tsc -p tsconfig.json`, `tsc -b --force`, all
  exit 0), every per-flag command re-run, `allowUnusedLabels=false` and `skipLibCheck=false` measured for
  the first time, and the explicit-`any` inventory re-computed. **Every previously recorded count
  reproduced exactly**; the additions above are the only new findings.
- Already enabled (no additional errors): frontend `strict` family (incl. `noImplicitAny`,
  `strictNullChecks`, `strictFunctionTypes`, `strictPropertyInitialization`, `useUnknownInCatchVariables`),
  `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `erasableSyntaxOnly`,
  `verbatimModuleSyntax`; backend `strict` (explicit).
- Combined/stage measurements: frontend big pair (`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`)
  **455** errors (**205 in test files / 250 in source**); backend big pair **1,528**; backend
  `noUnusedLocals` + `noUnusedParameters` **301**; frontend Stage 1 **4**; backend Stage 1 **2**.
- Root causes (with representative sites):
  - **Index access:** arrays/maps/regex `match`/`split` results treated as always defined —
    `BookingModal.tsx:502/504` (`split(':')` destructuring leaves `last`/`h`/`m` possibly `undefined`),
    `FinancialPositionPage.tsx` (17), `booking.service.ts` (47), `tournament.repository.ts` (32, row
    mapping via `rows[0]`). Frontend test fixtures dominate: 183/304 of the flag's errors and 205/455 of
    the big-pair union are in test files.
  - **Exact optional properties:** optional properties explicitly passed as `undefined` instead of being
    omitted — `OrgSidebar.tsx:144` (`src: string | null | undefined` → `src?: string`),
    `DynamicResultForm.tsx:83` (`| null | undefined` → `?: ParticipantSide | null`),
    `queue.service.ts:219` (`jobId: string | undefined` into BullMQ `JobsOptions`). Backend is 90 %
    TS2379 (688/761), concentrated in controller DTO/option objects, so the durable fix is explicit `?`
    semantics at the mapping boundary — not 761 local edits.
  - **Index-signature property access:** `process.env.X` (`app.ts:96`, `sync-favicon.ts:77` global) and
    config/event records — `socket-event-mapper.ts` alone is 336 of the backend's 2,234 (event payloads
    typed as index signatures). Highest churn on both sides; needs typed env access + typed row/payload
    mappers rather than mass bracket edits.
  - **Overrides/returns:** React class lifecycle methods missing `override`; effect cleanup returning only
    on one branch (`ConnectionStatus`); Fastify error handler not returning on all paths.
  - **Unused/dead code:** unused imports/locals/parameters in backend services/controllers; dead code
    after an exhaustive return in `marketplace.service.ts`.
- Proposed rollout (each stage is a separate future task; **nothing enabled here**):

| Stage | Project | Flags / work | Measured errors | Dependency / rationale |
|---|---|---|---:|---|
| F0 | frontend | Pin `"strict": true` explicitly; change the lint job to `npx tsc -b`; add a real `typecheck` script | 0 | Makes the TS 6 default explicit and closes B19; prerequisite for upgrades |
| B0 | backend | Add a test tsconfig so `__tests__`/`*.spec.ts` are type-checked | not measured | Tests currently excluded; prerequisite for trustworthy backend counts |
| F1 | frontend | `noImplicitOverride`, `noImplicitReturns`, `allowUnreachableCode: false`, `allowUnusedLabels: false` | 4 | Small, local, low risk; adopt first |
| B1 | backend | `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `allowUnreachableCode: false`, `allowUnusedLabels: false` | 2 | Small; `allowUnreachableCode` exposes dead code |
| F2 | frontend | Test-typing cleanup (no new flag) | part of 205 | Reduce test noise before F3/F4 |
| B2 | backend | `noUnusedLocals` + `noUnusedParameters` | 301 | Mechanical, module-by-module; keep `_`-prefixed callback params |
| F3 | frontend | `exactOptionalPropertyTypes` | 140 | After F2; touches form/DTO objects; per-directory rollout |
| B3 | backend | `exactOptionalPropertyTypes` | 761 | After B2; touches controller DTO/option objects |
| F4 | frontend | `noUncheckedIndexedAccess` | 304 | After F2; start with `lib`/`utils`, then pages |
| B4 | backend | `noUncheckedIndexedAccess` | 764 | After B2; start with repositories/services |
| F5/B5 | both | `noPropertyAccessFromIndexSignature` | 332 / 2,234 | Defer; requires an env/config access wrapper; low correctness value, highest churn |

- Flag dependencies: `exactOptionalPropertyTypes` and `strictPropertyInitialization` require
  `strictNullChecks` (already effective); `noUncheckedIndexedAccess` is meaningful with `strictNullChecks`
  (already effective); `noImplicitOverride`, `noImplicitReturns`, `noUnused*`,
  `allowUnreachableCode`/`allowUnusedLabels`, and `noPropertyAccessFromIndexSignature` are independent.
  `useUnknownInCatchVariables`/`strictBuiltinIteratorReturn` are already part of `strict`.
- Changed paths: **only** `docs/release/COURTZON_RELEASE_PROGRESS.md`. All probes were created in the
  approved temp directory (or briefly under `src` and removed in `finally`); no probe/config files remain.
  The P3-07 ESLint gate was re-run after measurement: **PASS** (706 files / 3,377 findings).
- Not done, by instruction: no flag enabled, no tsconfig/CI change, no dependency/backend/DB/Docker
  change, no commit/push/deploy, no Phase 4.
- Risks recorded: **B19** (frontend CI type-check no-op; backend tests excluded), **B20** (frontend
  strictness relies on the TS 6 default), **B21** (3,163 explicit `any` + no type-aware lint — strictness
  flags cannot reduce it), **B22** (frontend `skipLibCheck: false` blocked by `@dnd-kit` d.ts drift), plus
  test-heavy frontend counts and high-churn `noPropertyAccessFromIndexSignature`.
- Roadmap preserved: 100-item denominator unchanged; exactly one item completed (P3-08), 31 → 32.

## 17A. P3-09 compliance confirmation (this operation)

- Operation type: **regression-test mapping + pre-fix verification** (P3-09). Scope limited to
  P3-02…P3-08; no P3-10, no Phase 4.
- Method: read `AGENTS.md` + the four canonical release documents; derived the defect list from the
  **actual working-tree diff** (`git diff --stat`: 38 frontend files) and the current test files — not
  from the completion notes. Every mapped test was located and read before it was accepted as coverage.
- Matrix: **17 defects** (P3-02 … P3-07) → **43** Vitest tests in **9** files + **6** ESLint-gate
  self-test scenarios (**§5B**). P3-08 is recorded as measurement-only (no runtime behaviour, no test).
- Pre-fix proof: **7 mutation runs → 11 defects detected**, plus the gate self-test (#17) = **12 / 17**.
  Each run inserted only the original
  defective statement, executed the mapped test, and required a non-zero exit with the expected failures.
  Files were backed up in memory **and** on disk, restored in `finally`, and verified by SHA-256; a marker
  scan (`P3-09-PREFIX`) over all touched files returned **0**. No `git checkout`, `git stash`, reset, or
  broad revert was used; unrelated working-tree changes were never touched.
- New test added (smallest meaningful): `frontend/src/components/marketplace/ProductCardImage.test.tsx`
  (**1** case) covering the P3-06 `Date.now()` cache-buster. It asserts the exact retry URL
  (`?cz_retry=1`, no timestamp) and the terminal placeholder on the second failure; it **fails 1/1** on the
  pre-fix line and **passes 1/1** now. Lint-clean (no baseline update was needed).
- Verification actually executed:
  - targeted mapped set: **65 / 65 PASS** (9 files);
  - `npx tsc -b --force` → **exit 0**;
  - `npm run lint:gate` → **PASS** (707 files / 3,377 findings, 0 differences — baseline untouched);
  - `npm run lint:gate:selftest` → **6 / 6 PASS** (gate scenarios reviewed: unchanged pass, new/increased
    finding, new-file violation, new clean file, coverage loss, new suppression directive);
  - full frontend suite: **1399 / 1399 PASS** (140/140 files, 103.15 s);
  - `npx eslint src/realtime/useRealtimeCacheUpdates.ts src/realtime/useSocket.ts` →
    `react-hooks/rules-of-hooks` **0** (84 `no-explicit-any`, 2 `exhaustive-deps` remain, both pre-existing).
- Changed paths: `docs/release/COURTZON_RELEASE_PROGRESS.md` and new
  `frontend/src/components/marketplace/ProductCardImage.test.tsx`. **No production source file, dependency,
  database/schema/data, `.env`, Docker file, or TypeScript configuration was changed** (the only mutations
  were transient and byte-restored).
- Not done, by instruction: no P3-10, no Phase 4, no commit/push/deploy, no Docker operation, no baseline
  rewrite, no `eslint-disable`, no test weakened or skipped.
- Risks recorded: **B23** — 5 / 17 defects cannot be demonstrated by revert (P3-04 loop implementation,
  P3-06 behaviour-preserving refactors), plus two coverage gaps (`Navbar` mirror, payment-id source switch).
  No open defect was found in the mapped fixes; the gap is evidential.
- Roadmap preserved: 100-item denominator unchanged; exactly one item completed (P3-09), 32 → 33.

## 17B. P3-10 compliance confirmation (this operation)

- Operation type: **access-path re-verification** (P3-10), the final Phase 3 item. No Phase 4 work.
- Method: read `AGENTS.md` + the four canonical documents; every matrix row was checked against the current
  source (route config in `App.tsx`, `adminRoutePermissions.ts`, `permissions/registry.ts`, nav registries,
  page gates/`enabled` flags) and re-run in this session. No value was carried over from a report.
- Matrix: **§5C** — 22 rows covering allowed/denied access, permission changes while mounted, route guards,
  query enablement, loading/empty states, navigation visibility (incl. the accountant deny-list) and the
  three card-payment flows; evidence classes A/S/L stated per row.
- **Critical regression found and fixed:** the P3-06 purity change gated the fallback payment poller on
  `paymentInfo?.paymentId`, but `handlePaymentComplete` clears `paymentInfo` before polling → the poller
  never mounted in `SubscriptionRequestModal`, `OrganizationRegisterPage` and `SellerRegisterPage`. Fixed by
  holding the polling id in state (`pollingPaymentId`) — behaviour identical to pre-P3-06, render stays pure.
  Proof: the new behavioural test failed on the P3-06 version (`Unable to find [data-testid="payment-poller"]`)
  and passes after the fix.
- Tests added (**4 files / 15 tests**, all lint-clean so the baseline was not touched):
  `SubscriptionRequestModal.paymentPolling.test.tsx` (2), `paymentPollerWiring.test.ts` (3, source guard for
  the two registration pages), `NavbarAdminLink.test.tsx` (5, full App; 3 fail under the legacy role-string
  mutation, byte-exact restore verified), `AdminLayout.access.test.tsx` (5, per-section gate + accountant
  deny-list).
- Verification actually executed: focused **108 / 108** (14 files); `npx tsc -b --force` → **exit 0**;
  `npm run lint:gate` → **PASS** (711 files / 3,377 findings, 0 differences); `npm run lint:gate:selftest` →
  **6 / 6**; full suite **1414 / 1414** (144/144 files, 94.43 s); `npx eslint . --format json` →
  `rules-of-hooks` **0**, `refs` **0**, `static-components` **0**, `purity` **3**, `set-state-in-effect` **54**.
- Changed paths: `docs/release/COURTZON_RELEASE_PROGRESS.md`; the three production components above
  (state-only fix); four new test files. **No dependency, backend, database/schema/data, `.env`, Docker,
  TypeScript-config or lint-baseline change**; no broad revert; the one temporary mutation (Navbar) was
  restored byte-exactly (SHA-256).
- Not done, by instruction: no Phase 4, no commit/push/deploy, no Docker operation, no Paymob Sandbox call
  (**B7** / P5-04 remains BLOCKED), no RBAC key remapping (**B24** needs approval).
- Risks recorded: **B23** (remaining static-only evidence for P3-04/P3-06; registration flows source-guarded),
  **B24** (route/page/nav permission-key drift — deny-safe, needs a dedicated RBAC task), plus the unchanged
  Phase 2/3 deferrals (B13, B14, AR-2, B16–B22).
- Roadmap preserved: 100-item denominator unchanged; exactly one item completed (P3-10), 33 → 34.
  **Phase 3 acceptance MET** (§5C.4).

## 17C. P4-01 compliance confirmation (this operation)

- Operation type: **business-rule / test-coverage inventory** (P4-01). No P4-02+ work.
- Method: read `AGENTS.md` + the four canonical release documents; derived every rule from the **current
  source** (`src/modules/**`, middleware, route maps, permission registry, role templates) and re-measured
  the test baseline with `npx vitest list` + spec-file counts instead of trusting the previous "302 unit +
  163 integration" note (now **308 unit spec files**, **3,740** unit tests, **163** integration files).
- Deliverable: **§5D** — 45 rules / 8 areas with source, tests, uncovered edges and evidence class; B24
  route/page/nav mapping for 10 routes; verified status for B5, B7/P5-04, B13, B14, AR-2, B19–B24; ranked
  gap list separating **missing tests**, **confirmed mapping defect (B24)** and **unverified external
  integrations** (B7, 32 container suites).
- Evidence actually executed: `npx vitest list` (3,740 entries); `Get-ChildItem *.integration.spec.ts`
  (163); `npx vitest run src/modules/community` → “No test files found” (exit 1, proving B25); targeted
  greps (`requirePermission` 777, HMAC negatives 0, brute-force 0, failover/DLQ 0, stock conditional
  update, journal balance, participant checks).
- No test was run for correctness and **no test was modified** to force a pass; the only write is this
  progress file.
- Changed paths: `docs/release/COURTZON_RELEASE_PROGRESS.md` **only**. No production code, tests,
  dependencies, database/schema/data, `.env`, Docker or TypeScript/lint configuration changed; no file
  reverted or deleted.
- Not done, by instruction: no P4-02+, no permission/grant change (B24 recorded only), no DB or Docker
  operation, no Paymob Sandbox call (B7), no commit/push/deploy.
- Risks recorded/confirmed: **B25** (High, messaging REST untested), **B26** (Medium, seller-subscription
  rejection untested), **B27** (Medium, notification failover/DLQ untested); **B24** mapped; **B5** confirmed
  open (HMAC/upload/CORS/brute-force); **B19–B22, B13, B14, AR-2, B23, B7** unchanged.
- Roadmap preserved: 100-item denominator unchanged; exactly one item completed (P4-01), 34 → 35.

## 17D. P4-02 compliance confirmation (this operation)

- Operation type: **authentication / session / RBAC / tenant-isolation audit** (P4-02). No P4-03+ work.
- Authoritative grant source: **read-only SELECT queries** against the already-running Docker MySQL
  (`courtzon_v3`, host `127.0.0.1:3307`) using the project’s own `DB_USER` from the root `.env`. No
  container start/stop, no schema/data change, no credentials printed. 92 role rows / **26 unique slugs**;
  19 permission keys audited (`§5E.4`).
- Audited: auth middleware + public-prefix bypass, session lookup (`is_revoked`, `expires_at`), refresh
  rotation/expiry, device cap, cookie flags, brute-force lockout, rate limits, per-request permission
  resolution (777 `requirePermission` sites), `adminGuard`, org access/manage/scoped-permission guards,
  and tenant isolation for booking, accounting, settlement, marketplace and messaging (read + write).
- **Confirmed defects fixed (red → green):**
  1. **Marketplace order IDOR** — `getOrderForUser` unfiltered fallback returned any order to any
     `marketplace.order.view` holder (coaches, org/shop admins, marketplace/audit roles), exposing `shipping_address` PII. Test failed
     **2/4** before, **4/4** after; the fallback is now buyer-only.
  2. **Logout-all-devices no-op** — `/auth/logout` is public so `request.userId` is never set; the flag
     degraded to a single-session revoke. Test failed **1/2** before, **2/2** after; owner now resolved from
     the refresh-token session.
  3. **B24 blank pages** — page gates used keys that contradicted the canonical route gates. Aligned five
     page gates (`financial.view` ×3, `reports.view`, `sidebar.accounting`); reverting one gate makes the
     mapped test fail (**1/5**). **No DB permission was granted/revoked** and no role loses access.
- **B25 closed:** 15 community REST authorization tests; removing the participant check fails exactly
  **1/15**, proving the suite guards the regression.
- Verification actually executed: focused backend **364/364** (35 files); backend `tsc --noEmit` **0**;
  frontend `tsc -b --force` **0**; `lint:gate` **PASS** (711 files / 3,377 findings, baseline untouched);
  full frontend **1414/1414** (144 files, 94.35 s). `src/tests/proxy-contract.spec.ts` fails **2** assertions
  on frontend **test fixtures** — recorded as pre-existing **B28**, not caused by this task.
- Changed paths: `docs/release/COURTZON_RELEASE_PROGRESS.md`; `backend/src/modules/marketplace/application/marketplace.service.ts`;
  `backend/src/modules/auth/application/auth.service.ts`; new `backend/src/modules/community/__tests__/community-authorization.spec.ts`,
  `backend/src/modules/marketplace/__tests__/order-access-isolation.spec.ts`,
  `backend/src/modules/auth/__tests__/logout-all-devices.spec.ts`;
  `frontend/src/pages/admin/accounting/AccountingDashboardPage.tsx`,
  `frontend/src/pages/admin/finance/{FinanceDashboardPage,FinancialOpsDashboard,LedgerViewerPage,ReportCenterPage}.tsx`,
  `frontend/src/pages/admin/finance/permissionHookOrder.test.tsx`.
- Not done, by instruction: no P4-03+, no DB schema/data change, no permission grant, no `.env` change, no
  Docker start/stop/rebuild, no dependency change, no commit/push/deploy, no broad revert.
- Roadmap preserved: 100-item denominator unchanged; exactly one item completed (P4-02), 35 → 36.

## 17E. P4-03 compliance confirmation (this operation)

- Operation type: **booking concurrency / Redis-lock / transaction-boundary audit** (P4-03). No P4-04+ work.
- Traced the complete chains: `createBooking` (card and cash), `prepareGatewayBooking` →
  `confirmBookingFromPrepare`, `createRecurringSeries`, `CourtReservationService.reserve/reschedule/release`,
  coach scheduling and the expiry worker; read `redis-lock.ts`, `checkSlotAvailability`, the command handlers
  and the migration that removed the status-blind unique keys.
- Database authority verified read-only (`SHOW INDEX` on the running `courtzon_v3`): `bookings` keeps only
  `uk_booking_series_occurrence`; `booking_slots` keeps a non-unique index — the authoritative guard is
  `resources FOR UPDATE` + overlap count, exactly as migration `140_booking_history_preservation.sql` states.
  No schema/data change was made.
- **Confirmed defect fixed:** non-unique lock ownership tokens (player create/prepare, tournament, coach
  scheduling) allowed a stale release to delete a newer same-principal lock. Replaced with
  `createLockOwner()` (UUID per acquisition); no policy, pricing or accounting behaviour changed.
- Tests added: `redis-lock.spec.ts` (**13**) and `lock-owner-wiring.spec.ts` (**3**). Pre-fix proof: reverting
  one call site to the legacy token form fails the wiring guard **1/3**; the file was restored byte-exactly
  (SHA-256) and no unrelated file was touched. The lock test also encodes the defect mechanism (shared token
  → stale release deletes the newer lock) and the fixed behaviour.
- Real concurrency evidence (not sequential unit tests): `booking.concurrency.service.integration.spec.ts`
  and `booking.concurrency.integration.spec.ts` **16/16** with `Promise.all` against the running MySQL
  (`courtzon_v3` @ 3307) and Redis — identical, partial-overlap, adjacent, duplicate and terminal-rebooking
  races all resolve to exactly one booking.
- Verification executed: booking + scheduling unit **336/336** (25 files); backend
  `npx tsc -p tsconfig.json --noEmit` **0**; frontend `npm run lint:gate` **PASS** (711 files / 3,377
  findings — frontend untouched). **Skipped:** 32 container-based integration suites (no-container rule) and
  the remaining persistent integration suites outside booking concurrency.
- Changed paths: `docs/release/COURTZON_RELEASE_PROGRESS.md`;
  `backend/src/modules/booking/infrastructure/redis/redis-lock.ts` (owner helper);
  `backend/src/modules/booking/application/booking.service.ts`,
  `backend/src/modules/booking/application/court-reservation.service.ts`,
  `backend/src/modules/scheduling/application/scheduling-booking.service.ts` (4 owner call sites);
  new `backend/src/modules/booking/infrastructure/redis/redis-lock.spec.ts`,
  `backend/src/modules/booking/__tests__/lock-owner-wiring.spec.ts`.
- Not done, by instruction: no P4-04+, no schema/data change, no Docker start/stop/rebuild, no `.env` change,
  no dependency change, no commit/push/deploy, no broad revert; all pre-existing working-tree changes intact.
- Residual risks recorded: **B29** resolved; **B30** design limitations (prepare pre-check outside a
  transaction, no lock renewal, recurring multi-resource deadlock window — DB guard remains authoritative).
- Roadmap preserved: 100-item denominator unchanged; exactly one item completed (P4-03), 36 → 37.

## 17F. P4-04 compliance confirmation (this operation)

- Operation type: **marketplace inventory / overselling / stock-restoration / seller-eligibility audit**
  (P4-04). No P4-05+ work.
- Traced the full lifecycle: checkout → per-seller order creation → conditional stock decrement → payment
  (cash/card) → fulfil / failure / cancel / refund / abandoned cleanup. Read `decrementStock`, `restoreStock`,
  `updateOrderStatus`, `handlePaymentFailed`, `cancelAbandonedOrders`, `_restoreOrderStock` and the payment
  failure paths.
- **Oversell guard verified, not assumed:** `UPDATE products SET quantity = quantity - ? WHERE id = ? AND
  quantity >= ?` (variant path rolls back the product decrement). Real concurrency (integration, running
  MySQL, no containers): 10 overlapping unit decrements on qty 5 → exactly 5 succeed, stock 0; qty 3 with
  five 2-unit decrements → 1 succeeds, stock 1; concurrent restores are additive. No `reserved_quantity`
  soft-reservation is used (documented).
- **Confirmed defects fixed (red → green):** (1) card-checkout failure restored stock twice and left orders
  pending (inner restore + outer catch) — now one restore and terminal cancellation; (2) part-way decrement
  failure restored items that were never decremented — now restores only decremented items in reverse;
  (3) a repeated `payment:failed` event could restore twice — terminal guard in the restorer + early return
  in the handler. Three scoped mutations reproduced the pre-fix failures (**1 failed / 8 passed** each) and
  every mutation was restored byte-exactly (SHA-256, marker scan clean). No broad revert was used.
- **B26 closed:** five tests prove no-plan / expired / suspended / cancelled sellers are rejected before any
  order is created, and an active seller keeps normal checkout behaviour. The eligibility gate itself was
  unchanged (the gap was coverage).
- Verification executed: `checkout-inventory-integrity.spec.ts` **9/9**; stock-concurrency integration
  **3/3**; marketplace unit suite **218/218** (21 files); `npx tsc -p tsconfig.json --noEmit` **0**; frontend
  `npm run lint:gate` **PASS** (711 files / 3,377 findings — frontend untouched). Skipped: 32 container-based
  integration suites (no-container rule) and non-marketplace persistent suites.
- Changed paths: `docs/release/COURTZON_RELEASE_PROGRESS.md`;
  `backend/src/modules/marketplace/application/marketplace.service.ts` (single failure path + cancel, reverse
  restore of decremented items, terminal-guarded restore, idempotent failure handler);
  new `backend/src/modules/marketplace/__tests__/checkout-inventory-integrity.spec.ts`,
  `backend/src/modules/marketplace/__tests__/marketplace-stock-concurrency.integration.spec.ts`.
- Not done, by instruction: no P4-05+, no schema/data change, no accounting-rule change, no `.env`/Docker/
  dependency change, no commit/push/deploy, no seller-eligibility weakening.
- Residual risks recorded: **B31** (no single transaction for order+stock; concurrent cancels/cleanup can
  double-restore; no soft reservation). **B26** resolved.
- Roadmap preserved: 100-item denominator unchanged; exactly one item completed (P4-04), 37 → 38.

## 17G. P4-05 compliance confirmation (this operation)

- Operation type: **subscriptions / notifications / reporting jobs / failover-DLQ audit** (P4-05). No P4-06+
  work.
- Traced the org-subscription lifecycle (request → approve/reject/reopen → activation → chained renewal →
  promote-before-expire → reminders) and the notification delivery pipeline (dispatcher → queue → worker →
  providers → DLQ → replay), plus the registered background workers and graceful shutdown.
- **B27 closed with 7 fixed defects:** provider `success:false` treated as success; DLQ written only on the
  success path (never on failure); failed attempts never incremented; replay created a delivery but never
  enqueued it and deleted the dead letter; retried jobs could re-send a delivered notification; malformed
  preference JSON crashed dispatch; digest payload did not match the worker contract. Fixes are
  application-level only — **no schema/data change** and no accounting/eligibility policy change.
- Pre-fix proof: **6 scoped mutations** (5 worker/repo + digest payload) all detected with the mapped tests
  failing (1–2 failures each); every mutation restored byte-exactly (SHA-256, marker scan clean). No broad
  revert.
- Verification executed: new suites **21/21**; notifications module **222/222** (28 files); subscription +
  membership suites **126/129** with 3 **pre-existing** date-expired fixtures (B8, P7-02); backend
  `npx tsc -p tsconfig.json --noEmit` **0**; frontend `npm run lint:gate` **PASS** (711 files / 3,377
  findings — frontend untouched). Skipped: 32 container-based integration suites; **no live email/SMS/push/
  webhook provider test** (providers mocked — external delivery remains unverified, stated explicitly).
- Changed paths: `docs/release/COURTZON_RELEASE_PROGRESS.md`;
  `backend/src/modules/notifications/infrastructure/notification.worker.ts`;
  `backend/src/modules/notifications/infrastructure/repositories/delivery.repository.ts`;
  `backend/src/modules/notifications/application/failover.service.ts`;
  `backend/src/modules/notifications/application/digest-scheduler.service.ts`;
  new `backend/src/modules/notifications/__tests__/notification-failover.spec.ts`,
  `notification-dlq.spec.ts`, `notification-replay.spec.ts`, `digest-scheduler.spec.ts`.
- Not done, by instruction: no P4-06+, no schema/data change, no `.env`/Docker/dependency change, no
  commit/push/deploy, no broad revert; all pre-existing working-tree changes intact.
- Residual risks: **B32** (digest duplication without a window claim, unregistered
  `retry_failed_deliveries`, failover-chain semantics, non-atomic duplicate guard). **B8** backend
  date-expired fixtures remain for P7-02.
- Roadmap preserved: 100-item denominator unchanged; exactly one item completed (P4-05), 38 → 39.

## 17H. P4-06 compliance confirmation (this operation)

- Operation type: **EventBus / Socket.IO / idempotency / race audit** (P4-06). No P4-07+ work.
- Traced the full chain: `eventBusV2.emit` → envelope (ULID) → `published_events` insert on the caller's
  transaction connection → after-commit enqueue (`jobId = eventId--queue`) → subscriber worker with
  `processed_events` unique dedupe → Socket.IO room delivery → frontend cache invalidation and
  reconnect reconciliation, plus the 5 s outbox poller/cursor recovery path.
- **Confirmed defect fixed:** after-commit hooks were stored in a module-global array with an index snapshot.
  Overlapping transactions could flush each other's hooks (a committed transaction published a still-open or
  later-rolled-back transaction's events → phantom realtime/notification events), and events emitted outside a
  transaction were buffered and never flushed. Hooks are now **ALS-scoped per transaction** and run
  immediately when no transaction exists.
- Proof: new `src/tests/database.transaction.spec.ts` **6/6**. Swapping in the pre-fix file produced exactly
  **2 failures** (cross-transaction flush; outside-transaction immediacy) / 4 passes; the file was restored
  byte-exactly (SHA-256). No broad revert, no unrelated file touched.
- Idempotency stated precisely: **durable** `published_events` event-id uniqueness and
  `processed_events(event_id, subscriber_id)` dedupe; **best-effort** BullMQ `jobId` window; delivery is
  **at-least-once**, not exactly-once (handlers must be idempotent). No claim of exactly-once was made.
- Verification executed: focused `src/shared` + `src/modules/realtime` + the new transaction spec **284/284**
  (22 files); backend `npx tsc -p tsconfig.json --noEmit` **0**; frontend `npm run lint:gate` **PASS**
  (711 files / 3,377 findings — frontend untouched; no frontend suite needed).
- **Skipped:** 32 container-based integration suites; the DB-dependent `published-events` /
  `processed-events` integration specs were not run; no live Socket.IO client/server test was performed.
- Changed paths: `docs/release/COURTZON_RELEASE_PROGRESS.md`;
  `backend/src/database/database.transaction.ts` (ALS-scoped hooks); new
  `backend/src/tests/database.transaction.spec.ts`.
- Not done, by instruction: no schema change, no transactional-outbox migration, no `.env`/Docker/dependency
  change, no commit/push/deploy, no broad revert; all pre-existing working-tree changes intact.
- Residual risks: **B33** (unawaited emits 255/366, no durable event dead-letter store, at-least-once
  duplicate window, cursor-init startup race, no socket event replay). **B30–B32**, **B8**, **B5**, **B28**,
  **B19–B22**, **B13/B14/AR-2**, **B7/P5-04** unchanged.
- Roadmap preserved: 100-item denominator unchanged; exactly one item completed (P4-06), 39 → 40.

## 17I. P4-07 compliance confirmation (this operation)

- Operation type: **accounting integrity audit — double entry, idempotency, reversal, reposting** (P4-07).
  No P4-08+ work, no Phase 5.
- Scope traced: booking card/wallet/COD/series payments and refunds; marketplace card/wallet/cash orders,
  refunds and settled refunds; academy, membership and tournament card/wallet/cash flows and their reversals;
  gateway clearing/settlement and its reversal; merchant (org) payouts, offsets and historical corrections;
  coach/org recovery and settlement recovery offsets; org-book (merchant) mirror postings.
- Invariants verified by execution (not by reading alone): debits = credits on every shape; refunds/reversals
  are exact chart-account inversions (13 pairs, concept level **and** DB-resolved code level); every resolved
  account exists and is active in `chart_of_accounts`; zero amounts omitted, negative/unknown/missing-mapping
  concepts rejected; organisation attribution preserved (no cross-org merge); no partial journal on failure
  (single transaction, rollback on error / `ER_DUP_ENTRY`).
- Idempotency stated precisely: **durable** `ledger_entries.uk_dedup` UNIQUE over
  `(source_type, source_id, event_type, chart_account_id, side)` (columns verified via `information_schema`)
  plus the P4-06 `published_events`/`processed_events` guarantees; **application-level** only for the
  `hasPosting` pre-check (runs outside the transaction). No exactly-once claim.
- **Confirmed defect fixed (B34):** booking-refund recovery counters advanced even when the posting was
  idempotently skipped, so the duplicate `payment:refunded` + `booking:refunded` delivery consumed recovery
  capacity without a journal entry. `postAccountingEvent` now returns `Promise<boolean>` and both counter
  updates are gated on it.
- Proof: new `accounting-ledger-invariants.spec.ts` **25/25**; new `accounting-posting-idempotency.spec.ts`
  **6/6**; mutating the two guards to `if (true)` produced **1 failed / 5 passed** (4 updates vs 2) and the
  source was restored byte-exactly (SHA-256 `62c2c417…`). No broad revert, no production policy touched.
- DB-authoritative read-only evidence: new `accounting-mapping-integrity.integration.spec.ts` **31/31** against
  the running `courtzon_v3` (127.0.0.1:3307) — nothing written by the spec.
- Verification executed: focused `src/modules/financial` + `src/modules/accounting` + `src/modules/settlement`
  **404/404** (42 files); booking refund/recovery/idempotency integration **27/27** (running MySQL); backend
  `npx tsc -p tsconfig.json --noEmit` **0**; frontend `npm run lint:gate` **PASS** (711 files / 3,377 findings).
- **Skipped:** 32 container-based (Testcontainers) integration suites; no live gateway/Paymob Sandbox refund;
  no period-close/year-close execution; no re-posting/repair tool exercise (none exists).
- Changed paths: `docs/release/COURTZON_RELEASE_PROGRESS.md`;
  `backend/src/modules/financial/application/accounting-event.listener.ts` (boolean posting result + recovery
  gating); new `backend/src/modules/financial/__tests__/accounting-ledger-invariants.spec.ts`,
  `accounting-posting-idempotency.spec.ts`, `accounting-mapping-integrity.integration.spec.ts`.
- Not done, by instruction: no schema/data change, no COA mapping change, no journal/settlement policy change,
  no `.env`/Docker/dependency change, no commit/push/deploy, no broad revert; all pre-existing working-tree
  changes intact.
- Residual risks: **B35** (posting identity has no occurrence ordinal; outer-connection callers ignore the
  posting result; in-memory accounting handler failures are logged, not re-driven; legacy stale mapping rows;
  period-lock not re-tested). **B34 resolved.** **B33**, **B30–B32**, **B8**, **B5**, **B28**, **B19–B22**,
  **B13/B14/AR-2**, **B7/P5-04** unchanged.
- Roadmap preserved: 100-item denominator unchanged; exactly one item completed (P4-07), 40 → 41.

## 17J. P4-08 compliance confirmation (this operation)

- Operation type: **business-rule test-coverage completion** (P4-08). No P4-09+ work, no Phase 5.
- Built a **34-rule gap matrix** across booking, marketplace, payments/refunds, subscriptions, notifications,
  settlements and accounting, each gap classified: missing normal-path, missing failure-path, missing
  concurrency/boundary, external integration not verifiable locally, or documented architectural limitation.
- **No confirmed production defect was found in P4-08 and no production file was changed.** The only Phase 4
  production edit remains the P4-07 **B34** fix. No assertion was weakened and no business rule was invented.
- Gaps closed with new tests (**23 tests, 4 files**):
  - `gl-period-lock.spec.ts` **9** — organisation period authoritative even when closed (caller must reject),
    closed rejection, platform fallback/scope, missing period, closed platform fallback, `validateOpenPeriod`,
    org isolation.
  - `booking-refund-boundaries.spec.ts` **9** — over-refund clamp, zero refund, 2-decimal proration, null
    cases, settled/unsettled splits, exhausted capacity, recovered > settled.
  - `accounting-posting-idempotency.spec.ts` **+3** — B35 occurrence identity, handler swallows a hard
    failure (no automatic retry), manual re-delivery posts every leg and advances recovery once.
  - `booking-settlement-unification.spec.ts` **+2** — recovery offset succeeds with posting; **characterized**
    that the collected projection advances when the posting is skipped (B35-2).
- High-impact B35 items: (1) and (3) **characterized by tests, not fixed** (need occurrence identity / handler
  replay); (2) **characterized, not fixed** (fix would hide money movement until occurrence identity exists);
  (4) stale mapping rows documented (seed/migration cleanup not authorized); (5) period-lock coverage **closed**.
- B30–B33, B5, B8, B28 dispositions: unchanged/characterized, each routed to its plan-assigned phase
  (B5→P5-02, B7/P5-04→Sandbox, B8→P7-02, B28→P7-02/P7-09, B31/B32/B35 documented limitations).
- Verification executed: new files **18/18**; extended files **9/9** and **9/9**; focused
  financial+accounting+settlement+booking **729/729** (65 files); marketplace+payment+notifications
  **478/478** (56 files); backend `npx tsc -p tsconfig.json --noEmit` **0**; frontend `npm run lint:gate`
  **PASS** (711 files / 3,377 findings).
- **Skipped:** 32 container-based (Testcontainers) suites; Paymob Sandbox/live gateway; period-close and
  year-close execution; the three B8 date-expired subscription/membership fixtures (P7-02);
  `proxy-contract.spec.ts` fixture scan (B28).
- Changed paths: `docs/release/COURTZON_RELEASE_PROGRESS.md`; new
  `backend/src/modules/financial/__tests__/gl-period-lock.spec.ts`,
  `backend/src/modules/financial/__tests__/booking-refund-boundaries.spec.ts`; extended
  `backend/src/modules/financial/__tests__/accounting-posting-idempotency.spec.ts`,
  `backend/src/modules/financial/__tests__/booking-settlement-unification.spec.ts`.
- Not done, by instruction: no schema/data change, no migration, no COA/journal/settlement/subscription-policy
  change, no `.env`/Docker/dependency change, no commit/push/deploy, no broad revert; all pre-existing
  working-tree changes intact.
- Roadmap preserved: 100-item denominator unchanged; exactly one item completed (P4-08), 41 → 42.

## 17K. P4-09 compliance confirmation (this operation)

- Operation type: **database-schema integrity verification** (P4-09). No P4-10+ work, no Phase 5.
- **Read-only only:** every database interaction was a SELECT against `information_schema` (tables, columns,
  statistics) and `migration_history`, plus `SELECT`s on `accounting_event_mapping_lines`/`chart_of_accounts` for
  B35 provenance. **No DDL, DML, migration, seed, cleanup or repair was executed**; no database, directory,
  container or test environment was created.
- Compared the authoritative baseline (**328** tables), **210** migrations (209 `CREATE TABLE`, 314 column adds,
  6 later-dropped tables), 8 seeds, `backend/docker-entrypoint.sh`, `scripts/migrate.sh` and
  `backend/scripts/migration-guard.sh` against the live `courtzon_v3` metadata (**330** tables, 3,674 columns,
  1,334 indexes) and against SQL references in **735** production TS files.
- **Verified:** 0 baseline tables/columns missing from live; 0 runtime DDL; 0 invented reachable table
  references; every Phase-4 object exists (`ledger_entries.uk_dedup`, booking recovery columns,
  `payment_allocations`, entitlement/settlement/notification tables); 6 retired tables correctly absent; the
  migration chain is fully production-safe (47 marked, 0 local-only, 163 default-safe).
- **Confirmed defects (documented, not fixed — verification-only task):**
  - **S-01 / B36 (Critical):** the baseline lacks `payment_allocations` and **45** migration-added columns
    (149, 158–161, 177, 193) that the live DB has, while `docker-entrypoint.sh` stamps every migration as
    applied on a fresh DB → fresh deploy/DR gap.
  - **S-02/S-03/S-04 / B37 (High):** three routed endpoints use non-existent columns
    (`branch_financial_details` payment settings, `push_tokens.device_id`, `resource_maintenance` shape).
  - **S-05/S-06 (Low):** dead HR repository method and an `activities` command referencing a table that does not
    exist anywhere (test-only reference).
- **Legacy/deprecated:** S-07 (6 tables dropped by 091/138/139), S-10 (duplicate numeric prefixes, additive).
- **Unresolved evidence gaps:** S-09 — 179/210 migration hashes differ from disk, 201/211 files have a commit
  after `applied_at`, and `103b_coa_cleanup.sql` is recorded as applied but exists nowhere in repo/archive/git.
  The live schema is verified against baseline+migrations+code, but the DB cannot be *proven* byte-identical to
  the repository chain from these records alone — a controlled rebuild/convergence run is required (Phase 9).
- **B35 provenance:** legacy mapping rows for `org_payable` 2200 / `receivable_from_org` 1160 stem from
  migrations `113_financial_custody_audit.sql:25` and `117_accounting_mapping_reconciliation.sql:49`, re-asserted
  by `seeds/005_accounting_defaults.sql:189-230`; superseded by the 2202/1161 custody model and harmless because
  `buildLedgerLines` only materialises supplied concepts. **No cleanup performed.**
- Verification executed: focused schema/migration/accounting unit suites **68/68** (6 files); read-only
  `accounting-mapping-integrity.integration.spec.ts` **31/31**; backend `npx tsc -p tsconfig.json --noEmit` **0**;
  frontend `npm run lint:gate` **PASS** (711 files / 3,377 findings).
- **Not run:** container/Testcontainers suites (`baseline-convergence.integration.spec.ts`,
  `migration-guard.integration.spec.ts`), no fresh-DB baseline import (would require writes), production schema
  not inspected.
- Changed paths: `docs/release/COURTZON_RELEASE_PROGRESS.md` **only** (no production, schema, seed, Docker or
  test changes).
- Not done, by instruction: no schema/data change, no baseline regeneration, no cleanup, no `.env`/Docker/
  dependency change, no commit/push/deploy, no broad revert; all pre-existing working-tree changes intact.
- Roadmap preserved: 100-item denominator unchanged; exactly one item completed (P4-09), 42 → 43.

## 17L. P4-10 compliance confirmation (this operation)

- Operation type: **Phase 4 evidence package and evidence reconciliation** (P4-10). Documentation-only; no
  Phase 5 work started.
- Reconciled **§5D** (P4-01), **§5E–§5I** (P4-02…P4-06), **§5J** (P4-07), **§5K** (P4-08), **§5L** (P4-09),
  the Phase 4 checklist, the evidence log (§13), the risk register (§14), the audit trail (§15) and the
  compliance records (§17D–§17K). Produced the **10-row evidence summary** and **36-row traceability matrix**
  in **§5M**, with task/area, defect/risk ID, evidence + test reference, status and follow-up.
- **Totals preserved from the record:** 15 fixed production defects (P4-02 ×2, P4-03 ×1, P4-04 ×3, P4-05 ×7,
  P4-06 ×1, P4-07 ×1), **161 recorded new focused tests** (P4-02…P4-08 suite-count sum), 6 confirmed **unfixed**
  P4-09 defects (S-01…S-06 → **B36/B37**), and 0 production changes in P4-08/P4-09/P4-10.
- **B36 recorded explicitly:** baseline lacks `payment_allocations` + 45 migration-added columns while the
  fresh-DB entrypoint stamps the chain as applied — **Critical**, open, release/deploy follow-up.
- **B37 recorded explicitly:** org payment-settings, mobile push and resource-maintenance endpoints use
  non-existent columns; dead HR/`activities` code references unsupported columns/table — **High**, open,
  code-only fix follow-up.
- **Reconciliation disclosed, not hidden:** **D-1** (P4-03 recorded 333/333 in §6 vs 336/336 in §13/§15/§17E;
  read-only re-run gave **336/336**, 25 files; §6 corrected with a pointer and the uncertainty stated);
  **D-2** (§15 lacked P4-04/P4-05 rows; backfilled verbatim from §17F/§17G). No other numeric/status
  contradictions were found; no result was upgraded from “not run” to “passed”.
- **Risk register unchanged:** B5, B7/P5-04, B8, B13/B14/AR-2, B19–B22, B28, B30–B37 and the remaining global
  risks are preserved with their existing statuses; P4-10 closes none and adds none.
- Validation: doc-invariant checks (phase arithmetic **44/100**, 10/10 Phase 4 rows, 36 matrix rows, all
  preserved risk IDs present) **PASS**; one read-only re-run **336/336** (25 files); no schema/DB/test change.
- **No database writes/DDL/DML, migrations, seeds or cleanup; no Docker operation; no commit/push; no `.env`,
  dependency or business/accounting-policy change.** All pre-existing working-tree changes remain intact.
- Changed paths: `docs/release/COURTZON_RELEASE_PROGRESS.md` **only**.
- Roadmap preserved: 100-item denominator unchanged; exactly one item completed (P4-10), 43 → 44; Phase 4
  **10/10**, acceptance met for the audit scope only (B36/B37 remain open).

## 17M. P5-01 compliance confirmation (this operation)

- Operation type: **payment lifecycle mapping and Phase 5 test-matrix preparation** (P5-01). Analysis and
  documentation only; **no P5-02 work, no fixes, no production code/test changes**.
- Traced **12 flows** from code, listeners, schema and tests: booking card (direct create), booking
  prepare/intention, booking cash/COD, recurring series, marketplace orders, organisation subscriptions,
  membership, academy, tournament, wallet top-up, refunds (wallet/card/allocation), settlement & reconciliation.
  For each: initiating action, state/transition set, authoritative persistence, emitted events, accounting
  effect and recovery path (**§5N.3**).
- Recorded the authoritative payment model: `payment_transactions` enum (8 states), `FINAL_STATES` guard,
  conditional `UPDATE … FOR UPDATE` outcome, `uk_idempotency_key` / `uq_gateway_reference`, and the absence of a
  refunded-amount/partial-refund column (**§5N.2**).
- **New findings recorded (not fixed):** **B38** — gateway charge occurs before the local row and Paymob
  `special_reference` embeds `Date.now()`, so concurrent same-key requests can double-charge (High);
  **B39** — webhook replay key is written before processing, so a failed processing blocks retries for 24 h
  (Medium); **B40** — single-payment partial refunds are terminal and no refunded amount is persisted (Medium).
  **B5** (no HMAC rejection tests; non-timing-safe comparator) and **B7/P5-04** (Sandbox unverified) are scoped
  for the next tasks. **B36** is preserved as a hard prerequisite for fresh-DB/rebuild verification.
- Produced the **45-row Phase 5 matrix** with `EXISTS / EXTEND / MISSING / BLOCKED` and the owning task
  (**§5N.5**), plus the intended P5-02 (HMAC) and P5-04 (Sandbox) scope (**§5N.6**) without executing either.
- Validation: `npx vitest run src/modules/payment` **38/38 PASS** (7 unit files; no DB writes); read-only
  `information_schema` inspection of the payment/settlement tables; no integration/Sandbox/fresh-DB run.
- **No database writes/DDL/DML/migrations/seeds; no Docker; no commit/push; no `.env`, dependency or
  payment/accounting-policy change.** `.env` was read only to confirm provider/sandbox flags and key presence
  (no secret values printed). All pre-existing working-tree changes remain intact.
- Changed paths: `docs/release/COURTZON_RELEASE_PROGRESS.md` **only**.
- Roadmap preserved: 100-item denominator unchanged; exactly one item completed (P5-01), 44 → 45; Phase 4
  remains 10/10, Phase 5 now 1/10 with acceptance **not met**.

## 17N. P5-02 compliance confirmation (this operation)

- Operation type: **Paymob webhook HMAC positive/negative unit tests** (P5-02). No P5-03+ work, no Sandbox,
  no database writes, no payment-policy change.
- Read `PaymobGateway.verifyWebhook`, both construction branches (Intention 20 values, Accept **23** values),
  the webhook controller and the existing tests (none covered the real verifier).
- Added **65 unit tests in 3 files** (**§5O**): 55 for the HMAC construction (valid shapes; each Intention field
  ×20 and Accept field ×23 mutated; null/absent fields; unsigned fields ignored; incorrect/empty/truncated/
  over-long/non-hex/uppercase/whitespace/null/undefined signatures; missing/empty secret; no secret logging),
  3 for service-level rejected-signature side effects (no repository read, no payment events), and 7 for the
  controller (401 + no success audit, query/header extraction, 400/500 mapping, accepted-webhook audit).
- **Confirmed defect found and fixed (B41):** a null/undefined signature threw
  `TypeError: Cannot read properties of null (reading 'slice')` in the mismatch logger. The new test failed
  first (`rejects null/undefined signatures`, `paymob-gateway.ts:387`); the minimal fix normalizes the expected
  signature to an empty string in both branches, preserving exact string-equality verification. No timing-safe
  comparison was added (B5 residual, tests-only decision).
- Verification executed: three new files **65/65**; combined `src/modules/payment` + shared gateway
  **103/103** (10 files); backend `npx tsc -p tsconfig.json --noEmit` **0**; frontend `npm run lint:gate`
  **PASS** (711 files / 3,377 findings).
- **Not run:** Paymob Sandbox/live calls, webhook delivery, DB-writing payment integration suites, container
  suites, fresh-DB (B36). The field order is verified against the implementation, not against a live Paymob
  delivery; if the provider’s published list differs, code and tests would be wrong together (P5-04 only can
  confirm).
- **Risks preserved:** **B5 partially resolved** (HMAC portion; upload/CORS/brute-force/rate-limit and
  timing-safe compare remain), **B7/P5-04** blocked, **B38/B39/B40** untouched, **B36/B37** unchanged,
  all other open risks unchanged.
- **No database writes/DDL/DML/migrations/seeds; no external provider calls; no Docker; no commit/push; no
  `.env`, dependency or accounting/payment-policy change.** All pre-existing working-tree changes intact.
- Changed paths: `backend/src/shared/services/gateway/paymob-gateway.ts` (non-string signature normalization);
  new `backend/src/shared/services/gateway/__tests__/paymob-webhook-hmac.spec.ts`,
  `backend/src/modules/payment/__tests__/webhook-signature-handling.spec.ts`,
  `backend/src/modules/payment/__tests__/payment-webhook-controller.spec.ts`;
  `docs/release/COURTZON_RELEASE_PROGRESS.md`.
- Roadmap preserved: 100-item denominator unchanged; exactly one item completed (P5-02), 45 → 46; Phase 5
  **2/10**, acceptance still **not met**.

## 17O. P5-03 compliance confirmation (this operation)

- Operation type: **mock-gateway failure/retry/idempotency and payment-route authorization tests** (P5-03).
  No P5-04+ work; no provider/DB/Docker/Git operation.
- Added **52 unit tests in 3 files** (**§5P**):
  - `gateway-failure-idempotency.spec.ts` **11** — explicit failure, throw/timeout, gateway-success/local-insert
    failure, paid/pending idempotency short-circuits, **B38 concurrency characterization**, duplicate local
    insert, already-paid confirmation, missing payment, terminal/lost-update outcome handling.
  - `webhook-replay-ordering.spec.ts` **4** — **B39 characterization**: SET-before-processing ordering,
    failure-then-retry dropped, duplicate key, Redis-unavailable continuation.
  - `payment-routes-authorization.spec.ts` **37** — real `authMiddleware` + `requirePermission`; 12 protected
    routes × (401/403/200) + public webhook; permissions read from `payment.routes.ts`.
- **B38 reproduced at unit level, not fixed:** two concurrent same-key charges both reached the gateway before
  either local insert; one insert succeeded and the other failed with `ER_DUP_ENTRY` (2 gateway calls for 1
  key). **B39 reproduced at unit level, not fixed:** a processing failure left the replay key, so the retry was
  answered as a duplicate and never processed; Redis-down skipped dedupe. No production change; both remain
  open with the required architectural fix documented.
- Verification: three new files **52/52**; `src/modules/payment` + shared gateway **155/155** (13 files);
  backend `npx tsc -p tsconfig.json --noEmit` **0**; frontend `npm run lint:gate` **PASS** (711 files / 3,377).
- **Not run:** Paymob/Sandbox, live webhook delivery, DB-writing payment integration suites, container suites,
  fresh-DB (B36). The B38/B39 tests are service-level with mocks, not provider reproductions.
- **Risks:** B38/B39 remain open (evidence now exists); B40/B5 residuals/B7/P5-04/B36/B37 and all other risks
  unchanged. No accounting/settlement/refund/payment policy change.
- Changed paths: new `backend/src/modules/payment/__tests__/gateway-failure-idempotency.spec.ts`,
  `backend/src/modules/payment/__tests__/webhook-replay-ordering.spec.ts`,
  `backend/src/modules/payment/__tests__/payment-routes-authorization.spec.ts`;
  `docs/release/COURTZON_RELEASE_PROGRESS.md`. **No production file changed.**
- Roadmap preserved: 100-item denominator unchanged; one item completed (P5-03), 46 → 47; Phase 5 **3/10** at
  that time, acceptance not met. (Superseded on 2026-10-28 by §5Q: P5-04 recorded DONE on limited evidence.)

## 5Q. P5-04 decision record + P5-05 offline Sandbox lifecycle (2026-10-28)

**Operation type:** documentation + tests only. No production code change, no `.env` read, no DB write, no
Docker, no Git operation, no external/provider request.

### 5Q.1 P5-04 — plan criterion and decision

| Field | Value |
|---|---|
| Plan item | **P5-04 — "Confirm Paymob Sandbox configuration is safe and usable."** (§11 Phase 5) |
| Governing rules | Plan §3 (the **User** owns release authorization and accepts residual risk), §5 status model (`DONE` = completed and supported by evidence), §4.11 (unrunnable tests must be reported `BLOCKED`/`NOT RUN`, never `PASS`) |
| Decision | **DONE — limited, user-confirmed evidence** |
| Authorized by | Explicit user instruction in this task: record their confirmation of a successful Hostinger Paymob test as limited evidence for P5-04, with limitations, and allow P5-05 to begin in safe local-only boundaries |
| Independent verification | **NO** — Hostinger was not inspected and no provider call was made by this assistant |

**Evidence recorded (source-tagged):**

| # | Evidence | Source | Strength |
|---|---|---|---|
| 1 | Paymob dashboard shown in **Test mode**; **Public Key** and **Secret Key** labelled **Test**; online-card integration **ID 5663993** exists | User-provided screenshots + explicit confirmation | **User-confirmed** |
| 2 | A Paymob test **succeeded on Hostinger** | User statement | **User-confirmed** |
| 3 | Integration ID `5663993` matches the project's documented/default integration (`docs/payment/paymob.md`, `.env.example`, refund-lookup fixture) | Repository inspection | **Repo-evidenced** |
| 4 | Gateway host fixed to `https://accept.paymob.com` with an allowlist; `PAYMOB_SANDBOX` is configuration state only and never selects a host | `paymob-gateway.ts` | **Repo-evidenced** |
| 5 | Factory fails closed without `PAYMOB_API_KEY`/`PAYMOB_SECRET`/`PAYMOB_HMAC_SECRET`; production requires explicit `PAYMOB_SANDBOX` when provider is Paymob | `gateway-factory.ts`, `env.ts` | **Repo-evidenced** |
| 6 | Health/connectivity probes make **no** network call under `NODE_ENV=test` | `payment.controller.ts` | **Repo-evidenced** |
| 7 | Hardening tests pass (**6/6**) and `tsc --noEmit` is clean | Executed 2026-10-28 (prior step) | **Executed** |

**Recorded limitations (carried forward, not resolved):**

1. **Credential scope is not independently verified.** `PAYMOB_SANDBOX=true` expresses configuration intent only;
   it does not prove the keys are test-scoped. The dashboard screenshot did **not** label the **API Key** as Test.
2. **HMAC availability is unverified** — the HMAC value was not available on the displayed Paymob screen. If it is
   absent, webhook verification fails closed (correctly blocking webhook processing).
3. **Not every lifecycle was verified.** No payment, refund, partial refund, replay, timeout or 3DS path was
   exercised by this assistant. Only one successful user-reported test is claimed.
4. **Host is unchanged** (`https://accept.paymob.com`); no sandbox-host switch was introduced, because the
   project's own documentation and API usage do not establish a separate host.
5. **B7 residual remains High** for external provider behaviour (Intention/order/refund APIs, HMAC field order,
   webhook delivery/reachability, timeouts, `notification_url` fallback).

### 5Q.2 P5-05 — Sandbox lifecycle: offline portion executed

Plan item: **P5-05 — "Run Sandbox lifecycle tests when P5-04 is confirmed."** P5-04 is now confirmed on the
limited evidence above, so the local, offline portion was started; the external portion is not permitted and is
recorded as **DEFERRED**.

| # | Lifecycle step | Test (all with stubbed transport) | Result |
|---|---|---|---|
| 1 | Intention creation (amount in minor units, currency, `payment_methods=[5663993]`, `special_reference`, webhook URL) | `paymob-sandbox-lifecycle.spec.ts` | **PASS** |
| 2 | Checkout URL returned on the allowlisted origin only | same | **PASS** |
| 3 | Fail-closed on intention response without `id`/`client_secret` | same | **PASS** |
| 4 | Fail-closed on transport rejection (`ECONNREFUSED`) without throwing | same | **PASS** |
| 5 | Webhook Intention HMAC accepted for the lifecycle transaction | same | **PASS** |
| 6 | Webhook rejected when a signed field (amount) is tampered | same | **PASS** |
| 7 | Webhook rejected when no HMAC secret is configured | same | **PASS** |
| 8 | Status polling → `paid` | same | **PASS** |
| 9 | Status polling → `failed` (and **no** intention/charge call) | same | **PASS** |
| 10 | Status polling → `pending` for an inconclusive response | same | **PASS** |
| 11 | Refund success (`amount_cents`, `transaction_id`, provider refund id) | same | **PASS** |
| 12 | Refund fail-closed when no provider id is returned | same | **PASS** |
| 13 | Refund-state recovery → `refunded`, cumulative cents, full-refund flag; refund child never matched | same | **PASS** |
| 14 | Non-numeric reference → `unknown` with **zero** transport calls | same | **PASS** |
| 15 | Full simulated lifecycle never leaves the allowlisted origin | same | **PASS** |
| 16 | Disallowed base-URL override (`accept.paymobsandbox.com`) rejected **before** transport use | same | **PASS** |

**Commands and actual results**

```bash
cd backend
npx vitest run src/shared/services/gateway/__tests__/paymob-sandbox-lifecycle.spec.ts   # 15/15 PASS (1 file)
npx vitest run src/shared/services/gateway/__tests__ \
  src/modules/payment/__tests__/paymob-refund-state-lookup.spec.ts \
  src/modules/payment/__tests__/gateway-failure-idempotency.spec.ts \
  src/modules/payment/__tests__/payment-charge-routing.spec.ts                          # 102/102 PASS (6 files)
npx vitest run src/modules/payment                                                      # 100/100 PASS (12 files)
npx tsc --noEmit                                                                        # exit 0, no output
```

**Deferred / not run (recorded in full — never counted as PASS)**

| Item | Status | Exact reason |
|---|---|---|
| Real Sandbox card charge + 3DS redirect | **DEFERRED** | Requires external Paymob calls with credentials; forbidden by this task |
| Real webhook delivery + HMAC from Paymob | **DEFERRED** | Same; also depends on public reachability of the Hostinger callback URL (unverified) |
| Provider refund settlement timing / partial refund | **DEFERRED** | Same; **B40** semantics undecided |
| Credential-scope proof (test vs live) | **BLOCKED** | Not provable locally; API Key not Test-labelled in the supplied screenshot |
| Fresh-DB / rebuilt-environment lifecycle evidence | **BLOCKED** | **B36** baseline/entrypoint convergence defect unresolved |
| DB-writing payment integration suites / container suites | **NOT RUN** | Out of scope under the no-DB-write / no-Docker constraints |

### 5Q.3 Score change and its calculation

Plan §6 defines `Overall % = DONE items / 100`. Exactly one item changed status to `DONE` (P5-04); P5-05 is
`IN_PROGRESS` and therefore **does not count**. Therefore **47 → 48** DONE items, **47 % → 48 %**, and Phase 5
moves **3/10 → 4/10 (40 %)**. No denominator change, no acceptance criteria rewritten, no task deleted.

### 5Q.4 Compliance confirmation (this operation)

- **Secrets:** none printed, inspected for output, or committed. No `.env` contents read.
- **Network/external:** none. Every lifecycle test replaced `globalThis.fetch`; provider calls: **0**.
- **Database:** no writes, migrations, seeds or schema changes.
- **Docker / Git:** none (no rebuild, start/stop, commit, push or deploy).
- **Production code:** unchanged in this operation; only one new spec file plus this document.
- **New/changed paths:** `backend/src/shared/services/gateway/__tests__/paymob-sandbox-lifecycle.spec.ts` (new),
  `docs/release/COURTZON_RELEASE_PROGRESS.md` (this record).

## 5R. P5-06 — booking-slot protection against duplicate bookings (2026-10-28)

**Operation type:** offline tests only. No production code change, no `.env` read, no DB write/migration/seed, no
Docker, no Git operation, no network/provider request.

### 5R.1 Plan criterion, dependencies and scope decision

| Field | Value |
|---|---|
| Plan item | **P5-06 — "Verify booking-slot protection against duplicate bookings."** (§11 Phase 5) |
| Phase acceptance link | Phase 5 acceptance requires **no unexplained duplicate bookings** (§11) |
| Dependency on P5-05 | **None in the plan** — P5-06 has no stated prerequisite and does not consume Sandbox evidence. P5-05 stays `IN_PROGRESS` (external lifecycle deferred) **without blocking P5-06**, because P5-06 is a booking/slot invariant, not a gateway-lifecycle test |
| Dependency on P5-04 | Satisfied (recorded DONE-limited, §5Q) — and not actually required for this item |
| Hard prerequisite (B36) | **Not triggered** — no fresh-DB or rebuilt-environment verification was performed |
| Authorized scope executed | Source inspection + mocked/stubbed unit tests (slot-availability contract, single-booking expiry listener) |
| Scope NOT executed | New DB-writing concurrency runs (forbidden by this task); the P4-03 real-concurrency evidence is cited as previously executed, not re-run |

### 5R.2 What protects a slot (verified in source)

| Layer | Mechanism | Verified by |
|---|---|---|
| Distributed lock | `redisLock.acquireAll` — `SET key owner PX 15000 NX`, compare-and-delete release, partial acquisitions released in `finally` | P4-03 `redis-lock.spec.ts` 13/13 (existing) |
| **Database guard (authoritative)** | `BEGIN` → `SELECT id FROM resources WHERE id = ? FOR UPDATE` → `COUNT` overlapping non-terminal bookings → `INSERT` | **new** `booking-slot-availability.spec.ts` (SQL/order/params) |
| Terminal exclusion | Only `cancelled`, `expired`, `no_show` are excluded; `pending_payment` **remains blocking** | same (asserted directly) |
| Boundary rule | Strict `start_time < ? AND end_time > ?` — adjacent windows do not overlap | same |
| Overnight | Wrap-midnight branch (`DATE_ADD(..., INTERVAL 1 DAY)`) instead of a plain TIME comparison | same |
| Academy holds | Active `pending_court`/`resolved`/`confirmed` court holds block; expired pending holds do not; the session being rescheduled excludes itself | same |
| Expiry release | `payment:expired-event` → one `CancelBooking` (`PAYMENT_TIMEOUT`) for `pending_payment`/`pending`; no release for already-terminal bookings | **new** `booking-payment-expiry-listener.spec.ts` |

**Behaviour note (intentional, not a defect):** a slot held by a `pending_payment` booking stays blocked until the
expiry/cancel transition makes it terminal — that is why duplicate bookings cannot slip in during the payment
window, and why the expiry listener path had to be tested (matrix #21).

### 5R.3 Evidence matrix

| # | Scenario | Class | Result |
|---|---|---|---|
| 1 | `resources` row `FOR UPDATE` issued before the overlap count | offline test | **PASS** |
| 2 | No resource id → no lock statement | offline test | **PASS** |
| 3 | Overlap count excludes only terminal statuses (`pending_payment` blocks) | offline test | **PASS** |
| 4 | Zero overlaps → slot available | offline test | **PASS** |
| 5 | Multi-slot: any overlapping slot rejects the whole request | offline test | **PASS** |
| 6 | Overnight slot uses the wrap-midnight SQL branch | offline test | **PASS** |
| 7 | Active academy hold blocks; expired pending hold does not | offline test | **PASS** |
| 8 | Rescheduled session excluded from its own conflict check | offline test | **PASS** |
| 9 | Single `pending_payment` booking expires → exactly one `CancelBooking`/`PAYMENT_TIMEOUT` | offline test | **PASS** |
| 10 | Generic `pending` booking also expires | offline test | **PASS** |
| 11 | `cancelled`/`expired` booking not re-cancelled | offline test | **PASS** |
| 12 | Missing booking → no command | offline test | **PASS** |
| 13 | Non-booking reference type / missing reference id → no command | offline test | **PASS** |
| 14 | `booking_series` → series branch, never single-booking path | offline test | **PASS** |
| 15 | Cancel command throws → handler resolves (event-safe) | offline test | **PASS** |
| 16 | Command returns `status: 'error'` → handler resolves | offline test | **PASS** |
| 17 | Duplicate expiry event after terminal → single cancel | offline test | **PASS** |
| 18 | Double listener registration → single cancel | offline test | **PASS** |
| 19 | Real concurrency: identical/partial/duplicate booking under `Promise.all` | **P4-03 integration (executed 2026-10-27, not re-run)** | **PASS (16/16)** |
| 20 | New DB-writing concurrency run in this task | — | **NOT RUN** (no DB writes permitted) |

### 5R.4 Commands and actual results

```bash
cd backend
npx vitest run src/modules/booking/__tests__/booking-slot-availability.spec.ts \
               src/modules/booking/__tests__/booking-payment-expiry-listener.spec.ts      # 18/18 PASS (2 files)
npx vitest run src/modules/booking/__tests__/booking-slot-availability.spec.ts \
               src/modules/booking/__tests__/booking-payment-expiry-listener.spec.ts \
               src/modules/booking/commands/expire-booking.spec.ts \
               src/modules/booking/commands/expire-booking.events.contract.spec.ts       # 31/31 PASS (4 files)
npx vitest run src/modules/booking                                                     # 320/320 PASS (23 files)
npx tsc --noEmit                                                                       # exit 0
```

**Mutation proof (scoped, reverted byte-exactly):** adding `pending_payment` to the SQL exclusion list
(`booking.repository.ts`) produced **1 failed / 7 passed** in `booking-slot-availability.spec.ts`; the file was
restored from a byte-exact backup and verified by SHA-256 (`3851328877A86196C670F68691EC3FEF9091BB55D2D64EFA0FCA8BF4C558BAA2`,
identical before/after).

### 5R.5 Limitations and residuals (not marked as passed)

1. **No new real-concurrency execution** in this task (DB writes forbidden). The authoritative proof remains the
   P4-03 run (16/16) recorded in §5F.6; this task adds contract-level coverage, not a replacement.
2. **B30 residual (Low):** the prepare-path availability pre-check runs outside a transaction (its `FOR UPDATE` is a
   no-op in autocommit); safety relies on the 10-minute Redis prepare lock and re-validation at confirm. No lock
   renewal for the 15 s create lock. Recurring series takes multiple resource row locks without Redis locks →
   possible InnoDB deadlock (fails safe, retryable).
3. **Sandbox/payment-provider duplicate-charge window (B38)** is a separate concern owned by P5-03/P5-08 and is
   **not** closed by this item.
4. No integration/container suite was run; `B36` remains a release blocker for fresh-DB verification.

### 5R.6 Score change

Plan §6: `Overall % = DONE items / 100`. Exactly one item changed to `DONE` (**P5-06**); P5-05 stays
`IN_PROGRESS` and does not count. Therefore **48 → 49** DONE items (**48 % → 49 %**), Phase 5 **4/10 → 5/10
(50 %)**. Denominator unchanged; no acceptance criterion rewritten.

### 5R.7 Compliance confirmation (this operation)

- **Secrets:** none printed/inspected/committed; no `.env` contents read.
- **Network/external:** none — no Paymob/provider/SMTP/SMS call; all new tests are stubbed/mocked.
- **Database:** no writes, migrations, seeds or schema changes (the new tests stub the pool/connection).
- **Docker / Git:** none (no rebuild, start/stop, commit, push, deploy).
- **Production code:** unchanged; the temporary mutation was restored byte-exactly and hash-verified.
- **Changed paths:** new `backend/src/modules/booking/__tests__/booking-slot-availability.spec.ts`,
  new `backend/src/modules/booking/__tests__/booking-payment-expiry-listener.spec.ts`,
  `docs/release/COURTZON_RELEASE_PROGRESS.md`.

## 5S. P5-07 — no duplicate accounting postings (idempotency), 2026-10-28

**Operation type:** offline tests only. No production code change, no `.env` read, no DB write/migration/seed,
no Docker, no Git operation, no network/external request.

### 5S.1 Plan criterion, dependencies and scope

| Field | Value |
|---|---|
| Plan item | **P5-07 — "Verify no duplicate accounting postings (idempotency)."** (§11 Phase 5) |
| Phase acceptance link | Phase 5 acceptance requires **no duplicate postings** (§11) |
| Dependencies | None stated; independent of P5-05 (Sandbox) and of **B36** (no fresh-DB/rebuild evidence used) |
| Authorized scope executed | Offline verification of the real posting guard with mocked persistence/engine |
| Scope NOT executed | New DB-writing concurrent inserts; DB constraint re-inspection (read-only `information_schema` evidence from P4-07 is cited, not re-run) |
| Production code changes | **None** (a temporary mutation was used for fail-before proof and restored byte-exactly) |

### 5S.2 The guarantee under test (existing implementation, not assumed)

| Layer | Behaviour | Source |
|---|---|---|
| Application pre-check | `ledgerRepository.hasPosting(source_type, source_id, event_type)` → skip, **no transaction opened** | `accounting-event.listener.ts:896`, `ledger.repository.ts:46` |
| Durable constraint | `ledger_entries.uk_dedup` UNIQUE `(source_type, source_id, event_type, chart_account_id, side)` | verified read-only in **§5J.3** (P4-07) |
| Constraint violation path | `ER_DUP_ENTRY` → rollback, return `false`, **no** `accounting:entry-recorded` | `accounting-event.listener.ts:997-1003` |
| Transactional scope | ledger lines + GL projection share one transaction; rollback removes every partial line | `:963-1006` |
| Posting identity | `(source_type, source_id, event_type)` — **no occurrence ordinal** | Limitation **B35-1** |
| Delivery layer | `processed_events(event_id, subscriber_id)` one handler run per subscriber | P4-06 evidence |

### 5S.3 Evidence matrix (new file, 14 tests)

| # | Scenario | Expected | Result |
|---|---|---|---|
| 1 | Two simultaneous postings, both pass `hasPosting` | exactly one `true` / one `false`, 1 journal, 1 commit, 1 rollback, 1 emit | **PASS** |
| 2 | Four simultaneous duplicates | exactly one journal + one emit; 1 commit / 3 rollbacks | **PASS** |
| 3 | Duplicate write vs GL projection | `projectEntries` called once; `validateOpenPeriod` twice (loser still prepared, never projected) | **PASS** |
| 4 | Repeat call after the winner committed | `false`, **no** new transaction, no second emit | **PASS** |
| 5 | `hasPosting` argument shape | exactly `('booking', 4242, 'booking_card_payment')` | **PASS** |
| 6 | Same source, different event type | both post (payment + refund) | **PASS** |
| 7 | Same event/source type, different source id | both post | **PASS** |
| 8 | Same id/event, different source type | both post | **PASS** |
| 9 | Hard failure then retry | first throws, nothing committed/emitted; retry posts exactly once | **PASS** |
| 10 | Stale pre-check then duplicate insert | `false`, no second journal, 1 rollback | **PASS** |
| 11 | `settlement:paid` delivered twice | `settlement_paid` + `settlement_org_receipt` once each; second delivery skips with **zero** transactions | **PASS** |
| 12 | `payment:gateway-settled` delivered twice | `payment_gateway_settlement` once | **PASS** |
| 13 | Gateway settlement + reversal, each delivered twice | two distinct postings (`…settlement`, `…settlement_reversal`), each once | **PASS** |
| 14 | Settlement event with zero id / zero amount | ignored: no posting, no `hasPosting` call, no throw | **PASS** |

### 5S.4 Commands and actual results

```bash
cd backend
npx vitest run src/modules/financial/__tests__/accounting-duplicate-postings.spec.ts                    # 14/14 PASS
npx vitest run src/modules/financial/__tests__/accounting-duplicate-postings.spec.ts \
               src/modules/financial/__tests__/accounting-posting-idempotency.spec.ts                  # 23/23 PASS
npx vitest run src/modules/financial                                                                    # 375/375 PASS (37 files)
npx tsc --noEmit                                                                                        # exit 0
```

**Mutation proof (scoped, reverted byte-exactly):** disabling the `ER_DUP_ENTRY` idempotent-rollback branch in
`postAccountingEvent` produced **4 failed / 10 passed**; the file was restored from a byte-exact backup and
verified by SHA-256 (`62C2C41724ED97F2324CD054575D5C5D0E9A24C017814A7B9487274EF7E6FCB3`, identical before/after).

### 5S.5 Remaining risks (explicitly not closed by this task)

1. **B35-1 (Medium) — posting identity has no occurrence ordinal.** A *second legitimate* posting of the same
   `(source, event)` (e.g. a later partial refund on the same booking) is skipped. This direction is **under**-posting,
   not duplication; the new "identity scope" tests confirm the guard does not over-skip across event types, source
   ids or source types, but cannot create a distinct key for a genuinely repeated occurrence.
2. **B35-3 (Medium) — handlers log failures without re-driving them.** A transient DB failure leaves the posting
   absent until manual re-delivery; retry works (test 9 / P4-08) but is not automatic.
3. **No new real-concurrency DB test.** Today's race is simulated at the persistence boundary; the durable
   guarantee is the `uk_dedup` UNIQUE key verified read-only in §5J.3. A live duplicate-insert run would require
   DB writes and is **NOT RUN** under this task's constraints.
4. **B38/B39/B40, B5 residuals, B36/B37, B7** unchanged; P5-05 external Sandbox lifecycle remains **DEFERRED**.
5. Settlement/gateway flows were verified at the posting-guard level only — not end-to-end settlement math
   (that is **P5-09**) and not stock/refund reconciliation (**P5-08**).

### 5S.6 Score change

Plan §6: `Overall % = DONE items / 100`. Exactly one item changed to `DONE` (**P5-07**); P5-05 remains
`IN_PROGRESS` and does not count. **49 → 50** DONE items (**49 % → 50 %**), Phase 5 **5/10 → 6/10 (60 %)**.
Denominator unchanged; acceptance criteria not rewritten.

### 5S.7 Compliance confirmation

- **Secrets:** none printed/inspected/committed; no `.env` read.
- **Network/external:** none — all boundaries mocked; no Paymob/provider/SMTP call.
- **Database:** no writes, migrations, seeds or schema changes.
- **Docker / Git:** none (no rebuild, start/stop, commit, push, deploy).
- **Production code:** unchanged; the temporary mutation was restored byte-exactly and hash-verified.
- **Changed paths:** new `backend/src/modules/financial/__tests__/accounting-duplicate-postings.spec.ts`,
  `docs/release/COURTZON_RELEASE_PROGRESS.md`.

## 5T. P5-08 — stock restoration, refunds and reconciliation (2026-10-28)

**Operation type:** offline tests only. No production code change, no `.env` read, no DB write/migration/seed,
no Docker, no Git operation, no network/external request. A temporary source mutation was used for a fail-before
proof and restored byte-exactly.

### 5T.1 Plan criterion, dependencies and scope

| Field | Value |
|---|---|
| Plan item | **P5-08 — "Verify stock restoration, refunds, and reconciliation."** (§11 Phase 5) |
| Phase acceptance link | Phase 5 acceptance requires **no duplicate postings / incorrect settlement balances** and no unexplained duplication (§11) |
| Dependencies | None stated; independent of P5-05 (Sandbox) and **B36** (no fresh-DB evidence used) |
| Authorized scope executed | Offline verification: stock-restore guards + B31 race characterization, refund boundary re-run, reconciliation invariants (previously untested — L-5) |
| NOT executed | DB-writing refund crash-window / group-race / stock-concurrency integration suites (need DB writes); gateway/provider calls; fresh-DB runs |
| Production code / schema | **Unchanged** |

### 5T.2 Stock restoration — verified guards

| # | Scenario | Expected | Result |
|---|---|---|---|
| 1 | Retried `payment:failed` after the order became terminal | one restore only | **PASS** |
| 2 | Order has a paid payment | never restores | **PASS** |
| 3 | Order already `cancelled` / `refunded` | never restores | **PASS** |
| 4 | Order rows missing | no-op | **PASS** |
| 5 | Multi-line order | each line restored once with its ordered quantity/variant | **PASS** |
| 6 | Two **concurrent** `payment:failed` deliveries | exactly one claim → **exactly one restore** | **PASS (fixed §5U)** |
| 7 | Second delivery after the status write | ignored | **PASS** |

**B31 — FIXED (2026-10-28, see §5U).** The previously characterized race (both deliveries passing the guard and
double-restoring) no longer reproduces: the terminal transition is a conditional atomic claim executed in one
transaction with the restore. The pre-fix behaviour is still reproducible by removing the claim gate (mutation
proof: **4 failed / 6 passed**).

### 5T.3 Refunds — verified evidence

| Layer | Evidence | Status |
|---|---|---|
| Refund arithmetic boundaries (over-refund clamp, zero, 2-dp proration, capacity exhaustion, recovered > settled) | `booking-refund-boundaries.spec.ts` **9/9** (re-run now) | **PASS (offline)** |
| Refund crash windows T1/T2/T3, stale intent, unknown state | `hardening-refund-crash-window.integration.spec.ts` (14) — executed in P4-07/P4-08 | **NOT RUN today** (DB writes) |
| Concurrent refunds of one payment → one gateway call | `hardening-group-card-refund-race.integration.spec.ts` (5) — executed earlier | **NOT RUN today** (DB writes) |
| Wallet refund credits once | `hardening-payment-refund.integration.spec.ts` (2) — executed earlier | **NOT RUN today** (DB writes) |
| **B40** partial-refund representation | single-payment partial refund sets `refunded`; no `refunded_amount` / `partially_refunded`; multi-partial only for recurring allocations | **OPEN limitation (unchanged)** |

### 5T.4 Reconciliation — invariants now covered (L-5 closed for the service)

| # | Invariant | Result |
|---|---|---|
| 1 | Gateway reports PAID, local pending → `CRITICAL`, `autoFixable: true`, gateway ref carried in detail | **PASS** |
| 2 | Gateway reports failed **or** unreachable → **no** issue (fail-safe, item still counted) | **PASS** |
| 3 | Paid payment + non-confirmed booking → `WARNING`, not auto-fixable | **PASS** |
| 4 | Wallet deducted without completed payment → `CRITICAL`, manual only | **PASS** |
| 5 | Paid payment with no reference → `WARNING` (orphan) | **PASS** |
| 6 | Confirmed booking without paid payment → `INFO` (COD is normal) | **PASS** |
| 7 | Settled refund credits 1120 by gross and leaves 1100 untouched → no issue | **PASS** |
| 8 | Settled refund booked against clearing → `CRITICAL`, report-only | **PASS** |
| 9 | 2-dp rounding before comparison (no float false positive) | **PASS** |
| 10 | Refunded payment after settlement with **no** settled-refund posting → `CRITICAL` | **PASS** |
| 11 | Gateway-settled tournament payment with no settlement lineage → `CRITICAL` | **PASS** |
| 12 | Counters (`critical/warning/info`) sum to `issuesFound` | **PASS** |
| 13 | `autoFix` acts **only** on auto-fixable issues; report-only financial checks untouched | **PASS** |
| 14 | A failing auto-fix is contained (run completes, `autoFixed = 0`, no `[AUTO-FIXED]` marker) | **PASS** |
| 15 | `dateFrom`/`dateTo` are escaped via `pool.escape`, never interpolated raw | **PASS** |
| 16 | `RECONCILIATION.RUN` audit record carries run counters | **PASS** |

**Scope limits of this evidence:** the service was exercised with a stubbed pool — the SQL itself was **not**
executed against MySQL, so query semantics (joins, series-awareness, `NOW() - INTERVAL 7 DAY`) remain verified only
by source inspection plus the earlier read-only integration mapping tests. Full gateway-settlement totals, fees and
payable reconciliation remain **P5-09**.

### 5T.5 Commands and actual results

```bash
cd backend
npx vitest run src/modules/payment/__tests__/reconciliation-invariants.spec.ts                      # 16/16 PASS
npx vitest run src/modules/marketplace/__tests__/stock-restore-race.spec.ts                         # 7/7 PASS
npx vitest run <both new> checkout-inventory-integrity.spec.ts booking-refund-boundaries.spec.ts     # 41/41 PASS (4 files)
npx vitest run src/modules/payment src/modules/marketplace                                       # 341/341 PASS (35 files)
npx tsc --noEmit                                                                                   # exit 0
```

**Mutation proof (scoped, reverted byte-exactly):** bypassing the settled-refund invariant
(`if (bankCredit === gross && clearingNet === 0) continue;` → `if (true) continue;`) produced **2 failed /
14 passed** in `reconciliation-invariants.spec.ts`; the file was restored from a byte-exact backup and verified by
SHA-256 (`797AC776631FD93F0FEF6F1AE293C1595D43DD1745180296265B2041F377C922`, identical before/after).

### 5T.6 Remaining risks (not closed)

1. **B31 — FIXED (2026-10-28, §5U)** for the automated cancel/failure/cleanup paths; the order-creation/decrement
   statements that precede payment remain non-transactional (pre-existing, unchanged).
2. **B40 (Medium, OPEN)** — no partial-refund representation for single payments; a second partial refund is
   impossible and reporting cannot read the refunded amount.
3. **DB-writing refund/stock integration suites NOT RUN** today (no DB writes), including the real-concurrency
   stock tests executed earlier in P4-04.
4. **Reconciliation SQL not executed** (stubbed pool); gateway totals/fees/payables → **P5-09**.
5. **B38/B39/B5 residuals/B36/B37/B7** unchanged; **P5-05 external Sandbox lifecycle DEFERRED**.

### 5T.7 Score change

Plan §6: `Overall % = DONE items / 100`. Exactly one item changed to `DONE` (**P5-08**); P5-05 stays
`IN_PROGRESS` and does not count. **50 → 51** DONE items (**50 % → 51 %**), Phase 5 **6/10 → 7/10 (70 %)**.
Denominator unchanged; acceptance criteria not rewritten.

### 5T.8 Compliance confirmation

- **Secrets:** none printed/inspected/committed; no `.env` read.
- **Network/external:** none — gateway, pool, audit and services stubbed; no Paymob/provider call.
- **Database:** no writes, migrations, seeds or schema changes.
- **Docker / Git:** none (no rebuild, start/stop, commit, push, deploy).
- **Production code:** unchanged; the temporary mutation was restored byte-exactly and hash-verified.
- **Changed paths:** new `backend/src/modules/payment/__tests__/reconciliation-invariants.spec.ts`,
  new `backend/src/modules/marketplace/__tests__/stock-restore-race.spec.ts`,
  `docs/release/COURTZON_RELEASE_PROGRESS.md`.

## 5U. B31 fix — atomic cancel claim + stock restoration (2026-10-28)

**Operation type:** production fix (2 files) + deterministic mocked tests. No schema change, no migration, no
`.env` read, no DB write, no Docker, no Git operation, no network/provider request.

### 5U.1 Root cause (exact locations)

| # | Location | Defect |
|---|---|---|
| 1 | `marketplace.service.ts::handlePaymentFailed` (was 1317-1350) | Read order status → `_restoreOrderStock` (unguarded read-then-write) → `updateOrderStatus` afterwards. Two overlapping deliveries both read a non-terminal order and both restored inventory. |
| 2 | `marketplace.service.ts::_restoreOrderStock` (was 1272-1292) | Guard (`orderHasPaidPayment`, status check) and restore were separate statements with no lock/claim — a TOCTOU window. |
| 3 | `marketplace.service.ts::_cancelOrdersAfterFailedCheckout` (was 1306-1315) | Restore → unconditional status write, same window. |
| 4 | `marketplace.service.ts::cancelAbandonedOrders` (was 2289-2294) | Restore → unconditional status write; two overlapping cron workers could both restore. |
| 5 | `marketplace.repository.ts::updateOrderStatus` (was 925-934) | Unconditional `UPDATE … WHERE id = ?`; no affected-rows result, so nothing could act as a claim. |
| 6 | `marketplace.service.ts::updateOrderStatus` (was 1144) + sibling branch (was 1181-1186) | Manual cancel/refund restored stock unconditionally after the status write — the same race for two concurrent manual cancels. |

**Impact:** inventory inflation (stock counted twice) → oversell risk, incorrect availability, and duplicate
cancellation side effects (history/events) for the same order.

### 5U.2 Fix (no schema change required)

| File | Change |
|---|---|
| `backend/src/modules/marketplace/infrastructure/repositories/marketplace.repository.ts` | `updateOrderStatus(id, status, reason?, conn?)` now returns `Promise<boolean>` and, for terminal targets only (`cancelled`/`refunded`), appends `AND status NOT IN ('cancelled','refunded')`. The `affectedRows > 0` result **is the claim**. `restoreStock(..., conn?)` and `createOrderStatusHistory(data, conn?)` accept an optional transaction connection (default = pool, so every existing caller is unaffected). |
| `backend/src/modules/marketplace/application/marketplace.service.ts` | New `_cancelOrdersWithStockRestore(orderIds, reason)` runs **one `withTransaction`**: phase 0 paid-payment safety check; phase 1 claims every order (conditional terminal UPDATE, ascending id); phase 2 restores stock only for claimed orders (ascending id, item order) on the same connection; phase 3 writes history on the same connection. `handlePaymentFailed`, `_cancelOrdersAfterFailedCheckout` and `cancelAbandonedOrders` now delegate to it; `handlePaymentFailed`/cleanup emit only when at least one order was claimed. `updateOrderStatus` returns early (`getOrder`) when a terminal transition loses the claim, and the sibling loop skips restore/history when `siblingClaimed === false`. Removed the now-unused `_restoreOrderStock`/`_restoreOrdersStock` read-then-write helpers. |

**Transaction boundaries**
- Begin/commit/rollback: `withTransaction` (existing helper, `database.transaction.ts`).
- Inside: claim UPDATEs + inventory UPDATEs + status-history INSERTs — all on the transaction connection.
- Outside: the paid-payment safety read (`orderHasPaidPayment`, pool), event emission (after the transaction
  returns), and the pre-existing refund/money movement in the manual `updateOrderStatus` path (money first,
  unchanged; refunds are already idempotent).

**Why no schema change is needed:** the order `status` column already distinguishes terminal states; a conditional
UPDATE on it is an atomic, durable claim. No new column/table is required, and there is no dependency on a Redis
lock (which would not survive process crashes).

**Deadlock analysis:** every transaction locks order rows **first, ascending id**, and only then product rows
(ascending id, item order). Two overlapping checkout groups therefore acquire shared order locks in the same
sequence; no order→product→order cycle can form. Concurrent groups sharing products can still wait on the same
product row, but the wait is one-directional (all order locks are already held). If InnoDB nevertheless reports a
deadlock, the transaction rolls back, the listener logs it, and the idempotent retry re-runs safely (claim + restore
are all-or-nothing).

**Behaviour preserved:** sequential retries are still no-ops; orders with a paid payment are never cancelled;
legitimate independent orders and group siblings are each restored exactly once; manual cancel/refund still refunds
before the status claim; the emitted event and status-history shape are unchanged.

### 5U.3 Tests and results

| Test | Proves | Result |
|---|---|---|
| 2 concurrent `payment:failed` (gated interleaving) | one claim → one restore, one emit | **PASS** |
| 4 concurrent duplicates | one restore | **PASS** |
| sequential retry | one restore, one emit | **PASS** |
| two independent orders | each restored once | **PASS** |
| checkout group + concurrent duplicates | one restore per order (2, not 4) | **PASS** |
| crash during restore | transaction rolls back claim + stock; retry restores once | **PASS** |
| paid order | never claimed/cancelled/restored | **PASS** |
| already terminal order | no transaction, no restore, no emit | **PASS** |
| multi-line/variant order | each line restored with its own quantity/variant | **PASS** |
| overlapping `cancelAbandonedOrders` runs | one restore, total `cancelled = 1` | **PASS** |

```bash
cd backend
npx vitest run src/modules/marketplace/__tests__/stock-restore-race.spec.ts     # 10/10 PASS
npx vitest run src/modules/marketplace src/modules/payment                      # 344/344 PASS (35 files)
npx tsc --noEmit                                                                # exit 0
npx vitest run                                                                  # 4055 passed / 8 failed — all 8 pre-existing
```

**Fail-before proof (scoped, reverted byte-exactly):** replacing the claim gate
`if (await repo.updateOrderStatus(id, 'cancelled', reason, conn)) claimed.push(id);` with an unconditional
claim-list push produced **4 failed / 6 passed** in the regression suite; `marketplace.service.ts` was restored from
a byte-exact backup and verified by SHA-256 (`8B82FDD3B257D43D710C38B063BDECDA845AC4F8BA65D72E53FD28F6EF2465E9`,
identical before/after). The 8 full-suite failures are **pre-existing and unrelated**: `proxy-contract.spec.ts`
(**B28**, 2), and date-expired subscription fixtures (**B8** class) in `membership-p2` (1),
`current-subscription-resolution` (2), `view-assignments-status` (3) — none import the marketplace module.

### 5U.4 Remaining risks

1. **No real-MySQL concurrency run** for the new guard (DB writes forbidden in this task). The guarantee rests on
   the conditional UPDATE semantics plus the mocked race/crash tests; the real concurrency suite remains **NOT RUN**.
2. **Order creation + stock decrement** (pre-payment) are still separate autocommit statements — a crash there is
   a pre-existing, documented residual, not part of B31.
3. The manual cancel/refund path still performs the money refund **before** the status claim; a losing concurrent
   request may attempt a refund that is idempotent (guarded by the unique order-refund transaction / paid-payment
   lookup) — no double money movement, but it does log a refund attempt.
4. **B40** (partial refunds), **B38/B39**, **B5**, **B35**, **B36/B37**, **B7** unchanged; **P5-05 external
   Sandbox lifecycle DEFERRED**.

### 5U.5 Score

No checklist item changes: P5-08 was already `DONE` (verification); this task fixes the defect it found. Overall
stays **51/100 (51 %)**, Phase 5 **7/10 (70 %)**.

### 5U.6 Compliance confirmation

- **Secrets:** none printed/inspected/committed; no `.env` read.
- **Network/external:** none.
- **Database:** no writes, migrations, seeds or schema changes.
- **Docker / Git:** none (no rebuild, start/stop, commit, push, deploy).
- **Changed files:** `backend/src/modules/marketplace/infrastructure/repositories/marketplace.repository.ts`,
  `backend/src/modules/marketplace/application/marketplace.service.ts`,
  `backend/src/modules/marketplace/__tests__/stock-restore-race.spec.ts`,
  `backend/src/modules/marketplace/__tests__/checkout-inventory-integrity.spec.ts` (mock now models the claim),
  `backend/src/modules/marketplace/__tests__/multi-seller-checkout.spec.ts` (claim-aware mock + 4-arg assertion),
  `docs/release/COURTZON_RELEASE_PROGRESS.md`.

## 5V. P5-09 — gateway clearing, fees, payables and settlements (2026-10-28)

**Operation type:** read-only review + offline tests. No production code change, no `.env` read, no DB write/
migration/seed, no Docker, no Git operation, no network/provider request.

### 5V.1 Plan criterion and scope

| Field | Value |
|---|---|
| Plan item | **P5-09 — "Verify gateway clearing, fees, payable balances, settlements."** (§11 Phase 5) |
| Phase acceptance link | Phase 5 requires **no incorrect settlement balances** (§11) |
| Dependencies | None stated for P5-09 itself; **B36** only affects fresh-DB evidence (not used) |
| Executed | Offline verification of fee/net math, batch creation/duplicate protection, reversal, and the settlement reconciliation service |
| NOT executed | DB-writing integration suites (`gateway-settlement.integration` 8, `gateway-settlement-reversal.integration` 6), fresh-DB runs, provider calls |
| Production code | **Unchanged** |

### 5V.2 Verified invariants (offline, mocked persistence/transport)

| # | Invariant | Evidence | Result |
|---|---|---|---|
| 1 | `fee = round2(gross·pct/100 + fixed)`, `net = round2(gross − fee)`, so **gross = fee + net** to the cent | `gateway-settlement-fees.spec.ts` | **PASS** |
| 2 | Batch header gross/fee/net equal the Σ of computed line snapshots | `gateway-settlement-create.spec.ts` | **PASS** |
| 3 | One clearing→bank journal per batch, posted **inside** the batch transaction with the same totals | same | **PASS** |
| 4 | Duplicate request: repeated ids deduped; already-linked payment, existing ACTIVE line, and a lost guarded `UPDATE` are all rejected with **no insert and no posting** | same | **PASS** |
| 5 | A failing later line rolls the whole batch back — no partial journal | same | **PASS** |
| 6 | Missing fee configuration is rejected (no silent 0% fee); non-gateway methods and unpaid/zero-amount payments rejected | same + fees spec | **PASS** |
| 7 | Reversal posts the exact inverse from the **stored** batch amounts, once; already-reversed rejected; concurrent linkage change aborts without commit | same | **PASS** |
| 8 | Reconciliation: batch header = Σ ACTIVE lines (gross/fee/net) with 2-dp tolerance | `gateway-settlement-reconciliation.spec.ts` | **PASS** |
| 9 | Reconciliation: transaction_count = ACTIVE lines, active-line ownership, payment↔batch linkage, duplicate ACTIVE ownership | same | **PASS** |
| 10 | Reconciliation: refunded payment never ACTIVE; refunded tournament detached; unsettled-after-draw-lock = WARNING | same | **PASS** |
| 11 | Reconciliation is strictly report-only (`readOnly`, `autoFixAvailable:false`), counters sum, 200-issue cap, audit per discrepancy, audit failure contained | same | **PASS** |

Commands and results:

```bash
cd backend
npx vitest run src/modules/settlement                                    # 104/104 PASS (9 files, post-fix)
npx tsc --noEmit                                                         # exit 0
```

### 5V.3 B42 — mixed-currency settlement batch (FIXED 2026-10-28)

| Field | Detail |
|---|---|
| **File** | `backend/src/modules/settlement/application/gateway-settlement.service.ts` |
| **Root cause** | `create()` built `lines` from any selected payment ids and never checked that they shared a currency. It computed `grossTotal`/`feeTotal`/`netTotal` across **all** lines and stamped the header with `lines[0].currency`; the clearing→bank journal (`:299`) and the later reversal reused that mixed header. |
| **Reachability** | `POST` create accepts an arbitrary `paymentTransactionIds[]` (`gateway-settlement.controller.ts:25-36`) and `listEligible()` returns payments of any currency (`:93-109`). No server-side currency filter existed. |
| **Impact (pre-fix)** | A batch could report `gross 300 EGP` composed of 100 EGP + 200 USD; header, journal, derived payable and reversal were currency-mixed — arithmetically balanced, economically meaningless. |
| **Fix (applied)** | After the per-payment validation loop and **before** totals / any INSERT / any accounting call, `create()` now derives `new Set(lines.map(l => l.currency))` and throws the existing `ConflictError` when more than one currency is present: *“All payment transactions in a gateway settlement must share the same currency (selected: EGP, USD)”*. No conversion, no schema change. The transaction is rolled back by the existing `catch` — no partial batch, line or journal. |
| **Fail-before proof** | Removing the guard (`if (currencies.length > 1)` → `if (false)`) produced **2 failed / 19 passed** (both mixed-currency tests); the file was restored byte-exactly, SHA-256 `57B2F3AB2207CABD6E533AE4B65AC575273A5DE45DEA43E630DBF7A0A2CF179F`. |
| **Regression tests** | `gateway-settlement-create.spec.ts` → *“P5-09 / B42 — single-currency settlement guard”*: mixed EGP/USD rejected before persistence/accounting; rejected regardless of order; single-currency EGP+EGP and USD+USD still create normally with correct header/journal. |

### 5V.4 Fee-boundary decision (no behaviour change)

`payment_methods.processing_fee_pct` is `decimal(5,2)` and `processing_fee_fixed` is `decimal(12,2)`; the baseline
and seeds define **no** check constraint or documented invariant that `fee < gross`, and seeded values are benign
(card = 2.5% + 1.00). A small gross with a fixed fee (or a misconfigured pct > 100) can therefore produce
`net <= 0`; this is **not established as invalid** by existing business rules. Per the task's rule, **no new
restriction was added** and behaviour is unchanged. The boundary stays recorded as an open configuration risk
(characterized in `gateway-settlement-fees.spec.ts`): a future guard would be `if (fee >= gross) throw ConflictError`
in `create()`, plus the same guard in `listEligible()` surfacing.

### 5V.5 Other residuals and status

1. **Fee ≥ gross is unguarded and was deliberately left unchanged** (see §5V.4): no existing rule establishes it as
   invalid. Characterized in `gateway-settlement-fees.spec.ts`; a future guard would be `fee >= gross` rejection.
2. **Real-DB settlement integration suites were NOT RUN** (no DB writes): the actual `FOR UPDATE` locking,
   `uk_gst_active_payment` unique key and rollback behaviour are verified only by source inspection + mocked tests.
3. **Payable balances** were verified only indirectly: the settlement posting (`Dr 2202/1161 / Cr 1120`) and the
   org-side receipt posting are covered by the P4-07 mapping audit; no new payable-balance computation test was
   added here.
4. **B38/B39/B40/B5/B35/B36/B37/B7** unchanged; **P5-05 external Sandbox lifecycle DEFERRED**.

### 5V.6 Status and score

**P5-09 = `DONE`** (2026-10-28). Verification is complete and the only defect it found (**B42**) is fixed with
deterministic offline tests. Explicit limitations carried forward: the DB-writing settlement integration suites are
**NOT RUN**, payable balances are evidenced indirectly through the P4-07 posting audit, and the fee ≥ gross
configuration boundary remains an accepted, unguarded risk (no rule makes such a settlement invalid).

Checklist arithmetic (plan §6): one item moved to `DONE` — **51 → 52** DONE items, **51 % → 52 %**; Phase 5
**7/10 → 8/10 (80 %)**. Denominator unchanged (100). Phase 5 acceptance is still **NOT MET** because P5-05's
external Sandbox lifecycle is **DEFERRED** and **P5-10** is `TODO`.

### 5V.7 Compliance confirmation

- **Secrets:** none printed/inspected/committed; no `.env` read.
- **Network/external:** none.
- **Database:** no writes, migrations, seeds or schema changes.
- **Docker / Git:** none.
- **Changed paths:** new `backend/src/modules/settlement/__tests__/gateway-settlement-fees.spec.ts`,
  new `backend/src/modules/settlement/__tests__/gateway-settlement-create.spec.ts`,
  new `backend/src/modules/settlement/__tests__/gateway-settlement-reconciliation.spec.ts`,
  `backend/src/modules/settlement/application/gateway-settlement.service.ts` (B42 guard),
  `docs/release/COURTZON_RELEASE_PROGRESS.md`.

## 5W. P5-10 — Phase 5 evidence ledger: mocked vs Sandbox vs not-run (2026-10-28)

**Operation type:** documentation/evidence only. No production code, schema, data, `.env`, network, Docker or Git
operation. Every number below was re-executed or re-read in this task; nothing is inferred from memory.

### 5W.1 Evidence classes (used consistently below)

| Class | Meaning | May be called "verified"? |
|---|---|---|
| **A** | Automated **offline** test — real implementation with mocked/stubbed persistence; no DB write, no network | Yes — as *offline/mocked* evidence only |
| **S** | Source inspection / static analysis (including read-only `information_schema` checks from earlier tasks) | Yes — as *static* evidence only |
| **I** | Integration test executed in an **earlier** session against the real local `courtzon_v3` MySQL; recorded result, **not re-executed** under the current no-write constraint | Yes — as *previously executed* evidence, clearly dated |
| **U** | **User-confirmed** external behaviour on Hostinger; not independently observed by the assistant | Only as *user-confirmed*; never as independently verified |
| **X** | **Independently executed external** Sandbox transaction by the assistant | **None in Phase 5** |
| **N** | NOT RUN / DEFERRED (DB-writing integration, container suites, fresh-DB, provider calls) | **Never** — reported as blocked/deferred, never `PASS` |

Rule applied throughout: **A ≠ X** and **U ≠ X**; mocks never upgrade to Sandbox, and user confirmation never
upgrades to independent verification.

### 5W.2 Phase 5 evidence per checklist item

| Item | Executed evidence (class) | Exact result | External/Sandbox status |
|---|---|---|---|
| **P5-01** lifecycle map + matrix | **S** (12 flows, 45-row matrix) + **A** (payment unit suite) | matrix in §5N.5; payment suite re-runs green (100/100 in P5-07/§5S runs) | none required |
| **P5-02** webhook HMAC ± | **A** — `paymob-webhook-hmac.spec.ts`, `webhook-signature-handling.spec.ts`, `payment-webhook-controller.spec.ts` | **65/65** (recorded §5O); HMAC construction pinned to the 20/23-field implementation, fail-closed rejections, 401 with no state change | provider field order **not** confirmed by Paymob — **DEFERRED (B7)** |
| **P5-03** gateway failure/timeout/idempotency | **A** — `gateway-failure-idempotency`, `webhook-replay-ordering`, `payment-routes-authorization` | **52/52** (recorded §5P); **B38/B39 reproduced**, characterised, **not fixed** | no provider call |
| **P5-04** Sandbox configuration safety | **U** (Test-mode dashboard, Test-labelled Public/Secret keys, integration `5663993`, successful Hostinger test) + **A** (`paymob-sandbox-config` **6/6**) + **S** (fixed host + allowlist, fail-closed factory, test-safe health checks) | `DONE` **limited** — §5Q | **No X.** Credential scope, API-key label and HMAC availability remain unverified; `PAYMOB_SANDBOX=true` is not proof of scope |
| **P5-05** Sandbox lifecycle | **A** — `paymob-sandbox-lifecycle.spec.ts` (**15/15**, fully stubbed `fetch`, every URL pinned to `https://accept.paymob.com`) | offline lifecycle: intention → checkout URL → webhook HMAC → status → refund → refund-state recovery | **External lifecycle DEFERRED** — real charge/3DS/webhook delivery/provider refund timing **never executed** |
| **P5-06** duplicate booking slot protection | **A** — `booking-slot-availability` (8) + `booking-payment-expiry-listener` (10) + **I** — P4-03 real `Promise.all` concurrency **16/16** (2026-10-27) | 18/18 offline; matrix #21 closed; SQL guard/claim contract pinned | DB-writing concurrency **not re-run** (N) |
| **P5-07** no duplicate accounting postings | **A** — `accounting-duplicate-postings` (**14/14**) + `accounting-posting-idempotency` (9) + **S** (`ledger_entries.uk_dedup` read-only, §5J) | concurrent duplicate race → one journal/one emit; identity scope; retry; settlement event duplicates | durable guarantee rests on the DB unique key (**S**), not a live duplicate-insert run |
| **P5-08** stock restoration / refunds / reconciliation | **A** — `reconciliation-invariants` (16) + `stock-restore-race` (10) + `checkout-inventory-integrity` (9) + `booking-refund-boundaries` (9) + **I** — P4-04 real stock concurrency 3/3, P4-07 refund integration 27/27 (earlier) | 26/26 current P5-08 files (44/44 with the two P4 suites); **B31 FIXED** (§5U, 10/10 regression) | DB-writing refund/stock suites **NOT RUN** today (N) |
| **P5-09** clearing/fees/payables/settlements | **A** — `gateway-settlement-fees` (14) + `gateway-settlement-create` (21) + `gateway-settlement-reconciliation` (15) + **S** (fee columns/constraints, posting model) | **50/50**; **B42 FIXED** (§5V.3, fail-before 2/19) | `gateway-settlement.integration` (8) and `-reversal.integration` (6) **NOT RUN** (N); payable balances evidenced via the P4-07 posting audit, not a live computation |
| **P5-10** evidence classification (this ledger) | **S** + **A** aggregates re-executed | see §5W.4 | n/a |

**Aggregate executed today (all Phase 5 offline spec files):**

```bash
cd backend
npx vitest run <16 Phase 5 spec files>       # 16 files, 246/246 PASS
npx vitest run src/modules/settlement        # 104/104 PASS (9 files)
npx tsc --noEmit                             # exit 0
npx vitest run                               # 4105 passed / 8 failed (4 pre-existing files)
```

The 8 full-suite failures are unrelated and unchanged: `proxy-contract.spec.ts` (**B28**, 2) and date-expired
subscription fixtures (**B8** class) in `membership-p2` (1), `current-subscription-resolution` (2),
`view-assignments-status` (3). Non-integration spec files in the backend: **335**.

### 5W.3 External evidence ledger — Sandbox vs user-confirmed (strict separation)

| Claim | Class | Detail / limitation |
|---|---|---|
| Paymob dashboard is in **Test mode** | **U** | User-provided screenshots; not inspected by the assistant |
| Public Key + Secret Key labelled **Test** | **U** | Same |
| Integration ID `5663993` exists and matches the project default | **U** (presence) + **S** (repo docs/tests) | Value appears in `docs/payment/paymob.md`, `.env.example`, a test fixture |
| A Paymob test **succeeded on Hostinger** | **U** | No request/response, log, transaction id or screenshot of the result was provided; **cannot** be independently verified |
| API Key is test-scoped | **Not established** | The API Key was **not** labelled Test in the supplied screenshot |
| HMAC secret is available/configured | **Not established** | HMAC was not visible on the displayed screen; webhook verification fails closed without it |
| Assistant executed any Paymob/Sandbox call | **No (X = 0)** | Every Phase 5 test stubs `fetch`; no external request was made in any task |
| Real Sandbox lifecycle (charge, 3DS, webhook delivery, refund) | **DEFERRED** | Requires authorised external calls with credentials; **not** covered by U or A evidence |
| Fresh-DB / rebuilt-environment evidence | **BLOCKED** | **B36** (baseline/entrypoint convergence) unresolved |

### 5W.4 Unresolved risks carried in the Phase 5 record

| Risk | State | Impact |
|---|---|---|
| **B7 / P5-05 external** | **DEFERRED** | Real provider behaviour, credential scope, webhook reachability and HMAC field order remain unverified |
| **B38** duplicate-charge window | **OPEN (characterised)** | Gateway called before the local row; concurrent same-key requests can double-charge |
| **B39** webhook replay ordering | **OPEN (characterised)** | Replay key written before processing → failed processing suppresses retries |
| **B40** partial refunds | **OPEN (limitation)** | Single-payment partial refund closes the payment; no `refunded_amount` |
| **B5** security negatives | **PARTIAL** | Timing-safe HMAC comparison, upload magic-byte, CORS/header and brute-force tests still missing |
| **B35-1 / B35-3** | **OPEN (characterised)** | No occurrence ordinal in posting identity; accounting handlers do not auto-retry |
| **B36** baseline convergence | **OPEN (Critical, release blocker for fresh deploy/DR)** | Baseline missing tables/columns; entrypoint stamps the chain on a fresh DB |
| **B37** endpoint/schema mismatches | **OPEN (High)** | Org payment settings, mobile push, resource maintenance reference non-existent columns |
| **fee ≥ gross** | **ACCEPTED RISK (unfixed by decision)** | No rule/constraint invalidates it (§5V.4); a misconfigured fee can produce `net ≤ 0` |
| DB-writing payment/refund/settlement integration suites | **NOT RUN** | Real locks, rollbacks and unique-key races verified only by source/mocks (or earlier dated runs) |
| 32 Testcontainers suites | **BLOCKED** | Violate the no-new-container/DB rule; not executed |

### 5W.5 Consistency checks actually performed

1. **Numbers:** the 246/246, 104/104, `tsc` exit 0 and 4105/8 figures were produced by commands in this task, not copied.
2. **No status inflation:** `DONE` items rely on executed evidence; P5-04 is explicitly `DONE (limited)` on **U**
   evidence; P5-05 remains `IN_PROGRESS`; no `DEFERRED`/`NOT RUN` item is counted as `DONE`.
3. **No mocked-as-Sandbox claim:** the only Paymob "success" in this record is labelled **U**; the assistant has
   executed **zero** provider calls.
4. **Plan arithmetic:** 100-item denominator unchanged; exactly one item (P5-10) moved to `DONE` → **52 → 53**
   items (**52 % → 53 %**), Phase 5 **8/10 → 9/10 (90 %)**; dashboard columns sum to 53
   (10+10+10+10+9+2+1+1).
5. **Phase 5 acceptance:** still **NOT MET** — plan rule 4.5 states unit tests and mocks do not replace
   integration/Sandbox/real-UI testing, and P5-05's external lifecycle is deferred. No production-readiness claim.

### 5W.6 Compliance confirmation

- **Secrets:** none printed/inspected/committed; no `.env` read.
- **Network/external:** **none** — the aggregate suite is fully mocked; the only external claim is user-confirmed (U).
- **Database:** no writes, migrations, seeds or schema changes.
- **Docker / Git:** none.
- **Changed paths:** `docs/release/COURTZON_RELEASE_PROGRESS.md` only.

## 18. Session handoff (resume here)

**State at pause (2026-10-28):** **Phase 3 DONE (10/10)**; **Phase 4 DONE (10/10, audit acceptance met —
B36/B37 open)**; **Phase 5 9/10 (90 %), acceptance NOT MET** — P5-04 `DONE` on limited, user-confirmed evidence
(§5Q); P5-05 **IN_PROGRESS**, external Sandbox lifecycle **DEFERRED**; P5-06…P5-10 `DONE` (§5R–§5W; **B31** and
**B42** fixed); **Phase 6 3/10 (30 %)** — P6-01, **P6-02** (matrix: `docs/release/E2E_SCENARIO_MATRIX.md`), P6-03
`DONE`, P6-04…P6-10 not started; overall **54/100 (54 %)**. Next plan item is **P6-04**, blocked by the open Phase 5
acceptance (P5-05 deferred) and by execution prerequisites (running stack, DB-write approval, missing RBAC/session
specs A6–A8).
Phase 2 remains closed with its deferrals (**AR-2** Alpine/Docker → Phase 9, **B13** backend production
transitives, **B14** frontend dev-only advisories). Frontend suite is fully green (**1414/1414**, 144/144
files), `tsc -b --force` clean, `react-hooks/rules-of-hooks` **0**, lint gate **PASS** (711 files / 3,377
findings, baseline untouched).

**P5-03 result to carry forward (gateway/idempotency — do not misread as fixed):**
1. **B38 remains OPEN.** The unit test proves the current flow can call the gateway twice for one idempotency
   key before either local row is inserted. Do not claim a fix; a reservation/pre-insert state or provider
   idempotency is required (P5-08/hardening).
2. **B39 remains OPEN.** The replay key is written before processing; a failed processing suppresses retries for
   24 h. A correct fix (mark-after-success or `SET NX` + delete-on-failure) must be designed/reviewed separately.
3. Payment-route guards are now pinned by tests: webhook public; charge/confirm/status/refund/transactions/
   sync/expire/recover/health/reconciliation/production-readiness require authentication + the permission keys
   in `payment.routes.ts`. Do not weaken or “broaden” these guards without updating the matrix.
4. Gateway failure/timeout creates no local row; a gateway success followed by a local insert failure leaves an
   un-compensated gateway charge (current behaviour, evidence for B38).
5. **P5-04 is closed on limited evidence (§5Q)** — user-confirmed Test-mode dashboard, Test-labelled
   Public/Secret keys, success on Hostinger — but credential scope and HMAC availability are still unverified and
   no lifecycle beyond that single test was observed. **P5-05 offline suite is done; the external Sandbox
   lifecycle is DEFERRED** (needs authorised external calls). **B36** is still required before fresh-DB/rebuild
   evidence. **B40** belongs to P5-07/P5-08.

**P5-02 result to carry forward (webhook HMAC — read before P5-03+):**
1. Signature construction is now pinned by tests: Intention = **20** values, Accept = **23** values, in the
   implementation’s exact order, `?? ''`, joined without separators, HMAC-SHA512 hex. A P5-01 note said
   “Accept 22” — corrected to 23 in this document; the tests follow the code, not the old note.
2. `verifyWebhook` must stay fail-closed: invalid/empty/truncated/non-string signatures return `false` and never
   throw. **B41** (null-signature TypeError) is fixed; do not remove the normalization.
3. Invalid signature must produce **HTTP 401** and no repository read/payment event/audit success — covered by
   `webhook-signature-handling.spec.ts` + `payment-webhook-controller.spec.ts`.
4. Do not weaken the fixtures into real credentials; keep the fake unit-test secret.
5. **B5 is only partially resolved:** timing-safe comparison remains unimplemented (tests-only decision), and
   upload/CORS/brute-force/rate-limit negatives are still open.
6. Still unverified externally: Paymob Sandbox delivery and field order (**B7/P5-04**), fresh-DB (**B36**).
   **B38/B39/B40** are untouched (P5-03/P5-07/P5-08).

**P5-01 result to carry forward (payment lifecycle — read before P5-02+):**
1. The authoritative map/matrix is **§5N** (12 flows, 45 scenarios). Use it to decide whether a scenario is
   `EXISTS`, `EXTEND`, `MISSING` or `BLOCKED`; do not re-infer states from memory.
2. **B38 (High):** gateway charge happens before the local row and Paymob `special_reference` includes
   `Date.now()`; concurrent same-key requests can double-charge. Owned by **P5-03/P5-08** — do not “fix” it
   inside P5-02.
3. **B39 (Medium):** webhook replay is marked in Redis before processing; a processing failure blocks retries
   for 24 h. Owned by **P5-03**.
4. **B40 (Medium):** single-payment partial refunds close the payment (`refunded`) and there is no refunded
   amount/partial state; multi-partial exists only for recurring allocations. Owned by **P5-07/P5-08**;
   a schema change may be required (do not implement without authorization).
5. **B5 / P5-02:** no `PaymobGateway.verifyWebhook` tests exist and every integration test mocks it true; the
   comparator is `===`. P5-02 is unit-level (both payload shapes, invalid/missing secret, 401 with no state).
6. **B7/P5-04:** P5-04 is now recorded on **limited, user-confirmed** evidence (§5Q) — Test-mode dashboard,
   Test-labelled Public/Secret keys, successful Hostinger test — but **no Sandbox call was made by the
   assistant**, credential scope/HMAC remain unverified, and the **external P5-05 lifecycle is DEFERRED**.
7. **B36** remains a hard prerequisite: do not treat fresh-DB/rebuilt-environment payment verification as
   evidence until baseline convergence is fixed (authorized task + Phase 9).

**P4-10 result to carry forward (evidence package — read before Phase 5):**
1. The authoritative Phase 4 evidence is **§5M** (10-row summary + 36-row matrix). Do not re-derive counts from
   memory; the per-task records are §5D–§5L and §17D–§17K.
2. **B36 (Critical) is a release blocker for fresh deploys/DR:** baseline regeneration + entrypoint/CI
   convergence fix are required before any rebuild/deploy verification (authorized task + Phase 9).
3. **B37 (High) is a release blocker for three endpoints:** org payment settings, mobile push, resource
   maintenance; code-only fixes with schema-backed tests, plus removal/alignment of the dead HR/`activities`
   code. Do not “fix” by adding migration columns — the correct columns already exist.
4. **Do not claim release readiness from Phase 4 completion.** Phase 4 acceptance covers audit/documentation;
   external/Sandbox evidence, container suites, fresh-DB convergence and production schema remain unverified.
5. Reconciliation decisions are **D-1** (P4-03 count corrected to 336/336; the 333 figure was a doc typo, with
   the uncertainty disclosed) and **D-2** (backfilled P4-04/P4-05 audit rows). Keep §5M aligned if later
   corrections are made.

**P4-09 result to carry forward (schema — read before any deploy or rebuild):**
1. **B36 (Critical):** the baseline is stale (missing `payment_allocations` + 45 columns) and
   `docker-entrypoint.sh` stamps the migration chain as applied on a fresh DB. Do **not** treat a fresh
   baseline-only import as equivalent to the migrated DB until the baseline is regenerated from the full chain
   (authorized task) and the entrypoint/CI convergence check is fixed. The current running DB is migrated.
2. **B37 (High):** `org-portal.controller.ts` payment settings (GET/PUT), `mobile.controller.ts` push
   register/list and `resource.repository.ts` maintenance CRUD reference columns that do not exist; dead code in
   `hr.repository.ts` (departments) and the `activities` command. Fix code-only, with schema-backed tests.
3. **No invented reachable tables** and **no runtime DDL**; all table/column references otherwise resolve to
   baseline ∪ migrations ∪ live. Do not add a migration to "solve" B37 — the correct columns already exist.
4. **Do not clean up** the B35 legacy mapping rows without an authorized seed/migration change; they are
   seed/migration-backed (113/117 + seed 005) and ignored by the engine.
5. **Evidence limit:** migration `migration_history` hashes do not prove the DB matches the repo (179/210 drift,
   201/211 edited after apply, `103b_coa_cleanup.sql` missing). Only a controlled rebuild in Phase 9 can close
   that gap.
6. Reusable read-only audit artefacts: baseline↔live diff (0 missing baseline objects; 45 extra live columns),
   `migration_history` comparison (211 rows), static table-reference scan (735 files, 349 refs).

**P4-08 result to carry forward (coverage — do not regress):**
1. The gap matrix is **§5K** (34 rules). Only 23 of those rules were unprotected; 5 gaps were closed with
   tests, 3 are routed to later phases (B5→P5-02, B8→P7-02, B28→P7-02/P7-09), 4 are documented limitations.
2. Period handling is now covered: an org's own closed period must reject posting (never fall back to an open
   platform period), platform postings never read org periods, and a missing period is a hard error
   (`gl-period-lock.spec.ts`).
3. Booking refund arithmetic boundaries are pinned (over-refund clamp, zero, proration rounding, capacity
   exhaustion, recovered > settled) in `booking-refund-boundaries.spec.ts`.
4. B35-1/B35-2/B35-3 are **characterized, not fixed**: occurrence identity, recovery projection vs posting
   result, handler failure without replay. Do not "fix" one without the others — they are the same design
   decision (occurrence-level identity + durable posting retry, both schema/bus changes).
5. Keep the suites green: `gl-period-lock` (9), `booking-refund-boundaries` (9),
   `accounting-posting-idempotency` (9), `booking-settlement-unification` (9).

**P4-07 result to carry forward (accounting invariants — do not regress):**
1. `postAccountingEvent` returns **`boolean`** (`true` = this call wrote the journal; `false` = `hasPosting`
   skip or `ER_DUP_ENTRY`). Never revert it to `void`.
2. Booking-refund recovery counters (`coach_recovered_amount`, `org_recovered_amount`) must only advance when
   the recovery posting returned `true` — a counter without a journal entry is the B34 defect.
3. Posting identity is `(source_type, source_id, event_type)`; the durable guard is
   `ledger_entries.uk_dedup` UNIQUE over `(source_type, source_id, event_type, chart_account_id, side)`.
   `hasPosting` is only a pre-check outside the transaction — do not present it as concurrency proof.
4. Refunds/reversals must stay exact chart-account inversions of the payment (same accounts, opposite sides);
   settled refunds pay **1120**, never **1100**; gateway settlement is Dr 1120 + 5210 / Cr 1100; settlement
   payout is Dr 2202 / Cr 1120; `settlement_paid_reversal` intentionally targets the legacy 2200.
5. Keep the new suites green: `accounting-ledger-invariants.spec.ts` (25),
   `accounting-posting-idempotency.spec.ts` (6), `accounting-mapping-integrity.integration.spec.ts` (31,
   read-only against 127.0.0.1:3307).
6. **B35 residuals:** no occurrence ordinal in the posting identity (multi-partial single-booking refunds /
   repeated offset collections would drop a journal); `booking-settlement` offset counter updates ignore the
   boolean; accounting handlers log failures instead of re-driving them; legacy stale mapping rows
   (`org_payable` 2200 / `receivable_from_org` 1160) still present; period-lock not re-tested.

**Next command set (P5-04 recorded DONE-limited in §5Q; P5-05 external lifecycle DEFERRED — do not execute
provider calls without explicit authorisation):**

```bash
cd backend
# re-validate the retained payment/gateway evidence locally (no provider/DB writes)
npx vitest run src/modules/payment src/shared/services/gateway
npx tsc -p tsconfig.json --noEmit
```

P5-04 was a **configuration/approval confirmation** and, per the user's decision, is recorded on limited
user-confirmed evidence (§5Q). P5-05's offline lifecycle suite is complete; its **external** lifecycle
(real charge/3DS/webhook/refund) remains **DEFERRED** and must not be executed without explicit authorisation.
Do not claim P5-06…P5-10 until P5-05 is either externally executed or the limitation is explicitly accepted.

**P4-06 result to carry forward (event boundaries — do not regress):**
1. After-commit hooks are **ALS-scoped per transaction** (`database.transaction.ts`); never reintroduce a
   module-global hook array — it lets one commit publish another transaction's events (phantom events).
2. Outside a transaction `onAfterCommit` runs immediately; do not buffer events into a queue nobody flushes.
3. Event publication is durable only through `published_events` on the caller's transaction connection; the
   outbox poller (5 s) is the recovery path. Do not emit before the domain write commits.
4. Delivery is **at-least-once**: subscriber dedupe relies on `processed_events(event_id, subscriber_id)`;
   handlers must remain idempotent (no exactly-once claim).
5. **B33 residuals:** 255/366 emits unawaited, no durable event DLQ, cursor-init startup race, no socket replay
   on reconnect (refetch reconcile only).

**P4-05 result to carry forward (notification reliability — do not regress):**
1. Provider `success:false` **must throw** — never treat it as delivered.
2. DLQ is written only on terminal failure (`attempts >= max_retries`), after `attempts` is incremented on
   `failed`. Do not restore the old success-path DLQ block.
3. Dead-letter replay must **enqueue** `process_notification` and restore the DLQ row if enqueue fails; the
   claim is the guarded `DELETE` (`affectedRows`).
4. Keep `findDeliveredDelivery` duplicate suppression; a fully atomic guard needs a unique key (B32).
5. Digest payload must stay `{userId, categorySlug, eventName, windowId, count}` (worker contract).
6. **B32 residuals:** digest duplication (no window claim), unregistered `retry_failed_deliveries`, failover
   chain is channel expansion (not a failure cascade), concurrent duplicate sends.
7. **B8:** 3 pre-existing date-expired subscription/membership fixtures still fail — do not "fix" by weakening
   assertions; replace dates in P7-02.

**P4-04 result to carry forward (marketplace inventory — do not regress):**
1. Stock is decremented with the conditional `UPDATE … WHERE quantity >= ?`; never replace it with a
   read-then-write. Real concurrency evidence: `marketplace-stock-concurrency.integration.spec.ts`.
2. A failed checkout restores stock **once** and cancels the orders (`_cancelOrdersAfterFailedCheckout`);
   never restore stock in an inner try/catch branch plus the outer catch.
3. On a part-way decrement failure restore only `decrementedItems` (reverse) — never the whole order.
4. `_restoreOrderStock` skips `cancelled`/`refunded` (and paid) orders; `handlePaymentFailed` ignores
   terminal orders. Keep both guards (duplicate events are delivered).
5. **B26 closed:** seller must have `exists && effectiveStatus === 'active'`; do not weaken.
6. **B31 residuals:** order creation + stock decrement are not one transaction; concurrent cancels/cleanup
   workers can double-restore; `reserved_quantity` is unused.

**P4-03 result to carry forward (booking concurrency — do not regress):**
1. Lock owners are **per-acquisition UUID tokens** via `createLockOwner()`; never reintroduce
   `user:<id>` / `tournament:<user>:<match>` / `scheduling:<user>:<ts>` tokens (a stale release would
   delete a newer lock). Guards: `lock-owner-wiring.spec.ts`.
2. The Redis lock is only an optimisation. The authoritative guard is
   `SELECT id FROM resources … FOR UPDATE` + overlap count inside the booking transaction; the status-blind
   unique slot keys are intentionally absent (migration 140) — do not re-add them.
3. Lock TTLs: 15 s create / 10 min prepare; no renewal. Do not shorten the prepare TTL without re-checking
   the confirm path; the confirm transaction re-validates availability.
4. Real concurrency evidence must stay green:
   `booking.concurrency.service.integration.spec.ts` + `booking.concurrency.integration.spec.ts`
   (`npx vitest run --config vitest.integration.config.ts …`, persistent DB + Redis). Unit tests alone are
   not accepted as concurrency proof.
5. **B30 residuals:** prepare pre-check outside a transaction, no renewal, recurring multi-resource deadlock
   window (fails safe, retryable).

**P4-02 result to carry forward (security fixes — do not regress):**
1. `MarketplaceService.getOrderForUser` fallback is **buyer-only**; never re-open an unfiltered order read
   (IDOR; coaches, org/shop admins and platform finance/audit roles hold `marketplace.order.view`). Test: `order-access-isolation.spec.ts`.
2. `AuthService.logout` resolves the owner from the refresh session before `revokeAllForUser`; `/auth/logout`
   is a public route and never carries `request.userId`. Test: `logout-all-devices.spec.ts`.
3. Finance/accounting page gates now use the **canonical route keys** (`financial.view`, `reports.view`,
   `sidebar.accounting`) — do not reintroduce `sidebar.finance-*` / `accounting.dashboard` as page gates
   without re-running the grant audit.
4. **B24 residual is nav-only** (master-admin has no `sidebar.*` keys; finance-manager accounting nav hidden;
   ops/org-admin/accountant settlement menu links absent). No data exposure.
5. Authoritative grants for the audit came from a **read-only** query against Docker `courtzon_v3`
   (`§5E.4`); re-use that path, never infer grants from `role-permission-templates.mjs`.
6. **B28**: `src/tests/proxy-contract.spec.ts` fails on frontend **test fixtures** (`/demo`, `/protected`,
   `/broken`) — pre-existing, do not “fix” by weakening the proxy guard.

**P4-01 result to carry forward:** the inventory is **§5D** — 45 rules / 8 areas, **308** unit spec files /
**3,740** unit tests / **163** integration specs, per-rule source→test→gap mapping, B24 route/page/nav table,
and a ranked gap list. Remaining gaps: **B5** webhook HMAC negative path (mocked today), **B26**
seller-subscription checkout rejection, upload/CORS negatives, brute-force (0 tests), **B27** notification
failover/DLQ (0 refs). Do **not** treat these as tested.

**P3-10 result to carry forward:** the access-path matrix is **§5C** (22 rows). It found a real regression:
the card-payment fallback poller was dead in the subscription modal and both registration pages after the
P3-06 purity fix; it is fixed with `pollingPaymentId` state and covered by a behavioural test plus a
source guard. **Do not** gate payment pollers on `paymentInfo?.paymentId` — `paymentInfo` is cleared before
polling. Payment verification is **mocked-component only**; a real Paymob Sandbox completion belongs to Phase 5
(P5-04 recorded DONE-limited in §5Q; P5-05 external lifecycle **DEFERRED**).

**Phase 3 invariants to preserve:** permission gate **after every hook** + `enabled: canView && …` on every
query; `rules-of-hooks` 0; `refs`/`static-components` 0; lint baseline unchanged (`npm run lint:baseline`
only as a reviewed policy change); regression map in §5B, access matrix in §5C.

**P3-08 result to carry forward:** both trees are already `strict` (TS 6 default on the frontend,
explicit on the backend) with **0** baseline errors. Do **not** describe the frontend as non-strict.
The staged plan is F0/B0 prerequisites → F1/B1 small flags → B2 unused → F3/B3 `exactOptionalPropertyTypes`
→ F4/B4 `noUncheckedIndexedAccess` → defer F5/B5 `noPropertyAccessFromIndexSignature`. Fix **B19**
(frontend `tsc --noEmit` is a no-op; use `tsc -b`) and **B20** (pin `strict`) before enabling anything.
Re-verified after the power interruption: every recorded count reproduced exactly; the only additions are
**B21** (3,163 explicit `any` — 2,594 source / 569 tests — plus no type-aware ESLint, so strictness stages
are necessary but not sufficient) and **B22** (`@dnd-kit` `.d.ts` blocks `skipLibCheck: false` on the
frontend only; backend is already clean at 0).

**Audit baselines (unchanged):** frontend prod **0** / full **10**; backend prod **6** / full **20**.
Do not “fix” B13/B14 inside Phase 4 without a scoped, authorized task.

**Working-tree note:** all changes remain uncommitted (no commit/push authorized). Do not reset or
discard the working tree; release docs under `docs/release/` are untracked but authoritative. Docker
images were **not** rebuilt — running containers still serve the pre-upgrade frontend/backend build
until Phase 9 (or an authorized rebuild).

**Read before continuing:** AGENTS.md, COURTZON_RELEASE_READINESS_PLAN.md, this file,
DEPENDENCY_COMPATIBILITY_MATRIX.md (§10–§12), INTEGRATION_SAFETY_ASSESSMENT.md.

---

## 19. B36-B2-2 execution record (2026-10-29)

**Readiness unchanged: overall 54/100. B36 remains OPEN** — fresh-Compose/DR is still
blocked because `backend/docker-entrypoint.sh` replays all 210 migrations over a
baseline-hydrated database. This section records work done; it does not close B36.

### 19.1 Static audit (B36-B2-2-1A, read-only)

- **The 210-file chain is not self-contained.** It needs 38 base tables that no current
  migration creates (e.g. `payment_transactions`, `bookings`, `users`). 37 exist in
  `archive/database/schema/`; only **`migrations`** is created by no source at all, yet
  `017_notification_types.sql:5-6` reads/writes it.
- The archive chain is not directly runnable against `courtzon_v3`: 91 `USE courtzon_v2;`
  statements + 1 `CREATE DATABASE`.
- Confirmed MariaDB-only syntax on MySQL 8.0: `004_performance_indexes.sql:5`
  (`ADD INDEX IF NOT EXISTS`) and `016_monitoring_alerts.sql:53-55`
  (`ADD COLUMN/INDEX IF NOT EXISTS`).
- Replay traps: `061_academy_training.sql:9` (unconditional `RENAME TABLE`) and
  `140_booking_history_preservation.sql:45-50` (unguarded `DROP INDEX`).
- `073_mobile_platform.sql:37` `CREATE TABLE IF NOT EXISTS app_settings` is a silent
  no-op on any DB that already has the site-config `app_settings` (archive 070).
- Confirmed baseline gaps: `payment_allocations` (178) and indexes
  `idx_pt_status_created` (005:14), `idx_status_enddate` (038:8), `idx_ps_pp` (083:57).
  `idx_notifications_event` was already present (baseline:3429). The earlier
  “45 missing columns” note was **not** re-verified by a full column diff in P1; treat it
  as unverified, not fixed.
- Seed conflict: 004 and 005 both insert global codes 1100/2100/2200/4100 with different
  meanings; 006 duplicates `account_template_lines` on re-run (no unique key).

### 19.2 P1 (implemented, uncommitted)

- `database/baseline/001_courtzon_v3.sql`: appended `payment_allocations` using the exact
  178 definition (16 columns, 4 indexes, 3 FKs) and added the three missing indexes
  inline. Table count 328 → 329.
- P1-R1: removed `DROP TABLE IF EXISTS payment_allocations;`; the
  `CREATE TABLE IF NOT EXISTS` definition is unchanged.
- `backend/src/infrastructure/migrations/__tests__/migration-baseline-integrity.spec.ts`:
  added static assertions for `payment_allocations`, its 4 index names, its 3 FKs, and
  the four required convergence index names.
- P1 review: accepted **statically**; runtime import and FK validation were **not** run.

### 19.3 P2 (design only — not implemented)

Proposed, awaiting approval:

1. A generated baseline manifest (`database/baseline/001_courtzon_v3.manifest.json`) with
   `represented_migrations`, `required_tables`, `required_indexes`,
   `required_foreign_keys`, `baseline_sha256`, `migration_head`.
2. A `--bootstrap` state machine inside `scripts/migrate.sh` under the existing advisory
   lock: EMPTY → hydrate; baseline-like (T>0, no history) → verify objects then stamp;
   existing history → stamp only explicitly represented files, apply genuinely new ones;
   ambiguous/partial → fail closed. **Never stamp without object verification.**
3. `backend/docker-entrypoint.sh` delegates to one locked runner call; remove its
   duplicated `migration_history` DDL and direct stamps. `--fresh` stamps after the
   baseline instead of replaying.
4. Static tests for manifest↔baseline consistency and entrypoint delegation; runtime plan
   on isolated MySQL 8.0 (empty, pre-imported, partial, existing, failed, concurrent).

Open decisions: manifest depth (required objects vs full schema signature), keep vs remove
the MySQL init, seed set (P5), legacy-DB adoption policy, `--fresh` semantics, and the
missing `migrations` table.

### 19.4 Still blocked / next

1. **P2 implementation** (fresh path) — requires explicit approval.
2. **Runtime verification** on an isolated MySQL 8.0 (P1 import/FKs + P2 state matrix);
   nothing has been executed.
3. P3 (`app_settings` documentation/no-op), P4 (canonical history/idempotent stamps),
   P5 (seed strategy), P6 (CI/docs).
4. CI still uses `--fresh --seed` (`migration-validation.yml:42`,
   `restore-validation.yml:39`); `backend/package.json:11` `db:fresh` lacks the
   destructive-confirmation flag.

**Working tree:** the P1 changes are uncommitted:
`database/baseline/001_courtzon_v3.sql` and
`backend/src/infrastructure/migrations/__tests__/migration-baseline-integrity.spec.ts`.
No commit, push, Docker build, test, or database operation was performed. Do not reset or
discard the working tree.

---

## 20. Database TLS policy, seed integration, and backend deployment (P8.7.4 → P8.7.14.4)

**Date:** 2026-10-30 · **Status:** DEPLOYED LOCALLY, UNCOMMITTED, NOT ON HOSTINGER

### 20.1 Shipped and running

| Phase | Outcome |
|---|---|
| P8.7.4 | Migration checksum provenance verifier in `scripts/migrate.sh` (classify by `hash_kind`, 12/64 hex, case-insensitive, orphan/missing detection). Tests: shell harness + Vitest. |
| P8.7.7 / P8.7.7-D | Root cause of the TLS startup failure proven: the canonical runner's `mysql` client had **no TLS flags**; both MariaDB 11.4.12 and 11.4.13 fail identically without `--skip-ssl`. Client version is **not** implicated. |
| P8.7.8 / P8.7.8.1 | Unified DB TLS policy (`DB_TLS_MODE` = disable/require/verify-ca, `DB_TLS_CA_PATH`) in `backend/scripts/db-tls.sh` (POSIX) + `backend/scripts/db-tls.js` (mysql2), consumed by entrypoint, `migrate.sh`, `migrate.js`, `mysql.ts`, `sync-role-permissions.mjs`. Explicit `local` / `non-local` / `unknown` classification; unknown fails closed; trim-only normalisation. |
| P8.7.10 | `scripts/seed.sh` wired to the same policy (seed engine previously always failed with `ERROR 2026`). |
| P8.7.11 | Backend image built: `sha256:02b2184fee94…8dc1e4` (`courtzon-backend:latest`). |
| P8.7.13 | Backend container recreated on the new image: `a2159a2c…`, healthy, 0 restarts. |

**Deployment evidence:** `Database TLS policy: disable (plaintext)` ×3 · `330 tables — skipping baseline re-import` ·
`No new migrations to apply` · `Checksum verification: 212 checked, CONTENT_DRIFT=0, LEGACY_FORMAT_MISMATCH=0,
UNVERIFIABLE_LEGACY_HASH=22, ORPHAN_HISTORY_ROW=1, MISSING_HISTORY_ROW=0` · role sync `granted=0, pruned=0` ·
translations `up-to-date (hash match)` · 52 `tournament:*` templates refreshed (existing startup behaviour) ·
`/health`, `/health/live`, `/health/ready` = 200.

**Rollback assets (intact):** `courtzon-backend:rollback-p876` → `4ebd04ed7970…`; `courtzon-backend:failed-p876` → `9afdbc1998ba…`.

### 20.2 Open defect (blocking P8.7.14 Phase 1)

> **Update 2026-10-31 -- RESOLVED for the deployed line.** Implemented in P8.7.14.5 (`LEFT JOIN` in `findById()` +
> worker success/failure counters), image built in P8.7.14.7, deployed in P8.7.14.10, functionally verified in
> P8.7.14.11/12. Full record: [`P8.7.14_RELEASE_RECORD.md`](./P8.7.14_RELEASE_RECORD.md); status register:
> [`OUTSTANDING_ISSUES.md`](./OUTSTANDING_ISSUES.md). The text below is the **historical pre-fix measurement**.


`bookingRepository.findById()` (`booking.repository.ts:124-125`) INNER JOINs `resources`/`branches`, so an existing
booking whose `branch_id IS NULL` or whose `resource_id` has no `resources` row resolves to `null` →
`NotFoundError` → level 50, twice, every 5 minutes.

Measured (P8.7.14.4, SELECT-only): **25 bookings total**, **6 orphans** (5 confirmed + 1 cancelled tournament);
**100 % of `academy` bookings are orphaned, 0 % of `private_match`**; the 3 past-due candidates (`41458`, `41459`,
`41460`, all unpaid) recur every 5 min → the 18 level-50 lines = 3 bookings × 2 lines × 3 runs; **2 more**
(`58348`, `58928`) become candidates today → set grows to 5. **Zero** paid bookings affected, **zero** new
settlement eligibility, no accounting impact (`booking:completed` is not an accounting event).

**Historical: designed at that point, NOT implemented then** (implemented 2026-10-30 in P8.7.14.5; deployed in
P8.7.14.10): `LEFT JOIN` in `findById` only (matches existing `findAll`
precedent at lines 692-698) + success/failure counters in `booking-auto-complete.worker.ts:39-49`.
Do **not** fix by excluding the rows. Follow-ups: missing `FK bookings.resource_id`, `branch_id` backfill,
why 100 % of academy bookings reference removed courts, and list/detail consistency in
`findByUser`/`findByOrganisation`/`findBySeries`/`findPublicMatches`.

### 20.3 State to preserve

- Working tree: **223** dirty/untracked entries (as measured on 2026-10-30; **216** pre-existing entries as of
  2026-10-31, plus the six release documents added in section 21 = **222**), **nothing committed or pushed** at that
  time. Do not reset, stash, or clean. (Historical snapshot; superseded by section 21.7: HEAD `7b9ca362`, 213 entries.)
- Hostinger/Coolify runs the **old** backend image. Before deploying there: set
  `COURTZON_MIGRATION_ENV=production` **and** an explicit `DB_TLS_MODE` (`require` minimum; `verify-ca` blocked
  until the MySQL server certificate carries `SAN=DNS:mysql`), and reconcile that database's own migration history.
- Phase 1 smoke test was **stopped** on the level-50 condition; Phases 2-8 remain unexecuted.

---

## 21. P8.7.14.5 -> P8.7.14.13 - booking reachability fix: implementation, deployment, verification, documentation (2026-10-31)

**Status:** IMPLEMENTED + DEPLOYED LOCALLY + VERIFIED + DOCUMENTED -- **COMMITTED LOCALLY (two unpushed commits), NOT PUSHED, NOT ON HOSTINGER**
**Plan mapping:** Phase 9 items P9-02/P9-03 executed under explicit user authorization; **P9-01 gate NOT satisfied**,
Phase 9 acceptance remains **NOT MET**. No checklist item changed status, so the percentages in section 1 stand.

**Full record:** [`P8.7.14_RELEASE_RECORD.md`](./P8.7.14_RELEASE_RECORD.md)
**Registers:** [`OUTSTANDING_ISSUES.md`](./OUTSTANDING_ISSUES.md) - [`TECHNICAL_DEBT.md`](./TECHNICAL_DEBT.md) -
[`ROADMAP.md`](./ROADMAP.md) - [`DEPLOYMENT_GOVERNANCE.md`](./DEPLOYMENT_GOVERNANCE.md)
**Index:** [`README.md`](./README.md)

### 21.1 Sub-item outcomes

| Item | Outcome |
|---|---|
| P8.7.14.4 | Read-only root-cause measurement (recorded in section 20.2) |
| P8.7.14.5 | `LEFT JOIN` fix in `findById()` + worker counters; 3 modified + 2 new test files (**committed in `75f3c16d`**) |
| P8.7.14.6 | Deployment readiness assessment -- **READY WITH CONDITIONS**; integration path **BLOCKED** |
| P8.7.14.7 | Backend image built `sha256:5ae6bc9157131bdabe495ee3845a067f4c36fe37ae1fcb1abd8201a1377494aa`; container untouched |
| P8.7.14.8 | Rollback readiness assessment -- **READY WITH CONDITIONS**; previous image unaddressable |
| P8.7.14.9 | Not issued |
| P8.7.14.10 | Backend-only deployment; container `aeb9e434fb61af9daa3432bf3f5fbc99e7b52defdd42c63861ff7e2f4646cfdf`, healthy, 0 restarts |
| P8.7.14.11 | Post-deployment read-only functional assessment (repository, worker, payment listener, notifications, socket, accounting) |
| P8.7.14.12 | Isolated unit tests: focused **31/31**; backend **4,463/4,475** (12 unrelated failures); frontend **1,414/1,414**; TypeScript clean |
| P8.7.14.13 | This documentation set: release record + issues/debt registers + roadmap + deployment governance + index (six new files) |

### 21.2 Functional proof

- Worker first post-deploy run: `{"completed":5,"failed":0,"candidates":5}`; **0** `Booking not found` errors after deploy
  (the old image produced 4-6 per run).
- Five orphan bookings (`41458`, `41459`, `41460`, `58348`, `58928`) transitioned `confirmed -> completed`.
- Accounting unchanged: 0 `ledger_entries` and 0 `financial_journal_entries` created since deploy; the five bookings have
  `payment_status = pending` and 0 entitlements, so settlement eligibility is `NOT_ELIGIBLE`.
- `/health`, `/health/live`, `/health/ready`, `/health/database`, `/health/redis`, `/health/storage`, `/health/socket`,
  `/health/version` -- all HTTP 200.
- Migration history unchanged: 215 rows, max `205_tournaments_max_events_check.sql`, max `applied_at` unchanged.
- Permissions unchanged: `permissions` 965, `role_permissions` 13,043.

### 21.3 Warnings recorded

| ID | Summary | Register |
|---|---|---|
| W1 | 10 level-50 notification FK failures for 5 orphan-user bookings (non-fatal; no rows created) | [OI-01](./OUTSTANDING_ISSUES.md) |
| W2 | 52 existing `tournament:*` templates refreshed at `22:35:53Z`; count stayed 337 (UPDATE, not INSERT) | [OI-02](./OUTSTANDING_ISSUES.md) |
| W3 | Startup validator logs level-40 `Non-critical tables missing: courts, payments` on every boot | [OI-07](./OUTSTANDING_ISSUES.md) |

### 21.4 Rollback position (unchanged, with limitations)

- `courtzon-backend:rollback-p876` -> `sha256:4ebd04ed797049888e2eb50dee91486b8efb248fa00383e906a9200c02ecb95f`
  (2026-10-25; lacks `db-tls.sh`/`db-tls.js`, `scripts/migrate.sh`, and the confirmation-gated permission sync).
- The previously running image `sha256:02b2184fee94...` is **no longer addressable**; no like-for-like revert exists.
- Rollback mechanics and retention rules: [`DEPLOYMENT_GOVERNANCE.md`](./DEPLOYMENT_GOVERNANCE.md); issue
  [OI-05](./OUTSTANDING_ISSUES.md).

### 21.5 State to preserve (do not reset/stash/clean)

- **Historical snapshot (2026-10-31, before the release commits):** `HEAD = 184aa6e0b96c93b278f909d63eb7f4a88d28b424`;
  working tree **222** entries = **216 pre-existing** (including the five then-uncommitted P8.7.14.5 files and
  pre-existing modifications to `backend/docker-entrypoint.sh` / `scripts/migrate.sh`) plus the **6** release documents
  added by P8.7.14.13. Nothing was deleted or reset.
- **Current state (after P8.7.14.20):** `HEAD = 7b9ca362696269edc43a9ddfc64072cc54645904`; two **local, unpushed**
  commits -- `75f3c16d` (booking fix, P8.7.14.5) and `7b9ca362` (baseline release documentation, P8.7.14.19/20).
  Working tree **213 entries** (the seven B2 release documents are still untracked); index empty. See section 21.7.
- Local backend container: `aeb9e434fb61af9daa3432bf3f5fbc99e7b52defdd42c63861ff7e2f4646cfdf` on the image above.
- Nothing pushed; Hostinger/Coolify still runs the old backend image.

### 21.6 Explicit non-actions (P8.7.14.5 -- P8.7.14.13 only)

During that span: no migrations, seeds, or manual SQL writes; no Git writes; no image retag/prune/rmi; no container
recreation outside the authorized backend recreate; no integration/E2E suite execution; no automatic rollback.
(Later, separately authorized commits are recorded in section 21.7.)

### 21.7 Current Git state (2026-10-31, after P8.7.14.20)

| Field | Value |
|---|---|
| Branch | `master` |
| HEAD | `7b9ca362696269edc43a9ddfc64072cc54645904` |
| History | `7b9ca362` (baseline docs) -> `75f3c16d` (booking fix) -> `184aa6e0` |
| Push state | Both commits are **local and unpushed**; `origin/master` remains `806177477cb687d90b37fe04c4184cbaeaf1d0a1` |
| Index | empty |
| Working tree | **213** entries = seven B2 release documents (untracked) + **206** other pre-existing changes |
| Deployed image | `sha256:5ae6bc9157131bdabe495ee3845a067f4c36fe37ae1fcb1abd8201a1377494aa` -- built from a **dirty build context** (numerous unrelated uncommitted changes at build time), therefore **not reproducible from the two commits alone** |
| Deployment target | **Local Docker only**; no production/Hostinger deployment exists |

### 21.8 Historical integration evidence scope (do not misread)

The `40/40` Stage A integration result recorded in section 13 (2026-10-26) remains valid **only** for that selected,
test-owned set. It is a historical record, **not** blanket authorization to run integration tests: Amendment A1 and the
unresolved OI-09 decision still govern any future integration/E2E execution.


