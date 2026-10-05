# 61 — T-START-01 RESULT (Start Tournament Match)

**Executed:** 2026-10-05 00:32 UTC · **Target:** Production `187.127.72.93:3307 / courtzon_v3`
**Actor:** TEST_ADMIN (user 127 / org 35) · **Tournament 4 · tournament_match id 1 · public match id 14**
**Scope:** T-START-01 ONLY. No results/accept/complete, no cleanup, no re-run of any earlier step.

---

## 1. Real API (extracted from code — no guessing)
`POST /org/:orgId/tournaments/matches/:matchId/start` — guard `requireOrgScopedPermission('org.tournaments.manage')`; `:matchId` = `tournament_matches.id` (**1**). Controller → `tournamentService.startTournamentMatch(matchId, userId)` (bridges to the shared match-session lifecycle: `matchService.startMatch(14)`, creates `match_sessions`, sets shared match & bracket slot to `in_progress`).

## 2. Request / Response (actual, credentials redacted)
Request: `POST https://api.courtzon.cloud/org/35/tournaments/matches/1/start` — body `{}`
Response: **HTTP 200** `{"ok":true,"status":"in_progress"}`

## 3. DB verification (direct)
| Check | Actual | Status |
|---|---|---|
| tournament_match 1 → before / after | scheduled → **in_progress** (referee 1, resource 6 unchanged) | ✅ |
| public match 14 | **in_progress** (consistent with tournament_match) | ✅ |
| match_sessions | **1** row: id 6 · match 14 · started_at set · ended_at NULL | ✅ (no duplicate session) |
| bookings | total **1** (no new booking) · booking 31 unchanged (resource 6, confirmed, payment pending) | ✅ |
| draw 1 | `locked` · is_current 1 (unchanged) | ✅ |
| referee / participants | referee 1 unchanged · registrations 2 · participants 2 | ✅ |
| payments / invoices / ledger_entries / financial_entitlements | 0 / 0 / 0 / 0 (FREE) | ✅ |
| notifications | 19 (unchanged — OBSERVED) | OBSERVED |
| audit_logs | `TOURNAMENT.START_MATCH` + `tournament.match.started` present | ✅ |
| real users / real orgs / permissions / migration | 28 / 17 / 971 / 201 (unchanged) | ✅ |

## 4. Verdict
```
T-START-01: PASS

HTTP 200 · POST /org/35/tournaments/matches/1/start
Tournament Match ID: 1 · Public Match ID: 14
Before: scheduled → After: in_progress (both rows)
DB: match_sessions 1 (id 6) · booking 31 + draw 1 + referee/participants unchanged · financial 0/0/0/0
Notifications 19 (OBSERVED) · Real-data isolation OK
```

Stopped after T-START-01. No T-RES/accept/complete, no cleanup, no other test executed.