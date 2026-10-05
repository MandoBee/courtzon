# 60 — T-REF-01 RESULT (Assign Referee — tournament_match 1)

**Executed:** 2026-10-05 ~00:2x UTC · **Target:** Production `187.127.72.93:3307 / courtzon_v3`
**Actor:** TEST_ADMIN (user 127 / org 35) · **Tournament 4 · tournament_match id 1** · **TEST_REFEREE user 132**
**Scope:** T-REF-01 ONLY. No start/results/scheduling/cleanup.

---

## 1. Real API + ID semantics (extracted from code, verified)
- Route: `PUT /org/:orgId/tournaments/matches/:matchId/referee` — guard `requireOrgScopedPermission('org.tournaments.manage')`.
- Controller → `tournamentService.assignReferee(Number(matchId), body.referee_id)` where **`:matchId` = tournament_matches.id (1)** and **`referee_id` = `referees.id`** (resolved via the referees profile; TEST_REFEREE = `referees.id 1` for user 132).

## 2. Request / Response (actual, credentials redacted)
Request: `PUT https://api.courtzon.cloud/org/35/tournaments/matches/1/referee` — body `{"referee_id":1}`
Response: **HTTP 200** `{"ok":true}`

## 3. DB verification (direct)
| Check | Actual | Status |
|---|---|---|
| tournament_matches id 1 | referee_id **1** · status scheduled · resource 6 · start 10:00 (unchanged) | ✅ |
| referee link | referees id 1 → user **132**, status `approved` | ✅ |
| duplicate referee assignment | 0 (per tournament) | ✅ |
| booking 31 | unchanged: resource 6 · 10:00–11:30 · confirmed · payment pending | ✅ |
| draw 1 | `locked` · is_current 1 (unchanged) | ✅ |
| registrations / participants | 2 / 2 (unchanged) | ✅ |
| payments / invoices / ledger_entries / financial_entitlements | 0 / 0 / 0 / 0 (FREE) | ✅ |
| notifications | 19 (unchanged — no new in-app row) | OBSERVED |
| audit_logs | `TOURNAMENT.ASSIGN_REFEREE` present | ✅ |
| real users / real orgs / permissions / migration | 28 / 17 / 971 / 201 (unchanged) | ✅ |

## 4. Verdict
```
T-REF-01: PASS

HTTP 200 {"ok":true}
tournament_match 1 → referee_id 1 (referees.id 1 → user 132, approved)
No duplicate assignment · Booking 31 / Draw 1 / participants unchanged
Financial 0/0/0/0 · Audit ASSIGN_REFEREE · Real data unchanged
```

Stopped after T-REF-01. No match start, no results, no cleanup, no further test.