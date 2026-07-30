---
document_id: "TECH-MOD-05"
document_name: "Tournaments Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-04"]
  related: ["TECH-MOD-06", "TECH-MOD-26"]
---

# Tournaments Module (TECH-MOD-05)

**Source:** `backend/src/modules/tournaments/` (6 entries: domain/, application/, infrastructure/, presentation/, index.ts, __tests__/)

## 1. Purpose

Tournament management: creation, registration, bracket generation, group stage, match results, standings. Supports multiple formats (knockout, double elimination, round robin, swiss, group stage knockout, league, custom). 31 routes, 100% permission-gated.

## 2. Architecture

```
domain/
  lifecycle.ts              — Two state machines (tournament + registration)
  tournament-aggregate.ts   — Types, bracket generation, standings (209 lines)
application/
  (service layer)
infrastructure/
  (repositories)
presentation/
  tournament.routes.ts      — 31 endpoints (50 lines)
  tournament.controller.ts  — Request handlers
  tournament.dto.ts         — Zod schemas
```

**Evidence:** `tournament.routes.ts` (50 lines), `domain/lifecycle.ts` (52 lines), `domain/tournament-aggregate.ts` (209 lines).

## 3. Routes (31)

Defined in `tournament.routes.ts:10-50`:

**Admin (24):**
- `GET /admin/tournaments/dashboard` — Dashboard (`tournament.dashboard.view`)
- `GET /admin/tournaments` — List (`tournament.view`)
- `POST /admin/tournaments` — Create (`tournament.create`)
- `GET /admin/tournaments/:id` — Get (`tournament.view`)
- `PUT /admin/tournaments/:id` — Update (`tournament.update`)
- `POST /admin/tournaments/:id/publish` — Publish (`tournament.publish`)
- `POST /admin/tournaments/:id/open-reg` — Open reg (`tournament.update`)
- `POST /admin/tournaments/:id/close-reg` — Close reg (`tournament.update`)
- `POST /admin/tournaments/:id/start` — Start (`tournament.update`)
- `POST /admin/tournaments/:id/complete` — Complete (`tournament.update`)
- `POST /admin/tournaments/:id/cancel` — Cancel (`tournament.update`)
- `POST /admin/tournaments/:id/archive` — Archive (`tournament.delete`)
- `POST /admin/tournaments/:id/register` — Register participant (`tournament.register`)
- `POST /admin/tournaments/registrations/:regId/cancel` — Cancel reg (`tournament.register`)
- `POST /admin/tournaments/registrations/:regId/confirm` — Confirm reg (`tournament.register`)
- `POST /admin/tournaments/:id/generate-groups` — Groups (`tournament.manage`)
- `POST /admin/tournaments/:id/generate-fixtures` — Fixtures (`tournament.manage`)
- `POST /admin/tournaments/:id/generate-bracket` — Bracket (`tournament.manage`)
- `GET /admin/tournaments/:id/groups` — Get groups (`tournament.view`)
- `GET /admin/tournaments/:id/matches` — Get matches (`tournament.view`)
- `GET /admin/tournaments/:id/standings` — Get standings (`tournament.view`)
- `PUT /admin/tournaments/matches/:matchId/court` — Assign court (`tournament.manage`)
- `PUT /admin/tournaments/matches/:matchId/referee` — Assign referee (`tournament.manage`)
- `POST /admin/tournaments/matches/:matchId/result` — Record result (`tournament.result.manage`)

**Player-facing (7):**
- `GET /tournaments` — List public (`tournament.view`)
- `GET /tournaments/:id` — Get public (`tournament.view`)
- `GET /tournaments/:id/bracket` — Bracket view (`tournament.view`)
- `GET /tournaments/:id/standings` — Standings (`tournament.view`)
- `GET /tournaments/:id/matches` — Matches (`tournament.view`)
- `GET /tournaments/:id/participants` — Participants (`tournament.view`)
- `POST /tournaments/:id/register` — Player self-register (`tournament.register`)

## 4. Permissions

`tournament.create`, `tournament.view`, `tournament.update`, `tournament.delete`, `tournament.publish`, `tournament.register`, `tournament.manage`, `tournament.result.manage`, `tournament.dashboard.view`

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Tournament | `tournaments` | `id, code, name, format, status, sport_id, registration_type, max_players, max_teams, registration_fee` |
| Registration | `tournament_registrations` | `id, tournament_id, user_id, team_id, seed, status, waiting_order` |
| Match | `tournament_matches` | `id, tournament_id, round, group_id, bracket_position, player1_id, player2_id, winner_id, status, court_id, referee_id` |
| Match Result | `tournament_match_results` | `id, match_id, winner_id, home_score, away_score, entered_by` |
| Group | `tournament_groups` | `id, tournament_id, name, advance_count` |
| Standing | `tournament_standings` | `id, tournament_id, registration_id, player_id, points, wins, losses, position` |

## 6. State Machine

**Tournament status** (`lifecycle.ts:5-14`, 8 states):
```
draft → published
published → registration_open
registration_open → registration_closed
registration_closed → running
running → completed | cancelled
completed → archived
cancelled → archived
archived → (terminal)
```

**Registration status** (`lifecycle.ts:16-22`, 5 states):
```
pending → confirmed | waiting | cancelled
waiting → confirmed | cancelled
confirmed → cancelled | completed
cancelled → (terminal)
completed → (terminal)
```

**Match status** (`tournament-aggregate.ts:13`):
`scheduled | in_progress | completed | walkover | forfeit | no_show`

**Evidence:** Full state transition definitions in `lifecycle.ts`. Tournament types defined in `tournament-aggregate.ts:7-13`.

## 7. Bracket Generation

`tournament-aggregate.ts:137-157` — `generateKnockoutBracket()`: creates a bracket tree from participant list, pads to next power of 2, generates all rounds.

`tournament-aggregate.ts:159-170` — `generateRoundRobinMatches()`: creates all-vs-all matches.

`tournament-aggregate.ts:172-209` — `computeStandings()`: calculates points (3 per win), sorts by points then goal difference.

## 8. Events

- `tournament:created` / `tournament:published` / `tournament:started` / `tournament:completed`
- `tournament:registration_opened` / `tournament:registration_closed`
- `tournament:player_registered` / `tournament:registration_confirmed`
- `tournament:match_result_recorded`
- `tournament:bracket_generated`

## 9. Audit Events

All state-changing operations record audit logs via `recordAudit()` in the controller.
