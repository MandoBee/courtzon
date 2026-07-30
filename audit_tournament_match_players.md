# ENTERPRISE TABLE AUDIT: `tournament_match_players`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Junction — links multiple players to a match side (team matches) |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌─────────────────────────────────────────────────────────────────────┐
│   tournament_match_players  —  EXECUTIVE SNAPSHOT                   │
├─────────────────────────────────────────────────────────────────────┤
│  TIER:           3 — Supporting junction table                       │
│  HEALTH:         10/10 — Schema sound, no drift                      │
│  QUALITY:        10/10 — Clean schema with proper FKs                │
│  PK:             id (int unsigned)                                    │
│  FK:             2 — tournament_matches CASCADE, users CASCADE       │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 0                                                   │
│  BACKEND REFS:   0                                                    │
│  FRONTEND REFS:  0                                                    │
│  FINDINGS:       None                                                 │
│  RECOMMENDATION: No action required — consistent with documented     │
│                  scaffold classification                              │
│  CONFIDENCE:     95%                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Scaffold — schema defined but no application code consumes it |
| Evidence | 0 runtime refs in backend/src/ or frontend/src/; created by M062 only; documented in dormant-table investigations as "Keep — tournament feature scaffolding" |

---

## 3. PRODUCTION SCHEMA (5 columns)

```
id          int unsigned AUTO_INCREMENT PK
match_id    int unsigned NOT NULL      → tournament_matches(id) ON DELETE CASCADE
player_id   int unsigned NOT NULL      → users(id) ON DELETE CASCADE
side        ENUM('home','away') NOT NULL DEFAULT 'home'
created_at  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP

Indexes: idx_match, idx_player
```

---

## 4. MIGRATION HISTORY

| Migration | Action | Detail |
|---|---|---|
| M062 | CREATE TABLE | `062_tournament_competition.sql:71-84` |
| Baseline | Absent | Not in `001_courtzon_v3.sql` |

---

## 5. CHILD TABLES

None identified.

---

## 6. APPLICATION CODE REFERENCES

| Layer | Pattern | Result |
|---|---|---|
| `backend/src/**/*.ts` | `tournament_match_players` | 0 matches |
| `backend/src/**/*.ts` | `TournamentMatchPlayer` | 0 matches |
| `frontend/src/**/*.ts` / `*.tsx` | `tournament_match_player` | 0 matches |
| `database/seeds/` | any | 0 matches |

---

## 7. FINDINGS

None identified.

---

## 8. OBSERVATIONS

- **Only code artifact is the migration DDL** — no repository, service, controller, route, or frontend page references this table.
- **Already documented in dormant-table investigation** as scaffold (Keep, 95% confidence): `docs/database/dormant-table-investigation.md:128`, `docs/database/dormant-investigation-part2.md:215`.
- **2 FK references** are the sole integration points — the table exists and is structurally sound but unused by application code.
- **Existing during seeding is a non-issue** due to 0 rows and no seed data referencing it.
- This appears to be a planned side of the team-match feature that extends `tournament_matches` with multi-player support, matching the `side` ENUM (`home`/`away`).

---

## 9. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 10. RECOMMENDATIONS

None identified — the table is consistent with its documented scaffold intent.

---

## 11. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (5 cols, 2 FK) |
| Migration verified | ✅ (M062 only) |
| Application code verified | ✅ (0 refs — intentional scaffold) |
| FK integrity verified | ✅ (match CASCADE, user CASCADE) |
| Child tables verified | ✅ (0 children) |
| Documentation alignment | ✅ (consistent with dormant-table investigation) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `tournament_match_players` ✅

**Next table alphabetically: `tournament_match_results` — proceed?**
