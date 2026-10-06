# 89_TOURNAMENT_E2E_P0_RERUN_RESULTS.md

**Date:** 2026-10-06
**Stage:** Stage 2 re-run — safe read-only P0 E2E (post F-01 fix)
**Type:** Results documentation only (no source changes, read-only execution)
**Overall verdict:** PARTIAL — F-01 regression cleared; one pre-existing minor failure (F-02) remains;
credential/DOM checks remain BLOCKED.

---

## 1. Environment

| Item | Value |
|---|---|
| Frontend | Docker `courtzon-frontend` (nginx) → `http://localhost:5173` (rebuilt with F-01 nginx fix) |
| Backend | Docker `courtzon-backend` → `http://localhost:3000` (NODE_ENV=production, RELAX_RATE_LIMIT=false ⇒ HTTPS guard active) |
| DB / Redis | Docker `courtzon_v3` / `courtzon-redis` |
| Health | `/health` 200, `/health/ready` 200 |
| Browser | Still **no desktop browser connected** (`browser.disconnected`) → DOM/UI automation unavailable; evidence is live HTTP runtime |
| Credentials | No valid TEST_* credentials available in the environment (unchanged from Stage 2) |
| Test roster DB | `courtzon_v2` unreachable with available credential; T4/T5 absent from running DB |

## 2. Previous baseline (Stage 2, report 87)

| Status | Count |
|---|---|
| PASS | 14 |
| FAIL | 2 (F-01 P1 HTTPS redirect, F-02 P3 error-code label) |
| BLOCKED | 7 |
| NOT EXECUTED | 50 |

## 3. Re-run results (runtime, this run)

All checks below were executed live over HTTP (GET only).

| Check | URL | Result |
|---|---|---|
| FE root (app shell) | `http://localhost:5173/` | 200 text/html, shell serves |
| FE login | `http://localhost:5173/login` | 200 text/html shell |
| Backend health | `http://localhost:3000/health` | 200 ok (db+redis+memory) |
| Backend ready | `http://localhost:3000/health/ready` | 200 ok |
| F-01 /tournaments (nav + api) | `http://localhost:5173/tournaments` (Accept text/html & json) | 401 AUTHENTICATION_ERROR — no Location |
| F-01 /referee/assignments | `http://localhost:5173/referee/assignments` | 401 — no Location |
| F-01 /bookings | `http://localhost:5173/bookings` | 401 — no Location |
| F-01 /public/tournaments | `http://localhost:5173/public/tournaments` (json) | 200 public list — no Location |
| Public list | `:3000/public/tournaments` | 200, 3 tournaments (3632, 3382, 3383, all registration_open) |
| Public detail 3382 | `:3000/public/tournaments/3382` | 200, `format=knockout`, bracket_type=Single Elimination, bracket len 1 |
| Public detail 3632 / 3383 | `:3000/public/tournaments/3632` & `/3383` | 200 both |
| Public invalid id | `:3000/public/tournaments/999999` | 404 "Tournament not found" (code mislabeled — F-02) |
| Unauthenticated guard /tournaments | `:3000/tournaments` | 401 |
| Unauthenticated guard /admin | `:3000/admin/tournaments` | 401 |
| Unauthenticated guard /org | `:3000/org/35/tournaments` | 401 |
| Unauthenticated guard /referee | `:3000/referee/assignments` | 401 |
| /auth/me unauth | `:3000/auth/me` | 200 `{"user":null}` |
| HTTPS guard still active (XFP http) | `:3000/tournaments` header `X-Forwarded-Proto: http` | 302 → `https://localhost/tournaments` (enforcement preserved) |
| HTTPS guard passes (XFP https) | `:3000/tournaments` header `X-Forwarded-Proto: https` | 401 (normal path) |
| Natural TBD/unplayed public match | 3382 → bracket[0] | round 1, names null, status scheduled, progression pending, score null — usable TBD edge without fixtures |

## 4. Comparison with Stage 2

| Stage 2 result | This re-run | Classification |
|---|---|---|
| R-01..R-10, R-14..R-18 (14 PASS) | identical runtime PASS | **PASS remains PASS** |
| F-01 (P1 FAIL) | no HTTPS redirect; normal 401/200 responses | **previously FAIL → now PASS** |
| F-02 (P3 FAIL) | 404 still returns `code: ACADEMY_PROGRAM_NOT_FOUND` | **previously FAIL remains FAIL** |
| R-05, R-11, R-12, R-13, R-19, R-20, R-21 (7 BLOCKED) | still not executable (no credentials, no DOM browser, no viewport) | **BLOCKED remains BLOCKED** |
| Real-time (NOT SUPPORTED) | no Socket.IO listener on tournament pages (no new evidence) | **NOT SUPPORTED / NOT OBSERVED** |
| — | — | **Newly discovered FAIL: none** |
| — | — | **Newly unblocked cases: 0** (credential/browser/width cases remain blocked) |

## 5. PASS cases (this run)

All 14 Stage-2 passes re-passed, plus the F-01 endpoint set (4 endpoints) now PASS — see F-01
verification table (section 10). Runtime guard for org/admin/referee/tournaments (401) and public
list/detail/404 verified live.

## 6. FAIL cases (this run)

| Test ID | Exact request | Expected | Actual | Severity | Root-cause category | Evidence |
|---|---|---|---|---|---|---|
| F-02 | `GET :3000/public/tournaments/999999` | 404 "Tournament not found" | 404 JSON with `"code":"ACADEMY_PROGRAM_NOT_FOUND"` | P3 Low | backend (error-code mapping) | Response body `{"error":"NOT_FOUND","message":"Tournament not found","code":"ACADEMY_PROGRAM_NOT_FOUND",...}` |

Reproduction: send the GET; observe the `code` field label. Not fixed in this stage (out of scope).

## 7. BLOCKED cases (this run)

| ID | Reason |
|---|---|
| R-05 console-error-on-load | no DOM browser |
| R-11 valid login | no valid credentials in environment (not invented) |
| R-12 logout | requires a session |
| R-13 UI guard redirect (client-side) | requires DOM browser |
| R-19 public UI render | requires DOM browser |
| R-20 player/org/admin/referee UI flows | requires credentials + DOM browser |
| R-21 responsive widths | no viewport emulation, no DOM browser |

## 8. Newly unblocked cases

- **0** cases became newly executable this stage: the DOM-browser, credential, and viewport blockers
  are unchanged. The only unblocked change is the **F-01 endpoint set** (previously FAIL → now PASS),
  not new cases.

## 9. Remaining blockers

1. No valid TEST_* credentials available in this environment (must not be invented).
2. No desktop browser connected to the harness session (`browser.disconnected`).
3. No viewport emulation (responsive at tablet/mobile widths).
4. Test roster DB `courtzon_v2` unreachable with the available credential; Tournament 4/5 absent from
   the running `courtzon_v3` DB.

## 10. F-01 regression verification

| Endpoint | Expected | Actual | Status |
|---|---|---|---|
| `GET /tournaments` | no HTTPS redirect | 401 AUTHENTICATION_ERROR, no Location | **PASS** |
| `GET /referee/assignments` | no HTTPS redirect | 401, no Location | **PASS** |
| `GET /bookings` | no HTTPS redirect | 401, no Location | **PASS** |
| `GET /public/tournaments` | normal response | 200 public JSON list, no Location | **PASS** |

Extra guard-preservation evidence: `X-Forwarded-Proto: http` → **302** still (backend HTTPS
enforcement active); `X-Forwarded-Proto: https` → **401** (normal). Production HTTPS behavior
unchanged.

## 11. Confirmation — no state mutated

Read-only execution: only HTTP `GET`/health requests were issued. No logins, registrations, results,
referee accept/decline, bookings, payments, accounting, or tournament-state changes. Tournament 4/5
not created or modified (absent from running DB). No SELECT against the unreachable `courtzon_v2` DB.

---

## Summary table

| Status | Previous (Stage 2) | Current |
|---|---|---|
| PASS | 14 | **15** |
| FAIL | 2 | **1** |
| BLOCKED | 7 | **7** |
| NOT EXECUTED | 50 | **50** |

Documentation commit: `docs: add p0 e2e rerun results` (single, docs-only). No source or config
changes were made.