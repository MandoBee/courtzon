# 63 — T-RES-01 FAILURE DIAGNOSIS

**Diagnosed:** 2026-10-05 · **Target:** Production `187.127.72.93:3307 / courtzon_v3` (backend logs + code, read-only)
**Input failure (from 62):** `POST /org/35/tournaments/matches/1/result` → HTTP 500, requestId `6c5fda15-646c-4020-af91-245c19e409c1`

---

## 1. requestId / HTTP / endpoint / actor
- requestId: `6c5fda15-646c-4020-af91-245c19e409c1`
- HTTP: **500** (INTERNAL_ERROR) · Method: POST · Path: `/org/35/tournaments/matches/1/result`
- Actor: TEST_ADMIN (userId **127**, org 35) — payload `{ outcome: "completed", score: { homeGoals: 2, awayGoals: 1 } }`

## 2. ROOT CAUSE (confirmed from backend logs — not a hypothesis)
```
level:50 RulesValidationError
"The match has not ended yet — results can only be submitted after the scheduled match end"
Stack:
  at MatchResultService.submitMatchResult (dist/modules/match-result/application/match-result.service.js:59:23)
  at TournamentService.recordSharedResult (dist/modules/tournaments/application/tournament.service.js:3039:24)
  at recordOrgMatchResultHandler (dist/modules/tournaments/presentation/org-tournament.controller.js:281:17)
```
**The shared Match Result lifecycle rejects result submission until the match's schedule has passed.** The test match is scheduled `end_time = 2026-10-10 11:30:00` (future relative to now 2026-10-05), so `submitMatchResult` throws `RulesValidationError` → the global error handler returns a generic 500.

## 3. Where the exception occurred (code-trace, verified in dist + source)
- Rule check + throw: `MatchResultService.submitMatchResult` (match-result module) — the authoritative "has the match ended?" rule.
- Call chain: org-tournament.controller `recordOrgMatchResultHandler` → `tournamentService.recordSharedResult` → `match-result.submitMatchResult` → rejects before any DB write (verified: `match_result_records` = 0).

## 4. Why it happened
- **Not a payload/schema error** — the body (`outcome=completed` + `GoalsScoreSchema`) is valid for Football 11v11; `winner` is correctly server-derived for `completed`.
- **Not a sport/format/score issue, not match-session/booking/accounting/event side effect, and not a DB constraint.**
- It is the deliberate business rule: **results are only accepted after the scheduled end time.** Submitting before the window is rejected — the rejection is correct; the ONLY defect surfaced is that `RulesValidationError` is rendered as **HTTP 500 in place of a 4xx** (error-class mapping gap in the global handler — secondary, cosmetic-logging issue; it does not change the decision).

## 5. Expected correct behavior / test-side prerequisite
- Correct state for a successful submission: **current time ≥ scheduled match end (2026-10-10 11:30)** — then `submitMatchResult` would create `match_result_records` (+ later standings/status changes per the accept/finalize flow) and, for FREE tournaments, no payment/ledger/entitlement rows.
- What was actually written: **nothing** (see DB state below).

## 6. Does it require a code fix, or is the test/data at fault?
- **No code fix required for the business rule** (denial is by design).
- Two follow-ups to decide with the team: (a) map `RulesValidationError` to a 4xx instead of 500 (minor, P2); and (b) the test scenario must schedule the match at/past its end time (or treat the pre-end rejection as the expected T-RES negative) so a positive T-RES can proceed — this is a **test-pack/scenario adjustment**, not application code.
- No schema/migration/config change needed.

## 7. DB state after FAIL (read-only, unchanged — no side effects)
| Item | State |
|---|---|
| tournament_match 1 | `in_progress` · winner/score NULL · end_time 2026-10-10 11:30 |
| public match 14 | `in_progress` |
| match_session 6 | started 00:32:40Z, not ended |
| match_result_records / tournament_standings | 0 / 0 |
| booking 31 | confirmed · payment pending |
| payments / invoices / ledger_entries / financial_entitlements | 0 / 0 / 0 / 0 |

## 8. Side effects
None observed — the failed submission persisted nothing (no result record, no status change, no financial rows, no duplicate).

---

```
T-RES-01 FAILURE DIAGNOSIS: COMPLETE

ROOT CAUSE: CONFIRMED — RulesValidationError "The match has not ended yet — results can only be submitted
after the scheduled match end" (MatchResultService.submitMatchResult, result pre-window guard).
No code fix applied; no retry; DB unchanged; no side effects.
```

Stopped after diagnosis — no POST /result re-attempt, no ACCEPT/COMPLETE, no code/DB/schema/config change, no cleanup.