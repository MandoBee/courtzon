# ENTERPRISE TABLE AUDIT: `tournament_match_results`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Match result/score record (1:1 with tournament_matches) |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌─────────────────────────────────────────────────────────────────────┐
│   tournament_match_results  —  EXECUTIVE SNAPSHOT                   │
├─────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — Dependent result entity                         │
│  HEALTH:         5/10 — Schema sound, code column mismatch           │
│  QUALITY:        5/10 — Domain/repo references non-existent column   │
│  PK:             id (int unsigned)                                    │
│  FK:             3 — tournament_matches CASCADE, users×2 (SET NULL,  │
│                  entered_by)                                         │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 0                                                   │
│  BACKEND REFS:   4 sites across 1 file                                │
│  FRONTEND REFS:  0                                                    │
│  FINDINGS:       1 — TMR-001 (Critical)                              │
│  RECOMMENDATION: Align domain type & repo to production schema       │
│  CONFIDENCE:     95%                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — stores match results/scores |
| Evidence | Repository INSERT and SELECT methods; domain type defined; 3 FKs; migration DDL |

---

## 3. PRODUCTION SCHEMA (10 columns)

```
id              int unsigned AUTO_INCREMENT PK
match_id        int unsigned NOT NULL          → tournament_matches(id) ON DELETE CASCADE
winner_id       int unsigned DEFAULT NULL      → users(id) ON DELETE SET NULL (NULL = draw)
home_score      text DEFAULT NULL              Flexible JSON score for home side
away_score      text DEFAULT NULL              Flexible JSON score for away side
score_details   json DEFAULT NULL              Full score breakdown (sets, games, etc)
result_status   ENUM('submitted','confirmed','disputed') NOT NULL DEFAULT 'submitted'
entered_by      int unsigned NOT NULL          → users(id)
confirmed_at    timestamp NULL DEFAULT NULL
created_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP

Indexes: uk_match (UNIQUE), idx_winner, fk_tmr_entered
```

---

## 4. MIGRATION HISTORY

| Migration | Action | Detail |
|---|---|---|
| M062 | CREATE TABLE | `062_tournament_competition.sql:86-106` |
| Baseline | Absent | Not in `001_courtzon_v3.sql` |

---

## 5. CHILD TABLES

None identified.

---

## 6. APPLICATION CODE REFERENCES

### 6a. Domain Type

**File:** `backend/src/modules/tournaments/domain/tournament-aggregate.ts:80-89`

```ts
export interface TournamentMatchResult {
  id?: number;
  match_id: number;
  winner_id?: number;
  home_score?: number;        // production: text (JSON string)
  away_score?: number;        // production: text (JSON string)
  score_details?: string;     // production: json
  entered_by: number;
  entered_at: string;         // production: created_at
}
```

### 6b. Repository

**File:** `backend/src/modules/tournaments/infrastructure/repositories/tournament.repository.ts`

| Method | Line | Issue |
|---|---|---|
| `createMatchResult()` | 243-250 | `INSERT INTO tournament_match_results (..., entered_at) VALUES (..., NOW())` — column `entered_at` does not exist in production |
| `getMatchResult()` | 253-258 | `SELECT * FROM tournament_match_results WHERE match_id = ? ORDER BY entered_at DESC LIMIT 1` — column `entered_at` does not exist in production |

---

## 7. FINDINGS

---

### TMR-001: Repository references non-existent column `entered_at`

| Field | Value |
|---|---|
| **Severity** | Critical |
| **Classification** | Finding |
| **Confidence** | A (95%) |

**Evidence:**
1. Production schema has `created_at`, not `entered_at` (verified via `SHOW CREATE TABLE`)
2. `createMatchResult()` at `tournament.repository.ts:244` — `INSERT INTO tournament_match_results (..., entered_at) VALUES (..., NOW())`
3. `getMatchResult()` at `tournament.repository.ts:255` — `ORDER BY entered_at DESC`

**Root Cause:**
The reviewed implementation uses the column name `entered_at` which differs from the reviewed production schema column `created_at`.

**Impact:**
- Fact: Both `createMatchResult()` and `getMatchResult()` will throw MySQL "Unknown column `entered_at`" errors at runtime.
- Expected: 0 production rows were observed during the review. No runtime evidence was identified demonstrating successful execution of these operations.

**Recommendation:**
1. Replace `entered_at` with `created_at` in `createMatchResult()` INSERT and `getMatchResult()` ORDER BY
2. Update `TournamentMatchResult` interface: rename `entered_at` to `created_at`, change `home_score`/`away_score` type from `number` to `string`, add `result_status` and `confirmed_at` fields

---

## 8. OBSERVATIONS

- **Same root cause pattern as TSM-001 / TSS-001:** domain type and repository for the `tournaments/` module are out of sync with the production schema.
- **0 production rows were observed** for this table during the review.
- **Production uses `text` for `home_score`/`away_score`** (JSON stored as string), and `json` type for `score_details`. Domain type incorrectly types home/away_score as `number`.
- **Domain type also outdated:** missing `result_status`, `confirmed_at`; has `entered_at` instead of `created_at`.
- **No frontend code** consumes this table — results are only managed server-side.

---

## 9. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 10. RECOMMENDATIONS

| # | Action | Priority | Tied To |
|---|---|---|---|
| 1 | Rename `entered_at` → `created_at` in repository INSERT and SELECT | Critical | TMR-001 |
| 2 | Update `TournamentMatchResult` interface to match production columns | High | TMR-001 |
| 3 | Change `home_score`/`away_score` type from `number` to `string` | Medium | TMR-001 |

---

## 11. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (10 cols, 3 FK) |
| Migration verified | ✅ (M062) |
| Domain type verified | ✅ (mismatch found — `entered_at` vs `created_at`) |
| Repository code verified | ✅ (column reference broken — TMR-001) |
| FK integrity verified | ✅ (match CASCADE, winner SET NULL, entered_by no action) |
| Child tables verified | ✅ (0 children) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `tournament_match_results` ✅

**Next table alphabetically: `tournament_match_scores` — proceed?**
