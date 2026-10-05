# 59 — T-SCHED-01 RETRY RESULT (Schedule tournament_match id 1 — approved single retry)

**Executed:** 2026-10-05 00:13 UTC · **Target:** Production `187.127.72.93:3307 / courtzon_v3`
**Actor:** TEST_ADMIN (user 127 / org 35) · **Tournament 4 · tournament_match id 1** (NOT matches.id 14)
**Decision:** human-approved single retry (previous attempt used the wrong identifier → 404; DB unchanged). No further retry.

---

## 1. Request (actual, credentials redacted)
`POST https://api.courtzon.cloud/org/35/tournaments/4/matches/1/schedule`
```json
{ "date": "2026-10-10", "start_time": "10:00", "end_time": "11:30", "resource_id": 6 }
```
(Payload per `ScheduleMatchSchema`; resource 6 pre-verified eligible via `matches/eligible-courts`.)

## 2. Response (actual)
**HTTP 200**
```json
{ "id":1, "tournament_id":4, "competition_id":4, "match_id":14, "round":1, "round_name":"Final", "match_number":1,
  "bracket_position":0, "player1_id":133, "player2_id":134, "resource_id":6, "start_time":"2026-10-10T10:00:00.000Z",
  "end_time":"2026-10-10T11:30:00.000Z", "status":"scheduled", "progression_state":"pending",
  "progression_meta":{ "is_final":1, "is_bracket":true, "target_side":"player1", ... }, "bookingId":31 }
```

## 3. DB verification (direct)
| Check | Actual | Status |
|---|---|---|
| tournament_matches id 1 | match_id 14 · resource_id 6 · start 2026-10-10 10:00 · end 11:30 · status `scheduled` · players 133/134 | ✅ |
| linked matches id | 14 | ✅ |
| bookings | **1** (id **31**): booking_type `tournament` · resource 6 · same window · booking_status confirmed · payment_status pending · org 35 | ✅ (non-financial court reservation) |
| double booking / duplicate schedule | slots for resource6@10:00 on 2026-10-10 = 1 row (the reservation itself); `dup_sched` (tournament_matches) = 0 | ✅ no double-booking |
| draw 1 | `locked` · is_current **1** (unchanged) | ✅ |
| participants | registrations 2 · participants 2 (unchanged) | ✅ |
| payments / invoices / ledger_entries / financial_entitlements | 0 / 0 / 0 / 0 (FREE) | ✅ |
| notifications | 19 (unchanged — no new in-app row) | OBSERVED |
| audit_logs | `TOURNAMENT.MATCH_SCHEDULED` row present | ✅ |
| real users / real orgs / permissions / migration | 28 / 17 / 971 / 201 (unchanged) | ✅ |

## 4. Verdict
```
T-SCHED-01 RETRY: PASS

HTTP 200
tournament_match id 1 scheduled on court 6 (2026-10-10 10:00–11:30, status scheduled) · booking id 31
No duplicates / no double-booking · Draw 1 locked+current · participants unchanged
Financial 0/0/0/0 · Audit MATCH_SCHEDULED · Real data unchanged
```

Stopped after T-SCHED-01 as instructed. No referee assignment, no match start, no results, no cleanup.