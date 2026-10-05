# 51 — T-REG-01 RESULT (Tournament Registration attempt — Step 2)

**Executed:** 2026-10-05 ~22:2x UTC · **Target:** Production `187.127.72.93:3307 / courtzon_v3` · **Tournament ID 4** (`TEST_TOURNAMENT_T001`, org 35, status draft, FREE)
**Actor:** TEST_PLAYER (user 133) · **Mode:** single actual API attempt — NO state change, NO fix, NO other step.

---

## 1. Request (actual, credentials redacted)
`POST https://api.courtzon.cloud/org/35/tournaments/4/register` (authenticated as TEST_PLAYER 133)
Body: `{}` (FREE tournament — no payment method expected)

## 2. Response (actual, observed)
**HTTP 403**
```json
{"error":"FORBIDDEN","message":"Insufficient organisation permissions"}
```

**Observation:** the response is **NOT the anticipated 409 TOURNAMENT_REGISTRATION_CLOSED**. The route-level guard `requireOrganisationAccess` (org-scope check) short-circuits a player (who has NO organisation scope) **before** the business logic (`tournament.service.register`) is reached. The business guard (`status !== registration_open|published → 409`) never executes for this caller/route combination.

## 3. Code-based finding (read-only inspection — NOT executed)
The org-scoped route `POST /org/:orgId/tournaments/:id/register` is guarded by `requireOrganisationAccess('orgId')` → org staff only. The **player self-service registration route exists and is**: `POST /tournaments/:id/register` with permission `tournament.register` (`tournament.routes.ts:174`). Per `tournament.service.register` (line 1646), any register path will still reject a `draft` tournament with `409 TOURNAMENT_REGISTRATION_CLOSED` (only `registration_open` or `published` allowed), so the intended happy-path order (H2 publish/open-reg → H3 register) remains a requirement regardless of route.

## 4. DB verification (direct, after the attempt)
| Check | Expected | Actual | Status |
|---|---|---|---|
| tournament 4 status | unchanged | draft | ✅ unchanged |
| tournament_registrations | 0 | 0 | ✅ no INSERT |
| tournament_participants | 0 | 0 | ✅ |
| payment_transactions / invoices | 0 | 0 | ✅ no payment created |
| ledger_entries / financial_entitlements | 0 | 0 | ✅ no accounting |
| notifications | unchanged | 18 | ✅ |
| tournaments total | 1 | 1 | ✅ |

## 5. Real-data protection (unchanged)
Real users 28 · real organisations (≠35/36) 17 · permissions 971 · migration_history 201 — all unchanged. (Authentication side effect only: TEST_PLAYER gained 2 `user_sessions` rows from the login used to run this attempt — auth state, not business data.)

## 6. Notifications / realtime
None observed (no business mutation occurred; no registration/notification rows added).

## 7. Verdict (OBSERVED RESULT — decision left to the team)
```
T-REG-01: OBSERVED RESULT = HTTP 403 (org route guard blocks player; business 409 NOT reached)

DB: unchanged · no payment/invoice/ledger/entitlement · real data unchanged
```

Not self-assessed as PASS or FAIL. Two readings for the team to decide:
1. **Guard is correct** — T-REG-01 must use the player route `POST /tournaments/:id/register` (with the tournament first moved to `published`/`registration_open` by a permitted actor), OR
2. **Workflow gap surfaced** — the pack step assumed player registration through the org route; the actual player-facing path differs and the tournament lifecycle prerequisite (H2) must be executed before registration.

No fix applied, tournament state untouched, no other step executed. Awaiting your decision (e.g., authorize the player route attempt on the pre-opened tournament, or treat this as a test-pack adjustment).