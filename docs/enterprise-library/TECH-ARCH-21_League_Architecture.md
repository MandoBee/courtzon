---
document_id: "TECH-ARCH-21"
document_name: "League Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 30
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-MOD-06", "TECH-DB-03", "TECH-MOD-26"]
  related: ["TECH-MOD-04", "TECH-MOD-05"]
---

# League Architecture (TECH-ARCH-21)

**Source:** `backend/src/modules/leagues/` (18 files: domain/ (3), application/ (7), infrastructure/repositories/ (6), presentation/ (2), index.ts)

## 1. Purpose

Seasonal league management module — handles seasons, leagues, tiered divisions, team registration, round-robin fixture generation, match results, standings with form tracking, player/team statistics, and promotion/relegation. 42 admin routes + player-facing routes.

## 2. Domain Model

### Entity Relationships

```
Season (1) ──── (N) League
                   │
                   └──── (N) LeagueDivision
                            │
                            ├──── (N) LeagueTeam
                            │
                            ├──── (N) LeagueMatch ──── (1) LeagueResult
                            │
                            ├──── (N) LeagueStanding
                            │
                            ├──── (N) PlayerStat
                            │
                            └──── (N) TeamStat
```

### Entity Definitions

**Source:** `domain/league.types.ts:1-168`

#### SeasonAttributes
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `code` | string | Unique code |
| `name` | string | Display name |
| `description` | string? | Description |
| `sport_id` | number? | FK to `sports` |
| `start_date` | string | Season start |
| `end_date` | string? | Season end |
| `status` | SeasonStatus | `draft` \| `published` \| `running` \| `completed` \| `archived` |
| `created_at / updated_at` | string | Audit timestamps |

#### LeagueAttributes
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `season_id` | number | FK to `seasons` |
| `code` | string | Unique code |
| `name` | string | Display name |
| `description` | string? | Description |
| `sport_id` | number? | FK to `sports` |
| `format` | LeagueFormat | `round_robin` \| `double_round_robin` |
| `max_teams` | number | Capacity (0 = unlimited) |
| `registration_fee` | number | Fee |
| `price_type` | 'FREE' \| 'FIXED' \| 'MEMBERS_ONLY' | Pricing |
| `currency` | string | ISO 4217 |
| `status` | LeagueStatus | Lifecycle state |
| `is_public` | boolean | Visibility |
| `points_per_win` | number | Points for win (default 3) |
| `points_per_draw` | number | Points for draw (default 1) |
| `archived_at` | string? | Archive timestamp |

#### LeagueDivisionAttributes
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `league_id` | number | FK |
| `name` | string | Division name |
| `tier` | number | Numeric tier (1=highest) |
| `capacity` | number | Team capacity |
| `advance_count` | number | Teams promoted per season |
| `relegation_count` | number | Teams relegated per season |
| `status` | 'active' \| 'inactive' \| 'archived' | Division status |
| `created_at` | string | Timestamp |

#### LeagueTeamAttributes
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `division_id` | number | FK |
| `team_name` | string | Team display name |
| `captain_id` | number? | FK to `users` |
| `player_ids` | number[]? | JSON array of player IDs |
| `status` | TeamRegistrationStatus | `pending` \| `confirmed` \| `waiting` \| `cancelled` \| `withdrawn` |
| `waiting_order` | number? | Waiting list position |
| `seed` | number? | Seeding position |
| `registered_at` | string | Registration timestamp |

#### LeagueMatchAttributes
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `division_id` | number | FK |
| `home_team_id` | number | Home team |
| `away_team_id` | number | Away team |
| `round` | number | Round number |
| `match_date` | string? | Scheduled date |
| `start_time / end_time` | string? | Scheduled times |
| `court_id` | number? | FK to `resources` |
| `referee_id` | number? | FK to `users` |
| `status` | LeagueMatchStatus | `scheduled` \| `in_progress` \| `completed` \| `cancelled` \| `walkover` |

#### LeagueResultAttributes
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `match_id` | number | FK (1:1) |
| `home_score / away_score` | string? | Scores (stored as string for flexibility) |
| `winner_team_id` | number? | Winner reference |
| `result_status` | ResultStatus | `submitted` \| `confirmed` \| `disputed` |
| `entered_by` | number | User who entered |
| `confirmed_at` | string? | Confirmation timestamp |
| `created_at` | string | Timestamp |

#### LeagueStandingAttributes
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `division_id` | number | FK |
| `team_id` | number | FK to `league_teams` |
| `played` | number | Matches played |
| `wins / draws / losses` | number | Record |
| `goals_for / goals_against` | number | Goal counts |
| `goal_difference` | number | GF - GA |
| `points` | number | Calculated (W*points_per_win + D*points_per_draw) |
| `position` | number? | Rank |
| `form` | string[]? | Last 5 results (W/D/L) |
| `created_at / updated_at` | string | Audit timestamps |

#### PlayerStatAttributes
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `season_id` | number | FK |
| `player_id` | number | FK to `users` |
| `team_id` | number? | FK |
| `division_id` | number? | FK |
| `appearances / goals / assists / clean_sheets` | number | Core stats |
| `yellow_cards / red_cards` | number | Discipline |
| `minutes_played` | number | Playing time |
| `rating` | number? | Average rating |
| `stats_json` | Record<string, unknown>? | Sport-agnostic extension |

#### TeamStatAttributes
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `season_id` | number | FK |
| `team_id` | number | FK |
| `division_id` | number? | FK |
| `played / wins / draws / losses` | number | Record |
| `goals_for / goals_against` | number | Goal counts |
| `clean_sheets` | number | Shutouts |
| `home_record / away_record` | Record? | Split H/A breakdown |
| `stats_json` | Record<string, unknown>? | Sport-agnostic extension |

#### LeagueDashboard
| Field | Source |
|-------|--------|
| `total_leagues` | Count all |
| `open_registrations` | Status = registration_open |
| `running_leagues` | Status = running |
| `completed_leagues` | Status = completed |
| `total_teams` | Sum confirmed teams |
| `total_matches` | Count all matches |
| `completed_matches` | Status = completed |

## 3. State Machines

### 3.1 Season Lifecycle

**Source:** `domain/lifecycle.ts:5-11`

```
     ┌───────────┐
     │   Draft   │
     └─────┬─────┘
           │
           ▼
     ┌───────────┐
     │ Published │
     └─────┬─────┘
           │
           ▼
     ┌───────────┐
     │  Running  │
     └─────┬─────┘
           │
           ▼
     ┌───────────┐
     │ Completed │
     └─────┬─────┘
           │
           ▼
     ┌───────────┐
     │ Archived  │
     └───────────┘
```

**Transitions:**
```typescript
draft: ['published']
published: ['running']
running: ['completed']
completed: ['archived']
archived: []
```

### 3.2 League Lifecycle

**Source:** `domain/lifecycle.ts:13-21`

```
     ┌───────────┐
     │   Draft   │
     └─────┬─────┘
           │
           ▼
     ┌──────────────────┐
     │Registration Open │
     └────────┬─────────┘
              │
              ▼
     ┌──────────────────┐
     │Registration Closed│
     └────────┬─────────┘
              │
              ▼
     ┌───────────┐
     │  Running  │
     └─────┬─────┘
           │
     ┌─────┴─────┐
     ▼           ▼
  ┌─────────┐ ┌─────────┐
  │Completed│ │Cancelled│
  └────┬────┘ └────┬────┘
       │           │
       └─────┬─────┘
             ▼
        ┌─────────┐
        │Archived │
        └─────────┘
```

**Transitions:**
```typescript
draft: ['registration_open']
registration_open: ['registration_closed']
registration_closed: ['running']
running: ['completed', 'cancelled']
completed: ['archived']
cancelled: ['archived']
archived: []
```

**Convenience methods in `league.service.ts:53-59`:**
- `publish(id)` → `updateStatus(id, 'registration_open')`
- `openRegistration(id)` → `updateStatus(id, 'registration_open')`
- `closeRegistration(id)` → `updateStatus(id, 'registration_closed')`
- `start(id)` → `updateStatus(id, 'running')`
- `complete(id)` → `updateStatus(id, 'completed')`
- `cancel(id)` → `updateStatus(id, 'cancelled')`
- `archive(id)` → `updateStatus(id, 'archived')`

### 3.3 Team Registration Lifecycle

**Source:** `domain/lifecycle.ts:23-29`

```
     ┌──────────┐
     │ Pending  │
     └────┬─────┘
          │
     ┌────┴────┐
     ▼         ▼
  ┌───────┐ ┌────────┐
  │Confirmed│ │Waiting │
  └───┬───┘ └───┬────┘
      │         │
      ├─────────┘
      │
      ▼
  ┌───────────┐
  │ Withdrawn │
  └───────────┘

  ┌───────────┐
  │ Cancelled │
  └───────────┘
```

**Transitions:**
```typescript
pending: ['confirmed', 'waiting', 'cancelled', 'withdrawn']
waiting: ['confirmed', 'cancelled', 'withdrawn']
confirmed: ['cancelled', 'withdrawn']
cancelled: []
withdrawn: []
```

Note the additional `withdrawn` terminal state compared to academy enrollment (teams can withdraw during a running season).

## 4. Fixture Generation

### Round-Robin Algorithm

**Source:** `domain/league-aggregate.ts:7-47`

The `generateRoundRobinFixtures()` function implements the **circle method**:

1. If odd number of teams, add a dummy team (-1) for byes
2. Fixed first team, rotate others clockwise each round
3. Alternates home/away each round for fairness
4. For `doubleRoundRobin=true`, mirrors all fixtures with reversed home/away (total 2*(n-1) rounds)

**Example (4 teams, single round-robin):**

| Round | Match 1 | Match 2 |
|-------|---------|---------|
| 1 | T1 vs T2 | T3 vs T4 |
| 2 | T1 vs T4 | T2 vs T3 |
| 3 | T1 vs T3 | T4 vs T2 |

**Double round-robin** adds 3 more rounds with reversed home/away assignments.

**Integration in `fixture.service.ts:14-51`:**
1. Loads league and its active divisions
2. For each division, loads confirmed teams ordered by seed
3. Calls `generateRoundRobinFixtures(teamIds, doubleRoundRobin)`
4. Creates match records with `status: 'scheduled'`
5. Emits `fixtures.generated` event

## 5. Standings Calculation

### Persisted Standings

**Source:** `domain/league-aggregate.ts:49-138`, `standing.repository.ts`

The `computeLeagueStandings()` function:
1. Initializes stats for each team
2. For each completed match with a result:
   - Adds scores to GF/GA for home and away
   - Increments played count
   - Assigns W/L/D based on `winner_team_id`
   - Appends form string ('W', 'L', 'D')
3. Sorts by: points DESC, goal_difference DESC, goals_for DESC
4. Assigns position (1-based)
5. Form is truncated to last 5 entries

**Recalculation triggers:**
- Every match result recorded via `fixture.service.ts:65-129` (`recordResult()`) triggers `standingRepository.recalculateStandings()`
- Manual via `standing.service.ts:14-47` (`recalculate(divisionId)`)

### Form Tracking

The `form` column stores an array of `'W' | 'L' | 'D'` strings, truncated to the last 5 results. This drives the visual form indicator (e.g., "W-W-L-D-W") in the UI.

## 6. Division System & Promotion/Relegation

**Source:** `application/division.service.ts:1-76`

### Division Hierarchy

Divisions are **tiered** within a league:
- `tier: 1` = highest division
- `tier: 2` = second division
- Each division has `advance_count` and `relegation_count` parameters

### Promotion Logic (`promote()`)

1. Loads teams with standings for the source division
2. Sorts by position (ascending)
3. Takes the top N teams (where N = `teamCount` parameter)
4. Finds the next higher tier division within the same league
5. Moves promoted teams' `division_id` to the target division

### Relegation Logic (`relegate()`)

1. Loads teams with standings for the source division
2. Sorts by position (descending)
3. Takes the bottom N teams (where N = `teamCount` parameter)
4. Finds the next lower tier division within the same league
5. Moves relegated teams' `division_id` to the target division

**Error handling:** Throws `ConflictError` if no ranked teams found or if no adjacent tier division exists.

## 7. Player & Team Statistics

**Source:** `application/statistics.service.ts:1-196`

### Player Statistics (`recalculatePlayerStats()`)

For each team in a division:
1. Parses `player_ids` JSON array from `league_teams`
2. Iterates completed matches
3. Calculates: appearances, goals, assists, clean_sheets, yellow_cards, red_cards, minutes_played
4. Upserts into `player_statistics` table

**Sport-agnostic extension:** The `stats_json` column stores arbitrary JSON for sport-specific stats not covered by the fixed columns (e.g., aces in tennis, three-pointers in basketball).

### Team Statistics (`recalculateTeamStats()`)

For each team in a division:
1. Iterates completed matches
2. Calculates: played, wins, draws, losses, goals_for, goals_against, clean_sheets
3. Also computes split `home_record` and `away_record` (wins, draws, losses, gf, ga)
4. Upserts into `team_statistics` table

## 8. Application Layer

### Season Service (`application/season.service.ts:1-54`)

| Method | Description |
|--------|-------------|
| `create(data)` | Create with code uniqueness check, emits `season.created` |
| `list(filters)` | Paginated with search/status/sport filters |
| `getById(id)` | Single season lookup |
| `update(id, data)` | Partial update with code uniqueness |
| `updateStatus(id, status)` | Validated state transition |
| `publish(id)` | Draft → Published |
| `archive(id)` | Completed → Archived |

### League Service (`application/league.service.ts:1-159`)

| Method | Description |
|--------|-------------|
| `create(data)` | Create with code uniqueness, emits `league.created` |
| `list(filters)` | Paginated with search/status/sport/season/public filters |
| `getById(id)` | Single league lookup |
| `update(id, data)` | Partial update with code uniqueness |
| `updateStatus(id, status)` | Validated via `validateLeagueTransition()` |
| `publish / openRegistration / closeRegistration / start / complete / cancel / archive` | Convenience status methods |
| `getDashboard()` | Aggregate KPIs |
| `registerTeam(leagueId, teamName, ...)` | Team registration with division assignment, capacity check, auto-waiting |
| `cancelRegistration(teamId)` | Cancel with `validateTeamTransition()` |
| `confirmRegistration(teamId)` | Confirm + auto-promote next waiting |

### Fixture Service (`application/fixture.service.ts:1-132`)

| Method | Description |
|--------|-------------|
| `generateFixtures(leagueId)` | Round-robin generation per division |
| `assignCourt(matchId, courtId)` | Court assignment |
| `assignReferee(matchId, refereeId)` | Referee assignment |
| `recordResult(matchId, homeScore, awayScore, enteredBy)` | Result entry + standings recalculation |

### Division Service (`application/division.service.ts:1-76`)

| Method | Description |
|--------|-------------|
| `create(data)` | Create division |
| `update(id, data)` | Update division settings |
| `promote(divisionId, teamCount)` | Promote top N teams to higher tier |
| `relegate(divisionId, teamCount)` | Relegate bottom N teams to lower tier |

### Standing Service (`application/standing.service.ts:1-50`)

| Method | Description |
|--------|-------------|
| `getStandings(divisionId)` | Query persisted standings |
| `recalculate(divisionId)` | Full recalculation from all completed matches |

### Statistics Service (`application/statistics.service.ts:1-196`)

| Method | Description |
|--------|-------------|
| `getPlayerStats(filters)` | Query player statistics |
| `getTeamStats(filters)` | Query team statistics |
| `recalculatePlayerStats(divisionId)` | Recalculate all player stats |
| `recalculateTeamStats(divisionId)` | Recalculate all team stats |

## 9. Route Architecture

**Source:** `presentation/league.routes.ts:9-69` (42 routes)

### Admin Routes

| Group | Routes | Permissions |
|-------|--------|-------------|
| Dashboard | `GET /admin/leagues/dashboard` | `league.dashboard.view` |
| Seasons (6) | CRUD + publish, archive | `season.*` |
| Leagues (11) | CRUD + status transitions | `league.*` |
| Divisions (6) | CRUD + promote, relegate | `league.divisions.*` |
| Teams (6) | Register, confirm, cancel, withdraw | `league.teams.*` |
| Fixtures (2) | Generate, view | `league.fixtures.*` |
| Matches (4) | Assign court/referee, record result | `league.matches.*` |
| Standings (2) | View, recalculate | `league.standings.*` |
| Statistics (4) | View player/team, recalculate | `league.statistics.*` |

### Player Routes

| Route | Purpose | Permission |
|-------|---------|------------|
| `GET /player/leagues` | Public listing | None |
| `GET /player/leagues/:id` | League detail | None |
| `GET /player/leagues/:id/divisions` | Division listing | None |
| `GET /player/leagues/:id/standings` | Public standings | None |
| `GET /player/leagues/:id/fixtures` | Public fixtures | None |
| `POST /player/leagues/:id/register` | Team registration | Auth required |
| `GET /player/leagues/my` | My teams | Auth required |

## 10. Event Emissions

| Event | When | Payload |
|-------|------|---------|
| `season.created` | Season created | `{ seasonId, name }` |
| `league.created` | League created | `{ leagueId, name }` |
| `fixtures.generated` | Fixtures generated | `{ leagueId }` |
| `match.result.recorded` | Match result entered | `{ matchId, winnerTeamId }` |

**Evidence:** All source files at `backend/src/modules/leagues/`. Types at `domain/league.types.ts:1-168`. Lifecycle at `domain/lifecycle.ts:1-74`. Aggregate logic at `domain/league-aggregate.ts:1-138`. Services at `application/*.service.ts` (7 files, ~740 total lines). Repositories at `infrastructure/repositories/*.repository.ts` (6 files). DTOs at `presentation/league.dto.ts:1-108`.
