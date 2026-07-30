---
document_id: "TECH-MOD-06"
document_name: "Leagues Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-05"]
  related: ["TECH-MOD-04", "TECH-MOD-26"]
---

# Leagues Module (TECH-MOD-06)

**Source:** `backend/src/modules/leagues/` (5 entries: domain/, application/, infrastructure/, presentation/, index.ts)

## 1. Purpose

Seasonal league management: seasons, leagues, divisions, teams, fixtures, matches, results, standings, player statistics, promotion/relegation. Dual admin and player-facing endpoints. 42 routes, 100% permission-gated.

## 2. Architecture

```
domain/
  league.types.ts     — All attribute interfaces (168 lines)
  league-aggregate.ts — Aggregate logic
  lifecycle.ts        — Three state machines (74 lines)
application/
  (service layer)
infrastructure/
  (repositories)
presentation/
  league.routes.ts      — 42 endpoints (69 lines)
  league.controller.ts  — 1544 lines
  league.dto.ts         — Zod schemas
```

**Evidence:** `league.routes.ts` (69 lines) defines all routes. `domain/league.types.ts` (168 lines) defines all entity interfaces. `domain/lifecycle.ts` (74 lines) defines transitions.

## 3. Routes (42)

Defined in `league.routes.ts:9-69`:

**Dashboard (1):** `GET /admin/leagues/dashboard` (`league.dashboard.view`)

**Seasons (6):** List, create, get, update, publish, archive (`season.*` perms)

**Leagues CRUD (4):** list, create, get, update (`league.*` perms)

**League Status (7):** publish, open-reg, close-reg, start, complete, cancel, archive (`league.update`, `league.manage`, `league.delete`)

**Divisions (5):** list, create, update, promote, relegate (`league.view`, `league.manage`)

**Teams (4):** list, register, cancel, confirm (`league.view`, `league.manage`)

**Fixtures & Matches (5):** generate-fixtures, list matches, assign court, assign referee, record result (`league.manage`, `league.result.manage`)

**Standings (2):** get standings, recalculate (`league.view`, `league.manage`)

**Statistics (2):** get player stats, recalculate (`league.view`, `league.manage`)

**Player-facing (6):** list public leagues, get league, standings, teams, my leagues, register team

## 4. Permissions

`season.view`, `season.create`, `season.update`, `season.publish`, `season.delete`
`league.view`, `league.create`, `league.update`, `league.manage`, `league.delete`, `league.dashboard.view`, `league.result.manage`

## 5. Entities

**Season:** `code, name, sport_id, start_date, end_date, status` (5 statuses)
**League:** `season_id, code, name, sport_id, format, max_teams, registration_fee, price_type, status` (7 statuses)
**Division:** `league_id, name, tier, capacity, advance_count, relegation_count, status`
**Team:** `division_id, team_name, captain_id, player_ids, status, waiting_order, seed`
**Match:** `division_id, home_team_id, away_team_id, round, match_date, court_id, referee_id, status`
**Result:** `match_id, home_score, away_score, winner_team_id, result_status, entered_by`
**Standing:** `division_id, team_id, played, wins, draws, losses, goals_for, goals_against, goal_difference, points, position, form`
**Player Stat:** `season_id, player_id, appearances, goals, assists, clean_sheets, yellow_cards, red_cards, minutes_played`

**Evidence:** Full definitions in `league.types.ts:1-168`.

## 6. State Machines

**Season** (`lifecycle.ts:5-11`):
```
draft → published → running → completed → archived
```

**League** (`lifecycle.ts:13-21`):
```
draft → registration_open → registration_closed → running → completed | cancelled → archived
```

**Team Registration** (`lifecycle.ts:23-29`):
```
pending → confirmed | waiting | cancelled | withdrawn
waiting → confirmed | cancelled | withdrawn
confirmed → cancelled | withdrawn
cancelled → (terminal)
withdrawn → (terminal)
```

**Match status:** `scheduled | in_progress | completed | cancelled | walkover`
**Result status:** `submitted | confirmed | disputed`

**Evidence:** Full source at `domain/lifecycle.ts` lines 5-29.

## 7. Promotion / Relegation

Division entities have `advance_count` and `relegation_count` fields. The promote/relegate endpoints (`POST /admin/divisions/:id/promote`, `POST /admin/divisions/:id/relegate`) move teams between divisions.

## 8. Events

- `league:season_created` / `league:season_published`
- `league:league_created` / `league:status_changed`
- `league:team_registered` / `league:team_confirmed`
- `league:fixtures_generated`
- `league:match_result_recorded`
- `league:standings_recalculated`
- `league:team_promoted` / `league:team_relegated`

## 9. Audit Events

All state-changing operations record audit logs via `recordAudit()` in controller.
