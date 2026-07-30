# ENTERPRISE TABLE AUDIT: `waiting_list`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Match waiting list queue |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   waiting_list  —  EXECUTIVE SNAPSHOT                                │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — Match queue entity                               │
│  HEALTH:         10/10 — Schema sound, all code column names correct │
│  QUALITY:        10/10 — Clean domain-driven design                  │
│  PK:             id (bigint unsigned)                                  │
│  FK:             2 — matches CASCADE, users                           │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 0                                                    │
│  BACKEND REFS:   15+ across 6 files (domain, service, repo, events)  │
│  FRONTEND REFS:  0 (match-related)                                    │
│  FINDINGS:       None                                                  │
│  RECOMMENDATION: No action required                                   │
│  CONFIDENCE:     95%                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — ordered waiting list for match capacity management |
| Evidence | Domain entity; match aggregate integration; waiting-list service (add, remove, promoteNext, reindex); join-request auto-waitlist; match cancel cleanup; 3 domain events; notification templates (en/ar) |

---

## 3. PRODUCTION SCHEMA (5 columns)

```
id          bigint unsigned AUTO_INCREMENT PK
match_id    bigint unsigned NOT NULL     → matches(id) ON DELETE CASCADE
user_id     int unsigned NOT NULL        → users(id)
position    int NOT NULL
created_at  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP

Indexes: uk_wl_entry (UNIQUE), uk_wl_position (UNIQUE), idx_match_position, fk_wl_user
```

Created by M023 — not in baseline.

---

## 4. APPLICATION CODE REFERENCES

| Layer | File | SQL / Code | Correct? |
|---|---|---|---|
| Service | `waiting-list.service.ts:14` | `SELECT id FROM waiting_list WHERE match_id = ? AND user_id = ?` | ✅ |
| Service | `waiting-list.service.ts:19-21` | `INSERT INTO waiting_list (match_id, user_id, position) VALUES (?, ?, (SELECT COALESCE(MAX(position),0)+1 FROM waiting_list w2 WHERE w2.match_id = ?))` | ✅ |
| Service | `waiting-list.service.ts:33` | `DELETE FROM waiting_list WHERE match_id = ? AND user_id = ?` | ✅ |
| Service | `waiting-list.service.ts:48` | `SELECT user_id FROM waiting_list WHERE match_id = ? ORDER BY position ASC LIMIT 1` | ✅ |
| Service | `waiting-list.service.ts:56` | `DELETE FROM waiting_list WHERE match_id = ? AND user_id = ?` | ✅ |
| Service | `waiting-list.service.ts:73` | `SELECT id FROM waiting_list WHERE match_id = ? ORDER BY position ASC` | ✅ |
| Service | `waiting-list.service.ts:77` | `UPDATE waiting_list SET position = ? WHERE id = ?` | ✅ |
| Join service | `join-request.service.ts:69-71` | `INSERT IGNORE INTO waiting_list ...` (auto-waitlist) | ✅ |
| Match service | `match.service.ts:149` | `DELETE FROM waiting_list WHERE match_id = ?` (cancel) | ✅ |
| Repository | `match.repository.ts:88-97` | `SELECT id, match_id, user_id, position, created_at FROM waiting_list WHERE match_id = ? ORDER BY position ASC` | ✅ |

All SQL statements reference only columns that exist in production. ✅

---

## 5. FINDINGS

None identified.

---

## 6. OBSERVATIONS

- **Domain-driven design:** Separate domain entity (`WaitingListEntry`), service, and events — the match aggregate owns the waitlist as a collection.
- **Auto-positioning:** INSERT uses `COALESCE(MAX(position),0)+1` subquery — appends to end of queue.
- **Promotion flow:** The reviewed service implementation contains logic that selects the first waiting entry, removes it from the waiting list, and dispatches related events.
- **Reindex support:** Updates positions sequentially (used after removal).
- **3 domain events** with notification templates (en + ar) for `waiting_list:promoted` only.
- **`waiting_list_count` in academy module** queries `academy_enrollments WHERE status = 'waiting'` — same name, different table.

---

## 7. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 8. RECOMMENDATIONS

| # | Action | Priority |
|---|---|---|
| 1 | (None required) | — |

---

## 9. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (5 cols, 2 FK, 4 indexes) |
| Migration verified | ✅ (M023) |
| Application code verified | ✅ (all SQL column names correct) |
| FK integrity verified | ✅ (matches CASCADE, users) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `waiting_list` ✅

**Next table alphabetically: `wallet_transactions` — proceed?**
