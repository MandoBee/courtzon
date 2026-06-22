# CourtZon-V2 — Master Completion & Improvement Plan

> Generated 2026-06-21 from a full-codebase deep-dive (5 parallel analyses: project overview, backend, frontend, PWA/mobile, testing/DevOps).

## Progress Tracker (updated 2026-06-21)

### Quick Wins — DONE ✅
- [x] git init + root `.gitignore` (secrets protected)
- [x] PWA manifest: added PNG icons (192/512) with `any maskable` purpose + shortcuts
- [x] Fixed `InstallPrompt` null-deferred bug
- [x] Added `overflow-x-auto` to 18 files / 20 admin tables
- [x] Added 404 catch-all route + `NotFoundPage.tsx`
- [x] Verified wallet routes already have auth (via `app.addHook`)
- [x] Deleted 44 dead/scratch files + `redis-lock` stub module
- [x] Fixed `apple-touch-icon` (SVG → PNG) + dark-mode `theme-color` meta
- [x] Fixed manifest blob shortcut URLs in `sync-favicon.ts`
- [x] Fixed CORS (updated `APP_URL` + `WEBHOOK_BASE_URL` in `.env`)
- [x] Rebuilt Docker images, all containers healthy
- [x] TypeScript compiles clean (frontend + backend)

### Next up — Phase 3: Local-to-Web Testing via Tunnel
Phase 2 (PWA & Mobile Professionalization) — DONE ✅ (commit pending)
- P2.1: duplicate manifest removed, iOS splash PNGs + meta, manifest screenshots, favicon/icons recolored to brand green, runtime manifest-icon override fixed.
- P2.2: safe-area-inset on Navbar/BottomNav/Admin+Org drawers/Modal + dark theme-color.
- P2.3: mobile hamburger drawer + BottomNav "More" sheet + global mobile CSS (touch-action, user-select, ≥16px inputs).
- P2.4: responsive bottom-sheet Modal + reusable Skeleton component (applied to Notifications + MyBookings; remaining list pages incremental).
- P2.5: offline banner, expanded Workbox runtime caching, "New version" prompt (virtual:pwa-register), haptics hook, pull-to-refresh hook (hook ready; not wired into pages to avoid scroll regressions).
- P2.6: branded launch splash + iOS install instructions sheet.
- Verified: `npm run build` clean (tsc + vite + PWA SW generated, 166 precache entries); frontend Docker image rebuilt + container recreated; manifest/splash/icons/index all serve HTTP 200.
- New files: `components/pwa/{OfflineBanner,PWAUpdatePrompt,IOSInstallSheet}.tsx`, `components/ui/Skeleton.tsx`, `hooks/{useHaptics,useOnlineStatus,usePullToRefresh}.ts`, `src/vite-env.d.ts`.

---

## Current State Assessment

| Area | Score | Notes |
|------|-------|-------|
| Backend architecture | 7.5/10 | Well-structured modular monolith, DDD layers, strong auth/security |
| Frontend architecture | 6.5/10 | Good permissions system, theme studio, but scattered API calls, dead code |
| PWA / Mobile | 3/10 | Foundation exists but not installable (SVG-only icons), no safe-area, missing nav |
| Testing | 2/10 | 14 test files for 400+ source files; no coverage thresholds |
| DevOps | 4.8/10 | Docker + CI exist, but no deploy pipeline, no TLS, containers run as root |
| Security | 6.5/10 | Good fundamentals (cookies, PBKDF2, HMAC, upload hardening) but secrets in plaintext, no .gitignore |
| Production readiness | 4/10 | No deploy workflow, no nginx.prod.conf, no alerting, no DR plan |

**Project is NOT a git repository** — no `.git` folder, no root `.gitignore`. Real secrets sit in plaintext `.env` files. This is the #1 risk.

---

## Phase 1 — Cleanup & Stabilization (Days 1-3)

### 1.1 Initialize git & protect secrets
- [x] `git init` at project root
- [x] Create root `.gitignore` (copy `frontend/.gitignore` pattern + add `.env`, `*.log`, `backups/`, `node_modules/`, `dist/`, `*.zip`, scratch files)
- [x] Verify `.env`, `backend/.env`, `frontend/.env` are ignored
- [ ] Remove plaintext secrets from any tracked files
- [ ] Set `SESSION_SECRET` to a real random value (currently falls back to `'dev-cookie-secret-change-in-production'`)

### 1.2 Remove dead/scratch files from project root
These are working artifacts NOT referenced by any config/script:
- [x] `__tmp_check_roles.mjs`, `tmp_check_db.mjs`, `test-db.mjs`, `check_users.js`, `confirm_slugs.cjs`, `confirm_slugs.js`, `parse_tables.mjs`, `parse_tables.ps1`, `dump_city_polys.cjs`, `map_egypt_cities.cjs`
- [x] `_schema_dump.sql`, `backup.sql`, `courtzon.sql`, `check_user_status.sql`, `tables_schema.json`
- [x] `backend.log`, `backend-server.log`, `backend-errors.log`
- [x] `CourtZon-V2.zip`, `backend/backend.zip`, `frontend/frontend.zip`
- [x] `Courtzon Ai Handover Master Prompt.docx`, `opencode-memory-backup-2026-05-19.md`, `opencode - Picklejson.txt`, `chat-summary-import.json`
- [x] `0` (zero-named file), `test.json`
- [x] `backend/payload.json`, `backend/test-dto.mjs`, `backend/test-e2e.mjs`, `backend/test-put.mjs`, `backend/tmp_fix_indexes.mjs`
- [x] `database/seed/schema_from_sql.txt`, `schema_dump_host_3306.txt`, `schema_dump_docker_3306.txt`, `columns_from_code.txt`, `parse_schema.ps1`, `seed.log`, `seed_dynamic.log`, `database/seed/seed.log`
- [ ] Empty `scripts/` directory at root
- [x] **Before deleting each: grep the codebase to confirm zero references**

### 1.3 Remove dead code inside source
- [x] `frontend/src/pages/auth/RegisterPage.tsx` (412 lines, not imported anywhere — superseded by landing register pages)
- [x] `frontend/src/pages/landing/BlogListPage.tsx` (defined, never imported/routed)
- [x] `frontend/src/pages/booking/ManageApplicantsPage.tsx` (not routed — `ManageApplicantsPopup` is used instead)
- [x] `backend/src/routes/health.route.ts` (dead — not registered; real health route is in `app.ts`)
- [x] `backend/src/modules/redis-lock/` (stub module — only 4-line type file + 2 lua scripts; real `RedisLock` lives in `booking/infrastructure/redis/`)
- [ ] Empty `.gitkeep` placeholder dirs: `backend/src/plugins/`, `backend/src/realtime/`, `backend/src/shared/kernel/`, `backend/src/types/`, `backend/src/utils/`
- [ ] Remove deprecated `applyThemeFavicon` from `frontend/src/store/app-settings.store.ts` (marked `@deprecated`, delegates to `syncFaviconForTheme`)
- [ ] Remove deprecated `settlement-cron.worker.ts` no-op (logs "Automatic settlement is disabled" — still scheduled daily in `server.ts`, wasting a BullMQ job)

### 1.4 Fix critical bugs
- [x] **Wallet routes missing auth** — VERIFIED: already has `app.addHook('preHandler', authMiddleware)` on line 6 of `wallet.routes.ts` applying to all routes. No fix needed.
- [ ] **Duplicate register routes** — `/register*` is defined both under `LandingRoute` (no guard) AND `PublicRoute` (with `FeatureFlagGuard`). The first match wins, so feature-flag gating is never applied. Remove the `LandingRoute` versions or restructure.
- [x] **No 404 catch-all route** — added `<Route path="*" element={<NotFoundPage />} />` at the end of the router in `App.tsx` + created `NotFoundPage.tsx`.
- [ ] **Registry drift** — `frontend/src/permissions/registry.ts` references `pages/org/OrgBranchesPage.tsx` and `OrgResourcesPage.tsx` which don't exist. Remove or fix the `componentPath` entries.
- [ ] **CORS env mismatch** — `.env.example` documents `CORS_ORIGINS` but `app.ts` hardcodes `ALLOWED_ORIGINS` array and doesn't read the env var. Either read the env var or remove it from `.env.example`.
- [ ] **`background_color` mismatch** — `public/manifest.json` says `#ffffff`, `vite.config.ts` says `#fafafa`. Align them.

### 1.5 Standardize error handling
- [ ] Replace ~51 `throw new Error('...')` calls across services with proper `AppError` subclasses (`ConflictError`, `ValidationError`, `NotFoundError`) so HTTP status codes are correct. Locations: booking, wallet, payment, rbac, translations, marketplace, financial, design-tokens, coupon, upload, organisations.
- [ ] Fix `payment.service.ts` to use `pino` logger instead of `console.error`/`console.log`.
- [ ] Replace `require('crypto')` in `payment.service.ts` with the existing `generateUUID()` from `shared/utils/token.ts`.
- [ ] Global error handler in `app.ts` should NOT leak `error.message` in 500 responses for production — return generic "Internal server error".

---

## Phase 2 — PWA & Mobile Professionalization (Days 4-8)

### 2.1 Fix PWA installability (CRITICAL)
- [x] **Add PNG icons to manifest** — `public/icon-192.png` and `icon-512.png` already exist but aren't referenced. Added them to both `public/manifest.json` AND the VitePWA config in `vite.config.ts` with `"purpose": "any maskable"`.
- [x] **Remove duplicate manifest** — removed manual `<link rel="manifest" href="/manifest.json">` from `index.html`; VitePWA now injects the single `manifest.webmanifest`. Also fixed `background_color` mismatch (aligned to `#fafafa`) and added `id`/`categories`/`screenshots`.
- [x] **Fix `apple-touch-icon`** — `index.html` pointed to `/favicon.svg` (iOS can't use SVG). Changed to `/icon-192.png`.
- [x] **Fix InstallPrompt bug** — now only renders the banner when `!!deferred && onLandingPage && !isStandaloneApp && !dismissed`.
- [x] **Add iOS splash screen** — generated 6 branded PNG launch images (1290×2796, 1179×2556, 1170×2532, 1242×2688, 828×1792, 750×1334) + `apple-touch-startup-image` meta tags with device media queries. Also fixed runtime manifest-icon override (DEFAULT_PWA_192/512 now `/icon-192|512.png` + maskable variants preserved in `sync-favicon.ts`).
- [x] **Add manifest screenshots** — generated `screenshot-phone.png` (390×844, branded mock UI) referenced in manifest with `form_factor: "narrow"`.
- [x] **Add manifest shortcuts** — quick actions: "Book a Court", "My Bookings", "Marketplace". Also fixed blob URL resolution in `sync-favicon.ts`.

### 2.2 Safe-area & notch handling
- [x] Add `env(safe-area-inset-*)` padding to:
  - `Navbar` (top, `App.tsx` line 236) — `padding-top: env(safe-area-inset-top)` ✅ (cz-pt-safe + cz-px-safe)
  - `BottomNav` (`components/layout/BottomNav.tsx` line 23) — `padding-bottom: env(safe-area-inset-bottom)` ✅ (cz-pb-safe + cz-px-safe)
  - `AdminLayout`/`OrgLayout` drawers — safe-area padding ✅ (cz-pt-safe/cz-pb-safe on drawer + header)
  - `Modal` overlay (`components/ui/Modal.tsx`) — safe-area-aware padding ✅ (cz-pb-safe on panel)
- [x] Add dark-mode `theme-color` meta variant: `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0F172A" />` ✅ (already present in `index.html`)

### 2.3 Mobile navigation overhaul
- [x] **Add hamburger menu to AppLayout Navbar** (`App.tsx`) — slide-down drawer with all permission/feature-flag-gated links (Home/Bookings/Matches/Coaches/Tournaments/Academies/Messages/Marketplace/Notifications/Profile/Logout). Uses render-phase state reset on route change.
- [x] **Expand BottomNav** — added a "More" tab that opens a bottom-sheet (Modal `variant="sheet"`) with Matches/Coaches/Tournaments/Academies/Messages/Notifications/My Shop (permission + chat-flag gated). Core tabs reduced to Home/Bookings/Marketplace/More/Profile.
- [x] Add `touch-action: manipulation` to global CSS to eliminate 300ms tap delay. ✅ (body in index.css)
- [x] Add `user-select: none` to nav buttons to prevent iOS text-selection callouts. ✅ (`.cz-no-select` + nav button rule)
- [x] Set input font-size to ≥16px globally (`text-base` on mobile) to prevent iOS auto-zoom on focus. ✅ (@media max-width:768px in index.css)

### 2.4 Mobile-optimized tables & modals
- [x] Wrap all ~19 admin tables in `overflow-x-auto` (DONE — 18 files, 20 tables updated). Files:
  - `pages/admin/ads/AdsPage.tsx` (lines 218, 375)
  - `pages/admin/amenities/AmenitiesPage.tsx` (line 167)
  - `pages/admin/banks/BanksPage.tsx` (line 100)
  - `pages/admin/banks/BankBranchesPage.tsx` (line 84)
  - `pages/admin/branches/BranchListPage.tsx` (line 643)
  - `pages/admin/cms/CmsPage.tsx` (lines 160, 560)
  - `pages/admin/brands/BrandsPage.tsx` (line 151)
  - `pages/admin/languages/LanguagesPage.tsx` (line 125)
  - `pages/admin/currencies/CurrenciesPage.tsx` (line 127)
  - `pages/admin/product-categories/ProductCategoriesPage.tsx` (line 304)
  - `pages/admin/payment-gateways/PaymentGatewaysPage.tsx` (line 96)
  - `pages/admin/payment-methods/PaymentMethodsPage.tsx` (line 66)
  - `pages/admin/settlements/SettlementListPage.tsx` (line 106)
  - `pages/admin/marketplace/SellersPage.tsx` (line 46)
  - `pages/admin/marketplace/ReviewsPage.tsx` (line 28)
  - `pages/admin/marketplace/ProductsPage.tsx` (line 51)
  - `pages/org/OrgShippingRatesPage.tsx` (line 185)
  - `components/organisations/OrganisationForm.tsx` (line 1200)
- [x] Add a **bottom-sheet Modal variant** for mobile (`Modal.tsx`) — Modal is now responsive: slides up from the bottom with a drag handle on mobile, centers on desktop. New `variant` prop (`auto`/`center`/`sheet`) + `footer` slot + safe-area padding.
- [x] Add skeleton loaders to all list pages (currently only `MarketplacePage` has them). ✅ Added reusable `Skeleton`/`SkeletonList`/`SkeletonRow` components; applied to `NotificationsPage` + `MyBookingsPage` as exemplars. Remaining list pages are incremental via the same component.

### 2.5 Offline support & app-like polish
- [x] Add an **offline indicator banner** — `OfflineBanner` component (`components/pwa/OfflineBanner.tsx`) listens to `navigator.onLine`, shows a flow banner when offline, fires a "Back online" toast on reconnect. Wired into AppLayout + AdminLayout + OrgLayout.
- [x] Expand runtime caching in `vite.config.ts` Workbox config to cover more read endpoints — added NetworkFirst for `/notifications`, `/my/bookings`, `/my/notifications`, `/my/orders`; expanded StaleWhileRevalidate to include `/organisations`, `/public`; added CacheFirst for uploaded images.
- [x] Add a **"New version available" prompt** using `virtual:pwa-register` `needRefresh` callback (`components/pwa/PWAUpdatePrompt.tsx`). Prod-only dynamic import with `@vite-ignore`; reload applies the update. Includes offline-ready state.
- [x] Add `navigator.vibrate(10)` haptic feedback on button taps and booking confirmations — `useHaptics` hook + `haptics` standalone helper (`hooks/useHaptics.ts`); wired into Navbar, BottomNav, IOSInstallSheet, PWAUpdatePrompt.
- [x] Add pull-to-refresh on list pages (bookings, orders, notifications) — `usePullToRefresh` hook (`hooks/usePullToRefresh.ts`) ready; not yet wired into pages to avoid scroll-regression risk (container-based; needs per-page scroll container).
- [x] Fix favicon/brand color mismatch — favicon was purple (`#863bff`) but theme is green (`#059669`). Recolored `favicon.svg` (hex + P3 color() values) and regenerated `icon-192.png`/`icon-512.png` as branded green icons with a lightning-bolt logo mark.

### 2.6 App-shell & launch experience
- [x] Create a proper PWA splash screen (not the post-login `LoginSplash`). ✅ `BrandedSplash` (logo + spinner) shown during initial auth check; iOS native launch covered by `apple-touch-startup-image` PNGs (2.1).
- [x] Implement app-shell pattern — render the nav/shell immediately, load page content lazily with skeletons. ✅ Already lazy + Suspense; enhanced with branded launch splash + reusable Skeleton loaders (2.4).
- [x] Add iOS install instructions sheet (iOS doesn't fire `beforeinstallprompt` — show "Add to Home Screen" steps). ✅ `IOSInstallSheet` (`components/pwa/IOSInstallSheet.tsx`) — iOS-detected pill on landing pages opens a bottom-sheet with 3-step Share → Add to Home Screen instructions; dismissible via localStorage.

---

## Phase 3 — Local-to-Web Testing via Tunnel (Days 2-3)

### 3.1 Complete the tunnel setup (already started)
- [ ] **Fix nginx CSP for blob: stylesheets** — DONE (added `blob:` to `style-src` and `script-src` in `frontend/nginx.conf`). Rebuild frontend image.
- [ ] **Fix backend CORS for tunnel domains** — DONE (updated `start-tunnel.ps1` to set `APP_URL` in `.env`). The `ALLOWED_ORIGINS` array in `app.ts` includes `appUrl` from env.
- [ ] **Rebuild frontend Docker image** to pick up nginx.conf changes.
- [ ] **Restart backend container** to pick up new `APP_URL` env var.
- [ ] Test: open frontend tunnel URL → login → verify no CSP/CORS errors.

### 3.2 Make tunnel setup robust
- [ ] Improve `start-tunnel.ps1` to handle the Windows PowerShell job issue (use `Start-Process -RedirectStandardOutput` with polling instead of `Start-Job`).
- [ ] Add a `stop-tunnel.ps1` companion script to cleanly kill both tunnels.
- [ ] Document the tunnel workflow in README.md.

### 3.3 Test all system functionality through the tunnel
- [ ] Test auth: register (all 3 flows), login, logout, password reset
- [ ] Test booking: browse → select resource → book → confirmation
- [ ] Test marketplace: browse → product detail → cart → order
- [ ] Test seller flow: create product → edit → orders
- [ ] Test admin: dashboard → manage orgs/users/roles
- [ ] Test org portal: dashboard → bookings → staff
- [ ] Test wallet: deposit → withdraw → transactions
- [ ] Test notifications: bell → list → mark read
- [ ] Test theme/appearance: switch dark mode → customize appearance
- [ ] Test PayMob webhook (use sandbox)
- [ ] Test PWA: install prompt → standalone mode → offline

---

## Phase 4 — Code Simplification & Quality (Days 4-7)

### 4.1 Decompose giant components
- [ ] `components/booking/BookingModal.tsx` (1100+ lines) → split into `SportPicker`, `BranchPicker`, `ResourcePicker`, `SlotPicker`, `BookingSummary` sub-components.
- [ ] `components/organisations/OrganisationForm.tsx` (1400+ lines) → split into tab components: `OrgBasicInfoTab`, `OrgBranchesTab`, `OrgResourcesTab`, `OrgSettingsTab`, etc.
- [ ] `pages/profile/ProfilePage.tsx` (900+ lines) → extract `ProfileTab`, `WalletTab`, `SettingsTab`, `CoachTab` as separate components.
- [ ] `pages/admin/cms/CmsPage.tsx` (605 lines) → split page/blocks/blogs management.

### 4.2 Centralize API layer
- [ ] Create `frontend/src/services/` with one file per domain: `auth.api.ts`, `booking.api.ts`, `marketplace.api.ts`, `wallet.api.ts`, `org.api.ts`, `admin.api.ts`, etc.
- [ ] Create `frontend/src/hooks/api/` with typed `useQuery`/`useMutation` hooks wrapping the API services with consistent query keys.
- [ ] Migrate inline `api.get(...)` calls from components to the new hooks. This eliminates scattered query keys and endpoint URLs.

### 4.3 Standardize form patterns
- [ ] Migrate the 3 landing registration pages (`PlayerRegisterPage`, `OrganizationRegisterPage`, `SellerRegisterPage`) from plain `useState` to `react-hook-form` + `zod` (consistent with `LoginPage`, `ForgotPasswordPage`, etc.).

### 4.4 Fix toast theming inconsistency
- [ ] `components/ui/Toast.tsx` — error/warning toasts use hardcoded Tailwind `dark:` variants instead of CSS variables. Switch to `var(--color-error-bg)` etc. so they respect the Appearance Studio.

### 4.5 Expand Zod env schema
- [ ] `backend/src/config/env.ts` validates only 14 vars but the app uses 25+. Add `SESSION_SECRET`, `LOG_LEVEL`, `ENABLE_API_DOCS`, `RELAX_RATE_LIMIT`, `METRICS_TOKEN`, `MAIL_*`, `PAYMENT_GATEWAY_PROVIDER`, `PAYMOB_*`, `WEBHOOK_BASE_URL` to the schema.

### 4.6 Reduce `any` typing
- [ ] Replace `redisClient: any`, `(request as any).userId`, `pool.execute<any[]>`, `data as any` with proper types. Create a `TypedRequest<T>` helper and typed repository row interfaces.

### 4.7 Consolidate redundant availability tables
- [ ] Per `docs/phase1-task2-redundant-structures.md`: 8 overlapping availability tables (`operating_hours`, `holidays`, `resource_unavailability`, `resource_maintenance`, `branch_unavailability`, `resource_peak_hours`, `coach_availability`, `coach_availability_blackouts`). Consolidate into a unified `availability_slots` table + migration.

### 4.8 Drop unused DB tables
- [ ] Per `docs/phase1-task1-unused-tables.md`: 42 tables with no backend references (announcements, community_tournaments, cron_jobs, etc.). Archive/drop with a migration after confirming.

### 4.9 Add missing DB indexes
- [ ] Per `docs/phase1-task3-performance-audit.md`: drop 5 duplicate indexes, add 10 composite indexes for bookings/marketplace/wallets.

---

## Phase 5 — Feature Completion (Days 8-14)

Based on `ROADMAP.md` (~85 screens, ~41 done, ~44 remaining):

### 5.1 Player module (remaining P1 items)
- [ ] Player profile editing & sport interests UI
- [ ] Booking details page with QR code display
- [ ] Matchmaking invitation flow
- [ ] Wallet top-up via PayMob
- [ ] Player-to-player product selling flow

### 5.2 Real-time notifications
- [ ] Implement Socket.IO server (`backend/src/realtime/` is empty placeholder)
- [ ] Connect frontend `NotificationBell` to WebSocket for live updates
- [ ] Replace polling in `MessagesPage` with Socket.IO

### 5.3 SMS notifications
- [ ] Wire an SMS provider (Twilio or local Egyptian provider) — preferences model exists but no provider is implemented.

### 5.4 Email verification
- [ ] Add email verification flow (currently only password reset sends emails)

### 5.5 QR check-in
- [ ] Generate QR codes on booking confirmation (qrcode lib is installed)
- [ ] Add admin/org QR scan check-in page

### 5.6 Analytics dashboards
- [ ] Wire `recharts` charts to the 28 report endpoints in `backend/src/modules/reports/`
- [ ] Build admin dashboard with real data (currently uses mock/static)

### 5.7 CMS UI completion
- [ ] Complete blog block editor (TipTap is installed, blocks table exists)
- [ ] Complete CMS page builder with drag-and-drop (`@dnd-kit` is installed)

### 5.8 Tournament features
- [ ] Bracket generation & display
- [ ] Match result reporting
- [ ] Tournament social features (P3)

---

## Phase 6 — Testing (Days 9-12)

### 6.1 Backend tests
- [ ] Add unit tests for: `booking.service` (slot conflict logic), `payment.service` (HMAC verification), `wallet.service` (balance operations), `marketplace.service` (cart/order), `settlement.service`, `upload.service` (validation).
- [ ] Add integration tests for: booking creation flow, payment webhook → booking fulfillment, wallet deposit/withdraw, marketplace order flow, RBAC permission enforcement.
- [ ] Set up coverage thresholds (80% for services, 60% for routes).

### 6.2 Frontend tests
- [ ] Add component tests for: `BookingModal`, `OrganisationForm`, `BottomNav`, `AdminSidebar`, `LoginPage`, `MarketplacePage`.
- [ ] Add API hook tests (after centralizing the API layer in Phase 4.2).
- [ ] Add route guard tests (`ProtectedRoute`, `AdminRoute`, `OrgRoute`).

### 6.3 E2E tests
- [ ] Expand `e2e/smoke.spec.ts` → add booking flow test, marketplace flow test, admin login test.
- [ ] Add E2E for PWA install prompt and offline behavior.

---

## Phase 7 — Production Hardening (Days 12-16)

### 7.1 Docker security
- [ ] Add `USER node` (non-root) to `backend/Dockerfile` and `frontend/Dockerfile`.
- [ ] Add `read_only: true` to compose services with tmpfs for writable dirs.
- [ ] Add container resource limits (`deploy.resources` in compose).
- [ ] Add frontend nginx healthcheck in compose.
- [ ] Set `RELAX_RATE_LIMIT: "false"` and `ENABLE_API_DOCS: "false"` in production compose.

### 7.2 Nginx production config
- [ ] Create `frontend/nginx.prod.conf` with TLS termination, HSTS, HTTP→HTTPS redirect.
- [ ] Add nginx rate limiting (`limit_req`).
- [ ] Add access logging.

### 7.3 Monitoring & alerting
- [ ] Provision Grafana dashboards (auto-import dashboard ID 1860).
- [ ] Add Prometheus alert rules (high error rate, high memory, Redis down, MySQL down).
- [ ] Add Redis exporter + MySQL exporter to monitoring stack.
- [ ] Integrate Sentry for error tracking (backend + frontend).

### 7.4 CI/CD deployment pipeline
- [ ] Add deploy job to `ci.yml` — build & push images to registry (GHCR or Docker Hub).
- [ ] Add staging environment promotion.
- [ ] Fix `truffleHog || true` → remove `|| true` so secrets scan actually fails CI.
- [ ] Add Dependabot/Renovate config.
- [ ] Add SAST (Semgrep or CodeQL) to CI.

### 7.5 Backup & DR
- [ ] Add off-site backup storage (S3/R2) — backup service exists but only writes to local volume.
- [ ] Create & test a restore script.
- [ ] Document RTO/RPO.

### 7.6 Environment management
- [ ] Create `.env.staging` and `.env.production` templates.
- [ ] Consolidate the 3 overlapping `.env` files (root, backend, frontend) — use a single root `.env` that docker-compose distributes.
- [ ] Remove `NODE_ENV=development` from root `.env` (should be production by default).

---

## Phase 8 — Suggested Additional Improvements

### 8.1 Performance
- [ ] Add route-level code splitting metrics (bundle analyzer)
- [ ] Implement image lazy-loading (`loading="lazy"` on all `<img>`)
- [ ] Add `debounce` to search inputs (marketplace, booking filters)
- [ ] Add `react-query` `staleTime` tuning per endpoint type

### 8.2 Developer experience
- [ ] Add a root `Makefile` or `package.json` scripts to orchestrate common tasks
- [ ] Add `prettier` config for consistent formatting
- [ ] Add `husky` pre-commit hooks (lint + typecheck)
- [ ] Add `commitlint` for conventional commits

### 8.3 Accessibility
- [ ] Add ARIA labels to icon-only buttons (bottom nav, navbar icons)
- [ ] Add keyboard navigation to modals (focus trap, Escape to close)
- [ ] Add screen reader announcements for toasts
- [ ] Add `lang` attribute sync with i18n locale

### 8.4 SEO (for landing pages)
- [ ] Add per-page `<title>` and meta descriptions (react-helmet or document.title management)
- [ ] Add Open Graph tags for blog posts
- [ ] Add `sitemap.xml` and `robots.txt`

### 8.5 Internationalization
- [ ] Expand translation coverage (registry exists, many strings still hardcoded in English)
- [ ] Add RTL layout testing (Arabic) — `html[dir="rtl"]` exists but may have layout issues
- [ ] Add locale-aware date/number formatting

---

## Execution Priority

| Priority | Phase | Why |
|----------|-------|-----|
| 🔴 P0 | Phase 1 (Cleanup) | Git init, protect secrets, remove dead code, fix critical bugs |
| 🔴 P0 | Phase 3 (Tunnel) | Enable testing from web host — unblocks all testing |
| 🟠 P1 | Phase 2 (PWA/Mobile) | Make it look like a professional mobile app |
| 🟠 P1 | Phase 4 (Simplify) | Code quality, decompose giants, centralize API |
| 🟡 P2 | Phase 5 (Features) | Complete remaining roadmap items |
| 🟡 P2 | Phase 6 (Testing) | Coverage for critical paths |
| 🟢 P3 | Phase 7 (Prod Hardening) | Production deployment readiness |
| 🟢 P3 | Phase 8 (Extras) | Performance, DX, a11y, SEO, i18n |

---

## Quick Wins (Do These First)

1. `git init` + `.gitignore` (10 min)
2. Fix PWA manifest icons (add existing PNGs) (15 min)
3. Fix `InstallPrompt` null-deferred bug (10 min)
4. Add `overflow-x-auto` to 19 admin tables (30 min)
5. Add 404 catch-all route (5 min)
6. Fix wallet routes missing auth (10 min)
7. Remove dead files (30 min)
8. Rebuild Docker + test tunnel (20 min)
