# 62 — T-RES-01 RESULT (Submit Tournament Match Result) — FAILED

**Executed:** 2026-10-05 00:42 UTC · **Target:** Production `187.127.72.93:3307 / courtzon_v3`
**Actor:** TEST_ADMIN (user 127 / org 35) · **Tournament 4 · tournament_match id 1 · public match id 14 (in_progress)**
**Scope:** T-RES-01 ONLY. Single attempt; on failure → stopped (no retry, no fix, no ACCEPT/COMPLETE, no other step, no cleanup).

---

## 1. Code-derived endpoint, method, actor, payload (verified — no guessing)
- **Endpoint:** `POST /org/:orgId/tournaments/matches/:matchId/result` — guard `requireOrgScopedPermission('org.tournaments.result.manage')`; `:matchId` = `tournament_matches.id` (**1**).
- **Actor:** the organisation official — **TEST_ADMIN (127)** (the org portal records results through the shared Match Result lifecycle; the referee does NOT submit on this path).
- **Payload (`RawMatchResultBodySchema`, `match-result.dto.ts`):** `{ outcome: 'completed'|'retired'|'walkover'|'forfeit'|'abandoned', winner?: 'home'|'away' (only for walkover/forfeit — server derives winner for completed), score?: SetsScoreSchema | GoalsScoreSchema }`.
- Football 11v11 → **`GoalsScoreSchema { homeGoals:int>=0, awayGoals:int>=0 }`** (home = participant1 TEST_PLAYER 133, away = participant2 TEST_PLAYER2 134).
- Preconditions observed: match in_progress, match_session 6 exists.

## 2. Request / Response (actual)
Request: `POST https://api.courtzon.cloud/org/35/tournaments/matches/1/result`
Body: `{ "outcome": "completed", "score": { "homeGoals": 2, "awayGoals": 1 } }`
Response: **HTTP 500** `{"error":"INTERNAL_ERROR","code":"SYSTEM_INTERNAL_ERROR","message":"Internal Server Error","meta":{"requestId":"6c5fda15-646c-4020-af91-245c19e409c1",...}}`

## 3. DB verification after failure (no unintended changes)
| Check | Actual |
|---|---|
| tournament_match 1 | `in_progress`, winner/score NULL (unchanged) |
| public match 14 | `in_progress` (unchanged) |
| match_result_records | **0** (no result row persisted) |
| match_sessions 6 | started only, not ended |
| tournament_standings | 0 (unchanged) |
| bookings / draw | 1 / locked+current (unchanged) |
| payments / invoices / ledger_entries / financial_entitlements | 0 / 0 / 0 / 0 |
| notifications | 19 (unchanged) |
| real users / real orgs / permissions / migration | 28 / 17 / 971 / 201 (unchanged) |

## 4. Root cause
**Not determined — the failure is server-side (500) before any persistence; root cause requires the backend error log for requestId `6c5fda15-646c-4020-af91-245c19e409c1` (NOT investigated by design, per the no-fix/no-retry rule).** Candidate areas recorded for the team (UNVERIFIED): shared-Result-lifecycle invariants (sport-format score validation for Football 11v11, winner-derivation path, or an upstream error in `recordSharedResult`) — to be confirmed from backend logs before any re-attempt.

## 5. Verdict
```
T-RES-01: FAIL

Endpoint+Method: POST /org/35/tournaments/matches/1/result
Actor: TEST_ADMIN (127) · Payload: { outcome: completed, score: { homeGoals: 2, awayGoals: 1 } }
HTTP: 500 INTERNAL_ERROR (requestId 6c5fda15-646c-4020-af91-245c19e409c1)
Tournament Match ID: 1 · Public Match ID: 14 (in_progress, unchanged)
DB: result_records 0 · match/session/standings unchanged · financial 0/0/0/0 · real data unchanged · no duplicate created
```

Stopped immediately per the failure rule — no fix, no retry, no ACCEPT, no other step, no cleanup. Awaiting team decision (investigate backend logs for the requestId, then decide on a re-attempt).