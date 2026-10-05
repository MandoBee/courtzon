# 53 — T-REG-01 RESULT (Player Registration — Tournament 4)

**Executed:** 2026-10-05 ~22:59 UTC · **Target:** Production `187.127.72.93:3307 / courtzon_v3`
**Actor:** TEST_PLAYER (user 133) · **Tournament ID 4** (`TEST_TOURNAMENT_T001`, org 35, registration_open, FREE)
**Scope:** T-REG-01 ONLY (player self-registration via the verified player route). No other step; no cleanup; no code/schema/migration/config change.

---

## 1. Request (actual, credentials redacted)
`POST https://api.courtzon.cloud/tournaments/4/register` (authenticated as TEST_PLAYER 133)
Body: `{}` (FREE — no payment required)

## 2. Response (actual)
**HTTP 201** — success
```json
{
  "id": 3,
  "tournament_id": 4,
  "competition_id": 4,
  "player_id": 133,
  "seed_rank": 1,
  "status": "registered",
  "payment_status": "unpaid",
  "eligibility_snapshot": { "eligible": true, "members": [ { "userId": 133, "eligible": true, "reasons": [], "bypassed": false } ] },
  "payment": null
}
```

## 3. Registration ID
**Registration ID = 3** (`tournament_registrations.id`). Participant auto-materialized with `participant_id = 3`.

## 4. DB verification (direct, read-only)
| Check | Actual | Status |
|---|---|---|
| tournament_registrations | **1** row: id 3 · tournament 4 · competition 4 · player 133 · status `registered` · payment_status `unpaid` | ✅ exactly once |
| duplicate | none (UNIQUE player/tournament/competition holds) | ✅ |
| tournament_participants | **1** row: id 3 · tournament 4 · registration 3 · participant_type `individual` · status `active` | ✅ auto-materialized |
| tournament 4 status | registration_open (unchanged) | ✅ |

## 5. Financial verification (FREE — must be zero)
payments **0** · invoices **0** · ledger_entries **0** · financial_entitlements **0** — ✅ no accounting/payment impact (as designed for FREE).

## 6. Notifications
`notifications` count = **18 (unchanged)** — no new in-app notification row was created by the registration (OBSERVED; the event bus `tournament:registration-paid`/registration event does not appear to produce an in-app row in this build — verified via DB).

## 7. Realtime / Socket.IO
No connected Socket.IO client was present during the request; server-side event delivery could not be observed (socket rooms/topics). **Documented as not-observable — NOT a failure** (to be verified in a dedicated two-window realtime test with a live client).

## 8. Real-data comparison (before/after — unchanged)
Real users **28** · real organisations (≠35/36) **17** · permissions **971** · migration_history **201** — all unchanged. (Auth side effect only: TEST_PLAYER gained user_sessions rows from logins.)

## 9. Single-link verification
TEST_PLAYER (133) is linked to Tournament 4 **exactly once** (`tournament_registrations` id 3; `tournament_participants` id 3). No duplicate.

## 10. Verdict
```
T-REG-01: PASS

Registration ID: 3
(tournament 4 · competition 4 · player 133 · status registered · FREE/unpaid)
DB: 1 registration + 1 participant, no duplicate
Financial: payments 0 / invoices 0 / ledger 0 / entitlements 0
Notifications: 18 (unchanged)
Realtime: no live client to observe (not a failure)
Real data: unchanged
```

**Stopped after T-REG-01.** TEST_PLAYER2 NOT registered; no draw/seed/scheduling/matches/results; no cleanup; awaiting your instruction.