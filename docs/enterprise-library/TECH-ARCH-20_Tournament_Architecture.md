---
document_id: "TECH-ARCH-20"
document_name: "Tournament Architecture"
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
  references: ["TECH-MOD-05", "TECH-DB-03", "TECH-MOD-26"]
  related: ["TECH-MOD-04", "TECH-MOD-06"]
---

# Tournament Architecture (TECH-ARCH-20)

**Source:** `backend/src/modules/tournaments/` (8 files: domain/ (2), application/ (1), infrastructure/repositories/ (1), presentation/ (3), index.ts)

## 1. Purpose

Tournament management module — handles tournament creation, registration, bracket generation (knockout, round-robin, group-stage-knockout), match scheduling, court/referee assignment, result recording, and standings calculation. 31 admin routes + player-facing routes. Supports 7 tournament formats and 5 registration types.

## 2. Domain Model

### Entity Relationships

```
Tournament (1) ──── (N) TournamentRegistration
     │                      │
     ├──── (N) TournamentMatch ──── (N) TournamentMatchResult
     │            │
     │            └──── TournamentMatchScore (per-player)
     │
     ├──── (N) TournamentGroup
     │            │
     │            └──── (N) TournamentGroupMember
     │
     └──── (N) TournamentStandingRow
```

### Entity Definitions

**Source:** `domain/tournament-aggregate.ts:1-209`

#### Tournament
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `code` | string | Unique code |
| `name` | string | Display name |
| `description` | string? | Description |
| `format` | TournamentFormat | `knockout` \| `double_elimination` \| `round_robin` \| `swiss` \| `group_stage_knockout` \| `league` \| `custom` |
| `sport_id` | number | FK to `sports` |
| `organisation_id` | number? | Org owner |
| `branch_id` | number? | Branch host |
| `category` | string? | Category tag |
| `season` | string? | Season tag |
| `status` | TournamentStatus | Lifecycle state |
| `registration_type` | RegistrationType | `individual` \| `team` \| `academy` \| `invitation` \| `public` |
| `max_players` | number? | Capacity cap |
| `max_teams` | number? | Team capacity |
| `current_players / current_teams` | number? | Denormalized counts |
| `registration_fee` | number? | Fee amount |
| `price_type` | string? | Pricing model |
| `currency` | string? | ISO 4217 |
| `is_public` | boolean? | Visibility |
| `registration_open_at / registration_close_at` | string? | Registration window |
| `start_date / end_date` | string? | Tournament dates |
| `match_duration_minutes` | number? | Per-match duration |
| `rules` | string? | Rules text |
| `prize_description` | string? | Prize info |
| `metadata` | Record<string, unknown>? | Extensible JSON |

#### TournamentRegistration
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `tournament_id` | number | FK |
| `user_id` | number? | Individual registrant |
| `team_id` | number? | Team registrant |
| `team_name` | string? | Team name |
| `seed` | number | Seeding position |
| `status` | RegistrationStatus | Lifecycle state |
| `waiting_order` | number? | Waiting list position |
| `registered_at` | string | Timestamp |
| `confirmed_at` | string? | Confirmation timestamp |
| `checked_in_at` | string? | Check-in timestamp |

#### TournamentMatch
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `tournament_id` | number | FK |
| `round` | number | Round number (1-indexed) |
| `group_id` | number? | FK to `tournament_groups` |
| `bracket_position` | number? | Position in bracket |
| `player1_id / player2_id` | number? | Competing players |
| `winner_id` | number? | Winner reference |
| `status` | MatchStatus | `scheduled` \| `in_progress` \| `completed` \| `walkover` \| `forfeit` \| `no_show` |
| `court_id` | number? | FK to `resources` |
| `referee_id` | number? | FK to `users` |
| `scheduled_at` | string? | Scheduled time |
| `started_at / completed_at` | string? | Actual times |
| `notes` | string? | Match notes |

#### TournamentMatchResult
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `match_id` | number | FK |
| `winner_id` | number? | Winner |
| `home_score / away_score` | number? | Scores |
| `score_details` | string? | Extended score JSON |
| `entered_by` | number | User who entered |
| `entered_at` | string | Timestamp |

#### TournamentGroup
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `tournament_id` | number | FK |
| `name` | string | Group letter/name |
| `advance_count` | number | How many advance to knockout |
| `created_at` | string | Timestamp |

#### TournamentGroupMember
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `group_id` | number | FK to `tournament_groups` |
| `registration_id` | number | FK to `tournament_registrations` |
| `seed` | number | Seeding within group |

#### TournamentStandingRow
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `tournament_id` | number | FK |
| `group_id` | number? | Scoped to group |
| `registration_id` | number? | Registration reference |
| `player_id` | number? | Player reference |
| `team_id` | number? | Team reference |
| `points` | number | Accumulated points |
| `wins / losses / draws` | number | Match counts |
| `games_for / games_against` | number | Score aggregates |
| `position` | number | Rank (1 = leader) |
| `played` | number | Matches played |

## 3. State Machines

### Tournament Lifecycle

**Source:** `domain/lifecycle.ts:5-14`

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
     ┌──────────────────┐
     │ Registration Open │
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

**Transitions (from `lifecycle.ts:5-14`):**
```typescript
draft: ['published']
published: ['registration_open']
registration_open: ['registration_closed']
registration_closed: ['running']
running: ['completed', 'cancelled']
completed: ['archived']
cancelled: ['archived']
archived: []
```

**Convenience methods in `tournament.service.ts:55-61`:**
- `publish(id)` → `updateStatus(id, 'published')`
- `openRegistration(id)` → `updateStatus(id, 'registration_open')`
- `closeRegistration(id)` → `updateStatus(id, 'registration_closed')`
- `startTournament(id)` → `updateStatus(id, 'running')`
- `complete(id)` → `updateStatus(id, 'completed')`
- `cancel(id)` → `updateStatus(id, 'cancelled')`
- `archive(id)` → `updateStatus(id, 'archived')`

All call `validateTournamentTransition()` before updating.

### Registration Lifecycle

**Source:** `domain/lifecycle.ts:16-22`

```
     ┌──────────┐
     │ Pending  │
     └────┬─────┘
          │
     ┌────┴────┐
     ▼         ▼
  ┌───────┐ ┌────────┐
  │Confirmed│ │Waiting │
  └───┬───┘ └────┬───┘
      │          │
      │          │ (auto-promote on confirm)
      └──────────┘
          │
          ▼
     ┌───────────┐
     │ Completed │
     └───────────┘

  ┌───────────┐
  │ Cancelled │
  └───────────┘
```

**Transitions (from `lifecycle.ts:16-22`):**
```typescript
pending: ['confirmed', 'waiting', 'cancelled']
waiting: ['confirmed', 'cancelled']
confirmed: ['cancelled', 'completed']
cancelled: []
completed: []
```

**Auto-promotion logic (`tournament.service.ts:113-128`):** When a registration is confirmed, the system checks for waiting registrations sorted by `waiting_order`. If capacity allows, the next waiting registration is auto-confirmed.

### Match Status

**Source:** `domain/tournament-aggregate.ts:13`

```
scheduled → in_progress → completed
                         → walkover
                         → forfeit
                         → no_show
```

## 4. Bracket Generation

### 4.1 Knockout Bracket

**Source:** `domain/tournament-aggregate.ts:137-157`

The `generateKnockoutBracket()` function:
1. Takes an array of participant IDs
2. Computes `nextPowerOf2` (2^ceil(log2(count))) — e.g., 7 → 8, 5 → 8, 4 → 4
3. Creates Round 1 matches pairing adjacent participants (i*2 vs i*2+1)
4. Participants beyond the original count get `undefined` = **bye** (automatic advancement)
5. Creates empty placeholder matches for subsequent rounds (2 to totalRounds)
6. Returns `{ round, bracketPosition, player1Id, player2Id }` objects

**Example (5 participants):**
```
Round 1: [P1 v P2] [P3 v P4] [P5 v BYE] [BYE v BYE]
Round 2: [Winner 1 v Winner 2] [Winner 3 v Winner 4]
Round 3: [Winner 5 v Winner 6]
```

### 4.2 Round-Robin Matches

**Source:** `domain/tournament-aggregate.ts:159-170`

The `generateRoundRobinMatches()` function:
1. Takes an array of participant IDs
2. For each pair (i, j) where i < j, creates a match
3. Total matches = n * (n-1) / 2
4. All matches are labeled `round: 1` (single round of round-robin)

### 4.3 Group Stage + Knockout

**Source:** `tournament.service.ts:130-155` (generateGroups), `domain/tournament-aggregate.ts:137-157` (knockout)

Two-phase generation:
1. **Phase 1 (`generateGroups`):** Shuffles confirmed registrations, divides into groups (named A, B, C...) with specified `group_size` and `advance_count`
2. **Phase 2 (`generateFixtures`):** For each group, generates round-robin matches within the group
3. **Phase 3 (`generateBracket` for `group_stage_knockout`):** After group stage, runs knockout bracket

### 4.4 Bracket Types Seed Data

The `tournament_bracket_types` table is seeded with 4 types:

| Slug | Name | Description |
|------|------|-------------|
| `single_elimination` | Single Elimination | Standard knockout — each loss eliminates |
| `double_elimination` | Double Elimination | Losers bracket — eliminated after 2 losses |
| `round_robin` | Round Robin | All participants play each other |
| `swiss` | Swiss System | Paired based on current standings |

The `tournament.format` maps to these: `knockout` → single_elimination, `double_elimination` → double_elimination, `round_robin` → round_robin, `swiss` → swiss.

### 4.5 Format Selection in Service

**Source:** `tournament.service.ts:178-223` (`generateBracket()`)

```typescript
if (t.format === 'knockout')
  matches = generateKnockoutBracket(userIds)
else if (t.format === 'round_robin')
  matches = generateRoundRobinMatches(userIds)
else if (t.format === 'group_stage_knockout')
  // For each group: generateRoundRobinMatches
  // Then: generateKnockoutBracket(advancing participants)
```

## 5. Standings Calculation

**Source:** `domain/tournament-aggregate.ts:172-209`

The `computeStandings()` function:
1. Initializes stats for each participant (points=0, wins=0, losses=0, draws=0, gf=0, ga=0, played=0)
2. Iterates completed matches with a `winner_id`
3. **Winner** gets: wins+1, points+3, played+1
4. **Loser** gets: losses+1, played+1
5. Sorts by: points DESC, then goal_difference DESC, then goals_for DESC
6. Assigns position (1-based rank)

**Recalculation triggers:** Every match result recorded via `recordMatchResult()` at `tournament.service.ts:225-247` triggers `tournamentRepository.recalculateStandings()`.

## 6. Application Layer

### Tournament Service (`application/tournament.service.ts:1-291`)

| Method | Description | Key Logic |
|--------|-------------|-----------|
| `create(data)` | Create tournament | Code uniqueness check, emits `tournament.created` event |
| `list(filters)` | Paginated with search/status/format/sport | Delegates to repository |
| `getById(id)` | Single tournament | Throws `NotFoundError` |
| `update(id, data)` | Partial update | Code uniqueness check |
| `updateStatus(id, status)` | Generic state transition | Calls `validateTournamentTransition()` |
| `publish / openRegistration / closeRegistration / startTournament / complete / cancel / archive` | Convenience status methods | All delegate to `updateStatus()` |
| `register(tournamentId, userId, teamId?)` | Create registration | Validates tournament is open, checks duplicates, auto-waiting if full |
| `cancelRegistration(regId)` | Cancel registration | Validates transition via `validateRegistrationTransition()` |
| `confirmRegistration(regId)` | Confirm + auto-promote waiting | Promotes next waiting registration if capacity allows |
| `generateGroups(tournamentId, groupSize, advanceCount)` | Create groups | Shuffles confirmed registrations, assigns to groups A/B/C... |
| `generateFixtures(tournamentId)` | Round-robin within groups | For each group, calls `generateRoundRobinMatches()` |
| `generateBracket(tournamentId)` | Format-aware bracket generation | Delegates to format-specific generators |
| `recordMatchResult(matchId, winnerId, ...)` | Record + recalculate | Creates match result, updates match status, recalculates standings |
| `assignCourt(matchId, resourceId)` | Court assignment | Updates match court_id |
| `assignReferee(matchId, refereeId)` | Referee assignment | Updates match referee_id |
| `recalculateStandings(tournamentId)` | Full standings refresh | Delegates to repository |
| `getDashboard()` | Aggregate KPIs | Returns total/published/registration_open/running/completed/cancelled counts |
| `getBracket / getStandings / getMatches / getGroups / getRegistrations` | Query methods | Delegates to repository |

## 7. Route Architecture

**Source:** `presentation/tournament.routes.ts:10-50` (31 routes)

### Admin Routes (24)

| Route | Permission |
|-------|------------|
| `GET /admin/tournaments/dashboard` | `tournament.dashboard.view` |
| `GET /admin/tournaments` | `tournament.view` |
| `POST /admin/tournaments` | `tournament.create` |
| `GET /admin/tournaments/:id` | `tournament.view` |
| `PUT /admin/tournaments/:id` | `tournament.update` |
| `POST /admin/tournaments/:id/publish` | `tournament.publish` |
| `POST /admin/tournaments/:id/open-reg` | `tournament.update` |
| `POST /admin/tournaments/:id/close-reg` | `tournament.update` |
| `POST /admin/tournaments/:id/start` | `tournament.manage` |
| `POST /admin/tournaments/:id/complete` | `tournament.manage` |
| `POST /admin/tournaments/:id/cancel` | `tournament.manage` |
| `POST /admin/tournaments/:id/archive` | `tournament.delete` |
| `GET /admin/tournaments/:id/registrations` | `tournament.view` |
| `POST /admin/tournaments/:id/register` | `tournament.manage` |
| `POST /admin/tournaments/:id/registrations/:regId/confirm` | `tournament.manage` |
| `POST /admin/tournaments/:id/registrations/:regId/cancel` | `tournament.manage` |
| `POST /admin/tournaments/:id/generate-groups` | `tournament.manage` |
| `POST /admin/tournaments/:id/generate-fixtures` | `tournament.manage` |
| `POST /admin/tournaments/:id/generate-bracket` | `tournament.manage` |
| `GET /admin/tournaments/:id/bracket` | `tournament.view` |
| `GET /admin/tournaments/:id/standings` | `tournament.view` |
| `GET /admin/tournaments/:id/matches` | `tournament.view` |
| `POST /admin/tournaments/matches/:matchId/result` | `tournament.manage` |
| `POST /admin/tournaments/matches/:matchId/assign-court` | `tournament.manage` |
| `POST /admin/tournaments/matches/:matchId/assign-referee` | `tournament.manage` |

### Player Routes (7)

| Route | Purpose | Permission |
|-------|---------|------------|
| `GET /player/tournaments` | Public listing | None |
| `GET /player/tournaments/:id` | Tournament detail | None |
| `GET /player/tournaments/:id/standings` | Public standings | None |
| `GET /player/tournaments/:id/matches` | Public matches | None |
| `POST /player/tournaments/:id/register` | Self-register | Own data |
| `GET /player/tournaments/my` | My registrations | Auth required |
| `GET /player/tournaments/:id/my-matches` | My matches | Auth required |

## 8. Dashboard Metrics

**Source:** `tournament.repository.ts` `getDashboard()`

```
total_tournaments | published_tournaments | registration_open
running_tournaments | completed_tournaments | cancelled_tournaments
```

## 9. Event Emissions

| Event | When | Payload |
|-------|------|---------|
| `tournament.created` | Tournament created | `{ tournamentId, name, format }` |
| `registration.received` | Registration created | `{ tournamentId, userId, registrationId, status }` |
| `match.result.recorded` | Match result entered | `{ matchId, winnerId }` |

**Evidence:** All source files at `backend/src/modules/tournaments/`. Types and generators at `domain/tournament-aggregate.ts:1-209`. Lifecycle at `domain/lifecycle.ts:1-52`. Service at `application/tournament.service.ts:1-291`. DTOs at `presentation/tournament.dto.ts:1-94`.
