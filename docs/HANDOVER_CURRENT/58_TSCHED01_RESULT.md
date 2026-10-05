# 58 — T-SCHED-01 RESULT (Schedule Tournament Match 14) — FAILED

**Executed:** 2026-10-05 00:00 UTC · **Target:** Production `187.127.72.93:3307 / courtzon_v3`
**Actor:** TEST_ADMIN (user 127 / org 35) · **Tournament 4 · tournament_match 1 · Match 14**
**Scope:** T-SCHED-01 ONLY. Execution stopped immediately after the failure — no retry, no scheduling artifact created, no other step, no cleanup.

---

## 1. Real API + payload extracted from code (verified)
- Route: `POST /org/:orgId/tournaments/:id/matches/:matchId/schedule` — guard `requireOrgScopedPermission('org.tournaments.manage')`.
- Payload (`ScheduleMatchSchema` in `tournament.dto.ts`): `{ date: 'YYYY-MM-DD', start_time: 'HH:MM', end_time: 'HH:MM', resource_id: int>0 }`.
- Service `scheduleMatch(tournamentId, matchId, input, actorId)` (`match-schedule.service.ts`) fetches the match via `tournamentRepository.findMatchById(matchId)` and rejects if `match.tournament_id !== tournamentId`; court must be in `findEligibleCourts(tournamentId)`; date/time must be inside tournament + branch windows.
- Eligible courts (GET `.../matches/eligible-courts`) confirmed: **resource 6 TEST_COURT_1** (branch 21, sport 19) — eligible.

## 2. Attempt (actual, credentials redacted)
Request: `POST https://api.courtzon.cloud/org/35/tournaments/4/matches/14/schedule`
Body: `{"date":"2026-10-10","start_time":"10:00","end_time":"11:30","resource_id":6}`
Response: **HTTP 404** `{"error":"NOT_FOUND","message":"Match not found","code":"TOURNAMENT_MATCH_NOT_FOUND", ...}`

## 3. Root cause (determined from code — recorded only)
- The route parameter `:matchId` is resolved by `findMatchById` against `tournament_matches.id` (the tournament-scoped match row = **1**), **NOT** the public `matches.id` (14).
- The attempt passed **14** (public matches id) → `findMatchById(14)` finds no `tournament_matches` row → service raises `TOURNAMENT_MATCH_NOT_FOUND` (404).
- This is an **identifier-selection error on the test side**, not a system defect. Correct value for a retry (pending human approval): `tournament_match id = 1`.

## 4. DB verification after failure (no unintended changes)
| Check | Actual |
|---|---|
| tournament_match 1 | status `scheduled`, resource NULL, start/end NULL (unchanged — no scheduling persisted) |
| bookings | 0 (no court reservation created) |
| payments / invoices / ledger_entries / financial_entitlements | 0 / 0 / 0 / 0 |
| notifications | 19 (unchanged) |
| draw 1 | locked · is_current 1 (unchanged) |
| real users / real orgs / permissions / migration | 28 / 17 / 971 / 201 (unchanged) |

## 5. Verdict
```
T-SCHED-01: FAIL

HTTP 404 TOURNAMENT_MATCH_NOT_FOUND
Root cause: :matchId should be tournament_matches.id (= 1), not matches.id (= 14) — test-side identifier error.
DB: unchanged (no scheduling row, no booking, financial 0, real data unchanged)
```

Stopped immediately per the failure rule — no fix, no retry, no other step. Awaiting your decision (e.g., approve a single re-attempt against `tournament_match id 1`).