# 87_TOURNAMENT_E2E_P0_SAFE_RESULTS.md

**Date:** 2026-10-06
**Stage:** Stage 2 — execution of safe, read-only P0 E2E checks
**Type:** Results documentation only (no source changes, no mutations)
**Overall verdict:** PARTIAL — see summary; a real environment-level failure was observed (F-01); most
credential/UI checks are BLOCKED because no test credentials and no DOM browser are available in this
environment.

---

## 1. Environment used

| Item | Value |
|---|---|
| Frontend | Docker `courtzon-frontend` (nginx) → `http://localhost:5173` |
| Backend | Docker `courtzon-backend` → `http://localhost:3000` (NODE_ENV=production, RELAX_RATE_LIMIT=false ⇒ backend HTTPS-guard active) |
| DB | Docker MySQL `courtzon_v3` (74 users, 3 tournaments: 3632, 3382, 3383) |
| Redis | Docker `courtzon-redis` |
| Health | `/health` 200 OK (db+redis+memory ok), `/health/ready` 200 OK |
| Browser | **No desktop browser is connected to the harness session** (`browser.tabs.list` → `[browser.disconnected]`). DOM/UI automation is unavailable; evidence below was gathered by exercising the **live** frontend (nginx) and backend over HTTP. |
| Test roster DB | Local XAMPP `courtzon_v2` (tournaments 4/5, users 126–136) is **not reachable** with the available root credential (access denied); T4/T5 are absent from `courtzon_v3`. |

## 2. Tests attempted

Only environment-feasible **read-only** checks were executed (GET only). Each is recorded below with
a runtime result.

| ID | Map ref | Role | URL / Target | Preconditions | Actions | Expected | Actual | Result |
|---|---|---|---|---|---|---|---|---|
| R-01 | G1 | any | `http://localhost:5173/` | stack up | GET root | App shell loads | HTTP 200 text/html; SPA shell contains `id="root"` + script (`CourtZon - Sports Facility Booking`) | **PASS** (shell-level; client render BLOCKED) |
| R-02 | G1 | any | `http://localhost:3000/health` | — | GET health | `status: ok` | 200 `{"status":"ok",checks:{database:ok,redis:ok,memory:ok}}` | **PASS** |
| R-03 | G1 | any | `http://localhost:3000/health/ready` | — | GET ready | DB+Redis ready | 200 `{"status":"ok",checks:{database:ok,redis:ok}}` | **PASS** |
| R-04 | G1 | any | `http://localhost:5173/login` | — | GET login | Login page served | HTTP 200 SPA shell (React mounts client-side) | **PASS** (shell-level) |
| R-05 | G1 | any | landing/`/login` | — | Observe console after load | No fatal console/runtime errors | Cannot observe (no DOM browser) | **BLOCKED** |
| R-06 | G2 | anonymous | `GET :3000/tournaments` | no session | GET | 401 guard | 401 `{"error":"AUTHENTICATION_ERROR","message":"Missing or invalid token"}` | **PASS** (API guard runtime) |
| R-07 | G2 | anonymous | `GET :3000/admin/tournaments` | no session | GET | 401 guard | 401 AUTHENTICATION_ERROR | **PASS** |
| R-08 | G2 | anonymous | `GET :3000/org/35/tournaments` | no session | GET | 401 guard | 401 AUTHENTICATION_ERROR | **PASS** |
| R-09 | G2 | anonymous | `GET :3000/referee/assignments` | no session | GET | 401 guard | 401 AUTHENTICATION_ERROR | **PASS** |
| R-10 | G2 | anonymous | `GET :3000/auth/me` | no session | GET | no user | 200 `{"user":null}` | **PASS** |
| R-11 | G2 | player/admin/etc | `:3000/auth/login` | credentials | Login POST | session created | **Not executed — no valid TEST_* credentials are available in this environment; not inventing any** | **BLOCKED** |
| R-12 | G2 | any | logout | valid session | Logout | session cleared | Requires a session → BLOCKED | **BLOCKED** |
| R-13 | G2 | any | UI guard redirects (`/login` after unauth nav) | browser | Navigate | client-side redirect | Requires DOM browser → BLOCKED | **BLOCKED** |
| R-14 | G3 | public | `GET :3000/public/tournaments` | — | GET list | 200 list | 200, **3 real tournaments** (3632 G11M2, 3382 Venue Org Cup, 3383 Venue Ext Cup, all `registration_open`) | **PASS** |
| R-15 | G3 | public | `GET :3000/public/tournaments/3382` | — | GET detail | 200 detail w/ bracket | 200; keys incl. `bracket` (len 1: round 1, match 1, `progression_state=pending`, `status=scheduled`, `participant1_name/2_name=null`, `score_summary=null`) | **PASS** |
| R-16 | G3 | public | `GET :3000/public/tournaments/3632`, `/3383` | — | GET details | 200 | Both 200 with full payloads | **PASS** |
| R-17 | G3 | public | `GET :3000/public/tournaments/999999` | — | Invalid public id | error/404 | 404 `{"error":"NOT_FOUND","message":"Tournament not found"}` (error code mislabeled `ACADEMY_PROGRAM_NOT_FOUND` — see F-02) | **PASS** (behavior) |
| R-18 | G3 | public | 3382 bracket[0] | — | Read data | match data | Natural **TBD/unplayed** match present (no names, no score, scheduled, pending) — usable TBD edge without fixtures | **PASS** (data-level) |
| R-19 | G3 | public | `/tournaments/public` & `/tournaments/public/3382` UI render | browser | Render list/detail/bracket | Fully rendered page | HTTP 200 SPA shell for both; client render requires DOM browser → BLOCKED | **BLOCKED** |
| R-20 | G4/5/6 | player/org/admin/referee | `/tournaments*`, `/org/35/*`, `/referee/*` UI | credentials + browser | Full UI flows (bracket, drawer, nav, current-player, initials, score, winner/loser, print, refresh, history) | — | Not executed: no credentials, no DOM browser | **BLOCKED** |
| R-21 | G7 | any | responsive widths (desktop/tablet/mobile) | browser + viewport control | Measure overflow/clipping | No overflow/clipping | No viewport emulation and no DOM browser available | **BLOCKED** |
| R-22 | G8/RT | — | real-time / Socket.IO tournament UI | — | Observe live updates | — | **NOT SUPPORTED / NOT OBSERVED** — no Socket.IO listener exists in any tournament page (Stage 1 audit); only an nginx `/socket.io/` proxy exists | **NOT SUPPORTED** |

## 3–5. Counts

| Status | Count |
|---|---|
| PASS | 14 |
| FAIL | 2 |
| BLOCKED | 7 |
| NOT EXECUTED (map cases not run this stage) | 50 (of the 73-case map — all remaining credential/DOM-browser/width-dependent safe cases + all deferred mutation cases) |
| **Total executed/recorded** | **23** |

## 6. Failure details

### F-01 — (P1, High) Local Docker HTTP access to proxied tournament surfaces 302-redirects to `https://localhost`
- **Observed (runtime, reproducible):**
  - `GET http://localhost:5173/tournaments` → **302**, `Location: https://localhost/tournaments`
  - `GET http://localhost:5173/referee/assignments` → **302**, `Location: https://localhost/referee/assignments`
  - `GET http://localhost:5173/bookings` → **302**
  - `GET http://localhost:5173/public/tournaments` (Accept json, an API call) → **302** `https://localhost/public/tournaments`
  - Following any of these → **connection failed** (no reachable TLS app on `https://localhost`).
- **Root cause category:** environment (frontend nginx config + backend HTTPS guard).
  - nginx `api-proxy.conf` maps **bare prefixes** (`/tournaments`, `/referee`, `/bookings`, `/marketplace`, `/public`…) directly to the backend **without Accept-header SPA routing**, while the trailing-slash variants (`/tournaments/`) do route SPA navigations to `index.html`. So `GET /tournaments` (exact, both navigation and same-origin API) hits the backend.
  - Backend `app.ts:184–191` — with `NODE_ENV=production` and `RELAX_RATE_LIMIT=false` (this compose stack), any request whose `X-Forwarded-Proto` is not `https` is redirected to `https://${hostname}${url}`. nginx sets `X-Forwarded-Proto: http` locally.
  - Combined result: **same-origin data fetches and direct deep-links for tournament/public/referee/bookings surfaces fail over local HTTP Docker** (they die at the `https://localhost` hop).
- **Evidence:** HTTP 302 Location headers above; direct `:3000` endpoints (bypassing nginx) return correct 200/401 — proving the defect is the nginx→backend HTTP/HTTPS coupling, not the API.
- **Reproduction steps:**
  1. `curl -i http://localhost:5173/tournaments` → 302 to `https://localhost/tournaments`.
  2. `curl -i -H 'Accept: application/json' http://localhost:5173/public/tournaments` → 302.
  3. Follow the redirect → connection refused / TLS failure.
- **Recommended fix priority: High.** Options (choose one, do not change production): set `RELAX_RATE_LIMIT=true` for the local Docker stack (documented opt-in, disables the HTTPS guard), **or** add Accept-header SPA routing (like `/tournaments/`) to the bare prefixes used for SPA deep links (`/tournaments`, `/referee`, `/bookings`, `/marketplace`), **or** make nginx forward a truthful `X-Forwarded-Proto` for local HTTP. Production (HTTPS behind Coolify/Cloudflare) is unaffected.

### F-02 — (P3, Low) `Tournament not found` uses a misleading error code
- **Observed:** `GET /public/tournaments/999999` → `{"error":"NOT_FOUND","message":"Tournament not found","code":"ACADEMY_PROGRAM_NOT_FOUND"}`.
- **Root-cause category:** backend (error-code mapping). The message is correct; the `code` blob reuses an academy constant.
- **Recommended fix priority:** Low — map `TOURNAMENT_NOT_FOUND` code for tournament 404s.

## 7. Evidence

- Live HTTP status codes + bodies for every R-* row (captured via fetch against localhost:5173 / localhost:3000).
- `GET :3000/public/tournaments` returns 3 real tournaments; `:3000/public/tournaments/3382` includes a bracket with a natural TBD/scheduled match.
- 302 `Location: https://localhost/...` reproduced for `/tournaments`, `/referee/assignments`, `/bookings`, `/public/tournaments` (Accept json) — with follow failure.
- SPA shell verified: `id="root"` present, script tags present at `/`.
- No screenshots (no DOM browser available).

## 8. Severity

| ID | Severity |
|---|---|
| F-01 | P1 High (blocks local Docker E2E of tournament/public/referee/bookings surfaces over HTTP; production HTTPS unaffected) |
| F-02 | P3 Low |

## 9. Root-cause category

| ID | Category |
|---|---|
| F-01 | Environment / frontend (nginx) config + backend HTTPS guard flag |
| F-02 | Backend (error-code mapping) |

## 10. Reproduction steps

See F-01 / F-02 above.

## 11. Recommended fix priority

High → F-01 (local Docker path + bare-prefix SPA routing or `RELAX_RATE_LIMIT=true`; do not change production).
Low → F-02 (correct `Tournament not found` error code). No source changes were made in this stage.

## 12. Tests not executed and why

- **All authenticated UI flows (Player / Org / Admin / Referee):** require valid TEST_* credentials, which are not present in this environment (and must not be invented) **and** a connected DOM browser.
- **All browser-only checks** (drawer open/close, Previous/Next interaction, current-player highlight, initials avatars, score/winner rendering, print, refresh, back/forward, direct-URL UI, keyboard focus, body-scroll, console-on-load): no desktop browser is connected to the harness (`browser.disconnected`).
- **Responsive at tablet/mobile widths:** no viewport emulation tool is available.
- **Public UI render:** same browser limitation (HTTP shell served 200, client render not observable).
- **Deferred mutation cases** (registration, referee accept/decline, result submission, draw actions): prohibited in this read-only stage by policy and kept deferred.
- **T4/T5 based cases:** T4/T5 are absent from the running `courtzon_v3` DB and `courtzon_v2` is not reachable → marked BLOCKED; not recreated.

## 13. Mutation confirmation

**No application data or database data was mutated.** Only HTTP `GET` requests were issued to the
live frontend/backend. No POST/PUT/PATCH/DELETE, no login/registration, no result submissions, no
referee accept/decline, no schedule/draw/booking/payment/accounting changes. The attempted read-only
DB queries against `courtzon_v2` were denied (no connection established); no SELECT succeeded, so no
data was even read locally beyond the running `courtzon_v3` API responses.

---

### Summary

| Status | Count |
|---|---|
| PASS | 14 |
| FAIL | 2 |
| BLOCKED | 7 |
| NOT EXECUTED | 50 |

- **Critical failures:** none classified P0.
- **High (P1):** F-01 — local Docker HTTP to proxied tournament surfaces 302s to unreachable `https://localhost` (environment/nginx/backend-flag).
- **Low (P3):** F-02 — tournament 404 uses a wrong error code.
- **Blockers:** (1) no valid TEST_* credentials in this environment; (2) no DOM browser connected to the harness; (3) no viewport emulation; (4) test DB (`courtzon_v2`) unreachable and T4/T5 absent from the running DB.
- **NOT SUPPORTED:** real-time/Socket.IO updates on tournament pages (none exists).
- Documentation commit: `docs: add p0 safe e2e results` (single, docs-only).