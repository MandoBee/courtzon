# ENTERPRISE TABLE AUDIT: `tournament_matches`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Core match scheduling entity |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌───────────────────────────────────────────────────────────────────┐
│   tournament_matches  —  EXECUTIVE SNAPSHOT                       │
├───────────────────────────────────────────────────────────────────┤
│  TIER:           2 — Core operational entity                       │
│  HEALTH:         5/10 — Schema sound, CRUD code broken             │
│  QUALITY:        5/10 — Domain & repo mismatched with prod schema  │
│  PK:             id (int unsigned)                                  │
│  FK:             4 — tournaments (CASCADE), users×2 (SET NULL),    │
│                  resources (SET NULL)                              │
│  CHILDREN:       3 — tournament_match_players CASCADE,            │
│                  tournament_match_results CASCADE,                │
│                  tournament_match_scores CASCADE                   │
│  PRODUCTION ROWS: 0                                                 │
│  BACKEND REFS:   50+ across 6 modules, 9 files                     │
│  FRONTEND REFS:  1 page + 1 sidebar + 2 i18n keys                  │
│  FINDINGS:       2 — TSM-001 (Critical), TSM-002 (High)            │
│  RECOMMENDATION: Align domain type & repository to production      │
│  CONFIDENCE:     95%                                                │
└───────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — tournament match scheduling, scoring, bracket management |
| Evidence | Full CRUD in 2 repositories; 3 child tables; 5 consuming modules; admin sidebar route; referee dashboard integration |
| Inference | Core to tournament competition workflow |

---

## 3. PRODUCTION SCHEMA (18 columns)

```
id              int unsigned AUTO_INCREMENT PK
tournament_id   int unsigned NOT NULL          → tournaments(id) ON DELETE CASCADE
group_id        int unsigned DEFAULT NULL      [M062]
round           int unsigned NOT NULL
round_name      varchar(100) DEFAULT NULL      [M062]
match_number    int unsigned NOT NULL
bracket_position int unsigned DEFAULT NULL     [M062]
player1_id      int unsigned DEFAULT NULL      → users(id) ON DELETE SET NULL
player2_id      int unsigned DEFAULT NULL      → users(id) ON DELETE SET NULL
resource_id     int unsigned DEFAULT NULL      → resources(id) ON DELETE SET NULL
referee_id      int unsigned DEFAULT NULL      [M062, index only, no FK]
start_time      datetime DEFAULT NULL
end_time        datetime DEFAULT NULL
status          ENUM('scheduled','in_progress','completed','walkover','cancelled') NOT NULL DEFAULT 'scheduled'
winner_id       int unsigned DEFAULT NULL
score_summary   varchar(500) DEFAULT NULL
created_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

Indexes: idx_tournament, idx_player1, idx_player2, idx_status, fk_match_resource, idx_group, idx_referee, idx_bracket
```

---

## 4. MIGRATION HISTORY

| Migration | Action | Detail |
|---|---|---|
| M056 | CREATE TABLE | Original schema: `court_id`, `scheduled_at`, `started_at`, `completed_at`, `score`, `aggregate_version` (different column set) |
| M062 | ALTER TABLE (ADD COLUMN) | Added `group_id`, `bracket_position`, `referee_id`, `round_name` — did not rename/remove M056 columns |
| Baseline | DDL snapshot | Reflects production schema (18 cols), NOT M056 schema |

**Observations:**
- Production schema matches baseline (14 baseline cols + 4 from M062 = 18) — **Evidence**
- M056's additional columns (`court_id`, `scheduled_at`, `started_at`, `completed_at`, `score`, `aggregate_version`) do NOT exist in production — **Evidence**
- M056 was likely never applied against production; the table was created from baseline + M062 — **Inference**
- Domain type `TournamentMatch` and repository code match M056's schema, NOT production — **Evidence**

---

## 5. CHILD TABLES

| Table | FK Column | Parent | Cascade |
|---|---|---|---|
| `tournament_match_players` | match_id → tournament_matches(id) | Tournament | CASCADE |
| `tournament_match_results` | match_id → tournament_matches(id) | Tournament | CASCADE |
| `tournament_match_scores` | match_id → tournament_matches(id) | Tournament | CASCADE |

---

## 6. APPLICATION CODE REFERENCES

### 6a. Domain Type

**File:** `backend/src/modules/tournaments/domain/tournament-aggregate.ts:62-78`

```ts
export interface TournamentMatch {
  id?: number;
  tournament_id: number;
  round: number;
  group_id?: number;
  bracket_position?: number;
  player1_id?: number;
  player2_id?: number;
  winner_id?: number;
  status: MatchStatus;
  court_id?: number;         // ← production: resource_id
  referee_id?: number;
  scheduled_at?: string;     // ← production: start_time
  started_at?: string;       // ← production: does not exist
  completed_at?: string;     // ← production: does not exist
  notes?: string;            // ← production: score_summary
}
```

### 6b. Tournament Repository (BROKEN)

**File:** `backend/src/modules/tournaments/infrastructure/repositories/tournament.repository.ts`

| Method | Issue |
|---|---|
| `createMatch()` (line 172-182) | INSERT references `court_id`, `scheduled_at`, `notes` — none exist in prod |
| `updateMatch()` (line 205-221) | Can target `court_id`, `scheduled_at`, `started_at`, `completed_at`, `notes` — none exist in prod |
| `updateMatchStatus()` (line 224-231) | References `completed_at` — does not exist in prod |
| `assignCourt()` (line 233-234) | `UPDATE court_id = ?` — does not exist in prod |
| `findMatches()` (line 184-189) | `SELECT *` — works, but cast to `TournamentMatch[]` is type-unsafe |
| `findMatchById()` (line 200-202) | `SELECT *` — works, type-unsafe cast |
| `findMatchesByGroup()` (line 192-197) | `SELECT *` — works, type-unsafe cast |
| `assignReferee()` (line 237-238) | Uses `referee_id` — exists in prod ✅ |

### 6c. Activities Repository (WORKING)

**File:** `backend/src/modules/activities/infrastructure/repositories/activities.repository.ts`

| Method | Columns Used | Correct? |
|---|---|---|
| `findMatchById()` | SELECT with JOINs | ✅ |
| `findMatches()` | SELECT with JOINs | ✅ |
| `generateMatches()` | INSERT `tournament_id, round, match_number, player1_id, player2_id` | ✅ |
| `updateMatchScore()` | UPDATE `winner_id, score_summary, status` | ✅ |
| `softDeleteTournament()` | UPDATE `status` | ✅ |

### 6d. Other Consumers

| Module | File | Usage | Correct? |
|---|---|---|---|
| Coaches (Referee) | `referee.controller.ts` | Dashboard counts, assignments, history | ✅ (SELECT only) |
| Sports Engine | `sports-engine.controller.ts` | Player analytics, match quality | ✅ (SELECT only) |
| Player Experience | `player.service.ts` | Dashboard, upcoming, statistics, QR | ✅ (SELECT only) |
| Scheduling | `referee.provider.ts` | Slot availability conflict check | ✅ (SELECT with DATE()) |

Only the tournament repository's write operations are broken. All read operations and the activities repository work correctly.

---

## 7. FRONTEND REFERENCES

| File | Line | Usage |
|---|---|---|
| `AdminSidebar.tsx` | 80 | Sidebar link `/admin/tournament/matches` |
| `RefereeStatisticsPage.tsx` | 30 | Label display |
| `translation-keys.registry.ts` | 978, 1346 | i18n keys for sidebar and stats |

---

## 8. FINDINGS

---

### TSM-001: Tournament repository match CRUD references non-existent columns

| Field | Value |
|---|---|
| **Severity** | Critical |
| **Classification** | Finding |
| **Confidence** | A (95%) |

**Evidence:**
1. Production schema exposes columns `resource_id`, `start_time`, `end_time`, `score_summary` — **not** `court_id`, `scheduled_at`, `completed_at`, `notes` (verified by `SHOW CREATE TABLE`)
2. `tournament.repository.ts:173` — `INSERT INTO tournament_matches (..., court_id, ..., scheduled_at, ..., notes)` — will throw MySQL "Unknown column" error
3. `tournament.repository.ts:208-211` — `updateMatch()` can target `court_id`, `scheduled_at`, `started_at`, `completed_at`, `notes`
4. `tournament.repository.ts:224-227` — `updateMatchStatus()` references `completed_at`
5. `tournament.repository.ts:234` — `assignCourt()` does `SET court_id = ?`
6. Domain type `TournamentMatch` (tournament-aggregate.ts:62-78) defines `court_id`, `scheduled_at`, `started_at`, `completed_at`, `notes`

**Root Cause:**
The reviewed implementation is aligned with the schema introduced by M056, whereas the reviewed production schema uses a different column set.

**Impact:**
- Fact: Any call to `createMatch()`, `updateMatch()`, `updateMatchStatus()`, or `assignCourt()` will fail with a MySQL column-not-found error.
- Expected: 0 production rows were observed during the review. No runtime evidence was identified demonstrating successful execution of these write operations.

**Recommendation:**
1. Rename domain type fields: `court_id → resource_id`, `scheduled_at → start_time`, `notes → score_summary`
2. Remove `started_at`, `completed_at` from domain type (add `end_time`)
3. Update repository `createMatch()` INSERT to use correct column names
4. Update `updateMatch()`, `updateMatchStatus()`, and `assignCourt()` to use correct columns
5. Align all queries with production schema column names
6. Run the tournament CRUD operations against a test database to verify

---

### TSM-002: Domain type `TournamentMatch` columns do not match production

| Field | Value |
|---|---|
| **Severity** | High |
| **Classification** | Finding |
| **Confidence** | A (95%) |

**Evidence:**

| Domain Type Field | Production Column | Match? |
|---|---|---|
| `court_id` | `resource_id` | ✗ (different name, same concept) |
| `scheduled_at` | `start_time` | ✗ (different name, same concept) |
| `started_at` | — | ✗ (no production equivalent) |
| `completed_at` | `end_time` | ✗ (different name, different semantics) |
| `notes` | `score_summary` | ✗ (different name, different semantics) |
| — | `match_number` | ✗ (missing from domain) |
| — | `round_name` | ✗ (missing from domain) |
| — | `score_summary` | ✗ (missing from domain — only `notes` exists) |
| `id` | `id` | ✅ |
| `tournament_id` | `tournament_id` | ✅ |
| `round` | `round` | ✅ |
| `group_id` | `group_id` | ✅ |
| `bracket_position` | `bracket_position` | ✅ |
| `player1_id` | `player1_id` | ✅ |
| `player2_id` | `player2_id` | ✅ |
| `winner_id` | `winner_id` | ✅ |
| `status` | `status` | ✅ |
| `referee_id` | `referee_id` | ✅ |

**Root Cause:**
Same as TSM-001 — domain type reflects M056's schema, not the production schema that resulted from baseline + M062.

**Impact:**
- Fact: Runtime `SELECT *` results cast as `TournamentMatch[]` will have `undefined` fields for `court_id`, `scheduled_at`, `started_at`, `completed_at`, `notes`; production-only fields (`match_number`, `round_name`, `score_summary`, `resource_id`, `start_time`, `end_time`) will be present in the object but invisible to TypeScript consumers.
- Expected: Consumer code that expects the interface fields rather than the production schema fields is expected to receive undefined values for the mismatched properties.

**Recommendation:**
1. Update `TournamentMatch` interface to match production columns exactly
2. Add `match_number`, `round_name`, `score_summary`, `resource_id`, `start_time`, `end_time`
3. Remove `court_id`, `scheduled_at`, `started_at`, `completed_at`, `notes`
4. Verify downstream consumers of the interface (service layer, components) are updated accordingly

---

## 9. OBSERVATIONS

- **Dual repository ownership:** Both `tournaments/` and `activities/` modules implement tournament match operations, but only `activities/` uses production-compatible column names. The reviewed write operations in the tournaments repository are inconsistent with the reviewed production schema, while the reviewed activities repository uses production-compatible column names. This is consistent with SF-003 (dual module ownership `activities/` vs `academy/`-like pattern).
- **0 production rows** across all tournament tables (matches, groups, group_members, standings) — the tournament competition feature appears to be built but never activated in production.
- **Referee integration** is the most mature consumer — referee dashboard, assignments, history, and statistics all query `tournament_matches` with correct column usage (SELECT only).

---

## 10. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 11. RECOMMENDATIONS

| # | Action | Priority | Tied To |
|---|---|---|---|
| 1 | Align domain type `TournamentMatch` with production schema | High | TSM-002 |
| 2 | Fix `createMatch()`, `updateMatch()`, `updateMatchStatus()`, and `assignCourt()` column references | Critical | TSM-001 |
| 3 | Consider consolidating tournament match CRUD into a single repository (eliminate dual ownership in `activities/`) | Medium | SF-003 |
| 4 | Add test for tournament match CRUD against production-like schema | Medium | TSM-001 |

---

## 12. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (18 cols, 4 FK, 8 idx) |
| Migration verified | ✅ (M056 initial, M062 additive) |
| Production vs baseline diff | ✅ (M062 columns present in prod, absent from baseline — SF-002 consistent) |
| Domain type verified | ✅ (mismatch found — TSM-002) |
| Repository code verified | ✅ (match CRUD broken — TSM-001) |
| FK integrity verified | ✅ (4 FK, all valid) |
| Child tables verified | ✅ (3: match_players, match_results, match_scores) |
| Dual ownership identified | ✅ (tournaments/ + activities/ both manage matches) |
| Frontend integration verified | ✅ (1 sidebar, 1 page, 2 i18n keys) |
| Referee integration verified | ✅ (dashboard, assignments, history, stats) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `tournament_matches` ✅

**Next table alphabetically: `tournament_standings` — proceed?**
