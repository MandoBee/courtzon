# 67 — T-RES-01 RESULT (new-tournament result submission) — PASS

**Executed:** 2026-10-05 01:24–02:44 UTC · **Target:** Production `187.127.72.93:3307 / courtzon_v3`
**New tournament:** `TEST_TOURNAMENT_RESULT_01` ⇐ `65_TRES_PRE_RESULT_SCENARIO.md` · **Tournament 4 untouched.**
**Actors:** TEST_ADMIN (127), TEST_PLAYER 133, TEST_PLAYER2 134, TEST_REFEREE 132.

---

## Steps (real APIs only; scheduling retried once after the documented 409)
| Step | Result |
|---|---|
| create (FREE · sport 19 · knockout/bracket 1 · match_format 3 · rule_set 3 · branch 21 · start 2026-10-05) | 201 — **Tournament ID 5** |
| publish / open-reg | 200 / 200 |
| register 133 / 134 | 201 / 201 — **Registration IDs 5, 6** |
| draw → approve → lock / generate | 200×3 / 201 — **Draw 2**, 1 match (**tournament_match 2 ↔ public match 15**) |
| schedule retry | 200 — window **01:42–02:42** (60 min ≥ slot default 60; verified from slot engine `slotDurationMinutes ?? 60`) · resource 6 · **booking 32** |
| referee assign | 200 — referees.id 1 (user 132) |
| start | 200 — in_progress (session id 7) |
| wait (real time) | until remote NOW ≥ end (02:44:10 ≥ 02:42:00) |
| **submit result** | **201** — `{"ok":true,"resultId":6}` |

## Result (actual)
- **Result ID = 6** · match_id 15 · outcome `completed` · submission_status `pending_confirmation` · submitted_by 127 · played_at 01:34:43
- raw_result: `{ score: {awayGoals:1, homeGoals:2}, outcome:"completed" }`
- final_result (server-derived): `winner: "home", scoreSummary "2-1"` (home = participant1/TEST_PLAYER2 134; away = TEST_PLAYER2? no — away = participant2 = TEST_PLAYER 133 → **winner = TEST_PLAYER2 (134), 2–1**)

## DB verification
| Check | Actual |
|---|---|
| match_result_records | **1** (id 6) — no duplicate (`match_id` UNIQUE) |
| tournament_match 2 → previous/in_current | `in_progress` (unchanged by submit; winner_participant NULL) · score_summary `2-1` |
| public match 15 | `in_progress` (booking 32) |
| match_session 7 | started 01:34:43 · **not ended** (ended_at set only at a later acceptance/complete step) |
| standings (tournament_standings) | **0** (computed at later finalize — expected; not part of submit) |
| bookings | **2** (booking 31 tournament 4 · booking 32 tournament 5) — no duplicate/double booking |
| draw 2 | locked · is_current 1 (unchanged) |
| registrations/participants (tournament 5) | 2 / 2 (unchanged) |
| payments / invoices / ledger_entries / financial_entitlements | **0 / 0 / 0 / 0** (FREE) |
| notifications | 19 → **22** (+3 in-app result-related notifications — observed) |
| audit_logs | `match.result.submitted` + `TOURNAMENT.RECORD_RESULT` (entity match_result_records 6) |
| real users / real orgs / permissions / migration | 28 / 17 / 971 / 201 — **unchanged** (only TEST-scoped data) |

## Note on lifecycle
Submission leaves the record in `pending_confirmation` and does NOT by itself complete the match or compute standings — those belong to the later accept/complete phase (NOT executed, per scope). Tournament 4 was not touched.

## Verdict
```
T-RES-01: PASS

HTTP 201 · POST /org/35/tournaments/matches/2/result
Tournament ID: 5 · Tournament Match ID: 2 · Public Match ID: 15 · Registration IDs: 5, 6
Result ID: 6 · outcome completed · score 2–1 (homeGoals 2 / awayGoals 1) · winner derived = home (TEST_PLAYER2 134)
submission_status: pending_confirmation · no duplicate · standings 0 (later step)
Financial 0/0/0/0 · Notifications +3 (observed) · Audit logged · Real-data unchanged
```
Stopped after T-RES-01 — no ACCEPT/COMPLETE (separate later step per lifecycle), no cleanup, no other test. Awaiting your instruction.