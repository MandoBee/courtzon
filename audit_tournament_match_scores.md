# ENTERPRISE TABLE AUDIT: `tournament_match_scores`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Per-set score tracking for tournament matches |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
+----------------------------------------------------------------------+
¦   tournament_match_scores  —  EXECUTIVE SNAPSHOT                     ¦
+----------------------------------------------------------------------¦
¦  TIER:           3 — Supporting detail entity                         ¦
¦  HEALTH:         10/10 — Schema sound, code column names correct     ¦
¦  QUALITY:        9/10 — Single code reference, no domain type        ¦
¦  PK:             id (int unsigned)                                     ¦
¦  FK:             1 — tournament_matches CASCADE                       ¦
¦  CHILDREN:       0                                                     ¦
¦  PRODUCTION ROWS: 0                                                    ¦
¦  BACKEND REFS:   1 (activities.repository.ts, raw INSERT)             ¦
¦  FRONTEND REFS:  0                                                     ¦
¦  FINDINGS:       None                                                  ¦
¦  RECOMMENDATION: No action required                                    ¦
¦  CONFIDENCE:     95%                                                   ¦
+----------------------------------------------------------------------+
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — stores per-set scores for match results |
| Evidence | Single INSERT in `activities.repository.ts:181`; create in baseline; referenced in seed manifest |

---

## 3. PRODUCTION SCHEMA (7 columns)

```
id              int unsigned AUTO_INCREMENT PK
match_id        int unsigned NOT NULL      ? tournament_matches(id) ON DELETE CASCADE
set_number      tinyint unsigned NOT NULL
player1_score   varchar(20) DEFAULT NULL
player2_score   varchar(20) DEFAULT NULL
entered_by      int unsigned NOT NULL
created_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP

Indexes: idx_match
```

Matches baseline (`001_courtzon_v3.sql:2997-3011`) exactly.

---

## 4. MIGRATION HISTORY

| Migration | Action | Detail |
|---|---|---|
| Baseline | DDL | Present at `001_courtzon_v3.sql:2997-3011` (core table) |
| N/A | Archive | `archive/database/schema/005_tournaments_academies_coaches.sql:100-110` (original historical DDL) |

No migration files in `database/migrations/` reference this table — it is a baseline-native table.

---

## 5. CHILD TABLES

None identified.

---

## 6. APPLICATION CODE REFERENCES

### Backend

**File:** `backend/src/modules/activities/infrastructure/repositories/activities.repository.ts:178-184`

```
async insertSetScore(matchId: number, setNumber: number, player1Score: string, player2Score: string, enteredBy: number) {
  const pool = getPool();
  await pool.execute(
    'INSERT INTO tournament_match_scores (match_id, set_number, player1_score, player2_score, entered_by) VALUES (?, ?, ?, ?, ?)',
    [matchId, setNumber, player1Score, player2Score, enteredBy]
  );
},
```

All 5 INSERT columns match the production schema. ?

**No domain interface** exists for this table — the method operates on raw parameters and `RowData` results.

### Frontend

0 references in `frontend/src/`.

---

## 7. FINDINGS

None identified.

---

## 8. OBSERVATIONS

- **No domain type** (`TournamentMatchScore`) exists — the activities repository uses a standalone method with raw parameters. This differs from the pattern used by the `tournaments/` module (which defines interfaces for every entity).
- **All columns in the single INSERT statement match production** — no column mismatch issues unlike the `tournaments/` module tables.
- **0 production rows were observed** for this table during the review.
- **`TECH-DB-03_Entity_Reference.md` contains a stale schema description** (`player_id`, `score`, `position`) that does not match the baseline or production schema.

---

## 9. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 10. RECOMMENDATIONS

| # | Action | Priority |
|---|---|---|
| 1 | Add a `TournamentMatchScore` domain interface for type safety | Low |
| 2 | Correct `TECH-DB-03_Entity_Reference.md` entry to match actual schema | Low |

---

## 11. QUALITY GATE ?

| Check | Status |
|---|---|
| Schema verified | ? (7 cols, 1 FK) |
| Baseline match | ? (identical to production) |
| Application code verified | ? (1 INSERT, columns correct) |
| FK integrity verified | ? (match CASCADE) |
| Child tables verified | ? (0 children) |
| Code vs schema alignment | ? (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `tournament_match_scores` ?

**Next table alphabetically: `tournament_registrations` — already audited previously. Next new table: `user_account_requests` — proceed?**
