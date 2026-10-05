# 54 — T-REG-02 RESULT (TEST_PLAYER2 Registration)

**Executed:** 2026-10-05 ~23:07 UTC · **Target:** Production `187.127.72.93:3307 / courtzon_v3`
**Actor:** TEST_PLAYER2 (user 134) · **Tournament ID 4** (registration_open, FREE)
**Scope:** T-REG-02 ONLY. No draw/seed/scheduling/matches/results/cleanup; no code/schema/migration/config change.

---

## 1. Request (actual, credentials redacted)
`POST https://api.courtzon.cloud/tournaments/4/register` (authenticated as TEST_PLAYER2, user 134)
Body: `{}` (FREE)

## 2. Response (actual)
**HTTP 201**
```json
{ "id": 4, "tournament_id": 4, "competition_id": 4, "player_id": 134, "seed_rank": 2,
  "payment_status": "unpaid", "status": "registered", "eligibility_snapshot": { "eligible": true }, "payment": null }
```

## 3. Registration / Participant IDs
- **Registration ID = 4** (player 134)
- **Participant ID = 4** (auto-materialized, individual, active)

## 4. DB verification (direct)
| Check | Actual | Status |
|---|---|---|
| registrations count | **2** (id 3 → player 133 · id 4 → player 134; each once) | ✅ |
| participants count | **2** (id 3 → reg 3 · id 4 → reg 4, individual/active) | ✅ |
| player 133 still has exactly 1 reg + 1 participant | reg 3 / part 3 | ✅ |
| duplicates | 0 (GROUP BY player_id → none >1) | ✅ |
| tournament 4 status | registration_open (unchanged) | ✅ |

## 5. Financial verification (FREE)
payments **0** · invoices **0** · ledger_entries **0** · financial_entitlements **0** — ✅

## 6. Notifications / Realtime
- notifications **18 (unchanged)** — no in-app row created by registration (OBSERVED).
- Socket.IO: no connected client at request time → delivery not observable (OBSERVED, not FAIL).

## 7. Real-data protection (unchanged)
Real users 28 · real organisations (≠35/36) 17 · permissions 971 · migration_history 201 — all unchanged.

## 8. Verdict
```
T-REG-02: PASS
Registration ID: 4
Participant ID: 4

(pair complete: TEST_PLAYER 133 reg/part 3, TEST_PLAYER2 134 reg/part 4 — FREE/unpaid, no duplicates)
```
Stopped after T-REG-02 as instructed. No draw/seed/scheduling/matches/results/cleanup; awaiting your instruction.