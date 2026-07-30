# ENTERPRISE TABLE AUDIT: `tournament_bracket_types`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Reference — tournament bracket format definitions |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌─────────────────────────────────────────────────────────────────────┐
│   tournament_bracket_types  —  EXECUTIVE SNAPSHOT                   │
├─────────────────────────────────────────────────────────────────────┤
│  TIER:           1 — Reference table                                 │
│  HEALTH:         10/10 — Schema sound, code usage consistent         │
│  QUALITY:        9/10 — No domain type, frontend hardcodes values    │
│  PK:             id (int unsigned)                                    │
│  FK:             0 (referenced BY 2 child tables)                    │
│  CHILDREN:       2 — tournaments, community_tournaments              │
│  PRODUCTION ROWS: 4                                                   │
│  BACKEND REFS:   8+ sites across 2 files (SELECT + JOINs)            │
│  FRONTEND REFS:  2 pages (create form + list display)                │
│  FINDINGS:       None                                                 │
│  RECOMMENDATION: No action required                                   │
│  CONFIDENCE:     95%                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Reference — seeded bracket format definitions |
| Evidence | 4 seed rows; read-only usage in backend (SELECT + JOINs); frontend select options referencing IDs |

---

## 3. PRODUCTION SCHEMA (6 columns)

```
id              int unsigned AUTO_INCREMENT PK (AUTO_INCREMENT=5, 4 rows)
name            varchar(100) NOT NULL
slug            varchar(50) NOT NULL UNIQUE
is_active       tinyint(1) NOT NULL DEFAULT 1
config_schema   longtext DEFAULT NULL    JSON Schema, CHECK(json_valid)
created_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
```

---

## 4. SEED DATA (4 rows)

| id | name | slug | config_schema |
|---|---|---|---|
| 1 | Single Elimination | single-elimination | `{"rounds": "auto", "seeding": true}` |
| 2 | Double Elimination | double-elimination | `{"rounds": "auto", "seeding": true, "losers_bracket": true}` |
| 3 | Round Robin | round-robin | `{"groups": 4, "advance": 2}` |
| 4 | Swiss System | swiss | `{"rounds": 7, "pairing": "score-based"}` |

All 4 rows have `is_active = 1`.

---

## 5. CHILD TABLES

| Table | FK Column | Constraint |
|---|---|---|
| `tournaments` | `bracket_type_id` | `fk_tourn_bracket` |
| `community_tournaments` | `bracket_type_id` | `fk_ct_bracket` |

---

## 6. APPLICATION CODE REFERENCES

### Backend

**File:** `backend/src/modules/activities/infrastructure/repositories/activities.repository.ts`

| Line | Usage | Correct? |
|---|---|---|
| 10 | `SELECT * FROM tournament_bracket_types WHERE is_active = TRUE` | ✅ |
| 17-19, 46-48, 571-573, 592-594 | `JOIN tournament_bracket_types bt ON t.bracket_type_id = bt.id` (4 JOIN queries) | ✅ |
| 141 | `if (bracketTypeId === 1)` — hardcoded Single Elimination check | ✅ (seed ID stable) |

**File:** `backend/src/modules/activities/application/activities.service.ts:87`

Reads `t.bracket_type_id` from tournament row to pass to `generateMatches()`.

**No domain type** (`TournamentBracketType` interface) exists.

### Frontend

**File:** `frontend/src/pages/tournaments/TournamentCreatePage.tsx`
- `bracketTypeId: z.string()` form field defaulting to `'1'`
- Hardcoded `<select>` with Single Elimination (value=1) and Round Robin (value=2)

**File:** `frontend/src/pages/tournaments/TournamentListPage.tsx:39`
- Displays `t.bracket_type_name` alias from JOIN query

---

## 7. FINDINGS

None identified.

---

## 8. OBSERVATIONS

- **No domain interface** exists — all access is through raw SQL and the `bracketTypeId` field name in DTOs/forms.
- **Frontend hardcodes bracket type options** in the create form rather than fetching from an API. Only 2 of 4 types are listed (Single Elimination and Round Robin). If Double Elimination or Swiss System need to be selectable, the frontend must be updated.
- **`config_schema` is never read by application code** — the hardcoded `if (bracketTypeId === 1)` in the repository bypasses schema-driven configuration. The JSON schema stored here is a design artifact, not consumed at runtime.
- **The current AUTO_INCREMENT value is consistent** with the presence of the four reviewed seed rows.

---

## 9. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 10. RECOMMENDATIONS

| # | Action | Priority |
|---|---|---|
| 1 | Consider adding a `TournamentBracketType` domain interface if the type is used more broadly | Low |
| 2 | Consider fetching bracket types from API instead of hardcoding in frontend if new types are added | Low |

---

## 11. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (6 cols, 2 child FKs) |
| Baseline match | ✅ (identical to production) |
| Seed data verified | ✅ (4 rows, matches code expectations) |
| Application code verified | ✅ (SELECT + JOINs correct) |
| FK integrity verified | ✅ (2 child tables reference this) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `tournament_bracket_types` ✅

**Next table: `tournaments` — proceed?**
