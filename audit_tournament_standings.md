# ENTERPRISE TABLE AUDIT: `tournament_standings`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Persisted tournament standings (group/tournament level) |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌─────────────────────────────────────────────────────────────────────┐
│   tournament_standings  —  EXECUTIVE SNAPSHOT                       │
├─────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — Derived operational entity                      │
│  HEALTH:         4/10 — Write operations broken, SELECTs partial     │
│  QUALITY:        4/10 — Domain/repo column mismatch with prod        │
│  PK:             id (int unsigned)                                    │
│  FK:             3 — tournaments CASCADE, tournament_groups CASCADE, │
│                  tournament_registrations CASCADE                    │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 0                                                   │
│  BACKEND REFS:   30+ sites across 3 files                             │
│  FRONTEND REFS:  1 page (RankHistoryPage.tsx)                         │
│  FINDINGS:       2 — TSS-001 (Critical), TSS-002 (High)              │
│  RECOMMENDATION: Align domain type, repository, and docs to          │
│                  production schema                                   │
│  CONFIDENCE:     95%                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — persisted standings for tournament group/bracket display |
| Evidence | 2 repository methods (upsert, recalculate, get); 1 player-facing API endpoint; 1 frontend page consuming standings data |

---

## 3. PRODUCTION SCHEMA (15 columns)

```
id                  int unsigned AUTO_INCREMENT PK
tournament_id       int unsigned NOT NULL              → tournaments(id) ON DELETE CASCADE
group_id            int unsigned DEFAULT NULL           → tournament_groups(id) ON DELETE CASCADE
registration_id     int unsigned NOT NULL               → tournament_registrations(id) ON DELETE CASCADE
wins                int unsigned NOT NULL DEFAULT 0
losses              int unsigned NOT NULL DEFAULT 0
draws               int unsigned NOT NULL DEFAULT 0
points              decimal(10,2) NOT NULL DEFAULT 0.00
games_won           int unsigned NOT NULL DEFAULT 0
games_lost          int unsigned NOT NULL DEFAULT 0
sets_won            int unsigned NOT NULL DEFAULT 0
sets_lost           int unsigned NOT NULL DEFAULT 0
rank_position       int unsigned DEFAULT NULL
created_at          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

Indexes: uk_tourn_reg_group (UNIQUE), idx_group, idx_rank, fk_ts_reg
```

---

## 4. MIGRATION HISTORY

| Migration | Action | Detail |
|---|---|---|
| M062 | CREATE TABLE | Full DDL at `062_tournament_competition.sql:108-133` — matches production schema above |
| Baseline | Absent | Not in `001_courtzon_v3.sql` — consistent with SF-002 |

---

## 5. CHILD TABLES

None identified.

---

## 6. APPLICATION CODE REFERENCES

### 6a. Domain Types

**File:** `backend/src/modules/tournaments/domain/tournament-aggregate.ts`

**`TournamentStandingRow`** (lines 106-121):
```
id, tournament_id, group_id, registration_id,
player_id, team_id,               ← NOT in production
points, wins, losses, draws,
games_for, games_against,         ← production: games_won, games_lost
position, played                  ← production: rank_position; played NOT in production
```

**`TournamentStanding`** (lines 123-135):
```
registration_id, player_id, team_id,
points, wins, losses, draws,
games_for, games_against,
position, played
```
Same mismatches.

### 6b. Tournament Repository (BROKEN)

**File:** `backend/src/modules/tournaments/infrastructure/repositories/tournament.repository.ts`

| Method | Line | Issue |
|---|---|---|
| `getStandings()` | 314-322 | `SELECT s.* FROM tournament_standings s ... ORDER BY s.position ASC` — column `position` does not exist in production |
| `upsertStanding()` | 325-337 | `INSERT INTO tournament_standings (..., player_id, team_id, ..., games_for, games_against, position, played)` — **5 of 13 columns don't exist**: `player_id`, `team_id`, `games_for`, `games_against`, `position`, `played` |
| `recalculateStandings()` | 339-381 | DELETE + INSERT loop: `INSERT INTO tournament_standings (..., games_for, games_against, position, played)` — 4 of 11 columns don't exist |

### 6c. Player Controller (WORKS for this query)

**File:** `backend/src/modules/player-experience/presentation/player.controller.ts:115`

```sql
FROM tournament_standings ts
JOIN tournament_registrations tr ON tr.id = ts.registration_id
JOIN tournaments t ON t.id = ts.tournament_id
WHERE tr.player_id = ? AND ts.rank_position IS NOT NULL
ORDER BY t.start_date DESC LIMIT 50
```

Uses `rank_position` — matches production schema ✅

### 6d. Frontend

**File:** `frontend/src/pages/player/RankHistoryPage.tsx:24,28,64`

Consumes `data.tournament_standings` array from `GET /my/rank-history` response. Reads `rank_position`, `tournament_name` etc. — display-only, no writes.

---

## 7. COLUMN DISCREPANCY TABLE

| Domain/Repo Field | Production Column | Match? |
|---|---|---|
| `id` | `id` | ✅ |
| `tournament_id` | `tournament_id` | ✅ |
| `group_id` | `group_id` | ✅ |
| `registration_id` | `registration_id` | ✅ |
| `player_id` | — | ✗ (no production equivalent) |
| `team_id` | — | ✗ (no production equivalent) |
| `points` | `points` | ✅ |
| `wins` | `wins` | ✅ |
| `losses` | `losses` | ✅ |
| `draws` | `draws` | ✅ |
| `games_for` | `games_won` | ✗ (different name) |
| `games_against` | `games_lost` | ✗ (different name) |
| `position` | `rank_position` | ✗ (different name) |
| `played` | — | ✗ (no production equivalent) |
| — | `sets_won` | ✗ (missing from domain/repo) |
| — | `sets_lost` | ✗ (missing from domain/repo) |

---

## 8. FINDINGS

---

### TSS-001: Repository write operations reference non-existent columns

| Field | Value |
|---|---|
| **Severity** | Critical |
| **Classification** | Finding |
| **Confidence** | A (95%) |

**Evidence:**
1. Production schema (verified via `SHOW CREATE TABLE`) has columns `games_won`, `games_lost`, `sets_won`, `sets_lost`, `rank_position` — NOT `player_id`, `team_id`, `games_for`, `games_against`, `position`, `played`
2. `upsertStanding()` at `tournament.repository.ts:327-328` — `INSERT INTO tournament_standings (..., player_id, team_id, ..., games_for, games_against, position, played)`
3. `recalculateStandings()` at `tournament.repository.ts:375` — `INSERT INTO tournament_standings (..., games_for, games_against, position, played)`
4. `getStandings()` at `tournament.repository.ts:319` — `ORDER BY s.position ASC` (column `position` does not exist)

**Root Cause:**
The reviewed implementation is aligned with a schema that differs from the reviewed production schema. The production schema (defined in M062 DDL and confirmed on the server) uses `games_won`, `games_lost`, `sets_won`, `sets_lost`, `rank_position`, while the repository and domain types reference `player_id`, `team_id`, `games_for`, `games_against`, `position`, `played`.

**Impact:**
- Fact: `upsertStanding()`, `recalculateStandings()`, and `getStandings()` will throw MySQL "Unknown column" errors at runtime.
- Expected: 0 production rows were observed during the review. No runtime evidence was identified demonstrating successful execution of these write operations.

**Recommendation:**
1. Replace `games_for` → `games_won`, `games_against` → `games_lost`, `position` → `rank_position` in all repository queries
2. Remove `player_id`, `team_id`, `played` from `upsertStanding()` and `TournamentStandingRow`/`TournamentStanding`
3. Add `sets_won`, `sets_lost` to the repository's upsert/recalculate logic
4. Verify against a test database

---

### TSS-002: Domain type `TournamentStandingRow`/`TournamentStanding` columns do not match production

| Field | Value |
|---|---|
| **Severity** | High |
| **Classification** | Finding |
| **Confidence** | A (95%) |

**Evidence:** See column discrepancy table in §7. 6 of 14 domain fields don't match production columns.

**Root Cause:** Same as TSS-001 — domain types reflect a different schema version than production.

**Impact:**
- Fact: `SELECT *` results cast as `TournamentStandingRow[]` will have `undefined` for `player_id`, `team_id`, `played`; production values for `games_won`, `games_lost`, `sets_won`, `sets_lost` will appear on the object but be invisible to TypeScript consumers.
- Expected: Consumer code that expects the interface fields rather than the production schema fields is expected to receive undefined values for the mismatched properties.

**Recommendation:**
1. Update `TournamentStandingRow` to match production columns exactly: `id`, `tournament_id`, `group_id`, `registration_id`, `wins`, `losses`, `draws`, `points`, `games_won`, `games_lost`, `sets_won`, `sets_lost`, `rank_position`, `created_at`, `updated_at`
2. Update `TournamentStanding` similarly (omit id/timestamps)
3. Update `computeStandings()` function to use the correct column names

---

## 9. OBSERVATIONS

- **Same root cause pattern as TSM-001:** The `tournaments/` module's repository and domain types are out of sync with the production schema, while the `player-experience/` module (which reads standings) uses correct column names.
- **0 production rows were observed** across the reviewed tournament tables. No runtime evidence was identified demonstrating execution of the standings persistence workflow.
- **Docs also stale:** `TECH-DB-03_Entity_Reference.md` describes the old schema (`player_id`, `team_id`, `games_for`, `games_against`, `position`, `played`), consistent with the stale domain types.
- **Frontend is a read-only consumer** of the rank-history endpoint — the display code itself is unaffected by the schema mismatch (it reads whatever the API returns).

---

## 10. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 11. RECOMMENDATIONS

| # | Action | Priority | Tied To |
|---|---|---|---|
| 1 | Align `TournamentStandingRow` and `TournamentStanding` interfaces with production schema | High | TSS-002 |
| 2 | Fix `upsertStanding()`, `recalculateStandings()`, and `getStandings()` column references | Critical | TSS-001 |
| 3 | Update `TECH-DB-03_Entity_Reference.md` to reflect production column set | Medium | TSS-002 |
| 4 | Consider adding `sets_won`/`sets_lost` tracking to the domain logic if needed | Low | — |

---

## 12. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (15 cols, 3 FK, 4 idx) |
| Migration verified | ✅ (M062) |
| Production vs baseline diff | ✅ (not in baseline — SF-002 consistent) |
| Domain type verified | ✅ (mismatch found — TSS-002) |
| Repository code verified | ✅ (write operations broken — TSS-001) |
| FK integrity verified | ✅ (3 FK, all CASCADE) |
| Child tables verified | ✅ (0 children) |
| Frontend integration verified | ✅ (1 page, 3 JSX refs) |
| Consuming API verified | ✅ (player controller rank history works correctly) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `tournament_standings` ✅

**Next table alphabetically: `tournament_match_players` — proceed?**
