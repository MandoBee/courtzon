# 65 — T-RES-PRE RESULT SCENARIO (new TEST tournament design — READ-ONLY)

**Analyzed:** 2026-10-05 · **Target:** Production `187.127.72.93:3307 / courtzon_v3` (read-only; nothing created)

---

## 1. Objective
Design a NEW separate TEST tournament whose match window can genuinely elapse so that `T-RES` (result submission) can be executed via the supported API **after** `end_time` — without modifying Tournament 4, without SQL time changes, without changing the system clock, and without bypassing business rules.

## 2. Constraints discovered from code (verified)
- `submitMatchResult` (`match-result.service.ts:56-91`):
  - Rejects unless match started (`ELIGIBLE_MATCH_STATUSES`) and `context.playedAt` exists (session started).
  - **Rejects if `Date.now() < context.endAtUtc`** — "match has not ended yet". `endAtUtc` = authoritative scheduled end (tournament match/booking end).
  - Has a 3-day submission window from `playedAt`.
  - Server derives winner from the rules engine; `winner` client-side only for walkover/forfeit.
- `normaliseSchedule` (`tournament.service.ts:561-608`): NO "start must be in the future" rule. Only: `registration_closes < start_date` (if closes set) and daily-window consistency (both/neither; start<end; within branch hours — branch 21 hours NULL → no constraint).
- `scheduleMatch` window check: `assertDateInWindow(t, date)` → date must be within `[start_date, end_date]`; with `end_date NULL` the only meaningful constraint is `date >= start_date`. No "cannot schedule past time-of-day" guard found; availability comes from court reservation (our own court test).
- Playable-matches bridge confirmed: generate → (schedule) → referee assign → `start` (creates session, sets playedAt/`in_progress`) → result submit accepted only after the scheduled end.

## 3. Proposed scenario (via supported APIs only — EXECUTED IN LATER STEPS, not now)
Create a new FREE tournament on TEST_ORG 35 (Tournament 4 remains untouched):

| Step | API (real) | Note |
|---|---|---|
| create | `POST /org/35/tournaments` | start_date = **today** (allowed), FREE, sport 19, bracket 1 (knockout), branch 21, `match_format_id` recommended (see risks) |
| publish | `POST /org/35/tournaments/:id/publish` | status published |
| open-reg | `POST /org/35/tournaments/:id/open-reg` | registration_open |
| register ×2 | `POST /tournaments/:id/register` | TEST_PLAYER 133 + TEST_PLAYER2 134 (multi-tournament participation is allowed — uniqueness is per tournament) |
| draw | `POST /org/35/tournaments/:id/draw` → approve → lock | 2 participants → 1 match |
| generate matches | `POST /org/35/tournaments/:id/matches/generate` | tournament_match created |
| schedule | `POST /org/35/tournaments/:id/matches/:matchId/schedule` | date = today, start/end shortly after execution (below) |
| assign referee | `PUT /org/35/tournaments/matches/:matchId/referee` | TEST_REFEREE 132 |
| start | `POST /org/35/tournaments/matches/:matchId/start` | session created, playedAt set, in_progress |
| **wait** | — | until real time ≥ scheduled end |
| submit result | `POST /org/35/tournaments/matches/:matchId/result` | `{"outcome":"completed","score":{"homeGoals":X,"awayGoals":Y}}` (X>Y) |
| (later) | accept/complete/standings per future steps | — |

## 4. Proposed timing values (example for execution ~01:10 UTC; recompute at execution)
- `start_date` = **2026-10-05** (today)
- schedule `date` = **2026-10-05**
- `start_time` = **01:20** · `end_time` = **01:50** (UTC; branch TZ NULL → UTC)
- ⇒ At T-RES execution after **01:50** UTC, `Date.now() ≥ endAtUtc` → submission allowed.
- Submissions must occur within 3 days of `playedAt`.

## 5. Proposed identity/master values
| Item | Value |
|---|---|
| Tournament name | `TEST_TOURNAMENT_RESULT_01` |
| sport | 19 (Football) |
| format / bracket | knockout / bracket_type 1 (Single Elimination) |
| match_format_id | **3 (Football 11v11)** — recommended so the rules engine can validate goals; rule_set to confirm at execution (sport_rule_sets; choose the Football 11v11 rule set if present) |
| players | TEST_PLAYER 133 · TEST_PLAYER2 134 |
| referee | TEST_REFEREE 132 |
| court | resource 6 (TEST_COURT_1) |
| price | FREE (payments/invoices/ledger/entitlements remain 0) |
| org/branch | org 35 · branch 21 |

## 6. Dependency order (for the later execution steps)
create → publish → open-reg → register(133) → register(134) → generate draw → approve → lock → generate matches → schedule → referee assign → start → (wait until end) → submit result → (verify) — strictly sequential; reuse the verified endpoints from the current pack docs (55–61).

## 7. Risks / limitations (recorded, not blockers)
- **Clock-gated by design:** the result may only be submitted after the scheduled end elapsed; the scenario therefore requires a short wait after `start` (acceptable; real time only).
- **Format/rule snapshot:** to keep the rules engine happy, explicitly set `match_format_id` (and rule_set) at create; if the engine still needs a sport-format/rule association, confirm with `GET /sports/19/formats` at execution (tournament 4 left format/rule NULL — worked for generation, but result validation is stricter).
- Multi-tournament registration of 133/134 is allowed (per-tournament uniqueness).
- A second FREE tournament on TEST_ORG adds no financial rows and does not touch real data (all TEST-scoped).
- No changes to Tournament 4 — it remains `in_progress` with its future window.

## 8. Confirmations
- **READ-ONLY:** this document is analysis only — no tournament, registration, draw, match, schedule, start, or result was created; no DB/code/schema/migration/config change; Tournament 4 untouched.
- No cleanup performed.

---

```
T-RES-PRE: READY
```
(The proposed scenario is achievable entirely through the real supported APIs; the only inherent constraint is that result submission must wait until the scheduled end time has elapsed — by design.)