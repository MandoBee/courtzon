# 66 — T-RES-01 RESULT (New-tournament result scenario) — FAILED at scheduling

**Executed:** 2026-10-05 01:24 UTC · **Target:** Production `187.127.72.93:3307 / courtzon_v3`
**Actor:** TEST_ADMIN (127) + TEST_PLAYER 133/134 · **New tournament id 5 (TEST_TOURNAMENT_RESULT_01)** — Tournament 4 untouched.
**Scope:** per `65_TRES_PRE_RESULT_SCENARIO.md`. Failure rule applied → stopped immediately; no retry/fix/cleanup.

---

## 1. Steps executed (via real APIs only)
| Step | Result |
|---|---|
| create (FREE · sport 19 · knockout/bracket 1 · match_format 3 · rule_set 3 · branch 21 · start 2026-10-05) | **201 – tournament id 5** (draft) |
| publish / open-reg | **200 / 200** (status registration_open) |
| register TEST_PLAYER 133 · TEST_PLAYER2 134 | **201 / 201** (registration ids **5**, **6**) |
| draw → approve → lock | **200 / 200 / 200** (draw id **2**, locked, current) |
| generate matches | **201** → `{generated:1, byes:0, draws:1}` (tournament_match id **2** ↔ public match id **15**) |
| schedule (date 2026-10-05 · 01:32–02:05 · resource 6) | **FAIL 409** (stopped here) |
| referee assign / start / result | NOT executed |

## 2. Failure details
- Endpoint: `POST /org/35/tournaments/5/matches/2/schedule` — payload `{"date":"2026-10-05","start_time":"01:32","end_time":"02:05","resource_id":6}`
- Response: **HTTP 409** `{"error":"CONFLICT","message":"Booking range does not cover any complete slot","meta":{"requestId":"b5536961-fa0f-45e2-a34b-d468edc1e595",...}}`
- **OBSERVED cause (test-side timing, no retry):** the court-reservation engine requires the requested range to cover at least one **complete slot** (slot-duration/alignment constraint — consistent with the earlier 60-minute-style reservation model). A non-aligned 33-minute window (01:32–02:05) covers no complete slot. This is a **scenario-timing error**, not an application defect; an hour-aligned window (e.g., 01:00–02:00) would satisfy it on a future approved run.

## 3. DB verification (read-only — no unintended changes)
| Item | State |
|---|---|
| tournament 5 | registration_open · start 2026-10-05 (created test data) |
| registrations | ids 5 (player 133), 6 (player 134) — registered |
| draw 2 | locked · current |
| tournament_match 2 / match 15 | `scheduled` · resource NULL · times NULL (schedule did NOT persist) |
| bookings total | **1** (unchanged — no new booking created) |
| match_sessions / result_records / standings | 0 / 0 / 0 |
| payments / invoices / ledger_entries / financial_entitlements | 0 / 0 / 0 / 0 (FREE) |
| real users / real orgs / permissions / migration | 28 / 17 / 971 / 201 (unchanged) |

## 4. Side effects
Only the intended TEST data of tournament 5 was created (tournament, registrations 5/6, draw 2 locked, match row); the failed schedule wrote nothing extra. No result, no financial rows, no real-data change. Tournament 4 untouched.

## 5. Verdict
```
T-RES-01: FAIL

HTTP 409 (CONFLICT) "Booking range does not cover any complete slot"
requestId: b5536961-fa0f-45e2-a34b-d468edc1e595 · Endpoint: POST /org/35/tournaments/5/matches/2/schedule
Tournament ID: 5 · Match ID (tm): 2 · Public Match ID: 15 · Registrations: 5, 6
OBSERVED ROOT CAUSE (test-side timing): range must cover a complete slot (hour-alignment) — 01:32–02:05 covers none.
Stopped immediately: no retry, no referee/start/result, no cleanup, Tournament 4 untouched.
```

Stopped per the strict failure rule. Awaiting your decision (e.g., allow corrective re-scheduling with an hour-aligned window — e.g., 01:30?; exact aligned slot should be confirmed from the slot engine — as the single corrective change on the NEXT approved run).