# 50 — T-CREATE RESULT (Tournament FREE Happy Path — Step 1)

**Executed:** 2026-10-05 ~22:20 UTC · **Target:** Production `187.127.72.93:3307 / courtzon_v3` (post-cleanup/restore/TEST identities per 48)
**Scope:** ONLY `T-CREATE` from the Tournament Test Pack (`49`). No other step executed. No cleanup. Nothing else created.

---

## 1. Goal
Create the first TEST tournament (FREE price type) via the real application API on the TEST organisation, using only TEST_* identities, then verify DB isolation, real-data protection, and side effects.

## 2. Preconditions (verified)
- TEST_ADMIN user 127 (org-admin of TEST_ORG 35) authenticated via real login.
- TEST_ORG id 35 active+verified (owner 127), TEST_MAIN_BRANCH id 21, sport id 19 (Football), bracket type id 1 (Single Elimination), subscription plan 3 active (commission source).
- Feature flags ON (app.tournaments_enabled verified earlier).

## 3. Request (real API; credentials redacted)
`POST https://api.courtzon.cloud/org/35/tournaments` (authenticated as TEST_ADMIN 127)

```json
{
  "bracket_type_id": 1,
  "format": "knockout",
  "sport_id": 19,
  "name": "TEST_TOURNAMENT_T001",
  "max_participants": 4,
  "min_participants": 2,
  "entry_fee": 0,
  "price_type": "FREE",
  "currency_code": "EGP",
  "waitlist_enabled": false,
  "is_public": false,
  "start_date": "2026-10-10",
  "venue_type": "ORGANISATION_COURTS",
  "branch_id": 21
}
```
(organisation_id/tournament_type are server-injected, as designed.)

## 4. Response (real)
No error. `{ id: 4, name: "TEST_TOURNAMENT_T001", status: "draft", price_type: "FREE", organisation_id: 35 }`

## 5. DB verification (direct read-only)
| Table / field | Expected | Actual | Status |
|---|---|---|---|
| tournaments id=4 status | draft | draft | ✅ |
| price_type / entry_fee | FREE / 0.00 | FREE / 0.00 | ✅ |
| commission_rate | from plan (snapshot) | **20.00** | ✅ (derived server-side from org subscription) |
| currency_code | EGP | EGP | ✅ |
| organisation_id / branch_id | 35 / 21 | 35 / 21 | ✅ |
| sport_id / bracket_type_id / format | 19 / 1 / knockout | 19 / 1 / knockout | ✅ |
| is_public / start_date | false / 2026-10-10 | 0 / 2026-10-10 | ✅ |
| creator_id / deleted_at | 127 / NULL | 127 / NULL | ✅ |
| tournaments total | 1 (TEST only) | 1 | ✅ |
| tournament_competitions | 0 or default | **1** (default competition auto-created by create) | ✅ expected side effect |
| tournament_registrations / participants / matches / standings | 0 | 0 | ✅ |
| payment_transactions / ledger_entries / financial_entitlements | 0 (FREE ⇒ no accounting) | 0 | ✅ |
| notifications | unchanged | 18 (unchanged since identity creation — no new in-app row for create) | ✅ |

## 6. Isolation & real-data protection (unchanged — verified)
- Real users: 28 (no change) · Real organisations (≠35/36): 17 (no change) · permissions: 971 · global roles: 24 · migration_history: 201 · test org 35 still active.
- No KEEP/REVIEW/master data touched. No payments/ledger/entitlements created (as required for FREE creation).

## 7. Notifications / realtime
- No new in-app notification row was added for tournament creation (count unchanged at 18 — registration/identity side effects only). Socket.IO event `tournament:created` is emitted by the service (EventBus) but no client sessions exist to observe; flagged for Step 2+ realtime tests (no observable UI impact expected for create alone).

## 8. Actual result / root cause
- Result: creation succeeded on first attempt; no failure, so no root-cause analysis required.

## 9. Warnings
- `branch 21` has NULL opening/closing hours; daily-window times were intentionally omitted and validation passed.
- Default competition auto-created (tournament_competitions=1) — expected.

## 10. Verdict

```
T-CREATE: PASS

TOURNAMENT ID: 4
(name: TEST_TOURNAMENT_T001 · org 35 · status draft · FREE · EGP)
```

**Stopped after T-CREATE as instructed.** No registration (T-REG) or any further step executed; no cleanup executed; awaiting your go-ahead for the next step.