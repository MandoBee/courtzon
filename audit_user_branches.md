# ENTERPRISE TABLE AUDIT: `user_branches`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Junction — user-to-branch membership |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   user_branches  —  EXECUTIVE SNAPSHOT                               │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           3 — Junction table                                    │
│  HEALTH:         10/10 — Schema sound, code column names correct     │
│  QUALITY:        10/10 — Clean, simple, fit for purpose              │
│  PK:             id (int unsigned)                                    │
│  FK:             2 — users CASCADE, branches CASCADE                  │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 1 (AUTO_INCREMENT=3)                                │
│  BACKEND REFS:   3 SQL queries across 3 files                         │
│  FRONTEND REFS:  0                                                    │
│  FINDINGS:       None                                                 │
│  RECOMMENDATION: No action required                                   │
│  CONFIDENCE:     95%                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — user-to-branch membership for notification dispatch, socket room resolution, player matching |
| Evidence | 3 SELECT-only queries in dispatcher, player-matching, and socket-room-manager services |

---

## 3. PRODUCTION SCHEMA (4 columns)

```
id          int unsigned AUTO_INCREMENT PK (AUTO_INCREMENT=3)
user_id     int unsigned NOT NULL       → users(id) ON DELETE CASCADE
branch_id   int unsigned NOT NULL       → branches(id) ON DELETE CASCADE
created_at  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP

Indexes: uk_user_branch (UNIQUE), idx_branch
```

Created by M060 — not in baseline (SF-002 consistent).

---

## 4. CHILD TABLES

None identified.

---

## 5. APPLICATION CODE REFERENCES

| File | Line | SQL | Correct? |
|---|---|---|---|
| `player-matching.service.ts` | 81 | `EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = u.id AND ub.branch_id = ?)` | ✅ |
| `dispatcher.service.ts` | 243 | `JOIN user_branches ub ON u.id = ub.user_id WHERE ub.branch_id = ?` | ✅ |
| `socket-room-manager.ts` | 21 | `SELECT ub.branch_id FROM user_branches ub WHERE ub.user_id = ?` | ✅ |

All 3 queries reference only columns that exist in production. No INSERT/UPDATE/DELETE in application code (only the migration seed and cleanup script).

---

## 6. FINDINGS

None identified.

---

## 7. OBSERVATIONS

- **Simple junction table** with UNIQUE constraint on (user_id, branch_id) preventing duplicate memberships.
- **Not in baseline** — created by M060 to address a gap where the table was referenced by code but never created.
- **All 3 queries are SELECT-only** — membership is populated by the migration (`INSERT IGNORE ... SELECT DISTINCT FROM bookings`) and a cleanup script. No application code creates/updates/deletes rows at runtime.
- **`getUserBranchAccess` method in `rbac.repository.ts`** queries `branch_player_access`, NOT `user_branches` — misleading method name but not a table-level issue.
- **`assertUserBranchAccess` function** in `org-portal.repository.ts` enforces branch access via org ownership/roles/scopes — it does not query `user_branches` at all. Runtime access control is decoupled from this membership table.
- **1 row, AUTO_INCREMENT=3** — the review did not establish the reason for that difference.

---

## 8. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 9. RECOMMENDATIONS

| # | Action | Priority |
|---|---|---|
| 1 | (None required) | — |

---

## 10. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (4 cols, 2 FK, 2 indexes) |
| Migration verified | ✅ (M060) |
| Application code verified | ✅ (all SQL column names correct) |
| FK integrity verified | ✅ (users CASCADE, branches CASCADE) |
| Child tables verified | ✅ (0 children) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `user_branches` ✅

**Next table alphabetically: `user_channel_preferences` — proceed?**
