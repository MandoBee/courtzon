# 90_E2E_BROWSER_CAPABILITY_AUDIT.md

**Date:** 2026-10-06
**Type:** Read-only discovery of browser/E2E capability
**Overall verdict:** PASS — a fully capable, locally-installed Playwright stack exists and was proven
at runtime (real headless Chromium, viewport emulation, console capture, screenshots, live
localhost:5173 DOM rendering). The remaining blockers are scoped to **data-mutation policy** and
**credential provisioning**, not to tooling.

---

## 1. Current HEAD

- `70d57590` (`docs: add p0 e2e rerun results`)
- Working tree at start: clean.

## 2. Existing E2E / browser tooling

| Framework | Found | Notes |
|---|---|---|
| **Playwright** | **YES** | declared `@playwright/test ^1.52.0` (root `package.json`), installed **1.60.0** (root node_modules, with `playwright` and `playwright-core` 1.60.0); bundled Chromium installed locally |
| Cypress | NO | no config/package references found |
| Puppeteer | NO | not present |
| Selenium / WebDriver | NO | not present |
| Harness desktop browser | disconnected | `browser.disconnected` — the harness-hosted browser is unavailable; **the project's own Playwright is independent and works** |

## 3. Installed versions

- `@playwright/test`: 1.60.0 (installed), declared `^1.52.0`.
- `playwright` / `playwright-core`: 1.60.0.
- Bundled Chromium: `chromium-1223` (`C:\Users\<user>\AppData\Local\ms-playwright\chromium-1223\chrome-win64\chrome.exe`) + `chromium_headless_shell-1223` — **already installed, no browser download required**.

## 4. Existing commands

- `npm run test:e2e` → `playwright test` (root config).
- `npm run test:e2e:ci` → `playwright test --grep "Smoke — public"`.
- `npx playwright test -c e2e/playwright.config.ts` → project matrix (smoke / critical / realtime / admin / all).
- Supports `--headed`, `--project=…`, `--grep=…`, `--reporter=…` (standard Playwright).

## 5. Existing configs

- **Root `playwright.config.ts`**: `testDir: './e2e'`, baseURL `http://localhost:5173`
  (`PLAYWRIGHT_BASE_URL` override), timeout 60s, trace on-first-retry, `webServer` = `npm run dev`
  (preview in CI) with `reuseExistingServer: !CI` → **locally it reuses the running Docker frontend
  on :5173**.
- **`e2e/playwright.config.ts`**: scenarios under `e2e/scenarios`, projects
  smoke/critical/realtime/admin/all all using `devices['Desktop Chrome']`; reporters html/junit/json/
  list into `test-results/e2e`; `screenshot: 'only-on-failure'`, `video: 'on-first-retry'`,
  `trace: 'on-first-retry'`; `FRONTEND_URL`/`BACKEND_URL` env overrides (defaults :5173/:3000).
- Extra files: `e2e/scenarios/**` (admin, booking, match, notifications, payments, smoke, tournament,
  wallet), `e2e/pages/*` page objects (Login, Dashboard, Booking, Match, Notification, Payment,
  Wallet), `e2e/fixtures/*` (auth, booking, organisation, payment), `e2e/helpers/*` (api, assertions,
  database, time), `e2e/data/*` (users, courts), `e2e/node_modules` (local install).

## 6. Browser availability

- **YES — proven at runtime.** A read-only headless probe with `@playwright/test` (bundled Chromium)
  launched successfully and rendered the live app:
  - `/` → title "CourtZon - Sports Facility Booking", `#root` present, landing text visible.
  - `/tournaments/public` → real DOM list: `G11M2 1790909703203 … registration_open`,
    `Venue Org Cup…` (live data from the running stack).
  - `/tournaments/public/3382` → DOM detail: `Venue Org Cup knockout registration_open Single
    Elimination …`.
  - Console errors captured (CSP "Executing inline script violates …script-src…" warnings and
    expected unauthenticated 401 resource failures).
- Can run **headless** (verified) and **headed** (`--headed`).

## 7. Local Docker connectivity

- **YES.** Playwright `baseURL`/`FRONTEND_URL` default to `http://localhost:5173`
  (nginx Docker frontend) and `BACKEND_URL` to `http://localhost:3000`; the root `webServer` reuses
  the existing server on :5173 when not in CI. The probe rendered live data from the running stack,
  confirming connectivity end-to-end.

## 8. Credential handling capability (no secrets exposed)

- `e2e/data/users.ts` + `e2e/fixtures/auth.fixture.ts` provide **ephemeral test players/coaches/
  sellers** (random phone numbers generated per run) and an admin identity driven by an environment
  variable (`ADMIN_PASSWORD`) with a dev fallback. Users are inserted into the DB by the helper
  `insertUser` and then logged in through the real **UI** (`LoginPage`).
- DB connection is configurable via env vars `TEST_DB_HOST/PORT/USER/PASSWORD/NAME` (defaults target
  Docker MySQL `127.0.0.1:3307` / `courtzon_v3`; the file contains a dev fallback password **not
  disclosed here**).
- **Conclusion:** credential provisioning via environment variables is supported. The `TEST_*` roster
  (users 126–136) is **not wired into this suite** — those identities would need to be supplied as env
  fixtures to be used. No actual passwords/tokens were required or printed for this audit.

## 9. Screenshot capability

- **YES.** Playwright screenshots configured (`only-on-failure`) and programmatic
  `page.screenshot()` verified (a mobile screenshot of `/tournaments/public/3382` was written
  successfully during the probe).

## 10. Console / network capture

- **YES.** `page.on('console')` / `page.on('pageerror')` verified at runtime (CSP warnings + 401
  resource noise captured); config adds trace/video on retry; Playwright can also intercept network
  via `page.route`.

## 11. Viewport / device emulation

- **YES.** `devices['Desktop Chrome']` used in config; `page.setViewportSize()` verified at runtime
  (set 390×844; measured `scrollWidth === clientWidth` → no horizontal overflow on the public
  detail page at mobile width). So desktop/tablet/mobile checks are executable.

## 12. Recommended smallest next step

Use the **existing Playwright stack** (no installs): write and run **narrow, read-only Playwright
specs** against the running Docker stack for the P0 tournament surfaces (public list/detail/bracket/
match, unauthenticated guards, responsive overflow at desktop/tablet/mobile, console-error capture,
screenshots). For authenticated surfaces, supply the `ADMIN_PASSWORD` env (and, if needed, `PLAYWRIGHT_BASE_URL`/`BACKEND_URL`) and use the existing `LoginPage` for the one login flow.

**Critical caveat:** the current `e2e` suite is **destructive by design** — its helpers
`insertUser` and `cleanup()` (TRUNCATE of users, bookings, wallets, organisations, etc.) mutate the
database. The running `courtzon_v3` stack is the live test DB; running the full suite there would
truncate its data (including the 3 tournaments). Therefore:
- Read-only P0 checks → custom GET-only specs that never call `insertUser`/`cleanup`, **or** target a
  disposable DB.
- The full suite → run only against a dedicated disposable database with explicit approval.

## 13. What is NOT available

- No Cypress / Puppeteer / Selenium (Playwright only).
- No CI pipeline runs Playwright (no workflow references playwright/e2e — CI is unit/backend).
- No `TournamentPage` page object and **no bracket-specific scenario** yet (tournament scenarios are
  `tournament-team-invitation` and `tournament-venue-flow`).
- No `realtime` scenarios (matches the NOT SUPPORTED real-time finding).
- No valid `TEST_*` roster credentials; those identities are not wired into the E2E data/fixtures.
- The harness-hosted desktop browser remains disconnected (irrelevant now — project Playwright works).

## 14. What must be provided/configured before real browser E2E can run

1. **A decision (or explicit approval) on data mutation** — either read-only GET-only specs, or a
   dedicated disposable test database (e.g., a second schema) for the destructive suite. The current
   `courtzon_v3` stack must not be truncated without approval.
2. **Credentials** for authenticated flows that require an existing user: provide `ADMIN_PASSWORD`
   (env) and/or TEST_* roster fixtures via env vars (the `TEST_DB_*` and `ADMIN_PASSWORD` mechanisms
   already exist). Admin login currently targets a specific fixture identity.
3. **Optionally** a headless/headed runner host is already present (bundled Chromium). No installs
   or Docker changes needed.
4. For CI, add a Playwright job (browser install + separate test DB) — out of scope for this stage.

---

### Runtime probe evidence (read-only, this audit)
- Real headless Chromium launched; `#root` rendered; public list/detail DOM text confirmed; mobile
  (390px) no horizontal overflow; screenshot file created; console errors captured (CSP inline-script
  warnings + expected unauth 401s). All read-only (GETs only, no logins, no mutations).