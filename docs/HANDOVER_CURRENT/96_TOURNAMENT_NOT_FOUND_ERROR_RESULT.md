# 96 — Tournament Not-Found Error Code (F-02)

**Overall verdict:** PASS — `GET /public/tournaments/999999999` now returns HTTP 404 with
`code: "TOURNAMENT_NOT_FOUND"` (previously `ACADEMY_PROGRAM_NOT_FOUND`); a valid public tournament still returns
200; no backend/DB/API-contract/RBAC changes beyond the corrected error-code constant; zero new test failures.

---

## 1. Starting HEAD

- `511ab363` (`docs: add player overview fallback result`), branch `master`, working tree clean.

## 2. Root cause

Requesting a nonexistent public tournament (`GET /public/tournaments/999999999`) returned **HTTP 404 with the wrong
error code**: `ACADEMY_PROGRAM_NOT_FOUND`.

This was not a shared mapper — it was a copy/paste of the wrong `ErrorCode` constant at **four** tournament lookup
sites, each of which constructed the error as
`new NotFoundError('Tournament', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND)`:

| # | File | Site | Endpoints affected |
|---|------|------|--------------------|
| 1 | `backend/src/modules/tournaments/application/tournament.service.ts` | `getPublicTournament()` (line ~837) | `GET /public/tournaments/:id` (also covers private / draft / cancelled / archived / soft-deleted tournaments, which intentionally behave as 404) |
| 2 | `backend/src/modules/tournaments/application/tournament.service.ts` | `getById()` (line ~903) | `PUT`/update flows and any authenticated tournament detail lookup (`updateTournamentHandler`) |
| 3 | `backend/src/modules/tournaments/application/tournament.service.ts` | `getByIdDetailed()` (line ~916) | `getTournamentHandler` — the shared Admin/Org management detail endpoint |
| 4 | `backend/src/modules/tournaments/application/participant-draw.service.ts` | private `getTournament()` (line ~1173) | All draw/participant lifecycle endpoints that resolve the tournament first (seed assignment, draw generation, approve/lock, waitlist promotion, withdraw, disqualify, …) |

`NotFoundError` maps to HTTP **404** with response field `error: 'NOT_FOUND'` and the domain code in `code`
(see the `AppError` branch of the global handler in `backend/src/app.ts`). Because the wrong `ErrorCode` was passed,
`code` carried `ACADEMY_PROGRAM_NOT_FOUND`.

The correct tournament-specific code **already existed** in the registry — no new error code, no registry change:

- `backend/src/shared/errors/error-codes.ts` line 134 → `TOURNAMENT_NOT_FOUND: 'TOURNAMENT_NOT_FOUND'`
- Already used by the same module elsewhere (`competition.service.ts`, `team-invitation.service.ts`,
  `participant-member.service.ts`, `tournament-refund.service.ts`, `tournament.service.ts` itself at other sites).

## 3. Correct error code

**`TOURNAMENT_NOT_FOUND`** — the pre-existing registry key used by every other tournament not-found path in the
codebase. It matches the `{RESOURCE}_NOT_FOUND` naming convention (`BOOKING_NOT_FOUND`, `USER_NOT_FOUND`,
`TOURNAMENT_MATCH_NOT_FOUND`, …) and required no architecture change.

## 4. Exact backend files changed

Production (4 one-line changes — error-code constant only):

1. `backend/src/modules/tournaments/application/tournament.service.ts`
2. `backend/src/modules/tournaments/application/participant-draw.service.ts`

Tests:

3. `backend/src/modules/tournaments/__tests__/tournament-not-found-error-code.spec.ts` (**new**, 10 tests)
4. `backend/src/modules/tournaments/__tests__/participant-draw.service.spec.ts` (+1 test)
5. `backend/src/modules/tournaments/__tests__/tournament-public-discovery.g11-16.integration.spec.ts`
   (+1 test, strengthened 2 existing tests with additional `code` assertions — no assertion removed or weakened)

**No frontend files were touched.**

## 5. Endpoints affected

- `GET /public/tournaments/:id` — the reported bug (anonymous/public lookup).
- Admin/Org tournament detail (`getByIdDetailed`) and update pre-read (`getById`).
- All participant-draw lifecycle endpoints resolving the tournament through `ParticipantDrawService.getTournament()`.

Unrelated errors were **not** renamed: the academy module keeps `ACADEMY_PROGRAM_NOT_FOUND` for academy programs, and
the leagues module (which has its own pre-existing misuse for `League`/`Season`) was deliberately left untouched as
out of scope.

## 6. Response shape / security

Shape produced by the global `AppError` handler is unchanged:

```json
{"error":"NOT_FOUND","message":"Tournament not found","code":"TOURNAMENT_NOT_FOUND","meta":{"requestId":"…","timestamp":"…"}}
```

- HTTP status remains **404**; no redirect.
- No stack trace, no internal/database id, no query details leak (message is the constant
  `"Tournament not found"`).
- Private vs nonexistent tournaments remain indistinguishable (no existence leak).
- **API contract unchanged** — same fields, same status; only the *value* of the pre-existing `code` field is
  corrected for tournament lookups.
- **No RBAC/permission/auth changes**: the public route remains anonymous read-only, admin/org routes keep their
  existing guards, and no permission keys or route protection were added, removed, or altered.

## 7. Tests

All new assertions **add** coverage — no existing assertion was removed or weakened, and no test was modified to
accept the wrong production behaviour.

**Focused (new/updated specs) — all PASS:**

| Run | Result |
|-----|--------|
| `tournament-not-found-error-code.spec.ts` (new, 10 tests: service 404 + private/draft/soft-deleted, `getById`, `getByIdDetailed`, valid 200 path, response-shape keys, HTTP `fastify.inject` 404 + 200) | 10/10 PASS |
| `participant-draw.service.spec.ts` (existing 20 + 1 new not-found code test) | 21/21 PASS |
| `tournament.service.spec.ts` (regression) | 43/43 PASS |
| `shared/errors/app-error.spec.ts` (error/HTTP shape) | 9/9 PASS |
| Combined focused run | **83/83 PASS** |

**Tournament backend unit suite** (`npx vitest run src/modules/tournaments`): **42 files, 689 tests — ALL PASS**.

**Focused integration** (`tournament-public-discovery.g11-16.integration.spec.ts`, incl. the new "nonexistent →
404 TOURNAMENT_NOT_FOUND" test and strengthened private/draft assertions): **10/10 PASS**.

**Full backend unit suite** (`npx vitest run`): 3197 passed, **5 failed** — the 5 failures are pre-existing,
date-based `organisations` specs (`current-subscription-resolution`, `view-assignments-status`, hardcoded
18/08→18/09 periods vs today 2026-10-06). Verified identical **with my changes stashed at HEAD** (same 2 files /
5 failures). Those files contain zero tournament references.

**Full tournament-related backend integration suite** — A/B baseline comparison (changes stashed vs applied,
run back-to-back against the same DB):

| Run | Failed files | Failed tests | Passed | Skipped |
|-----|-------------|--------------|--------|---------|
| **Baseline (HEAD, changes stashed)** | 8 | 38 | 178 | 31 (247) |
| **With F-02 changes** | **7** | **38** | 186 | 24 (248) |

- The with-changes failing-file set is a **strict subset** of the baseline set — **zero new failures** introduced.
- Failing files are identical in both runs: `tournament-card-accounting.g11-1`, `tournament-cash-accounting.g11-2`,
  `tournament-create`, `tournament-g11-4-gaps`, `tournament-refund.g11-3`,
  `tournament-registration-cancel.g11-8`, `tournament-settlement.g11-4` (+ baseline additionally failed
  `tournament-registration-payment-rbac.g11-21-6`, which **passed** with my changes).
- Failure causes are environmental and unrelated to error codes, identical in baseline and with-changes runs:
  `Duplicate entry '10060300' for key 'organisations.PRIMARY'` (fixture row left behind by an earlier killed test
  process), `spawn mysql ENOENT` (no `mysql` CLI on this Windows host), and
  `No accounting period found for date 2026-10-06` / `Timed out waiting for … postings/recognition`
  (accounting-period date dependency in payment/recognition flows).
- The public-discovery integration spec (containing the F-02 assertions) **passed in both runs**.

## 8. TypeScript / build

- `npx tsc --noEmit` → exit 0
- `npm run build` (translation artifact + `tsc`) → exit 0

## 9. Docker status

- `docker compose build backend` → success; `docker compose up -d backend` → recreated.
- `courtzon-backend` healthy, `courtzon-frontend` healthy (untouched).
- `GET /health` → 200 (`status: ok`), `GET /health/ready` → 200 (`status: ok`).

## 10. Runtime verification

- `GET /public/tournaments/999999999` → **404**, `code: TOURNAMENT_NOT_FOUND` (never
  `ACADEMY_PROGRAM_NOT_FOUND`), no `Location` header, no stack, no id leak.
- `GET /public/tournaments/3632` (real public tournament) → **200** with full safe detail payload.

## 11. Database

**No DB changes.** No migrations created, no schema changes, no seeds run, no data modified.
All queries are the pre-existing reads (`SELECT` only) inside the unchanged service/repository code.

## 12. Commits

- Feature: `d6cf128f` — `fix(tournaments): correct tournament not found error code`
- Docs: `docs: add tournament not found error result` (this file)

## 13. Final Git status

- Working tree: clean after both commits.
- Both commits pushed to `origin/master`; `HEAD == origin/master` after the push.
